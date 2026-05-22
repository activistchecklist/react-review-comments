---
'@activistchecklist/react-review-comments': minor
---

Add a "Copy threads as Markdown" button to the top-right of the expanded sidebar.

The button exports every comment thread on the current page (open and resolved) to the clipboard as Markdown. The format includes each thread's selected text as a blockquote, plus author + ISO timestamp + body for each comment, ordered open-first then by thread time. It is meant to be readable both for humans (pasted into a PR / Slack) and for LLMs (pasted into a chat).

Two new label strings, `copyThreadsAsMarkdown` and `copyThreadsAsMarkdownDone`, are exposed for i18n.
