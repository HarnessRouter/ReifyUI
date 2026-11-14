// Types for reifyui/tree. Hand-written (the source is JSX), kept beside the source.
import type { ComponentType, CSSProperties } from 'react';

export type TreeKind = 'file' | 'dir';

/** One file or folder. A file's folders are implied by its path; a 'dir' entry adds a folder
 *  that may be empty. */
export interface TreeEntry {
  /** forward slashes, no leading slash: 'tasks/refund' */
  path: string;
  kind: TreeKind;
  /** a short quiet word after the name ("edited", "2 KB") */
  note?: string;
}

export interface TreeNode {
  path: string;
  name: string;
  kind: TreeKind;
  /** 1 at the top */
  depth: number;
  children: TreeNode[];
  /** files inside a folder, all the way down (0 for a file) */
  files: number;
  note?: string;
}

export interface FileTreeModel {
  /** the top ('' path) */
  root: TreeNode;
  /** the top level, sorted folders first then by name */
  nodes: TreeNode[];
  byPath: Map<string, TreeNode>;
}

export interface TreeRow {
  path: string;
  name: string;
  kind: TreeKind;
  depth: number;
  parent: string;
  open: boolean;
  hasChildren: boolean;
  files: number;
  note?: string;
}

export type TreeKeyAction =
  | { type: 'focus' | 'open' | 'close' | 'rename' | 'delete' | 'menu'; path: string }
  | { type: 'activate'; path: string; kind: TreeKind }
  | { type: 'none' };

/** Every word FileTree shows. A function takes the values named in its parameters. */
export interface TreeLabels {
  /** the tree's accessible name when there is no title */
  tree: string;
  newFile: string;
  newFolder: string;
  upload: string;
  collapseAll: string;
  rename: string;
  delete: string;
  /** the button that puts a delete question away */
  keep: string;
  /** the key named beside Rename and Delete in the menu */
  renameKey: string;
  deleteKey: string;
  /** shown when there are no entries */
  empty: string;
  /** the tag on a folder with nothing in it */
  emptyFolder: string;
  loading: string;
  saving: string;
  /** shown when a handler throws */
  failed: string;
  newFileInput: string;
  newFolderInput: string;
  renameInput: string | ((name: string) => string);
  confirmFile: string | ((name: string) => string);
  confirmFolder: string | ((name: string, files: number) => string);
  /** the menu's accessible name */
  menu: string | ((name: string) => string);
  nameEmpty: string | ((kind: TreeKind) => string);
  nameDots: string | ((kind: TreeKind) => string);
  nameSlash: string | ((kind: TreeKind) => string);
  nameInvisible: string | ((kind: TreeKind) => string);
  nameTaken: string | ((name: string, kind: TreeKind) => string);
}
export const DEFAULT_TREE_LABELS: Readonly<TreeLabels>;

/** A handler's answer: nothing when it went through, a message to refuse (shown where the person
 *  acted). A thrown error or a rejected Promise shows `labels.failed`. */
export type TreeAnswer = void | string | Promise<void | string>;

export type TreeHeaderAction = 'newFile' | 'newFolder' | 'upload' | 'collapseAll';

export interface TreeMenuItem {
  id: string;
  label: string;
  onSelect: (path: string, kind: TreeKind) => void;
  /** shown only where this answers true (e.g. files only) */
  when?: (path: string, kind: TreeKind) => boolean;
  disabled?: boolean;
}

export interface FileTreeProps {
  entries: TreeEntry[];
  /** the open file (or folder): drawn selected, and its folders open when it changes */
  selected?: string | null;
  /** a row was clicked, or Enter / Space was pressed on it */
  onSelect?: (path: string, kind: TreeKind) => void;

  /** open folders, controlled; pair with onOpenChange */
  open?: string[];
  /** uncontrolled: true (default) opens every folder, a list opens those */
  defaultOpen?: boolean | string[];
  onOpenChange?: (open: string[]) => void;

  /** the header's quiet label (shown uppercase) and the tree's accessible name */
  title?: string;
  /** the accessible name when it should differ from the title */
  label?: string;
  /** which header actions to show, beside the title. Default: all whose handler is given
   *  (Collapse all always). */
  actions?: TreeHeaderAction[];
  labels?: Partial<TreeLabels>;

  /** a name typed for New file / New folder, in the folder last used (or the top) */
  onCreate?: (e: { path: string; kind: TreeKind }) => TreeAnswer;
  /** F2, the row's pencil, or the menu */
  onRename?: (e: { from: string; to: string; kind: TreeKind }) => TreeAnswer;
  /** after the in-row question is answered Delete */
  onDelete?: (e: { path: string; kind: TreeKind }) => TreeAnswer;
  /** a row dropped on a folder ('' is the top); never into itself or a folder inside it */
  onMove?: (e: { from: string; toDir: string; kind: TreeKind }) => TreeAnswer;
  /** the header's Upload: open your own file picker for `dirPath` ('' is the top) */
  onUpload?: (dirPath: string) => void;
  /** your own rule, asked after the defaults ('' . .. a slash, a taken name) pass; '' allows it */
  validateName?: (name: string, dirPath: string, kind: TreeKind) => string;
  /** more choices in a row's menu, between Rename and Delete */
  menuItems?: TreeMenuItem[];

  /** no header actions but Collapse all, no menu, no row actions, no dragging */
  readOnly?: boolean;
  /** a load or a save in flight: changes wait, and an empty tree shows loading rows */
  busy?: boolean;
  /** rows with a save of their own in flight */
  pending?: string[];
  /** a message under a row, by path */
  rowErrors?: Record<string, string>;
  /** a message under the header, for the whole tree */
  error?: string;

  className?: string;
  style?: CSSProperties;
}
export const FileTree: ComponentType<FileTreeProps>;

export function buildFileTree(entries: TreeEntry[]): FileTreeModel;
export function visibleRows(nodes: TreeNode[], isOpen: Set<string> | ((path: string) => boolean)): TreeRow[];
/** What a key does on the focused row (WAI-ARIA tree pattern); null when the key is not the tree's. */
export function treeKeyAction(rows: TreeRow[], active: string | null, ev: string | { key: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean },
  opts?: { editable?: boolean }): TreeKeyAction | null;
/** Why a name can't be used in `dir`, or ''. */
export function nameProblem(name: string, opts?: {
  kind?: TreeKind; dir?: string; siblings?: Iterable<string>; labels?: Partial<TreeLabels>;
  validate?: (name: string, dirPath: string, kind: TreeKind) => string;
}): string;
/** Whether `from` may move into `toDir`: not into itself or below it, not where it is, not onto a taken name. */
export function canMove(tree: FileTreeModel, from: string, toDir: string): boolean;
export function folderPaths(tree: FileTreeModel): string[];
export function parentOf(path: string): string;
export function baseName(path: string): string;
export function joinPath(dir: string, name: string): string;
export function isWithin(path: string, dir: string): boolean;
export function movedPath(path: string, from: string, to: string): string;
export function normalizePath(raw: string): string;
export function splitExt(name: string): [string, string];
