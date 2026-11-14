// FileTree — a folder tree of files the way an editor's Explorer shows one: folders first, a
// chevron to open each, the open file marked, and the tree's own actions (new file, new folder,
// upload, collapse all) in its header beside its title. Names are typed in place (New file, New
// folder, Rename), a delete asks in the row, a row drags into another folder, and a right click,
// Shift+F10 or the menu key opens the row's menu. The keyboard follows the WAI-ARIA tree pattern.
//
// The tree owns no files: it draws `entries` and reports what the person did (onCreate, onRename,
// onDelete, onMove, onUpload); the host changes its list and passes it back. A handler may return
// a message (or a Promise of one) to refuse, and that message is shown where the person acted.
//
// Look and behaviour follow the HarnessRouter console's skill-editor tree (30px rows, 14px icons,
// 14px per level, the open file on the surface colour with a hairline, row actions at the right on
// hover). Styles: reifyui/styles/tree.css.
import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DEFAULT_TREE_LABELS, baseName, buildFileTree, canMove, folderPaths, isWithin, joinPath, movedPath,
  nameProblem, parentOf, splitExt, treeKeyAction, visibleRows,
} from './model.js';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const DRAG_TYPE = 'application/x-reifyui-tree-path';
const OPEN_ON_HOVER_MS = 600;         // a closed folder held under a drag opens after this
const FOCUS_WAIT_MS = 4000;           // how long a focus waits for its row to arrive from the host
const HEADER_ACTIONS = ['newFile', 'newFolder', 'upload', 'collapseAll'];
// the resolved colours a menu carries with it into document.body, where the host's theme class
// (set on some ancestor of the tree) no longer reaches
const MENU_VARS = ['--_surface', '--_ink', '--_mute', '--_faint', '--_line', '--_brand', '--_hover', '--_fail', '--_shadow',
  '--_r-menu', '--_r-row', '--_z', '--_fs-md'];

const say = (v, ...a) => (typeof v === 'function' ? v(...a) : v);

function Svg({ s = 14, children }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
  );
}
const I = {
  file: <Svg><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></Svg>,
  folder: <Svg><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Svg>,
  chevron: <Svg s={12}><path d="M9 6l6 6-6 6" /></Svg>,
  newFile: <Svg><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M12 11v6M9 14h6" /></Svg>,
  newFolder: <Svg><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M12 10.5v5M9.5 13h5" /></Svg>,
  upload: <Svg><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></Svg>,
  collapseAll: <Svg><path d="M7 10l5-5 5 5M7 19l5-5 5 5" /></Svg>,
  pencil: <Svg><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></Svg>,
  trash: <Svg><path d="M4 7h16M9 7V4.5h6V7M18 7l-1 13H7L6 7M10 11v5M14 11v5" /></Svg>,
};

/** A handler's answer as a message: '' when it went through, the host's words when it refused,
 *  the generic failure when it threw. */
async function answer(fn, failed) {
  try { const r = await fn(); return typeof r === 'string' ? r : ''; }
  catch { return failed; }
}

/** A name cut at the end, its extension kept whole. */
function Name({ name }) {
  const [base, ext] = splitExt(name);
  return <span className="rui-tree-name"><span className="rui-tree-base">{base}</span>{ext ? <span className="rui-tree-ext">{ext}</span> : null}</span>;
}

/** The row's menu: fixed at the pointer (or under the row from the keyboard), kept inside the
 *  window, closed by Escape, a press outside, a scroll, or a choice. */
