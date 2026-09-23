const sanitizeHtml = require('sanitize-html');
const INLINE_TAGS = ['b', 'strong', 'i', 'em', 'u', 's', 'mark', 'code', 'br', 'a'];
const common = {
  allowedSchemes: ['https', 'http', 'mailto'],
  allowedSchemesByTag: { img: ['https'], iframe: ['https'] },
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }),
  },
};
function sanitizeInline(html) {
  return sanitizeHtml(String(html ?? ''), { ...common, allowedTags: INLINE_TAGS, allowedAttributes: { a: ['href', 'rel', 'target'] } });
}
function sanitizeArticle(html) {
  return sanitizeHtml(String(html ?? ''), {
    ...common,
    allowedTags: [...INLINE_TAGS, 'p', 'h2', 'h3', 'h4', 'ol', 'ul', 'li', 'blockquote', 'footer', 'figure', 'figcaption', 'img', 'div', 'iframe', 'pre', 'hr'],
    allowedAttributes: { a: ['href', 'rel', 'target'], img: ['src', 'alt', 'loading', 'width', 'height'], iframe: ['src', 'allowfullscreen', 'frameborder'], figure: ['class'], div: ['class'], pre: ['class'], hr: ['class'] },
    allowedClasses: { figure: ['journal-figure', 'journal-carousel', 'journal-product', 'journal-focus-top', 'journal-focus-bottom'], div: ['journal-embed', 'journal-pair'], pre: ['journal-code'], hr: ['journal-delimiter'] },
    allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com', 'www.instagram.com', 'platform.twitter.com', 'twitframe.com'],
    allowIframeRelativeUrls: false,
    exclusiveFilter: frame => ['iframe', 'img'].includes(frame.tag) && !frame.attribs.src,
  });
}
// JSON is embedded in HTML script elements, whose end tag is recognized even
// inside a JSON string. Escape the HTML delimiter without changing the data.
function scriptJson(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
module.exports = { sanitizeInline, sanitizeArticle, scriptJson };
