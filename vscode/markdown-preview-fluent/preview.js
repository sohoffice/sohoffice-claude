// Built-in Markdown preview: fixed left navigation of H1–H3 headings.
(function () {
  const NAV_ID = 'md-side-nav';

  function slug(text) {
    return text.trim().toLowerCase().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-');
  }

  // Jumps made from the nav are undone/redone here with Back/Forward. Stopping the key at
  // document keeps it from the webview's window listener that forwards keys to VS Code; with no
  // jump left, the key passes through and the extension moves to the previous/next doc.
  const jumps = { back: [], forward: [] };

  function jumpTo(h) {
    jumps.back.push(window.scrollY);
    jumps.forward = [];
    h.scrollIntoView({ block: 'start' });
  }

  // Same keys as the keybindings in package.json: Cmd+Left/Right on macOS, Alt+Left/Right elsewhere.
  const isMac = /Mac/i.test(navigator.platform || navigator.userAgent);

  document.addEventListener('keydown', (e) => {
    const modifier = isMac ? e.metaKey && !e.altKey : e.altKey && !e.metaKey;
    if (!modifier || e.ctrlKey || e.shiftKey) return;
    const [from, to] =
      e.key === 'ArrowLeft' ? [jumps.back, jumps.forward] : e.key === 'ArrowRight' ? [jumps.forward, jumps.back] : [];
    if (!from || !from.length) return;
    to.push(window.scrollY);
    window.scrollTo(0, from.pop());
    e.preventDefault();
    e.stopPropagation();
  });

  function render() {
    const old = document.getElementById(NAV_ID);
    if (old) old.remove();

    const headings = document.body.querySelectorAll('h1, h2, h3');
    if (!headings.length) return;

    const nav = document.createElement('nav');
    nav.id = NAV_ID;
    headings.forEach((h) => {
      if (!h.id) h.id = slug(h.textContent);
      const a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      a.className = 'md-side-nav-' + h.tagName.toLowerCase();
      a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        jumpTo(h);
      });
      nav.appendChild(a);
    });
    document.body.appendChild(nav);
  }

  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      render();
    });
  }

  window.addEventListener('vscode.markdown.updateContent', schedule);
  // The preview patches the body on edits; re-render if the nav was dropped or headings changed.
  // Mutations made by render() itself (inside the nav, or adding/removing the nav) are ignored.
  const isNav = (node) => node.id === NAV_ID || !!(node.closest && node.closest('#' + NAV_ID));
  const ownMutation = (m) =>
    isNav(m.target.nodeType === 1 ? m.target : m.target.parentElement || document.body) ||
    (m.type === 'childList' && [...m.addedNodes, ...m.removedNodes].every((n) => n.id === NAV_ID));
  new MutationObserver((mutations) => {
    if (!document.getElementById(NAV_ID) || !mutations.every(ownMutation)) schedule();
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
