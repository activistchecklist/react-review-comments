import type { RrcComment, RrcThread } from './types';

export interface FormatThreadsMarkdownOptions {
  path?: string;
  locale?: string;
  exportedAt?: Date | string;
}

function commentTimestamp(comment: RrcComment): string {
  return String(comment.created_at || comment.createdAt || '').trim();
}

function threadTimestamp(thread: RrcThread): string {
  const raw =
    thread.updated_at ||
    thread.updatedAt ||
    thread.created_at ||
    thread.createdAt;
  if (raw instanceof Date) {
    return raw.toISOString();
  }
  return String(raw || '').trim();
}

function blockquote(text: string): string {
  const lines = String(text || '').split(/\r?\n/);
  return lines.map((line) => `> ${line}`.trimEnd()).join('\n');
}

function commentBlock(comment: RrcComment): string {
  const author = String(comment.created_by || '').trim() || 'Anonymous';
  const when = commentTimestamp(comment);
  const header = when ? `**${author}** — ${when}` : `**${author}**`;
  const body = String(comment.body || '').replace(/\r\n/g, '\n').trim();
  return body ? `${header}\n\n${body}` : header;
}

function statusLabel(status: string | undefined): string {
  const s = String(status || 'open').toLowerCase();
  return s === 'resolved' ? 'Resolved' : 'Open';
}

/**
 * Render the page's review-comment threads as Markdown. The output is intended
 * to be readable in a code review or chat and parseable by an LLM:
 * - one H1 with page metadata,
 * - one H2 per thread with status,
 * - a blockquote for the selected text (`quote_text`),
 * - author + ISO timestamp + body for each comment, in order.
 */
export function formatThreadsAsMarkdown(
  threads: RrcThread[],
  options: FormatThreadsMarkdownOptions = {}
): string {
  const path = options.path ? options.path : '';
  const locale = options.locale ? options.locale : '';
  const exportedAtRaw = options.exportedAt ?? new Date();
  const exportedAt =
    exportedAtRaw instanceof Date ? exportedAtRaw.toISOString() : String(exportedAtRaw);

  const sorted = [...threads].sort((a, b) => {
    const aResolved = a.status === 'resolved' ? 1 : 0;
    const bResolved = b.status === 'resolved' ? 1 : 0;
    if (aResolved !== bResolved) {
      return aResolved - bResolved;
    }
    const aTime = new Date(threadTimestamp(a) || 0).getTime();
    const bTime = new Date(threadTimestamp(b) || 0).getTime();
    return aTime - bTime;
  });

  const openCount = sorted.filter((thread) => thread.status !== 'resolved').length;
  const resolvedCount = sorted.length - openCount;

  const titleSuffix = [path, locale ? `(${locale})` : ''].filter(Boolean).join(' ');
  const title = titleSuffix ? `# Review comments — ${titleSuffix}` : '# Review comments';
  const meta = `_Exported ${exportedAt} · ${openCount} open · ${resolvedCount} resolved_`;

  if (sorted.length === 0) {
    return `${title}\n\n${meta}\n\n_No comment threads on this page._\n`;
  }

  const sections = sorted.map((thread, index) => {
    const heading = `## Thread ${index + 1} · ${statusLabel(thread.status)}`;
    const quote = blockquote(thread.quote_text || '');
    const comments = thread.comments.map(commentBlock).join('\n\n');
    return [heading, quote, comments].filter(Boolean).join('\n\n');
  });

  return `${title}\n\n${meta}\n\n---\n\n${sections.join('\n\n---\n\n')}\n`;
}
