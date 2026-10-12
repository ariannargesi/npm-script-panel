import * as vscode from 'vscode';
import {
  buildRunCommand,
  detectPackageManager,
  LOCKFILE_NAMES,
  type PackageManager,
  type PackageManagerSetting,
} from './packageManager';
import { parsePackageJson, type ScriptEntry } from './scripts';

export interface ProjectSnapshot {
  cwd: string;
  scripts: ScriptEntry[];
  packageManager: PackageManager;
  error?: string;
}

/** Tracks the root package.json of the first workspace folder. */
export class Project implements vscode.Disposable {
  private current: ProjectSnapshot | undefined;
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private readonly disposables: vscode.Disposable[] = [this.changeEmitter];

  /** Same shape as the runner's listeners: returns an unsubscribe function. */
  onDidChange(listener: () => void): () => void {
    const subscription = this.changeEmitter.event(listener);
    return () => subscription.dispose();
  }

  constructor() {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, `{package.json,${LOCKFILE_NAMES.join(',')}}`),
      );
      const reload = (): void => void this.reload();
      this.disposables.push(
        watcher,
        watcher.onDidChange(reload),
        watcher.onDidCreate(reload),
        watcher.onDidDelete(reload),
      );
    }
  }

  get snapshot(): ProjectSnapshot | undefined {
    return this.current;
  }

  runCommand(script: string): string | undefined {
    return this.current && buildRunCommand(this.current.packageManager, script);
  }

  async reload(): Promise<void> {
    this.current = await this.read();
    this.changeEmitter.fire();
  }

  private async read(): Promise<ProjectSnapshot | undefined> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return undefined;

    const config = vscode.workspace.getConfiguration('scriptRunner');
    const packageJsonUri = vscode.Uri.joinPath(folder.uri, 'package.json');

    let text: string;
    try {
      text = Buffer.from(await vscode.workspace.fs.readFile(packageJsonUri)).toString('utf8');
    } catch {
      return undefined;
    }

    const parsed = parsePackageJson(text, {
      showPrePost: config.get<boolean>('showPrePostScripts', false),
    });

    const existingFiles: string[] = [];
    await Promise.all(
      LOCKFILE_NAMES.map(async (name) => {
        try {
          await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, name));
          existingFiles.push(name);
        } catch {
          // not present
        }
      }),
    );

    return {
      cwd: folder.uri.fsPath,
      scripts: parsed.scripts,
      error: parsed.error,
      packageManager: detectPackageManager({
        setting: config.get<PackageManagerSetting>('packageManager', 'auto'),
        packageManagerField: parsed.packageManagerField,
        existingFiles,
      }),
    };
  }

  dispose(): void {
    vscode.Disposable.from(...this.disposables).dispose();
  }
}
