'use client';

import { useParams, usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ReviewCommentsContextProvider } from './context';
import ReviewCommentsShell from './ReviewCommentsShell';
import { inferDocumentPathFromPathname } from './inferAppRouterDocumentPath';
import { reviewCommentsScopeFromHostHeader } from './scopeFromHost';
import type { ReviewCommentsProviderProps, ReviewCommentsScope } from './types';
import './rrc.css';

const unknownScope: ReviewCommentsScope = { scopeKey: 'unknown' };

/** App shell: context + `ReviewCommentsShell` + styles, with optional path / locale / scope inference. */
export function ReviewCommentsProvider({
  enabled,
  panelMode,
  path: pathProp,
  locale: localeProp,
  scope: scopeProp,
  apiBase = '/api/review-comments',
  labels,
  children,
}: ReviewCommentsProviderProps) {
  const pathname = usePathname() || '/';
  const params = useParams();

  const locale = useMemo(() => {
    if (localeProp != null && localeProp !== '') {
      return localeProp;
    }
    const pl = params?.locale;
    return typeof pl === 'string' ? pl : 'en';
  }, [localeProp, params]);

  const path = useMemo(() => {
    if (pathProp != null && pathProp !== '') {
      return inferDocumentPathFromPathname(pathProp);
    }
    // Prefer Next router state; window.location can briefly lag during client transitions.
    const visiblePathname =
      pathname ||
      (typeof window !== 'undefined' && window.location?.pathname ? window.location.pathname : '/');
    return inferDocumentPathFromPathname(visiblePathname);
  }, [pathProp, pathname]);

  const [scope, setScope] = useState<ReviewCommentsScope>(() => scopeProp ?? unknownScope);

  useEffect(() => {
    if (scopeProp) {
      setScope(scopeProp);
      return;
    }
    setScope(reviewCommentsScopeFromHostHeader(window.location.host));
  }, [scopeProp]);

  const resolvedEnabled = enabled !== undefined ? Boolean(enabled) : true;

  return (
    <ReviewCommentsContextProvider
      apiBase={apiBase}
      enabled={resolvedEnabled}
      panelMode={panelMode}
      path={path}
      locale={locale}
      scope={scope}
      labels={labels}
    >
      <ReviewCommentsShell>{children}</ReviewCommentsShell>
    </ReviewCommentsContextProvider>
  );
}
