// A chart's option never puts markup or a script URL into the page (found 2026-11-10): ECharts writes a tooltip's
// content, the data view's words and a title's or node's link as HTML or as a URL, and the option can be written by an
// agent. Every option reaches ECharts through applyOption, made inert by safeChartOption.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyOption } from '../src/chart/Chart.jsx';
import { safeChartOption, safeHref } from '../src/chart/safe.js';

const PLANT = '<img src=x onerror=alert(1)>';

test('every tooltip draws text: root, array, baseOption, timeline options, media, series', () => {
  const out = safeChartOption({
    tooltip: { formatter: PLANT, trigger: 'item' },
    baseOption: { tooltip: [{}, { show: true }] },
    options: [{ tooltip: { formatter: PLANT } }],
    media: [{ query: { maxWidth: 500 }, option: { tooltip: true } }],
    series: [{ type: 'pie', tooltip: { formatter: PLANT }, data: [{ name: PLANT, value: 1, tooltip: {} }] }],
  });
  assert.equal(out.tooltip.renderMode, 'richText');
  assert.equal(out.tooltip.trigger, 'item');
  assert.deepEqual(out.baseOption.tooltip.map((t) => t.renderMode), ['richText', 'richText']);
  assert.equal(out.options[0].tooltip.renderMode, 'richText');
  assert.deepEqual(out.media[0].option.tooltip, { renderMode: 'richText' });
  assert.equal(out.series[0].tooltip.renderMode, 'richText');
  assert.equal(out.series[0].data[0].tooltip.renderMode, 'richText');
});

test('a link is kept only for http(s) or mailto: title, sublink, sunburst and treemap nodes', () => {
  for (const bad of ['javascript:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,x', 'vbscript:x']) {
    const out = safeChartOption({ title: { text: 't', link: bad, sublink: bad },
                                  series: [{ type: 'treemap', data: [{ name: 'a', value: 1, link: bad, children: [{ name: 'b', link: bad }] }] }] });
    assert.ok(!('link' in out.title) && !('sublink' in out.title), bad);
    assert.ok(!('link' in out.series[0].data[0]) && !('link' in out.series[0].data[0].children[0]), bad);
  }
  const ok = safeChartOption({ title: [{ link: 'https://example.com/a', sublink: 'mailto:a@example.com' }] });
  assert.equal(ok.title[0].link, 'https://example.com/a');
  assert.equal(ok.title[0].sublink, 'mailto:a@example.com');
  assert.equal(safeHref('javascript:x'), '');
});

test("the data view's title and labels are escaped", () => {
  const out = safeChartOption({ toolbox: { feature: { dataView: { title: PLANT, lang: [PLANT, 'Close & go', 'Refresh'] } } } });
  const d = out.toolbox.feature.dataView;
  assert.ok(!d.title.includes('<') && d.title.startsWith('&lt;img'));
  assert.deepEqual(d.lang, ['&lt;img src=x onerror=alert(1)&gt;', 'Close &amp; go', 'Refresh']);
});

test('the option passed in is untouched; functions, typed arrays, dates and objects pass through as they are', () => {
  const fmt = () => 'x';
  class Gradient { constructor() { this.colorStops = []; } }
  const g = new Gradient(); const data = new Float32Array([1, 2, 3]); const when = new Date(0);
  const axisLink = [{ xAxisIndex: 'all' }];
  const opt = { tooltip: { formatter: fmt }, title: { link: 'javascript:x' }, series: [{ data, itemStyle: { color: g } }],
                xAxis: { min: when }, axisPointer: { link: axisLink } };
  const before = JSON.stringify(opt);
  const out = safeChartOption(opt);
  assert.equal(JSON.stringify(opt), before, 'the input is not changed');
  assert.equal(opt.tooltip.renderMode, undefined);
  assert.equal(out.tooltip.formatter, fmt);
  assert.equal(out.series[0].data, data);
  assert.equal(out.series[0].itemStyle.color, g);
  assert.equal(out.xAxis.min, when);
  assert.deepEqual(out.axisPointer.link, axisLink, "the axis pointer's link (not a URL) is kept");
  assert.equal(safeChartOption(null), null);
});

test('Chart hands ECharts only the inert option, and has no other way to set one', () => {
  const calls = [];
  const fake = { setOption: (o, nm) => calls.push([o, nm]) };
  applyOption(fake, { tooltip: { formatter: PLANT }, title: { link: 'javascript:x' } }, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].tooltip.renderMode, 'richText');
  assert.ok(!('link' in calls[0][0].title));
  assert.equal(calls[0][1], true);
  const src = readFileSync(new URL('../src/chart/Chart.jsx', import.meta.url), 'utf8');
  assert.equal((src.match(/\.setOption\(/g) || []).length, 1, 'setOption is called only inside applyOption');
});
