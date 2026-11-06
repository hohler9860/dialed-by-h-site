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
  var tops = [], starts = [], ends = [], endScroll = 1, tip = null, current = -1, revealed = -1, raf = 0, width = innerWidth, fontsIn = false, wallHeight = 0, lastFrame = 0;

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
  // is about halfway up the screen. It runs on behind each object and its text, which leaves a beat to
  // read before it comes back out underneath. A light ease keeps mouse wheels from looking steppy.
  function frame(now) {
    var elapsed = lastFrame ? Math.min(now - lastFrame, 100) : 16;
    lastFrame = now;
    raf = 0;
    var target = starts[0] + (tops[last] - starts[0]) * clamp(window.pageYOffset / endScroll, 0, 1);
    tip = tip === null ? target : tip + (target - tip) * (1 - Math.exp(-elapsed / 70)); // same feel at any frame rate
    if (Math.abs(target - tip) < 0.4) tip = target;
    paint();
    if (tip !== target) raf = requestAnimationFrame(frame); else lastFrame = 0;
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(frame); }

  // Sets where each extra Delivery watch ends up. Slots fill outward from the main watch, left then
  // right, then start a new row, so more watches make the stacks taller. With room beside the text
  // they sit either side of it and stay above the footer. Otherwise (phones) they rise beside the
  // line above the main watch, and that line grows to make room for them.
  function layoutBurst() {
    var burst = list.querySelector('[data-burst]');
    if (!burst) return;
    var items = [].slice.call(burst.children), half = document.documentElement.clientWidth / 2, edge = 14;
    var lineIn = seps[last - 1];
    lineIn.style.height = '';
    var main = nodes[last].getBoundingClientRect(), mainY = main.top + main.height / 2;
    var clear = 0, range = document.createRange();
    [steps[last - 1], steps[last]].forEach(function (s) {
      clear = Math.max(clear, s.querySelector('.ps__d').getBoundingClientRect().width / 2);
      range.selectNodeContents(s.querySelector('.ps__t'));
      clear = Math.max(clear, range.getBoundingClientRect().width / 2);
    });
    var height = clamp(half * 0.28, 140, 210), col = height * 0.6, spread = 26, gap = height * 0.1;
    var inner = clear + 24 + col / 2;
    // One column a side up to 6 watches, two up to 12, then three, so the stacks stay tall.
    var wanted = Math.min(3, Math.ceil(items.length / 6));
    var fits = Math.floor((half - edge - clear - 24 + spread) / (col + spread));
    var perSide = Math.min(wanted, fits), rising = fits < Math.min(wanted, 2);
    if (rising) {
      perSide = Math.min(wanted, 2); spread = 8; gap = 10;
      var free = half - edge - main.width / 2;
      if (perSide === 1) { height = Math.min(main.height * 0.8, (free - 8) / 0.6); col = height * 0.6; inner = main.width / 2 + free / 2; }
      else { col = Math.min(64, (free - 16) / 2); height = col / 0.6; inner = main.width / 2 + 8 + col / 2; }
    }
    var columns = perSide * 2, pitch = height + gap, tallest = Math.ceil(items.length / columns) * pitch - gap, centre;
    wallHeight = rising ? tallest - main.height : 0;
    if (rising) {
      var top = lineIn.getBoundingClientRect().top, extra = Math.max(0, tallest - (main.bottom - top));
      if (extra) lineIn.style.height = lineIn.offsetHeight + extra + 'px';
      centre = (top + main.bottom + extra) / 2 - (mainY + extra);
    } else {
      centre = Math.min(0, document.querySelector('footer').getBoundingClientRect().top - mainY - 20 - tallest / 2);
    }
    burst.style.setProperty('--watch', height + 'px');
    items.forEach(function (item, i) {
      var slot = i % columns, row = Math.floor(i / columns), along = Math.floor(slot / 2);
      var inColumn = Math.floor(items.length / columns) + (items.length % columns > slot ? 1 : 0);
      item.style.setProperty('--x', (slot % 2 ? 1 : -1) * (inner + along * (col + spread)) + 'px');
      item.style.setProperty('--y', centre + (row - (inColumn - 1) / 2) * pitch + 'px');
      item.style.setProperty('--d', i * 45 + 'ms');
    });
  }

  function measure() {
    layoutBurst();
    tops = nodes.map(pageTop);
    starts = seps.map(function (s) { return s ? pageTop(s) : 0; });
    ends = seps.map(function (s) { return s ? pageTop(s) + s.offsetHeight : 0; });
    var room = document.documentElement.scrollHeight - innerHeight;
    // On phones the main watch stops a little lower, so the wall above it clears the header.
    var stopAt = clamp(wallHeight + 78, innerHeight * 0.5, innerHeight * 0.62);
    endScroll = clamp(tops[last] - stopAt, 1, Math.max(room, 1));
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
