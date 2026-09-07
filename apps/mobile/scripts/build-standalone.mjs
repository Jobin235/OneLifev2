import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Inlines the VITE_LOCAL build into one self-contained HTML page.
 *
 * This is the "open a link and play" build: no server, no install, the whole
 * simulation running client-side. It is a demo of the game, not the shipped
 * architecture — see apps/mobile/src/lib/localGame.ts for why that distinction
 * matters. Run `pnpm --filter @lineage/mobile build:standalone`.
 */
const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const out = join(here, '..', 'standalone');

const html = readFileSync(join(dist, 'index.html'), 'utf8');

/*
 * Match the built bundle specifically, under /assets/. The page also links
 * /fonts/fonts.css, and a looser regex picks that up instead — which ships a
 * page with the fonts inlined twice and no application CSS at all. It looks
 * fine to any check that reads text rather than pixels, so the assertions
 * below exist to make that failure loud.
 */
const cssHref = /<link[^>]+href="(\/assets\/[^"]+\.css)"/.exec(html)?.[1];
const jsSrc = /<script[^>]+src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
if (!cssHref || !jsSrc) throw new Error('could not find the built css/js under /assets/ in dist/index.html');

const css = readFileSync(join(dist, cssHref.replace(/^\//, '')), 'utf8');
const js = readFileSync(join(dist, jsSrc.replace(/^\//, '')), 'utf8');

// The application stylesheet must actually be the application stylesheet.
for (const marker of ['--coral', '.age-up', '.stat-row']) {
  if (!css.includes(marker)) {
    throw new Error(`the stylesheet at ${cssHref} is missing ${marker} — wrong file?`);
  }
}
if (!js.includes('createRoot')) throw new Error(`the bundle at ${jsSrc} does not look like the app`);

// The vendored woff2 files become data: URIs so the page needs nothing external.
const fontCss = readFileSync(join(dist, 'fonts', 'fonts.css'), 'utf8').replace(
  /url\(\/fonts\/([^)]+)\)/g,
  (_match, file) => {
    const data = readFileSync(join(dist, 'fonts', file)).toString('base64');
    return `url(data:font/woff2;base64,${data})`;
  },
);

const favicon =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%8C%B1%3C/text%3E%3C/svg%3E";

const body = `<style>
${fontCss}
${css}
/* The frame is the phone. The app column centres itself and sets its own width. */
html, body, #root { height: 100%; }
body { margin: 0; background: #EFE6D8; }
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;

mkdirSync(out, { recursive: true });

/*
 * Two shapes of the same page.
 *
 * The standalone file is a complete document, because opening it from disk or
 * serving it statically means nothing else supplies a charset — and without one
 * every "·" in the design renders as "Â·".
 *
 * The fragment is for hosts that provide their own <head>. It deliberately omits
 * doctype, html, head and body.
 */
const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no">
<meta name="theme-color" content="#FFF9F2">
<title>One Life</title>
<link rel="icon" href="${favicon}">
</head>
<body>
${body}</body>
</html>
`;

const fragment = `<title>One Life</title>
${body}`;

writeFileSync(join(out, 'one-life.html'), standalone);
writeFileSync(join(out, 'one-life.fragment.html'), fragment);

const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log(`→ standalone/one-life.html           ${kb(Buffer.byteLength(standalone))}  (complete document)`);
console.log(`→ standalone/one-life.fragment.html  ${kb(Buffer.byteLength(fragment))}  (host supplies <head>)`);
console.log(`   css ${kb(css.length)} · js ${kb(js.length)} · fonts ${kb(fontCss.length)}`);
