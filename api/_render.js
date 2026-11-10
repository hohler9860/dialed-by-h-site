// Pure render helpers (underscore = not a serverless function, just an import).
// Used by get-inventory to serve SSR watch pages and the dynamic sitemap without
// adding new functions (Hobby plan caps at 12).
// Watch pages use the shared brand chrome and stylesheet (lib/brand-chrome.js,
// assets/dbh-brand.css); inquiries open the shared card from assets/modals.js.
const chrome = require('../lib/brand-chrome');
const { pickRelated } = require('../lib/related-pieces');
const SITE_URL = process.env.SITE_URL || 'https://www.dialedbyhenry.com';
const WA_NUMBER = '19146211848';

function escHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const escAttr = escHtml;

// Piece images are now absolute Supabase Storage URLs, already processed and
// permanently cacheable. They must be emitted AS-IS: routing them back through
// /img?src= would reintroduce the serverless hop this migration removed.
// The /img fallbacks stay for any legacy relative/foreign path still in flight.
function isAbsolute(raw) {
    return /^https?:\/\//i.test(raw);
}
function normUrl(raw) {
    if (!raw) return `${SITE_URL}/images/og-share-v3.png`;
    if (isAbsolute(raw)) return raw;
    return raw.startsWith('/') ? `${SITE_URL}${raw}` : `${SITE_URL}/img?src=${encodeURIComponent(raw)}`;
}
function normPath(raw) {
    if (!raw) return '';
    if (isAbsolute(raw) || raw.startsWith('/')) return raw;
    return `/img?src=${encodeURIComponent(raw)}`;
}
// Responsive variants live next to the standard by naming convention:
//   .../0.webp -> .../0-thumb.webp (300px) | .../0-medium.webp (600px)
function variantUrl(raw, suffix) {
    const u = normPath(raw);
    return /\.webp$/.test(u) ? u.replace(/\.webp$/, `-${suffix}.webp`) : u;
}

function fourOhFour() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Piece not found | Dialed by H</title>
<meta name="robots" content="noindex, nofollow">
${chrome.headAssets()}
${chrome.pixel()}
</head>
<body>
${chrome.header('Sourcing Catalogue')}
<main class="e404">
  <span class="k">Not found</span>
  <h1 class="pg-h1"><span class="h-lead">Piece</span> not found</h1>
  <p>This piece may no longer be available for sourcing.</p>
  <div class="actions"><a class="btn btn--solid" href="/buy/">Browse all pieces</a><a class="btn" href="/">Back to home</a></div>
