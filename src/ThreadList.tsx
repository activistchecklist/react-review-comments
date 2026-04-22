'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { useReviewComments } from './context';
import {
  UserAvatar,
  formatCommentTime,
  CommentOverflowMenu,
  ExpandableCommentBody,
} from './AnnotationCommentUi';
import { ThreadReplyComposer } from './ThreadReplyComposer';
import type { RrcThread } from './types';
import { isCommentNewSinceSeen, isThreadUnread } from './seenThreads';

const RESOLVE_EXIT_MS = 260;

function threadCardClass(
  thread: RrcThread,
  activeThreadId: string,
  seenMap: Record<string, string>,
  currentAuthor: string
): string {
  const parts = ['rrc-thread-card'];
  if (isThreadUnread(thread, seenMap, currentAuthor)) {
    parts.push('rrc-thread-card--unread');
  }
  const isActive = activeThreadId === thread.id;
  if (thread.status === 'resolved') {
    parts.push('rrc-thread-card--resolved');
    parts.push(isActive ? 'rrc-thread-card--active' : 'rrc-thread-card--inactive');
  } else {
    parts.push(isActive ? 'rrc-thread-card--active' : 'rrc-thread-card--inactive');
  }
  return parts.join(' ');
}

export function ThreadList({
  threads,
  loading,
  locale,
  seenMap,
  onReply,
  onToggleResolved,
  onEditComment,
  onDeleteComment,
  onDraftStateChange,
  emptyLabel,
  activeThreadId,
  draftComposer,
  draftInsertIndex,
  onThreadFocus,
  onReplyCancel,
  currentAuthor,
}: {
  threads: RrcThread[];
  loading: boolean;
  locale: string;
  /** Session author; own comments are not "new" / unread for styling. */
  currentAuthor: string;
  seenMap: Record<string, string>;
  onReply: (args: {
    threadId: string;
    comment: string;
    clear: () => void;
  }) => Promise<void>;
  onToggleResolved: (threadId: string, status: string) => Promise<void>;
  onEditComment: (args: { threadId: string; commentId: string; body: string }) => Promise<void>;
  onDeleteComment: (args: { threadId: string; commentId: string }) => Promise<void>;
  onDraftStateChange: (active: boolean) => void;
  emptyLabel?: string;
  activeThreadId: string;
  draftComposer?: ReactNode;
  draftInsertIndex: number | null;
  onThreadFocus?: (thread: RrcThread) => void;
  onReplyCancel?: () => void;
}) {
  const { labels } = useReviewComments();
  const [replyByThread, setReplyByThread] = useState<Record<string, string>>({});
  const [editingCommentId, setEditingCommentId] = useState('');
  const [editingDraft, setEditingDraft] = useState('');
  const [resolvingThreadIds, setResolvingThreadIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const hasReplyDraft = Object.values(replyByThread).some((value) =>
      String(value || '').trim().length > 0
    );
    const hasEditDraft = Boolean(editingCommentId) && Boolean(String(editingDraft || '').trim());
    onDraftStateChange(hasReplyDraft || hasEditDraft);
    return () => onDraftStateChange(false);
  }, [replyByThread, editingCommentId, editingDraft, onDraftStateChange]);

  if (loading && threads.length === 0 && !draftComposer) {
    return (
      <div className="rrc-loading-state" role="status" aria-live="polite">
        <span className="rrc-spinner" aria-hidden="true" />
        <span>{labels.loadingComments}</span>
      </div>
    );
  }

  if (threads.length === 0 && !draftComposer && emptyLabel) {
    return (
      <p className="rrc-empty-hint">
        {emptyLabel}
      </p>
    );
  }

  if (threads.length === 0 && !draftComposer) {
    return null;
  }

  function markResolving(threadId: string, value: boolean) {
    setResolvingThreadIds((prev) => {
      if (value) {
        return { ...prev, [threadId]: true };
      }
      const next = { ...prev };
      delete next[threadId];
      return next;
    });
  }

  async function handleToggleResolved(thread: RrcThread) {
    const nextStatus = thread.status === 'resolved' ? 'open' : 'resolved';
    if (nextStatus === 'resolved') {
      markResolving(thread.id, true);
      await new Promise((resolve) => {
        window.setTimeout(resolve, RESOLVE_EXIT_MS);
      });
    }
    try {
      await onToggleResolved(thread.id, nextStatus);
    } finally {
      markResolving(thread.id, false);
    }
  }

  return (
    <div className="rrc-thread-list">
      {threads.map((thread, idx) => (
        <div key={thread.id}>
          {draftComposer && draftInsertIndex === idx && draftComposer}
          {(() => {
            const isResolving = Boolean(resolvingThreadIds[thread.id]);
            const cardClass = threadCardClass(thread, activeThreadId, seenMap, currentAuthor);
            return (
              <div
                className={
                  isResolving
                    ? 'rrc-thread-card-grid rrc-thread-card-grid--collapsing'
                    : 'rrc-thread-card-grid'
                }
              >
                <div className="rrc-thread-card-grid-inner">
                  <div
                    id={`rrc-thread-${thread.id}`}
                    className={cardClass}
                    onClick={() => {
                      onThreadFocus?.(thread);
                    }}
                  >
                {(() => {
                  const isActiveThread = activeThreadId === thread.id;
                  const comments = thread.comments;
                  const shouldShowPreviewTail = !isActiveThread && comments.length > 1;
                  const previewHiddenCount = !isActiveThread && comments.length > 2 ? comments.length - 2 : 0;
                  const commentsToRender = isActiveThread
                    ? comments
                    : shouldShowPreviewTail
                      ? [comments[0], comments[comments.length - 1]]
                      : comments.slice(0, 1);
                  return (
                    <>
                      <p className="rrc-quote">
                        &ldquo;{thread.quote_text}&rdquo;
                      </p>
                      {thread.status === 'resolved' && (
                        <p className="rrc-resolved-label">
                          {labels.resolved}
                        </p>
                      )}
                      <div className="rrc-comment-block">
                        {commentsToRender.map((comment, index) => {
                          const createdAt = comment.created_at || comment.createdAt;
                          const showThreadActions = index === 0;
                          const isEditing = editingCommentId === comment.id;
                          const isNewComment = isCommentNewSinceSeen(
                            comment,
                            thread,
                            seenMap,
                            currentAuthor
                          );
                          return (
                            <div key={comment.id}>
                              {!isActiveThread && previewHiddenCount > 0 && index === 1 && (
                                <button
                                  type="button"
                                  className="rrc-hidden-replies-divider"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onThreadFocus?.(thread);
                                  }}
                                >
                                  <span>{labels.hiddenCommentsCount({ count: previewHiddenCount })}</span>
                                </button>
                              )}
                              <div className="rrc-comment-row">
                                <UserAvatar name={comment.created_by} size="md" />
                                <div className="rrc-comment-body">
                                  <div className="rrc-comment-meta">
                                    <div className="rrc-comment-meta-text">
                                      <p className="rrc-comment-author">
                                        {comment.created_by}
                                        {isNewComment && (
                                          <span className="rrc-new-comment-badge">{labels.newCommentBadge}</span>
                                        )}
                                      </p>
                                      <div className="rrc-comment-time-line">
                                        <p className="rrc-comment-time">
                                          {formatCommentTime(createdAt, locale, labels)}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="rrc-thread-actions">
                                      {showThreadActions && (
                                        <button
                                          type="button"
                                          className="rrc-round-btn"
                                          title={
                                            thread.status === 'resolved'
                                              ? labels.reopen
                                              : labels.resolve
                                          }
                                          aria-label={
                                            thread.status === 'resolved'
                                              ? labels.reopen
                                              : labels.resolve
                                          }
                                          onClick={() => handleToggleResolved(thread)}
                                        >
                                          <Check size={20} strokeWidth={2.25} />
                                        </button>
                                      )}
                                      <CommentOverflowMenu
                                        onEdit={() => {
                                          setEditingCommentId(comment.id);
                                          setEditingDraft(comment.body || '');
                                          onThreadFocus?.(thread);
                                        }}
                                        onDelete={async () => {
                                          const confirmed = typeof window === 'undefined'
                                            ? true
                                            : window.confirm(labels.confirmDeleteComment);
                                          if (!confirmed) {
                                            return;
                                          }
                                          await onDeleteComment({
                                            threadId: thread.id,
                                            commentId: comment.id,
                                          });
                                        }}
                                      />
                                    </div>
                                  </div>
                                  {isEditing ? (
                                    <div className="rrc-edit-block">
                                      <textarea
                                        className={`rrc-textarea rrc-textarea--edit ${
                                          thread.status === 'resolved' ? 'rrc-textarea--plain' : ''
                                        }`}
                                        value={editingDraft}
                                        onChange={(event) => setEditingDraft(event.target.value)}
                                        rows={3}
                                        maxLength={3000}
                                      />
                                      <div className="rrc-row-actions">
                                        <button
                                          type="button"
                                          className="rrc-btn-ghost"
                                          onClick={() => {
                                            setEditingCommentId('');
                                            setEditingDraft('');
                                          }}
                                        >
                                          {labels.cancel}
                                        </button>
                                        <button
                                          type="button"
                                          className="rrc-btn-primary"
                                          disabled={!editingDraft.trim()}
                                          onClick={async () => {
                                            await onEditComment({
                                              threadId: thread.id,
                                              commentId: comment.id,
                                              body: editingDraft.trim(),
                                            });
                                            setEditingCommentId('');
                                            setEditingDraft('');
                                          }}
                                        >
                                          {labels.saveName}
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <ExpandableCommentBody body={comment.body} />
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {isActiveThread && (
                          <ThreadReplyComposer
                            threadId={thread.id}
                            value={replyByThread[thread.id] || ''}
                            onChange={(next) =>
                              setReplyByThread((prev) => ({ ...prev, [thread.id]: next }))
                            }
                            onReply={onReply}
                            onCancel={onReplyCancel}
                            plainShell={thread.status === 'resolved'}
                          />
                        )}
                      </div>
                    </>
                  );
                })()}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      ))}
      {draftComposer && (draftInsertIndex == null || draftInsertIndex >= threads.length) && draftComposer}
    </div>
  );
}
