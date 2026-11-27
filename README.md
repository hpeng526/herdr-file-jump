# Herdr File Jump

A Herdr App desktop mod for opening remote text files straight from
terminal output. On macOS, hold Cmd and click a file path in a remote
terminal. On Linux or Windows, use Ctrl-click. The right-hand Files
panel opens and previews the file on the same machine as that terminal.
The terminal keeps its focus.

A recognized link can be an absolute POSIX path, a relative path such
as `src/main.rs:42`, or a `file://` link. Relative paths follow the
clicked terminal's working directory. A numeric line or column is passed
to the read-only editor's selection. Local terminal links keep Herdr's
default behavior. It does not make otherwise undetected plain filenames
clickable or add previews for binary files.

## Try it in Herdr 0.1.18

From this directory, with Herdr running:

```sh
app_home=${HERDR_APP_HOME:-"$HOME/.config/herdr-app"}
test ! -e "$app_home/mods/herdr-file-jump" &&
test ! -e "$app_home/layouts/main-file-jump.json" &&
cp -R mods/herdr-file-jump "$app_home/mods/" &&
herdr-app check "$app_home/mods/herdr-file-jump" &&
cp layouts/main-file-jump.json "$app_home/layouts/" &&
herdr-app do layout.switch --name main-file-jump
```

In a remote POSIX terminal, print an existing text path. For example,
`printf '%s\n' /etc/hosts`, then Cmd-click the printed path on macOS.
The Files header should show `/etc/hosts` and its contents from that
terminal's machine. The back arrow returns to the file tree. Switch
back with `herdr-app do layout.switch --name main`.

The mod leaves the shipped layout and files untouched. It reads files
via the connected Herdr Core and retains the built-in Files panel's
folder and Git reads. A `~/` link queries the remote `HOME` with
`printenv`. It does not edit source files, run their contents or open an
external editor.

## Checks

```sh
node --experimental-vm-modules --test tests/*.test.cjs
herdr-app check mods/herdr-file-jump
```
