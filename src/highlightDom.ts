import { normalizeQuoteMatchText, scrubAnnotationQuoteText } from '../shared/sanitize';
import type { RrcThread } from './types';

/** Vendor-prefixed box-decoration-break (TS DOM lib omits these). */
type ExtendedSpanStyle = CSSStyleDeclaration & {
  boxDecorationBreak?: string;
  webkitBoxDecorationBreak?: string;
};

export function isAnnotationHighlightDebugEnabled(): boolean {
  return false;
}

function snippet(str: unknown, head = 96, tail = 48): string {
  if (str == null || typeof str !== 'string') {
    return String(str);
  }
  if (str.length <= head + tail + 5) {
    return str;
  }
  return `${str.slice(0, head)} …[${str.length} chars]… ${str.slice(-tail)}`;
}

function logHighlight(_stage: string, _payload: Record<string, unknown>): void {}

/** First index where a and b differ; -1 if equal up to min length. */
function firstDiffIndex(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) {
      return i;
    }
  }
  return a.length === b.length ? -1 : n;
}

export function clearThreadHighlights(root: Element | null | undefined): void {
  if (!root) {
    return;
  }
  threadHoverCounts.clear();
  const highlights = root.querySelectorAll('span[data-annotation-thread-id]');
  highlights.forEach((node) => {
    const parent = node.parentNode;
    if (!parent) {
      return;
    }
    parent.replaceChild(document.createTextNode(node.textContent || ''), node);
    parent.normalize();
  });
}

/** Inline quote highlights (thread spans + draft quote); same palette as setActiveHighlightInRoot / attachHighlightSpan */
const ANNOTATION_HIGHLIGHT_INACTIVE = 'rgba(251, 191, 36, 0.35)';
const ANNOTATION_HIGHLIGHT_ACTIVE = 'rgba(245, 158, 11, 0.62)';
const ANNOTATION_HIGHLIGHT_ACTIVE_HOVER = 'rgba(245, 158, 11, 0.72)';
const ANNOTATION_HIGHLIGHT_INACTIVE_HOVER = 'rgba(245, 158, 11, 0.5)';
const threadHoverCounts = new Map();

export function clearDraftQuoteHighlights(root: Element | null | undefined): void {
  if (!root) {
    return;
  }
  const drafts = root.querySelectorAll('span[data-annotation-draft]');
  drafts.forEach((node) => {
    const parent = node.parentNode;
    if (!parent) {
      return;
    }
    parent.replaceChild(document.createTextNode(node.textContent || ''), node);
    parent.normalize();
  });
}

function attachDraftQuoteSpan(span: HTMLSpanElement): void {
  span.dataset.annotationDraft = 'true';
  span.style.setProperty('background-color', ANNOTATION_HIGHLIGHT_ACTIVE, 'important');
  span.style.borderRadius = '2px';
  const st = span.style as ExtendedSpanStyle;
  st.boxDecorationBreak = 'clone';
  st.webkitBoxDecorationBreak = 'clone';
  span.title = '';
  span.addEventListener('mouseenter', () => {
    span.style.setProperty('background-color', ANNOTATION_HIGHLIGHT_ACTIVE_HOVER, 'important');
  });
  span.addEventListener('mouseleave', () => {
    span.style.setProperty('background-color', ANNOTATION_HIGHLIGHT_ACTIVE, 'important');
  });
}

function wrapRangeWithDraftQuoteSpan(range: Range): void {
  const span = document.createElement('span');
  attachDraftQuoteSpan(span);
  try {
    range.surroundContents(span);
  } catch (_err) {
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }
}

function wrapMatchAcrossTextNodes(
  textNodes: Text[],
  matchStart: number,
  matchEnd: number,
  wrapRange: (range: Range) => void
): boolean {
  if (!Array.isArray(textNodes) || textNodes.length === 0 || matchEnd <= matchStart) {
    return false;
  }
  let wrappedAny = false;
  let cursor = 0;
  for (const node of textNodes) {
    const len = node.nodeValue?.length ?? 0;
    const nodeStart = cursor;
    const nodeEnd = cursor + len;
    cursor = nodeEnd;
    if (matchEnd <= nodeStart) {
      break;
    }
    if (matchStart >= nodeEnd) {
      continue;
    }
    const localStart = Math.max(0, matchStart - nodeStart);
    const localEnd = Math.min(len, matchEnd - nodeStart);
    if (localEnd <= localStart) {
      continue;
    }
    const segmentRange = document.createRange();
    segmentRange.setStart(node, localStart);
    segmentRange.setEnd(node, localEnd);
    wrapRange(segmentRange);
    wrappedAny = true;
  }
  return wrappedAny;
}

