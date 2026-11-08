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

function monthYear(iso) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }); } catch { return ""; }
}

function metaHtml(iso, minutes) {
    const m = parseInt(minutes, 10);
    return `<span class="jr-meta"><span>${escHtml(monthYear(iso))}</span>${m ? `<i aria-hidden="true">&bull;</i><span>${m} Min Read</span>` : ""}</span>`;
}

// Henry's own stories sign off with the wordmark; anyone else gets a plain byline.
function bylineHtml(author) {
    const name = String(author || "").trim();
    if (name && !/^(henry ohler|dialed by h)$/i.test(name)) return `<p class="jr-by">By ${escHtml(name)}</p>`;
    return `<p class="jr-by">From the desk of <img src="/assets/brand/wordmark-charcoal.svg" alt="Dialed by H" width="791" height="112"></p>`;
}

// Back-to-back photos sit side by side, the way A Collected Man pairs images.
function pairFigures(html) {
    const fig = '<figure class="journal-figure[^"]*">(?:(?!<\\/figure>)[\\s\\S])*<\\/figure>';
    return String(html || "").replace(new RegExp(`(${fig})\\s*(${fig})`, "g"), '<div class="jr-pair">$1$2</div>');
}

// Photo credit lines ("Cover photo: Hodinkee.", "Photos, including cover: ...") read as captions, not body copy.
function markCredits(html) {
    return String(html || "").replace(/<p>((?:Cover photo|Cover image|Photos?(?:, including cover)?|Photography|Images?):\s[\s\S]*?)<\/p>/gi, '<p class="jr-credit">$1</p>');
}

function relatedHtml(list) {
    if (!list || !list.length) return "";
    const cards = list.map((r) => {
        const img = journalImage(r);
        const ex = r.subtitle || r.excerpt || "";
        return `<a class="jr-card" href="/journal/${encodeURIComponent(r.slug)}"><div class="jr-card__img">${img ? `<img src="${escAttr(img)}" alt="" loading="lazy" decoding="async">` : ""}</div><div class="jr-card__txt"><span class="jr-dot" aria-hidden="true"></span><h3>${escHtml(r.title)}</h3>${ex ? `<p>${escHtml(ex)}</p>` : ""}${metaHtml(r.published_at, r.reading_time_minutes)}</div></a>`;
    }).join("");
    return `<section class="jr-more" aria-labelledby="jr-more-h"><div class="jr-more__in"><h2 id="jr-more-h">Further Reading</h2><div class="jr-more__grid">${cards}</div></div></section>`;
}

// Three other stories: same category first, then the newest.
async function fetchRelated(article) {
    try {
        const sel = "slug,title,subtitle,excerpt,hero_image_url,content_html,category,published_at,reading_time_minutes";
        const r = await fetch(`${SUPABASE_URL}/rest/v1/journal_articles?select=${sel}&status=eq.published&slug=neq.${encodeURIComponent(article.slug)}&order=published_at.desc&limit=24`, {
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        });
        if (!r.ok) return [];
        const rows = await r.json();
        const same = rows.filter((x) => article.category && x.category === article.category);
        const rest = rows.filter((x) => !same.includes(x));
        return same.concat(rest).slice(0, 3);
    } catch { return []; }
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

function renderArticleHtml(a, related) {
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
<link rel="stylesheet" href="/assets/journal-article.css?v=1">
${chrome.pixel()}
</head>
<body>
${chrome.header('Journal')}
<main class="jr">
<article>
${a.hero_image_url ? `<div class="jr-hero"><img src="${escAttr(heroUrl)}" alt="${escAttr(a.hero_alt || title)}" fetchpriority="high"></div>` : ""}
<header class="jr-head">
${metaHtml(pubDate, readingTime)}
<h1 class="jr-title">${escHtml(title)}</h1>
${bylineHtml(a.author_name)}
</header>
${subtitle ? `<p class="jr-stand jr-col">${escHtml(subtitle)}</p>` : ""}
<div class="jr-body">${markCredits(pairFigures(contentHtml))}</div>
<hr class="jr-end">
<div class="jr-cta">
<h3>Get the next one</h3>
<p>New writing from the desk. Unsubscribe whenever.</p>
<form id="oc-end-form" novalidate>
<input id="oc-end-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none">
<label class="jx-vh" for="oc-end-email" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Email address</label>
<input id="oc-end-email" type="email" name="email" placeholder="Email address" required>
<button type="submit" aria-label="Subscribe">&rarr;</button>
<p id="oc-end-msg" class="oc-end-msg" style="display:none"></p>
</form>
</div>
</article>
${relatedHtml(related)}
</main>
${chrome.footer()}
${chrome.floats()}
${chrome.scripts()}
<script defer src="/assets/journal-paper.js?v=2"></script>
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
        btn.disabled = true; const original = btn.innerHTML; btn.textContent = "…";
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
            btn.disabled = false; btn.innerHTML = original;
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

        const related = await fetchRelated(article);
        res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=3600");
        res.status(200);
        return res.send(renderArticleHtml(article, related));
    } catch (err) {
        console.error("[journal-article-render] UNHANDLED:", err.message);
        res.status(500);
        return res.send(fourOhFourHtml());
    }
};
