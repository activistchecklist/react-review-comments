'use client';

import {
  useMemo,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import { Annotorious } from '@annotorious/react';
import { TextAnnotator } from '@recogito/react-text-annotator';
import { useReviewComments } from './context';
import { ReviewCommentsPanel } from './ReviewCommentsPanel';
import { SelectionComposer } from './SelectionComposer';
import { ThreadList } from './ThreadList';
import { useHostDarkMode } from './useHostDarkMode';
import {
  applyDraftQuoteHighlightByOffsets,
  applyDraftQuoteHighlight,
  applyThreadHighlights,
  buildSelectionAnchorSelector,
  clearDraftQuoteHighlights,
  clearThreadHighlights,
  computeRangeOffsetsInAnnotationRoot,
  computeQuoteDocumentOrder,
  computeSelectionPromptPosition,
  elementsWithAnnotationThreadId,
  expandCollapsedAncestorsForNode,
  rangeAnchorRect,
  setActiveHighlightInRoot,
} from './highlightDom';
import { ANNOTATION_MAX_QUOTE_LEN } from '../shared/sanitize';
import {
  isThreadUnread,
  loadSeenThreadMap,
  normalizeThreadUpdatedAt,
  reviewCommentAuthorsMatch,
  saveSeenThreadMap,
} from './seenThreads';
import {
  countResolvedThreads,
  countUnresolvedThreads,
  countUnresolvedOverviewThreads,
  hasUnresolvedOverviewThreads,
  isUnresolvedStatus,
  partitionThreadsByResolution,
} from './threadQueries';
import { useSessionAuthor } from './sessionAuthor';
import type { OverviewDocument, RrcThread } from './types';

export default function ReviewCommentsShell({ children }: { children: ReactNode }) {
  const { labels, api, enabled, panelMode, path, locale, scope } = useReviewComments();
  const panelExpandedStorageKey = `rrc:panel-expanded:${scope.scopeKey}`;
  const pagesListOpenStorageKey = `rrc:pages-list-open:${scope.scopeKey}`;
  const isHostDarkMode = useHostDarkMode();
  const themeClassName = isHostDarkMode ? 'rrc-theme-dark' : 'rrc-theme-light';
  const contentRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [threads, setThreads] = useState<RrcThread[]>([]);
  const [threadsPending, setThreadsPending] = useState(false);
  const [overview, setOverview] = useState<OverviewDocument[]>([]);
  const [seenMap, setSeenMap] = useState<Record<string, string>>({});
  const [selectedQuote, setSelectedQuote] = useState('');
  const [selectedRangeOffsets, setSelectedRangeOffsets] = useState<{
    startOffset: number;
    endOffset: number;
  } | null>(null);
  const [selectedAnchorSelector, setSelectedAnchorSelector] = useState<Record<string, unknown> | null>(
    null
  );
  const [manualExpanded, setManualExpanded] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.sessionStorage.getItem(panelExpandedStorageKey) === '1';
  });
  const [showResolved, setShowResolved] = useState(false);
  const [selectionDraftActive, setSelectionDraftActive] = useState(false);
  const [replyDraftActive, setReplyDraftActive] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState('');
  const [activeThreadFocusTick, setActiveThreadFocusTick] = useState(0);
  const [threadOrderById, setThreadOrderById] = useState<Record<string, number>>({});
  const [selectedQuoteOrder, setSelectedQuoteOrder] = useState<number | null>(null);
  const [selectionPrompt, setSelectionPrompt] = useState<{
    quote: string;
    top: number;
    left: number;
  } | null>(null);
  const selectionPromptRef = useRef<HTMLDivElement>(null);
  const pendingQuoteRef = useRef('');
  const pendingRangeOffsetsRef = useRef<{ startOffset: number; endOffset: number } | null>(null);
  const pendingAnchorSelectorRef = useRef<Record<string, unknown> | null>(null);
  const skipNextContentMouseUpRef = useRef(false);
  const lastAddCommentCommitAtRef = useRef<number | null>(null);
  const overviewRouteRef = useRef<{ path: string; locale: string; scopeKey: string } | null>(null);
  const panelUnreadAutoFocusDoneRef = useRef(false);
  const prevActiveThreadIdForSeenRef = useRef('');
  const [overviewCountsPending, setOverviewCountsPending] = useState(true);
  const { author, updateAuthor } = useSessionAuthor();

  useEffect(() => {
    setSeenMap(loadSeenThreadMap(scope));
  }, [scope]);

  useEffect(() => {
    if (!enabled || !path || !locale) {
      setThreads([]);
      setThreadsPending(false);
      return;
    }
    let cancelled = false;
    setThreads([]);
    setActiveThreadId('');
    setThreadsPending(true);
    api
      .fetchThreads({ path, locale })
      .then((response) => {
        if (!cancelled) {
          setThreads(response.threads || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setThreads([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setThreadsPending(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, enabled, path, locale, scope]);

  useEffect(() => {
    if (!enabled) {
      overviewRouteRef.current = null;
      setOverviewCountsPending(false);
      return;
    }
    const sk = scope.scopeKey;
    const prev = overviewRouteRef.current;
    const routeChanged =
      !prev || prev.path !== path || prev.locale !== locale || prev.scopeKey !== sk;
    overviewRouteRef.current = { path, locale, scopeKey: sk };
    if (routeChanged) {
      setOverviewCountsPending(true);
    }

    let cancelled = false;
    api
      .fetchOverview()
      .then((response) => {
        if (!cancelled) {
          setOverview(response.documents || []);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setOverviewCountsPending(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, enabled, path, locale, scope, threads.length]);

  const markThreadSeen = useCallback(
    (threadId: string, updatedAt: unknown) => {
      const u = normalizeThreadUpdatedAt(updatedAt);
      if (!u) {
        return;
      }
      setSeenMap((prev) => {
        if (normalizeThreadUpdatedAt(prev[threadId]) === u) {
          return prev;
        }
        const next = { ...prev, [threadId]: u };
        saveSeenThreadMap(scope, next);
        return next;
      });
    },
    [scope]
  );

  useEffect(() => {
    const prev = prevActiveThreadIdForSeenRef.current;
    if (prev === activeThreadId) {
      return;
    }
    if (prev) {
      const t = threads.find((th) => th.id === prev);
      if (t) {
        markThreadSeen(prev, t.updated_at ?? t.updatedAt);
      }
    }
    prevActiveThreadIdForSeenRef.current = activeThreadId;
  }, [activeThreadId, threads, markThreadSeen]);

  const documentsWithComments = useMemo(
    () => overview.filter((doc) => hasUnresolvedOverviewThreads(doc)),
    [overview]
  );

  const unresolvedThreadCountByDocumentId = useMemo(() => {
    const output: Record<string, number> = {};
    for (const doc of documentsWithComments) {
      output[doc.documentId] = countUnresolvedOverviewThreads(doc);
    }
    return output;
  }, [documentsWithComments]);

  const unreadByDocumentId = useMemo(() => {
    const output: Record<string, number> = {};
    const me = author.trim();
    for (const doc of documentsWithComments) {
      output[doc.documentId] = doc.threads.reduce((count, thread) => {
        if (!isUnresolvedStatus(thread.status)) {
          return count;
        }
        const seenUpdatedAt = normalizeThreadUpdatedAt(seenMap[thread.id]);
        const threadUpdated = normalizeThreadUpdatedAt(thread.updatedAt);
        if (!threadUpdated) {
          return count;
        }
        if (!seenUpdatedAt || seenUpdatedAt !== threadUpdated) {
          if (
            me &&
            thread.lastCommentAuthor &&
            reviewCommentAuthorsMatch(thread.lastCommentAuthor, me)
          ) {
            return count;
          }
          return count + 1;
        }
        return count;
      }, 0);
    }
    return output;
  }, [documentsWithComments, seenMap, author]);

  const unreadTotal = useMemo(
    () =>
      Object.values(unreadByDocumentId).reduce((sum: number, count: number) => sum + count, 0),
    [unreadByDocumentId]
  );

  const scopeThreadCount = useMemo(
    () => documentsWithComments.reduce((sum, doc) => sum + countUnresolvedOverviewThreads(doc), 0),
    [documentsWithComments]
  );

  const totalThreadCount = useMemo(
    () => countUnresolvedThreads(threads),
    [threads]
  );

  const [pagesListOpen, setPagesListOpen] = useState(false);
  const [pagesListOpenPreferenceLoaded, setPagesListOpenPreferenceLoaded] = useState(false);
  const [hasPagesListOpenPreference, setHasPagesListOpenPreference] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const raw = window.sessionStorage.getItem(pagesListOpenStorageKey);
    setHasPagesListOpenPreference(raw != null);
    if (raw != null) {
      setPagesListOpen(raw === '1');
    }
    setPagesListOpenPreferenceLoaded(true);
  }, [pagesListOpenStorageKey]);

  useEffect(() => {
    if (
      !pagesListOpenPreferenceLoaded ||
      hasPagesListOpenPreference ||
      overviewCountsPending
    ) {
      return;
    }
    setPagesListOpen(scopeThreadCount > 0 && threads.length === 0);
  }, [
    pagesListOpenPreferenceLoaded,
    hasPagesListOpenPreference,
    overviewCountsPending,
    scopeThreadCount,
    threads.length,
  ]);

  useEffect(() => {
    if (!pagesListOpenPreferenceLoaded || typeof window === 'undefined') {
      return;
    }
    window.sessionStorage.setItem(pagesListOpenStorageKey, pagesListOpen ? '1' : '0');
    if (!hasPagesListOpenPreference) {
      setHasPagesListOpenPreference(true);
    }
  }, [
    pagesListOpenStorageKey,
    pagesListOpenPreferenceLoaded,
    pagesListOpen,
    hasPagesListOpenPreference,
  ]);

  const resolvedCount = useMemo(
    () => countResolvedThreads(threads),
    [threads]
  );

  const visibleThreads = useMemo(() => {
    const filtered = partitionThreadsByResolution(threads, showResolved);
    return filtered.sort((a, b) => {
      const aPos = threadOrderById[a.id];
      const bPos = threadOrderById[b.id];
      const aHasPos = Number.isFinite(aPos);
      const bHasPos = Number.isFinite(bPos);
      if (aHasPos && bHasPos) {
        return aPos - bPos;
      }
      if (aHasPos) {
        return -1;
      }
      if (bHasPos) {
        return 1;
      }
      const aTime = new Date(a.created_at || a.createdAt || 0).getTime();
      const bTime = new Date(b.created_at || b.createdAt || 0).getTime();
      return aTime - bTime;
    });
  }, [threads, showResolved, threadOrderById]);

  const isInteracting = selectionDraftActive || replyDraftActive;
  const isPanelExpanded = manualExpanded;

  useEffect(() => {
    if (!isPanelExpanded) {
      panelUnreadAutoFocusDoneRef.current = false;
    }
  }, [isPanelExpanded]);

  useEffect(() => {
    if (!enabled || !isPanelExpanded) {
      return;
    }
    if (!visibleThreads.length) {
      return;
    }
    if (panelUnreadAutoFocusDoneRef.current) {
      return;
    }
    if (activeThreadId && visibleThreads.some((t) => t.id === activeThreadId)) {
      panelUnreadAutoFocusDoneRef.current = true;
      return;
    }
    const firstUnread = visibleThreads.find((t) => isThreadUnread(t, seenMap, author));
    if (!firstUnread) {
      panelUnreadAutoFocusDoneRef.current = true;
      return;
    }
    setActiveThreadId(firstUnread.id);
    panelUnreadAutoFocusDoneRef.current = true;
  }, [enabled, isPanelExpanded, visibleThreads, seenMap, activeThreadId, author]);

  useEffect(() => {
    if (isInteracting || selectedQuote) {
      setManualExpanded(true);
    }
  }, [isInteracting, selectedQuote]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const saved = window.sessionStorage.getItem(panelExpandedStorageKey) === '1';
    setManualExpanded(saved);
  }, [panelExpandedStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.sessionStorage.setItem(panelExpandedStorageKey, manualExpanded ? '1' : '0');
  }, [panelExpandedStorageKey, manualExpanded]);

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }
    const thread = threads.find((t) => t.id === activeThreadId);
    if (thread?.status === 'resolved') {
      setActiveThreadId('');
    }
  }, [threads, activeThreadId]);

  useLayoutEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const root = contentRef.current;
    if (!root) {
      return undefined;
    }
    const nextOrderById = applyThreadHighlights(root, threads, (thread) => {
      setSelectedQuote('');
      setSelectedRangeOffsets(null);
      setSelectedAnchorSelector(null);
      setSelectionPrompt(null);
      setShowResolved(thread.status === 'resolved');
      setActiveThreadId(thread.id);
      setManualExpanded(true);
    });
    setThreadOrderById(nextOrderById);
    return () => {
      clearDraftQuoteHighlights(root);
      clearThreadHighlights(root);
    };
  }, [enabled, threads, markThreadSeen]);

  useLayoutEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const root = contentRef.current;
    if (!root) {
      return undefined;
    }
    setActiveHighlightInRoot(root, activeThreadId);
  }, [enabled, activeThreadId, threads]);

  useLayoutEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const root = contentRef.current;
    if (!root) {
      return undefined;
    }
    const quote = String(selectedQuote || '').trim();
    if (!quote && !selectedRangeOffsets) {
      clearDraftQuoteHighlights(root);
      return undefined;
    }
    clearDraftQuoteHighlights(root);
    const usedOffsets = applyDraftQuoteHighlightByOffsets(
      root,
      selectedRangeOffsets?.startOffset,
      selectedRangeOffsets?.endOffset
    );
    if (!usedOffsets && quote) {
      applyDraftQuoteHighlight(root, quote);
    }
    return () => {
      clearDraftQuoteHighlights(root);
    };
  }, [enabled, selectedQuote, selectedRangeOffsets, threads]);

  useLayoutEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const root = contentRef.current;
    const quote = String(selectedQuote || '').trim();
    if (!quote) {
      setSelectedQuoteOrder(null);
      return undefined;
    }
    const order = computeQuoteDocumentOrder(root, quote);
    setSelectedQuoteOrder(order);
    return undefined;
  }, [enabled, selectedQuote, threads]);

  useEffect(() => {
    if (!activeThreadId || !isPanelExpanded) {
      return;
    }
    const raf = requestAnimationFrame(() => {
      const threadEl = document.getElementById(`rrc-thread-${activeThreadId}`);
      if (!threadEl) {
        return;
      }
      const newBadge = threadEl.querySelector('.rrc-new-comment-badge');
      const newRow =
        newBadge instanceof HTMLElement ? newBadge.closest('.rrc-comment-row') : null;
      if (newRow instanceof HTMLElement) {
        newRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }
      threadEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [activeThreadId, activeThreadFocusTick, isPanelExpanded, showResolved, visibleThreads.length, seenMap]);

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }
    const root = contentRef.current;
    if (!root) {
      return;
    }
    const matches = elementsWithAnnotationThreadId(root, activeThreadId);
    const target = matches[0];
    if (!(target instanceof HTMLElement)) {
      return;
    }
    expandCollapsedAncestorsForNode(target);
    requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [activeThreadId, activeThreadFocusTick]);

  useEffect(() => {
    function handleClickAway(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (panelRef.current?.contains(target)) {
        return;
      }
      if (target instanceof Element && target.closest('[data-annotation-thread-id]')) {
        return;
      }
      setActiveThreadId('');
    }
    document.addEventListener('mousedown', handleClickAway);
    return () => {
      document.removeEventListener('mousedown', handleClickAway);
    };
  }, []);

  const commitSelectionFromPrompt = useCallback(() => {
    const q = pendingQuoteRef.current;
    if (!q) {
      return;
    }
    skipNextContentMouseUpRef.current = true;
    lastAddCommentCommitAtRef.current =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    setSelectedQuote(q);
    setSelectedRangeOffsets(pendingRangeOffsetsRef.current);
    setSelectedAnchorSelector(pendingAnchorSelectorRef.current);
    setSelectedQuoteOrder(null);
    setShowResolved(false);
    setActiveThreadId('');
    setManualExpanded(true);
    setSelectionPrompt(null);
    pendingQuoteRef.current = '';
    pendingRangeOffsetsRef.current = null;
    pendingAnchorSelectorRef.current = null;
    if (typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges();
    }
  }, []);

  const [addCommentShortcutHint, setAddCommentShortcutHint] = useState('');

  useEffect(() => {
    if (typeof navigator === 'undefined') {
      return;
    }
    setAddCommentShortcutHint(
      /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌥M' : 'Alt+M'
    );
  }, []);

  useEffect(() => {
    if (!enabled || !selectionPrompt) {
      return undefined;
    }
    function onKeyDown(e: KeyboardEvent) {
      /* `code` avoids macOS Option+M producing a non-`m` `key` value. */
      if (e.code !== 'KeyM') {
        return;
      }
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) {
        return;
      }
      const t = e.target;
      if (t instanceof HTMLElement) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) {
          return;
        }
      }
      e.preventDefault();
      e.stopPropagation();
      commitSelectionFromPrompt();
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, selectionPrompt, commitSelectionFromPrompt]);

  if (!enabled) {
    return children;
  }

  function handleCollapsePanel() {
    if (activeThreadId) {
      const t = threads.find((th) => th.id === activeThreadId);
      if (t) {
        markThreadSeen(activeThreadId, t.updated_at ?? t.updatedAt);
      }
    }
    setManualExpanded(false);
    setSelectedQuote('');
    setSelectedRangeOffsets(null);
    setSelectedAnchorSelector(null);
    setSelectionPrompt(null);
    if (typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges();
    }
  }

  function containsNode(root: Element | null | undefined, node: Node | null | undefined) {
    if (!root || !node) {
      return false;
    }
    return root === node || root.contains(node);
  }

  function handleMouseUp() {
    if (typeof window === 'undefined') {
      return;
    }
    if (skipNextContentMouseUpRef.current) {
      skipNextContentMouseUpRef.current = false;
      return;
    }
    const selection = window.getSelection();
    const text = selection?.toString()?.trim() || '';
    if (!text) {
      setSelectionPrompt(null);
      pendingQuoteRef.current = '';
      pendingRangeOffsetsRef.current = null;
      pendingAnchorSelectorRef.current = null;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const committedAt = lastAddCommentCommitAtRef.current;
      if (committedAt != null && now - committedAt < 600) {
        setActiveThreadId('');
        return;
      }
      setSelectedQuote('');
      setSelectedRangeOffsets(null);
      setSelectedAnchorSelector(null);
      setActiveThreadId('');
      return;
    }
    const root = contentRef.current;
    const selectionRoot =
      root?.querySelector?.('#main-content') ||
      root?.querySelector?.('main[role="main"]') ||
      root?.querySelector?.('main') ||
      root;
    const anchorInside = containsNode(selectionRoot, selection?.anchorNode);
    const focusInside = containsNode(selectionRoot, selection?.focusNode);
    if (!anchorInside || !focusInside) {
      return;
    }
    const slice = text.slice(0, ANNOTATION_MAX_QUOTE_LEN);
    pendingQuoteRef.current = slice;
    setSelectedQuote('');
    setSelectedRangeOffsets(null);
    setSelectedAnchorSelector(null);
    setActiveThreadId('');
    setShowResolved(false);
    if (!selection || selection.rangeCount < 1) {
      return;
    }
    try {
      const range = selection.getRangeAt(0);
      pendingRangeOffsetsRef.current = computeRangeOffsetsInAnnotationRoot(selectionRoot, range);
      pendingAnchorSelectorRef.current = buildSelectionAnchorSelector(
        selectionRoot,
        range,
        slice,
        pendingRangeOffsetsRef.current
      );
      const rect = rangeAnchorRect(range);
      setSelectionPrompt({
        quote: slice,
        ...computeSelectionPromptPosition(rect),
      });
    } catch (_err) {
      setSelectionPrompt(null);
    }
  }

  const draftInsertIndex = useMemo(() => {
    if (!selectedQuote || showResolved) {
      return null;
    }
    if (selectedQuoteOrder == null || !Number.isFinite(selectedQuoteOrder)) {
      return null;
    }
    for (let i = 0; i < visibleThreads.length; i += 1) {
      const pos = threadOrderById[visibleThreads[i].id];
      if (Number.isFinite(pos) && pos > selectedQuoteOrder) {
        return i;
      }
    }
    return visibleThreads.length;
  }, [selectedQuote, showResolved, selectedQuoteOrder, visibleThreads, threadOrderById]);

  useEffect(() => {
    if (!selectedQuote || !isPanelExpanded) {
      return;
    }
    const el = document.getElementById('rrc-draft-composer');
    if (!el) {
      return;
    }
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, [selectedQuote, isPanelExpanded, draftInsertIndex]);

  useEffect(() => {
    if (!selectionPrompt) {
      return undefined;
    }
    function onSelChange() {
      const quote = pendingQuoteRef.current;
      if (!quote) {
        return;
      }
      const sel = window.getSelection();
      const tSel = (sel?.toString() || '').trim();
      if (!tSel || tSel.slice(0, ANNOTATION_MAX_QUOTE_LEN) !== quote) {
        setSelectionPrompt(null);
        pendingRangeOffsetsRef.current = null;
        pendingAnchorSelectorRef.current = null;
        return;
      }
      if (!sel || !sel.rangeCount) {
        setSelectionPrompt(null);
        pendingRangeOffsetsRef.current = null;
        pendingAnchorSelectorRef.current = null;
        return;
      }
      try {
        const range = sel.getRangeAt(0);
        const root = contentRef.current;
        const selectionRoot =
          root?.querySelector?.('#main-content') ||
          root?.querySelector?.('main[role="main"]') ||
          root?.querySelector?.('main') ||
          root;
        pendingRangeOffsetsRef.current = computeRangeOffsetsInAnnotationRoot(selectionRoot, range);
        pendingAnchorSelectorRef.current = buildSelectionAnchorSelector(
          selectionRoot,
          range,
          quote,
          pendingRangeOffsetsRef.current
        );
        const r = rangeAnchorRect(range);
        setSelectionPrompt((prev) =>
          prev ? { ...prev, ...computeSelectionPromptPosition(r) } : null
        );
      } catch (_e) {
        setSelectionPrompt(null);
      }
    }
    document.addEventListener('selectionchange', onSelChange);
    return () => document.removeEventListener('selectionchange', onSelChange);
  }, [selectionPrompt]);

  useEffect(() => {
    if (!selectionPrompt) {
      return undefined;
    }
    function updateAnchor() {
      const quote = pendingQuoteRef.current;
      if (!quote) {
        return;
      }
      const sel = window.getSelection();
      if (!sel?.rangeCount) {
        setSelectionPrompt(null);
        pendingRangeOffsetsRef.current = null;
        pendingAnchorSelectorRef.current = null;
        return;
      }
      const tSel = (sel.toString() || '').trim();
      if (!tSel || tSel.slice(0, ANNOTATION_MAX_QUOTE_LEN) !== quote) {
        return;
      }
      try {
        const range = sel.getRangeAt(0);
        const root = contentRef.current;
        const selectionRoot =
          root?.querySelector?.('#main-content') ||
          root?.querySelector?.('main[role="main"]') ||
          root?.querySelector?.('main') ||
          root;
        pendingRangeOffsetsRef.current = computeRangeOffsetsInAnnotationRoot(selectionRoot, range);
        pendingAnchorSelectorRef.current = buildSelectionAnchorSelector(
          selectionRoot,
          range,
          quote,
          pendingRangeOffsetsRef.current
        );
        const r = rangeAnchorRect(range);
        setSelectionPrompt((prev) =>
          prev ? { ...prev, ...computeSelectionPromptPosition(r) } : null
        );
      } catch (_e) {
        setSelectionPrompt(null);
      }
    }
    window.addEventListener('scroll', updateAnchor, true);
    window.addEventListener('resize', updateAnchor);
    return () => {
      window.removeEventListener('scroll', updateAnchor, true);
      window.removeEventListener('resize', updateAnchor);
    };
  }, [selectionPrompt]);

  const showEmptyHint =
    !overviewCountsPending &&
    !threadsPending &&
    threads.length === 0 &&
    !selectedQuote &&
    !selectionPrompt;

  return (
    <Annotorious>
      {/*
        Recogito defaults to annotatingEnabled: true, which records each text selection as a
        draft annotation and paints highlights (see text-annotator.css *::selection and the
        span highlight layer). We drive comments via handleMouseUp + selectionPrompt instead, so
        keep the annotator from storing selection state or leaving highlight nodes behind.
      */}
      <TextAnnotator annotatingEnabled={false}>
        <div className={`rrc-shell-layout rrc-shell-layout--${panelMode} ${themeClassName}`}>
          <div
            ref={contentRef}
            data-annotations-enabled="true"
            className={`rrc-shell-content${isPanelExpanded && selectedQuote ? ' rrc-select-amber' : ''}`}
            onMouseUp={handleMouseUp}
          >
            {children}
          </div>
          <ReviewCommentsPanel
            ref={panelRef}
            panelMode={panelMode}
            isPanelExpanded={isPanelExpanded}
            onExpand={() => setManualExpanded(true)}
            onCollapse={handleCollapsePanel}
            badgeCountsLoading={overviewCountsPending}
            unreadTotal={unreadTotal}
            totalOnPageThreadCount={totalThreadCount}
            totalScopeThreadCount={scopeThreadCount}
            documentsWithComments={documentsWithComments}
            unresolvedThreadCountByDocumentId={unresolvedThreadCountByDocumentId}
            unreadByDocumentId={unreadByDocumentId}
            resolvedCount={resolvedCount}
            showResolved={showResolved}
            onToggleResolved={() => setShowResolved((prev) => !prev)}
            showEmptyHint={showEmptyHint}
            pagesListOpen={pagesListOpen}
            onTogglePagesList={() => setPagesListOpen((prev) => !prev)}
          >
            <ThreadList
              threads={visibleThreads}
              loading={threadsPending}
              locale={locale}
              currentAuthor={author}
              seenMap={seenMap}
              activeThreadId={activeThreadId}
              onThreadFocus={(thread) => {
                setSelectedQuote('');
                setSelectedRangeOffsets(null);
                setSelectedAnchorSelector(null);
                setSelectionPrompt(null);
                setActiveThreadId(thread.id);
                setActiveThreadFocusTick((prev) => prev + 1);
              }}
              onReplyCancel={() => setActiveThreadId('')}
              onReply={async ({ threadId, comment, clear }) => {
                const response = await api.createComment({ threadId, comment, createdBy: author });
                clear();
                setThreads((prev) =>
                  prev.map((thread) =>
                    thread.id === threadId
                      ? { ...thread, comments: [...thread.comments, response.comment] }
                      : thread
                  )
                );
                markThreadSeen(
                  threadId,
                  response.comment.created_at ?? response.comment.createdAt ?? new Date().toISOString()
                );
              }}
              onEditComment={async ({ threadId, commentId, body }) => {
                const response = await api.patchComment(commentId, body);
                setThreads((prev) =>
                  prev.map((thread) =>
                    thread.id === threadId
                      ? {
                        ...thread,
                        comments: thread.comments.map((comment) =>
                          comment.id === commentId ? response.comment : comment
                        ),
                      }
                      : thread
                  )
                );
              }}
              onDeleteComment={async ({ threadId, commentId }) => {
                await api.deleteComment(commentId);
                setThreads((prev) =>
                  prev
                    .map((thread) =>
                      thread.id === threadId
                        ? {
                          ...thread,
                          comments: thread.comments.filter((comment) => comment.id !== commentId),
                        }
                        : thread
                    )
                    .filter((thread) => thread.comments.length > 0)
                );
              }}
              onToggleResolved={async (threadId, status) => {
                await api.patchThreadStatus(threadId, status);
                setThreads((prev) =>
                  prev.map((thread) => (thread.id === threadId ? { ...thread, status } : thread))
                );
              }}
              onDraftStateChange={setReplyDraftActive}
              emptyLabel={showResolved ? labels.noResolvedThreads : ''}
              draftInsertIndex={draftInsertIndex}
              draftComposer={
                !showResolved && selectedQuote ? (
                  <SelectionComposer
                    path={path}
                    locale={locale}
                    author={author}
                    updateAuthor={updateAuthor}
                    selectedQuote={selectedQuote}
                    selectedAnchorSelector={selectedAnchorSelector || { quote: selectedQuote }}
                    selectedStartOffset={selectedRangeOffsets?.startOffset ?? null}
                    selectedEndOffset={selectedRangeOffsets?.endOffset ?? null}
                    onCancel={() => {
                      setSelectedQuote('');
                      setSelectedRangeOffsets(null);
                      setSelectedAnchorSelector(null);
                      setSelectionPrompt(null);
                      setActiveThreadId('');
                      if (typeof window !== 'undefined') {
                        const selection = window.getSelection();
                        selection?.removeAllRanges();
                      }
                    }}
                    onThreadCreated={() => {
                      setSelectedQuote('');
                      setSelectedRangeOffsets(null);
                      setSelectedAnchorSelector(null);
                      setSelectionPrompt(null);
                      if (typeof window !== 'undefined') {
                        const selection = window.getSelection();
                        selection?.removeAllRanges();
                      }
                    }}
                    onCreated={(thread) => {
                      setThreads((prev) => [...prev, thread]);
                      markThreadSeen(thread.id, thread.updated_at ?? thread.updatedAt);
                    }}
                    onDraftStateChange={setSelectionDraftActive}
                  />
                ) : null
              }
            />
          </ReviewCommentsPanel>
        </div>
        {selectionPrompt ? (
          <div
            ref={selectionPromptRef}
            className={`rrc-root rrc-selection-prompt ${themeClassName}`}
            style={{ top: selectionPrompt.top, left: selectionPrompt.left }}
          >
            <button
              type="button"
              aria-label={
                addCommentShortcutHint
                  ? `${labels.addComment} (${addCommentShortcutHint})`
                  : labels.addComment
              }
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                commitSelectionFromPrompt();
              }}
            >
              {labels.addComment}
              {addCommentShortcutHint ? (
                <span className="rrc-selection-prompt-kbd"> {addCommentShortcutHint}</span>
              ) : null}
            </button>
          </div>
        ) : null}
      </TextAnnotator>
    </Annotorious>
  );
}
