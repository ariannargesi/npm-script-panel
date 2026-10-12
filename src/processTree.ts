export interface ProcessRow {
  pid: number;
  ppid: number;
}

/** Parses `pid ppid` pairs, one per line (the output of `ps -A -o pid=,ppid=`). */
export function parseProcessTable(output: string): ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    if (match) rows.push({ pid: Number(match[1]), ppid: Number(match[2]) });
  }
  return rows;
}

export function directChildren(rows: readonly ProcessRow[], pid: number): number[] {
  return rows.filter((row) => row.ppid === pid && row.pid !== pid).map((row) => row.pid);
}

/** All descendants of `rootPid`, leaves first, so killing in order never orphans a process. */
export function collectDescendants(rows: readonly ProcessRow[], rootPid: number): number[] {
  const result: number[] = [];
  const seen = new Set<number>([rootPid]);

  const visit = (pid: number): void => {
    for (const child of directChildren(rows, pid)) {
      if (seen.has(child)) continue;
      seen.add(child);
      visit(child);
      result.push(child);
    }
  };

  visit(rootPid);
  return result;
}
