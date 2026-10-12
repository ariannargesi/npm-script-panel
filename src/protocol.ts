import type { ScriptStatus } from './status';

/** Messages between the extension host and the sidebar webview. */

export interface ScriptView {
  name: string;
  command: string;
  status: ScriptStatus;
  exitCode?: number;
}

export type HostMessage =
  | { type: 'scripts'; scripts: ScriptView[]; packageManager?: string; message?: string }
  | { type: 'state'; script: string; status: ScriptStatus; exitCode?: number }
  | { type: 'recent'; recent: string[] }
  | { type: 'output'; script: string; data: string }
  | { type: 'buffers'; buffers: Record<string, string> };

export const SCRIPT_ACTIONS = ['start', 'stop', 'restart', 'kill', 'clear'] as const;
export type ScriptAction = (typeof SCRIPT_ACTIONS)[number];

export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'action'; action: ScriptAction; script: string };
