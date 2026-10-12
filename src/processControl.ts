import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { collectDescendants, parseProcessTable, type ProcessRow } from './processTree';

const exec = promisify(execFile);
const isWindows = process.platform === 'win32';

export async function listProcesses(): Promise<ProcessRow[]> {
  try {
    const { stdout } = isWindows
      ? await exec('powershell.exe', [
          '-NoProfile',
          '-Command',
          'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId)" }',
        ])
      : await exec('ps', ['-A', '-o', 'pid=,ppid=']);
    return parseProcessTable(stdout);
  } catch {
    return [];
  }
}

function signal(pid: number, sig: NodeJS.Signals): void {
  try {
    process.kill(pid, sig);
  } catch {
    // already gone, or not ours
  }
}

/**
 * Sends Ctrl+C semantics to a spawned script. On macOS/Linux the script was started as the leader
 * of its own process group, so the signal reaches the package manager and everything under it.
 * Windows has no equivalent, so it falls back to killing the tree.
 */
export async function stopProcess(pid: number): Promise<void> {
  if (isWindows) {
    await killProcessTree(pid);
    return;
  }
  signal(-pid, 'SIGINT');
}

/** Kills `pid` and every process under it, including ones that left the process group. */
export async function killProcessTree(pid: number): Promise<void> {
  if (isWindows) {
    await exec('taskkill', ['/PID', String(pid), '/T', '/F']).catch(() => undefined);
    return;
  }

  // Snapshot the tree first: once the parent dies its children are re-parented and unfindable.
  const descendants = collectDescendants(await listProcesses(), pid);
  signal(-pid, 'SIGKILL');
  for (const target of descendants) signal(target, 'SIGKILL');
  signal(pid, 'SIGKILL');
}
