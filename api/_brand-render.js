// Brand landing pages: /rolex, /patek-philippe, /audemars-piguet, ...
//
// One page per brand, server-rendered from the live catalogue, so Google gets
// a real "Rolex for sale Boston" page with the actual pieces on it, and every
// watch page gets a parent to sit under. The chrome (head assets, header,
// footer, modals) is lifted from the watch page renderer at load time rather
// than duplicated, so the two can never drift apart.

const { renderWatchPage, SITE_URL } = require('./_render');

function escHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const escAttr = escHtml;

// ── chrome, borrowed from a throwaway watch page ──
let CHROME = null;
function chrome() {
    if (CHROME) return CHROME;
    const html = renderWatchPage({
        slug: 'x', name: 'x', brand: 'x', image: 'https://example.com/x.webp', images: [],
    }, []);
    const headStart = html.indexOf('<link rel="stylesheet"');
    const headEnd = html.indexOf('</head>');
    const bodyStart = html.indexOf('<body');
    const mainStart = html.indexOf('<main');
    const mainEnd = html.indexOf('</main>') + '</main>'.length;
    CHROME = {
        headAssets: html.slice(headStart, headEnd),      // stylesheet + all page CSS
        header: html.slice(bodyStart, mainStart),        // <body> ... header/nav
        footer: html.slice(mainEnd),                     // footer, floats, modals, scripts
    };
    return CHROME;
}

