// Settings that guard what a deck or a live document can do, pinned so a refactor cannot drop them silently.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test("a flowchart renders with mermaid's securityLevel 'strict', named, not left to the default", () => {
  const init = src('src/slides/elements.jsx').match(/mermaid\.initialize\(\{([^}]*)\}\)/);
  assert.ok(init, 'FlowchartEl initializes mermaid');
  assert.match(init[1], /securityLevel:\s*'strict'/);
});
