import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { HostMessage, ScriptAction, ScriptView, WebviewMessage } from '../protocol';
import type { ScriptStatus } from '../status';
import './styles.css';

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();
const MAX_BUFFER_CHARS = 500_000;

type Buttons = Record<'start' | 'stop' | 'restart' | 'kill', HTMLButtonElement>;

/** The parts every script row has, whether it is a full row or a compact Recent row. */
interface RowView {
  root: HTMLElement;
  desc: HTMLElement;
  buttons: Buttons;
}

interface Row extends RowView {
  script: ScriptView;
  toggle: HTMLButtonElement;
  panel: HTMLElement;
  termHost: HTMLElement;
  term?: Terminal;
  fit?: FitAddon;
}

const rows = new Map<string, Row>();
const recentViews = new Map<string, RowView>();
const buffers = new Map<string, string>();
let recentNames: string[] = [];

const saved = vscode.getState() as { expanded?: string[] } | undefined;
const expanded = new Set<string>(saved?.expanded ?? []);

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const app = document.getElementById('app') as HTMLElement;
const message = el('div', 'message');
const recentSection = el('section', 'recent');
const recentTitle = el('h2', 'section-title', 'Recent');
const recentList = el('div', 'list');
recentSection.append(recentTitle, recentList);
const allTitle = el('h2', 'section-title', 'All scripts');
const list = el('div', 'list');
app.append(message, recentSection, allTitle, list);

const ICONS = {
  start: 'M4 2.5v11l9-5.5z',
  stop: 'M3.5 3.5h9v9h-9z',
  restart: 'M13.5 8a5.5 5.5 0 1 1-1.8-4.07M13.5 2.5v3.2h-3.2',
  kill: 'M8 1.5 14.5 8 8 14.5 1.5 8zM5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4',
  clear: 'M3 3l10 10M13 3 3 13',
  chevron: 'M6 3.5 10.5 8 6 12.5',
} as const;

function icon(name: keyof typeof ICONS): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name]);
  const filled = name === 'start' || name === 'stop';
  path.setAttribute('fill', filled ? 'currentColor' : 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.4');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

function iconButton(
  name: keyof typeof ICONS,
  label: string,
  action: ScriptAction,
): HTMLButtonElement {
  const button = el('button', 'icon-button');
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.dataset.action = action;
  button.append(icon(name));
  return button;
}

/** Status dot, name, status text and the four action buttons. */
function createRowView(script: ScriptView): RowView {
  const root = el('div', 'row');
  root.dataset.script = script.name;

  const head = el('div', 'head');
  const name = el('span', 'name', script.name);
  name.title = script.command;
  const desc = el('span', 'desc');
  const actions = el('span', 'actions');
  const buttons: Buttons = {
    start: iconButton('start', 'Start', 'start'),
    stop: iconButton('stop', 'Stop (Ctrl+C)', 'stop'),
    restart: iconButton('restart', 'Restart', 'restart'),
    kill: iconButton('kill', 'Kill process tree', 'kill'),
  };
  actions.append(buttons.start, buttons.stop, buttons.restart, buttons.kill);
  head.append(el('span', 'dot'), name, desc, actions);
  root.append(head);
  return { root, desc, buttons };
}

function createRow(script: ScriptView): Row {
  const view = createRowView(script);

  const toggle = el('button', 'toggle');
  toggle.type = 'button';
  toggle.dataset.toggle = 'true';
  toggle.append(icon('chevron'), el('span', undefined, 'Terminal'));

  const panel = el('div', 'panel');
  const toolbar = el('div', 'toolbar');
  toolbar.append(iconButton('clear', 'Clear output', 'clear'));
  const termHost = el('div', 'term');
  panel.append(toolbar, termHost);

  view.root.append(toggle, panel);
  return { ...view, script, toggle, panel, termHost };
}

function describe(status: ScriptStatus, exitCode: number | undefined): string {
  switch (status) {
    case 'running':
      return 'running';
    case 'stopping':
      return 'stopping…';
    case 'failed':
      return exitCode === undefined ? 'failed' : `exited ${exitCode}`;
    case 'stopped':
      return '';
  }
}

function applyStatus(view: RowView, script: ScriptView): void {
  const { status, exitCode } = script;
  view.root.dataset.status = status;
  view.desc.textContent = describe(status, exitCode);
  view.buttons.start.hidden = !(status === 'stopped' || status === 'failed');
  view.buttons.stop.hidden = status !== 'running';
  view.buttons.restart.hidden = status !== 'running';
  view.buttons.kill.hidden = status !== 'running' && status !== 'stopping';
}

function updateRow(row: Row): void {
  applyStatus(row, row.script);
  const open = expanded.has(row.script.name);
  row.root.classList.toggle('open', open);
  row.toggle.setAttribute('aria-expanded', String(open));
  row.panel.hidden = !open;
}

function renderRecent(): void {
  recentList.replaceChildren();
  recentViews.clear();

  for (const name of recentNames) {
    const script = rows.get(name)?.script;
    if (!script) continue;
    const view = createRowView(script);
    view.root.classList.add('compact');
    applyStatus(view, script);
    recentViews.set(name, view);
    recentList.append(view.root);
  }

  const show = recentViews.size > 0;
  recentSection.hidden = !show;
  allTitle.hidden = !show;
}

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.body).getPropertyValue(name).trim() || fallback;
}

