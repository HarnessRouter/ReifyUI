// A page to look at FileTree on: a snippets explorer beside the open snippet, the way the console
// lays its skill editor out. Built from dist (npm run build first): node demo/tree/build.mjs, then
// open demo/tree/index.html. ?theme=dark for the dark theme.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FileTree, joinPath, baseName, isWithin, movedPath } from '../../dist/tree.js';

const TEXT = {
  'tasks/refund': `When the customer asks for a refund:
{{- if .CanIssueRefunds}}
- Check the order is less than 30 days old.
- Refund up to {{.RefundLimit}} without asking a person.
{{- else}}
- Say a person will review it within one business day.
{{- end}}
- Never promise a date you can't keep.`,
};

const START = [
  { path: 'common/tone', kind: 'file' },
  { path: 'common/signoff', kind: 'file' },
  { path: 'tasks/product-question', kind: 'file' },
  { path: 'tasks/refund', kind: 'file' },
  { path: 'replies/out-of-office-while-the-whole-team-is-away.md', kind: 'file' },
];

window.__log = [];
const log = (e) => { window.__log.push(e); };

function Demo() {
  const [entries, setEntries] = useState(START);
  const [sel, setSel] = useState('tasks/refund');
  const isFile = entries.some((e) => e.path === sel && e.kind === 'file');
  const text = TEXT[sel] ?? (isFile ? '' : null);
  return (
    <div className="plate">
      <div className="tree-pane">
        <FileTree
          entries={entries} selected={sel} title="Snippets"
          labels={{ newFile: 'New snippet', newFileInput: 'Name of the new snippet', empty: 'No snippets yet.',
            nameEmpty: (k) => (k === 'dir' ? 'Type a folder name.' : 'Type a snippet name.') }}
          onSelect={(p, kind) => { log({ select: p, kind }); if (kind === 'file') setSel(p); }}
          onCreate={({ path, kind }) => { log({ create: path, kind }); setEntries((x) => [...x, { path, kind }]); if (kind === 'file') setSel(path); }}
          onRename={({ from, to, kind }) => {
            log({ rename: from, to, kind });
            setEntries((x) => x.map((e) => ({ ...e, path: kind === 'dir' ? movedPath(e.path, from, to) : (e.path === from ? to : e.path) })));
            setSel((s) => (kind === 'dir' ? movedPath(s, from, to) : s === from ? to : s));
          }}
          onDelete={({ path, kind }) => { log({ del: path, kind }); setEntries((x) => x.filter((e) => !(kind === 'dir' ? isWithin(e.path, path) : e.path === path))); }}
          onMove={({ from, toDir, kind }) => {
            const to = joinPath(toDir, baseName(from));
            log({ move: from, toDir, kind });
            setEntries((x) => x.map((e) => ({ ...e, path: kind === 'dir' ? movedPath(e.path, from, to) : (e.path === from ? to : e.path) })));
            setSel((s) => (kind === 'dir' ? movedPath(s, from, to) : s === from ? to : s));
          }}
          onUpload={(dir) => log({ upload: dir })}
          menuItems={[{ id: 'include', label: 'Copy include line', when: (p, k) => k === 'file', onSelect: (p) => log({ include: p }) }]}
        />
      </div>
      <div className="editor">
        <div className="editor-top">
          <span className="editor-path">{isFile ? sel : ''}</span>
          {isFile ? <button type="button" className="save">Save</button> : null}
        </div>
        <div className="editor-body">
          {text === null ? <p className="editor-none">Open a snippet to edit it.</p>
            : (text || ' ').split('\n').map((l, i) => <div key={i} className="ln"><span>{i + 1}</span><code>{l || ' '}</code></div>)}
        </div>
      </div>
    </div>
  );
}

const theme = new URLSearchParams(location.search).get('theme') === 'dark' ? 'uic-dark' : 'uic-light';
document.documentElement.className = theme;
createRoot(document.getElementById('root')).render(<Demo />);
