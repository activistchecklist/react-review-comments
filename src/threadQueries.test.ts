import { describe, expect, it } from 'vitest';
import type { OverviewDocument, RrcThread } from './types';
import {
  countResolvedThreads,
  countUnresolvedThreads,
  countUnresolvedOverviewThreads,
  hasUnresolvedOverviewThreads,
  partitionThreadsByResolution,
} from './threadQueries';

const sampleThreads: RrcThread[] = [
  {
    id: 'open-1',
    quote_text: 'open',
    status: 'open',
    comments: [{ id: 'c1', body: 'a', created_by: 'x' }],
  },
  {
    id: 'resolved-1',
    quote_text: 'resolved',
    status: 'resolved',
    comments: [
      { id: 'c2', body: 'b', created_by: 'x' },
      { id: 'c3', body: 'c', created_by: 'y' },
    ],
  },
];

describe('threadQueries unresolved-first defaults', () => {
  it('counts only unresolved threads by default', () => {
    expect(countUnresolvedThreads(sampleThreads)).toBe(1);
  });

  it('counts resolved threads as a separate query', () => {
    expect(countResolvedThreads(sampleThreads)).toBe(1);
  });

  it('partitions threads by resolved toggle', () => {
    expect(partitionThreadsByResolution(sampleThreads, false).map((thread) => thread.id)).toEqual([
      'open-1',
    ]);
    expect(partitionThreadsByResolution(sampleThreads, true).map((thread) => thread.id)).toEqual([
      'resolved-1',
    ]);
  });
});

describe('overview unresolved thread queries', () => {
  const overviewDoc: OverviewDocument = {
    documentId: 'doc-1',
    sitePath: '/guide/',
    locale: 'en',
    threadCount: 2,
    commentCount: 3,
    threads: [
      { id: 'open-1', status: 'open', commentCount: 1 },
      { id: 'resolved-1', status: 'resolved', commentCount: 2 },
    ],
  };

  it('computes unresolved totals from thread-level data', () => {
    expect(countUnresolvedOverviewThreads(overviewDoc)).toBe(1);
    expect(hasUnresolvedOverviewThreads(overviewDoc)).toBe(true);
  });

  it('treats fully resolved documents as empty for core counts', () => {
    const fullyResolved: OverviewDocument = {
      ...overviewDoc,
      threads: [{ id: 'resolved-only', status: 'resolved', commentCount: 4 }],
    };
    expect(countUnresolvedOverviewThreads(fullyResolved)).toBe(0);
    expect(hasUnresolvedOverviewThreads(fullyResolved)).toBe(false);
  });
});
