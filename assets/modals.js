/* Prime Time Miami — popup forms (Sell / Trade / Source) + Buy DM prompt.
   No backend: submitting opens WhatsApp with the request prefilled. */
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

  var fieldIdx = 0;
  function field(label, inner, full) {
    fieldIdx += 1;
    return '<div style="transition-delay:' + (150 + fieldIdx * 55) + 'ms" class="pt-field' + (full ? ' pt-field--full' : '') + '"><label>' + label + '</label>' + inner + '</div>';
  }
  function baseFields() {
    fieldIdx = 0;
    var brands = Object.keys(MODELS).map(function (b) { return '<option value="' + b + '">' + b + '</option>'; }).join('');
    return (
      field('Full name', '<input type="text" name="name" autocomplete="name">') +
      field('Email', '<input type="email" name="email" autocomplete="email">') +
      field('Mobile / WhatsApp', '<input type="tel" name="phone" autocomplete="tel" placeholder="+1 ...">') +
      field('Preferred contact', '<select name="preferred"><option value="">Select platform</option><option>WhatsApp</option><option>Text message</option><option>Email</option><option>Instagram DM</option></select>') +
      field('Brand', '<select name="brand" class="js-brand"><option value="">Select brand</option>' + brands + '</select>') +
      field('Model', '<select name="model" class="js-model" disabled><option value="">Select brand first</option></select>') +
      field('Reference (if known)', '<input type="text" name="reference" placeholder="e.g. 126500LN">')
    );
  }
  function detailsField(full) {
    return field('Additional details', '<textarea name="details" placeholder="Condition, box &amp; papers, budget, etc."></textarea>', full);
  }

  var FORMS = {
    sell: {
      title: 'Request to sell.',
      sub: "Quick form. I'll text you back.",
      fields: baseFields() +
        field('Asking price', '<input type="text" name="price" placeholder="How much are you looking to get?">') +
        field('Reason for selling', '<input type="text" name="reason" placeholder="Upgrading, funding a purchase, etc.">', true) +
        detailsField(true)
    },
    trade: {
      title: 'Request to trade.',
      sub: "Quick form. I'll text you back.",
      fields: baseFields() +
        field('Asking price', '<input type="text" name="price" placeholder="How much are you looking to get?">') +
        field('Reason for trading', '<input type="text" name="reason" placeholder="Upgrading, switching styles, etc.">', true) +
        detailsField(true)
    },
    source: {
      title: 'Request to source.',
      sub: "Tell us what you're after. I'll text you back.",
      fields: baseFields() + detailsField(true)
    }
  };

  var root = document.getElementById('pt-modal-root');
  var backdrop = document.querySelector('.js-pt-backdrop');
  var current = null;

  function close() {
    if (!current) return;
    current.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    var el = current;
    setTimeout(function () { el.remove(); }, 320);
    current = null;
  }

  function charFade(el) {
    var words = el.textContent.split(' ');
    el.textContent = '';
    words.forEach(function (word, wi) {
      if (wi > 0) el.appendChild(document.createTextNode(' '));
      var w = document.createElement('span');
      w.style.display = 'inline-block';
      w.style.whiteSpace = 'nowrap';
      for (var i = 0; i < word.length; i++) {
        var s = document.createElement('span');
        s.textContent = word[i];
        s.style.display = 'inline-block';
        s.style.opacity = '0';
        s.style.animation = 'hsstFadeIn 0.23s linear ' + (0.35 + Math.random() * 0.5).toFixed(3) + 's forwards';
        w.appendChild(s);
      }
      el.appendChild(w);
    });
  }

  function open(kind) {
    close();
    var modal = document.createElement('div');
    modal.className = 'pt-modal';
    var meta = '';

    if (kind === 'buy') {
      modal.innerHTML =
        '<button type="button" class="pt-close" aria-label="Close">&#10005;</button>' +
        '<div class="pm-wrap"><div class="pm-left">' + meta +
        '<h3 class="pm-title"><span>Looking</span><span>to buy?</span></h3>' +
        '<p class="pm-sub" data-pm-scramble>Fastest way is a DM. Tell us what you\'re after.</p>' +
        '</div><div class="pt-dm">' +
        '<a href="' + WA + '?text=' + encodeURIComponent("Hi Henry — I'm looking to buy a watch.") + '" target="_blank" rel="noopener">WhatsApp me</a>' +
        '<a href="' + IG + '" target="_blank" rel="noopener">DM on Instagram</a>' +
        '</div></div>';
    } else {
      var cfg = FORMS[kind];
      if (!cfg) return;
      var tparts = cfg.title.split(' ');
      var line1 = tparts[0];
      var line2 = tparts.slice(1).join(' ');
      modal.innerHTML =
        '<button type="button" class="pt-close" aria-label="Close">&#10005;</button>' +
        '<div class="pm-wrap"><div class="pm-left">' + meta +
        '<h3 class="pm-title"><span>' + line1 + '</span><span>' + line2 + '</span></h3>' +
        '<p class="pm-sub" data-pm-scramble>' + cfg.sub + '</p>' +
        '</div>' +
        '<form novalidate><div class="pt-grid">' + cfg.fields +
        '<label class="pm-check pt-field pt-field--full" style="transition-delay:600ms"><input type="checkbox" name="textok"> OK to text me about this request</label>' +
        '<button type="submit" class="pt-submit">Send request</button></div></form></div>';

      var brand = modal.querySelector('.js-brand');
      var model = modal.querySelector('.js-model');
      brand.addEventListener('change', function () {
        var list = MODELS[brand.value] || [];
        model.innerHTML = brand.value
          ? '<option value="">Select model</option>' + list.map(function (m) { return '<option value="' + m + '">' + m + '</option>'; }).join('')
          : '<option value="">Select brand first</option>';
        model.disabled = !brand.value;
      });

      modal.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(e.target);
        var get = function (k) { return (fd.get(k) || '').toString().trim(); };
        var detailParts = [];
        [['Reference', 'reference'], ['Asking price', 'price'], ['Reason', 'reason'], ['Details', 'details'], ['Phone', 'phone'], ['Preferred contact', 'preferred']].forEach(function (p) {
          if (get(p[1])) detailParts.push(p[0] + ': ' + get(p[1]));
        });
        detailParts.push('OK to text: ' + (fd.get('textok') ? 'YES' : 'NO'));
        var typeMap = { sell: 'SELL', trade: 'TRADE', source: 'BUY' };
        var btn = e.target.querySelector('.pt-submit');
        btn.disabled = true; btn.textContent = 'Sending\u2026';
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
            watchDetails: detailParts.join(' | ')
          })
        }).then(function (r) {
          if (!r.ok) throw new Error(r.status);
          btn.textContent = 'Request received \u2713';
          setTimeout(close, 1200);
        }).catch(function () {
          var lines = [cfg.title + ' — Dialed By H'];
          var labels = { name: 'Name', email: 'Email', brand: 'Brand', model: 'Model', reference: 'Reference', price: 'Asking price', reason: 'Reason', details: 'Details' };
          Object.keys(labels).forEach(function (k) { if (get(k)) lines.push(labels[k] + ': ' + get(k)); });
          window.open(WA + '?text=' + encodeURIComponent(lines.join('\n')), '_blank');
          close();
        });
      });
    }

    modal.querySelector('.pt-close').addEventListener('click', close);
    root.appendChild(modal);
    current = modal;
    // display-type char fade on the big serif title
    modal.querySelectorAll('.pm-title span').forEach(charFade);
    // scramble on the small mono lines
    if (window.ScrambleText) {
      modal.querySelectorAll('[data-pm-scramble]').forEach(function (el, i) {
        new window.ScrambleText(el, { startDelay: 250 + i * 150, letterDelay: 26 });
      });
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { modal.classList.add('is-open'); });
    });
  }

  if (backdrop) backdrop.addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-modal]');
    if (!t) return;
    e.preventDefault();
    open(t.getAttribute('data-modal'));
  });
})();
