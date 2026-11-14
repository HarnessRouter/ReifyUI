// FileTree as a reader and a screen reader get it, rendered to markup (react-dom/server).
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { FileTree } from '../src/tree/index.js';
import * as root from '../src/index.js';

const ENTRIES = [
  { path: 'common/tone', kind: 'file' },
  { path: 'common/signoff', kind: 'file' },
  { path: 'tasks/product-question', kind: 'file' },
  { path: 'tasks/refund', kind: 'file' },
  { path: 'drafts', kind: 'dir' },
];
const all = { onCreate() {}, onRename() {}, onDelete() {}, onMove() {}, onUpload() {} };
const html = (el) => renderToStaticMarkup(el);
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const count = (h, re) => (h.match(new RegExp(re.source, 'g')) || []).length;
const items = (h) => Array.from(h.matchAll(/<li ([^>]*role="treeitem"[^>]*)>/g)).map((m) => m[1]);
const attr = (s, name) => (s.match(new RegExp(`${name}="([^"]*)"`)) || [])[1];

test('roles and levels: a tree of treeitems, open folders as groups', () => {
  const h = html(<FileTree entries={ENTRIES} title="Snippets" selected="tasks/refund" {...all} />);
  assert.match(h, /<ul role="tree"[^>]*aria-label="Snippets"/);
  assert.equal(count(h, /role="group"/), 2, 'common and tasks are open by default; drafts is empty');
  const li = items(h);
  assert.deepEqual(li.map((s) => attr(s, 'data-path')),
    ['common', 'common/signoff', 'common/tone', 'drafts', 'tasks', 'tasks/product-question', 'tasks/refund']);
  const by = Object.fromEntries(li.map((s) => [attr(s, 'data-path'), s]));
  assert.equal(attr(by.common, 'aria-level'), '1');
  assert.equal(attr(by['common/tone'], 'aria-level'), '2');
  assert.equal(attr(by.common, 'aria-expanded'), 'true');
  assert.equal(attr(by['common/tone'], 'aria-expanded'), undefined, 'a file is not expandable');
  assert.equal(attr(by['tasks/refund'], 'aria-selected'), 'true');
  assert.equal(attr(by['tasks/product-question'], 'aria-selected'), 'false');
  // one tab stop, on the selected row
  assert.equal(li.filter((s) => attr(s, 'tabindex') === '0').length, 1);
  assert.equal(attr(by['tasks/refund'], 'tabindex'), '0');
  assert.match(h, /class="rui-tree-row is-selected"/);
  assert.match(text(h), /drafts empty/, 'an empty folder says so');
});

test('closed folders: defaultOpen lists them, and the open prop controls them', () => {
  const closed = html(<FileTree entries={ENTRIES} defaultOpen={[]} />);
  assert.equal(count(closed, /role="group"/), 0);
  assert.deepEqual(items(closed).map((s) => attr(s, 'aria-expanded')), ['false', 'false', 'false']);
  assert.equal(attr(items(closed)[0], 'tabindex'), '0', 'with nothing selected the first row holds the tab stop');
  const ctl = html(<FileTree entries={ENTRIES} open={['tasks']} onOpenChange={() => {}} />);
  assert.deepEqual(items(ctl).map((s) => attr(s, 'data-path')), ['common', 'drafts', 'tasks', 'tasks/product-question', 'tasks/refund']);
});