/**
 * Offsets are in "spaced" string: textNodes.map(n => n.nodeValue).join(' ');
 * Used when selection.toString() inserts word boundaries between blocks but join('') does not.
 */
function wrapMatchAcrossSpacedTextNodes(
  textNodes: Text[],
  matchStart: number,
  matchEnd: number,
  wrapRange: (range: Range) => void
): boolean {
  if (!Array.isArray(textNodes) || textNodes.length === 0 || matchEnd <= matchStart) {
    return false;
  }
  let wrappedAny = false;
  let cursor = 0;
  for (let i = 0; i < textNodes.length; i += 1) {
    const node = textNodes[i];
    const len = node.nodeValue?.length ?? 0;
    const nodeStart = cursor;
    const nodeEnd = cursor + len;
    cursor = nodeEnd;
    if (i < textNodes.length - 1) {
      cursor += 1;
    }
    if (matchEnd <= nodeStart) {
      break;
    }
    if (matchStart >= nodeEnd) {
      continue;
    }
    const localStart = Math.max(0, matchStart - nodeStart);
    const localEnd = Math.min(len, matchEnd - nodeStart);
    if (localEnd <= localStart) {
      continue;
    }
    const segmentRange = document.createRange();
    segmentRange.setStart(node, localStart);
    segmentRange.setEnd(node, localEnd);
    wrapRange(segmentRange);
    wrappedAny = true;
  }
  return wrappedAny;
}

/** First character index in compact join('') for a given index into spaced join(' '). */
function spacedIndexToCompactOffset(textNodes: Text[], spacedIndex: number): number {
  let s = 0;
  for (let i = 0; i < textNodes.length; i += 1) {
    const len = textNodes[i]?.nodeValue?.length ?? 0;
    if (spacedIndex < s + len) {
      let compact = 0;
      for (let j = 0; j < i; j += 1) {
        compact += textNodes[j]?.nodeValue?.length ?? 0;
      }
      return compact + (spacedIndex - s);
    }
    s += len;
    if (i < textNodes.length - 1) {
      s += 1;
    }
  }
  return 0;
}

/** Above this, RegExp construction becomes slow and can fail on some engines. */
const MAX_REGEX_WORDS = 200;
const CONTEXT_WINDOW_CHARS = 160;

/**
 * Detailed reason long spaced matcher failed (indexOf vs mapping).
 * Must stay below mapNormTrimmedRangeToRawExclusive in source order is not required at runtime.
 */
function logLongQuoteSpacedMiss(spaced: string, quoteRaw: string): void {
  if (!isAnnotationHighlightDebugEnabled()) {
    return;
  }
  const q = scrubAnnotationQuoteText(quoteRaw);
  if (!q) {
    logHighlight('miss: longQuote+spaced', { reason: 'empty q after scrub' });
    return;
  }
  const normSpaced = normalizeQuoteMatchText(spaced);
  const normIdx = normSpaced.indexOf(q);
  if (normIdx === -1) {
    const take = Math.min(q.length, normSpaced.length);
    const prefixA = normSpaced.slice(0, take);
    const prefixB = q.slice(0, take);
    logHighlight('miss: longQuote+spaced', {
      reason: 'indexOf === -1 (quote not found in normalized spaced DOM text)',
      qLen: q.length,
      normSpacedLen: normSpaced.length,
      firstDiffInComparablePrefix: firstDiffIndex(prefixA, prefixB),
      normSpacedHead: snippet(normSpaced, 160, 80),
      qHead: snippet(q, 160, 80),
    });
    return;
  }
  const span = mapNormTrimmedRangeToRawExclusive(spaced, normIdx, normIdx + q.length);
  if (!span) {
    logHighlight('miss: longQuote+spaced', {
      reason: 'mapNormTrimmedRangeToRawExclusive returned null',
      normIdx,
      qLen: q.length,
    });
  }
}

function logLongQuoteCompactMiss(compact: string, quoteRaw: string): void {
  if (!isAnnotationHighlightDebugEnabled()) {
    return;
  }
  const q = scrubAnnotationQuoteText(quoteRaw);
  if (!q) {
    logHighlight('miss: longQuote+compact', { reason: 'empty q after scrub' });
    return;
  }
  const normCompact = normalizeQuoteMatchText(compact);
  const normIdx = normCompact.indexOf(q);
  if (normIdx === -1) {
    const take = Math.min(q.length, normCompact.length);
    logHighlight('miss: longQuote+compact', {
      reason: 'indexOf === -1',
      qLen: q.length,
      normCompactLen: normCompact.length,
      firstDiffInComparablePrefix: firstDiffIndex(normCompact.slice(0, take), q.slice(0, take)),
      normCompactHead: snippet(normCompact, 160, 80),
      qHead: snippet(q, 160, 80),
    });
    return;
  }
  const span = mapNormTrimmedRangeToRawExclusive(compact, normIdx, normIdx + q.length);
  if (!span) {
    logHighlight('miss: longQuote+compact', {
      reason: 'mapNormTrimmedRangeToRawExclusive returned null',
      normIdx,
      qLen: q.length,
    });
  }
}

