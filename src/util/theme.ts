/**
 * Siemens Healthineers-inspired brand palette + shared webview CSS variables.
 *
 * Pure (no `vscode`/`node`): both the Knowledge Graph panel and the efficiency
 * report inject {@link brandCssVars} and reference the `--sh-*` variables, so the
 * extension UI carries a consistent Siemens Healthineers look while still
 * blending with the user's VS Code theme for backgrounds and text.
 */

/** Core brand colors (Siemens Healthineers visual identity, approximate). */
export const SIEMENS_HEALTHINEERS = {
  /** Primary brand teal/petrol. */
  petrol: '#009999',
  /** Deep brand violet used in gradients. */
  violet: '#641946',
  /** Vibrant brand orange accent. */
  orange: '#EC6602',
  /** Brand magenta/pink accent. */
  magenta: '#E5004B',
  /** Light petrol for hover/active states. */
  petrolLight: '#00B0B2',
  /** Dark ink for high-contrast surfaces. */
  ink: '#002D3C',
} as const;

/**
 * A `:root` block of CSS variables + the signature brand gradient. Inject this
 * inside a `<style nonce>` element so it is CSP-safe.
 */
export function brandCssVars(): string {
  const c = SIEMENS_HEALTHINEERS;
  return `
  :root {
    --sh-petrol: ${c.petrol};
    --sh-petrol-light: ${c.petrolLight};
    --sh-violet: ${c.violet};
    --sh-orange: ${c.orange};
    --sh-magenta: ${c.magenta};
    --sh-ink: ${c.ink};
    --sh-gradient: linear-gradient(90deg, ${c.violet} 0%, ${c.magenta} 55%, ${c.orange} 100%);
    --sh-accent: ${c.petrol};
    --sh-accent-contrast: #ffffff;
  }`;
}

/**
 * Shared component styles that brand the common webview chrome (brand bar,
 * buttons, chips, headings). Panels add their own layout styles on top.
 */
export function brandComponentStyles(): string {
  return `
  .sh-bar { height: 4px; width: 100%; background: var(--sh-gradient); border-radius: 2px; margin: 0.4rem 0 0.6rem; }
  .sh-brand { display: flex; align-items: center; gap: 0.5rem; font-size: 0.72rem; letter-spacing: 0.04em;
    text-transform: uppercase; color: var(--sh-petrol); font-weight: 600; }
  .sh-brand .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--sh-gradient); }
  h1, h2 { color: var(--sh-petrol); }
  button.sh, .sh-btn { background: var(--sh-petrol); color: var(--sh-accent-contrast); border: none;
    padding: 0.42rem 0.8rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
  button.sh:hover, .sh-btn:hover { background: var(--sh-petrol-light); }
  button.sh-accent { background: var(--sh-orange); color: #fff; }
  button.sh-accent:hover { filter: brightness(1.08); }`;
}

/**
 * Light, clinical surface variables for the Siemens Healthineers look. The
 * dashboard and prompt panels render light-first (white/petrol) regardless of
 * the active VS Code theme, per the brand guidance, while still exposing the
 * `--sh-*` brand colors.
 */
export function brandLightSurfaceVars(): string {
  return `
  :root {
    --sh-surface: #ffffff;
    --sh-surface-2: #f3f7f8;
    --sh-surface-3: #e9f1f2;
    --sh-text: #002d3c;
    --sh-muted: #5a6b72;
    --sh-border: #d6e1e4;
    --sh-shadow: 0 1px 2px rgba(0, 45, 60, 0.06), 0 6px 18px rgba(0, 45, 60, 0.06);
  }`;
}