// ── brand copy, Henry's voice ──
// slug → page. `match` is tested against piece.brand so alternate spellings
// (F.P.Journe / F.P. Journe) land on one page.
const BRANDS = {
    'rolex': {
        name: 'Rolex', match: /^rolex$/i,
        title: 'Rolex Watches for Sale in Boston | Submariner, Daytona, GMT, Datejust | Dialed By H',
        description: 'Buy, sell or source a Rolex in Boston with Dialed By H. Submariner, Daytona, GMT-Master II, Datejust and Day-Date, new and pre-owned, authenticated, with in-person handover in Boston, NYC and Miami.',
        h1: 'Rolex in Boston, without the waitlist',
        intro: [
            'Every Rolex on this page is a piece I can actually get you, not a catalog photo. Submariner, Daytona, GMT-Master II, Datejust, Day-Date, Sky-Dweller, the discontinued references and the ones your AD keeps saying are "allocated."',
            'I am an independent Rolex dealer based in Boston. I buy, sell and trade with a network of dealers across the US and Europe, which is how a Boston client gets a steel Daytona in days instead of years. Every piece is authenticated, insured in transit, and handed over in person in Boston, New York or Miami if that is what you want.',
            'Looking for a specific reference? Send it over and I will tell you what it really costs right now and how fast I can have it in your hands.',
        ],
        sellLine: 'Selling a Rolex in Boston? I pay dealer prices, in person, same day, with a wire you can watch land.',
        faq: [
            ['Can I buy a Rolex in Boston without a waitlist?', 'Yes. Dialed By H sources Rolex from a dealer network rather than an authorized dealer allocation, so steel sports models like the Submariner, Daytona and GMT-Master II are available within days, not years. You pay market price rather than retail, and you get the watch now.'],
            ['Are the Rolex watches authenticated?', 'Every Rolex I sell is inspected and authenticated before it changes hands. Serial and reference are checked, the movement is verified, and box and papers are confirmed where they are included. Full-set pieces are described as full set; watch-only pieces are described as watch only.'],
            ['Can I sell my Rolex in Boston?', 'Yes. Send the reference, condition and whether you have box and papers, and I will give you a real number the same day. Boston clients can meet in person; everyone else ships fully insured with a label I send.'],
            ['Do you trade Rolex?', 'Yes. Trade your current Rolex toward another Rolex, or toward Patek Philippe, Audemars Piguet or Richard Mille. I quote the trade value and the difference up front.'],
            ['What does a steel Rolex Daytona cost right now?', 'Market prices move weekly. The honest answer is to ask for the current number rather than trust a price on a page that may be a month old. Message me with the reference and I will send today\'s price.'],
        ],
    },
    'patek-philippe': {
        name: 'Patek Philippe', match: /^patek/i,
        title: 'Patek Philippe for Sale in Boston | Nautilus, Aquanaut, Calatrava | Dialed By H',
        description: 'Source a Patek Philippe in Boston through Dialed By H. Nautilus, Aquanaut, Calatrava, Complications and Grand Complications, authenticated and delivered in person in Boston, NYC and Miami.',
        h1: 'Patek Philippe in Boston',
        intro: [
            'Nautilus, Aquanaut, Calatrava, annual calendars, perpetual calendars. If Patek made it and it is on the market somewhere, I can usually find it. These are the pieces I currently have access to through my dealer network.',
            'Patek is where the difference between a dealer and a guy with an Instagram account shows up. Condition grading, service history, the correct extract from the archives, whether the bracelet has been sized and by whom. I check all of it before you see the watch.',
            'Boston clients meet me in person. Everyone else gets fully insured shipping and a video of the piece before it leaves.',
        ],
        sellLine: 'Selling a Patek in Boston? I buy Nautilus, Aquanaut and complications outright, or consign for a lower fee than the auction houses.',
        faq: [
            ['Can I buy a Patek Philippe Nautilus in Boston?', 'Yes. Dialed By H sources Nautilus and Aquanaut references through a network of dealers and private collectors, so you are not waiting on an authorized dealer allocation. Pricing is market, and every piece is authenticated before handover.'],
            ['Do the Patek Philippe watches come with papers?', 'Most do, and the listing says exactly what is included. For older pieces without papers, an Extract from the Archives can be arranged through Patek Philippe to confirm the watch.'],
            ['Can I sell or consign a Patek Philippe in Boston?', 'Yes. I buy outright or consign. Consignment gets you closer to full market value; outright is faster. Tell me the reference and condition and I will lay out both numbers.'],
            ['Where do you meet in Boston?', 'In person, at a location that suits you, or at a bank if you prefer to complete the wire on the spot. I also hand over in New York and Miami regularly.'],
        ],
    },
    'audemars-piguet': {
        name: 'Audemars Piguet', match: /^audemars/i,
        title: 'Audemars Piguet Royal Oak for Sale in Boston | Dialed By H',
        description: 'Buy or sell an Audemars Piguet Royal Oak or Royal Oak Offshore in Boston with Dialed By H. Steel, gold, ceramic, chronographs and perpetual calendars, authenticated and delivered in person.',
        h1: 'Audemars Piguet in Boston',
        intro: [
            'Royal Oak 15500, 15510, 16202, Offshore, Concept, Code 11.59. AP is the brand I move the most of, and the one where knowing the reference matters more than anywhere else.',
            'The Royal Oak market is full of frankenwatches, polished cases and swapped bracelets. Every AP I sell is checked for original bracelet links, correct clasp, service history and an honest condition grade before it is offered. If it has been polished, you will know.',
            'These are pieces I can source right now. If your reference is not here, ask. It usually exists somewhere in the network.',
        ],
        sellLine: 'Selling a Royal Oak in Boston? I pay real money for 15500, 15510, 26240 and Offshores, in person, same day.',
        faq: [
            ['Can I buy an Audemars Piguet Royal Oak in Boston?', 'Yes. Dialed By H sources Royal Oak and Royal Oak Offshore references through a dealer network, in steel, gold and ceramic, including current production and discontinued references.'],
            ['How do you check a Royal Oak is genuine?', 'Serial and case number verification, movement inspection, bracelet and clasp originality, and a condition grade that calls out polishing. A watch that has been polished is sold as polished.'],
            ['Can I sell my Royal Oak in Boston?', 'Yes. Send the reference, dial, bracelet and whether you have box and papers, and I will give you a number the same day. Boston and New York clients can meet in person.'],
            ['Do you trade Rolex for Audemars Piguet?', 'Yes, both directions. I quote the trade value and the difference up front so there is no surprise.'],
        ],
    },
    'richard-mille': {
        name: 'Richard Mille', match: /^richard/i,
        title: 'Richard Mille for Sale in Boston | RM 011, RM 035, RM 055, RM 67 | Dialed By H',
        description: 'Source a Richard Mille in Boston through Dialed By H. RM 011, RM 035, RM 055, RM 67-02 and more, authenticated with full documentation, delivered in person in Boston, NYC and Miami.',
        h1: 'Richard Mille in Boston',
        intro: [
            'RM 011, RM 035, RM 055, RM 67-02, RM 72-01. Richard Mille is a small market with big numbers, and the difference between a good deal and a bad one is knowing who you are buying from.',
            'I source RM through a closed dealer network and I verify every piece against the warranty card, the strap and case serials, and the service record. Nothing is sold without the paperwork that proves it.',
            'If you are buying RM in Boston, meet me in person. Wire on the spot, watch on the wrist, done.',
        ],
        sellLine: 'Selling a Richard Mille? I buy outright with a same-day wire, or place it privately with a buyer from the network.',
        faq: [
            ['Can I buy a Richard Mille in Boston?', 'Yes. Dialed By H sources Richard Mille through a private dealer network. Pieces come with warranty card, box and full documentation, and are handed over in person in Boston, New York or Miami.'],
            ['How do you authenticate a Richard Mille?', 'Warranty card and serials are matched to the case and strap, the movement is inspected, and service history is confirmed. A piece that cannot be fully documented is not offered.'],
            ['Can I sell my Richard Mille in Boston?', 'Yes. Outright purchase with a same-day wire, or a private placement with a collector from the network for a higher number. Tell me the reference and I will give you both.'],
        ],
    },
    'vacheron-constantin': {
        name: 'Vacheron Constantin', match: /^vacheron/i,
        title: 'Vacheron Constantin Overseas for Sale in Boston | Dialed By H',
        description: 'Buy or sell a Vacheron Constantin Overseas, Patrimony or Historiques in Boston with Dialed By H. Authenticated, delivered in person in Boston, NYC and Miami.',
        h1: 'Vacheron Constantin in Boston',
        intro: [
            'Overseas in steel, rose gold and the chronograph, Patrimony, Historiques, the 222. Vacheron is the quiet one of the big three and the one serious collectors end up at.',
            'I source Vacheron through the same network as my Patek and AP pieces, with the same checks: papers, service history, bracelet originality, honest condition.',
        ],
        sellLine: 'Selling an Overseas in Boston? I buy outright or consign, and I know exactly what the rose gold ones are trading at this week.',
        faq: [
            ['Can I buy a Vacheron Constantin Overseas in Boston?', 'Yes. Dialed By H sources Overseas references in steel and gold, including the chronograph and the perpetual calendar, through a dealer network, with in-person handover in Boston.'],
            ['Can I sell my Vacheron Constantin in Boston?', 'Yes. Send the reference and condition and I will give you an outright number and a consignment number the same day.'],
        ],
    },
    'cartier': {
        name: 'Cartier', match: /^cartier$/i,
        title: 'Cartier Watches for Sale in Boston | Santos, Tank, Panthère, Crash | Dialed By H',
        description: 'Buy or sell a Cartier Santos, Tank, Panthère, Ballon Bleu or Crash in Boston with Dialed By H. Authenticated, delivered in person in Boston, NYC and Miami.',
        h1: 'Cartier in Boston',
        intro: [
            'Santos, Tank, Panthère, Ballon Bleu, Crash, and the Privé pieces that never make it to the boutique floor. Cartier is the brand that gets the most "where did you get that" and the one with the most fakes on the market.',
            'Every Cartier I sell is checked for genuine case, dial and movement, with papers where included. Gold pieces are weighed and hallmarks confirmed.',
        ],
        sellLine: 'Selling a Cartier in Boston? Gold Santos, Panthère and Crash are in demand. Send the reference and I will give you a number today.',
        faq: [
            ['Can I buy a Cartier watch in Boston?', 'Yes. Dialed By H sources Cartier Santos, Tank, Panthère, Ballon Bleu and Crash references, in steel and gold, with in-person handover in Boston.'],
            ['How do you spot a fake Cartier?', 'Case construction, dial printing, movement, and hallmarks on gold pieces. Every Cartier is inspected before it is offered, and papers are confirmed where they are included.'],
        ],
    },
    'fp-journe': {
        name: 'F.P. Journe', match: /^f\.?p\.?\s*journe/i,
        title: 'F.P. Journe for Sale in Boston | Chronomètre Bleu, Résonance, Tourbillon | Dialed By H',
        description: 'Source an F.P. Journe in Boston through Dialed By H. Chronomètre Bleu, Chronomètre Souverain, Résonance and Tourbillon Souverain, authenticated and delivered in person.',
        h1: 'F.P. Journe in Boston',
        intro: [
            'Chronomètre Bleu, Chronomètre Souverain, Résonance, Tourbillon Souverain, Élégante. Journe is the independent that turned into a blue-chip, and the pieces trade hands quietly between collectors who know each other.',
            'I source Journe through that network. Every piece is verified with the boutique paperwork and the Journe service record before it is offered.',
        ],
        sellLine: 'Selling a Journe? I can place it privately with a collector for a better number than you will get anywhere public.',
        faq: [
            ['Can I buy an F.P. Journe in Boston?', 'Yes. Dialed By H sources F.P. Journe through a private collector and dealer network, with papers verified, and in-person handover in Boston, New York or Miami.'],
            ['Can I sell my F.P. Journe?', 'Yes. Private placement usually gets the best number for Journe. Tell me the reference and I will tell you what it is trading at.'],
        ],
    },
    'a-lange-sohne': {
        name: 'A. Lange & Söhne', match: /lange/i,
        title: 'A. Lange & Söhne for Sale in Boston | Lange 1, Zeitwerk, Datograph | Dialed By H',
        description: 'Source an A. Lange & Söhne in Boston through Dialed By H. Lange 1, Zeitwerk, Datograph, Saxonia and Odysseus, authenticated and delivered in person.',
        h1: 'A. Lange & Söhne in Boston',
        intro: [
            'Lange 1, Zeitwerk, Datograph, Saxonia, Odysseus. Lange is the German answer to Patek and the pieces I get the most questions about from collectors who already own everything else.',
            'Every Lange I sell is verified with papers and service history. Movement condition matters more here than anywhere, so it is inspected before you see the watch.',
        ],
        sellLine: 'Selling a Lange in Boston? Outright or consignment, with a real number the same day.',
        faq: [
            ['Can I buy an A. Lange & Söhne in Boston?', 'Yes. Dialed By H sources Lange 1, Zeitwerk, Datograph, Saxonia and Odysseus references through a dealer network, with in-person handover in Boston.'],
        ],
    },
};

