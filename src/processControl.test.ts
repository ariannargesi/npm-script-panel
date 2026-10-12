import { spawn, type ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { killProcessTree, listProcesses } from './processControl';
import { collectDescendants } from './processTree';

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(condition: () => Promise<boolean> | boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await sleep(50);
  }
  throw new Error('timed out waiting for condition');
}

describe.skipIf(process.platform === 'win32')('killProcessTree (real processes)', () => {
  const spawned: ChildProcess[] = [];

  afterEach(() => {
    for (const child of spawned.splice(0)) {
      try {
        child.kill('SIGKILL');
      } catch {
        // already gone
      }
    }
  });

  it('kills the root and every descendant, even ones that ignore SIGINT/SIGTERM', async () => {
    const root = spawn(
      'sh',
      ['-c', `sh -c 'trap "" INT TERM; sleep 60 & sleep 60; wait' & wait`],
      { stdio: 'ignore', detached: true },
    );
    spawned.push(root);
    const rootPid = root.pid!;

    let tree: number[] = [];
    await waitFor(async () => {
      tree = collectDescendants(await listProcesses(), rootPid);
      return tree.length >= 3;
    });

    await killProcessTree(rootPid);

    await waitFor(() => [rootPid, ...tree].every((pid) => !isAlive(pid)));
  });

  it('is harmless for a process that has already exited', async () => {
    const child = spawn('true', [], { stdio: 'ignore', detached: true });
    spawned.push(child);
    await new Promise((resolve) => child.once('close', resolve));
    await expect(killProcessTree(child.pid!)).resolves.toBeUndefined();
  });
});
