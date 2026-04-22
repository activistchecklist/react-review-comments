'use client';

import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import {
  MessageCircleMore,
  ChevronRight,
  ChevronsRight,
} from 'lucide-react';
import { useReviewComments } from './context';
import { withLocalePath } from './annotationPaths';
import type { OverviewDocument, ReviewCommentsPanelMode } from './types';

/** Matches expanded .rrc-aside: distance from viewport top to bottom margin (scrollable panel fill). */
function viewportPanelHeightCapPx(aside: HTMLElement | null): number {
  if (typeof window === 'undefined') {
    return 900;
  }
  const vh = window.innerHeight;
  const topPx =
    aside instanceof HTMLElement ? aside.getBoundingClientRect().top : 16;
  const bottomMarginPx = 16;
  return Math.max(240, Math.floor(vh - topPx - bottomMarginPx));
}

function AnimatedPanelColumn({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [maxHeightPx, setMaxHeightPx] = useState<number | null>(null);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner || typeof window === 'undefined') {
      return undefined;
    }

    const sync = () => {
      const outer = inner.parentElement;
      if (!outer) {
        return;
      }
      const aside = outer.parentElement;
      const cap = viewportPanelHeightCapPx(aside instanceof HTMLElement ? aside : null);
      // maxHeight applies to the panel’s border box; inner.scrollHeight is only the content
      // wrapper. Without adding padding + border, the content box is too short and a scrollbar
      // appears even for one or two threads.
      const cs = window.getComputedStyle(outer);
      const chromeY =
        parseFloat(cs.paddingTop) +
        parseFloat(cs.paddingBottom) +
        parseFloat(cs.borderTopWidth) +
        parseFloat(cs.borderBottomWidth);
      // Keep a tiny cushion for sub-pixel rounding during route/content transitions
      // so the panel does not show unnecessary scrollbars.
      const next = Math.min(Math.ceil(inner.scrollHeight + chromeY + 2), cap);
      setMaxHeightPx((prev) => {
        if (prev === next) {
          return prev;
        }
        return next;
      });
    };

    sync();
    const ro = new ResizeObserver(() => {
      sync();
    });
    ro.observe(inner);

    const onResize = () => {
      sync();
    };
    window.addEventListener('resize', onResize);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const maxHClass = maxHeightPx == null ? ' rrc-panel-maxvh' : '';

  return (
    <div
      className={`${className}${maxHClass}`}
      style={maxHeightPx != null ? { maxHeight: `${Math.ceil(maxHeightPx)}px` } : undefined}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  );
}

export type ReviewCommentsPanelProps = {
  panelMode: ReviewCommentsPanelMode;
  isPanelExpanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  /** True while overview fetch is in flight (avoid showing "0 comments" in the collapsed badge). */
  badgeCountsLoading: boolean;
  unreadTotal: number;
  /** Total comment bodies on open threads for the current page. */
  totalOnPageCommentCount: number;
  /** Total comments across the current scope (all pages with comments). */
  totalScopeCommentCount: number;
  documentsWithComments: OverviewDocument[];
  unreadByDocumentId: Record<string, number>;
  unresolvedCommentCountByDocumentId: Record<string, number>;
  resolvedCount: number;
  showResolved: boolean;
  onToggleResolved: () => void;
  showEmptyHint: boolean;
  pagesListOpen: boolean;
  onTogglePagesList: () => void;
  children: ReactNode;
};

