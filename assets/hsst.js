/* hsst — haoqi-style staggered character fade for display headings.
   Each char fades in over 0.23s at a random delay within 0.45s. */
(function () {
  function splitChars(el) {
    var text = el.textContent;
    el.textContent = '';
    var frag = document.createDocumentFragment();
    // chars are grouped per word in an unbreakable wrapper so lines can only
    // break BETWEEN words, never mid-word (inline-block chars would otherwise
    // let the browser wrap anywhere)
    var word = null;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (/\s/.test(ch)) {
        word = null;
        frag.appendChild(document.createTextNode(ch));
        continue;
      }
      if (!word) {
        word = document.createElement('span');
        word.className = 'hsst-word';
        word.style.display = 'inline-block';
        word.style.whiteSpace = 'nowrap';
        frag.appendChild(word);
      }
      var s = document.createElement('span');
      s.className = 'hsst-char';
      s.textContent = ch;
      s.style.opacity = '0';
      s.style.animation = 'hsstFadeIn 0.23s linear ' + (Math.random() * 0.45).toFixed(3) + 's forwards';
      word.appendChild(s);
    }
    el.appendChild(frag);
  }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      splitChars(e.target);
      io.unobserve(e.target);
    });
  }, { threshold: 0.2 });
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-hsst]').forEach(function (el) {
      el.style.visibility = 'hidden';
      (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
        el.style.visibility = '';
        io.observe(el);
      });
    });
  });
})();
