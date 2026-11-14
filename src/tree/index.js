// reifyui/tree: a folder tree of files the way an editor's Explorer shows one.
//
//   the view    FileTree (styles: reifyui/styles/tree.css)
//   the model   buildFileTree, visibleRows, treeKeyAction, nameProblem, canMove, folderPaths,
//               parentOf, baseName, joinPath, isWithin, movedPath, normalizePath, splitExt,
//               DEFAULT_TREE_LABELS
//
// A separate entry so a host that renders a Button never pulls in a tree. The model has no React
// and no DOM: a host can check a name or a move with the same rules the tree uses.
export { FileTree } from './FileTree.jsx';
export {
  buildFileTree, visibleRows, treeKeyAction, nameProblem, canMove, folderPaths,
  parentOf, baseName, joinPath, isWithin, movedPath, normalizePath, splitExt, DEFAULT_TREE_LABELS,
} from './model.js';