test('the header: the title and the tree’s own actions beside it, each named', () => {
  const h = html(<FileTree entries={ENTRIES} title="Snippets" {...all} />);
  const head = h.match(/<div class="rui-tree-head">([\s\S]*?)<div class="rui-tree-body/)[1];
  assert.match(head, /<span class="rui-tree-title">Snippets<\/span>/);
  assert.deepEqual(Array.from(head.matchAll(/aria-label="([^"]+)"/g)).map((m) => m[1]), ['New file', 'New folder', 'Upload files', 'Collapse all']);
  // only what the host can do is offered
  const some = html(<FileTree entries={ENTRIES} title="Files" onCreate={() => {}} />);
  assert.deepEqual(Array.from(some.matchAll(/class="rui-tree-tool"[^>]*aria-label="([^"]+)"/g)).map((m) => m[1]), ['New file', 'New folder', 'Collapse all']);
  const chosen = html(<FileTree entries={ENTRIES} title="Files" actions={['newFile']} {...all} />);
  assert.deepEqual(Array.from(chosen.matchAll(/class="rui-tree-tool"[^>]*aria-label="([^"]+)"/g)).map((m) => m[1]), ['New file']);
});

test('every word can be the host’s: New snippet, not New file', () => {
  const h = html(<FileTree entries={ENTRIES} title="Snippets" {...all}
    labels={{ newFile: 'New snippet', upload: 'Upload snippets', empty: 'No snippets yet.' }} />);
  assert.match(h, /aria-label="New snippet"/);
  assert.match(h, /aria-label="Upload snippets"/);
  assert.doesNotMatch(h, /New file/);
  const none = html(<FileTree entries={[]} title="Snippets" labels={{ empty: 'No snippets yet.' }} {...all} />);
  assert.match(text(none), /No snippets yet\./);
  assert.doesNotMatch(none, /role="tree"/, 'no empty tree for a screen reader to land in');
});

test('rows that can change carry Rename and Delete; a read-only tree has no actions at all', () => {
  const h = html(<FileTree entries={ENTRIES} selected="tasks/refund" {...all} />);
  assert.equal(count(h, /class="rui-tree-acts"/), 7);
  assert.match(h, /title="Rename"/);
  assert.match(h, /title="Delete"/);
  assert.match(h, /draggable="true"/);

  const ro = html(<FileTree entries={ENTRIES} title="Files" selected="tasks/refund" readOnly {...all} />);
  assert.equal(count(ro, /class="rui-tree-acts"/), 0);
  assert.doesNotMatch(ro, /Rename|Delete|New file|New folder|Upload/);
  assert.doesNotMatch(ro, /draggable/);
  assert.deepEqual(Array.from(ro.matchAll(/class="rui-tree-tool"[^>]*aria-label="([^"]+)"/g)).map((m) => m[1]), ['Collapse all'],
    'Collapse all changes only the view, so a read-only tree keeps it');
  assert.match(ro, /role="tree"/);
});

test('busy, pending and errors the host passes', () => {
  const loading = html(<FileTree entries={[]} title="Snippets" busy {...all} />);
  assert.match(loading, /class="rui-tree-skel" role="status"/);
  assert.match(text(loading), /Loading/);
  assert.doesNotMatch(text(loading), /No files yet/);
  assert.match(loading, /class="rui-tree-tool" aria-label="New file" title="New file" disabled=""/, 'a change waits while busy');

  const h = html(<FileTree entries={ENTRIES} {...all} pending={['tasks/refund']}
    rowErrors={{ 'common/tone': 'This snippet is used by 2 tasks.' }} error="The list could not be loaded." />);
  const by = Object.fromEntries(items(h).map((s) => [attr(s, 'data-path'), s]));
  assert.equal(attr(by['tasks/refund'], 'aria-busy'), 'true');
  assert.match(h, /rui-tree-row is-pending/);
  assert.match(text(h), /Saving/);
  const desc = attr(by['common/tone'], 'aria-describedby');
  assert.ok(desc, 'a row’s message describes the row');
  assert.match(h, new RegExp(`<p class="rui-tree-msg is-error" id="${desc}"[^>]*>This snippet is used by 2 tasks\\.</p>`));
  assert.match(h, /role="alert">The list could not be loaded\.<\/p>/);
});

test('long names keep their extension and their full path in a title', () => {
  const long = 'a-very-long-snippet-name-that-will-not-fit-at-phone-width.md';
  const h = html(<FileTree entries={[{ path: `tasks/${long}`, kind: 'file' }]} />);
  assert.match(h, new RegExp(`title="tasks/${long.replace(/\./g, '\\.')}"`));
  assert.match(h, /<span class="rui-tree-base">a-very-long-snippet-name-that-will-not-fit-at-phone-width<\/span><span class="rui-tree-ext">\.md<\/span>/);
});

test('the tree is its own entry: the root index does not carry it', () => {
  assert.equal(root.FileTree, undefined);
});
