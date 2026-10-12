export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';
export type PackageManagerSetting = 'auto' | PackageManager;

const LOCKFILES: ReadonlyArray<readonly [string, PackageManager]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
  ['package-lock.json', 'npm'],
];

export const LOCKFILE_NAMES = LOCKFILES.map(([name]) => name);

const KNOWN: ReadonlySet<string> = new Set(['npm', 'pnpm', 'yarn', 'bun']);

export interface DetectInput {
  setting: PackageManagerSetting;
  /** The raw `packageManager` field, e.g. "pnpm@9.1.0". */
  packageManagerField?: string;
  /** Names of lockfiles that exist in the project root. */
  existingFiles: readonly string[];
}

export function detectPackageManager(input: DetectInput): PackageManager {
  if (input.setting !== 'auto') return input.setting;

  const fromField = input.packageManagerField?.split('@')[0];
  if (fromField && KNOWN.has(fromField)) return fromField as PackageManager;

  for (const [file, manager] of LOCKFILES) {
    if (input.existingFiles.includes(file)) return manager;
  }
  return 'npm';
}

const SAFE_ARG = /^[\w:.\-@/]+$/;

function quoteArg(arg: string): string {
  return SAFE_ARG.test(arg) ? arg : `"${arg.replace(/(["\\$`])/g, '\\$1')}"`;
}

export function buildRunCommand(manager: PackageManager, script: string): string {
  return `${manager} run ${quoteArg(script)}`;
}
