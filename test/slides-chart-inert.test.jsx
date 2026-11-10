// A deck's chart spec is made inert like reifyui/chart's options (found 2026-11-10 in a browser probe): a tooltip that
// sits only in baseOption, and the data view's title and labels, still reached the page as HTML after the first fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/slides/elements.jsx';

const PLANT = '<b id="probe">x</b>';

test("a deck chart's baseOption, timeline-frame and media tooltips draw text", () => {
  const out = E.safeChartSpec({ baseOption: { tooltip: { formatter: PLANT } }, options: [{ tooltip: { formatter: PLANT } }],
                                media: [{ query: { minWidth: 1 }, option: { tooltip: { formatter: PLANT } } }] });
  assert.equal(out.baseOption.tooltip.renderMode, 'richText');
  assert.equal(out.options[0].tooltip.renderMode, 'richText');
  assert.equal(out.media[0].option.tooltip.renderMode, 'richText');
});

test("a deck chart's data view words are escaped", () => {
  const out = E.safeChartSpec({ toolbox: { feature: { dataView: { title: PLANT, lang: [PLANT, 'Close', 'Refresh'] } } } });
  const d = out.toolbox.feature.dataView;
  assert.ok(!d.title.includes('<') && !d.lang[0].includes('<'));
});

test("the deck's spec itself is untouched", () => {
  const spec = { baseOption: { tooltip: { formatter: PLANT } } };
  E.safeChartSpec(spec);
  assert.equal(spec.baseOption.tooltip.renderMode, undefined);
});
