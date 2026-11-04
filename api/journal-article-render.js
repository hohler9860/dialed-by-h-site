const { journalImage } = require('../lib/journal-image');
const chrome = require('../lib/brand-chrome');
// Server-side renderer for individual Off-Catalog articles.
// Routed via vercel.json: /journal/:slug -> /api/journal-article-render?slug=:slug
// Returns full HTML (not JSON) so search engines get content in the initial response.

const SUPABASE_URL = process.env.SUPABASE_URL || "https://untnrofsnmoyxdidxbdj.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const SITE_URL = process.env.SITE_URL || "https://www.dialedbyhenry.com";

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
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Article not found | Off-Catalog by Dialed by H</title>
<meta name="robots" content="noindex, nofollow">
${chrome.headAssets()}
${chrome.pixel()}
</head>
<body>
${chrome.header('Journal')}
<main class="e404">
  <span class="k">Off-Catalog</span>
  <h1 class="pg-h1"><span class="h-lead">Article</span> not found</h1>
  <p>That piece either moved or never existed. Head back to the journal.</p>
  <div class="actions"><a class="btn btn--solid" href="/journal/">Back to Off-Catalog</a><a class="btn" href="/">Back to home</a></div>
</main>
${chrome.footer()}
${chrome.floats()}
${chrome.scripts()}
</body>
</html>`;
}

function renderArticleHtml(a) {
    a = { ...a, hero_image_url: journalImage(a) };
    const title       = a.title || "Untitled";
    const subtitle    = a.subtitle || "";
    const seoTitle    = a.seo_title || `${title} | Off-Catalog by Dialed by H`;
    const description = a.seo_description || a.excerpt || subtitle || "Read the latest from Off-Catalog, the journal by Dialed by H.";
    const heroUrl     = a.hero_image_url || "https://www.dialedbyhenry.com/images/og-share-v3.png";
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
            name: "Dialed by H",
            logo: { "@type": "ImageObject", url: `${SITE_URL}/images/logo-dbh.png` },
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
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">

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
<meta property="og:site_name" content="Dialed by H">
<meta property="article:author" content="${escAttr(a.author_name || "Henry Ohler")}">
${pubDate ? `<meta property="article:published_time" content="${escAttr(pubDate)}">` : ""}
${category ? `<meta property="article:section" content="${escAttr(category)}">` : ""}

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escAttr(title)}">
<meta name="twitter:description" content="${escAttr(description)}">
<meta name="twitter:image" content="${escAttr(heroUrl)}">

<script type="application/ld+json">${JSON.stringify(jsonLdArticle)}</script>
<script type="application/ld+json">${JSON.stringify(jsonLdBreadcrumb)}</script>

${chrome.headAssets()}
${chrome.pixel()}
</head>
<body>
${chrome.header('Journal')}
<main class="pa-page${a.hero_image_url ? ' has-hero' : ''}">
${a.hero_image_url ? `<div class="pa-banner"><img src="${escAttr(heroUrl)}" alt="${escAttr(a.hero_alt || title)}" fetchpriority="high"></div>` : ""}
<article class="pa-paper">
<a class="pa-crumb" href="/journal/">&larr; Off-Catalog</a>
<div class="pa-meta">
    ${category ? `<span>${escHtml(category)}</span>` : ""}
    ${pubDateText ? `<span>${escHtml(pubDateText)}</span>` : ""}
    ${readingTime ? `<span>${readingTime} min read</span>` : ""}
</div>
<h1 class="pa-title">${escHtml(title)}</h1>
${subtitle ? `<p class="pa-sub">${escHtml(subtitle)}</p>` : ""}

<div class="pa-heroline"><span>By ${escHtml(a.author_name || "Henry Ohler")}</span><span>Dialed by H</span></div>
<div class="pa-body">${contentHtml}</div>
<div class="pa-cta">
<h3>Get the next one</h3>
<p>New writing from the desk. Unsubscribe whenever.</p>
<form id="oc-end-form" novalidate>
<input id="oc-end-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none">
<input id="oc-end-email" type="email" name="email" placeholder="Email address" required>
<button type="submit">Subscribe</button>
<p id="oc-end-msg" class="oc-end-msg" style="display:none"></p>
</form>
</div>
</article>
</main>
${chrome.footer()}
${chrome.floats()}
${chrome.scripts()}
<script defer src="/assets/journal-paper.js?v=1"></script>
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
                body: JSON.stringify({ email: v, source: "article-${escAttr(a.slug)}", website: (document.getElementById("oc-end-hp") || {}).value || "" }),
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
