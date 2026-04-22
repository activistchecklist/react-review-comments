import { describe, expect, it } from 'vitest';
import { withLocalePath } from './annotationPaths';

describe('withLocalePath', () => {
  it('returns the saved path as-is (normalized leading slash)', () => {
    expect(withLocalePath('en', '/pages')).toBe('/pages');
    expect(withLocalePath('en', 'pages')).toBe('/pages');
    expect(withLocalePath('es', '/pages')).toBe('/pages');
  });
});