/**
 * Try compact DOM text first (join text nodes). If that fails, try spaced join (simulates
 * block boundaries that appear in selection.toString() / scrubbed quotes).
 */
function findQuoteMatchForDom(
  textNodes: Text[],
  quoteRaw: string
): {
  mode: 'compact' | 'spaced';
  match: { start: number; end: number };
  compactStart: number;
} | null {
  const compact = textNodes.map((n) => n.nodeValue).join('');
  const spaced = textNodes.map((n) => n.nodeValue).join(' ');
  const q = scrubAnnotationQuoteText(quoteRaw);

  let match = findFlexibleQuoteMatch(compact, quoteRaw);
  if (match) {
    logHighlight('match: flexibleRegex+compact', { textNodeCount: textNodes.length, mode: 'compact', match });
    return { mode: 'compact', match, compactStart: match.start };
  }
  logHighlight('miss: flexibleRegex+compact', {
    textNodeCount: textNodes.length,
    compactLen: compact.length,
    qLen: q ? q.length : 0,
    regexWordCount: q ? q.split(/\s+/).filter(Boolean).length : 0,
    overRegexWordCap: q ? q.split(/\s+/).filter(Boolean).length > MAX_REGEX_WORDS : false,
  });

  match = findFlexibleQuoteMatch(spaced, quoteRaw);
  if (match) {
    logHighlight('match: flexibleRegex+spaced', { textNodeCount: textNodes.length, mode: 'spaced', match });
    return {
      mode: 'spaced',
      match,
      compactStart: spacedIndexToCompactOffset(textNodes, match.start),
    };
  }
  logHighlight('miss: flexibleRegex+spaced', { spacedLen: spaced.length, qLen: q ? q.length : 0 });

  match = findLongQuoteInSpaced(spaced, quoteRaw);
  if (match) {
    logHighlight('match: longQuote+spaced', { mode: 'spaced', match });
    return {
      mode: 'spaced',
      match,
      compactStart: spacedIndexToCompactOffset(textNodes, match.start),
    };
  }
  logLongQuoteSpacedMiss(spaced, quoteRaw);

  match = findLongQuoteInCompact(compact, quoteRaw);
  if (match) {
    logHighlight('match: longQuote+compact', { mode: 'compact', match });
    return {
      mode: 'compact',
      match,
      compactStart: match.start,
    };
  }
  logLongQuoteCompactMiss(compact, quoteRaw);

  const anchorResult = findQuoteMatchByAnchors(textNodes, spaced, compact, quoteRaw);
  if (anchorResult) {
    logHighlight('match: anchor head+tail', {
      mode: anchorResult.mode,
      match: anchorResult.match,
    });
    return anchorResult;
  }

  logHighlight('miss: all matchers failed', {
    textNodeCount: textNodes.length,
    compactLen: compact.length,
    spacedLen: spaced.length,
    qLen: q ? q.length : 0,
    qHead: q ? snippet(q, 120, 60) : '',
    normCompactHead: snippet(normalizeQuoteMatchText(compact), 120, 60),
    normSpacedHead: snippet(normalizeQuoteMatchText(spaced), 120, 60),
  });
  return null;
}

export function applyDraftQuoteHighlight(root: Element | null | undefined, quoteRaw: string): void {
  if (!root) {
    logHighlight('draft highlight: skip (no root)', {});
    return;
  }
  const quote = String(quoteRaw || '').trim();
  if (!quote) {
    logHighlight('draft highlight: skip (empty quote)', {});
    return;
  }
  const scrubbed = scrubAnnotationQuoteText(quote);
  if (!scrubbed) {
    logHighlight('draft highlight: skip (empty after scrub)', { rawLen: quote.length });
    return;
  }
  const textNodes = collectAnnotationTextNodes(root);
  logHighlight('draft highlight: input', {
    textNodeCount: textNodes.length,
    quoteLen: quote.length,
    scrubbedLen: scrubbed.length,
  });
  const result = findQuoteMatchForDom(textNodes, quote);
  if (!result) {
    logHighlight('draft highlight: abort — no DOM match (no yellow highlight)', {});
    return;
  }
  let wrappedAny = false;
  if (result.mode === 'compact') {
    wrappedAny = wrapMatchAcrossTextNodes(textNodes, result.match.start, result.match.end, (range) => {
      wrapRangeWithDraftQuoteSpan(range);
    });
  } else {
    wrappedAny = wrapMatchAcrossSpacedTextNodes(textNodes, result.match.start, result.match.end, (range) => {
      wrapRangeWithDraftQuoteSpan(range);
    });
  }
  if (!wrappedAny && isAnnotationHighlightDebugEnabled()) {
    console.warn('[annotations:highlight] draft highlight: match found but wrap produced no spans', {
      mode: result.mode,
      match: result.match,
    });
  }
}

