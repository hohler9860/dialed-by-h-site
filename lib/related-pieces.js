// Picks the related pieces on a watch page: other models from the same brand, plus one
// watch in the same model with different specifics, instead of near copies of this one.
// Same-brand only. Picks are stable for a given page, so links don't shift between visits
// or crawls, but vary from page to page so the internal links spread across the catalogue.

// "F.P.Journe" and "F.P. Journe" are the same brand.
const key = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// "Day-Date 36" and "Day-Date 40" are one model family.
const family = (p) => key(String(p.model || '').replace(/\s\d{2}(\.\d)?$/, ''));

// Digits at the start of a reference: 126710BLRO and 126710BLNR share 126710.
const refBase = (p) => (String(p.ref || '').match(/^\d{3,}/) || [''])[0];

// How different two pieces look on paper. Dial and case count most because you see them first.
function difference(a, b) {
    const differs = (field) => (key(a[field]) !== key(b[field]) ? 1 : 0);
    return differs('dialColor') * 3 + differs('caseMaterial') * 3 + differs('bracelet') + differs('caseSize')
        + (refBase(a) !== refBase(b) ? 1 : 0);
}

// Small repeatable hash, so a page always makes the same picks without storing anything.
function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

function pickRelated(w, all, count = 4) {
    const brand = key(w.brand), wFamily = family(w), wRef = key(w.ref);
    const seeded = (p) => hash(`${w.slug}|${p.slug}`);
    const pool = (all || []).filter((p) => p.image && p.slug !== w.slug && key(p.brand) === brand
        && !(wRef && key(p.ref) === wRef)); // the same reference again adds nothing

    const chosen = [];
    // The candidate most unlike this watch and everything already picked.
    const mostDifferent = (candidates) => candidates.map((p) => ({
        p,
        score: difference(p, w) + chosen.reduce((sum, c) => sum + difference(p, c), 0),
        tie: seeded(p),
    })).sort((a, b) => b.score - a.score || a.tie - b.tie)[0].p;

    // Same model, different specifics. Only counts if the dial or case really differs.
    const variations = wFamily ? pool.filter((p) => family(p) === wFamily
        && (key(p.dialColor) !== key(w.dialColor) || key(p.caseMaterial) !== key(w.caseMaterial))) : [];

    // Other models, one watch each, in an order that changes from page to page.
    // Pieces with no model on file come after the named ones, since we can't tell them apart.
    const byFamily = new Map();
    pool.forEach((p) => {
        const f = family(p);
        if (!f || f === wFamily) return;
        if (!byFamily.has(f)) byFamily.set(f, []);
        byFamily.get(f).push(p);
    });
    const families = [...byFamily.keys()].sort((a, b) => hash(`${w.slug}|${a}`) - hash(`${w.slug}|${b}`));
    const otherModelSlots = variations.length ? count - 1 : count;
    families.slice(0, otherModelSlots).forEach((f) => chosen.push(mostDifferent(byFamily.get(f))));

    if (variations.length && chosen.length < count) chosen.push(mostDifferent(variations));

    // Small brands may not fill the row, so top up with whatever is most different.
    while (chosen.length < count) {
        const rest = pool.filter((p) => !chosen.includes(p));
        if (!rest.length) break;
        chosen.push(mostDifferent(rest));
    }
    return chosen;
}

module.exports = { pickRelated, family, key };
