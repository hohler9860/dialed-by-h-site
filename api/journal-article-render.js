// Server-side renderer for individual Off-Catalog articles.
// Routed via vercel.json: /journal/:slug -> /api/journal-article-render?slug=:slug
// Returns full HTML (not JSON) so search engines get content in the initial response.

const SUPABASE_URL = process.env.SUPABASE_URL || "https://untnrofsnmoyxdidxbdj.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const SITE_URL = process.env.SITE_URL || "https://dialedbyhenry.com";

function escHtml(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escAttr(s) {
    return escHtml(s);
}

function formatPubDate(iso) {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    } catch { return ""; }
}

function fourOhFourHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Article not found - Off-Catalog - Dialed By H</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/x-icon" href="/favicon-v2.ico?v=3" />
<style>
@font-face{font-display:swap;font-family:"Archivo";font-style:normal;font-weight:100 900;font-stretch:62% 125%;src:url(/assets/fonts/Archivo-wdth-wght.woff2) format("woff2")}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fff;color:#000;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;text-align:center;padding:24px}
h1{font-family:"Archivo","Helvetica Neue",Helvetica,Arial,sans-serif;font-weight:700;font-variation-settings:"wdth" 120;font-size:40px;text-transform:uppercase;letter-spacing:-.02em;margin:0 0 14px}
p{font-size:13px;color:rgba(0,0,0,.55);margin:0 0 28px}
a{display:inline-block;background:#0a0a0a;color:#fff;text-decoration:none;padding:16px 34px;font-size:11px;letter-spacing:.18em;text-transform:uppercase}
small{display:block;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(0,0,0,.4);margin-bottom:16px}
</style>
</head>
<body>
<div>
<small>Off-Catalog</small>
<h1>Article not found</h1>
<p>That piece either moved or never existed. Head back to the journal.</p>
<a href="/journal/">Back to Off-Catalog</a>
</div>
</body>
</html>`;
}

function renderArticleHtml(a) {
    const title       = a.title || "Untitled";
    const subtitle    = a.subtitle || "";
    const seoTitle    = a.seo_title || `${title} | Off-Catalog by Dialed By H`;
    const description = a.seo_description || a.excerpt || subtitle || "Read the latest from Off-Catalog, the journal by Dialed By H.";
    const heroUrl     = a.hero_image_url || "https://dialedbyhenry.com/images/og-share.png";
    const canonical   = `${SITE_URL}/journal/${a.slug}`;
    const pubDate     = a.published_at;
    const pubDateText = formatPubDate(pubDate);
    const readingTime = a.reading_time_minutes || null;
    const category    = a.category || null;
    const contentHtml = a.content_html || "";

    const jsonLdArticle = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: title,
        description: description,
        image: [heroUrl],
        datePublished: pubDate,
        dateModified: a.updated_at || pubDate,
        author: { "@type": "Person", name: a.author_name || "Henry Ohler" },
        publisher: {
            "@type": "Organization",
            name: "Dialed By H",
            logo: { "@type": "ImageObject", url: `${SITE_URL}/images/logo.png` },
        },
        mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
        ...(category ? { articleSection: category } : {}),
    };
    const jsonLdBreadcrumb = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
            { "@type": "ListItem", position: 2, name: "Off-Catalog", item: `${SITE_URL}/journal/` },
            { "@type": "ListItem", position: 3, name: title, item: canonical },
        ],
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/x-icon" href="/favicon-v2.ico?v=3" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon.png?v=3" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=3" />

<title>${escHtml(seoTitle)}</title>
<meta name="description" content="${escAttr(description)}">
<meta name="author" content="${escAttr(a.author_name || "Henry Ohler")}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonical}">

<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${escAttr(title)}">
<meta property="og:description" content="${escAttr(description)}">
<meta property="og:image" content="${escAttr(heroUrl)}">
<meta property="og:image:alt" content="${escAttr(a.hero_alt || title)}">
<meta property="og:site_name" content="Dialed By H">
<meta property="article:author" content="${escAttr(a.author_name || "Henry Ohler")}">
${pubDate ? `<meta property="article:published_time" content="${escAttr(pubDate)}">` : ""}
${category ? `<meta property="article:section" content="${escAttr(category)}">` : ""}

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escAttr(title)}">
<meta name="twitter:description" content="${escAttr(description)}">
<meta name="twitter:image" content="${escAttr(heroUrl)}">

<script type="application/ld+json">${JSON.stringify(jsonLdArticle)}</script>
<script type="application/ld+json">${JSON.stringify(jsonLdBreadcrumb)}</script>

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
<style id="dbh-grot">
/* Archivo everywhere: BWC bold display cut replaces the serif */
@font-face{font-display:swap;font-family:"Archivo";font-style:normal;font-weight:100 900;font-stretch:62% 125%;src:url(/assets/fonts/Archivo-wdth-wght.woff2) format("woff2")}
:root{--pt-serif:"Archivo","Helvetica Neue",Helvetica,Arial,sans-serif}
.pt-statement__line em,.pt-modal .pm-title,.pt-page h1,.pt-step .no,.pt-jitem .jt{font-weight:700!important;font-variation-settings:"wdth" 120;letter-spacing:-.02em!important;word-break:normal!important;overflow-wrap:normal!important;hyphens:none!important}
.pt-modal .pm-title{font-size:clamp(30px,3.6vw,58px)!important;line-height:1!important}
</style>
<style>
.pa-page{padding:120px 0 110px;font-family:var(--pt-mono);background:#fff;color:#000}
.pa-page .container{max-width:820px;margin:0 auto;padding:0 24px}
a.pa-crumb{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:rgba(0,0,0,.45);display:inline-block;margin-bottom:26px;text-decoration:none}
a.pa-crumb:hover{color:#000}
.pa-meta{display:flex;flex-wrap:wrap;gap:14px;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(0,0,0,.45);margin:0 0 18px}
.pa-title{font-family:var(--pt-serif);font-size:clamp(34px,5vw,60px);line-height:1.04;text-transform:uppercase;margin:0 0 16px}
.pa-sub{font-size:14px;line-height:1.7;color:rgba(0,0,0,.55);margin:0 0 34px;max-width:640px}
.pa-hero{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;margin:0 0 14px;background:rgba(0,0,0,.04)}
.pa-heroline{display:flex;justify-content:space-between;border-bottom:1px solid rgba(0,0,0,.12);padding:0 0 14px;margin:0 0 40px;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(0,0,0,.45)}
.pa-body{font-size:14.5px;line-height:1.85;color:#222}
.pa-body > * + *{margin-top:22px}
.pa-body p{margin:0}
.pa-body h2,.pa-body h3,.pa-body h4{font-family:var(--pt-serif);text-transform:uppercase;line-height:1.1;margin-top:46px;color:#000}
.pa-body h2{font-size:26px}
.pa-body h3{font-size:20px}
.pa-body h4{font-size:16px}
.pa-body a{color:#000;text-underline-offset:4px}
.pa-body strong{color:#000}
.pa-body ul,.pa-body ol{padding-left:22px}
.pa-body li{margin:6px 0}
.pa-body blockquote{border-left:2px solid #000;margin:34px 0;padding:4px 0 4px 22px;font-size:16px;color:#000}
.pa-body blockquote footer{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(0,0,0,.45);margin-top:8px}
.pa-body figure.journal-figure{margin:34px 0}
.pa-body figure img{width:100%;display:block}
.pa-body figcaption{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:rgba(0,0,0,.45);margin-top:10px}
.pa-body pre.journal-code{background:rgba(0,0,0,.05);border:1px solid rgba(0,0,0,.1);padding:16px;overflow-x:auto;font-size:13px}
.pa-body hr.journal-delimiter{border:none;height:1px;background:rgba(0,0,0,.14);margin:40px 0}
.pa-body .journal-embed iframe{width:100%;aspect-ratio:16/9;border:0}
.pa-cta{border-top:1px solid rgba(0,0,0,.12);margin-top:70px;padding-top:44px}
.pa-cta h3{font-family:var(--pt-serif);font-size:22px;text-transform:uppercase;margin:0 0 8px}
.pa-cta p{font-size:12px;color:rgba(0,0,0,.5);margin:0 0 22px}
.pa-cta form{display:flex;gap:12px;max-width:460px;flex-wrap:wrap}
.pa-cta input{flex:1;min-width:220px;background:transparent;border:none;border-bottom:1px solid rgba(0,0,0,.3);padding:12px 2px;font-family:var(--pt-mono);font-size:13px;color:#000;outline:none;border-radius:0}
.pa-cta input:focus{border-bottom-color:#000}
.pa-cta button{background:#0a0a0a;color:#fff;border:none;padding:14px 30px;font-family:var(--pt-mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;cursor:pointer}
.pa-cta button:hover{opacity:.85}
.oc-end-msg{width:100%;font-size:12px;margin-top:10px;color:#1a7f37;text-transform:none}
.oc-end-msg.error{color:#b42318}
.pa-title,.pa-body h2,.pa-body h3,.pa-body h4,.pa-cta h3{font-weight:700!important;font-variation-settings:"wdth" 120;letter-spacing:-.02em!important;word-break:normal!important;overflow-wrap:normal!important;hyphens:none!important}
@media(max-width:640px){.pa-page{padding:100px 0 80px}}
</style>

<!-- Meta Pixel -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '798516899968965');
fbq('track', 'PageView');
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
<main class="pa-page">
<div class="container">
<a class="pa-crumb" href="/journal/">&larr; Off-Catalog</a>
<div class="pa-meta">
    ${category ? `<span>${escHtml(category)}</span>` : ""}
    ${pubDateText ? `<span>${escHtml(pubDateText)}</span>` : ""}
    ${readingTime ? `<span>${readingTime} min read</span>` : ""}
</div>
<h1 class="pa-title">${escHtml(title)}</h1>
${subtitle ? `<p class="pa-sub">${escHtml(subtitle)}</p>` : ""}
${heroUrl && a.hero_image_url ? `<img class="pa-hero" src="${escAttr(heroUrl)}" alt="${escAttr(a.hero_alt || title)}" loading="eager">` : ""}
<div class="pa-heroline"><span>By ${escHtml(a.author_name || "Henry Ohler")}</span><span>Dialed By H</span></div>
<div class="pa-body">${contentHtml}</div>
<div class="pa-cta">
<h3>Get the next one</h3>
<p>New writing from the desk. Unsubscribe whenever.</p>
<form id="oc-end-form" novalidate>
<input id="oc-end-email" type="email" name="email" placeholder="EMAIL ADDRESS" required>
<button type="submit">Subscribe</button>
<p id="oc-end-msg" class="oc-end-msg" style="display:none"></p>
</form>
</div>
</div>
</main>
<footer class="footer relative pb-5 b768:pt-20 b768:pb-16 bg-beige text-black border border-t border-black border-opacity-10 js-footer"><div class="container"><div class="grid grid-cols-24 b768:gap-5">
<div class="col-span-24 b768:col-span-12 border">
<span class="text-10 b768:text-navy py-5 b768:py-0 b768:mb-5 flex relative">Dialed By H</span>
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
(function () {
    const form = document.getElementById("oc-end-form");
    const email = document.getElementById("oc-end-email");
    const btn = form.querySelector("button");
    const msg = document.getElementById("oc-end-msg");
    form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        msg.style.display = "none";
        msg.classList.remove("error");
        const v = email.value.trim();
        if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v)) {
            msg.textContent = "That email doesn't look right.";
            msg.classList.add("error"); msg.style.display = "block"; return;
        }
        btn.disabled = true; const original = btn.textContent; btn.textContent = "Sending…";
        try {
            const r = await fetch("/api/journal-subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: v, source: "article-${escAttr(a.slug)}" }),
            });
            const json = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(json.error || "Subscribe failed");
            msg.textContent = json.alreadyConfirmed ? "You're already on the list." : "Check your email to confirm.";
            msg.style.display = "block";
            form.reset();
        } catch (e) {
            msg.textContent = "Something broke. Try again in a sec.";
            msg.classList.add("error"); msg.style.display = "block";
        } finally {
            btn.disabled = false; btn.textContent = original;
        }
    });
})();
</script>
</body>
</html>`;
}

