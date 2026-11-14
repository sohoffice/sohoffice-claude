import * as vscode from 'vscode';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Activity, DEFAULT_MARKER, sessionActivity } from './summary';
import { Manifest, SessionSpec, claudeArgs, latestSessionId, readManifest, sessionName } from './standup';

// One row in the view: a live Claude session, or a declared session (sessions.json or tasks.json) that is not running,
// with what it is doing while busy, or the executive summary of its latest reply.
interface Row {
  label: string;
  status: 'busy' | 'waiting' | 'idle' | 'stopped' | string;
  cwd?: string;
  activity?: Activity;
  // The project the row is grouped under, and its depth below the project row (0 for a top-level session).
  project: string;
  depth: number;
  // The label of the row this one is shown under, if any.
  treeParent?: string;
}

// A project group: its rows in tree order, and the session-name prefix its rows drop.
interface Group {
  project: string;
  rows: Row[];
  prefix: string;
}

interface Agent {
  pid?: number;
  name?: string;
  sessionId?: string;
  cwd?: string;
  status?: string;
  state?: string;
}

function run(cmd: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout: 10000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) =>
      err ? reject(err) : resolve(stdout));
  });
}

// A project is a git repository (worktrees included), or else the folder itself.
const projectCache = new Map<string, string>();
async function projectOf(dir: string): Promise<string> {
  const hit = projectCache.get(dir);
  if (hit) return hit;
  let project = dir;
  try {
    project = (await run('git', ['-C', dir, 'rev-parse', '--path-format=absolute', '--git-common-dir'])).trim() || dir;
  } catch {
    // Not a git repository: the folder is the project.
  }
  projectCache.set(dir, project);
  return project;
}

function claudeCandidates(): string[] {
  const configured = vscode.workspace.getConfiguration('claudeSessions').get<string>('claudePath', '');
  return [configured, path.join(os.homedir(), '.local', 'bin', 'claude'), 'claude'].filter(Boolean);
}

