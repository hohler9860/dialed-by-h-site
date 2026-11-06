/* Process stepper. Scrolling draws one line down the page, from the first icon to the
   last. When the line reaches a step its icon turns on and its words slide up, using
   the same motion as the rest of the site (slide-up.js, which must load after this file
   so it can see which steps to leave for us). Plain text stays in the HTML throughout.
   If this file fails or the visitor prefers reduced motion, the page shows every step. */
(function () {
  var list = document.querySelector('[data-steps]');
  if (!list || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var steps = [].slice.call(list.children), last = steps.length - 1;
  var nodes = steps.map(function (s) { return s.querySelector('.ps__node'); });
  var fills = steps.map(function (s) { return s.querySelector('.ps__fill'); });
  var centers = [], radius = 0, endScroll = 1, tip = null, current = -1, revealed = -1, raf = 0, width = innerWidth;

  list.classList.add('is-live');
  steps.forEach(function (s) { s.setAttribute('data-state', 'inactive'); s.setAttribute('data-su-hold', ''); });
  steps[0].style.setProperty('--b', '250ms'); // the first step lets the headline land

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function paint() {
    var on = 0, i;
    for (i = 0; i <= last; i++) {
      if (tip >= centers[i] - radius) on = i; // the line has touched this icon
      if (i < last) fills[i].style.transform = 'scaleY(' + clamp((tip - centers[i]) / (centers[i + 1] - centers[i]), 0, 1) + ')';
    }
    if (on !== current) {
      current = on;
      steps.forEach(function (s, n) {
        s.setAttribute('data-state', n < on ? 'completed' : n === on ? 'active' : 'inactive');
        if (n === on) s.setAttribute('aria-current', 'step'); else s.removeAttribute('aria-current');
      });
    }
    for (i = revealed + 1; i <= on; i++) steps[i].classList.add('su-in');
    revealed = Math.max(revealed, on);
  }

  // The line starts empty at the top of the page and is full when the last icon sits
  // just past the middle of the screen. A light ease keeps mouse wheels from looking steppy.
  function frame() {
    raf = 0;
    var target = centers[0] + (centers[last] - centers[0]) * clamp(window.pageYOffset / endScroll, 0, 1);
    tip = tip === null ? target : tip + (target - tip) * 0.22;
    if (Math.abs(target - tip) < 0.4) tip = target;
    paint();
    if (tip !== target) raf = requestAnimationFrame(frame);
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(frame); }

  function measure() {
    var y = window.pageYOffset;
    centers = nodes.map(function (n) { var r = n.getBoundingClientRect(); radius = r.height / 2; return r.top + y + radius; });
    var room = document.documentElement.scrollHeight - innerHeight;
    endScroll = clamp(centers[last] - innerHeight * 0.58, 1, Math.max(room, 1));
    schedule();
  }

  addEventListener('scroll', schedule, { passive: true });
  // A phone's address bar changes the height while scrolling, which must not move the line.
  addEventListener('resize', function () { if (innerWidth !== width) { width = innerWidth; measure(); } });
  addEventListener('load', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  if (window.ResizeObserver) new ResizeObserver(measure).observe(list);
  measure();
})();