module.exports = async (req, res) => {
    const slug = req.query.slug ? String(req.query.slug).trim() : null;

    res.setHeader("Content-Type", "text/html; charset=utf-8");

    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
        res.status(404);
        return res.send(fourOhFourHtml());
    }

    try {
        const url = `${SUPABASE_URL}/rest/v1/journal_articles?slug=eq.${encodeURIComponent(slug)}&status=eq.published&limit=1`;
        const r = await fetch(url, {
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        });
        if (!r.ok) {
            console.error("[journal-article-render] Supabase error:", r.status);
            res.status(500);
            return res.send(fourOhFourHtml());
        }

        const rows = await r.json();
        if (!rows || rows.length === 0) {
            res.status(404);
            return res.send(fourOhFourHtml());
        }

        // Fire-and-forget view increment
        const article = rows[0];
        fetch(`${SUPABASE_URL}/rest/v1/journal_articles?id=eq.${article.id}`, {
            method: "PATCH",
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json",
                Prefer: "return=minimal",
            },
            body: JSON.stringify({ view_count: (article.view_count || 0) + 1 }),
        }).catch(() => { /* swallow */ });

        res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=3600");
        res.status(200);
        return res.send(renderArticleHtml(article));
    } catch (err) {
        console.error("[journal-article-render] UNHANDLED:", err.message);
        res.status(500);
        return res.send(fourOhFourHtml());
    }
};