async function listAgents(): Promise<Agent[]> {
  let lastError: unknown;
  for (const cmd of claudeCandidates()) {
    try {
      return JSON.parse(await run(cmd, ['agents', '--json'])) as Agent[];
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// claude agents can list a session whose process just ended, e.g. right after a window reload.
function isAlive(a: Agent): boolean {
  if (!a.pid) return true;
  try {
    process.kill(a.pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function liveAgents(): Promise<Agent[]> {
  return (await listAgents()).filter(isAlive);
}

// The claude binary to run in a session terminal: an absolute path, since the terminal starts it without a shell.
async function claudeBinary(): Promise<string> {
  for (const cmd of claudeCandidates()) {
    if (path.isAbsolute(cmd)) {
      if (fs.existsSync(cmd)) return cmd;
      continue;
    }
    try {
      const found = (await run('/usr/bin/which', [cmd])).trim();
      if (found) return found;
    } catch {
      // Not on PATH: try the next candidate.
    }
  }
  throw new Error('claude CLI not found; set claudeSessions.claudePath');
}

interface Declared {
  folder: string;
  manifest: Manifest;
  spec: SessionSpec;
  name: string;
}

// Sessions declared in each workspace folder's .claude/sessions.json, in file order.
function declaredSessions(): Declared[] {
  const declared: Declared[] = [];
  for (const f of vscode.workspace.workspaceFolders ?? []) {
    const folder = f.uri.fsPath;
    try {
      const manifest = readManifest(folder);
      for (const spec of manifest?.sessions ?? []) declared.push({ folder, manifest: manifest!, spec, name: sessionName(manifest!, spec) });
    } catch (err) {
      vscode.window.showErrorMessage(`Claude Sessions: cannot read ${folder}/.claude/sessions.json: ${String(err)}`);
    }
  }
  return declared;
}

function normalizeStatus(a: Agent): string {
  if (a.status === 'busy' || a.state === 'working') return 'busy';
  if (a.status === 'waiting' || a.state === 'blocked') return 'waiting';
  return a.status ?? a.state ?? 'idle';
}

// A task starts a named Claude session when it passes --name to claude, or runs a claude-session.sh wrapper
// that takes the name as its first argument.
function isSessionTask(args: unknown[]): boolean {
  return args.includes('--name') || args.some(a => typeof a === 'string' && /(^|\/)claude-session\.sh$/.test(a));
}

// Labels of tasks in the workspace's tasks.json that start a named Claude session, in file order.
function sessionTaskLabels(): string[] {
  const labels: string[] = [];
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    try {
      const text = fs.readFileSync(path.join(folder.uri.fsPath, '.vscode', 'tasks.json'), 'utf8');
      const json = JSON.parse(text) as { tasks?: { label?: string; args?: unknown[] }[] };
      for (const t of json.tasks ?? []) {
        if (t.label && Array.isArray(t.args) && isSessionTask(t.args)) labels.push(t.label);
      }
    } catch {
      // Missing or non-JSON tasks.json: no ordering, no stopped rows.
    }
  }
  return labels;
}

const SEPARATOR = /[\s\-_:/.]/;

// The folder holding a directory's git repository (the main checkout, for a worktree), or the directory itself.
async function projectRoot(dir: string): Promise<string> {
  const project = await projectOf(dir);
  return path.basename(project) === '.git' ? path.dirname(project) : project;
}

// A project's name for its group row: the folder holding the git repository (worktrees included), or the folder itself.
async function projectLabel(dir: string): Promise<string> {
  const project = await projectOf(dir);
  return path.basename(path.basename(project) === '.git' ? path.dirname(project) : project);
}

// Put each row after its parent, indented one level more; rows whose parent is not shown are top-level.
// Siblings keep the order they come in.
function inTreeOrder(rows: Row[], parentOf: Map<string, string>): Row[] {
  const labels = new Set(rows.map(r => r.label));
  const parent = (r: Row) => {
    const p = parentOf.get(r.label);
    return p && p !== r.label && labels.has(p) ? p : undefined;
  };
  const out: Row[] = [];
  const seen = new Set<string>();
  const visit = (r: Row, depth: number, treeParent?: string) => {
    if (seen.has(r.label)) return; // A parent cycle: show each row once.
    seen.add(r.label);
    out.push({ ...r, depth, treeParent });
    for (const c of rows) if (parent(c) === r.label) visit(c, depth + 1, r.label);
  };
  for (const r of rows) if (!parent(r)) visit(r, 0);
  for (const r of rows) visit(r, 0); // Rows only reachable through a cycle.
  return out;
}

// The prefix shared by all labels, cut at a word boundary, so it can be dropped from each row.
// Empty when fewer than two labels, or when dropping it would leave a label empty.
function commonPrefix(labels: string[]): string {
  if (labels.length < 2) return '';
  let prefix = labels[0];
  for (const l of labels) {
    while (!l.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  // Keep the whole prefix only if every label continues with a separator; else cut back to the last separator.
  if (!labels.every(l => SEPARATOR.test(l.charAt(prefix.length)))) {
    let cut = prefix.length;
    while (cut > 0 && !SEPARATOR.test(prefix.charAt(cut - 1))) cut--;
    prefix = prefix.slice(0, cut);
  }
  prefix = prefix.replace(/[\s\-_:/.]+$/, '');
  if (!prefix || labels.some(l => !withoutPrefix(l, prefix))) return '';
  return prefix;
}

// The label minus the prefix and the separators after it, e.g. "myapp developer" -> "developer".
function withoutPrefix(label: string, prefix: string): string {
  return prefix ? label.slice(prefix.length).replace(/^[\s\-_:/.]+/, '') : label;
}

// Labels of the terminal tabs in the editor area, in tab order (group by group, left to right).
function terminalTabLabels(): string[] {
  return vscode.window.tabGroups.all
    .flatMap(g => g.tabs)
    .filter(t => t.input instanceof vscode.TabInputTerminal)
    .map(t => t.label);
}

// The session list, rendered in a webview so the summaries wrap instead of being cut to one line.
class SessionsProvider implements vscode.WebviewViewProvider {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  rows: Row[] = [];
  groups: Group[] = [];
  error?: string;
  view?: vscode.WebviewView;

  private inFlight = false;

  async refresh(): Promise<void> {
    // Skip a tick while the previous refresh is still running.
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const agents = await liveAgents();
      const allProjects = vscode.workspace.getConfiguration('claudeSessions').get<boolean>('allProjects', false);
      const workspaceProjects = new Set(
        await Promise.all((vscode.workspace.workspaceFolders ?? []).map(f => projectOf(f.uri.fsPath))));

      const live: Row[] = [];
      for (const a of agents) {
        if (!a.cwd) continue;
        if (!allProjects && !workspaceProjects.has(await projectOf(a.cwd))) continue;
        live.push({
          label: a.name ?? `unnamed ${(a.sessionId ?? '').slice(0, 8)}`,
          status: normalizeStatus(a),
          cwd: a.cwd,
          activity: a.sessionId ? safeActivity(a.sessionId, a.cwd) : undefined,
          project: await projectLabel(a.cwd),
          depth: 0,
        });
      }

      const declared = declaredSessions();
      const parentOf = new Map<string, string>();
      // Other projects' sessions (allProjects) take their parents and order from their own repository's sessions.json.
      const others: Manifest[] = [];
      const folderRoots = new Set(await Promise.all((vscode.workspace.workspaceFolders ?? []).map(f => projectRoot(f.uri.fsPath))));
      for (const root of new Set(await Promise.all(live.map(r => projectRoot(r.cwd!))))) {
        if (folderRoots.has(root)) continue;
        try {
          const m = readManifest(root);
          if (m) others.push(m);
        } catch {
          // An unreadable sessions.json in another project only costs its hierarchy.
        }
      }
      const otherOrder = others.flatMap(m => m.sessions.map(spec => sessionName(m, spec)));
      for (const m of [...new Set(declared.map(d => d.manifest)), ...others]) {
        for (const spec of m.sessions) {
          if (spec.parent) parentOf.set(sessionName(m, spec), sessionName(m, { ...spec, role: spec.parent }));
        }
      }
      const order = [...declared.map(d => d.name), ...sessionTaskLabels()];
      const tabs = terminalTabLabels();
      const liveLabels = new Set(live.map(r => r.label));
      const firstFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const stopped: Row[] = [];
      for (const label of order.filter(l => !liveLabels.has(l))) {
        const folder = declared.find(d => d.name === label)?.folder ?? firstFolder;
        stopped.push({ label, status: 'stopped', project: folder ? await projectLabel(folder) : '', depth: 0 });
      }
      // Terminal tabs in the editor area first, in tab order; then sessions.json and tasks.json order; then by name.
      const rank = (r: Row) => {
        const tab = tabs.findIndex(t => t === r.label || t.endsWith(r.label));
        if (tab >= 0) return tab;
        const task = order.indexOf(r.label);
        if (task >= 0) return 1000 + task;
        const other = otherOrder.indexOf(r.label);
        return other >= 0 ? 5000 + other : 9999;
      };
      const sorted = [...live, ...stopped].sort((x, y) => rank(x) - rank(y) || x.label.localeCompare(y.label));
      // One group per project: the workspace folders' projects first, in folder order, then the others by name.
      const folderProjects = await Promise.all((vscode.workspace.workspaceFolders ?? []).map(f => projectLabel(f.uri.fsPath)));
      const projects = [...new Set(sorted.map(r => r.project))].sort((x, y) => {
        const fx = folderProjects.indexOf(x), fy = folderProjects.indexOf(y);
        return (fx < 0 ? 1e9 : fx) - (fy < 0 ? 1e9 : fy) || x.localeCompare(y);
      });
      this.groups = projects.map(project => {
        const rows = inTreeOrder(sorted.filter(r => r.project === project), parentOf);
        return { project, rows, prefix: commonPrefix(rows.map(r => r.label)) };
      });
      this.rows = this.groups.flatMap(g => g.rows);
      this.error = undefined;
    } catch (err) {
      this.error = `claude agents --json failed: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      this.inFlight = false;
    }
    this.post();
    this.changed.fire();
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = pageHtml();
    view.webview.onDidReceiveMessage((msg: { type: string; label?: string }) => {
      if (msg.type === 'ready') this.post();
      if (msg.type === 'open') {
        const row = this.rows.find(r => r.label === msg.label);
        if (row) void open(row);
      }
    });
  }

  // Send the rows to the page; it re-renders them in place, keeping the scroll position.
  private post(): void {
    if (!this.view) return;
    const rows = this.error
      ? [{ label: this.error, name: this.error, status: 'error', tooltip: this.error, depth: 0 }]
      : this.groups.flatMap(g => [
        { group: true, project: g.project, name: g.project, tooltip: g.project },
        ...g.rows.map(r => ({
          label: r.label,
          project: g.project,
          depth: r.depth,
          parent: r.treeParent,
          name: withoutPrefix(r.label, g.prefix),
          status: r.status,
          ...detailFor(r),
          tooltip: tooltipFor(r),
        })),
      ]);
    void this.view.webview.postMessage({ type: 'rows', rows });
  }
}

// A transcript that cannot be read only costs the detail line, never the row.
function safeActivity(sessionId: string, cwd: string): Activity | undefined {
  try {
    const marker = vscode.workspace.getConfiguration('claudeSessions').get<string>('phaseMarker', DEFAULT_MARKER).trim();
    return sessionActivity(sessionId, cwd, marker || DEFAULT_MARKER);
  } catch {
    return undefined;
  }
}

// Time since a phase started, e.g. "45s", "4m", "1h 5m".
function elapsed(since: number): string {
  const s = Math.max(0, Math.round((Date.now() - since) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

// The row's detail line. Busy: the latest phase line with its elapsed time, else the latest tool call.
// Otherwise: the summary's first sentence, with the number of actions as a badge.
function detailFor(row: Row): { detail?: string; detailKind?: string; badge?: string } {
  const a = row.activity;
  if (!a) return {};
  if (row.status === 'busy') {
    if (a.phase) return { detail: a.phaseAt ? `${a.phase} · ${elapsed(a.phaseAt)}` : a.phase, detailKind: 'phase' };
    if (a.tool) return { detail: a.tool, detailKind: 'tool' };
    return {};
  }
  const s = a.summary;
  if (!s) return {};
  const n = s.actions.length;
  const badge = n ? (s.chinese ? `${n} 項待辦` : `${n} action${n > 1 ? 's' : ''}`) : undefined;
  return { detail: s.headline, detailKind: 'summary', badge };
}

// Plain text for the row's title attribute: name, status and folder, then the whole summary, actions included.
function tooltipFor(row: Row): string {
  const head = row.cwd ? `${row.label} · ${row.status} · ${row.cwd}` : `${row.label} · not running`;
  const s = row.activity?.summary;
  return s && row.status !== 'busy' ? `${head}\n\n${s.markdown.replace(/\*\*|__|`/g, '')}` : head;
}

function pageHtml(): string {
  const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { padding: 0; margin: 0; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); }
  /* Chevron on the left, then the name, the actions badge, and the status indicator against the right border. */
  .row { display: grid; grid-template-columns: 16px 1fr auto 16px; column-gap: 6px; padding: 3px 12px 3px 4px; cursor: pointer; }
  .group { font-weight: 600; }
  .chevron { width: 16px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: 0.7em; color: var(--vscode-icon-foreground); }
  .chevron.toggle:hover { background: var(--vscode-toolbar-hoverBackground); border-radius: 3px; }
  .row:hover { background: var(--vscode-list-hoverBackground); }
  .icon { width: 16px; height: 22px; display: flex; align-items: center; justify-content: center; }
  .name { line-height: 22px; overflow-wrap: anywhere; }
  .detail { grid-column: 2 / 5; color: var(--vscode-descriptionForeground); overflow-wrap: anywhere; line-height: 1.4; padding-bottom: 4px; }
  .detail.tool { font-size: 0.9em; opacity: 0.8; }
  .detail.tool::before { content: '⚙ '; }
  .badge { align-self: center; font-size: 0.85em; padding: 0 6px; border-radius: 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); white-space: nowrap; }
  .dot { width: 8px; height: 8px; border-radius: 50%; box-sizing: border-box; }
  .idle { border: 1.5px solid var(--vscode-foreground); }
  .waiting { background: var(--vscode-charts-yellow); }
  .stopped { border: 1.5px solid var(--vscode-disabledForeground); background: linear-gradient(135deg, transparent 43%, var(--vscode-disabledForeground) 43%, var(--vscode-disabledForeground) 57%, transparent 57%); }
  .error { background: var(--vscode-errorForeground); }
  .busy { width: 10px; height: 10px; border: 2px solid var(--vscode-terminal-ansiBrightGreen); border-right-color: transparent; animation: spin 1s linear infinite; }
  .stopped-name { color: var(--vscode-disabledForeground); }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<div id="list"></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const list = document.getElementById('list');
  // Collapsed projects ("p:<project>") and sessions ("s:<label>"), kept across re-renders and reloads.
  const collapsed = new Set((vscode.getState() || {}).collapsed || []);
  let last = [];
  const toggle = key => {
    if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key);
    vscode.setState({ collapsed: [...collapsed] });
    render(last);
  };
  // A chevron that toggles the key, or an empty slot of the same width for a row with nothing under it.
  const chevron = key => {
    const c = document.createElement('span');
    c.className = 'chevron';
    if (key) {
      c.classList.add('toggle');
      c.textContent = collapsed.has(key) ? '▶' : '▼';
      c.addEventListener('click', e => { e.stopPropagation(); toggle(key); });
    }
    return c;
  };
  // The more prominent of two statuses: needing input first, then working, then idle, then not running.
  const RANK = ['waiting', 'busy', 'idle', 'stopped'];
  const rank = s => { const i = RANK.indexOf(s); return i < 0 ? RANK.length : i; };
  const render = rows => {
    last = rows;
    const byLabel = new Map(rows.filter(r => !r.group).map(r => [r.label, r]));
    const parents = new Set(rows.map(r => r.parent).filter(Boolean));
    const hidden = r => {
      if (r.group) return false;
      if (r.project !== undefined && collapsed.has('p:' + r.project)) return true;
      for (let p = r.parent; p; p = byLabel.get(p)?.parent) if (collapsed.has('s:' + p)) return true;
      return false;
    };
    list.replaceChildren(...rows.filter(r => !hidden(r)).map(r => {
      const row = document.createElement('div');
      row.title = r.tooltip;
      if (r.group) {
        row.className = 'row group';
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = r.name;
        row.append(chevron('p:' + r.project), name);
        row.addEventListener('click', () => toggle('p:' + r.project));
        return row;
      }
      row.className = 'row';
      row.style.paddingLeft = (4 + 16 * ((r.depth || 0) + (r.project !== undefined ? 1 : 0))) + 'px';
      const name = document.createElement('span');
      name.className = 'name' + (r.status === 'stopped' ? ' stopped-name' : '');
      name.textContent = r.name;
      const badge = document.createElement('span');
      if (r.badge) {
        badge.className = 'badge';
        badge.textContent = r.badge;
      }
      // A collapsed session shows the most prominent status among itself and every session under it.
      let status = r.status;
      if (collapsed.has('s:' + r.label)) {
        const under = rows.filter(c => {
          for (let p = c.parent; p; p = byLabel.get(p)?.parent) if (p === r.label) return true;
          return false;
        });
        for (const c of under) if (rank(c.status) < rank(status)) status = c.status;
      }
      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.title = status === r.status ? r.status : r.status + '; under it: ' + status;
      const dot = document.createElement('span');
      dot.className = 'dot ' + status;
      icon.append(dot);
      row.append(chevron(parents.has(r.label) ? 's:' + r.label : undefined), name, badge, icon);
      if (r.detail) {
        const detail = document.createElement('div');
        detail.className = 'detail ' + r.detailKind;
        detail.textContent = r.detail;
        row.append(detail);
      }
      if (r.status !== 'error') row.addEventListener('click', () => vscode.postMessage({ type: 'open', label: r.label }));
      return row;
    }));
  };
  window.addEventListener('message', e => {
    if (e.data.type === 'rows') render(e.data.rows);
  });
  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}

// Task terminals are named after the task label; match loosely in case VS Code adds a prefix.
function findTerminal(label: string): vscode.Terminal | undefined {
  const terminals = vscode.window.terminals;
  return terminals.find(t => t.name === label) ?? terminals.find(t => t.name.endsWith(label));
}

// Start a declared session in its own terminal: resume its latest conversation, or start one with the stand-up message.
async function start(d: Declared): Promise<vscode.Terminal> {
  const editor = vscode.workspace.getConfiguration('claudeSessions').get<string>('terminalLocation', 'editor') === 'editor';
  const terminal = vscode.window.createTerminal({
    name: d.name,
    cwd: d.folder,
    shellPath: await claudeBinary(),
    shellArgs: claudeArgs(d.manifest, d.spec, latestSessionId(d.folder, d.name)),
    location: editor ? { viewColumn: vscode.ViewColumn.Active, preserveFocus: true } : vscode.TerminalLocation.Panel,
    // Not revived after a reload with stale arguments; standUp() starts it again, resuming the conversation.
    isTransient: true,
  });
  return terminal;
}

// Start every declared session that has neither a terminal in this window nor a live process elsewhere.
async function standUp(): Promise<number> {
  const declared = declaredSessions();
  if (!declared.length) return 0;
  const live = new Set((await liveAgents()).map(a => a.name));
  let started = 0;
  for (const d of declared) {
    if (findTerminal(d.name) || live.has(d.name)) continue;
    await start(d);
    started++;
  }
  return started;
}

// Asking another VS Code window to show a session's terminal: each window watches this file and shows the terminal
// if it has it. A request older than FOCUS_TTL_MS is ignored, so a window opened later does not act on it.
const FOCUS_DIR = path.join(os.homedir(), '.claude', 'claude-sessions');
const FOCUS_FILE = path.join(FOCUS_DIR, 'focus.json');
const FOCUS_TTL_MS = 15000;

function requestFocus(label: string): void {
  fs.mkdirSync(FOCUS_DIR, { recursive: true });
  fs.writeFileSync(FOCUS_FILE, JSON.stringify({ label, at: Date.now() }));
}

function watchFocusRequests(): vscode.Disposable {
  fs.mkdirSync(FOCUS_DIR, { recursive: true });
  let handled = 0;
  const check = () => {
    try {
      const req = JSON.parse(fs.readFileSync(FOCUS_FILE, 'utf8')) as { label?: string; at?: number };
      if (!req.label || !req.at || req.at <= handled || Date.now() - req.at > FOCUS_TTL_MS) return;
      const terminal = findTerminal(req.label);
      if (!terminal) return;
      handled = req.at;
      terminal.show(false);
    } catch {
      // No request yet, or one being written: the next change event reads it.
    }
  };
  const watcher = fs.watch(FOCUS_DIR, () => check());
  return { dispose: () => watcher.close() };
}

async function open(row: Row): Promise<void> {
  if (row.status === 'error') return;
  const terminal = findTerminal(row.label);
  if (terminal) {
    terminal.show(false);
    return;
  }
  // A session of a project this window does not hold: switch to the window that has the project open (VS Code
  // focuses it rather than opening the folder twice), and ask that window to show the session's terminal.
  if (row.cwd) {
    const root = await projectRoot(row.cwd);
    const folderRoots = await Promise.all((vscode.workspace.workspaceFolders ?? []).map(f => projectRoot(f.uri.fsPath)));
    if (!folderRoots.includes(root)) {
      requestFocus(row.label);
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root), { forceNewWindow: true });
      return;
    }
  }
  const declared = declaredSessions().find(d => d.name === row.label);
  if (declared) {
    if (row.status !== 'stopped') {
      vscode.window.showInformationMessage(`${row.label} runs outside this window; it has no terminal here.`);
      return;
    }
    (await start(declared)).show(false);
    return;
  }
  const task = (await vscode.tasks.fetchTasks()).find(t => t.name === row.label);
  if (task) {
    const answer = row.status === 'stopped'
      ? await vscode.window.showInformationMessage(`${row.label} is not running. Start it?`, 'Start')
      : await vscode.window.showWarningMessage(
        `No terminal found for ${row.label} in this window. Start another copy from its task?`, 'Start');
    if (answer === 'Start') await vscode.tasks.executeTask(task);
    return;
  }
  vscode.window.showInformationMessage(`No terminal for ${row.label} in this window; it may run elsewhere.`);
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new SessionsProvider();
  context.subscriptions.push(watchFocusRequests());

  const updateBadge = () => {
    const view = provider.view;
    if (!view) return;
    const waiting = provider.rows.filter(r => r.status === 'waiting').length;
    view.badge = waiting ? { value: waiting, tooltip: `${waiting} session(s) need input` } : undefined;
  };
  provider.onDidChange(updateBadge);

  // Keep refreshing even when hidden, so the badge stays current; the call is cheap.
  let timer: NodeJS.Timeout | undefined;
  const schedule = () => {
    if (timer) clearInterval(timer);
    const seconds = vscode.workspace.getConfiguration('claudeSessions').get<number>('refreshSeconds', 3);
    timer = setInterval(() => void provider.refresh(), Math.max(1, seconds) * 1000);
  };
  schedule();
  void provider.refresh();

  const standUpNow = async (manual: boolean) => {
    try {
      const started = await standUp();
      if (manual && !started) vscode.window.showInformationMessage('Claude Sessions: every declared session is already running.');
    } catch (err) {
      vscode.window.showErrorMessage(`Claude Sessions: stand-up failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    void provider.refresh();
  };
  if (vscode.workspace.getConfiguration('claudeSessions').get<boolean>('standUpOnOpen', true)) void standUpNow(false);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('claudeSessions.list', provider),
    vscode.commands.registerCommand('claudeSessions.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('claudeSessions.open', (row: Row) => open(row)),
    vscode.commands.registerCommand('claudeSessions.standUp', () => standUpNow(true)),
    // Reorder at once when terminal tabs are moved, opened or closed.
    vscode.window.tabGroups.onDidChangeTabs(() => void provider.refresh()),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('claudeSessions')) {
        schedule();
        void provider.refresh();
      }
    }),
    { dispose: () => timer && clearInterval(timer) },
  );
}

export function deactivate(): void {}
