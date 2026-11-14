// reifyui/tree's model: the rules FileTree follows, without React or a DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFileTree, visibleRows, treeKeyAction, nameProblem, canMove, folderPaths, parentOf, movedPath, normalizePath, splitExt,
  DEFAULT_TREE_LABELS,
} from '../src/tree/index.js';

const ENTRIES = [
  { path: 'tasks/refund', kind: 'file' },
  { path: 'common/tone', kind: 'file' },
  { path: 'tasks/product-question', kind: 'file' },
  { path: 'README', kind: 'file' },
  { path: 'common/signoff', kind: 'file' },
  { path: 'drafts', kind: 'dir' },                       // an empty folder, only there because it is named
  { path: 'tasks/billing/late-fee', kind: 'file' },
  { path: 'notes10', kind: 'file' },
  { path: 'notes9', kind: 'file' },
];
const names = (list) => list.map((n) => n.name);

test('the tree is drawn from paths: folders implied by a file path, empty ones from a dir entry', () => {
  const t = buildFileTree(ENTRIES);
  assert.deepEqual(names(t.nodes), ['common', 'drafts', 'tasks', 'notes9', 'notes10', 'README']);
  const tasks = t.byPath.get('tasks');
  assert.equal(tasks.kind, 'dir');
  assert.deepEqual(names(tasks.children), ['billing', 'product-question', 'refund'], 'folders first, then names');
  assert.equal(t.byPath.get('tasks/billing').kind, 'dir', 'a folder only a deeper file names is still a folder');
  assert.equal(t.byPath.get('drafts').children.length, 0);
  assert.equal(tasks.files, 3, 'a folder counts every file inside it, all the way down');
  assert.equal(t.root.files, 8);
  assert.equal(t.byPath.get('tasks/billing/late-fee').depth, 3);
  assert.deepEqual(folderPaths(t).sort(), ['common', 'drafts', 'tasks', 'tasks/billing']);
});

test('paths are normalised, and a path given as both a file and a folder is a folder', () => {
  const t = buildFileTree([{ path: '/a//b/', kind: 'file' }, { path: 'x', kind: 'file' }, { path: 'x/y', kind: 'file' }, { path: '', kind: 'file' }]);
  assert.ok(t.byPath.has('a/b'));
  assert.equal(t.byPath.get('x').kind, 'dir');
  assert.deepEqual(names(t.byPath.get('x').children), ['y']);
  assert.equal(normalizePath('\\a\\b\\'), 'a/b');
});

test('visible rows follow the open folders, with depth and parent', () => {
  const t = buildFileTree(ENTRIES);
  const shut = visibleRows(t.nodes, new Set());
  assert.deepEqual(shut.map((r) => r.path), ['common', 'drafts', 'tasks', 'notes9', 'notes10', 'README']);
  const rows = visibleRows(t.nodes, new Set(['tasks']));
  assert.deepEqual(rows.map((r) => r.path),
    ['common', 'drafts', 'tasks', 'tasks/billing', 'tasks/product-question', 'tasks/refund', 'notes9', 'notes10', 'README']);
  const refund = rows.find((r) => r.path === 'tasks/refund');
  assert.equal(refund.depth, 2);
  assert.equal(refund.parent, 'tasks');
  assert.equal(rows.find((r) => r.path === 'tasks').open, true);
  assert.equal(visibleRows(t.nodes, () => true).length, 12, 'a function works as the open test too');
});

