// reifyui/tree — the model behind FileTree, with no React and no DOM, so every rule the tree
// follows (how paths become folders, which rows are visible, what a key does, which names and
// moves are refused) is a plain function a test can call and a host can reuse.

/** The folder a path sits in ('' is the top). */
export const parentOf = (p) => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
/** A path's last part. */
export const baseName = (p) => p.slice(p.lastIndexOf('/') + 1);
/** A name inside a folder ('' is the top). */
export const joinPath = (dir, name) => (dir ? `${dir}/${name}` : name);
/** True when `p` is `dir` or anything inside it. */
export const isWithin = (p, dir) => p === dir || p.startsWith(dir + '/');

/** A path as the tree keys it: forward slashes, nothing doubled, none at either end. */
export function normalizePath(raw) {
  return String(raw ?? '').replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '');
}

/** A name cut for display: the extension kept whole when the rest is cut ("very-long-na….md").
 *  A leading dot (".env") is part of the name, not an extension. */
export function splitExt(name) {
  const i = name.lastIndexOf('.');
  return i <= 0 ? [name, ''] : [name.slice(0, i), name.slice(i)];
}

const byName = (a, b) => (a.kind !== b.kind ? (a.kind === 'dir' ? -1 : 1)
  : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

/**
 * The tree drawn from a flat list of entries.
 *   entries  [{ path: 'tasks/refund', kind: 'file' | 'dir', note? }]
 * A file's folders are implied by its path; a 'dir' entry adds a folder that may be empty. Each
 * level is sorted folders first, then by name (numbers in names compare as numbers). A folder's
 * `files` counts every file inside it, all the way down. When one path is given both as a file and
 * as a folder (or a file sits "inside" a file), the folder wins and the file entry is left out.
 */
export function buildFileTree(entries) {
  const root = { path: '', name: '', kind: 'dir', depth: 0, children: [], files: 0 };
  const byPath = new Map([['', root]]);
  const ensureDir = (path) => {
    const hit = byPath.get(path);
    if (hit) {
      if (hit.kind === 'dir') return hit;
      // a file at a path something else sits inside: the folder takes its place
      hit.kind = 'dir'; hit.children = []; hit.files = 0; delete hit.note;
      return hit;
    }
    const parent = ensureDir(parentOf(path));
    const node = { path, name: baseName(path), kind: 'dir', depth: parent.depth + 1, children: [], files: 0 };
    parent.children.push(node);
    byPath.set(path, node);
    return node;
  };
  for (const e of entries || []) {
    const path = normalizePath(e && e.path);
    if (!path) continue;
    if (e.kind === 'dir') { const d = ensureDir(path); if (e.note) d.note = String(e.note); continue; }
    if (byPath.has(path)) continue;                 // a folder (or the same file) already holds this path
    const parent = ensureDir(parentOf(path));
    const node = { path, name: baseName(path), kind: 'file', depth: parent.depth + 1, children: [], files: 0 };
    if (e.note) node.note = String(e.note);
    parent.children.push(node);
    byPath.set(path, node);
  }
  const finish = (n) => {
    n.children.sort(byName);
    n.files = 0;
    for (const c of n.children) { if (c.kind === 'dir') { finish(c); n.files += c.files; } else n.files += 1; }
  };
  finish(root);
  return { root, nodes: root.children, byPath };
}

/** Every folder path in the tree. */
export function folderPaths(tree) {
  const out = [];
  for (const [p, n] of tree.byPath) if (p && n.kind === 'dir') out.push(p);
  return out;
}

/**
 * The rows a person can see, top to bottom: every node whose folders are all open.
 * Each row: { path, name, kind, depth (1 at the top), parent, open, hasChildren, files, note }.
 */
export function visibleRows(nodes, isOpen) {
  const open = typeof isOpen === 'function' ? isOpen : (p) => !!(isOpen && isOpen.has && isOpen.has(p));
  const rows = [];
  const walk = (list) => {
    for (const n of list) {
      const o = n.kind === 'dir' && open(n.path);
      rows.push({ path: n.path, name: n.name, kind: n.kind, depth: n.depth, parent: parentOf(n.path), open: o,
        hasChildren: n.children.length > 0, files: n.files, note: n.note });
      if (o) walk(n.children);
    }
  };
  walk(nodes || []);
  return rows;
}

/**
 * What a key does on the focused row, per the WAI-ARIA tree pattern. Pure: it reads the visible
 * rows and returns an action for the component to apply, or null when the key is not the tree's.
 *   { type: 'focus', path }   move focus to a row
 *   { type: 'open', path }    open a closed folder (focus stays)
 *   { type: 'close', path }   close an open folder (focus stays)
 *   { type: 'activate', path, kind }   Enter / Space: select it, and open or close a folder
 *   { type: 'rename', path } / { type: 'delete', path } / { type: 'menu', path }
 * `opts.editable` false drops rename, delete and the menu.
 */
export function treeKeyAction(rows, active, ev, opts = {}) {
  const key = typeof ev === 'string' ? ev : ev.key;
  const shift = typeof ev === 'object' && !!ev.shiftKey;
  const mod = typeof ev === 'object' && !!(ev.ctrlKey || ev.metaKey || ev.altKey);
  if (!rows.length) return null;
  let i = rows.findIndex((r) => r.path === active);
  if (i < 0) i = 0;
  const row = rows[i];
  const editable = opts.editable !== false;
  if (mod && key !== 'F10') return null;
  switch (key) {
    case 'ArrowDown': return i < rows.length - 1 ? { type: 'focus', path: rows[i + 1].path } : { type: 'focus', path: row.path };
    case 'ArrowUp': return i > 0 ? { type: 'focus', path: rows[i - 1].path } : { type: 'focus', path: row.path };
    case 'Home': return { type: 'focus', path: rows[0].path };
    case 'End': return { type: 'focus', path: rows[rows.length - 1].path };
    case 'ArrowRight':
      if (row.kind !== 'dir') return { type: 'none' };
      if (!row.open) return { type: 'open', path: row.path };
      return row.hasChildren && rows[i + 1] ? { type: 'focus', path: rows[i + 1].path } : { type: 'none' };
    case 'ArrowLeft':
      if (row.kind === 'dir' && row.open) return { type: 'close', path: row.path };
      return row.parent ? { type: 'focus', path: row.parent } : { type: 'none' };
    case 'Enter': case ' ': case 'Spacebar':
      return { type: 'activate', path: row.path, kind: row.kind };
    case 'F2': return editable ? { type: 'rename', path: row.path } : null;
    case 'Delete': case 'Backspace': return editable ? { type: 'delete', path: row.path } : null;
    case 'ContextMenu': return editable ? { type: 'menu', path: row.path } : null;
    case 'F10': return shift && editable ? { type: 'menu', path: row.path } : null;
    default: return null;
  }
}

const invisible = (s) => Array.from(s).some((c) => { const n = c.charCodeAt(0); return n < 32 || n === 127; });
const say = (v, ...a) => (typeof v === 'function' ? v(...a) : v);

/**
 * Why `name` can't be used for a new or renamed entry in `dir`, or '' when it can.
 *   kind      'file' | 'dir'
 *   siblings  the names already in `dir` (the entry being renamed left out)
 *   labels    the words (DEFAULT_TREE_LABELS' name* keys)
 *   validate  the host's own rule, (name, dir, kind) => message | '' — asked only once the
 *             defaults pass, so it never sees '', '.', '..' or a name with a slash
 */
export function nameProblem(name, { kind = 'file', dir = '', siblings = [], labels = {}, validate } = {}) {
  const L = { ...NAME_LABELS, ...labels };
  const n = String(name ?? '').trim();
  if (!n) return say(L.nameEmpty, kind);
  if (n === '.' || n === '..') return say(L.nameDots, kind);
  if (/[\\/]/.test(n)) return say(L.nameSlash, kind);
  if (invisible(n)) return say(L.nameInvisible, kind);
  const lower = n.toLowerCase();
  const sib = Array.from(siblings || []);
  if (sib.some((s) => s === n)) return say(L.nameTaken, n, kind);
  // two names that differ only in case read as one on most computers a file is later saved to
  if (sib.some((s) => s.toLowerCase() === lower)) return say(L.nameTaken, sib.find((s) => s.toLowerCase() === lower), kind);
  if (typeof validate === 'function') return validate(n, dir, kind) || '';
  return '';
}

/**
 * Whether `from` (a file or folder) may move into `toDir` ('' is the top): never into itself or a
 * folder inside it, never where it already is, never onto a name already taken there, and only
 * into a folder that exists. `tree` is buildFileTree's result.
 */
export function canMove(tree, from, toDir) {
  const node = tree.byPath.get(from);
  if (!node || !from) return false;
  const dest = tree.byPath.get(toDir);
  if (!dest || dest.kind !== 'dir') return false;
  if (parentOf(from) === toDir) return false;
  if (node.kind === 'dir' && isWithin(toDir, from)) return false;
  return !dest.children.some((c) => c.name.toLowerCase() === node.name.toLowerCase());
}

/** Rewrite a path when `from` moved to `to` (a folder's insides move with it). */
export const movedPath = (p, from, to) => (isWithin(p, from) ? to + p.slice(from.length) : p);

const NAME_LABELS = {
  nameEmpty: (kind) => (kind === 'dir' ? 'Type a folder name.' : 'Type a file name.'),
  nameDots: 'Choose a name other than . or ..',
  nameSlash: 'Use a name without a slash.',
  nameInvisible: 'Use visible characters only.',
  nameTaken: (name) => `${name} is already here.`,
};

/** Every word FileTree shows, each overridable through `labels`. A function takes the values
 *  named in its parameters. */
export const DEFAULT_TREE_LABELS = Object.freeze({
  tree: 'Files',
  newFile: 'New file',
  newFolder: 'New folder',
  upload: 'Upload files',
  collapseAll: 'Collapse all',
  rename: 'Rename',
  delete: 'Delete',
  keep: 'Keep',
  renameKey: 'F2',
  deleteKey: '⌫',
  empty: 'No files yet.',
  emptyFolder: 'empty',
  loading: 'Loading',
  saving: 'Saving',
  failed: 'That didn’t work. Try again.',
  newFileInput: 'Name of the new file',
  newFolderInput: 'Name of the new folder',
  renameInput: (name) => `New name for ${name}`,
  confirmFile: (name) => `Delete ${name}?`,
  confirmFolder: (name, files) => (files ? `Delete ${name} and the ${files === 1 ? 'file' : `${files} files`} in it?` : `Delete ${name}?`),
  menu: (name) => name,
  ...NAME_LABELS,
});
