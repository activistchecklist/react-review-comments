import { describe, it, expect } from 'vitest';
import {
  applyDraftQuoteHighlightByOffsets,
  applyDraftQuoteHighlight,
  applyThreadHighlights,
  clearDraftQuoteHighlights,
  clearThreadHighlights,
  computeRangeOffsetsInAnnotationRoot,
  computeQuoteDocumentOrder,
} from './highlightDom';
import type { RrcThread } from './types';

function createRoot(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

function thread(partial: Partial<RrcThread> & Pick<RrcThread, 'id' | 'quote_text'>): RrcThread {
  return {
    status: 'open',
    comments: [],
    ...partial,
  };
}

describe('highlightDom', () => {
  it('highlights draft quotes across multiple elements', () => {
    const root = createRoot('<p><strong>Alpha</strong> <em>Beta</em> Gamma</p>');
    const before = root.textContent;

    applyDraftQuoteHighlight(root, 'Alpha Beta Gamma');

    const spans = root.querySelectorAll('span[data-annotation-draft]');
    expect(spans.length).toBeGreaterThan(1);
    expect(root.textContent).toBe(before);
  });

  it('walks only main#main-content when present (ignores chrome siblings)', () => {
    const root = createRoot(
      '<div class="chrome">Skip nav chrome</div><main id="main-content"><p>Hello</p><p>World</p></main><footer>Foot</footer>'
    );
    document.body.appendChild(root);

    applyDraftQuoteHighlight(root, 'Hello World');

    const spans = root.querySelectorAll('span[data-annotation-draft]');
    expect(spans.length).toBe(2);
    expect(root.textContent).toContain('Skip nav chrome');
    root.remove();
  });

  it('matches scrubbed selection across block elements (spaced fallback)', () => {
    const root = createRoot('<p>Hello</p><p>World</p>');
    document.body.appendChild(root);

    applyDraftQuoteHighlight(root, 'Hello World');

    const spans = root.querySelectorAll('span[data-annotation-draft]');
    expect(spans.length).toBe(2);
    expect(computeQuoteDocumentOrder(root, 'Hello World')).toBe(0);

    root.remove();
  });

  it('matches very long quotes without giant regex (normalized spaced substring)', () => {
    const words = Array.from({ length: 220 }, (_, i) => `w${i}`).join(' ');
    const root = createRoot(`<p>${words}</p>`);
    document.body.appendChild(root);

    applyDraftQuoteHighlight(root, words);

    const spans = root.querySelectorAll('span[data-annotation-draft]');
    expect(spans.length).toBeGreaterThan(0);
    root.remove();
  });

  it('matches long quote across headings and paragraphs', () => {
    const half = Array.from({ length: 120 }, (_, i) => `w${i}`).join(' ');
    const root = createRoot(`<h2>A</h2><p>${half}</p><p>${half}</p>`);
    document.body.appendChild(root);
    const quote = `A ${half} ${half}`;

    applyDraftQuoteHighlight(root, quote);

    const spans = root.querySelectorAll('span[data-annotation-draft]');
    expect(spans.length).toBeGreaterThan(0);
    root.remove();
  });

  it('anchor head+tail when full quote is not a contiguous DOM substring (duplicated block)', () => {
    const chunk = Array.from({ length: 120 }, (_, i) => `w${i}`).join(' ');
    const root = createRoot(`<p>${chunk}</p>`);
    document.body.appendChild(root);
    const quote = `${chunk} EXTRA_GAP ${chunk}`;

    applyDraftQuoteHighlight(root, quote);

    const spans = root.querySelectorAll('span[data-annotation-draft]');
    expect(spans.length).toBeGreaterThan(0);
    root.remove();
  });

  it('long-quote compact fallback when selection omits space between inline nodes', () => {
    const root = createRoot('<p><strong>Hello</strong><em>World</em></p>');
    document.body.appendChild(root);

    applyDraftQuoteHighlight(root, 'HelloWorld');

    const spans = root.querySelectorAll('span[data-annotation-draft]');
    expect(spans.length).toBeGreaterThan(0);
    root.remove();
  });

  it('clears draft highlight nodes cleanly', () => {
    const root = createRoot('<p><strong>Alpha</strong> <em>Beta</em> Gamma</p>');
    const before = root.textContent;

    applyDraftQuoteHighlight(root, 'Alpha Beta Gamma');
    expect(root.querySelectorAll('span[data-annotation-draft]').length).toBeGreaterThan(0);

    clearDraftQuoteHighlights(root);

    expect(root.querySelectorAll('span[data-annotation-draft]').length).toBe(0);
    expect(root.textContent).toBe(before);
  });

  it('applies thread highlights across element boundaries and returns order map', () => {
    const root = createRoot('<p><strong>Alpha</strong> <em>Beta</em> Gamma</p>');
    const before = root.textContent;
    const threads = [thread({ id: 't1', status: 'open', quote_text: 'Alpha Beta Gamma' })];

    const orderById = applyThreadHighlights(root, threads, () => {});

    const spans = root.querySelectorAll('span[data-annotation-thread-id="t1"]');
    expect(spans.length).toBeGreaterThan(1);
    expect(orderById.t1).toBe(0);
    expect(root.textContent).toBe(before);
  });

  it('renders overlapping thread highlights including newer one', () => {
    const root = createRoot('<p>Alpha Beta Gamma Delta</p>');
    const threads = [
      thread({ id: 'older', status: 'open', quote_text: 'Alpha Beta Gamma' }),
      thread({ id: 'newer', status: 'open', quote_text: 'Beta Gamma Delta' }),
    ];

    const orderById = applyThreadHighlights(root, threads, () => {});

    expect(orderById.older).toBe(0);
    expect(orderById.newer).toBe(6);
    expect(root.querySelectorAll('span[data-annotation-thread-id="older"]').length).toBeGreaterThan(0);
    expect(root.querySelectorAll('span[data-annotation-thread-id="newer"]').length).toBeGreaterThan(0);
  });

  it('prefers stored start/end offsets for repeated quote text', () => {
    const root = createRoot('<p>word alpha word beta word</p>');
    const firstIndex = root.textContent?.indexOf('word') ?? -1;
    const secondIndex = root.textContent?.indexOf('word', firstIndex + 1) ?? -1;
    const threads = [
      thread({
        id: 't-repeat',
        status: 'open',
        quote_text: 'word',
        start_offset: secondIndex,
        end_offset: secondIndex + 4,
      }),
    ];

    applyThreadHighlights(root, threads, () => {});

    const spans = root.querySelectorAll('span[data-annotation-thread-id="t-repeat"]');
    expect(spans.length).toBe(1);
    expect(spans[0].textContent).toBe('word');
    expect(spans[0].previousSibling?.textContent).toContain('word alpha ');
  });

  it('uses stored surrounding context to disambiguate repeated quote text', () => {
    const root = createRoot('<p>word alpha word beta word gamma</p>');
    const threads = [
      thread({
        id: 't-context',
        status: 'open',
        quote_text: 'word',
        anchor_selector: {
          quote: 'word',
          contextBefore: ' alpha ',
          contextAfter: ' beta ',
        },
      }),
    ];

    applyThreadHighlights(root, threads, () => {});

    const spans = root.querySelectorAll('span[data-annotation-thread-id="t-context"]');
    expect(spans.length).toBe(1);
    expect(spans[0].textContent).toBe('word');
    expect(spans[0].previousSibling?.textContent).toContain('word alpha ');
  });

  it('computes exact selection offsets from range and highlights by offsets', () => {
    const root = createRoot('<main id="main-content"><p>before same after same tail</p></main>');
    document.body.appendChild(root);
    const textNode = root.querySelector('p')?.firstChild as Text;
    const start = textNode.nodeValue?.indexOf('same after') ?? -1;
    const end = start + 'same after'.length;
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);

    const offsets = computeRangeOffsetsInAnnotationRoot(root, range);
    expect(offsets).not.toBeNull();
    const highlighted = applyDraftQuoteHighlightByOffsets(
      root,
      offsets?.startOffset ?? null,
      offsets?.endOffset ?? null
    );
    expect(highlighted).toBe(true);
    const spans = root.querySelectorAll('span[data-annotation-draft]');
    expect(spans.length).toBe(1);
    expect(spans[0].textContent).toBe('same after');
    root.remove();
  });

  it('applies hover color to all segments of same thread', () => {
    const root = createRoot('<p><strong>Alpha</strong> <em>Beta</em> Gamma</p>');
    document.body.appendChild(root);
    const threads = [thread({ id: 't1', status: 'open', quote_text: 'Alpha Beta Gamma' })];

    applyThreadHighlights(root, threads, () => {});
    const spans = root.querySelectorAll<HTMLElement>('span[data-annotation-thread-id="t1"]');
    expect(spans.length).toBeGreaterThan(1);

    spans[0].dispatchEvent(new window.Event('mouseenter', { bubbles: true }));
    spans.forEach((span) => {
      expect(span.style.backgroundColor).toBe('rgba(245, 158, 11, 0.5)');
    });
    root.remove();
  });

  it('does not highlight resolved threads in content', () => {
    const root = createRoot('<p>Alpha Beta Gamma</p>');
    const threads = [thread({ id: 'resolved-1', status: 'resolved', quote_text: 'Alpha Beta' })];

    const orderById = applyThreadHighlights(root, threads, () => {});

    expect(Object.keys(orderById)).toHaveLength(0);
    expect(root.querySelectorAll('span[data-annotation-thread-id]').length).toBe(0);
  });

  it('clears thread highlight nodes cleanly', () => {
    const root = createRoot('<p>Alpha <em>Beta</em> Gamma</p>');
    const before = root.textContent;
    const threads = [thread({ id: 't1', status: 'open', quote_text: 'Alpha Beta Gamma' })];

    applyThreadHighlights(root, threads, () => {});
    expect(root.querySelectorAll('span[data-annotation-thread-id]').length).toBeGreaterThan(0);

    clearThreadHighlights(root);

    expect(root.querySelectorAll('span[data-annotation-thread-id]').length).toBe(0);
    expect(root.textContent).toBe(before);
  });
});
