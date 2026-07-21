// Inlines dist/styles.css into index.html between the tw-inline markers, so
// the homepage renders without a blocking stylesheet request. Runs as part of
// `npm run build` — never edit the inlined block by hand, edit src/input.css
// and rebuild. Other pages (boston, 404) keep the <link> tag; only the
// homepage is LCP-critical.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(root, "dist", "styles.css"), "utf8").trim();
const file = path.join(root, "index.html");
let html = fs.readFileSync(file, "utf8");

const open = "<style id=\"tw-inline\">";
const close = "</style><!--/tw-inline-->";
const block = `${open}${css}${close}`;

if (html.includes(open)) {
  html = html.replace(new RegExp(`${open}[\\s\\S]*?${close.replace(/[/\\-]/g, "\\$&")}`), block);
} else {
  html = html.replace('<link rel="stylesheet" href="/dist/styles.css">', block);
}
fs.writeFileSync(file, html);
console.log(`[inline-css] inlined ${Math.round(css.length / 1024)}KB into index.html`);
