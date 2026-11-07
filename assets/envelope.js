/* Concierge envelope. dbhEnvelope.open(prefill, {onClose}) plays it over the current page and lands
   on the working card, about 1.3 seconds from start to finish. People tap this to send a request,
   so the animation must never feel like a wait: timing changes go in the constants below. The
   opening runs off one number, the flap's angle, and the light and shadows are worked out from it.
   Then the card rises out of the pocket and comes forward to full size as the envelope falls away.
   Tap anywhere during the animation to skip to the form. The form's logic (validation,
   tracking, sending, fallback) is wireForm in assets/modals.js, shared with Sell and Trade, so a
   lead looks the same to the server either way. To change the card's design, edit cardHtml() here
   and the CARD section of envelope.css. Field names must stay as they are. */
(function () {
  var B = '/assets/envelope/', FILES = ['body.webp', 'body-front.webp', 'lip.webp', 'flap-outside.webp', 'flap-inside.webp', 'seal.webp', 'request-to-source.webp', 'wordmark.svg'];
  var OPEN_AT = 230, OPEN_FOR = 620, END_ANGLE = 177, DRIFT = 148;
  var RISE_AT = 620, RISE_FOR = 460, GROW_AT = 800, GROW_FOR = 480, FALL_AT = 740, FALL_FOR = 440, END = GROW_AT + GROW_FOR;
  var SEAT_W = 494, SEAT_TOP = 8, SEAT_H = 350; // the card in the pocket, in artwork units. It really fits inside.
  var WIDE = '(min-width:820px) and (min-height:640px)'; // same as the media query in envelope.css
  // Light from above and in front of the page, as (down the screen, towards the viewer).
  var LIGHT_Y = -0.45, LIGHT_Z = 0.89;
  var root, card, form, lastFocus, testClose, optsClose, pace = 1, running = [], landed = false, skipGuard = false, sent = true, lastKey = null, decoded;

  function preload() {
    if (decoded) return decoded;
    decoded = Promise.all(FILES.map(function (f) {
      var i = new Image(); i.src = B + f;
      return i.decode ? i.decode().catch(function () {}) : Promise.resolve();
    }));
    return decoded;
  }

  function flapShut() {
    return '<div class="env__flap-p"><div class="env__flap env__flap--shut">' +
      '<div class="env__face env__face--front"><img class="env__paper" src="' + B + 'flap-outside.webp" alt="" width="1106" height="648"><div class="env__fold env__fold--top"></div><div class="env__shade"></div></div>' +
      '<div class="env__seal-p"><div class="env__seal-shadow"></div><img class="env__seal" src="' + B + 'seal.webp" alt="" width="360" height="351"></div>' +
    '</div></div>';
  }
  function flapOpen() {
    return '<div class="env__flap-p"><div class="env__flap env__flap--open"><div class="env__face env__face--back">' +
      '<img class="env__seal-back" src="' + B + 'seal.webp" alt="" width="360" height="351"><img class="env__paper" src="' + B + 'flap-inside.webp" alt="" width="1106" height="648"><div class="env__fold"></div><div class="env__shade"></div>' +
    '</div></div></div>';
  }
  function build() {
    var el = document.createElement('div');
    el.className = 'env'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Concierge');
    el.tabIndex = -1; el.setAttribute('data-lenis-prevent', '');
    var wrap = function (inner) { return '<div class="env__fall"><div class="env__drift"><div class="env__rise">' + inner + '</div></div></div>'; };
    el.innerHTML =
      '<div class="env__scrim"></div>' +
      '<div class="env__stage env__stage--back"><div class="env__fall"><div class="env__shadow-d"><div class="env__shadow-r"><div class="env__shadow"></div><div class="env__shadow2"></div></div></div></div>' +
        wrap('<div class="env__tablecast"><i></i></div><img class="env__layer" src="' + B + 'body.webp" alt="" width="1143" height="732"><div class="env__crease"></div>' + flapOpen()) + '</div>' +
      '<div class="env__scroll"></div>' +
      '<div class="env__stage env__stage--front">' +
        wrap('<img class="env__layer" src="' + B + 'lip.webp" alt="" width="571" height="366"><img class="env__layer" src="' + B + 'body-front.webp" alt="" width="1143" height="732"><div class="env__crease env__crease--front"></div><div class="env__cast2"><i></i></div><div class="env__cast"><i></i></div><div class="env__edge"></div>' + flapShut()) + '</div>';
    document.body.appendChild(el);
    // Tap during the animation to skip it. Once landed, tapping outside the card closes it.
    el.addEventListener('pointerdown', function () {
      if (landed) return;
      skipGuard = true; setTimeout(function () { skipGuard = false; }, 450);
      skip();
    });
    el.addEventListener('click', function (e) {
      if (!landed || skipGuard) return;
      if (e.target.closest('.env__close') || !e.target.closest('.ec')) close();
    });
    // The page is in view now, so it mustn't scroll under a finger on iOS, which can ignore the lock.
    el.addEventListener('touchmove', function (e) { if (!e.target.closest('.ec__in')) e.preventDefault(); }, { passive: false });
    return el;
  }

  // ── the card. Placeholders are the labels, as drawn; a small label fades in once a field has a
  // value, so a filled-in form still says what each answer is.
  function field(name, label, hint, attrs, cls) {
    return '<label class="ec__f' + (cls ? ' ' + cls : '') + '"><span class="ec__l">' + label + '</span><input name="' + name + '" placeholder="' + hint + '" aria-label="' + label + '" ' + attrs + '></label>';
  }
  function menu(name, label, cls, options, attrs) {
    return '<label class="ec__f ec__f--half"><span class="ec__l">' + label + '</span><select name="' + name + '" aria-label="' + label + '"' + (cls ? ' class="' + cls + '"' : '') + ' ' + (attrs || '') + '>' + options + '</select></label>';
  }
  function cardHtml(M, prefill) {
    // On a phone the model menu shares a row with the brand, so its hint has to be the short one.
    var modelHint = !matchMedia(WIDE).matches && matchMedia('(min-width:385px)').matches ? 'Model' : 'Model (select brand first)';
    return '<div class="ec__shadow"></div><div class="ec__in">' +
      '<img class="ec__mark" src="' + B + 'wordmark.svg" alt="Dialed by H" width="730" height="52">' +
      '<div class="ec__body">' +
      '<h2 class="ec__title"><img class="ec__hand" src="' + B + 'request-to-source.webp" alt="Request to source" width="877" height="194"></h2>' +
      '<p class="ec__sub">Tell me the piece. I\'ll text you back, usually within a few hours.</p>' +
      '<form class="ec__form" novalidate><div class="ec__grid">' +
        field('name', 'Full name', 'Full name', 'type="text" required autocomplete="name"') +
        field('email', 'Email', 'Email', 'type="email" required autocomplete="email" inputmode="email"') +
        field('phone', 'Mobile phone', 'Mobile phone', 'type="tel" required autocomplete="tel" inputmode="tel"', 'ec__f--half') +
        menu('preferred', 'Preferred contact', '', '<option value="">Preferred contact</option><option>WhatsApp</option><option>iMessage</option><option>Email</option>', 'required') +
        field('location', 'Where are you based?', 'Where are you based? (city / state)', 'type="text" required autocomplete="address-level2"') +
        menu('brand', 'Brand', 'js-brand', '<option value="">Brand</option>' + M.brandOptions(), 'required') +
        menu('model', 'Model', 'js-model', '<option value="">' + modelHint + '</option>', 'disabled data-empty="' + modelHint + '" data-ready="Model"') +
        field('reference', 'Reference number', 'Reference number (if known)', 'type="text"') +
        '<label class="ec__f ec__f--wide"><span class="ec__l">Additional details</span><textarea name="details" rows="1" placeholder="Additional details (condition, box &amp; papers)" aria-label="Additional details"></textarea></label>' +
      '</div>' +
      '<label class="ec__check"><input type="checkbox" name="textok"><span>OK to text me about this request</span></label>' +
      '<input type="text" name="website" class="ec__hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<button type="submit" class="ec__send">Send</button>' +
      '<p class="ec__wa">Or message me on <a href="' + M.waHref(prefill) + '" target="_blank" rel="noopener">WhatsApp</a></p>' +
      '<p class="ec__err js-err" role="alert">Please fill in your name, email, phone, preferred contact, location and brand.</p>' +
      '</form></div></div>' +
      '<button type="button" class="env__close" aria-label="Close"><svg viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><path d="M1 1l11 11M12 1L1 12"/></svg></button>';
  }
  function syncLabels() {
    [].forEach.call(card.querySelectorAll('.ec__f'), function (f) {
      var c = f.querySelector('input,select,textarea');
      f.classList.toggle('has-value', !!(c && c.value));
    });
  }
  function showSent(M) {
    sent = true;
    card.querySelector('.ec__body').innerHTML =
      '<div class="ec__thanks"><h2>Got it.</h2><p class="ec__lede">I\'ll be in touch shortly.</p>' +
      '<p class="ec__note">In the meantime, follow Dialed by H on Instagram. That\'s where every new piece shows up first.</p>' +
      '<a class="ec__send" href="' + M.instagram + '" target="_blank" rel="noopener">Follow @dialedbyh</a></div>';
  }
  function ensureCard(prefill) {
    var M = window.DBHModals, key = JSON.stringify(prefill || {});
    if (card && !sent && key === lastKey) return; // closing and reopening keeps what they've typed
    var scroll = root.querySelector('.env__scroll');
    scroll.innerHTML = '<article class="ec">' + cardHtml(M, prefill) + '</article>';
    card = scroll.firstChild; form = card.querySelector('form'); sent = false; lastKey = key;
    M.wireForm(form, 'source', M.FORMS.source, prefill, function () { showSent(M); card.querySelector('.ec__in').scrollTop = 0; }, close);
    var refresh = function () {
      syncLabels();
      [].forEach.call(form.querySelectorAll('.is-missing'), function (f) { var c = f.querySelector('input,select'); if (c && c.value) f.classList.remove('is-missing'); });
    };
    form.addEventListener('input', refresh); form.addEventListener('change', refresh);
    // Runs after wireForm's own check: if that stopped the send, mark what's missing.
    form.addEventListener('submit', function () {
      if (getComputedStyle(form.querySelector('.js-err')).display === 'none') return;
      [].forEach.call(form.querySelectorAll('[required]'), function (c) { if (!c.value.trim()) c.closest('.ec__f').classList.add('is-missing'); });
    });
    syncLabels();
    if (window.dbhTracking) window.dbhTracking.open(form, 'BUY');
  }

  // Timing curves.
  function bezier(x1, y1, x2, y2) {
    var at = function (t, a, b) { var u = 1 - t; return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t; };
    return function (p) {
      var lo = 0, hi = 1, t = p;
      for (var i = 0; i < 24; i++) { if (at(t, x1, x2) < p) lo = t; else hi = t; t = (lo + hi) / 2; }
      return at(t, y1, y2);
    };
  }
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var rad = function (d) { return d * Math.PI / 180; };
  var flapEase = bezier(0.56, 0.01, 0.2, 1), moveEase = bezier(0.45, 0, 0.2, 1), fallEase = bezier(0.5, 0, 0.8, 0.45);

  function playOpening(m) {
    var N = 72, q = function (s) { return root.querySelector(s); }, qq = function (s) { return [].slice.call(root.querySelectorAll(s)); };
    var angle = function (p) { return END_ANGLE * flapEase(p); };
    var timing = { duration: OPEN_FOR * pace, delay: OPEN_AT * pace, fill: 'both', easing: 'linear' };
    var track = function (el, fn) {
      var frames = [];
      for (var i = 0; i <= N; i++) { var p = i / N, f = fn(angle(p), p); f.offset = p; frames.push(f); }
      (Array.isArray(el) ? el : [el]).forEach(function (e) { running.push(e.animate(frames, timing)); });
    };
    // Where the flap's shadow lands, as a share of its length. Past about 117 degrees it's on the table instead.
    var reach = function (a) { return Math.cos(rad(a)) - (LIGHT_Y / LIGHT_Z) * Math.sin(rad(a)); };
    // Darkness of a face from how directly it faces the light, 0 when fully lit.
    var dark = function (facing, strength) { return clamp((LIGHT_Z - clamp(facing, 0, 1)) / LIGHT_Z, 0, 1) * strength; };

    track(qq('.env__flap'), function (a) { return { transform: 'perspective(calc(var(--u)*2400)) rotateX(' + a.toFixed(3) + 'deg)' }; });
    track(q('.env__face--front .env__shade'), function (a) { return { opacity: dark(Math.cos(rad(a)) * LIGHT_Z - Math.sin(rad(a)) * LIGHT_Y, 0.3) }; });
    track(q('.env__face--back .env__shade'), function (a) { return { opacity: dark(Math.sin(rad(a)) * LIGHT_Y - Math.cos(rad(a)) * LIGHT_Z, 0.3) }; });
    track(q('.env__cast'), function (a) { return { opacity: 0.3 * clamp(1 - a / 24, 0, 1), transform: 'scaleY(' + Math.max(reach(a), 0.001).toFixed(4) + ')' }; });
    // The further the paper lifts, the softer and fainter its shadow, as with any real light.
    track(q('.env__cast2'), function (a) {
      var lift = a < 45 ? 0.12 + 0.03 * Math.sin(rad(a * 2)) : 0.15 * clamp((100 - a) / 55, 0, 1);
      return { opacity: lift, transform: 'scaleY(' + Math.max(reach(a), 0.001).toFixed(4) + ')' };
    });
    track(q('.env__tablecast'), function (a) { return { opacity: 0.22 * clamp((a - 116) / 61, 0, 1), transform: 'scaleY(' + Math.max(-reach(a), 0.001).toFixed(4) + ')' }; });
    track(qq('.env__crease'), function (a) { return { opacity: clamp((a - 60) / 40, 0, 1) }; });
    track(q('.env__edge'), function (a) { return { opacity: clamp(1 - Math.abs(a - 90) / 6, 0, 1) }; });
    track(qq('.env__drift'), function (a, p) { return { transform: 'translate3d(0,calc(var(--u)*' + (DRIFT * flapEase(p)).toFixed(2) + '),0)' }; });
    // The shadow follows a beat late. That lag is the parallax.
    track(q('.env__shadow-d'), function (a, p) { return { transform: 'translate3d(0,calc(var(--u)*' + (DRIFT * flapEase(clamp((p - 0.07) / 0.93, 0, 1))).toFixed(2) + '),0)' }; });

    // Swap sides at the frame the flap is exactly edge-on.
    var lo = 0, hi = 1, mid;
    for (var i = 0; i < 30; i++) { mid = (lo + hi) / 2; if (angle(mid) < 90) lo = mid; else hi = mid; }
    var swap = function (el, from, to) { running.push(el.animate([{ visibility: from, offset: 0 }, { visibility: from, offset: mid }, { visibility: to, offset: Math.min(mid + 0.0005, 1) }, { visibility: to, offset: 1 }], timing)); };
    swap(q('.env__flap--shut'), 'visible', 'hidden'); swap(q('.env__flap--open'), 'hidden', 'visible');

    // ── the card. One path from the pocket to where it rests. ──
    var S = m.S, F = m.F, u = m.u, s0 = SEAT_W * u / F.width, seatX = S.left + (S.width - SEAT_W * u) / 2, seatY = S.top + SEAT_TOP * u;
    var R = (SEAT_H + 30) * u, flapTop = 330 * u, fallBy = innerHeight - (S.top + DRIFT * u - flapTop) + 60;
    var driftAt = function (t) { return DRIFT * u * flapEase(clamp((t - OPEN_AT) / OPEN_FOR, 0, 1)); };
    var fallAt = function (t) { return fallBy * fallEase(clamp((t - FALL_AT) / FALL_FOR, 0, 1)); };
    var stateAt = function (t) {
      var e1 = moveEase(clamp((t - RISE_AT) / RISE_FOR, 0, 1)), e2 = moveEase(clamp((t - GROW_AT) / GROW_FOR, 0, 1));
      var yEnv = seatY + driftAt(t) - R * e1;
      return { x: seatX + (F.left - seatX) * e2, y: yEnv + (F.top - yEnv) * e2, s: s0 + (1 - s0) * e2, e2: e2 };
    };
    var frames = [], shadow = [], M = 120, TOTAL = END - OPEN_AT, swapAt = null;
    for (var k = 0; k <= M; k++) {
      var off = k / M, t = OPEN_AT + TOTAL * off, st = stateAt(t);
      var f = { offset: off, transform: 'translate3d(' + (st.x - F.left).toFixed(2) + 'px,' + (st.y - F.top).toFixed(2) + 'px,0) scale(' + st.s.toFixed(5) + ')' };
      if (m.stack) {
        // A phone's card is much longer than the envelope, so it's trimmed at the envelope's bottom edge until that has dropped away.
        var bottom = S.top + S.height - 6 * u + driftAt(t) + fallAt(t);
        f.clipPath = 'inset(-80px -80px ' + Math.max(-80, F.height - (bottom - st.y) / st.s).toFixed(1) + 'px -80px)';
      } else if (swapAt === null && st.y + st.s * F.height < S.top + driftAt(t) + fallAt(t)) swapAt = off;
      frames.push(f); shadow.push({ offset: off, opacity: st.e2 });
    }
    var cardTiming = { duration: TOTAL * pace, delay: OPEN_AT * pace, fill: 'both', easing: 'linear' };
    var cardAnim = card.animate(frames, cardTiming);
    running.push(cardAnim, card.querySelector('.ec__shadow').animate(shadow, cardTiming));
    // In the pocket only once the flap starts to lift. Until then the sealed envelope is empty to the eye.
    running.push(card.animate([{ visibility: 'hidden', offset: 0 }, { visibility: 'hidden', offset: 0.999 }, { visibility: 'visible', offset: 1 }], { duration: OPEN_AT * pace, fill: 'backwards' }));
    // Once it's clear of the envelope, the card comes in front of it.
    if (swapAt !== null) running.push(q('.env__scroll').animate([{ zIndex: 3, offset: 0 }, { zIndex: 3, offset: swapAt }, { zIndex: 5, offset: Math.min(swapAt + 0.001, 1) }, { zIndex: 5, offset: 1 }], cardTiming));
    var fallTiming = { duration: FALL_FOR * pace, delay: FALL_AT * pace, fill: 'both', easing: 'linear' }, fall = [];
    for (var j = 0; j <= 40; j++) fall.push({ offset: j / 40, transform: 'translate3d(0,' + (fallBy * fallEase(j / 40)).toFixed(2) + 'px,0)' });
    qq('.env__fall').forEach(function (el) { running.push(el.animate(fall, fallTiming)); });
    cardAnim.finished.then(land).catch(function () {});
  }

  function land() {
    if (landed) return;
    landed = true;
    running.forEach(function (a) { a.cancel(); }); running = [];
    root.classList.add('is-landed');
    if (matchMedia(WIDE + ' and (hover:hover)').matches && !sent) {
      var first = card.querySelector('input[name="name"]');
      if (first && !first.value) first.focus({ preventScroll: true });
    }
  }
  function skip() {
    if (landed) return;
    root.getAnimations({ subtree: true }).forEach(function (a) { try { a.finish(); } catch (e) {} });
    land();
  }

  // Rotating a phone or resizing mid-animation would leave the path aiming at the old layout, so finish it.
  var openWidth = 0;
  function onResize() { if (!landed && innerWidth !== openWidth) skip(); }
  function onKey(e) {
    if (e.key === 'Escape') return close();
    if (e.key !== 'Tab') return;
    var items = [].filter.call(root.querySelectorAll('input,select,textarea,button,a[href]'), function (n) { return !n.disabled && n.tabIndex !== -1 && n.offsetParent !== null; });
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1], at = document.activeElement;
    if (e.shiftKey && (at === first || at === root)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
  }

  function open(prefill, opts) {
    if (root && !root.hidden) return Promise.resolve();
    root = root || build();
    optsClose = opts && opts.onClose;
    lastFocus = document.activeElement;
    // On a slow connection don't make anyone wait or watch half an envelope: go straight to the form.
    return Promise.race([preload().then(function () { return true; }), new Promise(function (r) { setTimeout(r, 450, false); })]).then(function (ready) {
      var still = !ready || matchMedia('(prefers-reduced-motion: reduce)').matches;
      ensureCard(prefill);
      root.style.setProperty('--pace', pace);
      root.classList.remove('is-playing', 'is-landed', 'is-closing'); root.hidden = false; landed = false;
      card.querySelector('.ec__in').scrollTop = 0;
      var m = { S: root.querySelector('.env__stage--front').getBoundingClientRect(), F: card.getBoundingClientRect(), stack: !matchMedia(WIDE).matches };
      m.u = m.S.width / 572;
      void root.offsetWidth; // so the sequence restarts from the top on every open
      root.classList.add('is-playing');
      // Locking the scroll removes the scrollbar on some computers, so hold its place: the page is in view.
      var html = document.documentElement, bar = innerWidth - html.clientWidth;
      html.style.overflow = 'hidden'; if (bar > 0) html.style.paddingRight = bar + 'px';
      root.focus({ preventScroll: true });
      addEventListener('keydown', onKey);
      openWidth = innerWidth; addEventListener('resize', onResize);
      if (still) return land();
      playOpening(m);
    });
  }
  function close() {
    if (!root || root.hidden) return;
    removeEventListener('keydown', onKey); removeEventListener('resize', onResize);
    running.forEach(function (a) { a.cancel(); }); running = [];
    root.classList.add('is-closing');
    document.documentElement.style.overflow = ''; document.documentElement.style.paddingRight = '';
    var el = root;
    setTimeout(function () { if (el.classList.contains('is-closing')) { el.hidden = true; el.classList.remove('is-playing', 'is-landed', 'is-closing'); } }, 230);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    if (optsClose) optsClose();
    if (testClose) testClose();
  }
  window.dbhEnvelope = { open: open, close: close, preload: preload, skip: skip, set pace(v) { pace = v; }, onClose: function (f) { testClose = f; } };
})();
