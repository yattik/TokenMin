import * as assert from 'assert';
import { TOKEN_OPTIMIZER_BRAND, brandComponentStyles, brandCssVars } from '../src/util/theme';

describe('theme: Token Optimizer brand', () => {
  it('exposes the core palette as hex colors', () => {
    for (const value of Object.values(TOKEN_OPTIMIZER_BRAND)) {
      assert.match(value, /^#[0-9a-fA-F]{6}$/);
    }
  });

  it('declares the brand CSS variables', () => {
    const css = brandCssVars();
    assert.ok(css.includes('--sh-petrol:'));
    assert.ok(css.includes('--sh-orange:'));
    assert.ok(css.includes('--sh-gradient:'));
    assert.ok(css.includes(TOKEN_OPTIMIZER_BRAND.petrol));
  });

  it('brands shared chrome via the brand variables', () => {
    const css = brandComponentStyles();
    assert.ok(css.includes('var(--sh-gradient)'));
    assert.ok(css.includes('var(--sh-petrol)'));
    assert.ok(css.includes('.sh-bar'));
  });
});
