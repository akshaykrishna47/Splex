/**
 * The web half of the font setup.
 *
 * Native loads Space Grotesk, Inter and Lobster through `expo-font`; the
 * browser gets the same families from Google Fonts as well, which buys three
 * things expo-font alone does not:
 *
 *   1. A real fallback chain. If a bundled font fails, headings still land on
 *      Space Grotesk from the CDN rather than the default system sans.
 *   2. `--font-heading` / `--font-body` as CSS custom properties, so anything
 *      outside the React tree can use them.
 *   3. `preconnect`, so the font handshake starts before the CSS is parsed.
 *
 * Runs once, and only in a browser. On native `document` is undefined and this
 * is a no-op.
 */

const STYLESHEET =
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&family=Lobster&display=swap';

export const FONT_STACK = {
  heading: "'Space Grotesk', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  name: "'Lobster', cursive",
} as const;

let installed = false;

export function installWebFonts(): void {
  if (installed) return;
  if (typeof document === 'undefined') return;
  installed = true;

  const head = document.head;

  // Preconnect first: it only helps if it runs before the stylesheet request.
  for (const [href, crossOrigin] of [
    ['https://fonts.googleapis.com', false],
    ['https://fonts.gstatic.com', true],
  ] as const) {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = href;
    if (crossOrigin) link.crossOrigin = 'anonymous';
    head.appendChild(link);
  }

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = STYLESHEET;
  head.appendChild(stylesheet);

  const variables = document.createElement('style');
  variables.textContent =
    `:root{--font-heading:${FONT_STACK.heading};--font-body:${FONT_STACK.body};--font-name:${FONT_STACK.name};}`;
  head.appendChild(variables);
}