export function applyDraftQuoteHighlightByOffsets(
  root: Element | null | undefined,
  startOffset: number | null | undefined,
  endOffset: number | null | undefined
): boolean {
  if (!root || !Number.isInteger(startOffset) || !Number.isInteger(endOffset)) {
    return false;
  }
  const start = Number(startOffset);
  const end = Number(endOffset);
  if (start < 0 || end <= start) {
    return false;
  }
  const textNodes = collectAnnotationTextNodes(root);
  return wrapMatchAcrossTextNodes(textNodes, start, end, (range) => {
    wrapRangeWithDraftQuoteSpan(range);
  });
}

export function setActiveHighlightInRoot(
  root: Element | null | undefined,
  activeThreadId: string
): void {
  if (!root) {
    return;
  }
  const highlights = root.querySelectorAll('span[data-annotation-thread-id]');
  highlights.forEach((node) => {
    const el = node as HTMLElement;
    const isActive = el.dataset.annotationThreadId === activeThreadId;
    el.dataset.annotationActive = isActive ? 'true' : 'false';
    el.style.setProperty(
      'background-color',
      isActive ? ANNOTATION_HIGHLIGHT_ACTIVE : ANNOTATION_HIGHLIGHT_INACTIVE,
      'important'
    );
  });
}

export function escapeAttrValue(value: string): string {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Avoid dynamic `querySelector` strings with user-controlled ids (selector injection). */
export function elementsWithAnnotationThreadId(
  root: Document | Element,
  threadId: string
): HTMLElement[] {
  return Array.from(root.querySelectorAll('span[data-annotation-thread-id]')).filter(
    (node): node is HTMLElement =>
      node instanceof HTMLElement && node.dataset.annotationThreadId === threadId
  );
}

export function computeSelectionPromptPosition(rect: DOMRect): {
  top: number;
  left: number;
} {
  const margin = 8;
  const gap = 8;
  const approxBtnHeight = 40;
  const approxBtnWidth = 148;
  let top = rect.bottom + gap;
  if (top + approxBtnHeight > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - gap - approxBtnHeight);
  }
  let left = rect.left;
  left = Math.max(margin, Math.min(left, window.innerWidth - approxBtnWidth - margin));
  return { top, left };
}

/** Some browsers return a zero rect for very large multi-block ranges; union client rects instead. */
export function rangeAnchorRect(range: Range | null | undefined): DOMRect {
  if (!range) {
    return new DOMRect(0, 0, 0, 0);
  }
  const rect = range.getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) {
    return rect;
  }
  const rects = range.getClientRects();
  if (rects.length === 0) {
    return rect;
  }
  let top = Infinity;
  let left = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    if (r.width === 0 && r.height === 0) {
      continue;
    }
    top = Math.min(top, r.top);
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  if (top === Infinity) {
    return rects[0] as DOMRect;
  }
  return new DOMRect(left, top, right - left, bottom - top);
}

export function computeRangeOffsetsInAnnotationRoot(
  root: Element | null | undefined,
  range: Range | null | undefined
): { startOffset: number; endOffset: number } | null {
  const searchRoot = getAnnotationTextSearchRoot(root);
  if (!searchRoot || !range) {
    return null;
  }
  if (!searchRoot.contains(range.startContainer) || !searchRoot.contains(range.endContainer)) {
    return null;
  }
  const textNodes = collectAnnotationTextNodes(root);
  if (!textNodes.length) {
    return null;
  }
  let cursor = 0;
  let startOffset = -1;
  let endOffset = -1;
  for (const node of textNodes) {
    const len = node.nodeValue?.length ?? 0;
    if (startOffset === -1 && node === range.startContainer) {
      startOffset = cursor + range.startOffset;
    }
    if (endOffset === -1 && node === range.endContainer) {
      endOffset = cursor + range.endOffset;
    }
    cursor += len;
  }
  if (startOffset < 0 || endOffset <= startOffset) {
    return null;
  }
  return { startOffset, endOffset };
}

