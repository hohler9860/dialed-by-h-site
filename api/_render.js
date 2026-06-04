// Pure render helpers (underscore = not a serverless function, just an import).
// Used by get-inventory to serve SSR watch pages and the dynamic sitemap without
// adding new functions (Hobby plan caps at 12).
const SITE_URL = process.env.SITE_URL || 'https://dialedbyhenry.com';
const WA_NUMBER = '19146211848';

function escHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const escAttr = escHtml;

function normUrl(raw) {
    return raw ? `${SITE_URL}/api/normalize-image?u=${encodeURIComponent(raw)}` : `${SITE_URL}/images/og-share.png`;
}

function fourOhFour() {
    return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Piece not found · Dialed By H</title><meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/x-icon" href="/favicon-v2.ico?v=3" />
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&family=Inter:wght@400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/dist/styles.css"></head>
<body class="bg-charcoal text-ivory min-h-screen flex items-center justify-center px-6 font-inter"><div class="text-center max-w-md">
<p class="text-[10px] tracking-[0.32em] uppercase text-muted font-space mb-4">Dialed By H</p>
<h1 class="font-space font-bold text-4xl tracking-tight mb-4">Piece not found</h1>
<p class="text-muted mb-8" style="text-transform:none">This piece may no longer be available for sourcing.</p>
<a href="/inventory.html" class="inline-block bg-ivory text-charcoal px-6 py-3 text-xs font-bold font-space uppercase tracking-[0.22em]">Browse all pieces</a>
</div></body></html>`;
}

function navHtml() {
    return `<nav class="w-full z-40 px-6 sm:px-10 md:px-16 py-5 sm:py-6 flex justify-between items-center relative">
    <a href="/"><img src="/images/logo.png" alt="Dialed By H" class="h-8 sm:h-10 w-auto object-contain"></a>
    <div class="hidden md:flex space-x-8 text-sm font-space font-medium uppercase tracking-widest items-center">
        <a href="/about.html" class="nav-link hover:text-muted transition-colors">About Me</a>
        <a href="/inventory.html" class="nav-link nav-active hover:text-muted transition-colors">Browse Pieces</a>
        <a href="/process.html" class="nav-link hover:text-muted transition-colors">My Process</a>
        <a href="/journal/" class="nav-link hover:text-muted transition-colors">Journal</a>
        <a href="/" class="bg-ivory text-charcoal px-5 py-2 text-xs font-bold font-space uppercase tracking-widest hover:bg-muted transition-colors">Back to Home</a>
    </div>
</nav>`;
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
            { '@type': 'ListItem', position: 2, name: 'Browse Pieces', item: `${SITE_URL}/inventory.html` },
            { '@type': 'ListItem', position: 3, name: displayName, item: canonical },
        ],
    };

    const waText = encodeURIComponent(`Hi Henry, I'm interested in the ${displayName}${w.ref ? ' (Ref. ' + w.ref + ')' : ''}. Is it available?`);
    const waLink = `https://wa.me/${WA_NUMBER}?text=${waText}`;

    const specsHtml = specs.map(([k, v]) => `
        <div class="flex justify-between items-start py-3.5 border-b border-ivory/5 last:border-0">
            <span class="text-muted text-[11px] font-bold tracking-widest">${escHtml(k)}</span>
            <span class="text-ivory text-[11px] font-space tracking-wide text-right max-w-[55%]">${escHtml(v)}</span>
        </div>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/x-icon" href="/favicon-v2.ico?v=3" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon.png?v=3" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=3" />
<title>${escHtml(title)}</title>
<meta name="description" content="${escAttr(description)}">
<meta name="author" content="Henry Ohler">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonical}">

<meta property="og:type" content="product">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${escAttr(displayName)}${w.ref ? ' · ' + escAttr(w.ref) : ''}">
<meta property="og:description" content="${escAttr(description)}">
<meta property="og:image" content="${escAttr(img)}">
<meta property="og:site_name" content="Dialed By H">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escAttr(displayName)}">
<meta name="twitter:description" content="${escAttr(description)}">
<meta name="twitter:image" content="${escAttr(img)}">

<script type="application/ld+json">${JSON.stringify(productLD)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbLD)}</script>

<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Google+Sans+Text&family=Space+Grotesk:wght@400;700&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<script src="/scripts/lucide.min.js"></script>
<link rel="stylesheet" href="/dist/styles.css">
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '798516899968965'); fbq('track', 'PageView');
</script>
</head>
<body class="min-h-screen bg-charcoal text-ivory selection:bg-ivory selection:text-charcoal font-inter">
<div id="bg-blur">${w.image ? `<img src="${escAttr(img)}" alt="">` : ''}</div>
${navHtml()}

<main class="relative z-10 max-w-6xl mx-auto px-6 py-10 sm:py-16">
    <div class="mb-8">
        <a href="/inventory.html" class="text-muted text-xs font-space tracking-widest hover:text-ivory transition-colors inline-flex items-center gap-2">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 12H5m0 0l7 7m-7-7l7-7"/></svg>
            Back to All Pieces
        </a>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">
        <div class="relative">
            <div class="glass rounded-2xl overflow-hidden bg-[#111] aspect-square flex items-center justify-center relative">
                ${w.image
                    ? `<a href="${escAttr(w.image)}" target="_blank" rel="noopener"><img src="${escAttr(img)}" alt="${escAttr(displayName)}" style="width:88%;height:88%;object-fit:contain;object-position:center;margin:auto;"></a>`
                    : `<span class="text-muted/40 text-sm font-space tracking-widest">Image Coming Soon</span>`}
            </div>
            ${w.condition ? `<div class="absolute top-4 right-4"><span class="glass-strong rounded-full px-4 py-2 text-[10px] font-space font-bold tracking-widest">${escHtml(w.condition)}</span></div>` : ''}
        </div>

        <div class="flex flex-col">
            <div class="mb-6">
                <p class="text-muted text-[11px] font-bold tracking-[0.2em] mb-2">${escHtml(w.brand)}</p>
                <h1 class="font-space font-bold text-2xl sm:text-3xl md:text-4xl lg:text-5xl tracking-tighter leading-[0.95] mb-3">${escHtml(displayName)}</h1>
                ${w.ref ? `<p class="text-muted text-sm font-bold tracking-widest">Ref. ${escHtml(w.ref)}</p>` : ''}
            </div>
            ${w.details ? `<p class="text-ivory/60 text-sm font-inter leading-relaxed tracking-wide mb-6">${escHtml(w.details)}</p>` : ''}
            <p class="text-ivory/40 text-xs font-inter leading-relaxed tracking-wide mb-8">Sourced for clients nationwide. Authenticated, with fully insured shipping anywhere in the US. Based in New York &amp; Boston.</p>

            <div class="glass rounded-xl p-6 mb-6">
                <p class="text-ivory/70 text-xs font-inter tracking-wide mb-5 leading-relaxed">Interested in this piece? Inquire below and I'll get back to you with sourcing details, pricing, and availability.</p>
                <a href="${waLink}" target="_blank" rel="noopener" class="block w-full text-center mb-3 py-4 font-bold font-space uppercase tracking-widest text-charcoal" style="background:#25D366;">Message on WhatsApp</a>
                <button onclick="document.getElementById('inquiry-section').scrollIntoView({behavior:'smooth'})" class="w-full bg-ivory text-charcoal py-4 font-bold font-space uppercase tracking-widest hover:bg-white transition-colors">Inquire to Source</button>
            </div>

            <div class="flex flex-wrap gap-3 mb-2">
                <div class="glass-subtle rounded-lg px-4 py-2.5 flex items-center gap-2"><i data-lucide="shield-check" class="w-4 h-4 text-ivory"></i><span class="text-[10px] font-bold tracking-widest text-ivory/50">Authenticated</span></div>
                <div class="glass-subtle rounded-lg px-4 py-2.5 flex items-center gap-2"><i data-lucide="package" class="w-4 h-4 text-ivory"></i><span class="text-[10px] font-bold tracking-widest text-ivory/50">Insured Nationwide</span></div>
                <div class="glass-subtle rounded-lg px-4 py-2.5 flex items-center gap-2"><i data-lucide="lock" class="w-4 h-4 text-ivory"></i><span class="text-[10px] font-bold tracking-widest text-ivory/50">Secure Transaction</span></div>
            </div>
        </div>
    </div>

    <div class="mt-16 sm:mt-20">
        <h2 class="font-space font-bold text-2xl sm:text-3xl tracking-tight mb-8">Specifications</h2>
        <div class="glass rounded-xl p-6 sm:p-8">${specsHtml}</div>
    </div>

    <div id="inquiry-section" class="mt-16 sm:mt-20 scroll-mt-8">
        <h2 class="font-space font-bold text-2xl sm:text-3xl tracking-tight mb-4">Inquire About This Piece</h2>
        <p class="text-muted text-sm font-inter tracking-wide mb-8 max-w-lg">Provide your details and I'll reach out with sourcing information, pricing, and next steps.</p>
        <div class="glass rounded-xl p-6 sm:p-8 max-w-xl">
            <form id="inquiry-form" class="space-y-5" novalidate>
                <div><label class="block text-[10px] font-bold tracking-widest text-muted mb-2">Full Name</label>
                    <input required type="text" name="fullName" class="w-full bg-transparent border border-ivory/20 p-3 text-ivory focus:border-ivory outline-none transition-colors uppercase"></div>
                <div><label class="block text-[10px] font-bold tracking-widest text-muted mb-2">Email</label>
                    <input required type="email" name="email" class="w-full bg-transparent border border-ivory/20 p-3 text-ivory focus:border-ivory outline-none transition-colors"></div>
                <div><label class="block text-[10px] font-bold tracking-widest text-muted mb-2">Message (optional)</label>
                    <textarea name="watchDetails" rows="3" class="w-full bg-transparent border border-ivory/20 p-3 text-ivory focus:border-ivory outline-none transition-colors"></textarea></div>
                <button type="submit" class="w-full bg-ivory text-charcoal py-4 font-bold font-space uppercase tracking-widest hover:bg-white transition-colors">Send Inquiry</button>
                <p id="inquiry-msg" class="text-xs text-center" style="display:none;text-transform:none;"></p>
            </form>
        </div>
    </div>
</main>

<a href="${waLink}" target="_blank" rel="noopener noreferrer" aria-label="Message Henry on WhatsApp"
   class="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-[60] w-14 h-14 sm:w-[58px] sm:h-[58px] rounded-full flex items-center justify-center shadow-2xl transition-transform duration-300 hover:scale-110 active:scale-95" style="background:#25D366;">
    <svg viewBox="0 0 24 24" width="28" height="28" fill="#fff" aria-hidden="true"><path d="M20.52 3.48A11.86 11.86 0 0 0 12.05 0C5.5 0 .16 5.33.16 11.88a11.8 11.8 0 0 0 1.64 6l-1.74 6.36 6.51-1.71a11.86 11.86 0 0 0 5.48 1.4h.01c6.55 0 11.89-5.33 11.89-11.88 0-3.18-1.24-6.17-3.43-8.57Zm-8.47 18.3h-.01a9.86 9.86 0 0 1-5.03-1.38l-.36-.21-3.86 1.01 1.03-3.77-.23-.39a9.82 9.82 0 0 1-1.51-5.26c0-5.43 4.43-9.86 9.87-9.86 2.63 0 5.1 1.03 6.96 2.89a9.79 9.79 0 0 1 2.89 6.98c0 5.44-4.43 9.87-9.87 9.87Zm5.41-7.39c-.3-.15-1.75-.86-2.02-.96s-.47-.15-.67.15-.77.96-.94 1.16-.35.22-.64.07a8.08 8.08 0 0 1-2.37-1.46 8.94 8.94 0 0 1-1.65-2.05c-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.48-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37s-1.05 1.03-1.05 2.51 1.08 2.91 1.23 3.11c.15.2 2.12 3.24 5.13 4.54.72.31 1.28.5 1.72.63.72.23 1.38.2 1.9.12.58-.09 1.75-.71 2-1.4.25-.69.25-1.27.17-1.39-.07-.12-.27-.2-.57-.35Z"/></svg>
</a>

<script>if (window.lucide) lucide.createIcons();</script>
<script>
(function () {
    const form = document.getElementById('inquiry-form');
    const msg = document.getElementById('inquiry-msg');
    const watch = ${JSON.stringify({ name: displayName, ref: w.ref || '', brand: w.brand || '', image: w.image || '' })};
    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        msg.style.display = 'none'; msg.style.color = '';
        const fd = new FormData(form);
        const email = (fd.get('email') || '').trim();
        if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) { msg.textContent = "That email doesn't look right."; msg.style.color = '#f87171'; msg.style.display = 'block'; return; }
        const btn = form.querySelector('button[type=submit]'); const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Sending…';
        try {
            const r = await fetch('/api/submit-form', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'WATCH_DETAIL', fullName: fd.get('fullName'), email, watchDetails: fd.get('watchDetails') || '', watchName: watch.name, watchRef: watch.ref, watchBrand: watch.brand, watchImage: watch.image }) });
            if (!r.ok) throw new Error('failed');
            if (window.fbq) fbq('track', 'Lead');
            msg.textContent = "Got it — I'll be in touch shortly."; msg.style.color = '#4ade80'; msg.style.display = 'block'; form.reset();
        } catch (e) {
            msg.textContent = 'Something broke. Try WhatsApp or email instead.'; msg.style.color = '#f87171'; msg.style.display = 'block';
        } finally { btn.disabled = false; btn.textContent = orig; }
    });
})();
</script>
</body>
</html>`;
}

function renderSitemap(pieces) {
    const CORE = [
        { loc: '/', changefreq: 'daily', priority: '1.0' },
        { loc: '/inventory.html', changefreq: 'daily', priority: '0.9' },
        { loc: '/journal/', changefreq: 'weekly', priority: '0.8' },
        { loc: '/about.html', changefreq: 'monthly', priority: '0.8' },
        { loc: '/process.html', changefreq: 'monthly', priority: '0.7' },
        { loc: '/boston.html', changefreq: 'monthly', priority: '0.7' },
        { loc: '/privacy.html', changefreq: 'yearly', priority: '0.3' },
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
