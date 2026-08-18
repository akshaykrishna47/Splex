/**
 * Post-processes the exported web build into an installable PWA.
 *
 * Why this exists: Expo Router's `+html.tsx` shell is only honoured when
 * `web.output` is `"static"`. Splex ships as an SPA (`"single"`) — it is
 * entirely auth-walled, so prerendering buys nothing, and static rendering
 * would evaluate the Supabase client in Node at build time. So the handful of
 * PWA tags that Expo's SPA template doesn't emit are injected here instead.
 *
 * Idempotent: running it twice does not duplicate the tags.
 */

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.argv[2] ?? 'dist';
const INDEX = join(DIST, 'index.html');

if (!existsSync(INDEX)) {
  console.error(`finalize-web: ${INDEX} not found. Run \`expo export --platform web\` first.`);
  process.exit(1);
}

const MARKER = '<!-- splex:pwa -->';

const HEAD_TAGS = `${MARKER}
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&family=Lobster&display=swap"
    />
    <style>
      :root {
        --font-heading: 'Space Grotesk', system-ui, sans-serif;
        --font-body: 'Inter', system-ui, sans-serif;
        --font-name: 'Lobster', cursive;
      }
      body { font-family: var(--font-body); }
      h1, h2, h3, h4, h5, h6 { font-family: var(--font-heading); }
    </style>
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Splex" />
    <link rel="apple-touch-icon" href="/icons/icon-1024.png" />
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('/sw.js').catch(function () {
            /* An unregistered worker only costs offline shell caching. */
          });
        });
      }
    </script>
`;

/**
 * SPA routing is NOT handled here. It comes from `not_found_handling` in
 * `wrangler.jsonc`.
 *
 * This script used to also emit a `_redirects` file, on the assumption that
 * Workers would ignore it the way it ignores other Pages conventions. It does
 * not: Workers validates `_redirects` at deploy time and rejects the whole
 * deployment if it is malformed. The rule written here was
 *
 *     /*  /index.html  200
 *
 * which Cloudflare refuses with "Infinite loop detected in this rule" — `/*`
 * matches `/index.html` itself, so serving it would re-trigger the same rule.
 * The build succeeded and the deploy failed, every time.
 *
 * Nothing is lost by dropping it. `not_found_handling: "single-page-application"`
 * already serves index.html with a 200 for unmatched paths, which is the whole
 * job. If this ever moves to Cloudflare Pages, add a `_redirects` there with a
 * rule that excludes the fallback target rather than reinstating this one.
 *
 * It is actively DELETED rather than merely not written. Cloudflare restores
 * `dist/` from a build cache between runs, and `expo export` only overwrites
 * the files it generates — an old `_redirects` left in that cache survives into
 * the new build and fails the deploy just the same. Not writing it is not
 * enough; the build has to clean up after the version of itself that did.
 */
if (existsSync(join(DIST, '_redirects'))) {
  rmSync(join(DIST, '_redirects'));
  console.log('finalize-web: removed a stale _redirects (see the note above).');
}

let html = readFileSync(INDEX, 'utf8');

if (html.includes(MARKER)) {
  console.log('finalize-web: already applied, nothing to do.');
  process.exit(0);
}

if (!html.includes('</head>')) {
  console.error('finalize-web: no </head> in index.html — Expo template changed shape.');
  process.exit(1);
}

html = html.replace('</head>', `  ${HEAD_TAGS}  </head>`);
writeFileSync(INDEX, html, 'utf8');

// Fail loudly if the assets the tags point at are missing, rather than
// shipping a manifest that 404s.
const required = ['manifest.webmanifest', 'sw.js', 'icons/icon-1024.png', 'icons/icon-512-maskable.png'];
const missing = required.filter((file) => !existsSync(join(DIST, file)));

if (missing.length > 0) {
  console.error(`finalize-web: missing from ${DIST}/: ${missing.join(', ')}`);
  console.error('These live in public/ and should be copied by the export step.');
  process.exit(1);
}

console.log('finalize-web: PWA tags injected, all referenced assets present.');