const BRAND_SLUGS = Object.keys(BRANDS);

function brandOf(slug) { return BRANDS[String(slug || '').toLowerCase()] || null; }

function renderBrandPage(slug, all = []) {
    const b = brandOf(slug);
    if (!b) return null;
    const pieces = all.filter(p => p.image && b.match.test(String(p.brand || '')));
    // Newest first so the page changes as stock does; cap keeps the HTML sane.
    pieces.sort((x, y) => String(y.addedAt || '').localeCompare(String(x.addedAt || '')));
    const shown = pieces.slice(0, 48);
    const canonical = `${SITE_URL}/${slug}`;
    const c = chrome();

    const ld = [
        {
            '@context': 'https://schema.org', '@type': 'CollectionPage',
            name: b.title, url: canonical, description: b.description,
            isPartOf: { '@type': 'WebSite', name: 'Dialed By H', url: SITE_URL },
            about: { '@type': 'Brand', name: b.name },
            mainEntity: {
                '@type': 'ItemList', numberOfItems: pieces.length,
                itemListElement: shown.slice(0, 24).map((p, i) => ({
                    '@type': 'ListItem', position: i + 1, url: `${SITE_URL}/watch/${p.slug}`,
                    name: `${p.brand} ${p.nickname || p.model || p.name}`.trim(),
                })),
            },
        },
        {
            '@context': 'https://schema.org', '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
                { '@type': 'ListItem', position: 2, name: 'Buy', item: `${SITE_URL}/buy/` },
                { '@type': 'ListItem', position: 3, name: b.name, item: canonical },
            ],
        },
        {
            '@context': 'https://schema.org', '@type': 'FAQPage',
            mainEntity: b.faq.map(([q, a]) => ({
                '@type': 'Question', name: q,
                acceptedAnswer: { '@type': 'Answer', text: a },
            })),
        },
        {
            '@context': 'https://schema.org', '@type': 'LocalBusiness',
            '@id': `${SITE_URL}/#business`, name: 'Dialed By H', url: SITE_URL,
            description: `Independent luxury watch dealer in Boston specializing in ${b.name}.`,
            address: { '@type': 'PostalAddress', addressLocality: 'Boston', addressRegion: 'MA', addressCountry: 'US' },
            areaServed: [{ '@type': 'City', name: 'Boston' }, { '@type': 'City', name: 'New York City' }, { '@type': 'City', name: 'Miami' }],
            sameAs: ['https://www.instagram.com/dialedbyh'],
        },
    ];

    const name = p => `${p.brand} ${p.nickname || p.model || p.name}`.trim();
    const grid = shown.map(p => `<a href="/watch/${escAttr(p.slug)}" aria-label="${escAttr(name(p))}${p.ref ? ' ' + escAttr(p.ref) : ''}">
<div class="rimg"><img src="${escAttr(p.imageThumb || p.image)}" alt="${escAttr(name(p))}${p.ref ? ' Ref. ' + escAttr(p.ref) : ''}" loading="lazy" width="300" height="300" decoding="async"></div>
<span class="rname">${escHtml(name(p))}</span>
${p.ref ? `<span class="rref">Ref. ${escHtml(p.ref)}</span>` : ''}
</a>`).join('');

    const others = BRAND_SLUGS.filter(s => s !== slug).map(s => `<a href="/${s}">${escHtml(BRANDS[s].name)}</a>`).join('');

    const head = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-fpj-32.png?v=4" />
