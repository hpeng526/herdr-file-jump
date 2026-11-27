export const MOD = "herdr-file-jump";
export const REQUEST = "herdr-file-jump.open";
export const REQUEST_TTL = 15000;

const validPath = (p) => typeof p === "string" && p.length > 0 && !/[\x00-\x1f\x7f]/.test(p);
const number = (n) => Number.isSafeInteger(n) && n > 0 && n <= 0xffffffff ? n : null;
const lineAnchor = /^L([1-9]\d*)(?:-L?[1-9]\d*)?$/;

export function parseLink(link, machine) {
  if (link?.kind !== "file" || !validPath(link.raw)) return null;
  let path = link.raw, line = number(link.line), column = number(link.column);
  if (/^file:/i.test(path)) {
    const uri = /^file:\/\/([^/]*)(\/[^?#]*)(?:\?[^#]*)?(?:#(.*))?$/i.exec(path)
      ?? /^file:()(\/[^?#]*)(?:\?[^#]*)?(?:#(.*))?$/i.exec(path);
    if (!uri || (uri[1] && ![machine, "localhost"].some(host => host?.toLowerCase() === uri[1].toLowerCase()))) return null;
    try { path = decodeURIComponent(uri[2]); } catch { return null; }
    const anchor = uri[3]?.match(lineAnchor);
    line = anchor ? number(Number(anchor[1])) : null;
    column = null;
  } else if (line) {
    // Herdr reports coordinates on plain links, but only verifies paths on this Mac.
    const match = /(?:#L(\d+)(?:-L?\d+)?|:(\d+)-L?\d+|:(\d+)(?::(\d+))?)\.?$/.exec(path);
    if (match && Number(match[1] ?? match[2] ?? match[3]) === line &&
        (match[4] === undefined ? !column : Number(match[4]) === column)) path = path.slice(0, match.index);
  }
  return validPath(path) ? { path, line, column: line ? column : null } : null;
}

export function absolutePath(path, cwd, home) {
  if (!validPath(path)) return null;
  if (path.startsWith("/")) return path;
  const useHome = path.startsWith("~/");
  const prefix = useHome ? home : cwd;
  if (!validPath(prefix) || !prefix.startsWith("/")) return null;
  // Keep '..' intact: the remote filesystem must resolve symlinks before it.
  return prefix.replace(/\/+$/, "") + "/" + (useHome ? path.slice(2) : path);
}

export function selectionAt(text, line, column) {
  if (!number(line)) return null;
  let start = 0;
  for (let n = 1; n < line; n++) {
    const next = text.indexOf("\n", start);
    if (next < 0) return null;
    start = next + 1;
  }
  const next = text.indexOf("\n", start);
  let end = next < 0 ? text.length : next;
  if (end > start && text[end - 1] === "\r") end--;
  if (!number(column)) return { start, end };
  const offset = Math.min(end, start + column - 1);
  return { start: offset, end: offset };
}
