# @activistchecklist/react-review-comments

## 0.3.0

### Minor Changes

- ea46b5a: When exporting threads as Markdown, short selections (under ~80 chars) are now rendered with surrounding page context so it's clear which part of the page the comment is on when the markdown is pasted into another tool (e.g. an LLM).

  The actually-selected portion is wrapped in `[brackets]` and truncated context boundaries are marked with `…`. For example, a quote of "click here" might render as:

  ```
  > …To register for the workshop, [click here] to begin the signup process.…
  ```

  The single space between the context and the selection is preserved (the anchor sanitizer no longer trims the boundary whitespace off `contextBefore`/`contextAfter`), so words don't run together in the output.

  Longer selections render unchanged. Threads stored before context capture was added (no `contextBefore`/`contextAfter` on the anchor) also render unchanged.

## 0.2.0

### Minor Changes

- 9a2f82c: Add a "Copy threads as Markdown" button to the top-right of the expanded sidebar.

  The button exports every comment thread on the current page (open and resolved) to the clipboard as Markdown. The format includes each thread's selected text as a blockquote, plus author + ISO timestamp + body for each comment, ordered open-first then by thread time. It is meant to be readable both for humans (pasted into a PR / Slack) and for LLMs (pasted into a chat).

  Two new label strings, `copyThreadsAsMarkdown` and `copyThreadsAsMarkdownDone`, are exposed for i18n.

## 0.1.5

### Patch Changes

- 0befe2c: Refine docked sidebar styling so the dock container owns the visual chrome, uses an inset inner shadow, and adds left padding for better shadow breathing room.

## 0.1.4

### Patch Changes

- Adjust docked panel styling so container chrome and spacing behave correctly in docked mode.

## 0.1.2

### Patch Changes

- 05378ba: Set up automated versioning and publishing with Changesets and GitHub Actions.
