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

function hasDarkColorScheme(el: Element | null): boolean {
  if (!(el instanceof Element) || typeof window === 'undefined') {
    return false;
  }
  try {
    return window.getComputedStyle(el).colorScheme.includes('dark');
  } catch {
    return false;
  }
}

function parseRgbChannels(value: string): [number, number, number] | null {
  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) {
    return null;
  }
  const parts = match[1]
    .split(',')
    .slice(0, 3)
    .map((part) => Number.parseFloat(part.trim()));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }
  return [parts[0], parts[1], parts[2]];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const normalize = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const R = normalize(r);
  const G = normalize(g);
  const B = normalize(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function hasDarkRenderedPalette(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return false;
  }
  const probeTargets: Array<Element | null> = [
    document.body,
    document.getElementById('__next'),
    document.querySelector('main'),
    document.documentElement,
  ];
  for (const target of probeTargets) {
    if (!(target instanceof Element)) {
      continue;
    }
    try {
      const styles = window.getComputedStyle(target);
      const bg = parseRgbChannels(styles.backgroundColor || '');
      const fg = parseRgbChannels(styles.color || '');
      if (!bg || !fg) {
        continue;
      }
      const bgLum = relativeLuminance(bg);
      const fgLum = relativeLuminance(fg);
      // Dark UIs generally have low luminance backgrounds and lighter text.
      if (bgLum < 0.24 && fgLum > bgLum) {
        return true;
      }
    } catch {
      // Ignore style lookup errors and continue probing.
    }
  }
  return false;
}

function detectHostDarkMode(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  const root = document.documentElement;
  const body = document.body;
  return (
    hasDarkClass(root) ||
    hasDarkClass(body) ||
    hasDarkDataAttr(root) ||
    hasDarkDataAttr(body) ||
    hasDarkColorScheme(root) ||
    hasDarkColorScheme(body) ||
    hasDarkRenderedPalette()
  );
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