test('keys move per the WAI-ARIA tree pattern', () => {
  const t = buildFileTree(ENTRIES);
  const rows = visibleRows(t.nodes, new Set(['tasks']));
  assert.deepEqual(treeKeyAction(rows, 'common', 'ArrowDown'), { type: 'focus', path: 'drafts' });
  assert.deepEqual(treeKeyAction(rows, 'drafts', 'ArrowUp'), { type: 'focus', path: 'common' });
  assert.deepEqual(treeKeyAction(rows, 'common', 'ArrowUp'), { type: 'focus', path: 'common' }, 'the first row stays');
  assert.deepEqual(treeKeyAction(rows, 'README', 'ArrowDown'), { type: 'focus', path: 'README' }, 'the last row stays');
  assert.deepEqual(treeKeyAction(rows, 'tasks/refund', 'Home'), { type: 'focus', path: 'common' });
  assert.deepEqual(treeKeyAction(rows, 'common', 'End'), { type: 'focus', path: 'README' });
  // Right: open a closed folder, then move into it; nothing on a file
  assert.deepEqual(treeKeyAction(rows, 'common', 'ArrowRight'), { type: 'open', path: 'common' });
  assert.deepEqual(treeKeyAction(rows, 'tasks', 'ArrowRight'), { type: 'focus', path: 'tasks/billing' });
  assert.deepEqual(treeKeyAction(rows, 'README', 'ArrowRight'), { type: 'none' });
  // Left: close an open folder, else go to the parent; nothing at the top
  assert.deepEqual(treeKeyAction(rows, 'tasks', 'ArrowLeft'), { type: 'close', path: 'tasks' });
  assert.deepEqual(treeKeyAction(rows, 'tasks/refund', 'ArrowLeft'), { type: 'focus', path: 'tasks' });
  assert.deepEqual(treeKeyAction(rows, 'README', 'ArrowLeft'), { type: 'none' });
  // Enter / Space select (the component also opens a folder)
  assert.deepEqual(treeKeyAction(rows, 'tasks/refund', 'Enter'), { type: 'activate', path: 'tasks/refund', kind: 'file' });
  assert.deepEqual(treeKeyAction(rows, 'tasks', ' '), { type: 'activate', path: 'tasks', kind: 'dir' });
  // F2, Delete / Backspace, Shift+F10 and the menu key
  assert.deepEqual(treeKeyAction(rows, 'tasks/refund', 'F2'), { type: 'rename', path: 'tasks/refund' });
  assert.deepEqual(treeKeyAction(rows, 'tasks/refund', 'Delete'), { type: 'delete', path: 'tasks/refund' });
  assert.deepEqual(treeKeyAction(rows, 'tasks/refund', 'Backspace'), { type: 'delete', path: 'tasks/refund' });
  assert.deepEqual(treeKeyAction(rows, 'tasks/refund', { key: 'F10', shiftKey: true }), { type: 'menu', path: 'tasks/refund' });
  assert.deepEqual(treeKeyAction(rows, 'tasks/refund', 'ContextMenu'), { type: 'menu', path: 'tasks/refund' });
  assert.equal(treeKeyAction(rows, 'tasks/refund', 'F10'), null, 'F10 alone is the browser’s');
  assert.equal(treeKeyAction(rows, 'tasks/refund', { key: 'ArrowDown', metaKey: true }), null, 'a modified key is the host’s');
  assert.equal(treeKeyAction(rows, 'tasks/refund', 'a'), null);
  // read only: no rename, delete or menu, but moving still works
  for (const k of ['F2', 'Delete', 'ContextMenu']) assert.equal(treeKeyAction(rows, 'tasks/refund', k, { editable: false }), null);
  assert.deepEqual(treeKeyAction(rows, 'tasks/refund', 'ArrowUp', { editable: false }), { type: 'focus', path: 'tasks/product-question' });
  assert.equal(treeKeyAction([], null, 'ArrowDown'), null);
});

