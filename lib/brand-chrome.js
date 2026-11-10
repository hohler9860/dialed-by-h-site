// Site chrome for every inner page: head assets, Meta pixel, header, mobile
// menu, footer, floats and shared scripts. Server-rendered pages require this
// directly; static pages get it through scripts/sync-chrome.js, so a change to
// the nav or footer lands everywhere from this one file.
const CSS_VERSION = '16';
const MODALS_VERSION = '9';
const WA = 'https://wa.me/19146211848';
const IG = 'https://www.instagram.com/dialedbyh';

const NAV = [
    ['I.', 'Concierge', '/source', 'source'],
    ['II.', 'Sourcing Catalogue', '/buy/', null],
    ['III.', 'Sell or Trade', '/sell', 'sell'],
    ['IV.', 'About', '/about/', null],
    ['V.', 'Process', '/process/', null],
    ['VI.', 'Journal', '/journal/', null],
];

function navList(active) {
    return NAV.map(([n, label, href, modal]) =>
        `<li${label === active ? ' class="is-here"' : ''}><span class="n">${n}</span><a href="${href}"${modal ? ` data-modal="${modal}"` : ''}${label === active ? ' aria-current="page"' : ''}>${label}</a></li>`
    ).join('');
}

function headAssets() {
    return `<link rel="icon" href="/favicon.ico?v=7" sizes="48x48">
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=7">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-dbh-32.png">
<link rel="icon" type="image/png" sizes="96x96" href="/favicon-dbh-96.png">
<link rel="icon" type="image/png" sizes="192x192" href="/favicon-dbh-192.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=8">
<meta name="theme-color" content="#F7F3E9">
<link rel="preload" href="/assets/fonts/suisse/SuisseWorks-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/suisse/SuisseIntl-Medium.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/dbh-brand.css?v=${CSS_VERSION}">`;
}

// The stub queues fbq calls immediately; only the 108KB library waits for load
// so it never competes with the first paint on a phone.
function pixel() {
    return `<script>
if (location.hostname === 'dialedbyhenry.com' || location.hostname === 'www.dialedbyhenry.com') {
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];
var go=function(){if(go.done)return;go.done=!0;t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)};
f.addEventListener('load',go);setTimeout(go,4000)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '798516899968965');
fbq('track', 'PageView');
}
</script>
<script defer src="/_vercel/insights/script.js"></script>`;
}

function header(active) {
    return `<header class="sh"><div class="sh__bar">
  <a href="/" class="sh__home" aria-label="Dialed by H home"><img class="wm" src="/assets/brand/wordmark-charcoal.svg" alt="Dialed by H" width="791" height="112"></a>
  <nav aria-label="Primary"><ol>${navList(active)}</ol></nav>
  <button type="button" class="menu" id="menu-open" aria-controls="sheet" aria-expanded="false">Menu</button>
  <a href="/" class="sh__mark" aria-label="Dialed by H home"><img class="lm" src="/assets/brand/logomark-charcoal.svg" alt="" width="145" height="142"></a>
</div></header>
<div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-label="Menu">
  <header><a href="/" aria-label="Dialed by H home"><img class="wm2" src="/assets/brand/wordmark-cream.svg" alt="Dialed by H" width="791" height="112"></a><button type="button" id="menu-close">Close</button></header>
  <nav aria-label="Menu"><ol>${navList(active)}</ol></nav>
  <div class="c"><span class="k">(WhatsApp)</span><a href="${WA}" target="_blank" rel="noopener noreferrer">+1.914.621.1848</a></div>
</div>`;
}