function TreeMenu({ menu, items, label, tokensFrom, onClose, menuRef }) {
  const [pos, setPos] = useState(null);
  const btns = useRef([]);
  const style = useMemo(() => {
    const s = {};
    const src = tokensFrom.current;
    if (src && typeof getComputedStyle === 'function') {
      const cs = getComputedStyle(src);
      for (const v of MENU_VARS) { const val = cs.getPropertyValue(v); if (val) s[v] = val.trim(); }
      s.fontFamily = cs.fontFamily;
    }
    return s;
  }, [tokensFrom, menu]);

  useIsoLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight, m = 8;
    const left = Math.max(m, Math.min(menu.x, vw - r.width - m));
    const top = menu.y + r.height > vh - m ? Math.max(m, menu.y - r.height) : menu.y;
    setPos({ left, top });
  }, [menu]);
  useEffect(() => { if (pos) btns.current.find((b) => b && !b.disabled)?.focus(); }, [pos]);

  useEffect(() => {
    const down = (e) => { if (!menuRef.current?.contains(e.target)) onClose(false); };
    const scroll = (e) => { if (!menuRef.current?.contains(e.target)) onClose(false); };
    const resize = () => onClose(false);
    document.addEventListener('pointerdown', down, true);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
    };
  }, [onClose, menuRef]);

  const onKeyDown = (e) => {
    const list = btns.current.filter((b) => b && !b.disabled);
    const at = list.indexOf(document.activeElement);
    const go = (i) => { e.preventDefault(); list[(i + list.length) % list.length]?.focus(); };
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at < 0 ? list.length - 1 : at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
    else if (e.key === 'Tab' || e.key === 'Escape') { e.preventDefault(); onClose(true); }
  };

  btns.current = [];
  let k = 0;
  return createPortal(
    <div ref={menuRef} className="rui-tree-menu" role="menu" aria-label={label} onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ ...style, left: pos ? pos.left : menu.x, top: pos ? pos.top : menu.y, visibility: pos ? 'visible' : 'hidden' }}>
      {items.map((it, i) => (it.sep ? <div key={`s${i}`} className="rui-tree-menu-sep" role="separator" /> : (
        <button key={it.id} type="button" role="menuitem" tabIndex={-1} ref={(el) => { btns.current[k++] = el; }}
          className={`rui-tree-menu-item${it.danger ? ' is-danger' : ''}`} disabled={it.disabled}
          aria-keyshortcuts={it.keys || undefined}
          onClick={() => { onClose(false); it.run(); }}>
          <span className="rui-tree-menu-label">{it.label}</span>
          {it.hint ? <kbd className="rui-tree-menu-hint" aria-hidden="true">{it.hint}</kbd> : null}
        </button>
      )))}
    </div>,
    document.body,
  );
}

