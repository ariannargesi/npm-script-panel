import { afterEach, describe, expect, it } from 'vitest';
import { ScriptRunner } from './runner';
import type { ScriptStatus } from './status';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(condition: () => boolean, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    await sleep(25);
  }
  throw new Error('timed out waiting for condition');
}

const SCRIPTS: Record<string, string> = {
  hello: `node -e "console.log('hello world')"`,
  fail: `node -e "console.log('about to fail'); process.exit(3)"`,
  ticker: `node -e "setInterval(() => console.log('tick'), 100)"`,
  stubborn: `node -e "process.on('SIGINT', () => console.log('ignoring')); setInterval(() => {}, 100)"`,
};

describe.skipIf(process.platform === 'win32')('ScriptRunner (real processes)', () => {
  let runner: ScriptRunner;
  let restartTimeoutMs = 5000;

  const create = (): ScriptRunner => {
    runner = new ScriptRunner({
      resolveTarget: (script) => {
        const command = SCRIPTS[script];
        return command ? { cwd: process.cwd(), command } : undefined;
      },
      restartTimeoutMs: () => restartTimeoutMs,
    });
    return runner;
  };
  const status = (script: string): ScriptStatus => runner.status(script).status;

  afterEach(async () => {
    restartTimeoutMs = 5000;
    await runner?.shutdown();
  });

  it('runs a script to completion and captures its output', async () => {
    create();
    const states: ScriptStatus[] = [];
    runner.onState((event) => states.push(event.status));

    runner.start('hello');
    expect(status('hello')).toBe('running');
    await waitFor(() => status('hello') === 'stopped');

    expect(states).toEqual(['running', 'stopped']);
    expect(runner.buffers().hello).toContain('hello world');
    expect(runner.buffers().hello).toContain('[exited with code 0]');
  });

  it('reports a non-zero exit as failed, with the code', async () => {
    create();
    runner.start('fail');
    await waitFor(() => status('fail') === 'failed');
    expect(runner.status('fail').exitCode).toBe(3);
  });

  it('Stop ends a well-behaved script without showing it as a failure', async () => {
    create();
    runner.start('ticker');
    await waitFor(() => (runner.buffers().ticker ?? '').includes('tick'));

    runner.stop('ticker');
    expect(status('ticker')).toBe('stopping');
    await waitFor(() => status('ticker') === 'stopped');
    expect(runner.status('ticker').exitCode).toBeUndefined();
  });

  it('Stop alone never ends a script that ignores Ctrl+C; Kill does', async () => {
    create();
    runner.start('stubborn');
    await waitFor(() => status('stubborn') === 'running');
    await sleep(400);

    runner.stop('stubborn');
    await sleep(800);
    expect(status('stubborn')).toBe('stopping');
    expect(runner.buffers().stubborn).toContain('ignoring');

    await runner.kill('stubborn');
    await waitFor(() => status('stubborn') === 'stopped');
  });

  it('Restart escalates to Kill after the timeout and starts a fresh run', async () => {
    create();
    restartTimeoutMs = 600;
    runner.start('stubborn');
    await waitFor(() => status('stubborn') === 'running');
    await sleep(400);

    await runner.restart('stubborn');

    expect(status('stubborn')).toBe('running');
    const runs = (runner.buffers().stubborn ?? '').split('$ node').length - 1;
    expect(runs).toBe(2);
  });

  it('Start on a running script does nothing', async () => {
    create();
    runner.start('ticker');
    runner.start('ticker');
    await sleep(300);
    expect((runner.buffers().ticker ?? '').split('$ node').length - 1).toBe(1);
  });

  it('ignores scripts it cannot resolve', () => {
    create();
    runner.start('does-not-exist');
    expect(status('does-not-exist')).toBe('stopped');
  });

  it('announces each real spawn, but not a no-op start or an unknown script', async () => {
    create();
    const started: string[] = [];
    runner.onStart((script) => started.push(script));

    runner.start('does-not-exist');
    runner.start('ticker');
    runner.start('ticker'); // already running
    await sleep(100);
    expect(started).toEqual(['ticker']);

    runner.start('hello');
    await waitFor(() => status('hello') === 'stopped');
    runner.start('hello'); // a fresh run of a finished script counts again
    await waitFor(() => status('hello') === 'stopped');
    expect(started).toEqual(['ticker', 'hello', 'hello']);
  });
});