function footer() {
    return `<footer class="sf">
  <div class="sf__grid">
    <div><a href="/" aria-label="Dialed by H home"><img class="cm" src="/assets/brand/combination-mark-cream.svg" alt="Dialed by H" width="930" height="142"></a><ul>
        <li><span>Text</span><a href="sms:+19146211848">+1.914.621.1848</a></li>
        <li><span>WhatsApp</span><a href="${WA}" target="_blank" rel="noopener noreferrer">+1.914.621.1848</a></li>
        <li><span>Email</span><a href="mailto:henry@dialedbyhenry.com">henry@dialedbyhenry.com</a></li>
        <li><span>Instagram</span><a href="${IG}" target="_blank" rel="noopener noreferrer">@dialedbyh</a></li>
        <li><span>LinkedIn</span><a href="https://www.linkedin.com/company/dialedbyh/" target="_blank" rel="noopener noreferrer">DialedbyH</a></li></ul></div>
    <div><span class="sf__label">Menu</span><ul><li><a href="/">Home</a></li><li><a href="/buy/">Sourcing Catalogue</a></li><li><a href="/trade" data-modal="trade">Trade</a></li><li><a href="/sell" data-modal="sell">Sell</a></li><li><a href="/source" data-modal="source">Concierge</a></li></ul></div>
    <div><span class="sf__label">Company</span><ul><li><a href="/about/">About</a></li><li><a href="/process/">Process</a></li><li><a href="/journal/">Journal</a></li><li><a href="/boston">Boston Watch Dealer</a></li><li><a href="/privacy">Privacy &amp; Terms</a></li></ul></div>
    <div><span class="sf__label">Brands</span><ul><li><a href="/rolex">Rolex</a></li><li><a href="/patek-philippe">Patek Philippe</a></li><li><a href="/audemars-piguet">Audemars Piguet</a></li><li><a href="/richard-mille">Richard Mille</a></li><li><a href="/vacheron-constantin">Vacheron Constantin</a></li><li><a href="/cartier">Cartier</a></li><li><a href="/fp-journe">F.P. Journe</a></li><li><a href="/a-lange-sohne">A. Lange &amp; S&ouml;hne</a></li></ul></div>
  </div>
  <div class="sf__legal"><p>Dialed by H is an independent sourcing firm and is not an authorized dealer for any watch brand. All brand names, logos, and trademarks referenced on this site belong to their respective owners and are used for identification purposes only.</p></div>
  <div class="sf__copy">Dialed by H&trade; &middot; dialedbyhenry.com</div>
</footer>`;
}

function floats() {
    return `<div class="floats">
  <a href="${WA}" target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.04 2.2c-5.4 0-9.8 4.36-9.8 9.72 0 1.72.46 3.39 1.32 4.86L2.2 21.8l5.16-1.34a9.85 9.85 0 0 0 4.68 1.18c5.4 0 9.8-4.36 9.8-9.72s-4.4-9.72-9.8-9.72zm0 17.79c-1.47 0-2.9-.39-4.15-1.12l-.3-.18-3.06.8.82-2.96-.2-.3a8.02 8.02 0 0 1-1.25-4.31c0-4.45 3.65-8.06 8.14-8.06s8.14 3.61 8.14 8.06-3.65 8.07-8.14 8.07zm4.46-6.04c-.24-.12-1.45-.71-1.67-.79-.22-.08-.39-.12-.55.12-.16.24-.63.79-.77.95-.14.16-.29.18-.53.06-.24-.12-1.03-.38-1.97-1.2-.73-.64-1.22-1.44-1.36-1.68-.14-.24-.02-.37.1-.49.11-.11.24-.29.37-.43.12-.14.16-.24.24-.41.08-.16.04-.3-.02-.43-.06-.12-.55-1.32-.75-1.8-.2-.48-.4-.41-.55-.42h-.47c-.16 0-.43.06-.65.3-.22.24-.86.83-.86 2.03s.88 2.36 1 2.52c.12.16 1.73 2.63 4.19 3.69.59.25 1.05.4 1.4.51.59.19 1.13.16 1.55.1.47-.07 1.45-.59 1.66-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28z"/></svg></a>
  <a href="${IG}" target="_blank" rel="noopener noreferrer" aria-label="DM on Instagram"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5.2" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4.3" stroke="currentColor" stroke-width="1.6"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor"/></svg></a>
</div>`;
}

