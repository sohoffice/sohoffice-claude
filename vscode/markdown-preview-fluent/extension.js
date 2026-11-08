// Back/forward history limited to the Markdown preview editor, one history per editor group.
// Every doc a group shows in the preview editor is recorded; Cmd+Left/Right (package.json)
// reopen the previous/next one in the same group and stop at either end.
const vscode = require('vscode');

const PREVIEW_EDITOR = 'vscode.markdown.preview.editor';

function previewUri(tab) {
  const input = tab && tab.input;
  return input instanceof vscode.TabInputCustom && input.viewType === PREVIEW_EDITOR ? input.uri : undefined;
}

function activate(context) {
  // Keyed by the TabGroup object: view columns shift when a group closes.
  const histories = new Map(); // TabGroup -> { entries: [uri string], index, pending }

  function historyOf(group) {
    if (!histories.has(group)) histories.set(group, { entries: [], index: -1 });
    return histories.get(group);
  }

  function record() {
    for (const group of vscode.window.tabGroups.all) {
      const uri = previewUri(group.activeTab);
      if (!uri) continue;
      const history = historyOf(group);
      const current = uri.toString();
      if (history.pending !== undefined && history.entries[history.pending] === current) {
        history.index = history.pending; // arrived by back/forward
      } else if (history.entries[history.index] !== current) {
        history.entries = history.entries.slice(0, history.index + 1); // new doc: drop forward entries
        history.entries.push(current);
        history.index = history.entries.length - 1;
      }
      history.pending = undefined;
    }
  }

  async function go(step) {
    const group = vscode.window.tabGroups.activeTabGroup;
    if (!previewUri(group.activeTab)) return;
    const history = historyOf(group);
    const index = history.index + step;
    if (index < 0 || index >= history.entries.length) return;
    history.pending = index;
    await vscode.commands.executeCommand('vscode.openWith', vscode.Uri.parse(history.entries[index]), PREVIEW_EDITOR, group.viewColumn);
  }

  record();
  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs(record),
    vscode.window.tabGroups.onDidChangeTabGroups((event) => {
      for (const group of event.closed) histories.delete(group);
      record();
    }),
    vscode.commands.registerCommand('markdownPreviewFluent.back', () => go(-1)),
    vscode.commands.registerCommand('markdownPreviewFluent.forward', () => go(1))
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
