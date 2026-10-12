import * as vscode from 'vscode';
import { Project } from './project';
import { ScriptRunner } from './runner';
import { ScriptsViewProvider } from './viewProvider';

let runner: ScriptRunner | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const project = new Project();
  await project.reload();

  runner = new ScriptRunner({
    resolveTarget: (script) => {
      const snapshot = project.snapshot;
      const command = project.runCommand(script);
      return snapshot && command ? { cwd: snapshot.cwd, command } : undefined;
    },
    restartTimeoutMs: () =>
      vscode.workspace.getConfiguration('scriptRunner').get<number>('restartTimeoutMs', 5000),
  });
  const provider = new ScriptsViewProvider(
    context.extensionUri,
    project,
    runner,
    context.workspaceState,
  );
  const active = runner;

  context.subscriptions.push(
    project,
    provider,
    vscode.window.registerWebviewViewProvider(ScriptsViewProvider.viewType, provider, {
      // Keeps the terminals' scrollback when the user switches to another sidebar and back.
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('scriptRunner.stopAll', () => active.stopAll()),
    vscode.commands.registerCommand('scriptRunner.refresh', () => project.reload()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('scriptRunner')) void project.reload();
    }),
  );
}

/** Scripts are children of the extension host, so end them here rather than leave orphans. */
export async function deactivate(): Promise<void> {
  await runner?.shutdown();
}
