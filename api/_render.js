// Pure render helpers (underscore = not a serverless function, just an import).
// Used by get-inventory to serve SSR watch pages and the dynamic sitemap without
// adding new functions (Hobby plan caps at 12).
// Watch pages render in the rebuild design: white, mono, Archivo display,
// shared site header/footer, fullscreen source modal for inquiries.
const SITE_URL = process.env.SITE_URL || 'https://dialedbyhenry.com';
const WA_NUMBER = '19146211848';

function escHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const escAttr = escHtml;

function normUrl(raw) {
    return raw ? `${SITE_URL}/img?src=${encodeURIComponent(raw)}` : `${SITE_URL}/images/og-share-v2.png`;
}
function normPath(raw) {
    return `/img?src=${encodeURIComponent(raw)}`;
}

function fourOhFour() {
    return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Piece not found - Dialed By H</title><meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-fpj-32.png?v=4" />
<style>
@font-face{font-display:swap;font-family:"Archivo";font-style:normal;font-weight:100 900;font-stretch:62% 125%;src:url(/assets/fonts/Archivo-wdth-wght.woff2) format("woff2")}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fff;color:#000;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;text-align:center;padding:24px}
h1{font-family:"Archivo","Helvetica Neue",Helvetica,Arial,sans-serif;font-weight:700;font-variation-settings:"wdth" 120;font-size:40px;text-transform:uppercase;letter-spacing:-.02em;margin:0 0 14px}
p{font-size:13px;color:rgba(0,0,0,.55);margin:0 0 28px}
a{display:inline-block;background:#0a0a0a;color:#fff;text-decoration:none;padding:16px 34px;font-size:11px;letter-spacing:.18em;text-transform:uppercase}
small{display:block;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(0,0,0,.4);margin-bottom:16px}
</style></head>
<body><div>
<small>Dialed By H</small>
<h1>Piece not found</h1>
<p>This piece may no longer be available for sourcing.</p>
<a href="/buy/">Browse all pieces</a>
</div></body></html>`;
}

function renderWatchPage(w) {
    const displayName = w.name + (w.nickname ? ` "${w.nickname}"` : '');
    const canonical = `${SITE_URL}/watch/${w.slug}`;
    const img = normUrl(w.image);
    const title = `${displayName}${w.ref ? ' ' + w.ref : ''} | Dialed By H`;
    const description = `${displayName}${w.ref ? ' (Ref. ' + w.ref + ')' : ''} — ${w.brand} available through Dialed By H, a nationwide US luxury watch concierge based in New York & Boston. Authenticated, with fully insured shipping anywhere in the United States. Inquire for pricing and availability.`;

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
        additionalProperty: specs.map(([name, value]) => ({ '@type': 'PropertyValue', name, value: String(value) })),
        offers: {
            '@type': 'Offer',
            availability: 'https://schema.org/InStock',
            itemCondition: w.condition && /new|unworn/i.test(w.condition) ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
            priceCurrency: 'USD',
            url: canonical,
            seller: {
                '@type': 'Organization', name: 'Dialed By H', url: SITE_URL,
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

    const waText = encodeURIComponent(`Hi Henry, I'm interested in the ${displayName}${w.ref ? ' (Ref. ' + w.ref + ')' : ''}. Is it available?`);
    const waLink = `https://wa.me/${WA_NUMBER}?text=${waText}`;

    const imgs = (w.images && w.images.length ? w.images : (w.image ? [w.image] : []));
    const attrs = [w.caseMaterial, w.dialColor && (w.dialColor + ' dial'), w.bracelet].filter(Boolean).join(' &middot; ');

    const thumbsHtml = imgs.length > 1
        ? `<div class="pt-thumbs">` + imgs.map((u, i) =>
            `<button type="button" class="${i === 0 ? 'is-active' : ''}" data-src="${escAttr(normPath(u))}"><img src="${escAttr(normPath(u))}" alt="${escAttr(displayName)} view ${i + 1}" loading="lazy"></button>`
          ).join('') + `</div>`
        : '';

    const specsHtml = specs.map(([k, v]) =>
        `<tr><td>${escHtml(k)}</td><td>${escHtml(v)}</td></tr>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-fpj-32.png?v=4" />
<link rel="icon" type="image/png" sizes="192x192" href="/favicon-fpj-192.png?v=4" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=4" />
<title>${escHtml(title)}</title>
<meta name="description" content="${escAttr(description)}">
<meta name="author" content="Henry Ohler">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonical}">

<meta property="og:type" content="product">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${escAttr(displayName)}${w.ref ? ' - ' + escAttr(w.ref) : ''}">
<meta property="og:description" content="${escAttr(description)}">
<meta property="og:image" content="${escAttr(img)}">
<meta property="og:image:alt" content="${escAttr(displayName)}">
<meta property="og:site_name" content="Dialed By H">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escAttr(displayName)}">
<meta name="twitter:description" content="${escAttr(description)}">
<meta name="twitter:image" content="${escAttr(img)}">

<script type="application/ld+json">${JSON.stringify(productLD)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbLD)}</script>

<link rel="stylesheet" href="/wp-content/themes/avw/public/index.css">
<style id="primetime-overrides">
:root{--pt-mono:"Tronica Mono",ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;--pt-serif:"Roslindale Display Condensed",Georgia,serif}

/* ===== BLACK & WHITE: no cream, no gold, anywhere ===== */
.bg-beige{background-color:#fff!important}
.text-navy{color:rgba(0,0,0,.55)!important}
.\!text-gold,.text-gold{color:#8a8a85!important}
.bg-gold,.product-card__label.bg-gold{background-color:#000!important}
.border-gold{border-color:#000!important}
.button{border-color:currentColor!important}
.cart-icon i.has-elements{background-color:#000!important;color:#fff!important}
.cart-icon.is-active,.cart-icon:hover,.cart-icon.is-active *,.cart-icon:hover *{color:inherit!important}
.header__bar__search.is-active,.header__bar__search:hover{color:inherit!important}
.header__bar li a.is-active,.header__bar li a:hover{color:inherit!important}
.header__bar li a.is-active svg *,.header__bar li a:hover svg *{stroke:currentColor!important}
.nav-desktop a.is-active,.nav-desktop a:hover,.nav-mobile__menu>li a.is-active,.nav-mobile__menu>li a:hover{color:#000!important}
.pagination a:not(.current):hover,.pagination span:not(.current):hover{color:#000!important}
.stocklist__header span:hover{color:#000!important}
.stocklist__header span:hover svg path{fill:#000!important}
.text__menu li.current-menu-item a,.text__menu li:hover a{color:#000!important}
.toggle__header:hover i span{background-color:#000!important}
.watch-guide blockquote>p{color:#000!important}
.modal-video .js-episodes.is-active,.modal-video ul li.is-active span,.modal-video ul li:hover span{color:#fff!important}
.modal-video .current,.modal-video .knob{background-color:#fff!important}
input[type=checkbox]:checked~label:before{background-color:#000!important;border-color:#000!important}
.sell-form .dropzone{border-color:rgba(0,0,0,.3)!important}
.woocommerce-MyAccount-navigation .is-active{color:#000!important}

/* ===== TYPE SYSTEM: tronica-mono everywhere ===== */
body,.header,.footer,.pt-statement,.pt-editorial,.pt-modal,.search-bar{font-family:var(--pt-mono)}
.header__bar__logo{height:1.75rem;top:50%;transform:translate(-50%,-50%)}
.header.text-navy .header__bar__logo img{filter:invert(1)}

/* nav hover: hovered stays, siblings dim */
.header__bar ul li a{transition:opacity .18s ease;display:inline-block;padding:6px 2px}
.header__bar ul:hover li a{opacity:.35}
.header__bar ul li:hover a{opacity:1!important}
.cart-icon{transition:opacity .18s ease}
.header__bar__right:hover ~ .cart-icon{opacity:1}
.footer a{transition:opacity .3s ease}
.footer a:hover{opacity:.55}

/* headline reveal: opacity only, no blur */
.js-reveal,.museum__title{filter:none!important}

/* WhatsApp float */
.wa-float{position:fixed;right:22px;bottom:22px;z-index:60;width:58px;height:58px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.35);transition:transform .3s ease}
.wa-float:hover{transform:scale(1.08)}
.wa-float svg{width:30px;height:30px}

/* statement + editorial (mono, b&w) */
.pt-statement{max-width:1360px;margin:0 auto;padding:20px 40px 110px;display:flex;flex-direction:column}
.pt-statement__line{display:flex;align-items:baseline;gap:26px;background:none;border:none;border-top:1px solid rgba(0,0,0,.14);padding:26px 2px;cursor:pointer;text-align:left;color:#000;font-family:var(--pt-mono)}
.pt-statement__line:last-child{border-bottom:1px solid rgba(0,0,0,.14)}
.pt-statement__line em{font-style:normal;font-family:var(--pt-serif);font-size:clamp(48px,6vw,88px);line-height:1;font-weight:400;text-transform:uppercase;letter-spacing:.01em}
.pt-statement__line span{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(0,0,0,.4);transition:transform .4s cubic-bezier(.19,1,.22,1),color .3s ease}
.pt-statement__line:hover span{transform:translateX(10px);color:#000}
.pt-editorial{max-width:1360px;margin:0 auto;padding:0 40px 120px;display:grid;grid-template-columns:repeat(12,1fr);gap:20px}
.pt-editorial__label{grid-column:1/4;display:flex;flex-direction:column;gap:8px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(0,0,0,.45)}
.pt-editorial__body{grid-column:6/13}
.pt-editorial__body p{font-size:16px;line-height:1.7;margin:0 0 34px}
.pt-editorial__actions{display:flex;gap:14px;flex-wrap:wrap}
.pt-cta{font-family:var(--pt-mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;padding:14px 28px;border:1px solid #000;background:transparent;color:#000;cursor:pointer;transition:background .3s ease,color .3s ease}
.pt-cta:hover{background:#000;color:#fff}
a.pt-cta{text-decoration:none;display:inline-block}
@media(max-width:820px){.pt-editorial__label{grid-column:1/13;flex-direction:row;gap:24px}.pt-editorial__body{grid-column:1/13}}
.pt-reveal{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .9s cubic-bezier(.19,1,.22,1)}
.pt-reveal.is-in{opacity:1;transform:none}

/* ===== modals: fullscreen takeover, serif display + mono labels ===== */
.pt-modal-backdrop{display:none}
.pt-modal{position:fixed;inset:0;z-index:81;background:#0a0a0a;color:#fff;font-family:var(--pt-mono);opacity:0;pointer-events:none;clip-path:inset(0 0 100% 0);transition:clip-path .65s cubic-bezier(.77,0,.18,1),opacity .2s linear .5s}
.pt-modal.is-open{opacity:1;pointer-events:all;clip-path:inset(0 0 0% 0);transition:clip-path .65s cubic-bezier(.77,0,.18,1),opacity .1s linear}
.pt-modal .pm-wrap{height:100%;overflow-y:auto;display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:60px;max-width:1360px;margin:0 auto;padding:110px 40px 60px;box-sizing:border-box}
.pt-modal .pm-meta{font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:rgba(255,255,255,.35);margin:0 0 26px}
.pt-modal .pm-title{font-family:var(--pt-serif);font-weight:400;font-size:clamp(54px,7vw,110px);line-height:.95;text-transform:uppercase;margin:0 0 26px}
.pt-modal .pm-title span{display:block}
.pt-modal .pm-sub{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.4)}
.pt-modal .pt-grid{display:grid;grid-template-columns:1fr 1fr;column-gap:36px;align-content:start}
.pt-modal .pt-field{opacity:0;transform:translateY(22px);transition:opacity .5s ease,transform .6s cubic-bezier(.19,1,.22,1)}
.pt-modal.is-open .pt-field{opacity:1;transform:none}
.pt-modal .pt-field--full{grid-column:1 / -1}
.pt-modal label{display:block;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.4);margin:22px 0 0}
.pt-modal input,.pt-modal select,.pt-modal textarea{width:100%;box-sizing:border-box;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,.22);color:#fff;padding:10px 0;font-size:14px;font-family:var(--pt-mono);border-radius:0;-webkit-appearance:none;appearance:none;transition:border-color .25s ease}
.pt-modal input:focus,.pt-modal select:focus,.pt-modal textarea:focus{outline:none;border-bottom-color:#fff}
.pt-modal select{background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M1 1l4 4 4-4' stroke='white' fill='none'/></svg>");background-repeat:no-repeat;background-position:right 2px center;padding-right:20px}
.pt-modal select option{background:#0a0a0a;color:#fff}
.pt-modal textarea{min-height:52px;max-height:90px;resize:vertical}
.pt-modal input::placeholder,.pt-modal textarea::placeholder{color:rgba(255,255,255,.25);font-size:11px;text-transform:uppercase;letter-spacing:.06em}
.pt-modal .pt-submit{margin-top:36px;grid-column:1/-1;background:#fff;color:#000;border:none;padding:18px;font-size:11px;letter-spacing:.22em;text-transform:uppercase;font-family:var(--pt-mono);cursor:pointer;transition:opacity .25s ease}
.pt-modal .pt-submit:hover{opacity:.85}
.pt-modal .pt-close{position:absolute;top:22px;right:26px;width:44px;height:44px;border:none;background:transparent;color:#fff;font-size:20px;cursor:pointer;transition:transform .3s ease;z-index:2}
.pt-modal .pt-close:hover{transform:rotate(90deg)}
.pt-modal .pt-dm{display:flex;flex-direction:column;gap:12px;align-content:start}
.pt-modal .pt-dm a{display:flex;align-items:center;justify-content:center;gap:10px;padding:18px;border:1px solid rgba(255,255,255,.35);color:#fff;text-decoration:none;font-size:11px;letter-spacing:.2em;text-transform:uppercase;transition:background .3s ease,color .3s ease}
.pt-modal .pt-dm a:hover{background:#fff;color:#000}
@media(max-width:900px){.pt-modal .pm-wrap{grid-template-columns:1fr;gap:20px;padding:90px 22px 40px}.pt-modal .pm-title{font-size:clamp(44px,12vw,72px)}}
.hsst-char{display:inline-block;white-space:pre}
@keyframes hsstFadeIn{from{opacity:0}to{opacity:1}}
.pt-floats{position:fixed;right:22px;bottom:22px;z-index:60;display:flex;flex-direction:column;gap:12px}
.pt-floats .wa-float{position:static;right:auto;bottom:auto}
.ig-float{width:58px;height:58px;border-radius:50%;background:radial-gradient(circle at 30% 110%,#fdf497 0%,#fdf497 5%,#fd5949 45%,#d6249f 60%,#285AEB 90%);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.35);transition:transform .3s ease}
.ig-float:hover{transform:scale(1.08)}
.ig-float svg{width:27px;height:27px}
@media(max-width:900px){}
.pt-modal .pm-check{display:flex;align-items:center;gap:12px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.6);margin-top:26px;cursor:pointer}
.pt-modal .pm-check input{appearance:none;-webkit-appearance:none;width:14px;height:14px;border:1px solid rgba(255,255,255,.4);background:transparent;cursor:pointer;margin:0;flex-shrink:0}
.pt-modal .pm-check input:checked{background:#fff}
</style>
<style id="watch-page">
:root{--pt-mono:"Tronica Mono",ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;--pt-serif:"Roslindale Display Condensed",Georgia,serif}
body{background:#fff;color:#000;font-family:var(--pt-mono)}
.pt-page{padding:112px 0 110px}
.pt-page .container{max-width:1360px;margin:0 auto;padding:0 40px}
.pt-back{display:inline-flex;align-items:center;gap:10px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:rgba(0,0,0,.5);text-decoration:none;margin-bottom:40px;transition:color .25s ease}
.pt-back:hover{color:#000}
.pt-detail{display:grid;grid-template-columns:minmax(0,6fr) minmax(0,6fr);gap:56px;align-items:start}
.pt-media{position:sticky;top:110px;max-width:600px}
.pt-media__main{width:100%;aspect-ratio:1/1;background:#0d0d0d;position:relative;overflow:hidden}
.pt-media__main img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.pt-thumbs{display:flex;gap:10px;margin-top:10px;flex-wrap:wrap}
.pt-thumbs button{width:64px;height:64px;padding:0;border:1px solid rgba(0,0,0,.15);background:#0d0d0d;cursor:pointer;overflow:hidden}
.pt-thumbs button.is-active{border-color:#000}
.pt-thumbs img{width:100%;height:100%;object-fit:cover;display:block}
.pt-kicker{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(0,0,0,.45);margin:0 0 12px}
.pt-title{font-family:var(--pt-serif);font-size:clamp(26px,2.9vw,44px);font-weight:400;text-transform:uppercase;letter-spacing:.01em;line-height:1.05;margin:0 0 14px}
.pt-ref{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:rgba(0,0,0,.5);margin:0 0 26px}
.pt-attrs{font-size:12px;letter-spacing:.1em;text-transform:uppercase;margin:0 0 18px}
.pt-blurb{font-size:12px;line-height:1.7;color:rgba(0,0,0,.5);margin:0 0 34px}
.pt-inquiry{border:1px solid rgba(0,0,0,.16);padding:26px 26px 28px;margin-bottom:26px}
.pt-inquiry p{font-size:11px;letter-spacing:.08em;text-transform:uppercase;line-height:1.8;color:rgba(0,0,0,.6);margin:0 0 20px}
.pt-btn{display:flex;align-items:center;justify-content:center;width:100%;box-sizing:border-box;padding:16px;font-family:var(--pt-mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;text-decoration:none;cursor:pointer;transition:opacity .25s ease;border:none}
.pt-btn:hover{opacity:.85}
.pt-btn--wa{background:#25D366;color:#fff;margin-bottom:12px}
.pt-btn--ghost{background:#000;color:#fff}
.pt-chips{display:flex;gap:10px;flex-wrap:wrap}
.pt-chip{font-size:9px;letter-spacing:.18em;text-transform:uppercase;border:1px solid rgba(0,0,0,.2);padding:9px 14px;color:rgba(0,0,0,.65)}
.pt-specs{margin-top:64px}
.pt-specs h2{font-family:var(--pt-serif);font-size:28px;font-weight:400;text-transform:uppercase;letter-spacing:.01em;margin:0 0 26px}
.pt-specs table{width:100%;border-collapse:collapse}
.pt-specs td{padding:17px 2px;border-top:1px solid rgba(0,0,0,.12);font-size:12px}
.pt-specs tr:last-child td{border-bottom:1px solid rgba(0,0,0,.12)}
.pt-specs td:first-child{letter-spacing:.18em;text-transform:uppercase;color:rgba(0,0,0,.45);font-size:10px}
.pt-specs td:last-child{text-align:right;letter-spacing:.06em;text-transform:uppercase}
.pt-notfound{padding:120px 0;text-align:center;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:rgba(0,0,0,.5)}
.pt-reveal{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .9s cubic-bezier(.19,1,.22,1)}
.pt-reveal.is-in{opacity:1;transform:none}
@media(max-width:900px){.pt-detail{grid-template-columns:1fr}.pt-media{position:static}}
@media(max-width:640px){
.pt-page{padding:96px 0 70px}
.pt-page .container{padding:0 20px}
.pt-title{font-size:clamp(26px,8.4vw,40px)!important}
.pt-specs h2{font-size:26px}
}
</style>
<style id="dbh-grot">
/* Archivo everywhere: BWC bold display cut replaces the serif */
@font-face{font-display:swap;font-family:"Archivo";font-style:normal;font-weight:100 900;font-stretch:62% 125%;src:url(/assets/fonts/Archivo-wdth-wght.woff2) format("woff2")}
:root{--pt-serif:"Archivo","Helvetica Neue",Helvetica,Arial,sans-serif}
.pt-title,.pt-specs h2{font-weight:700!important;font-variation-settings:"wdth" 120;letter-spacing:-.02em!important;word-break:normal!important;overflow-wrap:normal!important;hyphens:none!important}
.pt-modal .pm-title{font-size:clamp(30px,3.6vw,58px)!important;line-height:1!important}

/* mobile nav: working hamburger menu; hide desktop-only header items on phones */
.dbh-mnav{position:fixed;inset:0;z-index:90;background:rgba(255,255,255,.97);display:none;flex-direction:column;align-items:center;justify-content:center;gap:26px;font-family:var(--pt-mono)}
.dbh-mnav.is-open{display:flex}
.dbh-mnav a,.dbh-mnav button{font-size:17px;letter-spacing:.16em;text-transform:uppercase;color:#000;background:none;border:none;text-decoration:none;font-family:var(--pt-mono);cursor:pointer;padding:4px 8px}
.dbh-mnav .x{position:absolute;top:16px;right:20px;font-size:24px;line-height:1}
@media(max-width:1023px){.header .cart-icon{display:none!important}.header .js-search-icon{display:none!important}}
</style>

<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '798516899968965'); fbq('track', 'PageView');
</script>
</head>
<body class="bg-beige" style="background:#fff">
<header class="header sticky top-0 z-20 text-navy bg-beige"><div class="container"><nav class="header__bar w-full flex justify-between items-center text-10 relative">
<button class="nav-icon text-10 b1024:hidden js-nav-mobile-toggle" aria-label="Toggle navigation">
<span></span>
<span></span>
<span></span>
</button><button class="header__bar__search b1024:hidden mr-auto js-search-icon ml-4" aria-label="Toggle search">
<svg class="w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10.364 3a7.364 7.364 0 100 14.727 7.364 7.364 0 000-14.727v0z" class="stroke-current" stroke-miterlimit="10"/><path d="M15.857 15.857L21 21" class="stroke-current" stroke-miterlimit="10" stroke-linecap="round"/></svg>
</button><ul class="header__bar__left hidden b1024:flex"><li>
<a href="/buy/" class="full flex items-center"><span data-scramble data-delay="300">Buy</span></a><a href="#" class="js-nav-desktop-toggle" style="display:none" aria-hidden="true"></a></li><li id="menu-item-1653690" class="menu-item menu-item-type-taxonomy menu-item-object-product_cat current-menu-item menu-item-1653690"><a href="#trade" data-modal="trade" aria-current="page"><span data-scramble data-delay="360">Trade</span></a></li><li id="menu-item-1653691" class="menu-item menu-item-type-post_type menu-item-object-page menu-item-1653691"><a href="#sell" data-modal="sell"><span data-scramble data-delay="420">Sell</span></a></li></ul><a href="/" aria-label="Dialed By H" class="header__bar__logo absolute">
<img src="/assets/dbh/logo.png" alt="Dialed By H" style="height:inherit;width:auto;display:block;">
</a><ul class="header__bar__right hidden b1024:flex"><li id="menu-item-1653721" class="menu-item menu-item-type-post_type menu-item-object-page menu-item-1653721"><a href="/about/"><span data-scramble data-delay="300">About</span></a></li><li class="hidden b1024:block">
<a href="/process/" class="header__bar__search"><span data-scramble data-delay="360">Process</span></a></li><li class="hidden b1024:block"><a href="/journal/" class="header__bar__search"><span data-scramble data-delay="420">Journal</span></a></li></ul><a href="#source" data-modal="source" class="cart-icon"><span data-scramble data-delay="420">Request to Source</span></a><a href="#" class="cart-icon js-toggle-cart" style="display:none" aria-hidden="true">
<svg viewBox="0 0 16 18" class="b1024:hidden w-4 mr-2" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.25 5.875v-1.25A3.75 3.75 0 018 .875v0a3.75 3.75 0 013.75 3.75v1.25m-10.625 0A.625.625 0 00.5 6.5v8.438c0 1.18 1.006 2.187 2.188 2.187h10.624c1.182 0 2.188-.957 2.188-2.139V6.5a.625.625 0 00-.625-.625H1.125z" class="stroke-current" stroke-linecap="round" stroke-linejoin="round"/></svg><i class="hidden b1024:inline not-italic">Cart (</i>
<i class="bg-beige b1024:bg-transparent w-5 b1024:w-auto h-5 b1024:h-auto flex not-italic items-center justify-center rounded-full js-i">
<span class="overflow-hidden relative b1024:text-current">
<span class="js-first relative flex text-center justify-center">0</span>
<span class="js-second absolute flex text-center justify-center">0</span>
</span>
</i><i class="hidden b1024:inline not-italic">)</i>
</a></nav></div></header>
<main class="pt-page">
<div class="container">
<a class="pt-back" href="/buy/">&larr; Back to all pieces</a>
<div class="pt-detail">
<div class="pt-media">
<div class="pt-media__main"><img id="pt-main-img" src="${imgs[0] ? escAttr(normPath(imgs[0])) : ''}" alt="${escAttr(displayName)}"></div>
${thumbsHtml}
</div>
<div class="pt-info">
<p class="pt-kicker">${escHtml(w.brand)}</p>
<h1 class="pt-title">${escHtml(w.name || w.model)}</h1>
${w.ref ? `<p class="pt-ref">Ref. ${escHtml(w.ref)}</p>` : ''}
${w.details ? `<p class="pt-blurb">${escHtml(w.details)}</p>` : ''}
<p class="pt-blurb">Sourced for clients nationwide. Independently authenticated, with fully insured shipping anywhere in the US.</p>
<div class="pt-inquiry">
<p>Interested in this piece? Inquire below and I&rsquo;ll get back to you with sourcing details, pricing, and availability.</p>
<a class="pt-btn pt-btn--wa" href="${waLink}" target="_blank" rel="noopener">Message on WhatsApp</a>
<button type="button" class="pt-btn pt-btn--ghost" data-modal="source">Inquire to source</button>
</div>
<div class="pt-chips"><span class="pt-chip">Authenticated</span><span class="pt-chip">Insured nationwide</span><span class="pt-chip">Secure transaction</span></div>
</div>
</div>
<section class="pt-specs"><h2>Specifications</h2><table>${specsHtml}</table></section>
</div>
</main>
<footer class="footer relative pb-5 b768:pt-20 b768:pb-16 bg-beige text-black border border-t border-black border-opacity-10 js-footer"><div class="container"><div class="grid grid-cols-24 b768:gap-5">
<div class="col-span-24 b768:col-span-12 border">
<span class="text-10 b768:text-navy py-5 b768:py-0 b768:mb-5 flex relative"><img src="/assets/dbh/logo.png" alt="Dialed By H" style="height:22px;width:auto;filter:invert(1)"></span>
<ul class="footer__details text-14 hidden b768:flex flex-col">
<li class="flex"><span class="text-navy">WhatsApp</span><a href="https://wa.me/19146211848" target="_blank" rel="noopener">+1 914 621 1848</a></li>
<li class="flex"><span class="text-navy">Email</span><a href="mailto:dialedbyh@gmail.com">dialedbyh@gmail.com</a></li>
<li class="flex"><span class="text-navy">Instagram</span><a href="https://www.instagram.com/dialedbyh" target="_blank" rel="noopener">@dialedbyh</a></li>
</ul></div>
<div class="col-span-24 b768:col-span-6 border">
<span class="text-10 b768:text-navy py-5 b768:py-0 b768:mb-5 flex relative">Menu</span>
<ul class="footer__menu text-14 hidden b768:flex flex-col">
<li class="menu-item"><a href="/buy/">Buy</a></li>
<li class="menu-item"><a href="#trade" data-modal="trade">Trade</a></li>
<li class="menu-item"><a href="#sell" data-modal="sell">Sell</a></li>
<li class="menu-item"><a href="#source" data-modal="source">Request to Source</a></li>
</ul></div>
<div class="col-span-24 b768:col-span-6 border text-14">
<span class="text-10 b768:text-navy py-5 b768:py-0 b768:mb-5 flex relative">Company</span>
<ul class="footer__menu hidden b768:flex flex-col">
<li class="menu-item"><a href="/about/">About</a></li>
<li class="menu-item"><a href="/process/">Process</a></li>
<li class="menu-item"><a href="/journal/">Journal</a></li>
<li class="menu-item"><a href="/privacy">Privacy &amp; Terms</a></li>
</ul></div>
</div>
<p class="text-10 text-navy pt-10" style="max-width:720px;line-height:1.7">Dialed By H is an independent sourcing firm and is not an authorized dealer for any watch brand. All brand names, logos, and trademarks referenced on this site belong to their respective owners and are used for identification purposes only.</p>
<div class="text-10 text-navy pt-4">&copy; Dialed By H &mdash; dialedbyhenry.com</div>
</div></footer>
<div class="pt-floats">
<a href="https://wa.me/19146211848" target="_blank" rel="noopener" class="wa-float" aria-label="Chat on WhatsApp">
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M12.04 2.2c-5.4 0-9.8 4.36-9.8 9.72 0 1.72.46 3.39 1.32 4.86L2.2 21.8l5.16-1.34a9.85 9.85 0 0 0 4.68 1.18c5.4 0 9.8-4.36 9.8-9.72s-4.4-9.72-9.8-9.72zm0 17.79c-1.47 0-2.9-.39-4.15-1.12l-.3-.18-3.06.8.82-2.96-.2-.3a8.02 8.02 0 0 1-1.25-4.31c0-4.45 3.65-8.06 8.14-8.06s8.14 3.61 8.14 8.06-3.65 8.07-8.14 8.07zm4.46-6.04c-.24-.12-1.45-.71-1.67-.79-.22-.08-.39-.12-.55.12-.16.24-.63.79-.77.95-.14.16-.29.18-.53.06-.24-.12-1.03-.38-1.97-1.2-.73-.64-1.22-1.44-1.36-1.68-.14-.24-.02-.37.1-.49.11-.11.24-.29.37-.43.12-.14.16-.24.24-.41.08-.16.04-.3-.02-.43-.06-.12-.55-1.32-.75-1.8-.2-.48-.4-.41-.55-.42h-.47c-.16 0-.43.06-.65.3-.22.24-.86.83-.86 2.03s.88 2.36 1 2.52c.12.16 1.73 2.63 4.19 3.69.59.25 1.05.4 1.4.51.59.19 1.13.16 1.55.1.47-.07 1.45-.59 1.66-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28z"/></svg>
</a>
<a href="https://www.instagram.com/dialedbyh" target="_blank" rel="noopener" class="ig-float" aria-label="DM on Instagram">
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="18" height="18" rx="5.2" stroke="#fff" stroke-width="1.9"/><circle cx="12" cy="12" r="4.3" stroke="#fff" stroke-width="1.9"/><circle cx="17.2" cy="6.8" r="1.25" fill="#fff"/></svg>
</a>
</div>
<div class="pt-modal-backdrop js-pt-backdrop"></div>
<div id="pt-modal-root"></div>
<script src="/assets/scramble.js"></script>
<script src="/assets/modals.js"></script>
<script>
document.querySelectorAll('.pt-thumbs button').forEach(function (b) {
    b.addEventListener('click', function () {
        document.getElementById('pt-main-img').src = b.dataset.src;
        document.querySelectorAll('.pt-thumbs button').forEach(function (x) { x.classList.remove('is-active'); });
        b.classList.add('is-active');
    });
});
</script>
<div class="dbh-mnav js-dbh-mnav" aria-hidden="true">
<button class="x" type="button" aria-label="Close menu">&#10005;</button>
<a href="/buy/">Buy</a>
<button type="button" data-modal="trade">Trade</button>
<button type="button" data-modal="sell">Sell</button>
<a href="/about/">About</a>
<a href="/process/">Process</a>
<a href="/journal/">Journal</a>
<button type="button" data-modal="source">Request to Source</button>
</div>
<script>
(function(){
  var m=document.querySelector('.js-dbh-mnav');var t=document.querySelector('.js-nav-mobile-toggle');
  if(!m||!t)return;
  t.addEventListener('click',function(e){e.preventDefault();m.classList.toggle('is-open')});
  m.addEventListener('click',function(e){ if(e.target.closest('a,button')) m.classList.remove('is-open'); });
})();
</script>
</body>
</html>`;
}

function renderSitemap(pieces) {
    const CORE = [
        { loc: '/', changefreq: 'daily', priority: '1.0' },
        { loc: '/buy/', changefreq: 'daily', priority: '0.9' },
        { loc: '/journal/', changefreq: 'weekly', priority: '0.8' },
        { loc: '/about/', changefreq: 'monthly', priority: '0.8' },
        { loc: '/process/', changefreq: 'monthly', priority: '0.7' },
        { loc: '/boston', changefreq: 'monthly', priority: '0.7' },
        { loc: '/privacy', changefreq: 'yearly', priority: '0.3' },
    ];
    const tag = ({ loc, changefreq, priority }) =>
        `  <url><loc>${SITE_URL}${loc}</loc>${changefreq ? `<changefreq>${changefreq}</changefreq>` : ''}${priority ? `<priority>${priority}</priority>` : ''}</url>`;
    const watchTags = (pieces || [])
        .filter(p => p.image && p.slug)
        .map(p => tag({ loc: `/watch/${p.slug}`, changefreq: 'weekly', priority: '0.8' }))
        .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${CORE.map(tag).join('\n')}${watchTags ? '\n' + watchTags : ''}
</urlset>`;
}

module.exports = { renderWatchPage, renderSitemap, fourOhFour, SITE_URL };
