/* Prime Time Miami — Buy page: functional facet filters (dealer-style:
   Brand / Model / Case Material / Price Range / Year / Condition),
   asymmetric grid render, and scroll parallax on cards.
   Data source: window.PT_INVENTORY (placeholder — Notion later). */
(function () {
  var INV = [];
  var FACETS = [];

  // curated Collection pills — must match Notion multi-select names exactly
  var COLLECTIONS = ["Women's", '2026 Novelties', 'Classics', 'Everyday Wear', 'My Picks'];

  function uniq(key) {
    var out = [];
    INV.forEach(function (w) { var v = w[key]; if (v && out.indexOf(v) < 0) out.push(v); });
    return out.sort();
  }

  // Models collapse to families: "Oyster Perpetual 31/36/41" all filter as
  // "Oyster Perpetual" — sizes get their own filter once brand+model are picked.
  function modelFamily(m) {
    return String(m || '').replace(/\s\d{2}(\.\d)?$/, '');
  }

  // Model options exist only for the brands currently selected (dealer-style drill-down);
  // with no brand picked the Model filter stays hidden entirely.
  function modelOptions() {
    var brands = selected.brand || [];
    if (!brands.length) return [];
    var out = [];
    INV.forEach(function (w) {
      if (brands.indexOf(w.brand) < 0) return;
      var fam = modelFamily(w.model);
      if (fam && out.indexOf(fam) < 0) out.push(fam);
    });
    return out.sort();
  }

  // Case Size options appear only after brand AND model are both selected.
  function sizeOptions() {
    if (!(selected.brand || []).length || !(selected.model || []).length) return [];
    var out = [];
    INV.forEach(function (w) {
      if (selected.brand.indexOf(w.brand) < 0) return;
      if (selected.model.indexOf(modelFamily(w.model)) < 0) return;
      if (w.caseSize && out.indexOf(w.caseSize) < 0) out.push(w.caseSize);
    });
    return out.sort(function (a, b) { return parseFloat(a) - parseFloat(b); });
  }

  function celebOptions() {
    var out = [];
    INV.forEach(function (w) { (w.celebs || []).forEach(function (c) { if (out.indexOf(c) < 0) out.push(c); }); });
    return out.sort();
  }


  // ── Celebrity gallery ─────────────────────────────────────────────
  // Click "Celebrity" -> overlay of celeb cards -> click one -> filtered grid.
  // Card art = the celeb's flagship piece cutout; a portrait at
  // /images/celebs/<slug>.webp automatically takes over if Henry adds one.
  var HOT_ORDER = ['Richard Mille', 'Patek Philippe', 'Audemars Piguet', 'F.P. Journe', 'Rolex'];
  function celebSlug(n) {
    return String(n).toLowerCase().replace(/["']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function celebCards() {
    var map = {};
    INV.forEach(function (w) {
      (w.celebs || []).forEach(function (c) {
        map[c] = map[c] || { name: c, count: 0, piece: null, rank: 99 };
        map[c].count++;
        var r = HOT_ORDER.indexOf(w.brand);
        if (r < 0) r = 50;
        if (w.image && r < map[c].rank) { map[c].rank = r; map[c].piece = w.image; }
      });
    });
    return Object.keys(map).sort().map(function (k) { return map[k]; });
  }
  var celebOverlay = null;
  function openCelebOverlay() {
    if (celebOverlay) { celebOverlay.remove(); celebOverlay = null; }
    var ov = document.createElement('div');
    ov.className = 'pt-celeb-ov';
    var cards = celebCards();
    ov.innerHTML =
      '<div class="pt-celeb-ov__bar"><span>Celebrity Collections</span>' +
      '<button type="button" class="pt-celeb-ov__all">All pieces</button>' +
      '<button type="button" class="pt-celeb-ov__x" aria-label="Close">&times;</button></div>' +
      '<div class="pt-celeb-ov__grid">' + cards.map(function (c) {
        var slug = celebSlug(c.name);
        var watchImg = c.piece ? (c.piece + (c.piece.indexOf('?') >= 0 ? '&' : '?') + 'mode=cutout') : '';
        return '<button type="button" class="pt-celeb-card" data-celeb="' + c.name.replace(/"/g, '&quot;') + '">' +
          '<span class="pt-celeb-card__media">' +
          '<img src="/images/celebs/' + slug + '.webp" onerror="this.onerror=null;this.src=\'' + watchImg + '\';this.classList.add(\'is-watch\')" alt="' + c.name.replace(/"/g, '&quot;') + ' watch collection" loading="lazy">' +
          '</span><span class="pt-celeb-card__name">' + c.name + '</span>' +
          '<span class="pt-celeb-card__n">' + c.count + ' piece' + (c.count === 1 ? '' : 's') + '</span></button>';
      }).join('') + '</div>';
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    function close() { ov.remove(); celebOverlay = null; document.body.style.overflow = ''; }
    ov.querySelector('.pt-celeb-ov__x').addEventListener('click', close);
    ov.querySelector('.pt-celeb-ov__all').addEventListener('click', function () {
      selected.celeb = [];
      close(); render();
    });
    ov.querySelectorAll('.pt-celeb-card').forEach(function (card) {
      card.addEventListener('click', function () {
        selected.celeb = [card.dataset.celeb];
        close();
        render();
        window.scrollTo({ top: grid.getBoundingClientRect().top + window.scrollY - 140, behavior: 'smooth' });
      });
    });
    celebOverlay = ov;
  }

  function buildFacets() {
    var years = uniq('year');
    FACETS = [
      { id: 'collection', label: 'Collection', options: COLLECTIONS, match: function (w, sel) { return (w.collections || []).some(function (c) { return sel.indexOf(c) >= 0; }); } },
      { id: 'celeb', label: 'Celebrity', options: celebOptions(), match: function (w, sel) { return (w.celebs || []).some(function (c) { return sel.indexOf(c) >= 0; }); } },
      { id: 'brand', label: 'Brand', options: uniq('brand'), match: function (w, sel) { return sel.indexOf(w.brand) >= 0; } },
      { id: 'model', label: 'Model', options: modelOptions(), match: function (w, sel) { return sel.indexOf(modelFamily(w.model)) >= 0; } },
      { id: 'size', label: 'Case Size', options: sizeOptions(), match: function (w, sel) { return sel.indexOf(w.caseSize) >= 0; } },
      { id: 'caseMaterial', label: 'Case Material', options: uniq('caseMaterial'), match: function (w, sel) { return sel.indexOf(w.caseMaterial) >= 0; } },
      { id: 'condition', label: 'Condition', options: uniq('condition'), match: function (w, sel) { return sel.indexOf(w.condition) >= 0; } },
      { id: 'year', label: 'Year', options: years, match: function (w, sel) { return sel.indexOf(w.year) >= 0; } }
    ].filter(function (f) { return f.id === 'model' || f.id === 'size' || f.options.length > 1; });
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
      if (f.id === 'celeb') {
        btn.addEventListener('click', function () { openCelebOverlay(); });
      } else {
        btn.addEventListener('click', function () { togglePanel(f.id, btn); });
      }
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
          if (f.id === 'brand' || f.id === 'model') refreshModelPanel();
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
      refreshModelPanel();
      render();
    });
    fbar.appendChild(clear);

    var sort = document.createElement('select');
    sort.className = 'pt-sort';
    sort.setAttribute('aria-label', 'Sort pieces');
    [['featured', 'Sort: Featured'], ['brand', 'Sort: Brand A–Z'], ['model', 'Sort: Model A–Z'], ['year-new', 'Sort: Newest'], ['year-old', 'Sort: Oldest']].forEach(function (o) {
      var op = document.createElement('option');
      op.value = o[0]; op.textContent = o[1];
      sort.appendChild(op);
    });
    sort.addEventListener('change', function () { sortMode = sort.value; render(); });
    fbar.appendChild(sort);
  }

  // Drill-down panels: Model appears once a brand is checked; Case Size once
  // brand AND model are checked. Both rebuild whenever upstream selections change.
  function refreshModelPanel() {
    [
      { id: 'model', opts: modelOptions, visible: function () { return (selected.brand || []).length > 0; } },
      { id: 'size', opts: sizeOptions, visible: function () { return (selected.brand || []).length > 0 && (selected.model || []).length > 0; } }
    ].forEach(function (cfg) {
      var f = null;
      FACETS.forEach(function (x) { if (x.id === cfg.id) f = x; });
      var panel = panels.querySelector('.pt-panel[data-facet="' + cfg.id + '"]');
      var btn = fbar.querySelector('.pt-fbtn[data-facet="' + cfg.id + '"]');
      if (!f || !panel) return;
      var show = cfg.visible();
      if (btn) btn.style.display = show ? '' : 'none';
      if (!show) { panel.classList.remove('is-open'); if (btn) btn.classList.remove('is-open'); selected[cfg.id] = []; }
      f.options = cfg.opts();
      selected[cfg.id] = (selected[cfg.id] || []).filter(function (m) { return f.options.indexOf(m) >= 0; });
      panel.innerHTML = '';
      f.options.forEach(function (opt) {
        var lab = document.createElement('label');
        lab.className = 'pt-opt';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = opt;
        cb.checked = (selected[cfg.id] || []).indexOf(opt) >= 0;
        cb.addEventListener('change', function () {
          selected[cfg.id] = selected[cfg.id] || [];
          var i = selected[cfg.id].indexOf(opt);
          if (cb.checked && i < 0) selected[cfg.id].push(opt);
          if (!cb.checked && i >= 0) selected[cfg.id].splice(i, 1);
          if (cfg.id === 'model') refreshModelPanel();
          render();
        });
        lab.appendChild(cb);
        lab.appendChild(document.createTextNode(opt));
        panel.appendChild(lab);
      });
    });
  }

  // Henry's exact OP presentation order when the Oyster Perpetual model is selected
  var OP_DIAL_ORDER = [
    ['khaki', 0], ['yellow', 1], ['coral', 2], ['red coral', 2], ['green', 3], ['pistachio', 4], ['matcha', 4],
    ['celebration', 5], ['jubilee', 6], ['pink', 7], ['lavender', 8], ['turquoise', 9], ['tiffany', 9],
    ['blue', 10], ['black', 11], ['slate', 12]
  ];
  function opRank(w) {
    var d = (w.dialColor || '').toLowerCase();
    var m = (w.caseMaterial || '').toLowerCase();
    var best = 99;
    OP_DIAL_ORDER.forEach(function (p) { if (d.indexOf(p[0]) >= 0 && p[1] < best) best = p[1]; });
    if (best === 99 && (/two-tone|rolesor|yellow gold|everose/.test(m))) best = 12;
    return best;
  }
  function opSelected() {
    return (selected.model || []).indexOf('Oyster Perpetual') >= 0;
  }

  var sortMode = 'featured';
  function sortList(list) {
    if (sortMode === 'featured' && opSelected()) {
      return list.slice().sort(function (a, b) {
        var r = opRank(a) - opRank(b);
        if (r !== 0) return r;
        return (parseFloat(a.caseSize) || 0) - (parseFloat(b.caseSize) || 0);
      });
    }
    if (sortMode === 'featured') return list; // popular-first order built at load
    if (sortMode === 'year-new' || sortMode === 'year-old') {
      var dir = sortMode === 'year-new' ? -1 : 1;
      return list.slice().sort(function (a, b) {
        var ya = parseInt(a.year) || 0, yb = parseInt(b.year) || 0;
        if (ya === yb) return 0;
        if (!ya) return 1;           // undated pieces sink to the bottom either way
        if (!yb) return -1;
        return (ya - yb) * dir;
      });
    }
    var key = function (w) {
      return sortMode === 'brand'
        ? [w.brand || '', w.model || '', w.name || ''].join('|')
        : [w.model || '￿', w.brand || '', w.name || ''].join('|');
    };
    return list.slice().sort(function (a, b) { return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0; });
  }

  // Featured order: the first ~3 rows are the hitters (Royal Oak, Aquanaut,
  // Journe, hot Rolex, RM) shuffled, then everything else mixes in.
  function featuredOrder() {
    var POPULAR = [
      function (w) { return w.brand === 'Audemars Piguet' && /royal oak/i.test(w.model || ''); },
      function (w) { return w.brand === 'Patek Philippe' && /aquanaut|nautilus/i.test(w.model || ''); },
      function (w) { return /journe/i.test(w.brand || ''); },
      function (w) { return w.brand === 'Rolex' && /daytona|gmt|submariner|day-date/i.test(w.model || ''); },
      function (w) { return w.brand === 'Richard Mille'; }
    ];
    var lead = [], rest = [];
    INV.forEach(function (w) {
      (POPULAR.some(function (f) { return f(w); }) && lead.length < 24 ? lead : rest).push(w);
    });
    var head = lead.slice(0, 12);           // ~3 rows of hitters
    var tail = lead.slice(12).concat(rest); // extras mix back in
    for (var i = tail.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = tail[i]; tail[i] = tail[j]; tail[j] = t;
    }
    INV = head.concat(tail);
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

  // Incremental rendering: with thousands of pieces, building every card at once
  // janks the page. Render in chunks and append the next chunk as you approach
  // the bottom (sentinel + IntersectionObserver).
  var CHUNK = 60;
  var renderList = [];
  var renderedCount = 0;
  var sentinel = null;

  function appendChunk() {
    var slice = renderList.slice(renderedCount, renderedCount + CHUNK);
    renderedCount += slice.length;
    slice.forEach(function (w, k) { grid.appendChild(buildCard(w, renderedCount - slice.length + k)); });
    if (sentinel) sentinel.remove();
    if (renderedCount < renderList.length) {
      sentinel = document.createElement('div');
      sentinel.style.cssText = 'height:1px;grid-column:1/-1';
      grid.appendChild(sentinel);
      var io = new IntersectionObserver(function (es) {
        if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); appendChunk(); }
      }, { rootMargin: '1200px' });
      io.observe(sentinel);
    }
    revealCards();
  }

  function render() {
    renderList = sortList(filtered());
    renderedCount = 0;
    sentinel = null;
    grid.innerHTML = '';
    appendChunk();

    var act = activeFilters();
    count.textContent = renderList.length + ' of ' + INV.length + ' pieces' + (act.length ? ' — filtered' : '');
    document.getElementById('pt-clear').classList.toggle('is-visible', act.length > 0);
    fbar.querySelectorAll('.pt-fbtn').forEach(function (b) {
      var nEl = b.querySelector('.n');
      if (!nEl) return;
      var n = (selected[b.dataset.facet] || []).length;
      nEl.textContent = n ? '(' + n + ')' : '';
    });
  }

  function buildCard(w, i) {
      var art = document.createElement('article');
      art.className = 'pt-item pt-reveal';
      var escf = function (x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
      var title = escf((w.brand || '') + ' ' + (w.nickname || w.model || w.name || ''));
      var imgSrc = w.image ? (w.image.charAt(0) === '/' ? w.image : '/img?src=' + encodeURIComponent(w.image)) : '';
      var eager = i < 8 ? ' fetchpriority="high"' : ' loading="lazy"';
      var img = imgSrc
        ? '<img src="' + imgSrc + '" alt=""' + eager + '>'
        : '<span class="ph">DIALED BY H</span>';
      art.innerHTML =
        '<a href="/watch/' + (w.slug || '') + '" aria-label="' + title.replace(/"/g, '') + '">' +
        '<div class="pt-item__media">' + img + '</div>' +
        '<div class="pt-item__row"><span>' + title + '</span>' +
        '<span class="pt-item__meta">' + (w.year || '') + '</span></div>' +
        '</a>';
      return art;
  }

  // staggered scroll reveal (haoqi work-grid pattern), applied to not-yet-revealed cards
  function revealCards() {
    var items = [].slice.call(grid.querySelectorAll('.pt-reveal:not(.is-observed)'));
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        setTimeout(function () { el.classList.add('is-in'); }, 70 * (items.indexOf(el) % 4));
        io.unobserve(el);
      });
    }, { threshold: 0.12 });
    items.forEach(function (el) { el.classList.add('is-observed'); io.observe(el); });
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
      // fresh order every visit (Fisher-Yates), then pull the hitters up front
      for (var i = INV.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = INV[i]; INV[i] = INV[j]; INV[j] = tmp;
      }
      featuredOrder();
      buildFacets();
      buildBar();
      refreshModelPanel();
      render();
    })
    .catch(function () { count.textContent = 'Inventory unavailable \u2014 DM me on WhatsApp.'; });
})();