export const ReviewCommentsPanel = forwardRef<HTMLElement, ReviewCommentsPanelProps>(
  function ReviewCommentsPanel(
    {
      panelMode,
      isPanelExpanded,
      onExpand,
      onCollapse,
      badgeCountsLoading,
      unreadTotal,
      totalOnPageCommentCount,
      totalScopeCommentCount,
      documentsWithComments,
      unreadByDocumentId,
      unresolvedCommentCountByDocumentId,
      resolvedCount,
      showResolved,
      onToggleResolved,
      showEmptyHint,
      pagesListOpen,
      onTogglePagesList,
      children,
    },
    ref
  ) {
    const { labels, path: currentPath, locale: currentLocale } = useReviewComments();

    const [peekVisible, setPeekVisible] = useState(false);
    const peekOpenTimerRef = useRef<number | null>(null);
    const peekCloseTimerRef = useRef<number | null>(null);
    const showPagesNav = documentsWithComments.length > 1;
    const hasPagesWithComments = documentsWithComments.length > 0;
    const hasUnread = unreadTotal > 0;
    const collapsedCount = hasUnread ? unreadTotal : totalScopeCommentCount;
    const panelBodyId = 'rrc-comments-panel-body';

    function clearPeekOpenTimer() {
      if (peekOpenTimerRef.current != null) {
        window.clearTimeout(peekOpenTimerRef.current);
        peekOpenTimerRef.current = null;
      }
    }

    function clearPeekCloseTimer() {
      if (peekCloseTimerRef.current != null) {
        window.clearTimeout(peekCloseTimerRef.current);
        peekCloseTimerRef.current = null;
      }
    }

    function handlePeekOpen() {
      if (isPanelExpanded) {
        return;
      }
      clearPeekCloseTimer();
      clearPeekOpenTimer();
      peekOpenTimerRef.current = window.setTimeout(() => {
        setPeekVisible(true);
      }, 120);
    }

    function handlePeekClose() {
      clearPeekOpenTimer();
      clearPeekCloseTimer();
      peekCloseTimerRef.current = window.setTimeout(() => {
        setPeekVisible(false);
      }, 150);
    }

    useEffect(
      () => () => {
        clearPeekOpenTimer();
        clearPeekCloseTimer();
      },
      []
    );

    return (
      <aside
        ref={ref}
        className={`rrc-root rrc-aside rrc-aside--${panelMode} ${isPanelExpanded ? 'rrc-aside--expanded' : 'rrc-aside--collapsed'}`}
      >
        {!isPanelExpanded && (
          <button
            type="button"
            aria-busy={badgeCountsLoading}
            aria-expanded={false}
            aria-controls={panelBodyId}
            aria-label={
              badgeCountsLoading
                ? labels.collapsedBadge({ count: totalScopeCommentCount })
                : hasUnread
                  ? `Open comments. ${labels.unreadBadge({ count: unreadTotal })}. ${labels.totalCommentsBadge({ count: totalScopeCommentCount })}.`
                  : `Open comments. ${labels.totalCommentsBadge({ count: totalScopeCommentCount })}.`
            }
            className={[
              'rrc-panel-collapsed',
              !badgeCountsLoading && hasUnread ? 'rrc-panel-collapsed--unread' : '',
              !badgeCountsLoading && peekVisible ? 'rrc-panel-collapsed--peek' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onMouseEnter={handlePeekOpen}
            onMouseLeave={handlePeekClose}
            onFocus={handlePeekOpen}
            onBlur={handlePeekClose}
            onClick={onExpand}
          >
            <span className="rrc-panel-collapsed-main">
              <MessageCircleMore size={14} aria-hidden="true" />
              {badgeCountsLoading ? (
                <span className="rrc-collapsed-count-skeleton" aria-hidden="true" />
              ) : (
                <>
                  {hasUnread ? <span className="rrc-unread-dot" aria-hidden="true" /> : null}
                  <span>{collapsedCount > 99 ? '99+' : collapsedCount}</span>
                </>
              )}
            </span>
            {!badgeCountsLoading && peekVisible ? (
              <span className="rrc-panel-peek" role="status" aria-live="polite">
                <span className="rrc-panel-peek-group rrc-panel-peek-group--site">
                  <span className="rrc-panel-peek-title">Site</span>
                  <span className="rrc-panel-peek-row">
                    <span>Unread</span>
                    <strong>{unreadTotal > 99 ? '99+' : unreadTotal}</strong>
                  </span>
                  <span className="rrc-panel-peek-row">
                    <span>Total</span>
                    <strong>{totalScopeCommentCount > 99 ? '99+' : totalScopeCommentCount}</strong>
                  </span>
                </span>
                <span className="rrc-panel-peek-divider" aria-hidden="true" />
                <span className="rrc-panel-peek-group rrc-panel-peek-group--page">
                  <span className="rrc-panel-peek-title">This page</span>
                  <span className="rrc-panel-peek-row">
                    <span>Open comments</span>
                    <strong>{totalOnPageCommentCount > 99 ? '99+' : totalOnPageCommentCount}</strong>
                  </span>
                </span>
              </span>
            ) : null}
          </button>
        )}

        {isPanelExpanded && (
          <AnimatedPanelColumn className="rrc-panel-expanded">
            <div className="rrc-panel-meta">
              <div className="rrc-panel-header">
                <div className="rrc-panel-heading">
                  <h2 className="rrc-panel-title">{labels.prOverviewTitle}</h2>
                </div>
                <button
                  type="button"
                  aria-label={labels.collapse}
                  title={labels.collapse}
                  className="rrc-icon-btn"
                  onClick={onCollapse}
                >
                  <ChevronsRight size={16} />
                </button>
              </div>

              {showPagesNav && (
                <div
                  className={`rrc-section rrc-section--nav${pagesListOpen ? ' rrc-section--nav-open' : ''}`}
                >
                  <button
                    type="button"
                    className="rrc-pages-disclosure"
                    aria-expanded={pagesListOpen}
                    onClick={onTogglePagesList}
                  >
                    <span className="rrc-pages-disclosure-heading">
                      <ChevronRight
                        size={14}
                        aria-hidden="true"
                        className={`rrc-pages-chevron${pagesListOpen ? ' rrc-pages-chevron--open' : ''}`}
                      />
                      <span className="rrc-pages-disclosure-title">{labels.panelSectionPages}</span>
                    </span>
                    <span className="rrc-pages-disclosure-meta">
                      {unreadTotal > 0 ? (
                        <span
                          className="rrc-badge rrc-tooltip-anchor"
                          title={labels.unreadBadge({ count: unreadTotal })}
                          data-tooltip={labels.unreadBadge({ count: unreadTotal })}
                          aria-label={labels.unreadBadge({ count: unreadTotal })}
                        >
                          {unreadTotal}
                        </span>
                      ) : null}
                      <span
                        className="rrc-doc-count-badge rrc-doc-count-badge--comments rrc-tooltip-anchor"
                        title={labels.totalCommentsBadge({ count: totalScopeCommentCount })}
                        data-tooltip={labels.totalCommentsBadge({ count: totalScopeCommentCount })}
                        aria-label={labels.totalCommentsBadge({ count: totalScopeCommentCount })}
                      >
                        <span>{totalScopeCommentCount}</span>
                      </span>
                    </span>
                  </button>
                </div>
              )}

              {pagesListOpen && hasPagesWithComments && (
                <div className="rrc-section rrc-section--pages">
                  <ul className="rrc-doc-list">
                    {documentsWithComments.map((doc) => {
                      const isCurrent = doc.sitePath === currentPath && doc.locale === currentLocale;
                      return (
                        <li key={doc.documentId}>
                          <Link
                            href={withLocalePath(doc.locale, doc.sitePath)}
                            className={`rrc-doc-btn${isCurrent ? ' rrc-doc-btn--current' : ''}${unreadByDocumentId[doc.documentId] > 0 ? ' rrc-doc-btn--unread' : ''}`}
                          >
                            <span
                              className="rrc-doc-count-badge rrc-doc-count-badge--comments"
                              title={
                                labels.totalCommentsBadge({
                                  count: unresolvedCommentCountByDocumentId[doc.documentId] || 0,
                                })
                              }
                            >
                              {unresolvedCommentCountByDocumentId[doc.documentId] || 0}
                            </span>
                            <span className="rrc-truncate">{withLocalePath(doc.locale, doc.sitePath)}</span>
                            {unreadByDocumentId[doc.documentId] > 0 ? (
                              <span className="rrc-badge">
                                {labels.unreadBadge({ count: unreadByDocumentId[doc.documentId] })}
                              </span>
                            ) : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {resolvedCount > 0 && (
                <div className="rrc-panel-subrow">
                  <button type="button" className="rrc-link-btn" onClick={onToggleResolved}>
                    {showResolved
                      ? labels.hideResolvedToggle
                      : labels.viewResolvedToggle({ count: resolvedCount })}
                  </button>
                </div>
              )}
            </div>
            {showEmptyHint && <p className="rrc-empty-hint">{labels.emptyPanelHint}</p>}
            <div id={panelBodyId}>{children}</div>
          </AnimatedPanelColumn>
        )}
      </aside>
    );
  }
);
