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

export function countUnresolvedThreads(threads: Array<{ status?: string }>): number {
  return unresolvedThreads(threads).length;
}

export function countResolvedThreads(threads: Array<{ status?: string }>): number {
  return resolvedThreads(threads).length;
}

export function countUnresolvedOverviewThreads(doc: OverviewDocument): number {
  return unresolvedThreads(doc.threads).length;
}

export function hasUnresolvedOverviewThreads(doc: OverviewDocument): boolean {
  return countUnresolvedOverviewThreads(doc) > 0;
}

export function partitionThreadsByResolution(
  threads: RrcThread[],
  showResolved: boolean
): RrcThread[] {
  return showResolved ? resolvedThreads(threads) : unresolvedThreads(threads);
}
