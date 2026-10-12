import { spawn, type ChildProcess } from 'node:child_process';
import { constants } from 'node:os';
import { killProcessTree, stopProcess } from './processControl';
import { classifyExit, isLive, type ScriptStatus } from './status';

/** Output kept per script so the panel can be re-rendered. Older output is dropped first. */
const MAX_BUFFER_CHARS = 500_000;

const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

export interface RunTarget {
  cwd: string;
  command: string;
}

export interface RunnerOptions {
  resolveTarget: (script: string) => RunTarget | undefined;
  restartTimeoutMs: () => number;
}

export interface StateEvent {
  script: string;
  status: ScriptStatus;
  exitCode?: number;
}

export interface OutputEvent {
  script: string;
  data: string;
}

interface Entry {
  status: ScriptStatus;
  exitCode?: number;
  child?: ChildProcess;
  /** True once Stop/Kill was requested, so a non-zero exit afterwards is not shown as a failure. */
  stopRequested: boolean;
  buffer: string;
  idleWaiters: Set<() => void>;
}

/** Runs package.json scripts as child processes and tracks their state. Knows nothing about VS Code. */
export class ScriptRunner {
  private readonly entries = new Map<string, Entry>();
  private readonly stateListeners = new Set<(event: StateEvent) => void>();
  private readonly outputListeners = new Set<(event: OutputEvent) => void>();
  private readonly startListeners = new Set<(script: string) => void>();

  constructor(private readonly options: RunnerOptions) {}

  /** Fires each time a script process is actually spawned (including by Restart). */
  onStart(listener: (script: string) => void): () => void {
    this.startListeners.add(listener);
    return () => this.startListeners.delete(listener);
  }

  onState(listener: (event: StateEvent) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onOutput(listener: (event: OutputEvent) => void): () => void {
    this.outputListeners.add(listener);
    return () => this.outputListeners.delete(listener);
  }

  status(script: string): { status: ScriptStatus; exitCode?: number } {
    const entry = this.entries.get(script);
    return entry ? { status: entry.status, exitCode: entry.exitCode } : { status: 'stopped' };
  }

  buffers(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [script, entry] of this.entries) {
      if (entry.buffer) result[script] = entry.buffer;
    }
    return result;
  }

  start(script: string): void {
    const target = this.options.resolveTarget(script);
    if (!target) return;

    const entry = this.entry(script);
    if (isLive(entry.status)) return;

    entry.stopRequested = false;
    entry.exitCode = undefined;
    this.write(script, `${DIM}$ ${target.command}${RESET}\r\n`);

    const child = spawn(target.command, {
      cwd: target.cwd,
      shell: true,
      // Own process group on POSIX, so Stop and Kill reach the whole tree.
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      // Pipes are not a TTY, so most tools turn colour off unless told otherwise.
      env: { ...process.env, FORCE_COLOR: '1' },
    });
    entry.child = child;
    for (const listener of this.startListeners) listener(script);
    this.setStatus(script, entry, 'running');

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    const onData = (chunk: string): void => this.write(script, chunk);
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);

    child.once('error', (error) => {
      this.write(script, `${RED}${error.message}${RESET}\r\n`);
      this.finish(script, entry, child, 1, null);
    });
    // `close`, not `exit`: wait until every holder of the output pipes is gone.
    child.once('close', (code, signal) => this.finish(script, entry, child, code, signal));
  }

  /** Ctrl+C, once. Never escalates: a stuck script stays "stopping" until the user kills it. */
  stop(script: string): void {
    const entry = this.entries.get(script);
    if (entry?.child?.pid === undefined || entry.status !== 'running') return;
    entry.stopRequested = true;
    this.setStatus(script, entry, 'stopping');
    void stopProcess(entry.child.pid);
  }

  async kill(script: string): Promise<void> {
    const entry = this.entries.get(script);
    const pid = entry?.child?.pid;
    if (!entry || pid === undefined) return;
    entry.stopRequested = true;
    if (entry.status === 'running') this.setStatus(script, entry, 'stopping');
    await killProcessTree(pid);
  }

  /** Stop, wait, escalate to kill if the script ignores Ctrl+C, then start again. */
  async restart(script: string): Promise<void> {
    const entry = this.entries.get(script);
    if (entry && isLive(entry.status)) {
      this.stop(script);
      if (!(await this.waitForIdle(entry, this.options.restartTimeoutMs()))) {
        await this.kill(script);
        await this.waitForIdle(entry, 3000);
      }
    }
    this.start(script);
  }

  stopAll(): void {
    for (const script of this.entries.keys()) this.stop(script);
  }

  clear(script: string): void {
    const entry = this.entries.get(script);
    if (entry) entry.buffer = '';
  }

  /** Stops everything, then kills what is left. Run on deactivate so no orphans keep ports busy. */
  async shutdown(): Promise<void> {
    const live = [...this.entries.entries()].filter(([, entry]) => isLive(entry.status));
    this.stopAll();
    await Promise.all(live.map(([, entry]) => this.waitForIdle(entry, 2000)));
    await Promise.all(
      live.filter(([, entry]) => isLive(entry.status)).map(([script]) => this.kill(script)),
    );
  }

  private entry(script: string): Entry {
    let entry = this.entries.get(script);
    if (!entry) {
      entry = { status: 'stopped', stopRequested: false, buffer: '', idleWaiters: new Set() };
      this.entries.set(script, entry);
    }
    return entry;
  }

  private finish(
    script: string,
    entry: Entry,
    child: ChildProcess,
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void {
    if (entry.child !== child) return;
    entry.child = undefined;

    const exitCode =
      code ?? (signal ? 128 + (constants.signals[signal] ?? 0) : undefined);
    const outcome = classifyExit(exitCode, entry.stopRequested);
    entry.exitCode = outcome.exitCode;

    const how = signal ? `terminated by ${signal}` : `exited with code ${code}`;
    this.write(script, `\r\n${DIM}[${how}]${RESET}\r\n`);
    this.setStatus(script, entry, outcome.status);
  }

  private write(script: string, data: string): void {
    const entry = this.entry(script);
    entry.buffer += data;
    if (entry.buffer.length > MAX_BUFFER_CHARS) {
      const cut = entry.buffer.indexOf('\n', entry.buffer.length - MAX_BUFFER_CHARS);
      entry.buffer = entry.buffer.slice(cut === -1 ? entry.buffer.length - MAX_BUFFER_CHARS : cut + 1);
    }
    for (const listener of this.outputListeners) listener({ script, data });
  }

  private setStatus(script: string, entry: Entry, status: ScriptStatus): void {
    entry.status = status;
    if (!isLive(status)) {
      for (const resolve of entry.idleWaiters) resolve();
      entry.idleWaiters.clear();
    }
    for (const listener of this.stateListeners) {
      listener({ script, status, exitCode: entry.exitCode });
    }
  }

  private waitForIdle(entry: Entry, timeoutMs: number): Promise<boolean> {
    if (!isLive(entry.status)) return Promise.resolve(true);
    return new Promise((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        entry.idleWaiters.delete(done);
        resolve(!isLive(entry.status));
      };
      const timer = setTimeout(done, timeoutMs);
      entry.idleWaiters.add(done);
    });
  }
}
