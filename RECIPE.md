# Herdr File Jump

Keep the shipped Files tree and its read-only preview in the right
sidebar. Add only a way to open a remote terminal link in that preview.

- The personal layout `main-file-jump` keeps the standard Files and
  Changes buttons. Its `files` block uses `herdr-file-jump`. Its
  `link_handlers` includes the same mod.
- `link.js` only handles file links reported by Herdr from remote
  terminals. It uses the clicked terminal's machine and working directory,
  resolves the path, selects the Files block, and publishes an open
  request scoped to the visible layout and space.
- `main.js` consumes and clears that request, then treats it like a
  file-tree click except that the read uses the clicked path and machine.
  Ignore an older read when the user opens another file or switches
  context. The tree keeps its original root and expansion state.
- `paths.js` handles path syntax, URI decoding, and line/column offsets.
  Local links and unsupported link forms pass through. A bare filename
  that Herdr does not recognize cannot be intercepted.
- The base layout and Files view are based on Herdr App 0.1.18. Rebase
  the copy separately if incorporating future upstream changes.

Done when a click on a recognized text path in a remote terminal reveals
the sidebar and reads the file on that terminal's machine, clicking the
back arrow keeps the original tree, and local links are unchanged.
