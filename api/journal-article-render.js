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
<title>Article not found · Off-Catalog · Dialed By H</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/x-icon" href="/favicon-v2.ico?v=3" />
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&family=Inter:wght@400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/dist/styles.css">
</head>
<body class="bg-charcoal text-ivory min-h-screen flex items-center justify-center px-6 font-inter">
<div class="text-center max-w-md">
<p class="text-[10px] tracking-[0.32em] uppercase text-muted font-space mb-4">Off-Catalog</p>
<h1 class="font-space font-bold text-4xl tracking-tight mb-4">Article not found</h1>
<p class="text-muted mb-8" style="text-transform:none">That piece either moved or never existed. Head back to the journal.</p>
<a href="/journal/" class="inline-block bg-ivory text-charcoal px-6 py-3 text-xs font-bold font-space uppercase tracking-[0.22em]">Back to Off-Catalog</a>
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

<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Google+Sans+Text&family=Space+Grotesk:wght@400;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/dist/styles.css">

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

<style>
.oc-article-shell { max-width: 720px; margin: 0 auto; padding: 40px 24px 100px; }
.oc-back {
    display: inline-flex; align-items: center; gap: 8px;
    font-family: 'Space Grotesk', sans-serif; font-size: 10px; font-weight: 700;
    letter-spacing: 0.28em; text-transform: uppercase; color: #888;
    text-decoration: none; margin-bottom: 36px; transition: color 0.2s;
}
.oc-back:hover { color: #f0f0f0; }
.oc-meta {
    display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
    font-family: 'Space Grotesk', sans-serif; font-size: 10px; font-weight: 700;
    letter-spacing: 0.22em; text-transform: uppercase; color: #888;
    margin-bottom: 22px;
}
.oc-meta .oc-pill {
    background: rgba(255,255,255,0.07); color: #f0f0f0;
    padding: 4px 10px; border-radius: 999px;
}
.oc-article-title {
    font-family: 'Space Grotesk', sans-serif; font-weight: 700;
    font-size: clamp(36px, 6vw, 56px); line-height: 1.05;
    letter-spacing: -0.02em; color: #f0f0f0;
    margin: 0 0 16px; text-transform: none;
}
.oc-article-subtitle {
    font-family: 'Inter', sans-serif; font-weight: 500;
    font-size: 20px; line-height: 1.45; color: #888;
    margin: 0 0 32px; text-transform: none;
}
.oc-hero {
    width: 100%; aspect-ratio: 16/9; object-fit: cover;
    border-radius: 14px; margin: 0 0 40px;
    background: rgba(255,255,255,0.04);
}
.oc-byline {
    display: flex; align-items: center; gap: 14px;
    border-top: 1px solid rgba(255,255,255,0.08);
    border-bottom: 1px solid rgba(255,255,255,0.08);
    padding: 18px 0; margin-bottom: 40px;
}
.oc-byline img { height: 16px; opacity: 0.85; }
.oc-byline .oc-author {
    font-family: 'Space Grotesk', sans-serif; font-weight: 700;
    font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: #f0f0f0;
}

/* Article body typography */
.oc-body { font-family: 'Inter', sans-serif; color: #d4d4d4; text-transform: none; font-size: 17px; line-height: 1.75; }
.oc-body > * + * { margin-top: 22px; }
.oc-body p { margin: 0; }
.oc-body h2, .oc-body h3, .oc-body h4 {
    font-family: 'Space Grotesk', sans-serif; font-weight: 700;
    color: #f0f0f0; letter-spacing: -0.01em; margin-top: 44px;
}
.oc-body h2 { font-size: 30px; line-height: 1.25; }
.oc-body h3 { font-size: 22px; line-height: 1.3; }
.oc-body h4 { font-size: 18px; line-height: 1.35; }
.oc-body a { color: #f0f0f0; text-decoration: underline; text-underline-offset: 4px; text-decoration-color: rgba(255,255,255,0.3); transition: text-decoration-color 0.2s; }
.oc-body a:hover { text-decoration-color: #f0f0f0; }
.oc-body strong { color: #f0f0f0; font-weight: 700; }
.oc-body em { color: #f0f0f0; font-style: italic; }
.oc-body ul, .oc-body ol { padding-left: 24px; }
.oc-body li { margin: 6px 0; }
.oc-body blockquote {
    border-left: 3px solid rgba(255,255,255,0.3);
    background: rgba(255,255,255,0.03);
    padding: 18px 22px; border-radius: 0 8px 8px 0;
    font-size: 18px; color: #f0f0f0;
}
.oc-body blockquote footer { font-size: 13px; color: #888; margin-top: 8px; font-style: normal; }
.oc-body figure.journal-figure { margin: 32px 0; }
.oc-body figure img { width: 100%; border-radius: 10px; }
.oc-body figcaption { color: #888; font-size: 13px; margin-top: 8px; text-align: center; }
.oc-body pre.journal-code {
    background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08);
    padding: 16px; border-radius: 8px; overflow-x: auto;
    font-family: 'Menlo', monospace; font-size: 14px;
}
.oc-body hr.journal-delimiter {
    border: none; height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
    margin: 40px 0;
}
.oc-body .journal-embed iframe { width: 100%; aspect-ratio: 16/9; border-radius: 10px; border: 0; }
mark { background: rgba(255,255,140,0.2); color: #f0f0f0; padding: 0 4px; border-radius: 2px; }
code { background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-family: 'Menlo', monospace; font-size: 0.9em; }

/* Subscribe at bottom */
.oc-end-cta {
    max-width: 540px; margin: 70px auto 0;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px; padding: 30px 24px; text-align: center;
}
.oc-end-cta h3 {
    font-family: 'Space Grotesk', sans-serif; font-weight: 700;
    font-size: 20px; margin: 0 0 8px; text-transform: none;
}
.oc-end-cta p { font-family: 'Inter', sans-serif; color: #888; font-size: 13px; margin: 0 0 22px; text-transform: none; }
.oc-end-form { display: flex; flex-direction: column; gap: 12px; max-width: 380px; margin: 0 auto; }
.oc-end-form input {
    width: 100%; background: transparent; border: 1px solid rgba(255,255,255,0.15);
    border-radius: 4px; padding: 12px 14px; color: #f0f0f0;
    font-family: 'Inter', sans-serif; font-size: 14px; outline: none; text-transform: none;
}
.oc-end-form input:focus { border-color: rgba(255,255,255,0.4); }
.oc-end-form button {
    background: #f0f0f0; color: #0a0a0a; border: none; padding: 12px 14px;
    font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 11px;
    letter-spacing: 0.22em; text-transform: uppercase; border-radius: 4px; cursor: pointer;
}
.oc-end-msg { font-size: 12px; margin-top: 10px; color: #4ade80; text-transform: none; }
.oc-end-msg.error { color: #f87171; }
</style>
</head>
<body class="bg-charcoal text-ivory selection:bg-ivory selection:text-charcoal font-inter min-h-screen">
<div class="orb orb-1"></div>
<div class="orb orb-2"></div>

<nav class="w-full z-40 px-6 sm:px-10 md:px-16 py-5 sm:py-6 flex justify-between items-center relative">
    <a href="/"><img src="/images/logo.png" alt="Dialed By H" class="h-8 sm:h-10 w-auto object-contain"></a>
    <div class="hidden md:flex space-x-8 text-sm font-space font-medium uppercase tracking-widest items-center">
        <a href="/about.html" class="nav-link hover:text-muted transition-colors">About Me</a>
        <a href="/process.html" class="nav-link hover:text-muted transition-colors">My Process</a>
        <a href="/journal/" class="nav-link nav-active hover:text-muted transition-colors">Journal</a>
        <a href="/" class="bg-ivory text-charcoal px-5 py-2 text-xs font-bold font-space uppercase tracking-widest hover:bg-muted transition-colors">Back to Home</a>
    </div>
</nav>

<article class="oc-article-shell">
    <a href="/journal/" class="oc-back">← Off-Catalog</a>

    <div class="oc-meta">
        ${category ? `<span class="oc-pill">${escHtml(category)}</span>` : ""}
        ${pubDateText ? `<span>${escHtml(pubDateText)}</span>` : ""}
        ${readingTime ? `<span>· ${readingTime} min read</span>` : ""}
    </div>

    <h1 class="oc-article-title">${escHtml(title)}</h1>
    ${subtitle ? `<p class="oc-article-subtitle">${escHtml(subtitle)}</p>` : ""}

    ${heroUrl && a.hero_image_url ? `<img class="oc-hero" src="${escAttr(heroUrl)}" alt="${escAttr(title)}" loading="eager">` : ""}

    <div class="oc-byline">
        <span class="oc-author">By ${escHtml(a.author_name || "Henry Ohler")}</span>
        <img src="/images/logo.png" alt="Dialed By H">
    </div>

    <div class="oc-body">${contentHtml}</div>

    <div class="oc-end-cta">
        <h3>Get the next one in your inbox</h3>
        <p>New writing every week. Unsubscribe whenever.</p>
        <form id="oc-end-form" class="oc-end-form" novalidate>
            <input id="oc-end-email" type="email" name="email" placeholder="Email address" required>
            <button type="submit">Subscribe</button>
            <p id="oc-end-msg" class="oc-end-msg" style="display:none"></p>
        </form>
    </div>
</article>

<footer class="border-t border-ivory/5 py-12 px-6 sm:px-10 md:px-16">
    <div class="max-w-6xl mx-auto flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 text-[10px] tracking-widest uppercase text-muted font-space">
        <a href="/" class="hover:text-ivory transition-colors">Dialed By H</a>
        <div class="flex gap-6">
            <a href="/about.html" class="hover:text-ivory transition-colors">About</a>
            <a href="/inventory.html" class="hover:text-ivory transition-colors">Inventory</a>
            <a href="/privacy.html" class="hover:text-ivory transition-colors">Privacy</a>
        </div>
    </div>
</footer>

<a href="https://wa.me/19146211848" target="_blank" rel="noopener noreferrer"
   aria-label="Message Henry on WhatsApp"
   class="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-[60] w-14 h-14 sm:w-[58px] sm:h-[58px] rounded-full flex items-center justify-center shadow-2xl transition-transform duration-300 hover:scale-110 active:scale-95"
   style="background:#25D366;">
    <svg viewBox="0 0 24 24" width="28" height="28" fill="#fff" aria-hidden="true">
        <path d="M20.52 3.48A11.86 11.86 0 0 0 12.05 0C5.5 0 .16 5.33.16 11.88a11.8 11.8 0 0 0 1.64 6l-1.74 6.36 6.51-1.71a11.86 11.86 0 0 0 5.48 1.4h.01c6.55 0 11.89-5.33 11.89-11.88 0-3.18-1.24-6.17-3.43-8.57Zm-8.47 18.3h-.01a9.86 9.86 0 0 1-5.03-1.38l-.36-.21-3.86 1.01 1.03-3.77-.23-.39a9.82 9.82 0 0 1-1.51-5.26c0-5.43 4.43-9.86 9.87-9.86 2.63 0 5.1 1.03 6.96 2.89a9.79 9.79 0 0 1 2.89 6.98c0 5.44-4.43 9.87-9.87 9.87Zm5.41-7.39c-.3-.15-1.75-.86-2.02-.96s-.47-.15-.67.15-.77.96-.94 1.16-.35.22-.64.07a8.08 8.08 0 0 1-2.37-1.46 8.94 8.94 0 0 1-1.65-2.05c-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.48-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37s-1.05 1.03-1.05 2.51 1.08 2.91 1.23 3.11c.15.2 2.12 3.24 5.13 4.54.72.31 1.28.5 1.72.63.72.23 1.38.2 1.9.12.58-.09 1.75-.71 2-1.4.25-.69.25-1.27.17-1.39-.07-.12-.27-.2-.57-.35Z"/>
    </svg>
</a>

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
