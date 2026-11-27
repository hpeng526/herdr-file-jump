const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const mod = path.resolve(__dirname, "../mods/herdr-file-jump");
const remote = "devbox";
const root = "/home/dev/project";
const layoutName = "main-file-jump";
const space = { id: "devbox/work", machine: remote, active: true, folder: root };
const link = (raw, line, column) => ({ kind: "file", raw, line, column, path: null });
const source = { machine: remote, cwd: root, space: space.id };

async function harness() {
  const context = vm.createContext({});
  const modules = new Map();
  const sharedState = new Map([["layout", layoutName]]);
  const calls = { commands: [], reads: [], exec: [], editors: [] };
  let activeSpace = space;
  let contents = async () => "line one\nline two\nline three\n";
  let currentLayout = JSON.parse(fs.readFileSync(path.join(mod, "../../examples/main-file-jump.json"), "utf8"));
  const helpers = {
    "herdr": {
      spaces: () => [activeSpace],
      panes: () => [],
      focused: () => null,
      exec: async (program, args, options) => {
        calls.exec.push({ program, args: [...args], options: { ...options } });
        return { code: 0, stdout: "/home/dev\n" };
      },
      readTextFile: (file, { on }) => {
        calls.reads.push({ file, on });
        return contents(file);
      },
      watchFolder: () => { throw new Error("check must not start a watch"); },
      checking: () => true,
      theme: () => ({}),
      settings: () => ({}),
      window: () => null,
      layout: () => currentLayout,
      shared: (name) => sharedState.get(name),
      setShared: (name, value) => { sharedState.set(name, value); },
      run: (command, args) => calls.commands.push([command, { ...args }]),
    },
    "gpui-kit": {
      View: class {},
      div: () => {},
      svg: () => {},
    },
    "gpui-base": {
      h_flex: () => {},
      v_flex: () => {},
      Editor: {},
      EditorState: { new(options) {
        const editor = {
          options,
          set_selected_range(range) { this.selection = { ...range }; },
          release() { this.released = true; },
        };
        calls.editors.push(editor);
        return editor;
      } },
    },
  };
  function load(identifier) {
    if (modules.has(identifier)) return modules.get(identifier);
    const exports = helpers[identifier];
    const module = exports
      ? new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context, identifier })
      : new vm.SourceTextModule(fs.readFileSync(identifier, "utf8"), { context, identifier });
    modules.set(identifier, module);
    return module;
  }
  async function open(file) {
    const module = load(path.join(mod, file));
    if (module.status === "unlinked") {
      await module.link((id, parent) => load(id.startsWith(".") ? path.resolve(path.dirname(parent.identifier), id) : id));
    }
    if (module.status === "linked") await module.evaluate();
    return module.namespace;
  }
  const paths = await open("paths.js");
  const { handleLink } = await open("link.js");
  const { default: Files } = await open("main.js");
  const view = new Files();
  const tasks = [];
  const cx = {
    spawn(f) { tasks.push(Promise.resolve(f(cx))); },
    notify() {},
  };
  view.init(null, cx);
  view.root = root;
  view.on = remote;
  view.context = { space: space.id, key: JSON.stringify({ cwd: root, on: remote, space: space.id }) };
  return {
    paths, handleLink, view, cx, calls, tasks, sharedState,
    setActiveSpace(next) { activeSpace = next; },
    setLayout(next) { currentLayout = next; },
    setContents(next) { contents = next; },
  };
}

test("decodes remote file links and keeps filesystem semantics", async () => {
  const { paths } = await harness();
  const examples = [
    [link("/srv/文件.ts"), { path: "/srv/文件.ts", line: null, column: null }],
    [link("src/app.ts:42:7", 42, 7), { path: "src/app.ts", line: 42, column: 7 }],
    [link("./app.ts:5-12.", 5), { path: "./app.ts", line: 5, column: null }],
    [link("../app.ts#L5-L12", 5), { path: "../app.ts", line: 5, column: null }],
    [link("file:///home/dev/has%20spaces.ts#L8-L10"), { path: "/home/dev/has spaces.ts", line: 8, column: null }],
    [link("file://devbox/srv/a%3Ab.ts"), { path: "/srv/a:b.ts", line: null, column: null }],
    [link("file://other/srv/a.ts"), null],
    [link("file:///a%00b.ts"), null],
    [link("file:///a%GG.ts"), null],
  ];
  for (const [input, expected] of examples) {
    const actual = paths.parseLink(input, remote);
    assert.deepEqual(actual && { ...actual }, expected, input.raw);
  }
  assert.equal(paths.absolutePath("../src/app.ts", root, null), root + "/../src/app.ts");
  assert.equal(paths.absolutePath("~/src/app.ts", root, "/home/dev"), "/home/dev/src/app.ts");
  assert.equal(paths.absolutePath("src/app.ts", null, null), null);
  assert.deepEqual({ ...paths.selectionAt("one\r\ntwo\n", 2, null) }, { start: 5, end: 8 });
  assert.equal(paths.selectionAt("one\n", 3, null), null);
});

