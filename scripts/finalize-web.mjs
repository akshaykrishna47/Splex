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

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
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
 * Cloudflare Pages SPA routing.
 *
 * Expo exports one index.html and does all routing client-side, so a request
 * straight to /trips or /about — a refresh, a shared link, a bookmark — asks
 * the host for a file that does not exist. Without this every route but `/`
 * 404s, and only on reload, which is exactly the kind of bug that survives
 * testing and breaks in front of someone else.
 *
 * `200` rather than a redirect: the URL has to stay put so the router can read
 * it. The 404 line is second because Cloudflare takes the first match, and it
 * lets genuinely missing assets keep failing as assets instead of silently
 * returning the app shell.
 */
writeFileSync(
  join(DIST, '_redirects'),
  ['/_expo/*  /_expo/:splat  200', '/*  /index.html  200', ''].join('\n'),
  'utf8',
);

let html = readFileSync(INDEX, 'utf8');

if (html.includes(MARKER)) {
  console.log('finalize-web: _redirects written; PWA tags already applied.');
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

console.log('finalize-web: PWA tags injected, _redirects written, all referenced assets present.');