function getCompactAnnotationText(root: Element | null | undefined): string {
  const textNodes = collectAnnotationTextNodes(root);
  return textNodes.map((n) => n.nodeValue || '').join('');
}

export function buildSelectionAnchorSelector(
  root: Element | null | undefined,
  range: Range | null | undefined,
  quoteRaw: string,
  offsets: { startOffset: number; endOffset: number } | null
): Record<string, unknown> {
  const quote = String(quoteRaw || '').trim();
  const anchor: Record<string, unknown> = { quote };
  if (offsets) {
    anchor.startOffset = offsets.startOffset;
    anchor.endOffset = offsets.endOffset;
  }
  if (!root || !range) {
    return anchor;
  }
  const compactText = getCompactAnnotationText(root);
  if (!compactText) {
    return anchor;
  }
  const start = offsets?.startOffset;
  const end = offsets?.endOffset;
  if (!Number.isInteger(start) || !Number.isInteger(end) || Number(end) <= Number(start)) {
    return anchor;
  }
  const s = Number(start);
  const e = Number(end);
  anchor.contextBefore = compactText.slice(Math.max(0, s - CONTEXT_WINDOW_CHARS), s);
  anchor.contextAfter = compactText.slice(e, Math.min(compactText.length, e + CONTEXT_WINDOW_CHARS));
  return anchor;
}

export function expandCollapsedAncestorsForNode(node: Node | null | undefined): void {
  if (!node || typeof document === 'undefined') {
    return;
  }
  const ancestors: HTMLElement[] = [];
  let current = node.parentElement;
  while (current && current !== document.body) {
    ancestors.push(current);
    current = current.parentElement;
  }

  ancestors.reverse().forEach((ancestor) => {
    if (ancestor instanceof HTMLDetailsElement && !ancestor.open) {
      ancestor.open = true;
    }
    if (!ancestor.id) {
      return;
    }
    const id = escapeAttrValue(ancestor.id);
    const trigger = document.querySelector(
      `[aria-controls="${id}"][aria-expanded="false"]`
    );
    if (trigger instanceof HTMLElement) {
      trigger.click();
    }
  });
}