<link rel="icon" type="image/png" sizes="192x192" href="/favicon-fpj-192.png?v=4" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=4" />
<title>${escHtml(b.title)}</title>
<meta name="description" content="${escAttr(b.description)}">
<meta name="author" content="Henry Ohler">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${escAttr(b.title)}">
<meta property="og:description" content="${escAttr(b.description)}">
${shown[0] ? `<meta property="og:image" content="${escAttr(shown[0].imageMedium || shown[0].image)}">` : ''}
<meta property="og:site_name" content="Dialed By H">
<meta name="twitter:card" content="summary_large_image">
${ld.map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n')}
${c.headAssets}
<style>
.bp{max-width:1360px;margin:0 auto;padding:28px 40px 90px}
@media(max-width:820px){.bp{padding:18px 20px 60px}}
.bp-crumb{font-family:var(--pt-mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(0,0,0,.45)}
.bp-crumb a{color:inherit;text-decoration:none}
.bp h1{font-family:var(--pt-serif);font-size:clamp(40px,6vw,84px);line-height:.98;font-weight:400;text-transform:uppercase;letter-spacing:.01em;margin:18px 0 22px;max-width:14ch}
.bp-intro{max-width:720px;font-family:var(--pt-mono);font-size:13px;line-height:1.8;color:#000}
.bp-intro p+p{margin-top:14px}
.bp-cta{display:flex;flex-wrap:wrap;gap:10px;margin:26px 0 0}
.bp-cta .pt-btn{font-family:var(--pt-mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;padding:15px 22px;border:1px solid #000;background:#000;color:#fff;cursor:pointer;text-decoration:none}
.bp-cta .pt-btn--ghost{background:transparent;color:#000}
.bp-sec{margin-top:64px}
.bp-sec h2{font-family:var(--pt-mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:rgba(0,0,0,.45);padding-bottom:12px;border-bottom:1px solid rgba(0,0,0,.14)}
.bp-count{font-family:var(--pt-mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:rgba(0,0,0,.45);margin-top:12px}
.pt-relgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:18px}
@media(max-width:820px){.pt-relgrid{grid-template-columns:repeat(2,1fr);gap:12px}}
.pt-relgrid a{text-decoration:none;color:#000;display:block}
.pt-relgrid .rimg{aspect-ratio:1/1;overflow:hidden;background:#0d0d0d}
.pt-relgrid img{width:100%;height:100%;object-fit:cover;transition:transform .5s cubic-bezier(.19,1,.22,1)}
.pt-relgrid a:hover img{transform:scale(1.04)}
.pt-relgrid .rname{font-family:var(--pt-mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin-top:10px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pt-relgrid .rref{font-family:var(--pt-mono);font-size:10px;letter-spacing:.12em;color:rgba(0,0,0,.45);display:block;margin-top:3px}
.bp-sell{margin-top:64px;border-top:1px solid rgba(0,0,0,.14);border-bottom:1px solid rgba(0,0,0,.14);padding:34px 0;display:flex;flex-wrap:wrap;gap:22px;align-items:center;justify-content:space-between}
.bp-sell p{font-family:var(--pt-serif);font-size:clamp(24px,3vw,40px);line-height:1.05;text-transform:uppercase;max-width:22ch}
.bp-faq{max-width:820px}
.bp-faq details{border-top:1px solid rgba(0,0,0,.14);padding:18px 0}
.bp-faq details:last-child{border-bottom:1px solid rgba(0,0,0,.14)}
.bp-faq summary{cursor:pointer;font-family:var(--pt-mono);font-size:14px;list-style:none;display:flex;justify-content:space-between;gap:20px}
.bp-faq summary::-webkit-details-marker{display:none}
.bp-faq summary:after{content:'+';color:rgba(0,0,0,.4)}
.bp-faq details[open] summary:after{content:'\\2013'}
.bp-faq p{font-family:var(--pt-mono);font-size:12.5px;line-height:1.75;margin-top:12px;max-width:68ch;color:rgba(0,0,0,.8)}
.bp-brands{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:16px;font-family:var(--pt-mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase}
.bp-brands a{color:#000;text-decoration:none;border-bottom:1px solid rgba(0,0,0,.25);padding-bottom:2px}
.bp-brands a:hover{border-color:#000}
.bp-cities{font-family:var(--pt-mono);font-size:12.5px;line-height:1.8;max-width:720px;margin-top:14px}
.bp-cities a{color:#000}
</style>
</head>
`;

    const main = `<main class="pt-page">
<div class="bp">
<div class="bp-crumb"><a href="/">Home</a> &nbsp;/&nbsp; <a href="/buy/">Buy</a> &nbsp;/&nbsp; ${escHtml(b.name)}</div>
<h1>${escHtml(b.h1)}</h1>
<div class="bp-intro">${b.intro.map(p => `<p>${escHtml(p)}</p>`).join('')}</div>
<div class="bp-cta">
<a class="pt-btn" href="https://wa.me/19146211848?text=${encodeURIComponent(`Hi Henry, I'm looking for a ${b.name}.`)}" target="_blank" rel="noopener">Message on WhatsApp</a>
<button type="button" class="pt-btn pt-btn--ghost" onclick="location.href='/source'">Request to source a ${escHtml(b.name)}</button>
<button type="button" class="pt-btn pt-btn--ghost" data-modal="sell">Sell my ${escHtml(b.name)}</button>
</div>

<section class="bp-sec">
<h2>${escHtml(b.name)} available now</h2>
<div class="bp-count">${pieces.length} piece${pieces.length === 1 ? '' : 's'} in the network${pieces.length > shown.length ? ', newest ' + shown.length + ' shown' : ''}. <a href="/buy/" style="color:#000">See the full catalogue</a>.</div>
<div class="pt-relgrid">${grid}</div>
</section>

<section class="bp-sell">
<p>${escHtml(b.sellLine)}</p>
<button type="button" class="pt-btn" style="font-family:var(--pt-mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;padding:15px 22px;border:1px solid #000;background:#000;color:#fff;cursor:pointer" data-modal="sell">Get a number today</button>
</section>

<section class="bp-sec">
<h2>Boston, New York, Miami</h2>
<p class="bp-cities">I am based in Boston and hand over in person across Greater Boston, from Back Bay and the Seaport to Wellesley, Newton, Brookline and the North Shore. I am in New York and Miami every month. Everywhere else in the US ships fully insured. Read more about <a href="/boston">buying and selling watches in Boston</a>, <a href="/buy-rolex-boston">buying a Rolex in Boston</a>, <a href="/sell-rolex-boston">selling a Rolex in Boston</a>, <a href="/patek-philippe-boston">Patek Philippe in Boston</a>, or <a href="/process/">how the process works</a>.</p>
</section>

<section class="bp-sec">
<h2>Questions about ${escHtml(b.name)}</h2>
<div class="bp-faq">${b.faq.map(([q, a]) => `<details><summary>${escHtml(q)}</summary><p>${escHtml(a)}</p></details>`).join('')}</div>
</section>

<section class="bp-sec">
<h2>Other brands</h2>
<div class="bp-brands">${others}</div>
</section>
</div>
</main>`;

    return head + c.header + main + c.footer;
}

module.exports = { renderBrandPage, BRANDS, BRAND_SLUGS };
