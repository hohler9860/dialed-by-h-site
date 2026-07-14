/* Prime Time Miami — Buy page: functional facet filters (dealer-style:
   Brand / Model / Case Material / Price Range / Year / Condition),
   asymmetric grid render, and scroll parallax on cards.
   Data source: window.PT_INVENTORY (placeholder — Notion later). */
(function () {
  var INV = [];
  var FACETS = [];

  // curated Collection pills — must match Notion multi-select names exactly
  var COLLECTIONS = ['2026 Novelties', 'Classics', 'Everyday Wear', 'My Picks'];

  function uniq(key) {
    var out = [];
    INV.forEach(function (w) { var v = w[key]; if (v && out.indexOf(v) < 0) out.push(v); });
    return out.sort();
  }

  function buildFacets() {
    var years = uniq('year');
    FACETS = [
      { id: 'collection', label: 'Collection', options: COLLECTIONS, match: function (w, sel) { return (w.collections || []).some(function (c) { return sel.indexOf(c) >= 0; }); } },
      { id: 'brand', label: 'Brand', options: uniq('brand'), match: function (w, sel) { return sel.indexOf(w.brand) >= 0; } },
      { id: 'caseMaterial', label: 'Case Material', options: uniq('caseMaterial'), match: function (w, sel) { return sel.indexOf(w.caseMaterial) >= 0; } },
      { id: 'condition', label: 'Condition', options: uniq('condition'), match: function (w, sel) { return sel.indexOf(w.condition) >= 0; } },
      { id: 'year', label: 'Year', options: years, match: function (w, sel) { return sel.indexOf(w.year) >= 0; } }
    ].filter(function (f) { return f.options.length > 1; });
  }

  var selected = {}; // facetId -> [values]
  var fbar = document.getElementById('pt-fbar');
  var panels = document.getElementById('pt-panels');
  var grid = document.getElementById('pt-grid');
  var count = document.getElementById('pt-count');

  function buildBar() {
    fbar.innerHTML = '';
    panels.innerHTML = '';
    FACETS.forEach(function (f) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pt-fbtn';
      btn.innerHTML = f.label + '<span class="n"></span><i>+</i>';
      btn.addEventListener('click', function () { togglePanel(f.id, btn); });
      btn.dataset.facet = f.id;
      fbar.appendChild(btn);

      var panel = document.createElement('div');
      panel.className = 'pt-panel';
      panel.dataset.facet = f.id;
      f.options.forEach(function (opt) {
        var lab = document.createElement('label');
        lab.className = 'pt-opt';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = opt;
        cb.addEventListener('change', function () {
          selected[f.id] = selected[f.id] || [];
          var i = selected[f.id].indexOf(opt);
          if (cb.checked && i < 0) selected[f.id].push(opt);
          if (!cb.checked && i >= 0) selected[f.id].splice(i, 1);
          render();
        });
        lab.appendChild(cb);
        lab.appendChild(document.createTextNode(opt));
        panel.appendChild(lab);
      });
      panels.appendChild(panel);
    });

    var clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'pt-clear';
    clear.id = 'pt-clear';
    clear.textContent = 'Clear all';
    clear.addEventListener('click', function () {
      selected = {};
      panels.querySelectorAll('input').forEach(function (c) { c.checked = false; });
      render();
    });
    fbar.appendChild(clear);
  }

  function togglePanel(id, btn) {
    var target = panels.querySelector('.pt-panel[data-facet="' + id + '"]');
    var opening = !target.classList.contains('is-open');
    panels.querySelectorAll('.pt-panel').forEach(function (p) { p.classList.remove('is-open'); });
    fbar.querySelectorAll('.pt-fbtn').forEach(function (b) { b.classList.remove('is-open'); });
    if (opening) { target.classList.add('is-open'); btn.classList.add('is-open'); }
  }

  function activeFilters() {
    return FACETS.filter(function (f) { return (selected[f.id] || []).length > 0; });
  }

  function filtered() {
    var act = activeFilters();
    return INV.filter(function (w) {
      return act.every(function (f) { return f.match(w, selected[f.id]); });
    });
  }

  function render() {
    var list = filtered();
    grid.innerHTML = '';
    list.forEach(function (w, i) {
      var art = document.createElement('article');
      art.className = 'pt-item pt-reveal';
      var escf = function (x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
      var title = escf((w.brand || '') + ' ' + (w.nickname || w.model || w.name || ''));
      var img = w.image
        ? '<img src="/img?src=' + encodeURIComponent(w.image) + '" alt="" loading="lazy">'
        : '<span class="ph">DIALED BY H</span>';
      art.innerHTML =
        '<a href="/watch/' + (w.slug || '') + '" aria-label="' + title.replace(/"/g, '') + '">' +
        '<div class="pt-item__media">' + img + '</div>' +
        '<div class="pt-item__row"><span>' + title + '</span>' +
        '<span class="pt-item__meta">' + (w.year || '') + '</span></div>' +
        '</a>';
      grid.appendChild(art);
    });

    var act = activeFilters();
    count.textContent = list.length + ' of ' + INV.length + ' pieces' + (act.length ? ' — filtered' : '');
    document.getElementById('pt-clear').classList.toggle('is-visible', act.length > 0);
    fbar.querySelectorAll('.pt-fbtn').forEach(function (b) {
      var n = (selected[b.dataset.facet] || []).length;
      b.querySelector('.n').textContent = n ? '(' + n + ')' : '';
    });
    // staggered scroll reveal (haoqi work-grid pattern)
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        setTimeout(function () { el.classList.add('is-in'); }, 70 * (pendIdx(el) % 4));
        io.unobserve(el);
      });
    }, { threshold: 0.12 });
    var items = [].slice.call(grid.querySelectorAll('.pt-reveal'));
    function pendIdx(el) { return items.indexOf(el); }
    items.forEach(function (el) { io.observe(el); });
  }


  count.textContent = 'Loading inventory\u2026';
  fetch('/api/get-inventory')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      INV = (Array.isArray(data) ? data : (data.pieces || [])).filter(function (w) { return w.image; });
      // canonicalize case materials so the filter shows clean buckets
      INV.forEach(function (w) {
        var m = (w.caseMaterial || '').toLowerCase();
        if (!m) return;
        if (/oystersteel|stainless|904l|\bsteel\b/.test(m) && !/gold|two|rolesor/.test(m)) w.caseMaterial = 'Stainless Steel';
        else if (/rolesor|two[- ]tone|steel.*gold|gold.*steel/.test(m)) w.caseMaterial = 'Two-Tone';
        else if (/tpt|quartz tpt|carbon/.test(m)) w.caseMaterial = 'TPT / Carbon';
        else if (/titanium/.test(m)) w.caseMaterial = 'Titanium';
        else if (/everose|rose gold|pink gold|red gold/.test(m)) w.caseMaterial = 'Rose Gold';
        else if (/yellow gold/.test(m)) w.caseMaterial = 'Yellow Gold';
        else if (/white gold/.test(m)) w.caseMaterial = 'White Gold';
        else if (/platinum/.test(m)) w.caseMaterial = 'Platinum';
        else if (/ceramic/.test(m)) w.caseMaterial = 'Ceramic';
        else if (/tantalum/.test(m)) w.caseMaterial = 'Tantalum';
      });
      // fresh order every visit (Fisher-Yates)
      for (var i = INV.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = INV[i]; INV[i] = INV[j]; INV[j] = tmp;
      }
      buildFacets();
      buildBar();
      render();
    })
    .catch(function () { count.textContent = 'Inventory unavailable \u2014 DM me on WhatsApp.'; });
})();