function escapeRegexChars(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Walk only the primary article/main region. The annotation `root` wraps the whole page
 * (skip link, nav, footer, etc.); selection and highlights refer to article text only.
 */
function getAnnotationTextSearchRoot(root: Element | null | undefined): Element | null | undefined {
  if (!root || typeof root.querySelector !== 'function') {
    return root;
  }
  const main =
    root.querySelector('#main-content') ||
    root.querySelector('main[role="main"]') ||
    root.querySelector('article') ||
    root.querySelector('main');
  if (main instanceof HTMLElement && root.contains(main)) {
    return main;
  }
  return root;
}

/**
 * Text nodes in order, excluding scripts only.
 * Include whitespace-only nodes so concatenation matches the DOM.
 */
function collectAnnotationTextNodes(root: Element | null | undefined): Text[] {
  const searchRoot = getAnnotationTextSearchRoot(root);
  if (!searchRoot) {
    return [];
  }
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(searchRoot, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parentTag = node.parentElement?.tagName;
      if (parentTag === 'SCRIPT' || parentTag === 'STYLE' || parentTag === 'NOSCRIPT') {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walker.nextNode()) {
    const cur = walker.currentNode;
    if (cur.nodeType === Node.TEXT_NODE) {
      nodes.push(cur as Text);
    }
  }
  return nodes;
}

function findFlexibleQuoteMatch(
  fullText: string,
  quoteRaw: string
): { start: number; end: number } | null {
  const q = scrubAnnotationQuoteText(quoteRaw);
  if (!q) {
    return null;
  }
  const parts = q.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  if (parts.length > MAX_REGEX_WORDS) {
    return null;
  }
  const pattern = parts.map(escapeRegexChars).join('\\s+');
  const re = new RegExp(pattern, 'u');
  const m = re.exec(fullText);
  if (!m) {
    return null;
  }
  return { start: m.index, end: m.index + m[0].length };
}

function findFlexibleQuoteMatches(
  fullText: string,
  quoteRaw: string,
  maxMatches = 80
): Array<{ start: number; end: number }> {
  const q = scrubAnnotationQuoteText(quoteRaw);
  if (!q) {
    return [];
  }
  const parts = q.split(/\s+/).filter(Boolean);
  if (!parts.length || parts.length > MAX_REGEX_WORDS) {
    return [];
  }
  const pattern = parts.map(escapeRegexChars).join('\\s+');
  const re = new RegExp(pattern, 'gu');
  const matches: Array<{ start: number; end: number }> = [];
  let m = re.exec(fullText);
  while (m && matches.length < maxMatches) {
    matches.push({ start: m.index, end: m.index + m[0].length });
    const bump = Math.max(1, m[0]?.length || 1);
    re.lastIndex = m.index + bump;
    m = re.exec(fullText);
  }
  return matches;
}

function suffixOverlapLen(text: string, expectedTail: string): number {
  const t = normalizeQuoteMatchText(text);
  const e = normalizeQuoteMatchText(expectedTail);
  if (!t || !e) {
    return 0;
  }
  const max = Math.min(t.length, e.length);
  for (let len = max; len > 0; len -= 1) {
    if (t.slice(-len) === e.slice(-len)) {
      return len;
    }
  }
  return 0;
}

function prefixOverlapLen(text: string, expectedHead: string): number {
  const t = normalizeQuoteMatchText(text);
  const e = normalizeQuoteMatchText(expectedHead);
  if (!t || !e) {
    return 0;
  }
  const max = Math.min(t.length, e.length);
  for (let len = max; len > 0; len -= 1) {
    if (t.slice(0, len) === e.slice(0, len)) {
      return len;
    }
  }
  return 0;
}

function resolveQuoteMatchByContext(
  textNodes: Text[],
  thread: RrcThread
): {
  mode: 'compact';
  match: { start: number; end: number };
  compactStart: number;
} | null {
  const quoteRaw = String(thread.quote_text || '').trim();
  if (!quoteRaw) {
    return null;
  }
  const anchor = thread.anchor_selector;
  const contextBefore =
    anchor && typeof anchor === 'object' && typeof anchor.contextBefore === 'string'
      ? anchor.contextBefore
      : '';
  const contextAfter =
    anchor && typeof anchor === 'object' && typeof anchor.contextAfter === 'string'
      ? anchor.contextAfter
      : '';
  if (!contextBefore && !contextAfter) {
    return null;
  }
  const compact = textNodes.map((n) => n.nodeValue || '').join('');
  const matches = findFlexibleQuoteMatches(compact, quoteRaw);
  if (matches.length < 2) {
    return null;
  }
  const offsetHint = Number.isInteger(thread.start_offset) ? Number(thread.start_offset) : null;
  let best: { start: number; end: number } | null = null;
  let bestScore = -1;
  for (const match of matches) {
    const beforeSample = compact.slice(Math.max(0, match.start - CONTEXT_WINDOW_CHARS), match.start);
    const afterSample = compact.slice(match.end, Math.min(compact.length, match.end + CONTEXT_WINDOW_CHARS));
    const beforeScore = contextBefore ? suffixOverlapLen(beforeSample, contextBefore) : 0;
    const afterScore = contextAfter ? prefixOverlapLen(afterSample, contextAfter) : 0;
    let score = beforeScore + afterScore;
    if (offsetHint != null) {
      const drift = Math.abs(match.start - offsetHint);
      score += Math.max(0, 30 - Math.min(30, Math.floor(drift / 4)));
    }
    if (score > bestScore) {
      bestScore = score;
      best = match;
    }
  }
  if (!best || bestScore <= 0) {
    return null;
  }
  return {
    mode: 'compact',
    match: best,
    compactStart: best.start,
  };
}

/**
 * Map indices in normalizeQuoteMatchText(raw) back to [start, end) offsets in raw.
 * Mirrors scrubText: control chars to space, then collapse whitespace (same as normalizeQuoteMatchText).
 */
function mapNormTrimmedRangeToRawExclusive(
  raw: string,
  normStart: number,
  normEndExclusive: number
): { start: number; end: number } | null {
  const norm = normalizeQuoteMatchText(raw);
  if (normStart < 0 || normEndExclusive > norm.length || normEndExclusive <= normStart) {
    return null;
  }
  let step1 = '';
  for (let i = 0; i < raw.length; i += 1) {
    let ch = raw[i];
    const c = ch.charCodeAt(0);
    if (c <= 0x1f || c === 0x7f) {
      ch = ' ';
    }
    step1 += ch;
  }
  let collapsed = '';
  const cMap: number[] = [];
  for (let i = 0; i < step1.length; i += 1) {
    const ch = step1[i];
    if (/\s/.test(ch)) {
      if (collapsed.length === 0 || collapsed[collapsed.length - 1] !== ' ') {
        collapsed += ' ';
        cMap[collapsed.length - 1] = i;
      }
    } else {
      collapsed += ch;
      cMap[collapsed.length - 1] = i;
    }
  }
  const trimmed = collapsed.trim();
  if (!trimmed.length) {
    return null;
  }
  const lead = collapsed.indexOf(trimmed[0]);
  if (lead < 0) {
    return null;
  }
  const absStart = lead + normStart;
  const absEndChar = lead + normEndExclusive - 1;
  if (absStart < 0 || absStart >= collapsed.length || absEndChar < absStart || absEndChar >= collapsed.length) {
    return null;
  }
  const rawStart = cMap[absStart];
  const rawEnd = cMap[absEndChar] + 1;
  return { start: rawStart, end: rawEnd };
}

/**
 * Long quotes: substring on normalizeQuoteMatchText(spaced) (same pipeline as scrubbed quotes).
 */
function findLongQuoteInSpaced(spaced: string, quoteRaw: string): { start: number; end: number } | null {
  const q = scrubAnnotationQuoteText(quoteRaw);
  if (!q) {
    return null;
  }
  const normSpaced = normalizeQuoteMatchText(spaced);
  const normIdx = normSpaced.indexOf(q);
  if (normIdx === -1) {
    return null;
  }
  const span = mapNormTrimmedRangeToRawExclusive(spaced, normIdx, normIdx + q.length);
  if (!span) {
    return null;
  }
  return { start: span.start, end: span.end };
}

/**
 * When selection omits spaces that join(' ') inserts between nodes (e.g. inline elements), match on compact concat.
 */
function findLongQuoteInCompact(compact: string, quoteRaw: string): { start: number; end: number } | null {
  const q = scrubAnnotationQuoteText(quoteRaw);
  if (!q) {
    return null;
  }
  const normCompact = normalizeQuoteMatchText(compact);
  const normIdx = normCompact.indexOf(q);
  if (normIdx === -1) {
    return null;
  }
  const span = mapNormTrimmedRangeToRawExclusive(compact, normIdx, normIdx + q.length);
  if (!span) {
    return null;
  }
  return { start: span.start, end: span.end };
}

/** When full quote is not a substring (e.g. duplicated accordion lines in selection), match head+tail. */
const ANCHOR_HEAD_CHARS = 96;
const ANCHOR_TAIL_CHARS = 96;
const ANCHOR_MIN_QUOTE_LEN = ANCHOR_HEAD_CHARS + ANCHOR_TAIL_CHARS + 64;

function findQuoteMatchByAnchors(
  textNodes: Text[],
  spaced: string,
  compact: string,
  quoteRaw: string
): {
  mode: 'compact' | 'spaced';
  match: { start: number; end: number };
  compactStart: number;
} | null {
  const q = scrubAnnotationQuoteText(quoteRaw);
  if (!q || q.length < ANCHOR_MIN_QUOTE_LEN) {
    return null;
  }
  const head = q.slice(0, ANCHOR_HEAD_CHARS);
  const tail = q.slice(-ANCHOR_TAIL_CHARS);

  const tryRaw = (
    raw: string,
    mode: 'spaced' | 'compact'
  ): {
    mode: 'compact' | 'spaced';
    match: { start: number; end: number };
    compactStart: number;
  } | null => {
    const norm = normalizeQuoteMatchText(raw);
    const start = norm.indexOf(head);
    if (start === -1) {
      return null;
    }
    const tailAt = norm.indexOf(tail, start + ANCHOR_HEAD_CHARS);
    if (tailAt === -1) {
      return null;
    }
    const endExclusive = tailAt + tail.length;
    if (endExclusive <= start) {
      return null;
    }
    const span = mapNormTrimmedRangeToRawExclusive(raw, start, endExclusive);
    if (!span) {
      return null;
    }
    if (mode === 'spaced') {
      return {
        mode: 'spaced' as const,
        match: span,
        compactStart: spacedIndexToCompactOffset(textNodes, span.start),
      };
    }
    return {
      mode: 'compact' as const,
      match: span,
      compactStart: span.start,
    };
  };

  return tryRaw(spaced, 'spaced') || tryRaw(compact, 'compact');
}

function attachHighlightSpan(
  span: HTMLSpanElement,
  thread: RrcThread,
  onThreadClick: (thread: RrcThread) => void
): void {
  span.dataset.annotationThreadId = thread.id;
  span.style.setProperty('background-color', ANNOTATION_HIGHLIGHT_INACTIVE, 'important');
  span.style.borderRadius = '2px';
  span.style.cursor = 'pointer';
  span.style.transition = 'background-color 120ms ease';
  const st = span.style as ExtendedSpanStyle;
  st.boxDecorationBreak = 'clone';
  st.webkitBoxDecorationBreak = 'clone';
  span.dataset.annotationActive = 'false';
  span.title = 'Open comment';
  span.addEventListener('mouseenter', () => {
    const nextCount = (threadHoverCounts.get(thread.id) || 0) + 1;
    threadHoverCounts.set(thread.id, nextCount);
    const allThreadSpans = elementsWithAnnotationThreadId(document, thread.id);
    allThreadSpans.forEach((node) => {
      const el = node as HTMLElement;
      const isActive = el.dataset.annotationActive === 'true';
      el.style.setProperty(
        'background-color',
        isActive ? ANNOTATION_HIGHLIGHT_ACTIVE_HOVER : ANNOTATION_HIGHLIGHT_INACTIVE_HOVER,
        'important'
      );
    });
  });
  span.addEventListener('mouseleave', () => {
    const currentCount = threadHoverCounts.get(thread.id) || 0;
    const nextCount = Math.max(0, currentCount - 1);
    if (nextCount > 0) {
      threadHoverCounts.set(thread.id, nextCount);
      return;
    }
    threadHoverCounts.delete(thread.id);
    const allThreadSpans = elementsWithAnnotationThreadId(document, thread.id);
    allThreadSpans.forEach((node) => {
      const el = node as HTMLElement;
      const isActive = el.dataset.annotationActive === 'true';
      el.style.setProperty(
        'background-color',
        isActive ? ANNOTATION_HIGHLIGHT_ACTIVE : ANNOTATION_HIGHLIGHT_INACTIVE,
        'important'
      );
    });
  });
  span.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onThreadClick(thread);
  });
}

