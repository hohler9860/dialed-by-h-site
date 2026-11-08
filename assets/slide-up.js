/* Date-wheel reveal, the same motion as the homepage hero menu: each word flips up
   into place like a watch date disc over .9s. Mark text with data-su ("words";
   "chars" is read as words too, so every page moves the same way). It plays when its [data-su-group] scrolls
   into view, or on load if it has no group. The HTML stays plain text, so copy
   edits and search engines see normal sentences. Needs the small head script that
   adds .js to <html>, which keeps the text hidden until it has been split. */
(function () {
  var root = document.documentElement;
  var els = [].slice.call(document.querySelectorAll('[data-su]'));
  var ready = function () { root.classList.remove('js'); };
  if (!els.length || !window.IntersectionObserver || matchMedia('(prefers-reduced-motion: reduce)').matches) return ready();

  function mask(text, index) {
    var outer = document.createElement('span'), inner = document.createElement('span');
    outer.className = 'su__c';
    outer.style.setProperty('--c', index);
    inner.textContent = text;
    outer.appendChild(inner);
    return outer;
  }

  // Walks the element so coloured spans inside a headline keep their colour.
  function split(node, mode, counter) {
    [].slice.call(node.childNodes).forEach(function (child) {
      if (child.nodeType === 1) return split(child, mode, counter);
      if (child.nodeType !== 3) return;
      var frag = document.createDocumentFragment();
      child.textContent.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) return frag.appendChild(document.createTextNode(' '));
        if (mode === 'words') return frag.appendChild(mask(part, counter.n++));
        // Letters stay together inside a word so lines only break between words.
        var word = document.createElement('span');
        word.className = 'su__w';
        Array.from(part).forEach(function (ch) { word.appendChild(mask(ch, counter.n++)); });
        frag.appendChild(word);
      });
      node.replaceChild(frag, child);
    });
  }

  var counters = new Map();
  els.forEach(function (el) {
    var group = el.closest('[data-su-group]') || el;
    if (!counters.has(group)) counters.set(group, { n: 0 });
    var mode = 'words'; // one motion everywhere: word by word
    if (mode === 'chars') {
      // A long headline keeps the same overall pace, so it never drags.
      var length = el.textContent.trim().length;
      if (length > 20 && !el.closest('[data-su-group]')) el.style.setProperty('--su-step', Math.max(10, Math.round(600 / length)) + 'ms');
      // Letter-by-letter spans read badly aloud, so screen readers get one plain copy.
      var copy = document.createElement('span');
      copy.className = 'su-sr';
      copy.textContent = el.textContent;
      var visual = document.createElement('span');
      visual.setAttribute('aria-hidden', 'true');
      while (el.firstChild) visual.appendChild(el.firstChild);
      split(visual, mode, counters.get(group));
      el.appendChild(copy);
      el.appendChild(visual);
    } else {
      // Word timing is its own count so a description does not wait on the title.
      split(el, mode, { n: 0 });
    }
  });

  var groups = [].slice.call(document.querySelectorAll('[data-su-group]'));
  [].slice.call(els).forEach(function (el) { if (!el.closest('[data-su-group]')) el.classList.add('su-in'); });
  var first = true;
  var io = new IntersectionObserver(function (entries) {
    var batch = 0, lead = first ? 250 : 0;
    first = false;
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.style.setProperty('--b', (lead + batch++ * 120) + 'ms');
      e.target.classList.add('su-in');
      io.unobserve(e.target);
    });
  }, { threshold: 0.15 });
  // Groups marked data-su-hold are played by their own page script instead.
  groups.forEach(function (g) { if (!g.hasAttribute('data-su-hold')) io.observe(g); });
  ready();
})();
