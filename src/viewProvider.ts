import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import {
  SCRIPT_ACTIONS,
  type HostMessage,
  type ScriptAction,
  type ScriptView,
  type WebviewMessage,
} from './protocol';
import type { Project } from './project';
import { recordRecent, visibleRecent } from './recent';
import type { ScriptRunner } from './runner';

/** Output is batched so a chatty script does not flood the webview with messages. */
const OUTPUT_FLUSH_MS = 30;

const RECENT_KEY = 'scriptRunner.recent';

export class ScriptsViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'scriptRunner.scripts';

  private view: vscode.WebviewView | undefined;
  private readonly pendingOutput = new Map<string, string>();
  private flushTimer: NodeJS.Timeout | undefined;
  private readonly subscriptions: Array<() => void> = [];
  private recent: string[];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly project: Project,
    private readonly runner: ScriptRunner,
    private readonly storage: vscode.Memento,
  ) {
    this.recent = storage.get<string[]>(RECENT_KEY, []);
    this.subscriptions.push(
      project.onDidChange(() => this.postScripts()),
      runner.onState((event) => this.post({ type: 'state', ...event })),
      runner.onOutput(({ script, data }) => this.queueOutput(script, data)),
      runner.onStart((script) => this.recordRun(script)),
    );
  }

  private recordRun(script: string): void {
    this.recent = recordRecent(this.recent, script);
    void this.storage.update(RECENT_KEY, this.recent);
    this.postRecent();
  }

  private postRecent(): void {
    const existing = new Set((this.project.snapshot?.scripts ?? []).map((script) => script.name));
    this.post({ type: 'recent', recent: visibleRecent(this.recent, existing) });
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const distUri = vscode.Uri.joinPath(this.extensionUri, 'dist');
    view.webview.options = { enableScripts: true, localResourceRoots: [distUri] };
    view.webview.html = this.html(view.webview, distUri);

    view.webview.onDidReceiveMessage((message: WebviewMessage) => this.onMessage(message));
    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined;
    });
  }

  private onMessage(message: WebviewMessage): void {
    if (message.type === 'ready') {
      this.postScripts();
      this.post({ type: 'buffers', buffers: this.runner.buffers() });
      return;
    }
    if (message.type === 'action') this.runAction(message.action, message.script);
  }

  private runAction(action: ScriptAction, script: string): void {
    if (!SCRIPT_ACTIONS.includes(action) || typeof script !== 'string') return;
    switch (action) {
      case 'start':
        return this.runner.start(script);
      case 'stop':
        return this.runner.stop(script);
      case 'restart':
        return void this.runner.restart(script);
      case 'kill':
        return void this.runner.kill(script);
      case 'clear':
        return this.runner.clear(script);
    }
  }

  private postScripts(): void {
    const snapshot = this.project.snapshot;
    const scripts: ScriptView[] = (snapshot?.scripts ?? []).map((script) => ({
      name: script.name,
      command: script.command,
      ...this.runner.status(script.name),
    }));

    let message: string | undefined;
    if (!snapshot) message = 'Open a folder that has a package.json to see its scripts.';
    else if (snapshot.error) message = `package.json could not be read: ${snapshot.error}`;
    else if (scripts.length === 0) message = 'No package.json scripts found in the workspace root.';

    this.post({ type: 'scripts', scripts, packageManager: snapshot?.packageManager, message });
    this.postRecent();
  }

  private queueOutput(script: string, data: string): void {
    this.pendingOutput.set(script, (this.pendingOutput.get(script) ?? '') + data);
    this.flushTimer ??= setTimeout(() => this.flushOutput(), OUTPUT_FLUSH_MS);
  }

  private flushOutput(): void {
    this.flushTimer = undefined;
    for (const [script, data] of this.pendingOutput) this.post({ type: 'output', script, data });
    this.pendingOutput.clear();
  }

  private post(message: HostMessage): void {
    void this.view?.webview.postMessage(message);
  }

  private html(webview: vscode.Webview, distUri: vscode.Uri): string {
    const nonce = randomBytes(16).toString('base64');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'webview.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'webview.css'));
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`,
    ].join('; ');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${style}">
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }

  dispose(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    for (const unsubscribe of this.subscriptions) unsubscribe();
  }
}
