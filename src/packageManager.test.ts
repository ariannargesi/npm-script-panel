import { describe, expect, it } from 'vitest';
import { buildRunCommand, detectPackageManager } from './packageManager';

describe('detectPackageManager', () => {
  it('honours an explicit setting over everything else', () => {
    expect(
      detectPackageManager({
        setting: 'yarn',
        packageManagerField: 'pnpm@9.0.0',
        existingFiles: ['pnpm-lock.yaml'],
      }),
    ).toBe('yarn');
  });

  it('prefers the packageManager field over lockfiles', () => {
    expect(
      detectPackageManager({
        setting: 'auto',
        packageManagerField: 'pnpm@9.11.0',
        existingFiles: ['package-lock.json'],
      }),
    ).toBe('pnpm');
  });

  it.each([
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['bun.lock', 'bun'],
    ['package-lock.json', 'npm'],
  ] as const)('detects %s as %s', (file, expected) => {
    expect(detectPackageManager({ setting: 'auto', existingFiles: [file] })).toBe(expected);
  });

  it('ignores an unknown packageManager field and falls back to npm', () => {
    expect(
      detectPackageManager({ setting: 'auto', packageManagerField: 'deno@1', existingFiles: [] }),
    ).toBe('npm');
  });
});

describe('buildRunCommand', () => {
  it('leaves ordinary script names bare', () => {
    expect(buildRunCommand('pnpm', 'dev:merchant')).toBe('pnpm run dev:merchant');
  });

  it('quotes names with shell-significant characters', () => {
    expect(buildRunCommand('npm', 'my script; rm -rf /')).toBe('npm run "my script; rm -rf /"');
    expect(buildRunCommand('npm', 'a$b')).toBe('npm run "a\\$b"');
  });
});
