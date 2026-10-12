export type ScriptStatus = 'stopped' | 'running' | 'stopping' | 'failed';

/** Statuses in which a process may still be alive. */
export function isLive(status: ScriptStatus): boolean {
  return status === 'running' || status === 'stopping';
}

export interface ExitOutcome {
  status: 'stopped' | 'failed';
  exitCode?: number;
}

const SIGINT_EXIT = 130;

/** Exit 0, Ctrl+C (130), an unknown exit, or any exit we asked for counts as a clean stop. */
export function classifyExit(exitCode: number | undefined, requested: boolean): ExitOutcome {
  if (requested || exitCode === undefined || exitCode === 0 || exitCode === SIGINT_EXIT) {
    return { status: 'stopped' };
  }
  return { status: 'failed', exitCode };
}
