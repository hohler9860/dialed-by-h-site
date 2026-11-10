/* Dialed by H — popup request forms (Sell / Trade / Source) + Buy DM prompt.
   One design for all three: the light "Request to Source" card. Rendered by
   this script on every page that includes it, so the look cannot drift per
   page again. Styles are injected here (prefixed .dbh-lm) and do not depend
   on the page's own stylesheet.
   Submits to /api/submit-form; if that fails, falls back to a prefilled
   WhatsApp message so no request is ever lost.
   Concierge, Sell and Trade open the envelope in assets/envelope.js, which
   loads on demand and uses the same wireForm. If it can't load, the popup opens
   instead. "Sell or Trade" in the menu opens one card for both ("selltrade"),
   where the visitor says which; it sends as a normal SELL or TRADE lead. */
(function () {
  var WA = 'https://wa.me/19146211848';
  var IG = 'https://www.instagram.com/dialedbyh';

  var MODELS = {
    'Rolex': ['Daytona', 'Submariner', 'GMT-Master II', 'Explorer', 'Explorer II', 'Datejust', 'Day-Date', 'Sky-Dweller', 'Yacht-Master', 'Sea-Dweller', 'Oyster Perpetual', 'Land-Dweller', 'Milgauss', 'Air-King', 'Cellini', 'Other'],
    'Patek Philippe': ['Nautilus', 'Aquanaut', 'Calatrava', 'Grand Complications', 'Complications', 'Twenty~4', 'Golden Ellipse', 'Other'],
    'Audemars Piguet': ['Royal Oak', 'Royal Oak Offshore', 'Royal Oak Concept', 'Code 11.59', 'Millenary', 'Other'],
    'Richard Mille': ['RM 11', 'RM 35', 'RM 55', 'RM 67', 'RM 17', 'RM 27', 'RM 72', 'Other'],
    'F.P. Journe': ['Chronometre Bleu', 'Chronometre Souverain', 'Octa', 'Tourbillon Souverain', 'Centigraphe', 'Elegante', 'Other'],
    'Vacheron Constantin': ['Overseas', 'Patrimony', 'Traditionnelle', 'Historiques', 'Fiftysix', 'Other'],
    'A. Lange & S\u00f6hne': ['Lange 1', 'Saxonia', 'Zeitwerk', 'Datograph', '1815', 'Odysseus', 'Other'],
    'Omega': ['Speedmaster', 'Seamaster', 'Constellation', 'De Ville', 'Aqua Terra', 'Planet Ocean', 'Other'],
    'Cartier': ['Santos', 'Tank', 'Ballon Bleu', 'Panthere', 'Pasha', 'Drive', 'Crash', 'Other'],
    'IWC': ['Portugieser', 'Pilot', 'Aquatimer', 'Ingenieur', 'Portofino', 'Other'],
    'Panerai': ['Luminor', 'Submersible', 'Radiomir', 'Due', 'Other'],
    'Hublot': ['Big Bang', 'Classic Fusion', 'Spirit of Big Bang', 'Other'],
    'Tudor': ['Black Bay', 'Pelagos', 'Ranger', '1926', 'Other'],
    'Breitling': ['Navitimer', 'Chronomat', 'Superocean', 'Avenger', 'Premier', 'Other'],
    'Jaeger-LeCoultre': ['Reverso', 'Master', 'Polaris', 'Atmos', 'Other'],
    'Blancpain': ['Fifty Fathoms', 'Villeret', 'Ladybird', 'Other'],
    'Breguet': ['Classique', 'Marine', 'Tradition', 'Type XX', 'Other'],
    'Girard-Perregaux': ['Laureato', '1966', 'Bridges', 'Other'],
    'Other': ['Other']
  };


  var CSS = [
    '@font-face{font-family:"Suisse Intl";font-weight:400;font-style:normal;font-display:swap;src:url(/assets/fonts/suisse/SuisseIntl-Regular.woff2) format("woff2")}',
    '@font-face{font-family:"Suisse Intl";font-weight:500;font-style:normal;font-display:swap;src:url(/assets/fonts/suisse/SuisseIntl-Medium.woff2) format("woff2")}',
    '@font-face{font-family:"Suisse Works";font-weight:400;font-style:normal;font-display:swap;src:url(/assets/fonts/suisse/SuisseWorks-Regular.woff2) format("woff2")}',
    '@font-face{font-family:"Suisse Intl Mono";font-weight:400;font-style:normal;font-display:swap;src:url(/assets/fonts/suisse/SuisseIntlMono-Regular.woff2) format("woff2")}',
    '.dbh-lm{--lm-ink:#252522;--lm-paper:#F7F3E9;--lm-dark:#52514E;--lm-mid:#999791;--lm-light:#D8D5CE;--lm-intl:"Suisse Intl","Helvetica Neue",Arial,sans-serif;--lm-works:"Suisse Works",Georgia,serif;--lm-mono:"Suisse Intl Mono","SF Mono",Menlo,monospace;position:fixed;inset:0;z-index:81;display:flex;background:rgba(37,37,34,.86);overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:16px;box-sizing:border-box;opacity:0;transition:opacity .25s ease;font-synthesis:none}',
    '.dbh-lm.is-open{opacity:1}',
    '.dbh-lm *{box-sizing:border-box}',
    '.dbh-lm__card{position:relative;width:100%;max-width:520px;margin:auto;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;background:var(--lm-paper);color:var(--lm-ink);border:1px solid var(--lm-ink);border-radius:0;padding:26px 24px 28px;transform:translateY(12px);transition:transform .3s cubic-bezier(.2,.7,.2,1);font-family:var(--lm-intl);-webkit-font-smoothing:antialiased}',
    '.dbh-lm.is-open .dbh-lm__card{transform:none}',
    '@media (min-width:640px){.dbh-lm__card{padding:34px 38px 38px}}',
    '.dbh-lm__close{position:sticky;top:0;float:right;margin:-6px -6px 0 0;width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:0;border:1px solid var(--lm-light);background:var(--lm-paper);color:var(--lm-ink);cursor:pointer;z-index:2;transition:background .2s,color .2s,border-color .2s}',
    '.dbh-lm__close:hover{background:var(--lm-ink);color:var(--lm-paper);border-color:var(--lm-ink)}',
    '.dbh-lm__eyebrow{display:block;font-family:var(--lm-mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--lm-mid);margin:4px 0 14px;line-height:1.1}',
    '.dbh-lm__title{font-family:var(--lm-intl);font-weight:500;font-size:32px;line-height:1.1;letter-spacing:-.03em;text-transform:none;margin:0 40px 10px 0}',
    '.dbh-lm__sub{font-family:var(--lm-works);font-size:16px;line-height:1.25;letter-spacing:-.01em;text-transform:none;color:var(--lm-dark);margin:0 0 30px}',
    '.dbh-lm__field{margin:0 0 20px}',
    '.dbh-lm label.dbh-lm__label{display:block;font-family:var(--lm-mono);font-size:10px;font-weight:400;letter-spacing:.12em;text-transform:uppercase;color:var(--lm-mid);margin:0 0 4px;line-height:1.1}',
    '.dbh-lm input[type=text],.dbh-lm input[type=email],.dbh-lm input[type=tel],.dbh-lm select,.dbh-lm textarea{width:100%;background:transparent;border:0;border-bottom:1px solid var(--lm-light);border-radius:0;padding:9px 0;font-size:16px;font-family:var(--lm-intl);color:var(--lm-ink);outline:none;transition:border-color .2s;appearance:none;-webkit-appearance:none}',
    '.dbh-lm input:focus,.dbh-lm select:focus,.dbh-lm textarea:focus{border-color:var(--lm-ink)}',
    '.dbh-lm input::placeholder,.dbh-lm textarea::placeholder{color:var(--lm-mid);text-transform:none;font-size:14px}',
    '.dbh-lm select{background-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'><path d=\'M1 1l4 4 4-4\' stroke=\'%23252522\' fill=\'none\'/></svg>");background-repeat:no-repeat;background-position:right 2px center;padding-right:22px;cursor:pointer}',
    '.dbh-lm select:disabled{color:var(--lm-mid);cursor:default}',
    '.dbh-lm textarea{min-height:72px;resize:vertical;font-family:var(--lm-works);font-size:16px;line-height:1.25}',
    '.dbh-lm__check{display:flex;align-items:center;gap:12px;font-family:var(--lm-mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--lm-dark);cursor:pointer;margin:2px 0 22px;line-height:1.1}',
    '.dbh-lm__check input{appearance:none;-webkit-appearance:none;width:13px;height:13px;border:1px solid var(--lm-dark);background:transparent;margin:0;flex-shrink:0;cursor:pointer}',
    '.dbh-lm__check input:checked{background:var(--lm-ink);border-color:var(--lm-ink)}',
    '.dbh-lm__pick{display:flex;gap:28px}',
    '.dbh-lm__submit,.dbh-lm__link{display:flex;align-items:center;justify-content:center;width:100%;margin-top:10px;padding:14px 24px;border:1px solid var(--lm-ink);background:transparent;color:var(--lm-ink);font-family:var(--lm-intl);font-size:16px;font-weight:400;letter-spacing:0;text-transform:none;text-decoration:none;cursor:pointer;transition:background .25s ease,color .25s ease;line-height:1}',
    '.dbh-lm__submit:hover,.dbh-lm__link:hover{background:var(--lm-ink);color:var(--lm-paper)}',
    '.dbh-lm__submit:disabled{opacity:.6;cursor:default}',
    '.dbh-lm__link--ghost{border-color:var(--lm-light)}',
    '.dbh-lm__link--ghost:hover{background:var(--lm-ink);color:var(--lm-paper);border-color:var(--lm-ink)}',
    '.dbh-lm__or{display:block;font-family:var(--lm-mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--lm-mid);margin:20px 0 20px;line-height:1.1}',
    '.dbh-lm__lead{font-family:var(--lm-works);font-size:15px;line-height:1.4;color:var(--lm-dark);margin:0 0 22px;letter-spacing:0}',
    '.dbh-lm__err{font-family:var(--lm-mono);font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#8a3a2f;margin:12px 0 0;display:none;line-height:1.2}'
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

  // All three forms ask the same questions, so they read as one system.
  function formFields(kind) {
    var brands = Object.keys(MODELS).map(function (b) { return '<option value="' + esc(b) + '">' + esc(b) + '</option>'; }).join('');
    var html =
      (kind === 'selltrade' ? '<div class="dbh-lm__pick" role="radiogroup" aria-label="Sell or trade"><label class="dbh-lm__check"><input type="radio" name="deal" value="sell"> Sell</label><label class="dbh-lm__check"><input type="radio" name="deal" value="trade"> Trade</label></div>' : '') +
      field('Full Name', text('name', { required: true, autocomplete: 'name' })) +
      field('Email', text('email', { type: 'email', required: true, autocomplete: 'email' })) +
      field('Phone (Mobile)', text('phone', { type: 'tel', required: true, autocomplete: 'tel', placeholder: '+1 ...' })) +
      field('Preferred Contact',
        '<select name="preferred" required><option value="">Select</option><option>WhatsApp</option><option>iMessage</option><option>Email</option>' + (kind === 'source' ? '' : '<option>Instagram DM</option>') + '</select>') +
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
    sell:   { eyebrow: 'Sell',      title: 'Request to sell',   sub: "Quick form. I'll text you back, usually within a few hours." },
    trade:  { eyebrow: 'Trade',     title: 'Request to trade',  sub: "Quick form. I'll text you back, usually within a few hours." },
    // "Sell or Trade" in the menu: one card, and they say which on it.
    selltrade: { eyebrow: 'Sell or Trade', title: 'Request to sell or trade', sub: "Quick form. I'll text you back, usually within a few hours." },
    source: { eyebrow: 'Concierge', title: 'Request to source', sub: "Tell me the piece. I'll text you back, usually within a few hours." }
  };

  var current = null;
  var prevOverflow = '';
  var urlBefore = '';

  // Each form has its own URL while open, and leaves the page's URL as it found it on close.
  // The "Sell or Trade" card has no page of its own, so it borrows /sell.
  function setUrl(kind) {
    if (!window.history || !history.replaceState) return;
    var path = '/' + (kind === 'selltrade' ? 'sell' : kind);
    if (!urlBefore) urlBefore = location.pathname + location.search + location.hash;
    if (location.pathname.replace(/\/+$/, '') !== path) history.replaceState(history.state, '', path);
  }
  function restoreUrl() {
    if (!urlBefore || !window.history || !history.replaceState) return;
    var back = /^\/(sell|trade|source)\/?([?#]|$)/.test(urlBefore) ? '/' : urlBefore;
    history.replaceState(history.state, '', back);
    urlBefore = '';
  }

  function close() {
    if (!current) return;
    var el = current;
    current = null;
    el.classList.remove('is-open');
    document.body.style.overflow = prevOverflow;
    restoreUrl();
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
  }

  function card(inner) {
    return '<div class="dbh-lm__card" role="dialog" aria-modal="true" data-lenis-prevent>' +
      '<button type="button" class="dbh-lm__close" aria-label="Close">' +
      '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
      '</button>' + inner + '</div>';
  }

  // Add catalogue values missing from the curated menus so the exact watch is
  // kept. DOM properties keep URL text inert.
  function selectValue(select, value) {
    if (!value) return;
    var found = [].some.call(select.options, function (o) { return o.value === value; });
    if (!found) {
      var option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    }
    select.value = value;
  }

  function waHref(prefill, kind) {
    var piece = prefill && [prefill.brand, prefill.model].filter(Boolean).join(' ');
    if (piece && prefill.ref) piece += ' (Ref. ' + prefill.ref + ')';
    var verb = kind === 'sell' || kind === 'trade' ? kind : kind === 'selltrade' ? 'sell or trade' : '';
    var text = piece
      ? (verb ? "Hi Henry, I'd like to " + verb + ' my ' + piece + '.' : "Hi Henry, I'm interested in the " + piece + '.')
      : "Hi Henry, I'm looking to " + (verb || 'source') + ' a watch.';
    return WA + '?text=' + encodeURIComponent(text);
  }
  function brandOptions() {
    return Object.keys(MODELS).map(function (b) { return '<option value="' + esc(b) + '">' + esc(b) + '</option>'; }).join('');
  }

  // Brand and model menus, prefill, validation, sending and tracking for any request form. The
  // popup and the Concierge card both use this, so a lead looks the same to the server from either.
  function wireForm(form, kind, cfg, prefill, onSent, onFailed) {
    var brand = form.querySelector('.js-brand');
    var model = form.querySelector('.js-model');
    var emptyLabel = model.getAttribute('data-empty') || 'Select Brand First';
    var readyLabel = model.getAttribute('data-ready') || 'Select Model';
    brand.addEventListener('change', function () {
      var list = MODELS[brand.value] || [];
      model.innerHTML = brand.value
        ? '<option value="">' + esc(readyLabel) + '</option>' + list.map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + '</option>'; }).join('')
        : '<option value="">' + esc(emptyLabel) + '</option>';
      model.disabled = !brand.value;
    });
    if (prefill) {
      selectValue(brand, prefill.brand);
      brand.dispatchEvent(new Event('change'));
      selectValue(model, prefill.model);
      if (prefill.ref) form.querySelector('[name="reference"]').value = prefill.ref;
    }

    var errText = form.querySelector('.js-err').textContent;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (window.dbhTracking) window.dbhTracking.attempt(form);
      var fd = new FormData(form);
      var get = function (k) { return (fd.get(k) || '').toString().trim(); };
      var err = form.querySelector('.js-err');
      var missing = ['name', 'email', 'phone', 'preferred', 'location', 'brand'].filter(function (k) { return !get(k); });
      // The "Sell or Trade" card asks which one first. That answer is the lead's type.
      var unpicked = !!form.querySelector('[name="deal"]') && !get('deal');
      if (unpicked) missing.unshift('deal');
      if (missing.length) {
        if (window.dbhTracking) window.dbhTracking.error(form);
        err.textContent = unpicked ? 'Please choose sell or trade.' : errText;
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
      var typeMap = { sell: 'SELL', trade: 'TRADE', selltrade: 'SELL', source: 'BUY' };
      var as = get('deal') || kind;
      var btn = form.querySelector('[type="submit"]');
      btn.disabled = true; btn.textContent = 'Sending…';
      fetch('/api/submit-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: typeMap[as] || 'BUY',
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
          website: get('website'),
          attribution: window.dbhTracking ? window.dbhTracking.context(form) : null
        })
      }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        if (typeof window.fbq === 'function') window.fbq('track', 'Lead', { content_name: typeMap[as] || 'BUY' });
        onSent();
      }).catch(function () {
        if (window.dbhTracking) window.dbhTracking.error(form);
        var lines = [(FORMS[as] || cfg).title + ', Dialed by H'];
        var labels = { name: 'Name', email: 'Email', brand: 'Brand', model: 'Model', reference: 'Reference', location: 'Based in', price: 'Asking price', reason: 'Reason', details: 'Details' };
        Object.keys(labels).forEach(function (k) { if (get(k)) lines.push(labels[k] + ': ' + get(k)); });
        window.open(WA + '?text=' + encodeURIComponent(lines.join('\n')), '_blank');
        onFailed();
      });
    });
  }

  // The envelope loads on demand. If it can't load, or this browser can't run it, the popup opens.
  var ENVELOPE_VERSION = '4', envelopeLoad;
  function loadEnvelope() {
    if (window.dbhEnvelope) return Promise.resolve();
    if (envelopeLoad) return envelopeLoad;
    envelopeLoad = new Promise(function (resolve, reject) {
      if (!Element.prototype.animate) return reject(new Error('no animation support'));
      var pending = 2, done = function () { if (!--pending) resolve(); };
      var css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = '/assets/envelope.css?v=' + ENVELOPE_VERSION;
      css.onload = done; css.onerror = reject;
      var js = document.createElement('script');
      js.src = '/assets/envelope.js?v=' + ENVELOPE_VERSION;
      js.onload = done; js.onerror = reject;
      document.head.appendChild(css); document.head.appendChild(js);
      setTimeout(function () { reject(new Error('envelope timed out')); }, 3500);
    });
    envelopeLoad.catch(function () { envelopeLoad = null; });
    return envelopeLoad;
  }

  function open(kind, prefill) {
    if (!FORMS[kind]) return popup(kind, prefill);
    close();
    return loadEnvelope().then(function () {
      setUrl(kind);
      return window.dbhEnvelope.open(prefill, { kind: kind, onClose: restoreUrl });
    }).catch(function () { restoreUrl(); popup(kind, prefill); });
  }

  function popup(kind, prefill) {
    ensureCss();
    close();
    var modal = document.createElement('div');
    modal.className = 'dbh-lm';
    modal.setAttribute('data-lenis-prevent', '');

    if (kind === 'buy') {
      modal.innerHTML = card(
        '<span class="dbh-lm__eyebrow">Buy</span>' +
        '<h2 class="dbh-lm__title">Looking to buy?</h2>' +
        '<p class="dbh-lm__sub">Fastest way is a DM.</p>' +
        '<p class="dbh-lm__lead">Tell me what you\'re after and I\'ll come back with what I can find.</p>' +
        '<a class="dbh-lm__link" href="' + WA + '?text=' + encodeURIComponent("Hi Henry, I'm looking to buy a watch.") + '" target="_blank" rel="noopener">WhatsApp me</a>' +
        '<a class="dbh-lm__link dbh-lm__link--ghost" href="' + IG + '" target="_blank" rel="noopener">DM on Instagram</a>');
    } else {
      var cfg = FORMS[kind];
      if (!cfg) return;
      // The Concierge is where the bio link lands, so WhatsApp sits above the form.
      var waLine = kind === 'source'
        ? '<a class="dbh-lm__link" href="' + waHref(prefill) + '" target="_blank" rel="noopener">WhatsApp me</a>' +
          '<span class="dbh-lm__or">Or send me the details</span>'
        : '';
      modal.innerHTML = card(
        '<span class="dbh-lm__eyebrow">' + esc(cfg.eyebrow) + '</span>' +
        '<h2 class="dbh-lm__title">' + esc(cfg.title) + '</h2>' +
        '<p class="dbh-lm__sub">' + esc(cfg.sub) + '</p>' + waLine +
        '<form novalidate>' + formFields(kind) +
        '<input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none">' +
        '<button type="submit" class="dbh-lm__submit">Send</button>' +
        '<p class="dbh-lm__err js-err">Please fill in your name, email, phone, preferred contact, location and brand.</p>' +
        '</form>');

      wireForm(modal.querySelector('form'), kind, cfg, prefill, function () {
        // Thank-you with the Instagram follow. Most visitors from search
        // have never seen the account; this is the moment they are paying
        // attention.
        modal.innerHTML = card(
          '<span class="dbh-lm__eyebrow">Received</span>' +
          '<h2 class="dbh-lm__title">Got it.</h2>' +
          '<p class="dbh-lm__sub">I\'ll be in touch shortly.</p>' +
          '<p class="dbh-lm__lead">In the meantime, follow Dialed by H on Instagram. That\'s where every new piece shows up first.</p>' +
          '<a class="dbh-lm__link" href="' + IG + '" target="_blank" rel="noopener">Follow @dialedbyh</a>');
        modal.querySelector('.dbh-lm__close').addEventListener('click', close);
      }, close);
    }

    modal.querySelector('.dbh-lm__close').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    ['wheel', 'touchmove'].forEach(function (ev) {
      modal.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true });
    });
    document.body.appendChild(modal);
    current = modal;
    if (FORMS[kind]) setUrl(kind);
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        modal.classList.add('is-open');
        if (window.dbhTracking) window.dbhTracking.open(modal.querySelector('form'), {source:'BUY',sell:'SELL',trade:'TRADE',selltrade:'SELL'}[kind]);
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
    var d = t.dataset;
    open(d.modal, (d.brand || d.model || d.ref) ? { brand: d.brand, model: d.model, ref: d.ref } : null);
  });

  // Get the envelope ready before anyone taps, so it opens without a wait: once the page has finished
  // and gone quiet, or the moment someone reaches for a Concierge link, whichever comes first.
  var readied = {};
  function ready(kind) {
    if (readied[kind]) return;
    readied[kind] = true;
    loadEnvelope().then(function () { window.dbhEnvelope.preload(kind); }).catch(function () {});
  }
  ['pointerover', 'touchstart', 'focusin'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      var t = e.target.closest && e.target.closest('[data-modal]');
      if (t && FORMS[t.dataset.modal]) ready(t.dataset.modal);
    }, { passive: true });
  });
  addEventListener('load', function () {
    var net = navigator.connection;
    if (net && (net.saveData || /2g/.test(net.effectiveType || ''))) return;
    var soon = function () { ready('source'); };
    if (window.requestIdleCallback) requestIdleCallback(soon, { timeout: 4000 }); else setTimeout(soon, 1500);
  });

  // Own URL for each form: /source, /sell and /trade load the homepage with that
  // form open, and #source, #sell, #trade and ?source work on any page. A watch
  // named in the query (?brand=&model=&reference=) prefills the Concierge card.
  function deepLink() {
    var path = (location.pathname || '').replace(/\/+$/, '');
    var q = new URLSearchParams(location.search);
    var watch = { brand: q.get('brand') || '', model: q.get('model') || '', ref: q.get('reference') || '' };
    var hasWatch = !!(watch.brand || watch.model || watch.ref);
    if (path === '/sell' || path === '/trade') return open(path.slice(1));
    if (/^#(sell|trade)$/.test(location.hash)) return open(location.hash.slice(1));
    if (path === '/source' || location.hash === '#source' || q.has('source')) open('source', hasWatch ? watch : null);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', deepLink);
  else deepLink();

  window.DBHModals = { open: open, close: close, popup: popup, wireForm: wireForm, brandOptions: brandOptions, waHref: waHref, FORMS: FORMS, instagram: IG };
})();
