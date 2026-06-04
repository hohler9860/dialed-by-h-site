// POST /api/journal-admin
// Single auth-protected endpoint for journal admin operations.
// Body: { action: "list-all" | "get" | "save" | "delete" | "publish" | "upload-image", ...args }
// Auth: Authorization: Bearer <ADMIN_PASSWORD>

const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://untnrofsnmoyxdidxbdj.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const ALLOWED_ORIGINS = ["https://dialedbyhenry.com", "https://www.dialedbyhenry.com"];

function setCors(req, res) {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    } else if (process.env.VERCEL_ENV !== "production") {
        res.setHeader("Access-Control-Allow-Origin", origin || "*");
    }
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function timingSafeEq(a, b) {
    if (typeof a !== "string" || typeof b !== "string") return false;
    if (a.length !== b.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
        return false;
    }
}

function isAuthorized(req) {
    if (!ADMIN_PASSWORD) return false;
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) return false;
    const provided = header.slice(7).trim();
    return timingSafeEq(provided, ADMIN_PASSWORD);
}

function slugify(text) {
    return String(text)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 80);
}

function readingTimeMinutes(plainText) {
    const words = String(plainText || "").split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 220));
}

// ─────────────────────────────────────────────────────
// Editor.js JSON → HTML renderer (SEO-clean)
// ─────────────────────────────────────────────────────

function escHtml(s) {
    return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function renderBlock(block) {
    const { type, data } = block || {};
    if (!type || !data) return "";

    switch (type) {
        case "paragraph":
            return `<p>${data.text || ""}</p>`;
        case "header": {
            const level = Math.min(Math.max(parseInt(data.level, 10) || 2, 2), 4);
            return `<h${level}>${data.text || ""}</h${level}>`;
        }
        case "list": {
            const tag = data.style === "ordered" ? "ol" : "ul";
            const items = Array.isArray(data.items) ? data.items : [];
            const lis = items.map((it) => `<li>${typeof it === "string" ? it : (it && it.content) || ""}</li>`).join("");
            return `<${tag}>${lis}</${tag}>`;
        }
        case "quote": {
            const text = data.text || "";
            const caption = data.caption ? `<footer>${data.caption}</footer>` : "";
            return `<blockquote>${text}${caption}</blockquote>`;
        }
        case "image": {
            const url = (data.file && data.file.url) || data.url || "";
            if (!url) return "";
            const alt = escHtml(data.caption || "");
            const caption = data.caption ? `<figcaption>${data.caption}</figcaption>` : "";
            return `<figure class="journal-figure"><img src="${escHtml(url)}" alt="${alt}" loading="lazy" />${caption}</figure>`;
        }
        case "embed": {
            const url = data.embed || data.source || "";
            if (!url) return "";
            return `<div class="journal-embed"><iframe src="${escHtml(url)}" frameborder="0" allowfullscreen></iframe></div>`;
        }
        case "code": {
            return `<pre class="journal-code"><code>${escHtml(data.code || "")}</code></pre>`;
        }
        case "delimiter":
            return `<hr class="journal-delimiter" />`;
        case "raw":
            // Intentionally NOT supported — would allow XSS.
            return "";
        default:
            return "";
    }
}

function renderEditorJson(json) {
    if (!json || !Array.isArray(json.blocks)) return "";
    return json.blocks.map(renderBlock).join("\n");
}

function plainTextFromJson(json) {
    if (!json || !Array.isArray(json.blocks)) return "";
    return json.blocks
        .map((b) => {
            if (!b || !b.data) return "";
            if (b.type === "paragraph" || b.type === "header" || b.type === "quote") {
                return String(b.data.text || "").replace(/<[^>]+>/g, "");
            }
            if (b.type === "list") {
                return (b.data.items || [])
                    .map((it) => (typeof it === "string" ? it : (it && it.content) || ""))
                    .join(" ")
                    .replace(/<[^>]+>/g, "");
            }
            return "";
        })
        .join(" ");
}

// ─────────────────────────────────────────────────────
// Supabase helpers
// ─────────────────────────────────────────────────────

async function sbRequest(path, init = {}) {
    const url = `${SUPABASE_URL}/rest/v1${path}`;
    const r = await fetch(url, {
        ...init,
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            ...(init.headers || {}),
        },
    });
    if (!r.ok) {
        const text = await r.text();
        throw new Error(`Supabase ${r.status}: ${text}`);
    }
    if (r.status === 204) return null;
    return r.json();
}

async function uploadToStorage({ bucket, path, base64Data, contentType }) {
    const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
    const binary = Buffer.from(base64Data, "base64");
    const r = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": contentType,
            "x-upsert": "false",
        },
        body: binary,
    });
    if (!r.ok) {
        const text = await r.text();
        throw new Error(`Storage upload ${r.status}: ${text}`);
    }
    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

// ─────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────

