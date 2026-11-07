/* Sealed envelope overlay. window.dbhEnvelope.open() plays it; close() removes it. The opening runs
   off one number, the flap's angle, and everything else is worked out from it: the light on each
   face and where its shadow falls. So they can't drift apart. The markup stays out of the page
   until it's needed, and images are decoded first so the opening frame never pops in. */
(function () {
  var B = '/assets/envelope/', FILES = ['body', 'flap-outside', 'flap-inside', 'seal', 'grain'];
  var OPEN_AT = 1450, OPEN_FOR = 1750, END_ANGLE = 177, DRIFT = 148;
  // Light from above and in front of the page, as (down the screen, towards the viewer).
  var LIGHT_Y = -0.45, LIGHT_Z = 0.89;
  var root, raf = 0, tx = 0, ty = 0, x = 0, y = 0, lastFocus, onEnd, pace = 1, running = [];
  var decoded;

  function preload() {
    if (decoded) return decoded;
    decoded = Promise.all(FILES.map(function (f) {
      var i = new Image(); i.src = B + f + (f === 'grain' ? '.png' : '.webp');
      return i.decode ? i.decode().catch(function () {}) : Promise.resolve();
    }));
    return decoded;
  }

  function build() {
    var el = document.createElement('div');
    el.className = 'env'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Concierge');
    el.tabIndex = -1;
    var seal = 'src="' + B + 'seal.webp" alt="" width="360" height="351"';
    el.innerHTML =
      '<div class="env__scrim"></div><div class="env__grain"></div>' +
      '<div class="env__glow-d"><div class="env__glow-p"><div class="env__glow"></div></div></div>' +
      '<div class="env__stage-fade"><div class="env__stage">' +
        '<div class="env__shadow-d"><div class="env__shadow-r"><div class="env__shadow-p"><div class="env__shadow"></div><div class="env__shadow2"></div></div></div></div>' +
        '<div class="env__drift"><div class="env__rise"><div class="env__tilt">' +
          '<div class="env__tablecast"><i></i></div>' +
          '<div class="env__body"><img src="' + B + 'body.webp" alt="" width="1143" height="732"></div>' +
          '<div class="env__crease"></div><div class="env__cast2"><i></i></div><div class="env__cast"><i></i></div><div class="env__edge"></div>' +
          '<div class="env__flap-p"><div class="env__flap">' +
            '<div class="env__face env__face--front"><img class="env__paper" src="' + B + 'flap-outside.webp" alt="" width="1106" height="648"><div class="env__fold env__fold--top"></div><div class="env__shade"></div></div>' +
            '<div class="env__seal-p"><div class="env__seal-shadow"></div><img class="env__seal" ' + seal + '></div>' +
            '<div class="env__face env__face--back"><img class="env__seal-back" ' + seal + '><img class="env__paper" src="' + B + 'flap-inside.webp" alt="" width="1106" height="648"><div class="env__fold"></div><div class="env__shade"></div></div>' +
          '</div></div>' +
        '</div></div></div>' +
      '</div></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) { if (!e.target.closest('.env__stage')) close(); });
    return el;
  }

  // Timing for the turn: a slow start while the wax lets go of the paper, then a soft landing.
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

  function playOpening() {
    var ease = bezier(0.56, 0.01, 0.2, 1), N = 72, q = function (s) { return root.querySelector(s); };
    var angle = function (p) { return END_ANGLE * ease(p); };
    var timing = { duration: OPEN_FOR * pace, delay: OPEN_AT * pace, fill: 'both', easing: 'linear' };
    var track = function (el, fn) {
      var frames = [];
      for (var i = 0; i <= N; i++) { var p = i / N, f = fn(angle(p), p); f.offset = p; frames.push(f); }
      running.push(el.animate(frames, timing));
    };
    // Where the flap's shadow lands, as a share of its length. Past about 117 degrees it's on the table instead.
    var reach = function (a) { return Math.cos(rad(a)) - (LIGHT_Y / LIGHT_Z) * Math.sin(rad(a)); };
    // Darkness of a face from how directly it faces the light, 0 when fully lit.
    var dark = function (facing, strength) { return clamp((LIGHT_Z - clamp(facing, 0, 1)) / LIGHT_Z, 0, 1) * strength; };

    track(q('.env__flap'), function (a) { return { transform: 'rotateX(' + a.toFixed(3) + 'deg)' }; });
    track(q('.env__face--front .env__shade'), function (a) { return { opacity: dark(Math.cos(rad(a)) * LIGHT_Z - Math.sin(rad(a)) * LIGHT_Y, 0.3) }; });
    track(q('.env__face--back .env__shade'), function (a) { return { opacity: dark(Math.sin(rad(a)) * LIGHT_Y - Math.cos(rad(a)) * LIGHT_Z, 0.3) }; });
    track(q('.env__cast'), function (a) { return { opacity: 0.3 * clamp(1 - a / 24, 0, 1), transform: 'translateZ(.5px) scaleY(' + Math.max(reach(a), 0.001).toFixed(4) + ')' }; });
    track(q('.env__cast2'), function (a) {
      // The further the paper lifts, the softer and fainter its shadow, as with any real light.
      var lift = a < 45 ? 0.12 + 0.03 * Math.sin(rad(a * 2)) : 0.15 * clamp((100 - a) / 55, 0, 1);
      return { opacity: lift, transform: 'translateZ(.5px) scaleY(' + Math.max(reach(a), 0.001).toFixed(4) + ')' };
    });
    track(q('.env__tablecast'), function (a) { return { opacity: 0.5 * clamp((a - 116) / 61, 0, 1), transform: 'scaleY(' + Math.max(-reach(a), 0.001).toFixed(4) + ')' }; });
    track(q('.env__crease'), function (a) { return { opacity: clamp((a - 60) / 40, 0, 1) }; });
    track(q('.env__edge'), function (a) { return { opacity: clamp(1 - Math.abs(a - 90) / 6, 0, 1) }; });
    track(q('.env__drift'), function (a, p) { return { transform: 'translate3d(0,calc(var(--u)*' + (DRIFT * ease(p)).toFixed(2) + '),0)' }; });
    // The shadow follows a beat late and the light hardly moves. That lag is the parallax.
    track(q('.env__shadow-d'), function (a, p) { return { transform: 'translate3d(0,calc(var(--u)*' + (DRIFT * ease(clamp((p - 0.07) / 0.93, 0, 1))).toFixed(2) + '),0)' }; });
    track(q('.env__glow-d'), function (a, p) { return { transform: 'translate3d(0,calc(var(--u)*' + (36 * ease(p)).toFixed(2) + '),0)' }; });

    // Swap faces at the frame the flap is exactly edge-on.
    var lo = 0, hi = 1, mid;
    for (var i = 0; i < 30; i++) { mid = (lo + hi) / 2; if (angle(mid) < 90) lo = mid; else hi = mid; }
    var swap = function (el, from, to) { running.push(el.animate([{ opacity: from, offset: 0 }, { opacity: from, offset: mid }, { opacity: to, offset: Math.min(mid + 0.0005, 1) }, { opacity: to, offset: 1 }], timing)); };
    swap(q('.env__face--front'), 1, 0); swap(q('.env__seal-p'), 1, 0); swap(q('.env__face--back'), 0, 1);
  }

  // Desktop only: the layers keep drifting against each other with the mouse. Eased, so it never jerks.
  function follow() {
    raf = 0;
    x += (tx - x) * .08; y += (ty - y) * .08;
    root.style.setProperty('--x', x.toFixed(4)); root.style.setProperty('--y', y.toFixed(4));
    if (Math.abs(tx - x) > .001 || Math.abs(ty - y) > .001) raf = requestAnimationFrame(follow);
  }
  function onMove(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    tx = (e.clientX / innerWidth - .5) * 2; ty = (e.clientY / innerHeight - .5) * 2;
    if (!raf) raf = requestAnimationFrame(follow);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function open() {
    if (root && !root.hidden) return Promise.resolve();
    root = root || build();
    lastFocus = document.activeElement;
    return Promise.race([preload(), new Promise(function (r) { setTimeout(r, 450); })]).then(function () {
      var still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      root.style.setProperty('--pace', pace);
      root.classList.remove('is-playing', 'is-instant'); root.hidden = false;
      void root.offsetWidth; // so the sequence restarts from the top on every open
      root.classList.add('is-playing');
      if (still || !root.animate) root.classList.add('is-instant'); else playOpening();
      document.documentElement.style.overflow = 'hidden';
      root.focus({ preventScroll: true });
      addEventListener('keydown', onKey);
      if (matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) addEventListener('pointermove', onMove, { passive: true });
    });
  }
  function close() {
    if (!root || root.hidden) return;
    removeEventListener('keydown', onKey); removeEventListener('pointermove', onMove);
    cancelAnimationFrame(raf); raf = 0; tx = ty = x = y = 0;
    running.forEach(function (a) { a.cancel(); }); running = [];
    root.style.removeProperty('--x'); root.style.removeProperty('--y');
    root.hidden = true; root.classList.remove('is-playing', 'is-instant');
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    if (onEnd) onEnd();
  }
  window.dbhEnvelope = { open: open, close: close, preload: preload, set pace(v) { pace = v; }, onClose: function (f) { onEnd = f; } };
})();