test('a typed name: empty, dots, slashes, invisible characters and taken names are refused', () => {
  const sib = ['refund', 'billing'];
  assert.equal(nameProblem('', { kind: 'file' }), 'Type a file name.');
  assert.equal(nameProblem('   ', { kind: 'dir' }), 'Type a folder name.');
  assert.equal(nameProblem('.', {}), DEFAULT_TREE_LABELS.nameDots);
  assert.equal(nameProblem('..', {}), DEFAULT_TREE_LABELS.nameDots);
  assert.equal(nameProblem('a/b', {}), 'Use a name without a slash.');
  assert.equal(nameProblem('a\\b', {}), 'Use a name without a slash.');
  assert.equal(nameProblem('a\u0007b', {}), 'Use visible characters only.');
  assert.equal(nameProblem('refund', { siblings: sib }), 'refund is already here.');
  assert.equal(nameProblem('Refund', { siblings: sib }), 'refund is already here.', 'names that differ only in case clash');
  assert.equal(nameProblem('late-fee', { siblings: sib }), '');
  assert.equal(nameProblem('  spaced  ', { siblings: sib }), '', 'the ends are trimmed');
  assert.equal(nameProblem('.env', {}), '', 'a leading dot is a name');
});

test('the host’s rule runs after the defaults, and the words are the host’s to change', () => {
  const seen = [];
  const validate = (name, dir, kind) => { seen.push([name, dir, kind]); return name.endsWith('.tmp') ? 'Temporary files are not kept.' : ''; };
  assert.equal(nameProblem('x.tmp', { kind: 'file', dir: 'tasks', validate }), 'Temporary files are not kept.');
  assert.equal(nameProblem('', { kind: 'file', dir: 'tasks', validate }), 'Type a file name.');
  assert.equal(nameProblem('a/b', { kind: 'file', dir: 'tasks', validate }), 'Use a name without a slash.');
  assert.deepEqual(seen, [['x.tmp', 'tasks', 'file']], 'never asked about a name the defaults refuse');
  assert.equal(nameProblem('', { kind: 'file', labels: { nameEmpty: 'Type a snippet name.' } }), 'Type a snippet name.');
  assert.equal(nameProblem('a', { siblings: ['a'], labels: { nameTaken: (n) => `There is already a snippet called ${n}.` } }),
    'There is already a snippet called a.');
});

test('a move never goes into itself or a folder inside it, nor where it already is', () => {
  const t = buildFileTree([...ENTRIES, { path: 'common/refund', kind: 'file' }]);
  assert.equal(canMove(t, 'tasks', 'tasks'), false, 'into itself');
  assert.equal(canMove(t, 'tasks', 'tasks/billing'), false, 'into a folder inside it');
  assert.equal(canMove(t, 'tasks/billing', 'tasks'), false, 'where it already is');
  assert.equal(canMove(t, 'README', ''), false, 'already at the top');
  assert.equal(canMove(t, 'tasks/refund', 'common'), false, 'common already has a refund');
  assert.equal(canMove(t, 'tasks/refund', 'README'), false, 'a file is not a folder');
  assert.equal(canMove(t, 'tasks/refund', 'nowhere'), false);
  assert.equal(canMove(t, 'missing', 'tasks'), false);
  assert.equal(canMove(t, 'tasks/billing', ''), true, 'a folder up to the top');
  assert.equal(canMove(t, 'common', 'tasks/billing'), true, 'a folder into a folder beside it');
  assert.equal(canMove(t, 'README', 'drafts'), true, 'a file into an empty folder');
});

test('path helpers', () => {
  assert.equal(parentOf('a/b/c'), 'a/b');
  assert.equal(parentOf('a'), '');
  assert.equal(movedPath('tasks/billing/late-fee', 'tasks', 'work'), 'work/billing/late-fee');
  assert.equal(movedPath('tasksx/a', 'tasks', 'work'), 'tasksx/a', 'only what is inside the folder moves');
  assert.deepEqual(splitExt('report.final.md'), ['report.final', '.md']);
  assert.deepEqual(splitExt('.env'), ['.env', '']);
  assert.deepEqual(splitExt('Makefile'), ['Makefile', '']);
  assert.equal(DEFAULT_TREE_LABELS.confirmFolder('tasks', 3), 'Delete tasks and the 3 files in it?');
  assert.equal(DEFAULT_TREE_LABELS.confirmFolder('tasks', 1), 'Delete tasks and the file in it?');
  assert.equal(DEFAULT_TREE_LABELS.confirmFolder('drafts', 0), 'Delete drafts?');
});