</main>
${chrome.footer()}
${chrome.floats()}
${chrome.scripts()}
</body>
</html>`;
}

function renderWatchPage(w, all = []) {
    // Other models and specifics from the same brand. Server-rendered links, so crawlers
    // index the internal mesh and buyers keep browsing.
    const related = pickRelated(w, all);
    const displayName = w.name + (w.nickname ? ` "${w.nickname}"` : '');
    const canonical = `${SITE_URL}/watch/${w.slug}`;
    const img = normUrl(w.image);
    // Links to a watch preview as a branded card. The 16 pieces without a cutout keep their photo.
    const hasCard = /-cutout\.webp$/.test(w.imageCutout || '');
    const shareImg = hasCard ? `${SITE_URL}/share/watch/${w.slug}.jpg` : img;
    const title = `${displayName}${w.ref ? ' ' + w.ref : ''} | Dialed by H`;
    const brandName = displayName.toLowerCase().startsWith(String(w.brand || '').toLowerCase()) ? displayName : `${w.brand} ${displayName}`;
    const description = `${brandName}${w.ref ? ' (Ref. ' + w.ref + ')' : ''}, available through Dialed by H, a nationwide US luxury watch concierge based in Boston, New York City, and Miami. Authenticated, with fully insured shipping anywhere in the United States. Inquire for pricing and availability.`;

    const specs = [
        ['Brand', w.brand], ['Model', w.model], ['Reference', w.ref], ['Nickname', w.nickname],
        ['Year', w.year], ['Case Material', w.caseMaterial], ['Case Size', w.caseSize],
        ['Dial Color', w.dialColor], ['Bracelet / Strap', w.bracelet], ['Condition', w.condition], ['Set', w.set],
    ].filter(([, v]) => v);

    const productLD = {
        '@context': 'https://schema.org', '@type': 'Product',
        name: displayName,
        brand: { '@type': 'Brand', name: w.brand },
        category: w.model || undefined,
        description,
        image: [img],
        ...(w.ref ? { sku: w.ref, mpn: w.ref } : {}),
        ...(w.caseMaterial ? { material: w.caseMaterial } : {}),
        ...(w.year ? { releaseDate: String(w.year) } : {}),
        ...(w.tags ? { keywords: w.tags } : {}),
        additionalProperty: specs.map(([name, value]) => ({ '@type': 'PropertyValue', name, value: String(value) })),
        offers: {
            '@type': 'Offer',
            areaServed: ['Boston', 'New York City', 'Miami', 'United States'],
            availability: 'https://schema.org/InStock',
            itemCondition: w.condition && /new|unworn/i.test(w.condition) ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
            priceCurrency: 'USD',
            url: canonical,
            seller: {
                '@type': 'Organization', name: 'Dialed by H', url: SITE_URL,
                areaServed: { '@type': 'Country', name: 'United States' },
            },
        },
    };
    const breadcrumbLD = {
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
            { '@type': 'ListItem', position: 2, name: 'Buy', item: `${SITE_URL}/buy/` },
            { '@type': 'ListItem', position: 3, name: displayName, item: canonical },
        ],
    };

    // What the "Inquire to source" card arrives filled in with. A few pieces have no model on file:
    // their name stands in (minus the brand), so the request still says which watch it is about.
    const brandLc = String(w.brand || '').toLowerCase();
    const nameOnly = String(w.name || '').trim();
    const askModel = w.model || (brandLc && nameOnly.toLowerCase().startsWith(brandLc) ? nameOnly.slice(brandLc.length).trim() : nameOnly);

    const waText = encodeURIComponent(`Hi Henry, I'm interested in the ${displayName}${w.ref ? ' (Ref. ' + w.ref + ')' : ''}. Is it available?`);
    const waLink = `https://wa.me/${WA_NUMBER}?text=${waText}`;

    const imgs = (w.images && w.images.length ? w.images : (w.image ? [w.image] : []));
    // The transparent cutout on the warm panel where one exists; anything else
    // (a wrist shot, an unprocessed upload) stays full-bleed on charcoal.
    const cutouts = w.imagesCutout || [];
    const shots = imgs.map((u, i) => {
        const c = cutouts[i] || '';
        const cut = /-cutout\.webp$/.test(c);
        return { main: cut ? normPath(c) : variantUrl(u, 'medium'), thumb: variantUrl(cut ? c : u, 'thumb'), cut };
    });
    const stack = String(w.details || '').split(/\s*[·•|]\s*/).filter(Boolean);

    const thumbsHtml = shots.length > 1
        ? `<div class="pt-thumbs">` + shots.map((t, i) =>
            `<button type="button" class="${i === 0 ? 'is-active' : ''}" data-src="${escAttr(t.main)}" data-cut="${t.cut ? 1 : 0}" aria-label="Photo ${i + 1}"><img src="${escAttr(t.thumb)}" width="64" height="64" alt="" loading="lazy"></button>`
          ).join('') + `</div>`
        : '';

    const specsHtml = specs.map(([k, v]) =>
        `<tr><td>${escHtml(k)}</td><td>${escHtml(v)}</td></tr>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${escHtml(title)}</title>
<meta name="description" content="${escAttr(description)}">
${w.tags ? `<meta name="keywords" content="${escAttr(w.tags)}">` : ''}
<meta name="author" content="Henry Ohler">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonical}">

<meta property="og:type" content="product">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${escAttr(displayName)}${w.ref ? ' - ' + escAttr(w.ref) : ''}">
<meta property="og:description" content="${escAttr(description)}">
<meta property="og:image" content="${escAttr(shareImg)}">
${hasCard ? '<meta property="og:image:type" content="image/jpeg">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n' : ''}<meta property="og:image:alt" content="${escAttr(displayName)}">
<meta property="og:site_name" content="Dialed by H">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escAttr(displayName)}">
<meta name="twitter:description" content="${escAttr(description)}">
<meta name="twitter:image" content="${escAttr(shareImg)}">

<script type="application/ld+json">${JSON.stringify(productLD)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbLD)}</script>

<link rel="preconnect" href="https://untnrofsnmoyxdidxbdj.supabase.co" crossorigin>
${chrome.headAssets()}
${chrome.pixel()}
</head>
<body>
${chrome.header('Sourcing Catalogue')}
<main class="pg">
<a class="pt-back" href="/buy/">&larr; Back to all pieces</a>
<div class="pt-detail">
<div class="pt-media">
<div class="pt-media__main${shots[0] && !shots[0].cut ? ' is-render' : ''}" id="pt-main"><img id="pt-main-img" src="${shots[0] ? escAttr(shots[0].main) : ''}" width="600" height="600" fetchpriority="high" alt="${escAttr(displayName)}"></div>
${thumbsHtml}
</div>
<div class="pt-info">
<p class="pt-brand">${escHtml(w.brand)}</p>
<h1 class="pt-title">${escHtml(w.name || w.model)}</h1>
${w.ref ? `<p class="pt-ref">Ref. ${escHtml(w.ref)}</p>` : ''}
${stack.length ? `<ul class="pt-stack">${stack.map(d => `<li>${escHtml(d)}</li>`).join('')}</ul>` : ''}
<p class="pt-blurb">Sourced for clients across the United States.</p>
<div class="pt-inquiry">
<p>Interested in this piece? Inquire below and I&rsquo;ll get back to you with sourcing details, pricing, and availability.</p>
<a class="btn btn--solid btn--full" href="${waLink}" target="_blank" rel="noopener">Message on WhatsApp</a>
<a class="btn btn--full" href="/source" data-modal="source" data-brand="${escAttr(w.brand || '')}" data-model="${escAttr(askModel)}" data-ref="${escAttr(w.ref || '')}">Inquire to source</a>
</div>
<div class="pt-chips"><span class="pt-chip">Authenticated</span><span class="pt-chip">Insured nationwide</span><span class="pt-chip">Secure transaction</span></div>
</div>
</div>
<section class="pt-specs"><h2>Specifications</h2><table>${specsHtml}</table></section>
${related.length ? `
<section class="pt-specs pt-related"><h2>Related pieces</h2>
<div class="pt-relgrid">${related.map(p => chrome.watchTile(p, escAttr)).join('')}</div></section>` : ''}
</main>
${chrome.footer()}
${chrome.floats()}
${chrome.scripts()}
<script>
document.querySelectorAll('.pt-thumbs button').forEach(function (b) {
    b.addEventListener('click', function () {
        document.getElementById('pt-main-img').src = b.dataset.src;
        document.getElementById('pt-main').classList.toggle('is-render', b.dataset.cut !== '1');
        document.querySelectorAll('.pt-thumbs button').forEach(function (x) { x.classList.remove('is-active'); });
        b.classList.add('is-active');
    });
});
</script>
</body>
</html>`;
}

