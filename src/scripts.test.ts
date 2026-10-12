import { describe, expect, it } from 'vitest';
import { parsePackageJson } from './scripts';

const names = (text: string, showPrePost = false): string[] =>
  parsePackageJson(text, { showPrePost }).scripts.map((script) => script.name);

describe('parsePackageJson', () => {
  it('keeps package.json order', () => {
    expect(names('{"scripts":{"b":"x","a":"y"}}')).toEqual(['b', 'a']);
  });

  it('hides pre/post hooks only when the base script exists', () => {
    const text = JSON.stringify({
      scripts: { prebuild: 'x', build: 'x', postbuild: 'x', prepare: 'x', postinstall: 'x' },
    });
    expect(names(text)).toEqual(['build', 'prepare', 'postinstall']);
  });

  it('shows pre/post hooks when asked', () => {
    const text = JSON.stringify({ scripts: { prebuild: 'x', build: 'x' } });
    expect(names(text, true)).toEqual(['prebuild', 'build']);
  });

  it('drops non-string script values', () => {
    expect(names('{"scripts":{"a":"x","b":1,"c":null}}')).toEqual(['a']);
  });

  it('returns an empty list when scripts is missing', () => {
    expect(parsePackageJson('{}', { showPrePost: false }).scripts).toEqual([]);
  });

  it('reports invalid JSON instead of throwing', () => {
    const result = parsePackageJson('{ nope', { showPrePost: false });
    expect(result.scripts).toEqual([]);
    expect(result.error).toBeTruthy();
  });

  it('exposes the packageManager field', () => {
    expect(
      parsePackageJson('{"packageManager":"pnpm@9.11.0"}', { showPrePost: false })
        .packageManagerField,
    ).toBe('pnpm@9.11.0');
  });
});
