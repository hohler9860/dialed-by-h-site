/* Article images shot on white would sit as a bright box on the cream page. When an
   image's edges are near-white, this lifts that white to pure white and multiplies
   the image onto the paper, so the background disappears and the watch stays.
   Photographs are left untouched, so new articles need no extra step. */
(function () {
  if (!window.IntersectionObserver) return;
  function check(img) {
    var src = img.currentSrc || img.src;
    if (!src) return;
    var probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.onload = function () {
      try {
        var n = 48, c = document.createElement('canvas');
        c.width = c.height = n;
        var x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(probe, 0, 0, n, n);
        var d = x.getImageData(0, 0, n, n).data, light = [], total = 0, sat = 0;
        for (var i = 0; i < n; i++) {
          [[i, 0], [i, n - 1], [0, i], [n - 1, i]].forEach(function (p) {
            var o = (p[1] * n + p[0]) * 4, r = d[o], g = d[o + 1], b = d[o + 2];
            var l = (r + g + b) / 3;
            total++;
            sat += Math.max(r, g, b) - Math.min(r, g, b);
            if (l >= 225) light.push(l);
          });
        }
        if (light.length / total < 0.85 || sat / total > 14) return;
        light.sort(function (a, b) { return a - b; });
        var edge = light[light.length >> 1];
        img.style.filter = 'brightness(' + (255 / edge).toFixed(3) + ')';
        img.style.mixBlendMode = 'multiply';
      } catch (e) { /* a host without CORS: leave the image as it is */ }
    };
    probe.src = src;
  }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      if (e.target.complete) check(e.target);
      else e.target.addEventListener('load', function () { check(e.target); }, { once: true });
    });
  }, { rootMargin: '800px' });
  document.querySelectorAll('.pa-body img, .jr-body img').forEach(function (img) { io.observe(img); });
})();
