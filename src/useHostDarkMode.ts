'use client';

import { useEffect, useState } from 'react';

function hasDarkClass(el: Element | null): boolean {
  if (!(el instanceof Element)) {
    return false;
  }
  return (
    el.classList.contains('dark') ||
    el.classList.contains('theme-dark') ||
    el.classList.contains('dark-mode')
  );
}

function hasLightClass(el: Element | null): boolean {
  if (!(el instanceof Element)) {
    return false;
  }
  return (
    el.classList.contains('light') ||
    el.classList.contains('theme-light') ||
    el.classList.contains('light-mode')
  );
}

function hasDarkDataAttr(el: Element | null): boolean {
  if (!(el instanceof Element)) {
    return false;
  }
  const keys = ['theme', 'mode', 'colorScheme', 'color-scheme'];
  for (const key of keys) {
    const v = el.getAttribute(`data-${key}`);
    if (typeof v === 'string' && v.toLowerCase() === 'dark') {
      return true;
    }
  }
  return false;
}

function hasLightDataAttr(el: Element | null): boolean {
  if (!(el instanceof Element)) {
    return false;
  }
  const keys = ['theme', 'mode', 'colorScheme', 'color-scheme'];
  for (const key of keys) {
    const v = el.getAttribute(`data-${key}`);
    if (typeof v === 'string' && v.toLowerCase() === 'light') {
      return true;
    }
  }
  return false;
}

function resolveElementTheme(el: Element | null): boolean | null {
  if (!(el instanceof Element)) {
    return null;
  }
  const hasLightData = hasLightDataAttr(el);
  const hasDarkData = hasDarkDataAttr(el);
  if (hasLightData && !hasDarkData) {
    return false;
  }
  if (hasDarkData && !hasLightData) {
    return true;
  }
  if (hasLightData && hasDarkData) {
    return false;
  }

  const hasLightCls = hasLightClass(el);
  const hasDarkCls = hasDarkClass(el);
  if (hasLightCls && !hasDarkCls) {
    return false;
  }
  if (hasDarkCls && !hasLightCls) {
    return true;
  }
  if (hasLightCls && hasDarkCls) {
    return false;
  }
  return null;
}

function resolveColorSchemeTheme(el: Element | null): boolean | null {
  if (!(el instanceof Element) || typeof window === 'undefined') {
    return null;
  }
  try {
    const rawColorScheme = window.getComputedStyle(el).colorScheme.trim().toLowerCase();
    if (!rawColorScheme || rawColorScheme === 'normal') {
      return null;
    }
    const tokens = rawColorScheme.split(/\s+/).filter(Boolean);
    if (!tokens.length) {
      return null;
    }
    const hasLight = tokens.includes('light');
    const hasDark = tokens.includes('dark');
    // `color-scheme: light dark` means "supports both"; active mode should follow the system.
    if (hasLight && typeof window.matchMedia === 'function') {
      if (hasDark) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      return false;
    }
    if (hasDark) {
      return true;
    }
    return null;
  } catch {
    return null;
  }
}

function detectHostDarkMode(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  const root = document.documentElement;
  const body = document.body;
  const rootTheme = resolveElementTheme(root);
  if (rootTheme != null) {
    return rootTheme;
  }
  const bodyTheme = resolveElementTheme(body);
  if (bodyTheme != null) {
    return bodyTheme;
  }

  const rootColorSchemeTheme = resolveColorSchemeTheme(root);
  if (rootColorSchemeTheme != null) {
    return rootColorSchemeTheme;
  }
  const bodyColorSchemeTheme = resolveColorSchemeTheme(body);
  if (bodyColorSchemeTheme != null) {
    return bodyColorSchemeTheme;
  }

  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return false;
}

export function useHostDarkMode(): boolean {
  // Keep SSR and first client render identical to avoid hydration class mismatches.
  // We detect and apply host theme immediately after mount.
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }
    const sync = () => setIsDark(detectHostDarkMode());
    sync();

    let frame = 0;
    const scheduleSync = () => {
      if (frame) {
        return;
      }
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        sync();
      });
    };
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme', 'data-mode', 'data-color-scheme'],
    });
    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-theme', 'data-mode', 'data-color-scheme'],
      });
    }
    observer.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme', 'data-mode', 'data-color-scheme'],
    });

    const rootMedia =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    const onMediaChange = () => {
      // Re-check only when media changes because many sites derive their own theme class from it.
      sync();
    };
    rootMedia?.addEventListener('change', onMediaChange);

    return () => {
      observer.disconnect();
      rootMedia?.removeEventListener('change', onMediaChange);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);

  return isDark;
}
