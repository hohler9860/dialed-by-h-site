// The article's opening image is its cover; older posts may only have inline images.
const { decodeHTML } = require('entities');
function journalImage(article) {
  const inline = String(article.content_html || '').match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  for (const candidate of [article.hero_image_url, inline && decodeHTML(inline[1])]) {
    if (typeof candidate !== 'string') continue;
    try { const url = new URL(candidate); if (url.protocol === 'https:' || url.protocol === 'http:') return url.href; } catch {}
    if (/^\/(?!\/)/.test(candidate)) return candidate;
  }
  return null;
}
module.exports = { journalImage };
