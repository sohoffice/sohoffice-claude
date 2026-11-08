# Markdown Preview Fluent

## Contents

- [What it does](#what-it-does)
- [Opening the preview](#opening-the-preview)
- [Files](#files)
- [Install or update](#install-or-update)
- [Recommended settings](#recommended-settings)

## What it does

A local VS Code extension that restyles the built-in Markdown preview for reading the docs:

- white page, whatever the editor theme;
- a fixed left navigation of the H1–H3 headings, click to jump; hidden when the preview is narrower than 700px;
- content at full width with a small right padding;
- **Back** and **Forward** with Cmd+Left and Cmd+Right (Alt+Left and Alt+Right on Windows and Linux) while a Markdown Preview editor is active; see [Opening the preview](#opening-the-preview). Each editor group keeps its own history of the docs it showed in the preview editor; Back and Forward move through that history only and stop at either end, never leaving the preview. Jumps made from the left navigation are undone and redone first, within the page, before Back and Forward move to another doc.

It contributes to the built-in preview through `markdown.previewStyles` and `markdown.previewScripts`, plus two commands (Markdown Preview: Back / Forward) and their keybindings, scoped to the Markdown preview editor; it adds no settings.

## Opening the preview

The styling and the left navigation apply to every Markdown preview. Back and Forward work only in the **Markdown Preview editor**, where each followed link opens the target doc as an editor; they do not apply to the side preview that Cmd+K V or Cmd+Shift+V opens.

Open a doc in the Markdown Preview editor in one of these ways:

- Command Palette → **View: Reopen Editor With...** → **Markdown Preview**;
- in the Explorer, right-click the file → **Open With...** → **Markdown Preview**;
- to make it the default for all Markdown files, add to your settings:

  ```json
  "workbench.editorAssociations": { "*.md": "vscode.markdown.preview.editor" }
  ```

## Files

| File | Purpose |
| :--- | :--- |
| `package.json` | Extension manifest, including the Back / Forward keybindings |
| `extension.js` | Records the docs each editor group shows in the preview editor, and the Back / Forward commands |
| `preview.css` | Page, typography and navigation styles |
| `preview.js` | Builds the navigation, rebuilds it when the preview updates, and undoes or redoes navigation jumps |

## Install or update

From this folder, bump `version` in `package.json` when updating, then:

```bash
pnpm dlx @vscode/vsce@3.2.1 package --allow-missing-repository --skip-license -o markdown-preview-fluent.vsix
code --install-extension markdown-preview-fluent.vsix
```

Reload the window (Developer: Reload Window) and open a preview (see [Opening the preview](#opening-the-preview)). The `.vsix` is ignored by git.

## Recommended settings

Font size and line height come from VS Code's own settings rather than the stylesheet:

```json
"markdown.preview.fontSize": 16,
"markdown.preview.lineHeight": 1.75
```
