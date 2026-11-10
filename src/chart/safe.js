// An ECharts option can come from anywhere (a person, a saved dashboard, an agent writing it), so the chart keeps it
// inert before ECharts sees it (found 2026-11-10). ECharts writes some option strings into the page as HTML or opens
// them as URLs:
//   - a tooltip's content (its formatter, series and data names) in the default HTML render mode;
//   - a title's link / sublink and a sunburst or treemap node's link, opened in a window that keeps the page's origin;
//   - the data view's title and button labels (toolbox.feature.dataView.title / lang).
// So every tooltip draws in the chart itself (renderMode 'richText': text, never markup), a link is kept only when it is
// http(s) or mailto, and the data view's words are escaped. The option passed in is never changed: plain objects and
// arrays are copied, anything else (functions, typed arrays, dates, gradient objects) is passed through as it is.
const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

export function safeHref(v) {
  return typeof v === 'string' && SAFE_HREF.test(v.replace(/[\u0000- \u007f]/g, '')) ? v : '';
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

const isPlain = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};

export function safeChartOption(option) {
  if (!isPlain(option) && !Array.isArray(option)) return option;
  const seen = new Map();
  const escaped = new Set();
  const walk = (n) => {
    if (Array.isArray(n)) {
      if (seen.has(n)) return seen.get(n);
      const out = []; seen.set(n, out);
      for (const x of n) out.push(walk(x));
      return out;
    }
    if (!isPlain(n)) return n;
    if (seen.has(n)) return seen.get(n);
    const out = {}; seen.set(n, out);
    for (const k of Object.keys(n)) {
      const v = n[k];
      if ((k === 'link' || k === 'sublink') && typeof v === 'string') {
        if (safeHref(v)) out[k] = v;
      } else if (k === 'tooltip') {
        out[k] = tooltip(v);
      } else if (k === 'dataView' && isPlain(v)) {
        out[k] = dataView(walk(v));
      } else {
        out[k] = walk(v);
      }
    }
    return out;
  };
  const tooltip = (v) => {
    if (v === true) return { renderMode: 'richText' };
    if (Array.isArray(v)) return v.map((t) => (isPlain(t) ? { ...walk(t), renderMode: 'richText' } : walk(t)));
    return isPlain(v) ? { ...walk(v), renderMode: 'richText' } : walk(v);
  };
  const dataView = (d) => {
    if (escaped.has(d)) return d;           // the same data view reached twice: escape once
    escaped.add(d);
    if (typeof d.title === 'string') d.title = esc(d.title);
    if (Array.isArray(d.lang)) d.lang = d.lang.map((s) => (typeof s === 'string' ? esc(s) : s));
    return d;
  };
  return walk(option);
}
