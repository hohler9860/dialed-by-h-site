/* ScrambleText — decode effect for small labels.
   Per-character timeline: char i starts at i*letterDelay; for one window
   (2 phases = 4*letterDelay) it shows random glyphs (white first phase,
   grey second), then snaps to the real letter. Spaces keep their index
   but never animate. Starts only when fonts are ready AND the element
   is in view. Big display type should NOT use this — it fades. */
(function () {
  var CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*+-=?/<>[]{}';
  var TICK = 40;
  function palette(el) {
    var c = getComputedStyle(el).color.match(/\d+/g) || [0, 0, 0];
    var lum = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    return lum > 128 ? ['#ffffff', '#8a8a85'] : ['#2b2b28', '#8a8a85'];
  }

  var registry = [];
  var rafId = null;

  function loop(now) {
    var alive = false;
    for (var k = registry.length - 1; k >= 0; k--) {
      var s = registry[k];
      if (!s) continue;
      try {
        if (s.update(now)) alive = true;
      } catch (e) {
        // never let one bad element freeze every scramble on the page
        try { s.el.textContent = s.text; } catch (_) {}
        registry.splice(k, 1);
      }
    }
    rafId = alive ? requestAnimationFrame(loop) : null;
  }
  function register(s) {
    if (registry.indexOf(s) < 0) registry.push(s);
    if (rafId === null) rafId = requestAnimationFrame(loop);
  }
  function unregister(s) {
    var i = registry.indexOf(s);
    if (i >= 0) registry.splice(i, 1);
  }

  function ScrambleText(el, opts) {
    opts = opts || {};
    this.el = el;
    this.text = opts.text != null ? opts.text : el.textContent.replace(/\s+/g, ' ').trim();
    this.startDelay = opts.startDelay || 0;
    this.letterDelay = opts.letterDelay || 80;
    this.phase = 2 * this.letterDelay;
    this.window = 2 * this.phase;
    this.settled = false;
    this.running = false;
    this.fontsReady = false;
    this.inView = false;

    el.style.opacity = '0';
    el.textContent = '';

    var self = this;
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve())
      .then(function () { self.fontsReady = true; self.maybeStart(); });

    if ('IntersectionObserver' in window) {
      this.io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            self.inView = true;
            self.io.disconnect();
            self.maybeStart();
          }
        }
      }, { threshold: 0.1 });
      this.io.observe(el);
    } else {
      this.inView = true;
    }
  }

  ScrambleText.prototype.maybeStart = function () {
    if (this.running || this.settled || !this.fontsReady || !this.inView) return;
    this.running = true;
    this.startAt = performance.now() + this.startDelay;
    this.lastTick = -1;
    this.glyphs = [];
    this.duration = (this.text.length - 1) * this.letterDelay + this.window;
    this.el.style.opacity = '';
    register(this);
  };

  ScrambleText.prototype.update = function (now) {
    var t = now - this.startAt;
    if (t < 0) return true;
    var tick = Math.floor(t / TICK);
    if (tick === this.lastTick && t <= this.duration) return true;
    this.lastTick = tick;

    if (t > this.duration) {
      this.el.replaceChildren();
      this.el.textContent = this.text;
      this.settled = true;
      this.running = false;
      unregister(this);
      return false;
    }

    var frag = document.createDocumentFragment();
    for (var i = 0; i < this.text.length; i++) {
      var ch = this.text.charAt(i);
      var span = document.createElement('span');
      if (ch === ' ') {
        span.textContent = ' ';
      } else {
        var start = i * this.letterDelay;
        if (t < start) {
          span.textContent = ch;
          span.style.opacity = '0';
        } else if (t < start + this.window) {
          if (!this.pal) this.pal = palette(this.el);
          span.textContent = CHARSET.charAt(Math.floor(Math.random() * CHARSET.length));
          span.style.color = (t < start + this.phase) ? this.pal[0] : this.pal[1];
        } else {
          span.textContent = ch;
        }
      }
      frag.appendChild(span);
    }
    this.el.replaceChildren(frag);
    return true;
  };

  ScrambleText.prototype.setText = function (newText) {
    this.text = newText;
    if (this.settled) this.el.textContent = newText;
  };

  ScrambleText.prototype.restart = function (delay) {
    unregister(this);
    this.settled = false;
    this.running = false;
    this.startDelay = delay || 0;
    this.inView = true;
    this.maybeStart();
  };

  window.ScrambleText = ScrambleText;

  document.addEventListener('DOMContentLoaded', function () {
    var els = document.querySelectorAll('[data-scramble]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      el._scramble = new ScrambleText(el, {
        startDelay: parseInt(el.getAttribute('data-delay') || '0', 10)
      });
    }
  });
})();