function wrapRangeWithHighlightSpan(
  range: Range,
  thread: RrcThread,
  onThreadClick: (thread: RrcThread) => void
): void {
  const span = document.createElement('span');
  attachHighlightSpan(span, thread, onThreadClick);
  try {
    range.surroundContents(span);
  } catch (_err) {
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }
}

/** Same character-offset space as threadOrderById (excludes thread highlight spans). */
export function computeQuoteDocumentOrder(
  root: Element | null | undefined,
  quoteRaw: string
): number | null {
  if (!root) {
    return null;
  }
  const quote = String(quoteRaw || '').trim();
  if (!quote || !scrubAnnotationQuoteText(quote)) {
    return null;
  }
  const textNodes = collectAnnotationTextNodes(root);
  const result = findQuoteMatchForDom(textNodes, quote);
  if (!result) {
    return null;
  }
  return result.compactStart;
}

export function applyThreadHighlights(
  root: Element | null | undefined,
  threads: RrcThread[],
  onThreadClick: (thread: RrcThread) => void
): Record<string, number> {
  if (!root) {
    return {};
  }

  clearDraftQuoteHighlights(root);
  clearThreadHighlights(root);
  const orderByThreadId: Record<string, number> = {};
  const highlightableThreads = threads.filter(
    (t) => t && (t.status || 'open') !== 'resolved'
  );
  const sortedThreads = [...highlightableThreads].sort(
    (a, b) => String(b.quote_text || '').length - String(a.quote_text || '').length
  );

  for (const thread of sortedThreads) {
    const quoteRaw = thread.quote_text;
    if (!scrubAnnotationQuoteText(quoteRaw)) {
      continue;
    }
    const textNodes = collectAnnotationTextNodes(root);
    const hasOffsetMatch =
      Number.isInteger(thread.start_offset) &&
      Number.isInteger(thread.end_offset) &&
      Number(thread.start_offset) >= 0 &&
      Number(thread.end_offset) > Number(thread.start_offset);
    if (hasOffsetMatch) {
      const start = Number(thread.start_offset);
      const end = Number(thread.end_offset);
      const wrapped = wrapMatchAcrossTextNodes(textNodes, start, end, (range) => {
        wrapRangeWithHighlightSpan(range, thread, onThreadClick);
      });
      if (wrapped) {
        orderByThreadId[thread.id] = start;
        continue;
      }
    }
    const contextResult = resolveQuoteMatchByContext(textNodes, thread);
    if (contextResult) {
      orderByThreadId[thread.id] = contextResult.compactStart;
      wrapMatchAcrossTextNodes(
        textNodes,
        contextResult.match.start,
        contextResult.match.end,
        (range) => {
          wrapRangeWithHighlightSpan(range, thread, onThreadClick);
        }
      );
      continue;
    }
    const result = findQuoteMatchForDom(textNodes, quoteRaw);
    if (!result) {
      continue;
    }
    orderByThreadId[thread.id] = result.compactStart;
    if (result.mode === 'compact') {
      wrapMatchAcrossTextNodes(textNodes, result.match.start, result.match.end, (range) => {
        wrapRangeWithHighlightSpan(range, thread, onThreadClick);
      });
    } else {
      wrapMatchAcrossSpacedTextNodes(textNodes, result.match.start, result.match.end, (range) => {
        wrapRangeWithHighlightSpan(range, thread, onThreadClick);
      });
    }
  }
  return orderByThreadId;
}
