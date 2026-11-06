/* Process stepper. Scrolling draws a line down the centre of the page. When it reaches an object,
   the object turns from grey to colour and that step's text rises line by line, using the same
   motion as the rest of the site (slide-up.js, which must load after this file so it can see
   which steps to leave for us). Plain text stays in the HTML throughout. If this file fails or
   the visitor prefers reduced motion, the page simply shows every step. */
(function () {
  var list = document.querySelector('[data-steps]');
  if (!list || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var steps = [].slice.call(list.children), last = steps.length - 1;
  var nodes = steps.map(function (s) { return s.querySelector('.ps__node'); });
  var seps = steps.map(function (s) { return s.querySelector('.ps__sep'); });
  var fills = steps.map(function (s) { return s.querySelector('.ps__fill'); });
  var tops = [], starts = [], ends = [], endScroll = 1, tip = null, current = -1, revealed = -1, raf = 0, width = innerWidth, fontsIn = false;

  list.classList.add('is-live');
  steps.forEach(function (s) { s.setAttribute('data-state', 'inactive'); s.setAttribute('data-su-hold', ''); });
  steps[0].style.setProperty('--b', '250ms'); // the first step lets the headline land

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function pageTop(el) { return el.getBoundingClientRect().top + window.pageYOffset; }

  // Numbers each piece of text by the row it sits on, so a whole line rises together. Words keep
  // their own masks instead of being wrapped per line, so the text still reflows if the screen
  // turns. Lines can only be counted once the real fonts are in, because they set the line breaks.
  function numberLines(step) {
    var line = -1, row = null;
    [].forEach.call(step.querySelectorAll('.su__c'), function (piece) {
      var y = piece.getBoundingClientRect().top;
      if (row === null || Math.abs(y - row) > 6) { line++; row = y; }
      piece.style.setProperty('--c', line);
    });
  }

  function paint() {
    var on = 0, i;
    for (i = 0; i <= last; i++) {
      if (tip >= tops[i] - 1) on = i; // the line has reached this object
      if (i < last) fills[i].style.transform = 'scaleY(' + clamp((tip - starts[i]) / (ends[i] - starts[i]), 0, 1) + ')';
    }
    if (on !== current) {
      current = on;
      steps.forEach(function (s, n) {
        s.setAttribute('data-state', n < on ? 'completed' : n === on ? 'active' : 'inactive');
        if (n === on) s.setAttribute('aria-current', 'step'); else s.removeAttribute('aria-current');
      });
    }
    if (!fontsIn) return;
    for (i = revealed + 1; i <= on; i++) { numberLines(steps[i]); steps[i].classList.add('su-in'); }
    revealed = Math.max(revealed, on);
  }

  // The line starts empty at the top of the page and has reached the last object when that object
  // is halfway up the screen. It runs on behind each object and its text, which leaves a beat to
  // read before it comes back out underneath. A light ease keeps mouse wheels from looking steppy.
  function frame() {
    raf = 0;
    var target = starts[0] + (tops[last] - starts[0]) * clamp(window.pageYOffset / endScroll, 0, 1);
    tip = tip === null ? target : tip + (target - tip) * 0.22;
    if (Math.abs(target - tip) < 0.4) tip = target;
    paint();
    if (tip !== target) raf = requestAnimationFrame(frame);
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(frame); }

  function measure() {
    tops = nodes.map(pageTop);
    starts = seps.map(function (s) { return s ? pageTop(s) : 0; });
    ends = seps.map(function (s) { return s ? pageTop(s) + s.offsetHeight : 0; });
    var room = document.documentElement.scrollHeight - innerHeight;
    endScroll = clamp(tops[last] - innerHeight * 0.5, 1, Math.max(room, 1));
    schedule();
  }

  function fontsReady() { if (fontsIn) return; fontsIn = true; measure(); }
  if (document.fonts && document.fonts.ready) { document.fonts.ready.then(fontsReady); setTimeout(fontsReady, 500); } else fontsReady();

  addEventListener('scroll', schedule, { passive: true });
  // A phone's address bar changes the height while scrolling, which must not move the line.
  addEventListener('resize', function () { if (innerWidth !== width) { width = innerWidth; measure(); } });
  addEventListener('load', measure);
  if (window.ResizeObserver) new ResizeObserver(measure).observe(list);
  measure();
})();