async function actionListAll() {
    const fields = "id,slug,title,subtitle,status,category,published_at,created_at,updated_at,hero_image_url,view_count";
    const rows = await sbRequest(`/journal_articles?select=${fields}&order=updated_at.desc&limit=200`);
    return { articles: rows };
}

async function actionGet({ id }) {
    if (!id) throw new Error("Missing id");
    const rows = await sbRequest(`/journal_articles?id=eq.${encodeURIComponent(id)}&limit=1`);
    if (!rows || rows.length === 0) throw new Error("Article not found");
    return { article: rows[0] };
}

async function actionSave({ id, title, subtitle, excerpt, category, hero_image_url, content_json, seo_title, seo_description, status, published_at }) {
    if (!title || !String(title).trim()) throw new Error("Title required");

    const trimmedTitle = String(title).trim();
    const baseSlug = slugify(trimmedTitle);
    const html = renderEditorJson(content_json);
    const plain = plainTextFromJson(content_json);
    const readingTime = readingTimeMinutes(plain);

    const payload = {
        title: trimmedTitle,
        subtitle: subtitle ? String(subtitle).trim() : null,
        excerpt: excerpt ? String(excerpt).trim() : (plain ? plain.slice(0, 220).trim() : null),
        category: category ? String(category).trim() : null,
        hero_image_url: hero_image_url || null,
        content_json: content_json || null,
        content_html: html,
        seo_title: seo_title || null,
        seo_description: seo_description || null,
        reading_time_minutes: readingTime,
    };

    // Explicit article-date override from the editor. Lets the admin backdate or
    // forward-date a post. "" or null clears it; a valid date string sets it.
    if (published_at !== undefined) {
        if (!published_at) {
            payload.published_at = null;
        } else {
            const d = new Date(published_at);
            if (!isNaN(d.getTime())) payload.published_at = d.toISOString();
        }
    }

    if (status === "published" || status === "draft" || status === "archived") {
        payload.status = status;
        // Publishing always needs a date. If the admin did not set one, default to now.
        if (status === "published" && !payload.published_at) {
            payload.published_at = new Date().toISOString();
        }
    }

    if (id) {
        // Update — slug stays unless title changed AND user hasn't customized it; for v1, keep stable.
        const updated = await sbRequest(`/journal_articles?id=eq.${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify(payload),
        });
        return { article: updated[0] };
    }

    // Create — ensure unique slug
    let slug = baseSlug || `article-${Date.now()}`;
    const existing = await sbRequest(`/journal_articles?slug=eq.${encodeURIComponent(slug)}&select=id`);
    if (existing && existing.length > 0) {
        slug = `${baseSlug}-${Date.now().toString(36).slice(-4)}`;
    }
    payload.slug = slug;
    if (!payload.status) payload.status = "draft";

    const created = await sbRequest(`/journal_articles`, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload),
    });
    return { article: created[0] };
}

async function actionDelete({ id }) {
    if (!id) throw new Error("Missing id");
    await sbRequest(`/journal_articles?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    return { deleted: true };
}

async function actionUploadImage({ filename, data, contentType }) {
    if (!data || !contentType) throw new Error("Missing image data or contentType");
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
    if (!allowed.includes(contentType)) throw new Error("Unsupported image type");

    const ext = contentType.split("/")[1].replace("jpeg", "jpg");
    const safeName = (filename || "image").replace(/[^a-z0-9.-]/gi, "-").slice(0, 60);
    const date = new Date().toISOString().slice(0, 10);
    const rand = crypto.randomBytes(6).toString("hex");
    const path = `${date}/${rand}-${safeName.replace(/\.[^.]+$/, "")}.${ext}`;

    const url = await uploadToStorage({
        bucket: "journal-images",
        path,
        base64Data: data,
        contentType,
    });

    // Editor.js Image tool expects { success: 1, file: { url } }
    return { success: 1, file: { url } };
}

// ─────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────

module.exports = async (req, res) => {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    if (!SUPABASE_KEY) return res.status(500).json({ error: "Server misconfigured (Supabase)" });
    if (!ADMIN_PASSWORD) return res.status(500).json({ error: "Server misconfigured (ADMIN_PASSWORD)" });

    if (!isAuthorized(req)) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        const body = req.body || {};
        const { action } = body;

        switch (action) {
            case "list-all":
                return res.status(200).json(await actionListAll());
            case "get":
                return res.status(200).json(await actionGet(body));
            case "save":
                return res.status(200).json(await actionSave(body));
            case "delete":
                return res.status(200).json(await actionDelete(body));
            case "upload-image":
                return res.status(200).json(await actionUploadImage(body));
            default:
                return res.status(400).json({ error: "Unknown action" });
        }
    } catch (err) {
        console.error("[journal-admin] ERROR:", err.message);
        return res.status(500).json({ error: err.message || "Server error" });
    }
};
