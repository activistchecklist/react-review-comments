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
  Check,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
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
  const [isScrollCapped, setIsScrollCapped] = useState(false);

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
      const capped = next >= cap;
      setMaxHeightPx((prev) => {
        if (prev === next) {
          return prev;
        }
        return next;
      });
      setIsScrollCapped(capped);
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
  const scrollClass = isScrollCapped ? ' rrc-panel-scrollable' : '';

  return (
    <div
      className={`${className}${maxHClass}${scrollClass}`}
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
  /** Total unresolved threads for the current page. */
  totalOnPageThreadCount: number;
  /** Total unresolved threads across the current scope (all pages with threads). */
  totalScopeThreadCount: number;
  documentsWithComments: OverviewDocument[];
  unreadByDocumentId: Record<string, number>;
  unresolvedThreadCountByDocumentId: Record<string, number>;
  resolvedCount: number;
  showResolved: boolean;
  onToggleResolved: () => void;
  showEmptyHint: boolean;
  pagesListOpen: boolean;
  onTogglePagesList: () => void;
  /** Copy the current page's threads as Markdown. Button is hidden when not provided. */
  onCopyThreads?: () => Promise<boolean> | boolean;
  /** Disable the copy button when there are no threads to copy. */
  canCopyThreads?: boolean;
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
      totalOnPageThreadCount,
      totalScopeThreadCount,
      documentsWithComments,
      unreadByDocumentId,
      unresolvedThreadCountByDocumentId,
      resolvedCount,
      showResolved,
      onToggleResolved,
      showEmptyHint,
      pagesListOpen,
      onTogglePagesList,
      onCopyThreads,
      canCopyThreads,
      children,
    },
    ref
  ) {
    const { labels, path: currentPath, locale: currentLocale } = useReviewComments();

    const [expandedCountVisible, setExpandedCountVisible] = useState(false);
    const [copyConfirmed, setCopyConfirmed] = useState(false);
    const copyConfirmTimerRef = useRef<number | null>(null);
    useEffect(() => {
      return () => {
        if (copyConfirmTimerRef.current != null) {
          window.clearTimeout(copyConfirmTimerRef.current);
        }
      };
    }, []);
    async function handleCopyClick() {
      if (!onCopyThreads) {
        return;
      }
      const ok = await onCopyThreads();
      if (!ok) {
        return;
      }
      setCopyConfirmed(true);
      if (copyConfirmTimerRef.current != null) {
        window.clearTimeout(copyConfirmTimerRef.current);
      }
      copyConfirmTimerRef.current = window.setTimeout(() => {
        setCopyConfirmed(false);
        copyConfirmTimerRef.current = null;
      }, 1500);
    }
    const showPagesNav = documentsWithComments.length > 0;
    const hasPagesWithComments = documentsWithComments.length > 0;
    const hasUnread = unreadTotal > 0;
    const collapsedCount = hasUnread ? unreadTotal : totalScopeThreadCount;
    const collapsedLabel = collapsedCount === 1 ? 'comment' : 'comments';
    const panelBodyId = 'rrc-comments-panel-body';
    const threadCountLabel = `${totalScopeThreadCount} thread${totalScopeThreadCount === 1 ? '' : 's'}`;

    useEffect(() => {
      if (!isPanelExpanded) {
        setExpandedCountVisible(false);
        return undefined;
      }
      const timer = window.setTimeout(() => {
        setExpandedCountVisible(true);
      }, 150);
      return () => {
        window.clearTimeout(timer);
      };
    }, [isPanelExpanded, totalScopeThreadCount]);

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
                ? labels.collapsedBadge({ count: totalScopeThreadCount })
                : hasUnread
                  ? `Open comments. ${labels.unreadBadge({ count: unreadTotal })}. ${labels.totalCommentsBadge({ count: totalScopeThreadCount })}. ${totalOnPageThreadCount} open on this page.`
                  : `Open comments. ${labels.totalCommentsBadge({ count: totalScopeThreadCount })}. ${totalOnPageThreadCount} open on this page.`
            }
            className={[
              'rrc-panel-collapsed',
              'rrc-tooltip-anchor',
              !badgeCountsLoading && hasUnread ? 'rrc-panel-collapsed--unread' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            data-tooltip="Expand panel"
            onClick={onExpand}
          >
            <span className="rrc-panel-collapsed-main">
              {badgeCountsLoading ? (
                <span className="rrc-collapsed-count-skeleton" aria-hidden="true" />
              ) : (
                <>
                  {hasUnread ? <span className="rrc-unread-dot" aria-hidden="true" /> : null}
                  <span className="rrc-panel-expand-hint" aria-hidden="true">
                    <ChevronsLeft size={13} />
                  </span>
                  <span className="rrc-panel-collapsed-count">
                    {collapsedCount > 99 ? '99+' : collapsedCount}
                  </span>
                  <span className="rrc-panel-collapsed-label" aria-hidden="true">
                    {collapsedLabel}
                  </span>
                </>
              )}
            </span>
          </button>
        )}

        {isPanelExpanded && (
          <AnimatedPanelColumn className="rrc-panel-expanded">
            <div className="rrc-panel-meta">
              <div className="rrc-panel-header">
                <div className="rrc-panel-heading">
                  <h2 className="rrc-panel-title">{labels.prOverviewTitle}</h2>
                  <p className="rrc-panel-thread-count" aria-live="polite">
                    <span
                      className={`rrc-panel-thread-count-zero${expandedCountVisible ? ' rrc-panel-thread-count-zero--hidden' : ''}`}
                    >
                      0
                    </span>
                    <span
                      className={`rrc-panel-thread-count-full${expandedCountVisible ? ' rrc-panel-thread-count-full--visible' : ''}`}
                    >
                      {threadCountLabel}
                    </span>
                  </p>
                </div>
                <div className="rrc-panel-header-actions">
                  {onCopyThreads && (
                    <span
                      className="rrc-tooltip-anchor rrc-tooltip-anchor--left"
                      data-tooltip={
                        copyConfirmed ? labels.copyThreadsAsMarkdownDone : labels.copyThreadsAsMarkdown
                      }
                    >
                      <button
                        type="button"
                        aria-label={
                          copyConfirmed ? labels.copyThreadsAsMarkdownDone : labels.copyThreadsAsMarkdown
                        }
                        className="rrc-icon-btn"
                        disabled={!canCopyThreads}
                        onClick={handleCopyClick}
                      >
                        {copyConfirmed ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    </span>
                  )}
                  <span
                    className="rrc-tooltip-anchor rrc-tooltip-anchor--left"
                    data-tooltip={labels.collapse}
                  >
                    <button
                      type="button"
                      aria-label={labels.collapse}
                      className="rrc-icon-btn"
                      onClick={onCollapse}
                    >
                      <ChevronsRight size={16} />
                    </button>
                  </span>
                </div>
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
                        title={labels.totalCommentsBadge({ count: totalScopeThreadCount })}
                        data-tooltip={labels.totalCommentsBadge({ count: totalScopeThreadCount })}
                        aria-label={labels.totalCommentsBadge({ count: totalScopeThreadCount })}
                      >
                        <span>{totalScopeThreadCount}</span>
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
                                  count: unresolvedThreadCountByDocumentId[doc.documentId] || 0,
                                })
                              }
                            >
                              {unresolvedThreadCountByDocumentId[doc.documentId] || 0}
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
