/* Dialed By H — popup request forms (Sell / Trade / Source) + Buy DM prompt.
   One design for all three: the light "Request to Source" card. Rendered by
   this script on every page that includes it, so the look cannot drift per
   page again. Styles are injected here (prefixed .dbh-lm) and do not depend
   on the page's own stylesheet.
   Submits to /api/submit-form; if that fails, falls back to a prefilled
   WhatsApp message so no request is ever lost. */
(function () {
  var WA = 'https://wa.me/19146211848';
  var IG = 'https://www.instagram.com/dialedbyh';

  var MODELS = {
    'Rolex': ['Daytona', 'Submariner', 'GMT-Master II', 'Datejust', 'Day-Date', 'Explorer', 'Oyster Perpetual', 'Sky-Dweller', 'Other'],
    'Audemars Piguet': ['Royal Oak', 'Royal Oak Offshore', 'Royal Oak Concept', 'Code 11.59', 'Other'],
    'Patek Philippe': ['Nautilus', 'Aquanaut', 'Calatrava', 'Grand Complications', 'Complications', 'Other'],
    'Richard Mille': ['RM 011', 'RM 035', 'RM 055', 'RM 067', 'RM 72-01', 'Other'],
    'Cartier': ['Santos', 'Tank', 'Ballon Bleu', 'Crash', 'Other'],
    'Omega': ['Speedmaster', 'Seamaster', 'Other'],
    'Other': ['Other']
  };

  var CSS = [
    '.dbh-lm{position:fixed;inset:0;z-index:81;display:flex;background:rgba(0,0,0,.82);overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:16px;box-sizing:border-box;opacity:0;transition:opacity .25s ease}',
    '.dbh-lm.is-open{opacity:1}',
    '.dbh-lm__card{position:relative;width:100%;max-width:512px;margin:auto;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;background:#f2f2f0;color:#0a0a0a;border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.45);padding:24px;box-sizing:border-box;font-family:var(--pt-mono,"Tronica Mono",ui-monospace,"SF Mono",Menlo,Consolas,monospace);transform:translateY(14px) scale(.985);transition:transform .35s cubic-bezier(.19,1,.22,1)}',
    '.dbh-lm.is-open .dbh-lm__card{transform:none}',
    '@media (min-width:640px){.dbh-lm__card{padding:28px 32px 32px}}',
    '.dbh-lm__close{position:sticky;top:0;float:right;margin:-8px -8px 0 0;width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:999px;border:1px solid rgba(10,10,10,.2);background:rgba(255,255,255,.8);color:#0a0a0a;cursor:pointer;padding:0;transition:background .2s ease}',
    '.dbh-lm__close:hover{background:#0a0a0a;color:#fff}',
    '.dbh-lm__title{font-family:var(--pt-serif,"Archivo","Helvetica Neue",Helvetica,Arial,sans-serif);font-weight:700;font-size:24px;line-height:1.05;letter-spacing:-.01em;text-transform:uppercase;margin:0 40px 8px 0}',
    '.dbh-lm__sub{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(10,10,10,.55);margin:0 0 28px}',
    '.dbh-lm__field{margin:0 0 16px}',
    '.dbh-lm label.dbh-lm__label{display:block;font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:rgba(10,10,10,.6);margin:0 0 8px}',
    '.dbh-lm input[type=text],.dbh-lm input[type=email],.dbh-lm input[type=tel],.dbh-lm select,.dbh-lm textarea{width:100%;box-sizing:border-box;background:transparent;border:1px solid rgba(10,10,10,.22);border-radius:0;padding:12px;font-size:14px;font-family:inherit;color:#0a0a0a;text-transform:uppercase;-webkit-appearance:none;appearance:none;outline:none;transition:border-color .2s ease}',
    '.dbh-lm input:focus,.dbh-lm select:focus,.dbh-lm textarea:focus{border-color:#0a0a0a}',
    '.dbh-lm input::placeholder,.dbh-lm textarea::placeholder{color:rgba(10,10,10,.35);text-transform:none;font-size:13px}',
    '.dbh-lm select{background-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'><path d=\'M1 1l4 4 4-4\' stroke=\'%230a0a0a\' fill=\'none\'/></svg>");background-repeat:no-repeat;background-position:right 14px center;padding-right:34px;cursor:pointer}',
    '.dbh-lm select:disabled{color:rgba(10,10,10,.4);cursor:default}',
    '.dbh-lm textarea{min-height:76px;resize:vertical}',
    '.dbh-lm__check{display:flex;align-items:center;gap:12px;font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:rgba(10,10,10,.6);cursor:pointer;margin:4px 0 16px}',
    '.dbh-lm__check input{appearance:none;-webkit-appearance:none;width:14px;height:14px;border:1px solid rgba(10,10,10,.4);background:transparent;margin:0;flex-shrink:0;cursor:pointer}',
    '.dbh-lm__check input:checked{background:#0a0a0a}',
    '.dbh-lm__submit,.dbh-lm__link{display:flex;align-items:center;justify-content:center;width:100%;box-sizing:border-box;margin-top:8px;padding:16px 24px;border:1px solid #0a0a0a;background:#0a0a0a;color:#fff;font-family:inherit;font-size:11px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;text-decoration:none;cursor:pointer;transition:background .25s ease,color .25s ease}',
    '.dbh-lm__submit:hover,.dbh-lm__link:hover{background:transparent;color:#0a0a0a}',
    '.dbh-lm__submit:disabled{opacity:.6;cursor:default}',
    '.dbh-lm__link--ghost{background:transparent;color:#0a0a0a;margin-top:10px}',
    '.dbh-lm__link--ghost:hover{background:#0a0a0a;color:#fff}',
    '.dbh-lm__lead{font-size:13px;line-height:1.6;color:rgba(10,10,10,.75);margin:0 0 20px}',
    '.dbh-lm__err{font-size:11px;letter-spacing:.08em;color:#b3261e;margin:10px 0 0;display:none}'
  ].join('\n');

  function ensureCss() {
    if (document.getElementById('dbh-lm-css')) return;
    var s = document.createElement('style');
    s.id = 'dbh-lm-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function field(label, inner) {
    return '<div class="dbh-lm__field"><label class="dbh-lm__label">' + label + '</label>' + inner + '</div>';
  }

  function text(name, opts) {
    opts = opts || {};
    return '<input type="' + (opts.type || 'text') + '" name="' + name + '"' +
      (opts.required ? ' required' : '') +
      (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') +
      (opts.autocomplete ? ' autocomplete="' + opts.autocomplete + '"' : '') + '>';
  }

  // Field order mirrors the Request to Source card exactly, so all three
  // forms read as one system. Sell and Trade add price + reason before the
  // details box.
  function formFields(kind) {
    var brands = Object.keys(MODELS).map(function (b) { return '<option value="' + esc(b) + '">' + esc(b) + '</option>'; }).join('');
    var html =
      field('Full Name', text('name', { required: true, autocomplete: 'name' })) +
      field('Email', text('email', { type: 'email', required: true, autocomplete: 'email' })) +
      field('Phone (Mobile)', text('phone', { type: 'tel', required: true, autocomplete: 'tel', placeholder: '+1 ...' })) +
      field('Preferred Contact',
        '<select name="preferred" required><option value="">Select</option><option>WhatsApp</option><option>iMessage</option><option>Email</option><option>Instagram DM</option></select>') +
      '<label class="dbh-lm__check"><input type="checkbox" name="textok"> OK to text me about this request</label>' +
      field('Where are you based?', text('location', { required: true, autocomplete: 'address-level2', placeholder: 'City, or city and state' })) +
      field('Brand', '<select name="brand" class="js-brand" required><option value="">Select Brand</option>' + brands + '</select>') +
      field('Model', '<select name="model" class="js-model" disabled><option value="">Select Brand First</option></select>') +
      field('Reference Number (if known)', text('reference', { placeholder: 'e.g. 126500LN' })) +
      // Sell and Trade ask exactly what Source asks. No price, no reason:
      // Henry's call, the conversation happens over text.
      field('Additional Details', '<textarea name="details" placeholder="Condition, box &amp; papers, etc."></textarea>');
    return html;
  }

  var FORMS = {
    sell:   { title: 'Request to Sell',   sub: "Quick form. I'll text you back." },
    trade:  { title: 'Request to Trade',  sub: "Quick form. I'll text you back." },
    source: { title: 'Request to Source', sub: "Quick form. I'll text you back." }
  };

  var current = null;
  var prevOverflow = '';
  var urlBefore = '';

  function close() {
    if (!current) return;
    var el = current;
    current = null;
    el.classList.remove('is-open');
    document.body.style.overflow = prevOverflow;
    if (urlBefore && window.history && history.replaceState) {
      var back = (urlBefore === '/sell' || urlBefore === '/trade') ? '/' : urlBefore;
      history.replaceState(history.state, '', back);
      urlBefore = '';
    }
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
  }

  function card(inner) {
    return '<div class="dbh-lm__card" role="dialog" aria-modal="true" data-lenis-prevent>' +
      '<button type="button" class="dbh-lm__close" aria-label="Close">' +
      '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
      '</button>' + inner + '</div>';
  }

  function open(kind) {
    ensureCss();
    close();
    var modal = document.createElement('div');
    modal.className = 'dbh-lm';
    modal.setAttribute('data-lenis-prevent', '');

    if (kind === 'buy') {
      modal.innerHTML = card(
        '<h2 class="dbh-lm__title">Looking to buy?</h2>' +
        '<p class="dbh-lm__sub">Fastest way is a DM.</p>' +
        '<p class="dbh-lm__lead">Tell me what you\'re after and I\'ll come back with what I can find.</p>' +
        '<a class="dbh-lm__link" href="' + WA + '?text=' + encodeURIComponent("Hi Henry — I'm looking to buy a watch.") + '" target="_blank" rel="noopener">WhatsApp me</a>' +
        '<a class="dbh-lm__link dbh-lm__link--ghost" href="' + IG + '" target="_blank" rel="noopener">DM on Instagram</a>');
    } else {
      var cfg = FORMS[kind];
      if (!cfg) return;
      modal.innerHTML = card(
        '<h2 class="dbh-lm__title">' + esc(cfg.title) + '</h2>' +
        '<p class="dbh-lm__sub">' + esc(cfg.sub) + '</p>' +
        '<form novalidate>' + formFields(kind) +
        '<input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none">' +
        '<button type="submit" class="dbh-lm__submit">Send It</button>' +
        '<p class="dbh-lm__err">Please fill in your name, email, phone, preferred contact, location and brand.</p>' +
        '</form>');

      var brand = modal.querySelector('.js-brand');
      var model = modal.querySelector('.js-model');
      brand.addEventListener('change', function () {
        var list = MODELS[brand.value] || [];
        model.innerHTML = brand.value
          ? '<option value="">Select Model</option>' + list.map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + '</option>'; }).join('')
          : '<option value="">Select Brand First</option>';
        model.disabled = !brand.value;
      });

      modal.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault();
        var form = e.target;
        var fd = new FormData(form);
        var get = function (k) { return (fd.get(k) || '').toString().trim(); };
        var err = form.querySelector('.dbh-lm__err');
        var missing = ['name', 'email', 'phone', 'preferred', 'location', 'brand'].filter(function (k) { return !get(k); });
        if (missing.length) {
          err.style.display = 'block';
          var first = form.querySelector('[name="' + missing[0] + '"]');
          if (first) first.focus();
          return;
        }
        err.style.display = 'none';

        var detailParts = [];
        [['Reference', 'reference'], ['Asking price', 'price'], ['Reason', 'reason'], ['Details', 'details'], ['Phone', 'phone'], ['Preferred contact', 'preferred']].forEach(function (p) {
          if (get(p[1])) detailParts.push(p[0] + ': ' + get(p[1]));
        });
        detailParts.push('OK to text: ' + (fd.get('textok') ? 'YES' : 'NO'));
        var typeMap = { sell: 'SELL', trade: 'TRADE', source: 'BUY' };
        var btn = form.querySelector('.dbh-lm__submit');
        btn.disabled = true; btn.textContent = 'Sending…';
        fetch('/api/submit-form', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: typeMap[kind] || 'BUY',
            fullName: get('name'),
            email: get('email'),
            watchName: [get('brand'), get('model')].filter(Boolean).join(' '),
            watchBrand: get('brand'),
            watchRef: get('reference'),
            phone: get('phone') || null,
            location: get('location') || null,
            preferred: get('preferred') || null,
            okToText: !!fd.get('textok'),
            watchDetails: detailParts.join(' | '),
            website: get('website')
          })
        }).then(function (r) {
          if (!r.ok) throw new Error(r.status);
          // Thank-you with the Instagram follow. Most visitors from search
          // have never seen the account; this is the moment they are paying
          // attention.
          modal.innerHTML = card(
            '<h2 class="dbh-lm__title">Got it.</h2>' +
            '<p class="dbh-lm__sub">I\'ll be in touch shortly.</p>' +
            '<p class="dbh-lm__lead">In the meantime, follow Dialed By H on Instagram. That\'s where every new piece shows up first.</p>' +
            '<a class="dbh-lm__link" href="' + IG + '" target="_blank" rel="noopener">Follow @dialedbyh</a>');
          modal.querySelector('.dbh-lm__close').addEventListener('click', close);
        }).catch(function () {
          var lines = [cfg.title + ' — Dialed By H'];
          var labels = { name: 'Name', email: 'Email', brand: 'Brand', model: 'Model', reference: 'Reference', location: 'Based in', price: 'Asking price', reason: 'Reason', details: 'Details' };
          Object.keys(labels).forEach(function (k) { if (get(k)) lines.push(labels[k] + ': ' + get(k)); });
          window.open(WA + '?text=' + encodeURIComponent(lines.join('\n')), '_blank');
          close();
        });
      });
    }

    modal.querySelector('.dbh-lm__close').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    ['wheel', 'touchmove'].forEach(function (ev) {
      modal.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true });
    });
    document.body.appendChild(modal);
    current = modal;
    if ((kind === 'sell' || kind === 'trade') && window.history && history.replaceState) {
      if (!urlBefore) urlBefore = location.pathname + location.search + location.hash;
      history.replaceState(history.state, '', '/' + kind);
    }
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        modal.classList.add('is-open');
        var first = modal.querySelector('input[name="name"]');
        if (first && window.matchMedia('(min-width: 640px)').matches) first.focus();
      });
    });
  }

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-modal]');
    if (!t) return;
    e.preventDefault();
    open(t.getAttribute('data-modal'));
  });

  // Own URL for each form: /sell and /trade load the page with that form
  // open (Vercel rewrites both to the homepage), and #sell / #trade work on
  // any page. /source is handled by the homepage's own modal already.
  function deepLink() {
    var path = (location.pathname || '').replace(/\/+$/, '');
    var kind = (path === '/sell' || path === '/trade') ? path.slice(1)
      : (/^#(sell|trade)$/.test(location.hash) ? location.hash.slice(1) : null);
    if (kind) open(kind);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', deepLink);
  else deepLink();

  window.DBHModals = { open: open, close: close };
})();