// The date every page last changed because of a template. Bump it after a change that
// touches all pages, so Google knows to look again. Newer rows keep their own date.
const SITE_UPDATED = '2026-11-06';
const newestDate = (...dates) => dates.map(d => String(d || '').slice(0, 10)).reduce((a, b) => (b > a ? b : a), SITE_UPDATED);

function renderSitemap(pieces, articles = []) {
    const CORE = [
        { loc: '/', changefreq: 'daily', priority: '1.0' },
        { loc: '/buy/', changefreq: 'daily', priority: '0.9' },
        { loc: '/journal/', changefreq: 'weekly', priority: '0.8' },
        { loc: '/about/', changefreq: 'monthly', priority: '0.8' },
        { loc: '/process/', changefreq: 'monthly', priority: '0.7' },
        { loc: '/boston', changefreq: 'monthly', priority: '0.7' },
        { loc: '/rolex', changefreq: 'daily', priority: '0.8' },
        { loc: '/patek-philippe', changefreq: 'daily', priority: '0.8' },
        { loc: '/audemars-piguet', changefreq: 'daily', priority: '0.8' },
        { loc: '/richard-mille', changefreq: 'daily', priority: '0.8' },
        { loc: '/vacheron-constantin', changefreq: 'daily', priority: '0.8' },
        { loc: '/cartier', changefreq: 'daily', priority: '0.8' },
        { loc: '/fp-journe', changefreq: 'daily', priority: '0.8' },
        { loc: '/a-lange-sohne', changefreq: 'daily', priority: '0.8' },
        { loc: '/sell-rolex-boston', changefreq: 'monthly', priority: '0.7' },
        { loc: '/rolex-dealer-boston', changefreq: 'monthly', priority: '0.7' },
        { loc: '/buy-rolex-boston', changefreq: 'monthly', priority: '0.7' },
        { loc: '/patek-philippe-boston', changefreq: 'monthly', priority: '0.7' },
        { loc: '/privacy', changefreq: 'yearly', priority: '0.3' },
    ];
    const tag = ({ loc, changefreq, priority, lastmod }) =>
        `  <url><loc>${SITE_URL}${loc}</loc><lastmod>${lastmod || SITE_UPDATED}</lastmod>${changefreq ? `<changefreq>${changefreq}</changefreq>` : ''}${priority ? `<priority>${priority}</priority>` : ''}</url>`;
    const watchTags = (pieces || [])
        .filter(p => p.image && p.slug)
        .map(p => tag({ loc: `/watch/${p.slug}`, changefreq: 'weekly', priority: '0.8', lastmod: newestDate(p.addedAt, p.updatedAt) }))
        .join('\n');
    const articleTags = articles
        .filter(a => a.status === 'published' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug || ''))
        .map(a => tag({ loc: `/journal/${a.slug}`, changefreq: 'monthly', priority: '0.8', lastmod: newestDate(a.updated_at) }))
        .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${CORE.map(tag).join('\n')}${watchTags ? '\n' + watchTags : ''}${articleTags ? '\n' + articleTags : ''}
</urlset>`;
}

module.exports = { renderWatchPage, renderSitemap, fourOhFour, SITE_URL };
