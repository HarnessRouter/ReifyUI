# Changelog

## 0.18.5

- `reifyui/slides` keeps a deck's chart inert with the same pass as `reifyui/chart` (`safeChartOption`). 0.18.3 forced
  text tooltips on the top-level `tooltip` only, so a tooltip given only in `baseOption`, a timeline frame (`options`)
  or a `media` rule, and the data view's title and labels, still reached the page as HTML. Now every tooltip at any
  level draws text and the data view's words are escaped. The same fix is in 0.13.14, 0.11.5 and 0.8.7.
- The Connect pane's Create API key dialog offers **Read only** (off by default, fixed when the key is made). A key made
  read-only shows a Read only tag, and its one-time dialog says it can only read. If the service doesn't return the
  key as read-only, its secret is never shown: the key is revoked at once and the dialog says read-only keys aren't
  available; if that revoke fails, it names the key and its listed prefix so the right row can be revoked.
  `createConnectKey(graphId, name, { readOnly })` is the host's call.
- The Connect dialogs' body is a padded block in every host (`.cn-dlg .uic-modal-b` in `graph.css`). `graph.css` notes
  that the config block's styles come from `reifyui/styles/chat.css`.
- Flowcharts name mermaid's `securityLevel: 'strict'` instead of relying on mermaid's default.

## 0.18.4

- `reifyui/chart` keeps an ECharts option inert before ECharts sees it, because an option can be written by an agent or
  another user. Every tooltip, at any level, draws in the chart itself (`renderMode: 'richText'`), never as HTML. A
  `link` / `sublink` (a title's, or a sunburst or treemap node's) is kept only for `http(s):` or `mailto:`. The data
  view's title and labels are escaped. The option you pass in is never changed.
- **Behaviour change:** a tooltip formatter that returned HTML now shows that HTML as text. Use the formatter's rich
  text styles (`{a|…}` with `rich`) instead of markup.
- New `safeChartOption(option)` and `safeHref(value)` from `reifyui/chart`, for a host that calls `setOption` on the
  instance it got from `onInit`.
- The same fix is on the maintenance lines as 0.13.13, 0.11.4 and 0.8.6.

## 0.18.3

- The package's repository, homepage and issues links name HarnessRouter/ReifyUI. npm checks a provenance publish
  against them, so 0.18.2 never reached npm; 0.18.3 is the same code.

## 0.18.2 (tagged, never published)

- `reifyui/slides` keeps a deck inert whatever its source: an embed is the `srcdoc` of a sandboxed frame (no scripts,
  an opaque origin), a link mark is a link only for `http(s):` or `mailto:`, and a chart element's tooltips draw text.
  Published as 0.18.3, and on the maintenance lines as 0.13.12, 0.11.3 and 0.8.5.

## 0.18.1

- Deep Agents' `execute` reads as a shell command: its row shows the command ("Running sleep 8; echo
  done", then "Ran …") and its calls count as commands, instead of "Using Execute".

## 0.18.0

- A browser call names what it did: "Opened duckduckgo.com", "Clicked the “About” link", "Typed into
  a field", "Took a screenshot", "Read the page", "Pressed Enter", "Scrolled down", "Went back a page",
  live as "Opening …", "Clicking …". Never "Used the browser a tool". One table reads a browser plug's
  tools (`browser_click`), Playwright MCP's (`browser_take_screenshot`), a connected server's copy of
  either (`mcp__plugs__browser_click`, `plugs.browser_click`, which used to read as a connected tool)
  and a single `browser` or `computer` tool with an `action`. What was typed is never in the line.
- The element a click or a typing acted on is read from the page snapshot before it in the same turn
  (`e12 link "About"`, `- link "About" [ref=e12]`): new `browserElements(items)`, and `describeTool`
  takes `{ element }`. New `browserActOf(name)`.
- `AgentTurnView`, `WorkGroup` and `StepRow` take `openStep(item, d)`: a call the host shows in a
  place of its own (a browser step opens the browser beside the conversation) answers a handler, and
  its row opens there on a click instead of unfolding, the way a file card opens its file.
  `activeStep` marks the row of the call the host is showing.
- A call with nothing to name reads whole: "Searched the web", not "Searched the web for a tool".

## 0.17.0

- `ArtifactPanel`'s header is ONE row: the file's kind, its name as a switcher, Copy, Download, Close.
  The row of file tabs is gone. The name opens a dropdown of every file of the conversation (its
  kind, its name truncated in the middle so the end that tells similar names apart shows, its size
  and the turn that made it when known, grouped by folder), with a filter box past 8 files,
  ↑ ↓ Home End Enter Escape, and the current file checked. On a phone the list is a sheet from the
  bottom of the screen. Files take `path`, `size` and `turn`.
