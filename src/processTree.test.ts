import { describe, expect, it } from 'vitest';
import { collectDescendants, directChildren, parseProcessTable } from './processTree';

const rows = [
  { pid: 1, ppid: 0 },
  { pid: 100, ppid: 1 }, // shell
  { pid: 200, ppid: 100 }, // pnpm
  { pid: 300, ppid: 200 }, // nx
  { pid: 400, ppid: 300 }, // next
  { pid: 500, ppid: 300 }, // next worker
  { pid: 900, ppid: 1 }, // unrelated
];

describe('parseProcessTable', () => {
  it('parses ps output and skips noise', () => {
    expect(parseProcessTable('  1     0\n  100   1\nPID PPID\n\n 7 x\n')).toEqual([
      { pid: 1, ppid: 0 },
      { pid: 100, ppid: 1 },
    ]);
  });

  it('handles CRLF output from PowerShell', () => {
    expect(parseProcessTable('4 0\r\n8 4\r\n')).toEqual([
      { pid: 4, ppid: 0 },
      { pid: 8, ppid: 4 },
    ]);
  });
});

describe('collectDescendants', () => {
  it('returns every descendant, leaves first, never the root', () => {
    const result = collectDescendants(rows, 100);
    expect(new Set(result)).toEqual(new Set([200, 300, 400, 500]));
    expect(result.indexOf(400)).toBeLessThan(result.indexOf(300));
    expect(result.indexOf(300)).toBeLessThan(result.indexOf(200));
    expect(result).not.toContain(100);
    expect(result).not.toContain(900);
  });

  it('returns nothing for an idle shell', () => {
    expect(collectDescendants(rows, 900)).toEqual([]);
  });

  it('survives a cycle in a malformed table', () => {
    expect(
      collectDescendants(
        [
          { pid: 2, ppid: 1 },
          { pid: 1, ppid: 2 },
        ],
        1,
      ),
    ).toEqual([2]);
  });
});

describe('directChildren', () => {
  it('returns only immediate children', () => {
    expect(directChildren(rows, 300)).toEqual([400, 500]);
  });
});
