---
'@activistchecklist/react-review-comments': minor
---

Scope `TextAnnotator` to a new `<ReviewCommentsContent>` slot instead of wrapping every child of the shell.

The underlying `@recogito/text-annotator` installs a `click` listener on its container that calls `event.preventDefault()` on any click outside `<a>` / `.not-annotatable`. When the shell wrapped the entire app, that hijack broke any Radix interactive that bails on `event.defaultPrevented` (`Dialog`, `Popover`, `DropdownMenu`, `Select`, `HoverCard`, `NavigationMenu` triggers in some configurations). Mobile sheet/drawer triggers were the most visible casualty.

**Migration.** Wrap the page's annotatable region (typically inside `<main>`) with the new `<ReviewCommentsContent>` component. Chrome (header, nav, footer, modals) stays outside it and is no longer affected by the annotator's click handler.

```tsx
import {
  ReviewCommentsProvider,
  ReviewCommentsContent,
} from '@activistchecklist/react-review-comments';

<ReviewCommentsProvider enabled={enabled}>
  <Header />
  <main>
    <ReviewCommentsContent>{pageContent}</ReviewCommentsContent>
  </main>
  <Footer />
</ReviewCommentsProvider>
```

If `<ReviewCommentsContent>` is omitted, the shell still renders (panel, threads, hotkeys), but text-selection commenting is inert because the annotator never mounts. Existing consumers must add the wrapper to keep that feature working.
