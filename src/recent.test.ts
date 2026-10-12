import { describe, expect, it } from 'vitest';
import { recordRecent, visibleRecent } from './recent';

describe('recordRecent', () => {
  it('puts the newest script first', () => {
    expect(recordRecent(['a', 'b'], 'c')).toEqual(['c', 'a', 'b']);
  });

  it('moves a repeated script to the front instead of duplicating it', () => {
    expect(recordRecent(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
  });

  it('keeps at most `max` entries, dropping the oldest', () => {
    expect(recordRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
  });

  it('does not mutate its input', () => {
    const list = ['a'];
    recordRecent(list, 'b');
    expect(list).toEqual(['a']);
  });
});

describe('visibleRecent', () => {
  const existing = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g']);

  it('shows at most five', () => {
    expect(visibleRecent(['a', 'b', 'c', 'd', 'e', 'f', 'g'], existing)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  it('skips scripts that no longer exist and still fills up to the limit', () => {
    expect(visibleRecent(['gone', 'a', 'removed', 'b'], new Set(['a', 'b']))).toEqual(['a', 'b']);
    expect(visibleRecent(['x1', 'x2', 'a', 'b', 'c', 'd', 'e', 'f'], existing)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  it('returns nothing when nothing has been run', () => {
    expect(visibleRecent([], existing)).toEqual([]);
  });
});
