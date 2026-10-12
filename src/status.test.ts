import { describe, expect, it } from 'vitest';
import { classifyExit, isLive } from './status';

describe('classifyExit', () => {
  it.each([0, 130, undefined])('treats exit %s as a clean stop', (code) => {
    expect(classifyExit(code, false)).toEqual({ status: 'stopped' });
  });

  it('reports other exit codes as failures', () => {
    expect(classifyExit(3, false)).toEqual({ status: 'failed', exitCode: 3 });
  });

  it('never reports a failure for an exit we asked for', () => {
    expect(classifyExit(137, true)).toEqual({ status: 'stopped' });
  });
});

describe('isLive', () => {
  it('marks only possibly-running statuses as live', () => {
    expect(isLive('running')).toBe(true);
    expect(isLive('stopping')).toBe(true);
    expect(isLive('stopped')).toBe(false);
    expect(isLive('failed')).toBe(false);
  });
});
