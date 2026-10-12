export interface ScriptEntry {
  name: string;
  command: string;
}

export interface ParsedPackageJson {
  scripts: ScriptEntry[];
  packageManagerField?: string;
  error?: string;
}

export function parsePackageJson(
  text: string,
  options: { showPrePost: boolean },
): ParsedPackageJson {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { scripts: [], error: error instanceof Error ? error.message : String(error) };
  }
  if (typeof json !== 'object' || json === null) {
    return { scripts: [], error: 'package.json is not an object' };
  }

  const record = json as Record<string, unknown>;
  const rawScripts = record.scripts;
  const packageManagerField =
    typeof record.packageManager === 'string' ? record.packageManager : undefined;

  if (typeof rawScripts !== 'object' || rawScripts === null) {
    return { scripts: [], packageManagerField };
  }

  const all = Object.entries(rawScripts as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  const names = new Set(all.map(([name]) => name));

  const scripts = all
    .filter(([name]) => options.showPrePost || !isLifecycleHook(name, names))
    .map(([name, command]) => ({ name, command }));

  return { scripts, packageManagerField };
}

/** `prebuild` / `postbuild` are hidden only when `build` exists. */
function isLifecycleHook(name: string, names: ReadonlySet<string>): boolean {
  for (const prefix of ['pre', 'post']) {
    if (name.startsWith(prefix) && names.has(name.slice(prefix.length))) return true;
  }
  return false;
}
