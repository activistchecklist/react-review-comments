---
'@activistchecklist/react-review-comments': minor
---

When exporting threads as Markdown, short selections (under ~80 chars) are now rendered with surrounding page context so it's clear which part of the page the comment is on when the markdown is pasted into another tool (e.g. an LLM).

The actually-selected portion is wrapped in `**bold**` and truncated context boundaries are marked with `…`. For example, a quote of "click here" might render as:

```
> …To register for the workshop, **click here** to begin the signup process.…
```

Longer selections render unchanged. Threads stored before context capture was added (no `contextBefore`/`contextAfter` on the anchor) also render unchanged.