function ensureTerminal(row: Row): void {
  if (row.term) return;
  const term = new Terminal({
    convertEol: true,
    disableStdin: true,
    cursorBlink: false,
    scrollback: 5000,
    fontSize: 12,
    fontFamily: cssVar('--vscode-editor-font-family', 'monospace'),
    theme: {
      background: cssVar('--vscode-terminal-background', cssVar('--vscode-editor-background', '#1e1e1e')),
      foreground: cssVar('--vscode-terminal-foreground', cssVar('--vscode-editor-foreground', '#cccccc')),
      selectionBackground: cssVar('--vscode-terminal-selectionBackground', '#264f78'),
    },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(row.termHost);
  row.term = term;
  row.fit = fit;

  const buffered = buffers.get(row.script.name);
  if (buffered) term.write(buffered);

  let frame = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!row.panel.hidden) row.fit?.fit();
    });
  }).observe(row.termHost);
}

function toggleTerminal(name: string): void {
  const row = rows.get(name);
  if (!row) return;
  if (expanded.has(name)) expanded.delete(name);
  else expanded.add(name);
  vscode.setState({ expanded: [...expanded] });

  updateRow(row);
  if (expanded.has(name)) {
    ensureTerminal(row);
    requestAnimationFrame(() => row.fit?.fit());
  }
}

function renderScripts(scripts: ScriptView[], text: string | undefined): void {
  message.textContent = text ?? '';
  message.hidden = !text;

  const names = new Set(scripts.map((script) => script.name));
  for (const [name, row] of rows) {
    if (names.has(name)) continue;
    row.term?.dispose();
    row.root.remove();
    rows.delete(name);
  }

  for (const script of scripts) {
    let row = rows.get(script.name);
    if (row) row.script = script;
    else {
      row = createRow(script);
      rows.set(script.name, row);
    }
    updateRow(row);
    list.append(row.root); // appending an existing node moves it, which keeps package.json order
    if (expanded.has(script.name)) ensureTerminal(row);
  }
  renderRecent();
}

function appendBuffer(script: string, data: string): void {
  let next = (buffers.get(script) ?? '') + data;
  if (next.length > MAX_BUFFER_CHARS) next = next.slice(next.length - MAX_BUFFER_CHARS);
  buffers.set(script, next);
}

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const data = event.data;
  switch (data.type) {
    case 'scripts':
      renderScripts(data.scripts, data.message);
      break;
    case 'recent':
      recentNames = data.recent;
      renderRecent();
      break;
    case 'state': {
      const row = rows.get(data.script);
      if (!row) break;
      row.script = { ...row.script, status: data.status, exitCode: data.exitCode };
      updateRow(row);
      const recent = recentViews.get(data.script);
      if (recent) applyStatus(recent, row.script);
      break;
    }
    case 'output':
      appendBuffer(data.script, data.data);
      rows.get(data.script)?.term?.write(data.data);
      break;
    case 'buffers':
      buffers.clear();
      for (const [script, text] of Object.entries(data.buffers)) buffers.set(script, text);
      for (const row of rows.values()) {
        if (!row.term) continue;
        row.term.reset();
        const text = buffers.get(row.script.name);
        if (text) row.term.write(text);
      }
      break;
  }
});

app.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const name = target.closest<HTMLElement>('.row')?.dataset.script;
  if (!name) return;

  const button = target.closest<HTMLButtonElement>('button[data-action]');
  if (button) {
    const action = button.dataset.action as ScriptAction;
    if (action === 'clear') {
      buffers.delete(name);
      rows.get(name)?.term?.reset();
    }
    vscode.postMessage({ type: 'action', action, script: name });
    return;
  }
  if (target.closest('button[data-toggle]')) toggleTerminal(name);
});

vscode.postMessage({ type: 'ready' });
