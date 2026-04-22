import type { OverviewDocument, RrcThread } from './types';

export function isResolvedStatus(status: string | undefined): boolean {
  return status === 'resolved';
}

export function isUnresolvedStatus(status: string | undefined): boolean {
  return !isResolvedStatus(status);
}

export function unresolvedThreads<T extends { status?: string }>(threads: T[]): T[] {
  return threads.filter((thread) => isUnresolvedStatus(thread.status));
}

export function resolvedThreads<T extends { status?: string }>(threads: T[]): T[] {
  return threads.filter((thread) => isResolvedStatus(thread.status));
}

export function countUnresolvedComments(threads: Array<{ status?: string; comments: unknown[] }>): number {
  return unresolvedThreads(threads).reduce((sum, thread) => sum + thread.comments.length, 0);
}

export function countResolvedThreads(threads: Array<{ status?: string }>): number {
  return resolvedThreads(threads).length;
}

export function countUnresolvedOverviewComments(doc: OverviewDocument): number {
  return unresolvedThreads(doc.threads).reduce((sum, thread) => sum + thread.commentCount, 0);
}

export function countUnresolvedOverviewThreads(doc: OverviewDocument): number {
  return unresolvedThreads(doc.threads).length;
}

export function hasUnresolvedOverviewComments(doc: OverviewDocument): boolean {
  return countUnresolvedOverviewComments(doc) > 0;
}

export function partitionThreadsByResolution(
  threads: RrcThread[],
  showResolved: boolean
): RrcThread[] {
  return showResolved ? resolvedThreads(threads) : unresolvedThreads(threads);
}
