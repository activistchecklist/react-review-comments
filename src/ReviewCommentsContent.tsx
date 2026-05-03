'use client';

import { useContext, type ReactNode } from 'react';
import { TextAnnotator } from '@recogito/react-text-annotator';
import { ReviewCommentsContentBridgeContext } from './ReviewCommentsShell';

/**
 * Mounts the text annotator around the page's main, annotatable content.
 *
 * Place inside (or around) `<main>` so chrome (header, footer, modals) sits OUTSIDE the
 * annotator's container. The annotator installs a click `preventDefault()` on its container,
 * which would otherwise short-circuit Radix-based interactives (`Dialog`, `Popover`, etc.) that
 * bail on `event.defaultPrevented`.
 *
 * Reads from `ReviewCommentsContentBridgeContext` published by `ReviewCommentsShell` (or
 * `ReviewCommentsProvider`). When the shell is disabled or the bridge isn't available, renders
 * children unchanged.
 */
export function ReviewCommentsContent({ children }: { children: ReactNode }) {
  const bridge = useContext(ReviewCommentsContentBridgeContext);

  if (!bridge || !bridge.enabled) {
    return <>{children}</>;
  }

  /* Recogito defaults to `annotatingEnabled: true`, which records each text selection as a draft
     annotation and paints highlights. We drive comments via `onContentMouseUp` + `selectionPrompt`,
     so keep the annotator from storing selection state or leaving highlight nodes behind. */
  return (
    <TextAnnotator annotatingEnabled={false}>
      <div
        ref={bridge.contentRef}
        data-annotations-enabled="true"
        className={bridge.contentClassName}
        onMouseUp={bridge.onContentMouseUp}
      >
        {children}
      </div>
      {bridge.selectionPrompt ? (
        <div
          ref={bridge.selectionPromptRef}
          className={`rrc-root rrc-selection-prompt ${bridge.themeClassName}`}
          style={{ top: bridge.selectionPrompt.top, left: bridge.selectionPrompt.left }}
        >
          <button
            type="button"
            aria-label={
              bridge.addCommentShortcutHint
                ? `${bridge.addCommentLabel} (${bridge.addCommentShortcutHint})`
                : bridge.addCommentLabel
            }
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              bridge.commitSelectionFromPrompt();
            }}
          >
            {bridge.addCommentLabel}
            {bridge.addCommentShortcutHint ? (
              <span className="rrc-selection-prompt-kbd"> {bridge.addCommentShortcutHint}</span>
            ) : null}
          </button>
        </div>
      ) : null}
    </TextAnnotator>
  );
}