- New: `FileSwitcher` (that dropdown), `MidName` (a name truncated in the middle at any width),
  `middleEllipsis(name, max)`. `FilePreview` takes `nameSlot` (a control in the name's place).

## 0.16.1

- `FileCard` takes `thumb`: an image file shows itself (a url the host can load) instead of its kind's icon.

## 0.16.0

- agent-chat `ArtifactPanel`: the files a conversation made, opened beside it instead of printed into
  it. The file rendered by FilePreview (Markdown as a document, code highlighted, images, PDFs,
  sheets), a switcher across every file, Copy, Download, Close. Docked it is a column the host
  places; `overlay` makes it a drawer from the right with a scrim, Escape and focus return.
  `FileCard` and `FilePreview` are also exported from reifyui/agent-chat.
- `FileCard` takes `onCopy` (a Copy button; the host reads the text) and `active` (the file open in
  the preview). `FilePreview` copies a file it read as text from its header, and takes `before`
  (a node above its header).

## 0.15.2

- agent-chat: a turn's token count adds every count its usage reports (fresh input, output, cache
  read, cache written). Anthropic's input counts fresh tokens only, so the same work read a few
  hundred tokens on Claude Code and thousands on Codex.

## 0.15.1

- A call the tool reported as failed (`is_error: true` on its `function_call_output`) reads as failed
  wherever a call is shown: `onToolResult(callId, output, isError)`, `withResult(..., isError)`
  (the step gets `isError: true`, absent otherwise), `turnsToMessages` (from the record's
  `is_error`; it also reads the record's `output`, the result's current name), `ToolRow` (says
  "Failed", `failedLabel` to change it) and the agent view (the row turns red with its error line).
- agent-chat: a command Codex reports wrapped in a login shell (`/bin/bash -lc 'pwd'`) reads as the
  command itself.

## 0.15.0

- `ChatPanel` takes `view="agent"` (with `mark`, `motion`, `agentLabels`): each turn drawn by
  reifyui/agent-chat's `AgentTurnView`, the live line with the harness's mark, work folded per run of
  calls. Needs `styles/agent-chat.css` beside `styles/chat.css`. Without the prop nothing changes.
- `streamTurn` (reifyui/harness) calls `handlers.onEvent(event)` with every event, whole, as it
  arrives; ChatPanel folds those into the turn's clock, so the agent view times its calls.

## 0.14.0

New entry `reifyui/agent-chat` (styles: `reifyui/styles/agent-chat.css`). Nothing in the root entry
or any other entry changes.

- `AgentTurnView`: one agent turn. Prose streams in with its newest words fading in; the work between
  two pieces of prose folds to one past-tense line ("Ran 2 commands, edited app.ts +3 −1", "1 failed"),
  which opens to every call; each call opens to its input (the command, the diff, `key: value` lines)
  and its output, each with Copy and a "+N lines" expander. A failed call shows its error line
  without a click. Thinking reads "Thinking" while it streams and "Thought for 6s" after. The latest
  plan (TodoWrite, update_plan, write_todos, todowrite, SetTodoList …) renders once, as a card.
  The turn ends in "Worked for 1m 4s · 12.3k tokens", "Stopped after 12s", or "Failed" with the reason.
- `WorkingIndicator` / `WorkingMark`: the live line, `[mark] 2s · Thinking`, where the mark is the
  harness's own logo (passed as a node) in one of 15 CSS motions (`bloom`, `sheen`, `glint`,
  `flutter`, `glide`, `blink`, `flip`, `swim`, `spin`, `wave`, `dash`, `scuttle`, `equalize`, `bob`,
  `pulse`), or three jostling dots without a mark. `motionFor(base)` / `MARK_MOTIONS` choose one per
  harness. Every motion and shimmer stops under `prefers-reduced-motion`.
- `AgentComposer`: autogrowing box, attach (button, drop, paste), attachment chips, left and right
  slots, Send that becomes Stop while a task runs (Enter does not start a second turn).
- `AgentConversation`: the column, with its dock (composer, notice) pinned to the bottom, `pane` or
  `page` mode, following the bottom while the reader is there and offering "Jump to latest" when
  they are not. `useStickToBottom` on its own.
- The data: `newTurn`, `reduceTurn(turn, event, at)` (Responses stream events, the broadcast feed's
  `harness.turn.started`, `error`), `finish`, `turnFromEvents`, `turnFromResponse`, `turnFromHistory`,
  `turnFromMessage`, `liveState`, `segments`, `latestPlan`. Times come only from the `at` a caller
  passes for a live event; a replay passes null and gets no durations.
- The words: `describeTool`, `toolKind`, `toolLine`, `summarizeCalls`, `resultNote`, `todosOf`,
  `diffOf`, `patchStats`, `commandText`, covering the tool names of Claude Code, Codex, Gemini CLI,
  Hermes, Goose, OpenCode, OpenHands, pi, Kimi and connected (MCP) tools.
- `npm test`: the package now has tests (Node's runner, JSX compiled by esbuild).