function scripts() {
    return `<script defer src="/assets/inquiry-schema.js?v=1"></script>
<script defer src="/assets/inquiry-tracking.js?v=1"></script>
<script defer src="/assets/modals.js?v=${MODALS_VERSION}"></script>
<script>
(function(){
  var sheet=document.getElementById('sheet'),o=document.getElementById('menu-open'),c=document.getElementById('menu-close');
  if(!sheet||!o||!c)return;
  function suMenu(){
    if(sheet.dataset.su||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    sheet.dataset.su='1';
    [].forEach.call(sheet.querySelectorAll('nav li'),function(li,r){
      li.style.setProperty('--r',r);
      [li.querySelector('.n'),li.querySelector('a')].forEach(function(el){
        var t=el.textContent,w=document.createElement('span');
        if(el.tagName==='A')el.setAttribute('aria-label',t);
        w.className='su';w.setAttribute('aria-hidden','true');
        var a=document.createElement('span'),b=document.createElement('span');a.className='su__c';a.style.setProperty('--c',el.tagName==='A'?1:0);b.textContent=t;a.appendChild(b);w.appendChild(a);
        el.textContent='';el.appendChild(w);
      });
    });
  }
  function open(){suMenu();sheet.classList.add('is-open');o.setAttribute('aria-expanded','true');document.body.style.overflow='hidden';}
  function close(){sheet.classList.remove('is-open');o.setAttribute('aria-expanded','false');document.body.style.overflow='';}
  o.addEventListener('click',open);c.addEventListener('click',close);
  sheet.addEventListener('click',function(e){if(e.target.closest('a'))close();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
})();
// Photo storage refuses bursts, so a page of tiles can lose a few on first load.
// Try each again with a short backoff. /buy/ has its own queue and is skipped.
document.addEventListener('error',function(e){
  var i=e.target;
  if(!i||i.tagName!=='IMG'||!i.closest('.pt-item__media')||i.closest('.pt-reveal'))return;
  var n=+(i.dataset.retry||0);if(n>=3)return;
  i.dataset.retry=n+1;
  setTimeout(function(){var s=(i.currentSrc||i.src).split('?')[0];i.removeAttribute('srcset');i.src=s+'?r='+(n+1);},[800,2000,4000][n]);
},true);
</script>`;
}

// The catalogue tile: transparent cutout on the warm panel, then the deck's
// watch-info block. assets/buy.js builds the same markup in the browser.
function watchImage(p, esc, sizes, alt) {
    const cut = p.imageCutout || '';
    if (/-cutout\.webp$/.test(cut)) {
        const srcset = p.imageCutoutThumb ? ` srcset="${esc(p.imageCutoutThumb)} 224w, ${esc(cut)} 520w" sizes="${sizes}"` : '';
        return { html: `<img src="${esc(p.imageCutoutThumb || cut)}"${srcset} width="300" height="300" alt="${esc(alt)}" loading="lazy" decoding="async">`, cover: false };
    }
    return { html: `<img src="${esc(p.imageThumb || p.image || '')}" width="300" height="300" alt="${esc(alt)}" loading="lazy" decoding="async">`, cover: true };
}

function watchTile(p, esc) {
    const model = p.nickname || p.model || p.name || '';
    const label = `${p.brand || ''} ${model}${p.ref ? ' ' + p.ref : ''}`.trim();
    const alt = `${p.brand || ''} ${model}${p.ref ? ' Ref. ' + p.ref : ''}`.trim();
    const img = watchImage(p, esc, '(max-width: 640px) 42vw, (max-width: 1100px) 26vw, 220px', alt);
    return `<article class="pt-item"><a href="/watch/${esc(p.slug)}" aria-label="${esc(label)}">
<div class="pt-item__media${img.cover ? ' is-render' : ''}">${img.html}</div>
<div class="wi"><span class="wi__l1"><span class="wi__brand">${esc(p.brand || '')}</span>${p.year ? `<span class="wi__year">${esc(p.year)}</span>` : ''}</span><span class="wi__model">${esc(model)}</span>${p.ref ? `<span class="wi__ref">Ref. ${esc(p.ref)}</span>` : ''}</div>
</a></article>`;
}

module.exports = { headAssets, pixel, header, footer, floats, scripts, watchTile, watchImage, NAV };
