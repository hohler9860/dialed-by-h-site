/* Sealed envelope overlay. window.dbhEnvelope.open() plays it; close() removes it. Layers move at
   different speeds as it arrives, and with a mouse they keep drifting against each other. The
   markup stays out of the page until it's needed, and the images are decoded before it plays so
   the first frame never pops in. */
(function () {
  var B = '/assets/envelope/', FILES = ['body', 'flap-outside', 'flap-inside', 'seal'];
  var root, raf = 0, tx = 0, ty = 0, x = 0, y = 0, lastFocus, onEnd;
  var decoded;

  function preload() {
    if (decoded) return decoded;
    decoded = Promise.all(FILES.map(function (f) {
      var i = new Image(); i.src = B + f + '.webp';
      return i.decode ? i.decode().catch(function () {}) : Promise.resolve();
    }));
    return decoded;
  }

  function build() {
    var el = document.createElement('div');
    el.className = 'env'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Concierge');
    el.tabIndex = -1;
    el.innerHTML =
      '<div class="env__scrim"></div><div class="env__grain"></div>' +
      '<div class="env__glow-d"><div class="env__glow-p"><div class="env__glow"></div></div></div>' +
      '<div class="env__stage-fade"><div class="env__stage">' +
        '<div class="env__shadow-d"><div class="env__shadow-r"><div class="env__shadow-p"><div class="env__shadow"></div></div></div></div>' +
        '<div class="env__drift"><div class="env__tilt">' +
          '<div class="env__body"><img src="' + B + 'body.webp" alt="" width="1143" height="741"></div>' +
          '<div class="env__cast"><i></i></div>' +
          '<div class="env__flap-r"><div class="env__flap-p"><div class="env__flap">' +
            '<div class="env__face env__face--front"><img class="env__paper" src="' + B + 'flap-outside.webp" alt="" width="1106" height="648"><div class="env__shade"></div></div>' +
            '<div class="env__seal-p"><div class="env__seal-r"><img class="env__seal" src="' + B + 'seal.webp" alt="" width="360" height="351"></div></div>' +
            '<div class="env__face env__face--back"><img class="env__seal-back" src="' + B + 'seal.webp" alt="" width="360" height="351"><img class="env__paper" src="' + B + 'flap-inside.webp" alt="" width="1106" height="648"><div class="env__shade"></div></div>' +
          '</div></div></div>' +
        '</div></div>' +
      '</div></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) { if (!e.target.closest('.env__stage')) close(); });
    return el;
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
      root.classList.remove('is-playing'); root.hidden = false;
      void root.offsetWidth; // so the sequence restarts from the top on every open
      root.classList.add('is-playing');
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
    root.style.removeProperty('--x'); root.style.removeProperty('--y');
    root.hidden = true; root.classList.remove('is-playing');
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    if (onEnd) onEnd();
  }
  window.dbhEnvelope = { open: open, close: close, preload: preload, set pace(v) { (root = root || build()).style.setProperty('--pace', v); }, onClose: function (f) { onEnd = f; } };
})();