test("opens the Files panel and previews the actual remote file with a selection", async () => {
  const { handleLink, view, cx, paths, calls, tasks, sharedState } = await harness();
  assert.equal(await handleLink({ link: link("src/app.ts:2:3", 2, 3), source }), "handled");
  assert.deepEqual(calls.commands, [
    ["layout.select", { stack: "panel-body", child: "files" }],
    ["layout.show", { id: "panel" }],
  ]);
  view.openRequestedFile(cx);
  await Promise.all(tasks);
  assert.equal(sharedState.get(paths.REQUEST), null);
  assert.deepEqual(calls.reads, [{ file: root + "/src/app.ts", on: remote }]);
  assert.equal(view.file, "src/app.ts");
  assert.equal(view.root, root);
  assert.equal(view.code.options.readonly, true);
  assert.deepEqual(view.code.selection, { start: 11, end: 11 });
  assert.deepEqual(calls.exec, []);
});

test("uses the source machine even if it differs from the panel's active space", async () => {
  const { handleLink, view, cx, calls, tasks } = await harness();
  assert.equal(await handleLink({
    link: link("/etc/hosts"),
    source: { ...source, machine: "another-box", space: "another-box/peek" },
  }), "handled");
  view.openRequestedFile(cx);
  await Promise.all(tasks);
  assert.equal(view.file, "/etc/hosts");
  assert.deepEqual(calls.reads, [{ file: "/etc/hosts", on: "another-box" }]);
});

test("leaves other links and the shipped layout alone", async () => {
  const { handleLink, setLayout, calls } = await harness();
  assert.equal(await handleLink({ link: link("/etc/hosts"), source: { ...source, machine: null } }), "pass");
  assert.equal(await handleLink({ link: link("file://unrelated/srv/a.txt"), source }), "pass");
  assert.equal(await handleLink({ link: { kind: "url", raw: "https://example.test/a.txt" }, source }), "pass");
  setLayout({ id: "root", children: [{ id: "panel-body", children: [{ id: "files", content: { mod: "files" } }] }] });
  assert.equal(await handleLink({ link: link("/etc/hosts"), source }), "pass");
  assert.deepEqual(calls.commands, []);
  assert.deepEqual(calls.exec, []);
});

test("looks up the home directory only for tilde links", async () => {
  const { handleLink, view, cx, calls, tasks } = await harness();
  assert.equal(await handleLink({ link: link("~/notes.txt"), source }), "handled");
  view.openRequestedFile(cx);
  await Promise.all(tasks);
  assert.deepEqual(calls.exec, [
    { program: "printenv", args: ["HOME"], options: { on: remote, timeout: 3000 } },
  ]);
  assert.deepEqual(calls.reads, [{ file: "/home/dev/notes.txt", on: remote }]);
});

test("does not let an old linked read replace an ordinary Files preview", async () => {
  const { handleLink, view, cx, tasks, setContents } = await harness();
  let resolve;
  const slow = new Promise(r => { resolve = r; });
  setContents(file => file.endsWith("old.txt") ? slow : "latest");
  await handleLink({ link: link("/tmp/old.txt"), source });
  view.openRequestedFile(cx);
  view.show("new.txt", cx);
  resolve("old");
  await Promise.all(tasks);
  assert.equal(view.file, "new.txt");
  assert.equal(view.code.options.value, "latest");
});

test("ignores stale requests and requests for a different space", async () => {
  const { handleLink, view, cx, paths, calls, sharedState, setActiveSpace } = await harness();
  await handleLink({ link: link("/etc/hosts"), source });
  const request = sharedState.get(paths.REQUEST);
  setActiveSpace({ ...space, id: "devbox/other" });
  view.context.space = "devbox/other";
  view.openRequestedFile(cx);
  assert.equal(sharedState.get(paths.REQUEST), request);
  view.context.space = space.id;
  sharedState.set(paths.REQUEST, { ...request, time: Date.now() - paths.REQUEST_TTL - 1 });
  view.openRequestedFile(cx);
  assert.deepEqual(calls.reads, []);
  assert.equal(sharedState.get(paths.REQUEST), null);
});