export function FileTree(props) {
  const {
    entries, selected = null, onSelect,
    open: openProp, defaultOpen = true, onOpenChange,
    title, label, actions, labels: labelsProp,
    onCreate, onRename, onDelete, onMove, onUpload, validateName, menuItems,
    readOnly = false, busy = false, pending, rowErrors, error,
    className, style,
  } = props;
  const L = useMemo(() => ({ ...DEFAULT_TREE_LABELS, ...(labelsProp || {}) }), [labelsProp]);
  const uid = useId().replace(/:/g, '');
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);
  const askRef = useRef(null);

  const tree = useMemo(() => buildFileTree(entries), [entries]);
  const editable = !readOnly;

  // ── open folders: controlled (open + onOpenChange) or kept here ────────────────────────────────
  // Kept here as "everything open except" (defaultOpen true: folders that arrive later start open)
  // or "only these open" (a list, or after Collapse all).
  const controlled = Array.isArray(openProp);
  const [kept, setKept] = useState(() => (defaultOpen === true
    ? { all: true, set: new Set() } : { all: false, set: new Set(Array.isArray(defaultOpen) ? defaultOpen : []) }));
  // the latest open state, read by changes made one after another in the same event (a move both
  // carries a folder's open state to its new path and opens the folder it landed in)
  const keptRef = useRef(kept);
  const ctlRef = useRef(openProp);
  if (controlled) ctlRef.current = openProp;
  const openSet = useMemo(() => (controlled ? new Set(openProp) : null), [controlled, openProp]);
  const isOpen = useCallback((p) => (controlled ? openSet.has(p) : kept.all ? !kept.set.has(p) : kept.set.has(p)),
    [controlled, openSet, kept]);
  const readOpen = () => (controlled ? { all: false, set: new Set(ctlRef.current || []) } : keptRef.current);
  const writeOpen = (next) => {
    if (controlled) { const list = Array.from(next.set); ctlRef.current = list; onOpenChange?.(list); return; }
    keptRef.current = next;
    setKept(next);
    onOpenChange?.(next.all ? folderPaths(tree).filter((p) => !next.set.has(p)) : Array.from(next.set));
  };
  const setOpen = (paths, value) => {
    const cur = readOpen();
    const set = new Set(cur.set);
    let changed = false;
    for (const p of paths) {
      if (!p) continue;
      const inSet = cur.all ? !value : value;
      if (set.has(p) !== inSet) { if (inSet) set.add(p); else set.delete(p); changed = true; }
    }
    if (changed) writeOpen({ all: cur.all, set });
  };
  const remapOpen = (from, to) => {
    const cur = readOpen();
    if (!Array.from(cur.set).some((p) => isWithin(p, from))) return;
    writeOpen({ all: cur.all, set: new Set(Array.from(cur.set).map((p) => movedPath(p, from, to))) });
  };
  const collapseAll = () => {
    writeOpen({ all: false, set: new Set() });
    if (active) setActive(active.split('/')[0]);
  };

  const rows = useMemo(() => visibleRows(tree.nodes, isOpen), [tree, isOpen]);

  // ── focus: one row holds the tab stop; `active` is the last row the person was on ──────────────
  // null: not yet on any row; '': the top (an empty part of the tree was clicked).
  const [active, setActive] = useState(null);
  const pendingFocus = useRef(null);
  const focusSoon = (path) => { pendingFocus.current = { path, at: Date.now() }; setActive(path); };
  const tabPath = useMemo(() => {
    const has = (p) => rows.some((r) => r.path === p);
    for (let p = active; p; p = parentOf(p)) if (has(p)) return p;
    if (selected && has(selected)) return selected;
    return rows[0]?.path ?? null;
  }, [rows, active, selected]);
  const tabPathRef = useRef(tabPath);
  tabPathRef.current = tabPath;
  useEffect(() => {
    const want = pendingFocus.current;
    if (!want) return;
    if (Date.now() - want.at > FOCUS_WAIT_MS) { pendingFocus.current = null; return; }
    const root = rootRef.current;
    if (!root) return;
    const here = document.activeElement;
    if (here && here !== document.body && !root.contains(here)) { pendingFocus.current = null; return; }
    const el = Array.from(root.querySelectorAll('[role="treeitem"][data-path]')).find((x) => x.dataset.path === want.path);
    if (el) { pendingFocus.current = null; el.focus(); }
  });
  // the selected file is never hidden in a closed folder: its folders open when it changes
  useEffect(() => {
    if (!selected) return;
    const up = [];
    for (let p = parentOf(selected); p; p = parentOf(p)) if (tree.byPath.get(p)?.kind === 'dir' && !isOpen(p)) up.push(p);
    if (up.length) setOpen(up, true);
  // when the selection changes, not when a folder is closed around it
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // ── transient states: a name being typed, a delete being asked, a menu ─────────────────────────
  const [edit, setEditState] = useState(null);   // { mode: 'create', kind, dir, value, err, busy } | { mode: 'rename', path, kind, ... }
  const editRef = useRef(null);
  const setEdit = (x) => { editRef.current = x; setEditState(x); };
  const returnTo = useRef(null);
  const [ask, setAsk] = useState(null);          // { path, kind, files, busy }
  const [menu, setMenu] = useState(null);        // { path, kind, x, y }
  const [notes, setNotes] = useState({});        // a refused delete or move, under its row
  const note = (path, msg) => setNotes((n) => { const x = { ...n }; if (msg) x[path] = msg; else delete x[path]; return x; });

  const nodeKind = (p) => tree.byPath.get(p)?.kind;
  // the nearest folder that still exists (the host may have removed the one last used)
  const existingDir = (d) => { let x = d || ''; while (x && nodeKind(x) !== 'dir') x = parentOf(x); return x; };
  const targetDir = () => {
    const from = active !== null ? active : selected;
    if (!from) return '';
    return existingDir(nodeKind(from) === 'dir' ? from : parentOf(from));
  };
  const childNames = (dir) => (tree.byPath.get(dir)?.children || []).map((c) => c.name);
  const hold = busy;

  // a name the host is still answering for stays until it answers
  function dropEdit() { if (!editRef.current?.busy) setEdit(null); }
  function closeAll() { dropEdit(); setAsk(null); setMenu(null); }

  function startCreate(kind, dir) {
    if (!editable || !onCreate || hold || editRef.current?.busy) return;
    setAsk(null); setMenu(null);
    returnTo.current = typeof document !== 'undefined' ? document.activeElement : null;
    dir = existingDir(dir);
    if (dir) setOpen([...ancestorsOf(dir), dir], true);
    setEdit({ mode: 'create', kind, dir, value: '', err: '', busy: false });
  }
  function startRename(path) {
    if (!editable || !onRename || hold || editRef.current?.busy || !tree.byPath.has(path)) return;
    setAsk(null); setMenu(null);
    setEdit({ mode: 'rename', path, kind: nodeKind(path), value: baseName(path), err: '', busy: false });
    setActive(path);
  }
  function askDelete(path) {
    if (!editable || !onDelete || hold) return;
    const n = tree.byPath.get(path);
    if (!n) return;
    dropEdit(); setMenu(null);
    setAsk({ path, kind: n.kind, files: n.files, busy: false });
    setActive(path);
  }

  async function commitEdit(fromBlur) {
    const ed = editRef.current;
    if (!ed || ed.busy) return;
    const value = ed.value.trim();
    const same = ed.mode === 'rename' && value === baseName(ed.path);
    if (same || (fromBlur && !value)) {
      setEdit(null);
      if (!fromBlur) { if (ed.mode === 'rename') focusSoon(ed.path); else restoreFocus(); }
      return;
    }
    const dir = ed.mode === 'create' ? ed.dir : parentOf(ed.path);
    const siblings = childNames(dir).filter((n) => ed.mode !== 'rename' || n !== baseName(ed.path));
    const err = nameProblem(value, { kind: ed.kind, dir, siblings, labels: L, validate: validateName });
    if (err) { setEdit({ ...ed, err }); return; }
    const to = joinPath(dir, value);
    const going = { ...ed, err: '', busy: true };
    setEdit(going);
    const refused = await answer(() => (ed.mode === 'create'
      ? onCreate({ path: to, kind: ed.kind }) : onRename({ from: ed.path, to, kind: ed.kind })), L.failed);
    if (editRef.current !== going) return;          // put away while the host was answering
    if (refused) { setEdit({ ...going, busy: false, err: refused }); return; }
    setEdit(null);
    if (ed.mode === 'rename' && ed.kind === 'dir') remapOpen(ed.path, to);
    if (ed.mode === 'create' && ed.kind === 'dir') setOpen([to], true);
    if (fromBlur) setActive(to); else focusSoon(to);
  }

  async function confirmDelete() {
    const a = ask;
    if (!a || a.busy) return;
    const i = rows.findIndex((r) => r.path === a.path);
    const after = rows.slice(i + 1).find((r) => !isWithin(r.path, a.path));
    const next = after && parentOf(after.path) === parentOf(a.path) ? after.path : (rows[i - 1]?.path ?? after?.path ?? null);
    const going = { ...a, busy: true };
    setAsk(going);
    const refused = await answer(() => onDelete({ path: a.path, kind: a.kind }), L.failed);
    setAsk((cur) => (cur && cur.path === a.path ? null : cur));
    if (refused) { note(a.path, refused); focusSoon(a.path); return; }
    note(a.path, '');
    if (next !== null) focusSoon(next); else setActive(null);
  }

  async function doMove(from, kind, toDir) {
    const to = joinPath(toDir, baseName(from));
    note(from, '');
    const refused = await answer(() => onMove({ from, toDir, kind }), L.failed);
    if (refused) { note(from, refused); return; }
    if (kind === 'dir') remapOpen(from, to);
    if (toDir) setOpen([...ancestorsOf(toDir), toDir], true);
    setActive(to);
  }

  function restoreFocus() {
    const el = returnTo.current;
    returnTo.current = null;
    if (el && el.isConnected && rootRef.current?.contains(el)) el.focus();
    else if (tabPath) focusSoon(tabPath);
  }

  // Escape puts away the innermost thing, and only that: a dialog the tree sits in stays open
  // (taken on the way down, before a host's own Escape listener hears it).
  useEffect(() => {
    if (!edit && !ask && !menu) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const t = e.target;
      if (!(rootRef.current?.contains(t) || menuRef.current?.contains(t))) return;
      e.stopPropagation(); e.preventDefault();
      if (menu) { setMenu(null); focusSoon(menu.path || tabPath); return; }
      if (editRef.current) {
        const ed = editRef.current;
        if (ed.busy) return;
        setEdit(null);
        if (ed.mode === 'rename') focusSoon(ed.path); else restoreFocus();
        return;
      }
      if (ask) { setAsk(null); focusSoon(ask.path); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // a name being typed takes focus as it opens, the name selected without its extension
  useEffect(() => {
    const el = inputRef.current;
    if (!el || !edit) return;
    el.focus();
    const v = el.value;
    const dot = edit.mode === 'rename' && edit.kind === 'file' ? splitExt(v)[0].length : v.length;
    el.setSelectionRange(edit.mode === 'rename' ? 0 : v.length, dot);
  // when one opens, not on every keystroke
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit?.mode, edit?.path, edit?.dir, edit?.kind]);
  // a delete being asked: its Delete button takes focus, as the console's in-row confirms do
  useEffect(() => { if (ask && !ask.busy) askRef.current?.focus(); }, [ask?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── the menu ───────────────────────────────────────────────────────────────────────────────────
  const itemsFor = (path, kind) => {
    const at = kind === 'dir' ? path : parentOf(path);
    const groups = [[], [], []];
    if (onCreate) {
      groups[0].push({ id: 'new-file', label: L.newFile, run: () => startCreate('file', at) });
      groups[0].push({ id: 'new-folder', label: L.newFolder, run: () => startCreate('dir', at) });
    }
    if (path) {
      if (onRename) groups[1].push({ id: 'rename', label: L.rename, hint: L.renameKey, keys: 'F2', run: () => startRename(path) });
      for (const m of menuItems || []) {
        if (m.when && !m.when(path, kind)) continue;
        groups[1].push({ id: `x-${m.id}`, label: m.label, disabled: !!m.disabled, run: () => { focusSoon(path); m.onSelect(path, kind); } });
      }
      if (onDelete) groups[2].push({ id: 'delete', label: L.delete, hint: L.deleteKey, keys: 'Delete', danger: true, run: () => askDelete(path) });
    }
    const out = [];
    for (const g of groups) { if (!g.length) continue; if (out.length) out.push({ sep: true }); out.push(...g); }
    return out;
  };
  function openMenu(path, kind, x, y) {
    if (!editable || hold) return false;
    if (!itemsFor(path, kind).length) return false;
    dropEdit(); setAsk(null);
    setMenu({ path, kind, x, y });
    if (path) setActive(path);
    return true;
  }
  const menuNow = useRef(null);
  menuNow.current = menu;
  const closeMenu = useCallback((refocus) => {
    const m = menuNow.current;
    if (!m) return;
    if (refocus) pendingFocus.current = { path: m.path || tabPathRef.current, at: Date.now() };
    setMenu(null);
  }, []);
  function menuFromKeyboard(path) {
    const el = rowEl(path);
    const r = el ? el.getBoundingClientRect() : { left: 0, bottom: 0 };
    openMenu(path, nodeKind(path), Math.round(r.left + 24), Math.round(r.bottom));
  }
  const rowEl = (path) => Array.from(rootRef.current?.querySelectorAll('[data-row]') || []).find((x) => x.dataset.row === path);

  // ── keyboard on the tree ──────────────────────────────────────────────────────────────────────
  function onTreeKeyDown(e) {
    const t = e.target;
    if (t.closest('input, button, .rui-tree-ask')) return;
    const item = t.closest('[role="treeitem"]');
    if (!item || item.dataset.path === undefined) return;
    const act = treeKeyAction(rows, item.dataset.path, e, { editable });
    if (!act) return;
    e.preventDefault();
    switch (act.type) {
      case 'focus': focusSoon(act.path); break;
      case 'open': setOpen([act.path], true); break;
      case 'close': setOpen([act.path], false); break;
      case 'activate':
        closeAll();
        onSelect?.(act.path, act.kind);
        if (act.kind === 'dir') setOpen([act.path], !isOpen(act.path));
        break;
      case 'rename': startRename(act.path); break;
      case 'delete': askDelete(act.path); break;
      case 'menu': menuFromKeyboard(act.path); break;
      default: break;
    }
  }
  function onRowClick(r) {
    if (editRef.current?.mode === 'rename' && editRef.current.path === r.path) return;
    dropEdit(); setAsk(null);
    setActive(r.path);
    onSelect?.(r.path, r.kind);
    if (r.kind === 'dir') setOpen([r.path], !isOpen(r.path));
  }

  // ── drag a row into a folder ──────────────────────────────────────────────────────────────────
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const [dropDir, setDropDirState] = useState(null);
  const dropRef = useRef(null);
  const hoverTimer = useRef(null);
  const setDropDir = (d) => {
    if (dropRef.current === d) return;
    dropRef.current = d;
    setDropDirState(d);
    clearTimeout(hoverTimer.current);
    if (d && !isOpen(d)) hoverTimer.current = setTimeout(() => { if (dropRef.current === d) setOpen([d], true); }, OPEN_ON_HOVER_MS);
  };
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  const canDrag = editable && !!onMove && !hold;
  const overDir = (e, dir) => {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    if (canMove(tree, d.path, dir)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropDir(dir); }
    else { e.dataTransfer.dropEffect = 'none'; setDropDir(null); }
  };
  const dropOn = (e, dir) => {
    const d = dragRef.current;
    if (!d) return;
    e.preventDefault(); e.stopPropagation();
    dragRef.current = null; setDragging(null); setDropDir(null);
    if (canMove(tree, d.path, dir)) void doMove(d.path, d.kind, dir);
  };
  const endDrag = () => { dragRef.current = null; setDragging(null); setDropDir(null); };

  // ── what the header offers ────────────────────────────────────────────────────────────────────
  const wanted = Array.isArray(actions) ? actions : HEADER_ACTIONS;
  const offered = wanted.filter((a) => (a === 'collapseAll' ? true
    : !editable ? false : a === 'upload' ? !!onUpload : (a === 'newFile' || a === 'newFolder') ? !!onCreate : false));
  const headerAction = {
    newFile: { label: L.newFile, icon: I.newFile, run: () => startCreate('file', targetDir()), mutates: true },
    newFolder: { label: L.newFolder, icon: I.newFolder, run: () => startCreate('dir', targetDir()), mutates: true },
    upload: { label: L.upload, icon: I.upload, run: () => onUpload(targetDir()), mutates: true },
    collapseAll: { label: L.collapseAll, icon: I.collapseAll, run: collapseAll, mutates: false },
  };

  // ── rendering ─────────────────────────────────────────────────────────────────────────────────
  const pendingSet = useMemo(() => new Set(pending || []), [pending]);
  const errs = rowErrors || {};
  const depthStyle = (depth) => ({ '--rui-tree-d': depth });
  let msgN = 0;

  const entryRow = (dir, depth) => {
    const ed = edit;
    const errId = `${uid}-new-err`;
    return (
      <li key="__rui-tree-new" role="treeitem" aria-level={depth} aria-selected={false} className="rui-tree-item is-new"
        aria-label={ed.kind === 'dir' ? L.newFolderInput : L.newFileInput}>
        <div className="rui-tree-row is-editing" style={depthStyle(depth - 1)}>
          <span className="rui-tree-twisty" aria-hidden="true" />
          <span className="rui-tree-icon" aria-hidden="true">{ed.kind === 'dir' ? I.folder : I.file}</span>
          {nameInput(ed, ed.kind === 'dir' ? L.newFolderInput : L.newFileInput, errId)}
        </div>
        {ed.err ? <p className="rui-tree-msg is-error" id={errId} role="alert" style={depthStyle(depth - 1)}>{ed.err}</p> : null}
      </li>
    );
  };
  function nameInput(ed, aria, errId) {
    return (
      <input ref={inputRef} className="rui-tree-input" value={ed.value} aria-label={aria} autoComplete="off" spellCheck={false}
        readOnly={ed.busy} aria-busy={ed.busy || undefined} aria-invalid={!!ed.err} aria-describedby={ed.err ? errId : undefined}
        onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
        onChange={(e) => setEdit({ ...ed, value: e.target.value, err: '' })}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void commitEdit(false); } }}
        onBlur={() => { if (editRef.current) void commitEdit(true); }} />
    );
  }

  function renderNode(n) {
    const r = { path: n.path, kind: n.kind, depth: n.depth };
    const isDir = n.kind === 'dir';
    const open = isDir && isOpen(n.path);
    const renaming = edit && edit.mode === 'rename' && edit.path === n.path;
    const asking = ask && ask.path === n.path;
    const sel = selected === n.path;
    const busyRow = pendingSet.has(n.path);
    const msg = errs[n.path] || notes[n.path] || '';
    const msgId = msg ? `${uid}-m${msgN++}` : undefined;
    const errId = `${uid}-ren-err`;
    const creatingHere = edit && edit.mode === 'create' && isDir && edit.dir === n.path;
    const kids = open ? n.children : [];
    const cls = ['rui-tree-row', sel ? 'is-selected' : '', isDir && active === n.path ? 'is-target' : '',
      menu && menu.path === n.path ? 'is-menu' : '', busyRow ? 'is-pending' : '', renaming ? 'is-editing' : '',
      dragging === n.path ? 'is-dragging' : ''].filter(Boolean).join(' ');
    const showActs = editable && !renaming && !busyRow && (onRename || onDelete);
    return (
      <li key={n.path} role="treeitem" data-path={n.path} aria-level={n.depth} aria-expanded={isDir ? open : undefined}
        aria-selected={sel} aria-busy={busyRow || undefined} aria-describedby={msgId}
        tabIndex={tabPath === n.path ? 0 : -1}
        className={`rui-tree-item${dropDir === n.path ? ' is-drop' : ''}`}>
        <div className={cls} data-row={n.path} style={depthStyle(n.depth - 1)} title={n.path}
          draggable={canDrag && !renaming ? true : undefined}
          onClick={() => onRowClick(r)}
          onContextMenu={(e) => { if (openMenu(n.path, n.kind, e.clientX, e.clientY)) e.preventDefault(); e.stopPropagation(); }}
          onDragStart={canDrag ? (e) => {
            closeAll();
            dragRef.current = { path: n.path, kind: n.kind };
            setDragging(n.path);
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData(DRAG_TYPE, n.path); e.dataTransfer.setData('text/plain', n.path); } catch { /* old engines */ }
          } : undefined}
          onDragEnd={canDrag ? endDrag : undefined}
          onDragEnter={(e) => overDir(e, isDir ? n.path : parentOf(n.path))}
          onDragOver={(e) => overDir(e, isDir ? n.path : parentOf(n.path))}
          onDrop={(e) => dropOn(e, isDir ? n.path : parentOf(n.path))}>
          <span className={`rui-tree-twisty${open ? ' is-open' : ''}`} aria-hidden="true">{isDir ? I.chevron : null}</span>
          <span className="rui-tree-icon" aria-hidden="true">{isDir ? I.folder : I.file}</span>
          {renaming ? nameInput(edit, say(L.renameInput, n.name), errId) : <Name name={n.name} />}
          {!renaming && n.note ? <span className="rui-tree-note">{n.note}</span> : null}
          {!renaming && isDir && !n.children.length ? <span className="rui-tree-tag">{L.emptyFolder}</span> : null}
          {busyRow ? <span className="rui-tree-spin" role="status"><span className="rui-tree-sr">{L.saving}</span></span> : null}
          {showActs ? (
            <span className="rui-tree-acts" aria-hidden="true">
              {onRename ? (
                <button type="button" className="rui-tree-ib" tabIndex={-1} title={L.rename} disabled={hold}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => { e.stopPropagation(); startRename(n.path); }}>{I.pencil}</button>
              ) : null}
              {onDelete ? (
                <button type="button" className="rui-tree-ib" tabIndex={-1} title={L.delete} disabled={hold}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => { e.stopPropagation(); askDelete(n.path); }}>{I.trash}</button>
              ) : null}
            </span>
          ) : null}
        </div>
        {renaming && edit.err ? <p className="rui-tree-msg is-error" id={errId} role="alert" style={depthStyle(n.depth - 1)}>{edit.err}</p> : null}
        {msg ? <p className="rui-tree-msg is-error" id={msgId} style={depthStyle(n.depth - 1)}>{msg}</p> : null}
        {asking ? (
          <div className="rui-tree-ask" role="group" aria-label={isDir ? say(L.confirmFolder, n.name, n.files) : say(L.confirmFile, n.name)}
            style={depthStyle(n.depth - 1)}>
            <span className="rui-tree-ask-q">{isDir ? say(L.confirmFolder, n.name, n.files) : say(L.confirmFile, n.name)}</span>
            <span className="rui-tree-ask-b">
              <button type="button" className="rui-tree-link" disabled={ask.busy} onClick={() => { setAsk(null); focusSoon(n.path); }}>{L.keep}</button>
              <button type="button" className="rui-tree-link is-danger" ref={askRef} disabled={ask.busy} onClick={() => void confirmDelete()}>{L.delete}</button>
            </span>
          </div>
        ) : null}
        {(open && kids.length) || creatingHere ? (
          <ul role="group" className="rui-tree-group">
            {kids.map(renderNode)}
            {creatingHere ? entryRow(n.path, n.depth + 1) : null}
          </ul>
        ) : null}
      </li>
    );
  }

  const empty = !tree.nodes.length;
  const creatingAtTop = edit && edit.mode === 'create' && edit.dir === '';
  const treeLabel = label || title || L.tree;
  const rootClass = ['rui-tree', readOnly ? 'is-readonly' : '', className || ''].filter(Boolean).join(' ');

  return (
    <div ref={rootRef} className={rootClass} style={style}>
      {title || offered.length ? (
        <div className="rui-tree-head">
          {title ? <span className="rui-tree-title">{title}</span> : <span className="rui-tree-title" />}
          {offered.length ? (
            <span className="rui-tree-tools">
              {offered.map((a) => (
                <button key={a} type="button" className="rui-tree-tool" aria-label={headerAction[a].label} title={headerAction[a].label}
                  disabled={headerAction[a].mutates && hold} onClick={headerAction[a].run}>{headerAction[a].icon}</button>
              ))}
            </span>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="rui-tree-msg is-error is-tree" role="alert">{error}</p> : null}
      <div className={`rui-tree-body${dropDir === '' ? ' is-drop' : ''}`}
        onClick={(e) => { if (e.target === e.currentTarget || e.target.classList?.contains('rui-tree-list')) { dropEdit(); setAsk(null); setActive(''); } }}
        onContextMenu={(e) => { if (e.target.closest('[data-row]')) return; if (openMenu('', 'dir', e.clientX, e.clientY)) e.preventDefault(); }}
        onDragEnter={(e) => overDir(e, '')} onDragOver={(e) => overDir(e, '')} onDrop={(e) => dropOn(e, '')}
        onDragLeave={(e) => {
          // Chrome often gives a drag's leave no relatedTarget, even between two rows: where the
          // pointer is says whether it left the tree
          const b = e.currentTarget.getBoundingClientRect();
          const out = e.relatedTarget ? !e.currentTarget.contains(e.relatedTarget)
            : e.clientX < b.left || e.clientX >= b.right || e.clientY < b.top || e.clientY >= b.bottom;
          if (out) setDropDir(null);
        }}>
        {busy && empty ? (
          <div className="rui-tree-skel" role="status">
            <span className="rui-tree-sr">{L.loading}</span>
            {[64, 48, 56].map((w, i) => <span key={i} className="rui-tree-skel-line" style={{ width: `${w}%` }} aria-hidden="true" />)}
          </div>
        ) : null}
        {!busy && empty && !creatingAtTop ? <p className="rui-tree-empty">{L.empty}</p> : null}
        {!empty || creatingAtTop ? (
          <ul role="tree" className="rui-tree-list" aria-label={treeLabel} aria-busy={busy || undefined}
            onKeyDown={onTreeKeyDown}
            onFocus={(e) => { const p = e.target.getAttribute?.('data-path'); if (e.target.getAttribute?.('role') === 'treeitem' && p !== null && p !== active) setActive(p); }}>
            {tree.nodes.map(renderNode)}
            {creatingAtTop ? entryRow('', 1) : null}
          </ul>
        ) : null}
      </div>
      {menu && typeof document !== 'undefined' ? (
        <TreeMenu menu={menu} items={itemsFor(menu.path, menu.kind)} label={say(L.menu, menu.path ? baseName(menu.path) : treeLabel)}
          tokensFrom={rootRef} menuRef={menuRef} onClose={closeMenu} />
      ) : null}
    </div>
  );
}

/** Every folder above `dir`, nearest last. */
function ancestorsOf(dir) {
  const out = [];
  for (let p = parentOf(dir); p; p = parentOf(p)) out.unshift(p);
  return out;
}
