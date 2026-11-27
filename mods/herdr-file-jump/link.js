import { exec, layout, run, setShared, shared, spaces } from "herdr";
import { MOD, REQUEST, absolutePath, parseLink } from "./paths.js";

function find(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export async function handleLink({ link, source }) {
  // Leave local file links, other authorities and ordinary web links alone.
  const on = source?.machine;
  if (!on) return "pass";
  const here = shared("layout"), space = spaces().find(s => s.active)?.id ?? source.space;
  if (!here || !space || find(layout(), "panel-body")?.children?.find(n => n.id === "files")?.content?.mod !== MOD) return "pass";
  const target = parseLink(link, on);
  if (!target) return "pass";
  let home = null;
  if (target.path.startsWith("~/")) {
    const result = await exec("printenv", ["HOME"], { on, timeout: 3000 }).catch(() => null);
    if (result?.code === 0) home = result.stdout.replace(/\r?\n$/, "");
  }
  const path = absolutePath(target.path, source.cwd, home);
  if (!path || shared("layout") !== here || spaces().find(s => s.active)?.id !== space) return "pass";
  const time = Date.now();
  run("layout.select", { stack: "panel-body", child: "files" });
  run("layout.show", { id: "panel" });
  setShared(REQUEST, { id: Math.random().toString(36).slice(2), time, layout: here, space, path, on, line: target.line, column: target.column });
  return "handled";
}
