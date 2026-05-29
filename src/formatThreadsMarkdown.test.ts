import { describe, expect, it } from 'vitest';
import { formatThreadsAsMarkdown } from './formatThreadsMarkdown';
import type { RrcThread } from './types';

const openThread: RrcThread = {
  id: 't-open',
  quote_text: 'The selected text on the page.',
  status: 'open',
  created_at: '2026-05-20T10:00:00.000Z',
  updated_at: '2026-05-20T11:05:00.000Z',
  comments: [
    {
      id: 'c1',
      body: 'First comment body.',
      created_by: 'Alice',
      created_at: '2026-05-20T10:15:00.000Z',
    },
    {
      id: 'c2',
      body: 'Reply body.',
      created_by: 'Bob',
      created_at: '2026-05-20T11:00:00.000Z',
    },
  ],
};

const resolvedThread: RrcThread = {
  id: 't-resolved',
  quote_text: 'Another quote.',
  status: 'resolved',
  created_at: '2026-05-19T08:00:00.000Z',
  updated_at: '2026-05-19T09:00:00.000Z',
  comments: [
    {
      id: 'c3',
      body: 'Resolved comment.',
      created_by: 'Carol',
      created_at: '2026-05-19T09:00:00.000Z',
    },
  ],
};

describe('formatThreadsAsMarkdown', () => {
  it('renders page header with path, locale, and counts', () => {
    const md = formatThreadsAsMarkdown([openThread, resolvedThread], {
      path: '/guides/intro',
      locale: 'en',
      exportedAt: '2026-05-22T14:30:00.000Z',
    });
    expect(md).toContain('# Review comments — /guides/intro (en)');
    expect(md).toContain(
      '_Exported 2026-05-22T14:30:00.000Z · 1 open · 1 resolved_'
    );
  });

  it('includes the quote text as a blockquote per thread', () => {
    const md = formatThreadsAsMarkdown([openThread], {
      path: '/x',
      locale: 'en',
      exportedAt: '2026-05-22T00:00:00.000Z',
    });
    expect(md).toContain('> The selected text on the page.');
  });

  it('emits each comment with author and ISO timestamp in order', () => {
    const md = formatThreadsAsMarkdown([openThread], {
      exportedAt: '2026-05-22T00:00:00.000Z',
    });
    const aliceIdx = md.indexOf('**Alice** — 2026-05-20T10:15:00.000Z');
    const bobIdx = md.indexOf('**Bob** — 2026-05-20T11:00:00.000Z');
    expect(aliceIdx).toBeGreaterThan(-1);
    expect(bobIdx).toBeGreaterThan(aliceIdx);
    expect(md).toContain('First comment body.');
    expect(md).toContain('Reply body.');
  });

  it('puts open threads before resolved threads and labels status', () => {
    const md = formatThreadsAsMarkdown([resolvedThread, openThread], {
      exportedAt: '2026-05-22T00:00:00.000Z',
    });
    const openIdx = md.indexOf('## Thread 1 · Open');
    const resolvedIdx = md.indexOf('## Thread 2 · Resolved');
    expect(openIdx).toBeGreaterThan(-1);
    expect(resolvedIdx).toBeGreaterThan(openIdx);
  });

  it('escapes nothing but preserves multi-line quote text as blockquote', () => {
    const md = formatThreadsAsMarkdown(
      [
        {
          ...openThread,
          quote_text: 'line one\nline two',
          comments: [openThread.comments[0]],
        },
      ],
      { exportedAt: '2026-05-22T00:00:00.000Z' }
    );
    expect(md).toContain('> line one\n> line two');
  });

  it('handles missing author and missing body gracefully', () => {
    const md = formatThreadsAsMarkdown(
      [
        {
          id: 't',
          quote_text: 'q',
          status: 'open',
          comments: [{ id: 'c', body: '', created_by: '' }],
        },
      ],
      { exportedAt: '2026-05-22T00:00:00.000Z' }
    );
    expect(md).toContain('**Anonymous**');
  });

  it('wraps a short quote in surrounding context with the selection in bold', () => {
    const md = formatThreadsAsMarkdown(
      [
        {
          id: 't-short',
          quote_text: 'click here',
          status: 'open',
          anchor_selector: {
            contextBefore: 'To register for the workshop, ',
            contextAfter: ' to begin the signup process.',
          },
          comments: [
            {
              id: 'c1',
              body: 'Which link is this?',
              created_by: 'Alice',
              created_at: '2026-05-20T10:00:00.000Z',
            },
          ],
        },
      ],
      { exportedAt: '2026-05-22T00:00:00.000Z' }
    );
    expect(md).toContain(
      '> …To register for the workshop, **click here** to begin the signup process.…'
    );
  });

  it('only emits leading ellipsis when contextAfter is missing', () => {
    const md = formatThreadsAsMarkdown(
      [
        {
          id: 't-only-before',
          quote_text: 'final word',
          status: 'open',
          anchor_selector: {
            contextBefore: 'Some text leading up to the ',
            contextAfter: '',
          },
          comments: [
            { id: 'c1', body: 'note', created_by: 'A' },
          ],
        },
      ],
      { exportedAt: '2026-05-22T00:00:00.000Z' }
    );
    expect(md).toContain('> …Some text leading up to the **final word**');
    expect(md).not.toContain('**final word**…');
  });

  it('does not wrap when no context is available on a short quote', () => {
    const md = formatThreadsAsMarkdown(
      [
        {
          id: 't-no-ctx',
          quote_text: 'short',
          status: 'open',
          comments: [{ id: 'c1', body: 'note', created_by: 'A' }],
        },
      ],
      { exportedAt: '2026-05-22T00:00:00.000Z' }
    );
    expect(md).toContain('> short');
    expect(md).not.toContain('**short**');
    expect(md).not.toContain('…');
  });

  it('does not wrap quotes longer than the short-quote threshold', () => {
    const longQuote =
      'This is a fairly long quote that easily stands on its own as context and does not need additional surrounding text to be understood.';
    const md = formatThreadsAsMarkdown(
      [
        {
          id: 't-long',
          quote_text: longQuote,
          status: 'open',
          anchor_selector: {
            contextBefore: 'before context that should not appear ',
            contextAfter: ' after context that should not appear',
          },
          comments: [{ id: 'c1', body: 'note', created_by: 'A' }],
        },
      ],
      { exportedAt: '2026-05-22T00:00:00.000Z' }
    );
    expect(md).toContain(`> ${longQuote}`);
    expect(md).not.toContain(`**${longQuote}**`);
    expect(md).not.toContain('before context that should not appear');
    expect(md).not.toContain('…');
  });

  it('keeps whitespace at the boundaries outside the bold marker', () => {
    const md = formatThreadsAsMarkdown(
      [
        {
          id: 't-ws',
          quote_text: '  click here  ',
          status: 'open',
          anchor_selector: {
            contextBefore: 'Please',
            contextAfter: 'now',
          },
          comments: [{ id: 'c1', body: 'note', created_by: 'A' }],
        },
      ],
      { exportedAt: '2026-05-22T00:00:00.000Z' }
    );
    expect(md).toContain('> …Please  **click here**  now…');
  });

  it('returns an empty-state message when there are no threads', () => {
    const md = formatThreadsAsMarkdown([], {
      path: '/x',
      locale: 'en',
      exportedAt: '2026-05-22T00:00:00.000Z',
    });
    expect(md).toContain('_No comment threads on this page._');
  });
});
