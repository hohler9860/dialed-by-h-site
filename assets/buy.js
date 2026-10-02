/* Prime Time Miami — Buy page: functional facet filters (dealer-style:
   Brand / Model / Case Material / Price Range / Year / Condition),
   asymmetric grid render, and scroll parallax on cards.
   Data source: window.PT_INVENTORY (placeholder — Notion later). */
(function () {
  var INV = [];
  var FACETS = [];

  // curated Collection pills — must match Notion multi-select names exactly
  var COLLECTIONS = ["Women's", '2026 Novelties', 'Classics', 'Everyday Wear', 'My Picks', 'Celebrities'];

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



  // ── Celebrities inside the native grid ─────────────────────────────
  // Collection > Celebrities: celeb cards render in the grid itself.
  // Click one -> same page becomes their profile (photo, bio, their pieces).
  var currentCeleb = null;
  var CELEB_BIOS = {
    'Anant Ambani': 'Heir to the Reliance empire and one of the most-watched young collectors in the world. His wedding season alone put more grail Pateks on wrists than most auctions.',
    'Carmelo Anthony': 'Ten-time NBA All-Star with a taste that runs from gem-set Royal Oaks to serious Patek complications.',
    'Central Cee': 'UK rap\u2019s biggest crossover star. Datejusts and Daytonas early, Richard Milles as the streams stacked up.',
    'Charles Leclerc': 'Ferrari\u2019s lead driver and a Richard Mille ambassador who actually races in his.',
    'Chris Paul': 'The Point God keeps it classic: Rolex and Patek, nothing that needs explaining.',
    'Conor McGregor': 'Loudest collection in combat sports. Gem-set Pateks, rainbow Rolexes, and the watches to match the suits.',
    'Cristiano Ronaldo': 'Possibly the most expensive watch collection in sport, heavy on gem-set Rolex and Jacob & Co grails.',
    'David Beckham': 'Decades of taste distilled: vintage-leaning Rolex and elegant dress pieces that age like he does.',
    'Devin Booker': 'Book keeps a tight rotation of Patek sport pieces and clean Rolex references.',
    'DJ Khaled': 'They don\u2019t want you to have this collection. Major keys: gem-set Nautilus and enough Rolex to stock a boutique.',
    'Drake': 'One of the deepest collections in music. Rare RMs, Richard Mille collabs, and Pateks most collectors only see in books.',
    'Dwayne "The Rock" Johnson': 'The hardest worker in the room wears understated heavy-hitters, Daytonas included.',
    'Ed Sheeran': 'Quietly one of the best watch collections in the world. Deep Patek knowledge, rare complications, zero flexing.',
    'Future': 'Pluto\u2019s collection is icy by design: gem-set Pateks and Richard Milles that match the discography.',
    'Giannis Antetokounmpo': 'The Greek Freak\u2019s collection is growing like his trophy case, Nautilus first.',
    'Gordon Ramsay': 'The chef plates Michelin stars and wears grail-tier Pateks and Rolexes while doing it.',
    'James Harden': 'The Beard\u2019s collection is as flashy as the step-back: iced Richard Milles and McLaren collabs.',
    'Jason Statham': 'Action-star simple: tool watches and heavy hitters that could survive one of his movies.',
    'Jay-Z': 'Hov collects at museum level. Tiffany-dial Pateks, one-of-one Royal Oaks, and pieces with real provenance.',
    'Jayson Tatum': 'Boston\u2019s own. The Celtics star keeps Pateks and Cubitus pieces in the rotation.',
    'John Mayer': 'Arguably the most influential collector alive. His Daytona taste literally moves the market.',
    'Justin Bieber': 'From iced-out beginnings to serious Patek and AP maturity.',
    'Kai Cenat': 'Streaming\u2019s biggest star came for the RMs and never logged off.',
    'Kevin Hart': 'One of Hollywood\u2019s most serious collectors. Deep in Richard Mille and rare-dial Rolex territory.',
    'Lando Norris': 'F1\u2019s fan favorite, Richard Mille on the wrist on and off the grid.',
    'LeBron James': 'The King\u2019s collection matches the resume: RM collabs bearing his own name, grail APs and Pateks.',
    'Lil Baby': 'Atlanta\u2019s hardest worker keeps the wrist as consistent as the output: iced Pateks and RMs.',
    'Lionel Messi': 'The GOAT wears his own Jacob & Co partnership pieces and quiet Rolex classics.',
    'Luka Doncic': 'Luka Magic extends to the wrist: Royal Oaks and Richard Milles between triple-doubles.',
    'Maluma': 'Latin pop royalty with a wrist game to match: gem-set APs and Pateks.',
    'Mark Wahlberg': 'One of the most aggressive collectors in Hollywood. Museum-grade Pateks and Daytonas, always trading.',
    'Mark Zuckerberg': 'Recently converted, immediately serious: from a $120 wrist to Grand Complications.',
    'Michael Jordan': 'His Airness collects like he played: rare Richard Milles and only the hardest pieces to get.',
    'Patrick Mahomes': 'The QB of the era keeps it clean with Rolex sport models and the occasional heavy hitter.',
    'Post Malone': 'Posty\u2019s collection mixes iced grails with genuine collector taste.',
    'Russell Westbrook': 'Fashion\u2019s favorite point guard, Richard Mille\u2019s favorite walking billboard.',
    'Shah Rukh Khan': 'Bollywood\u2019s king with a collection spanning decades of Patek and Rolex royalty.',
    'Stephen Curry': 'The greatest shooter ever curates Royal Oaks and Pateks with the same precision.',
    'Sylvester Stallone': 'A legend whose Panerai obsession launched a brand and whose Journe consignments broke auction records.',
    'Tom Brady': 'The GOAT of football, an Audemars ambassador turned deep Rolex and Patek collector.',
    'Travis Scott': 'Cactus Jack\u2019s wrist rotation is as curated as the discography: rare APs and custom pieces.',
  };
  function celebSlug(n) {
    return String(n).toLowerCase().replace(/["\u2019']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function celebIndexData() {
    var map = {};
    INV.forEach(function (w) {
      (w.celebs || []).forEach(function (c) {
        map[c] = map[c] || { name: c, count: 0, piece: null };
        map[c].count++;
        // Store the transparent cutout up front. The old code appended
        // ?mode=cutout to the /img path; a static Storage URL ignores that.
        if (!map[c].piece && w.image) map[c].piece = w.imageCutout || w.image;
      });
    });
    var FEATURED = ['Travis Scott', 'Tom Brady', 'Drake', 'DJ Khaled', 'Charles Leclerc', 'Central Cee'];
    return Object.keys(map).sort(function (a, b) {
      var fa = FEATURED.indexOf(a), fb = FEATURED.indexOf(b);
      if (fa < 0) fa = 99; if (fb < 0) fb = 99;
      if (fa !== fb) return fa - fb;
      return a < b ? -1 : a > b ? 1 : 0;
    }).map(function (k) { return map[k]; });
  }
  function celebsMode() {
    return (selected.collection || []).indexOf('Celebrities') >= 0;
  }
  function buildCelebCard(c) {
    var art = document.createElement('article');
    art.className = 'pt-item pt-reveal';
    var slug = celebSlug(c.name);
    var fallback = c.piece || '';
    art.innerHTML =
      '<a href="#celeb=' + slug + '" aria-label="' + c.name.replace(/"/g, '') + ' watch collection">' +
      '<div class="pt-item__media pt-item__media--celeb"><img data-src="/images/celebs/' + slug + '.webp" data-full="' + fallback.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '" width="300" height="300" alt="" decoding="async"></div>' +
      '<div class="pt-item__row"><span>' + c.name + '</span>' +
      '<span class="pt-item__meta">' + c.count + ' pieces</span></div>' +
      '</a>';
    return art;
  }
  function celebByName(name) {
    var hit = null;
    celebIndexData().forEach(function (c) { if (celebSlug(c.name) === name || c.name === name) hit = c; });
    return hit;
  }
  function renderCelebHeader(c) {
    var head = document.getElementById('pt-celebhead');
    if (!head) {
      head = document.createElement('div');
      head.id = 'pt-celebhead';
      grid.parentNode.insertBefore(head, grid);
    }
    var slug = celebSlug(c.name);
    head.innerHTML =
      '<a class="pt-celebhead__back" href="#celebs">&larr; All celebrities</a>' +
      '<div class="pt-celebhead__row">' +
      '<img class="pt-celebhead__img" src="/images/celebs/' + slug + '.webp" alt="' + c.name.replace(/"/g, '') + '">' +
      '<div><h2 class="pt-celebhead__name">' + c.name + '</h2>' +
      '<p class="pt-celebhead__bio">' + (CELEB_BIOS[c.name] || '') + '</p>' +
      '<p class="pt-celebhead__n">' + c.count + ' pieces in the collection \u00b7 all available to source</p></div></div>';
    head.style.display = '';
  }
  function hideCelebHeader() {
    var head = document.getElementById('pt-celebhead');
    if (head) head.style.display = 'none';
  }
  function syncCelebHash() {
    var h = location.hash || '';
    if (h.indexOf('#celeb=') === 0) {
      var c = celebByName(decodeURIComponent(h.slice(7)));
      if (c) {
        currentCeleb = c.name;
        if (!celebsMode()) { selected.collection = (selected.collection || []).concat(['Celebrities']); }
        return;
      }
    }
    if (h === '#celebs') { currentCeleb = null; if (!celebsMode()) selected.collection = (selected.collection || []).concat(['Celebrities']); }
  }
  window.addEventListener('hashchange', function () {
    var h = location.hash || '';
    if (h.indexOf('#celeb=') === 0 || h === '#celebs') { syncCelebHash(); render(); }
    else if (currentCeleb || celebsMode()) { currentCeleb = null; render(); }
  });

  function buildFacets() {
    var years = uniq('year');
    FACETS = [
      { id: 'collection', label: 'Collection', options: COLLECTIONS, match: function (w, sel) { var rest = sel.filter(function (c) { return c !== 'Celebrities'; }); var hit = (w.collections || []).some(function (c) { return rest.indexOf(c) >= 0; }); if (sel.indexOf('Celebrities') >= 0) hit = hit || (w.celebs || []).length > 0; return hit; } },
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
      currentCeleb = null;
      searchQ = '';
      var qb = document.getElementById('pt-q');
      if (qb) { qb.value = ''; qb.parentNode.classList.remove('has-q'); }
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
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

  // Free text search. The whole catalogue is already in memory, so this is a
  // plain scan rather than a round trip. Every word has to match somewhere,
  // which lets "rolex daytona steel" narrow instead of widen.
  var searchQ = '';
  function haystack(w) {
    if (w.__hay) return w.__hay;
    w.__hay = [w.brand, w.model, w.nickname, w.name, w.ref, w.details,
               w.year, w.caseMaterial, w.dialColor, w.condition,
               (w.collections || []).join(' '), (w.celebs || []).join(' ')]
      .filter(Boolean).join(' ').toLowerCase();
    return w.__hay;
  }
  function matchesSearch(w) {
    if (!searchQ) return true;
    var hay = haystack(w);
    // A reference typed with punctuation ("126610 LN") should still hit.
    return searchQ.split(/\s+/).every(function (t) {
      return hay.indexOf(t) >= 0 ||
             hay.replace(/[^a-z0-9]/g, '').indexOf(t.replace(/[^a-z0-9]/g, '')) >= 0;
    });
  }

  function filtered() {
    var act = activeFilters();
    return INV.filter(function (w) {
      if (!matchesSearch(w)) return false;
      return act.every(function (f) { return f.match(w, selected[f.id]); });
    });
  }

  // Incremental rendering: with thousands of pieces, building every card at once
  // janks the page. Render in chunks and append the next chunk as you approach
  // the bottom (sentinel + IntersectionObserver).
  var CHUNK = 60;
  // Build the first screen immediately; the image queue below controls requests.
  var FIRST = 12;
  var HIGH = window.matchMedia && window.matchMedia('(max-width: 820px)').matches ? 4 : 8;
  var renderList = [];
  var renderedCount = 0;
  var sentinel = null, chunkObserver = null;
  var chunkToken = 0;
  var later = window.requestIdleCallback
    ? function (fn) { window.requestIdleCallback(fn, { timeout: 400 }); }
    : function (fn) { setTimeout(fn, 0); };

  function appendChunk() {
    var start = renderedCount;
    var slice = renderList.slice(start, start + CHUNK);
    renderedCount += slice.length;
    var token = ++chunkToken;
    var place = function (from, to) {
      for (var k = from; k < to; k++) grid.appendChild(buildCard(slice[k], start + k));
    };
    var finish = function () {
      if (sentinel) sentinel.remove();
      if (renderedCount < renderList.length) {
        sentinel = document.createElement('div');
        sentinel.style.cssText = 'height:1px;grid-column:1/-1';
        grid.appendChild(sentinel);
        if (chunkObserver) chunkObserver.disconnect();
        chunkObserver = new IntersectionObserver(function (es) {
          if (token !== chunkToken) return;
          if (es.some(function (e) { return e.isIntersecting; })) { chunkObserver.disconnect(); appendChunk(); }
        }, { rootMargin: '1200px' });
        chunkObserver.observe(sentinel);
      }
      revealCards();
    };
    var head = start === 0 ? Math.min(FIRST, slice.length) : slice.length;
    place(0, head);
    if (head < slice.length) {
      revealCards();
      later(function () {
        if (token !== chunkToken) return;
        place(head, slice.length);
        finish();
      });
    } else {
      finish();
    }
  }

  function render() {
    resetCardLoading();
    if (chunkObserver) chunkObserver.disconnect();
    chunkToken++; // cancel any deferred batch from the previous render
    if (!celebsMode()) currentCeleb = null;
    if (celebsMode() && !currentCeleb) {
      // celebrity index: celeb cards live where the watches usually are
      hideCelebHeader();
      var cs = celebIndexData();
      grid.innerHTML = '';
      cs.forEach(function (c) { grid.appendChild(buildCelebCard(c)); });
      revealCards();
      count.textContent = cs.length + ' celebrity collections';
      document.getElementById('pt-clear').classList.add('is-visible');
      return;
    }
    if (currentCeleb) {
      var cd = celebByName(currentCeleb);
      if (cd) renderCelebHeader(cd);
      renderList = sortList(INV.filter(function (w) { return (w.celebs || []).indexOf(currentCeleb) >= 0; }));
      renderedCount = 0; sentinel = null;
      grid.innerHTML = '';
      appendChunk();
      count.textContent = renderList.length + ' pieces \u00b7 ' + currentCeleb;
      document.getElementById('pt-clear').classList.add('is-visible');
      return;
    }
    hideCelebHeader();
    renderList = sortList(filtered());
    renderedCount = 0;
    sentinel = null;
    grid.innerHTML = '';
    appendChunk();

    var act = activeFilters();
    count.textContent = renderList.length + ' of ' + INV.length + ' pieces'
      + (searchQ ? ' \u00b7 "' + searchQ + '"' : '')
      + (act.length ? ' \u2014 filtered' : '');
    document.getElementById('pt-clear').classList.toggle('is-visible', act.length > 0 || !!searchQ);
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
      var abs = function (u) { return /^https?:\/\//i.test(u) || u.charAt(0) === '/' ? u : '/img?src=' + encodeURIComponent(u); };
      var imgSrc = w.image ? abs(w.image) : '';
      var eager = i < HIGH ? ' fetchpriority="high"' : '';
      // Tiles render around 300px, so serve the 300px variant and let the
      // browser step up to 600/900 only on wide or retina screens. Previously
      // every tile downloaded the full 900px file - the bulk of /buy/'s LCP.
      // width/height are intrinsic (the renders are square) so the grid
      // reserves space before the image lands and cannot shift.
      var srcset = (w.imageThumb && w.imageMedium)
        ? ' data-srcset="' + escf(abs(w.imageThumb)) + ' 300w, ' + escf(abs(w.imageMedium)) + ' 600w, ' + escf(imgSrc) + ' 900w"' +
          ' sizes="(max-width: 640px) 45vw, (max-width: 1100px) 30vw, 300px"'
        : '';
      // Keep URLs inert until the bounded preload queue starts this image.
      var img = imgSrc
        ? '<img data-src="' + escf(w.imageThumb ? abs(w.imageThumb) : imgSrc) + '"' + srcset +
          ' data-full="' + escf(imgSrc) + '"' +
          ' width="300" height="300" alt="" decoding="async"' + eager + '>'
        : '<span class="ph">DIALED BY H</span>';
      art.innerHTML =
        '<a href="/watch/' + (w.slug || '') + '" aria-label="' + title.replace(/"/g, '') + '">' +
        '<div class="pt-item__media">' + img + '</div>' +
        '<div class="pt-item__row"><span>' + title + '</span>' +
        '<span class="pt-item__meta">' + (w.year || '') + '</span></div>' +
        '</a>';
      return art;
  }

  // Preload close to the viewport with a small request budget. Native lazy
  // loading can launch dozens of requests at once and reveal in download order.
  var imageQueue = [], activeImages = 0, imageJobs = [];
  var preloadObserver, revealObserver, revealFrame, loadingGeneration = 0;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function resetCardLoading() {
    loadingGeneration++;
    if (preloadObserver) preloadObserver.disconnect();
    if (revealObserver) revealObserver.disconnect();
    preloadObserver = revealObserver = null;
    if (revealFrame) cancelAnimationFrame(revealFrame);
    revealFrame = null;
    imageQueue = [];
    imageJobs.forEach(function (job) { if (job.cancel) job.cancel(); });
    imageJobs = [];
  }

  function requestImage(card) {
    var job = card._dbhImage;
    if (!job || job.started || job.queued || job.done) return;
    job.queued = true;
    imageQueue.push(job);
    pumpImages();
  }

  function pumpImages() {
    // A fast scroll or filter change should prioritize the current viewport.
    imageQueue.sort(function (a, b) {
      return Math.abs(a.card.getBoundingClientRect().top) - Math.abs(b.card.getBoundingClientRect().top);
    });
    while (activeImages < 6 && imageQueue.length) {
      var job = imageQueue.shift();
      if (job.generation !== loadingGeneration || !job.card.isConnected) continue;
      var bounds = job.card.getBoundingClientRect();
      if (bounds.bottom < -800 || bounds.top > window.innerHeight + 1800) {
        job.queued = false;
        if (preloadObserver) preloadObserver.observe(job.card);
        continue;
      }
      job.queued = false;
      startImage(job);
    }
  }

  function startImage(job) {
    job.started = true;
    activeImages++;
    var im = job.image, timer, finished = false, attempt = job.attempt || 0;
    function cleanup() {
      clearTimeout(timer);
      im.onload = im.onerror = null;
    }
    function release() {
      if (finished) return false;
      finished = true;
      cleanup();
      activeImages--;
      job.started = false;
      return true;
    }
    function stopRequest() {
      im.removeAttribute('srcset');
      im.removeAttribute('src');
    }
    function complete() {
      if (!release()) return;
      job.done = true;
      job.card.classList.add('is-image-ready');
      scheduleReveal();
      pumpImages();
    }
    function failed() {
      if (!release()) return;
      stopRequest();
      // A temporary refusal or timeout must remain recoverable. Retry through
      // the same queue, releasing this slot while waiting so other tiles load.
      if (attempt < 3) {
        job.attempt = attempt + 1;
        job.queued = true;
        var retryTimer = setTimeout(function () {
          job.queued = false;
          if (job.generation === loadingGeneration && job.card.isConnected) requestImage(job.card);
        }, [800, 2000, 4000][attempt]);
        job.cancel = function () { clearTimeout(retryTimer); job.done = true; };
      } else {
        job.done = true;
        job.card.classList.add('is-image-error');
        var retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'pt-image-retry';
        retry.textContent = 'Retry photo';
        retry.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          retry.remove();
          job.card.classList.remove('is-image-error');
          job.done = false;
          job.attempt = 0;
          requestImage(job.card);
        });
        // Keep the retry button outside the product link for valid keyboard navigation.
        job.card.appendChild(retry);
      }
      pumpImages();
    }
    function loaded() {
      if (finished) return;
      if (!im.naturalWidth) return failed();
      clearTimeout(timer);
      // Decode rejection can follow a responsive-source change even when an
      // image is usable. Never replace a successfully downloaded photo for it.
      timer = setTimeout(complete, 1500);
      if (im.decode) im.decode().then(complete, function () {
        if (im.naturalWidth) complete(); else failed();
      });
      else complete();
    }
    job.cancel = function () {
      if (!release()) return;
      stopRequest();
      job.done = true;
      pumpImages();
    };
    im.onload = loaded;
    im.onerror = failed;
    timer = setTimeout(failed, 20000);
    var source = (attempt % 2 === 1 && im.dataset.full) ? im.dataset.full : im.dataset.src;
    // Only retry requests bypass an error cached upstream. Normal loads retain caching.
    var url = function (value) { return attempt >= 2 ? value + (value.indexOf('?') < 0 ? '?' : '&') + 'retry=' + attempt : value; };
    if (attempt % 2 === 0 && im.dataset.srcset) {
      im.setAttribute('srcset', im.dataset.srcset.split(',').map(function (part) {
        var pieces = part.trim().split(/\s+/);
        return url(pieces[0]) + (pieces[1] ? ' ' + pieces[1] : '');
      }).join(', '));
    } else im.removeAttribute('srcset');
    im.src = url(source);
  }

  function scheduleReveal() {
    if (revealFrame) return;
    revealFrame = requestAnimationFrame(function () {
      revealFrame = null;
      var cards = [].slice.call(grid.querySelectorAll('.pt-reveal'));
      var rows = [];
      cards.forEach(function (card) {
        var row = rows[rows.length - 1];
        if (!row || Math.abs(row.top - card.offsetTop) > 2) {
          row = { top: card.offsetTop, cards: [] };
          rows.push(row);
        }
        row.cards.push(card);
      });
      rows.forEach(function (row) {
        if (!row.cards.some(function (card) { return card._dbhVisible; })) return;
        row.cards.forEach(requestImage);
        // Reveal ready photos in column order; slow neighbors retain visible
        // loading tiles instead of making the entire row disappear.
        // Use the actual rendered row, rather than an index modulo four.
        row.cards.sort(function (a, b) { return a.offsetLeft - b.offsetLeft; });
        row.cards.forEach(function (card, col) {
          if (card.classList.contains('is-in') || !card.classList.contains('is-image-ready')) return;
          card.style.setProperty('--image-delay', reducedMotion.matches ? '0ms' : (col * 70) + 'ms');
          card.classList.add('is-in');
          if (revealObserver) revealObserver.unobserve(card);
        });
      });
    });
  }

  function revealCards() {
    var items = [].slice.call(grid.querySelectorAll('.pt-reveal:not(.is-observed)'));
    if (!preloadObserver) {
      preloadObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          requestImage(entry.target);
          preloadObserver.unobserve(entry.target);
        });
      }, { rootMargin: '1600px 0px' });
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { entry.target._dbhVisible = entry.isIntersecting; });
        scheduleReveal();
      }, { threshold: 0 });
    }
    items.forEach(function (card) {
      card.classList.add('is-observed');
      var im = card.querySelector('img[data-src]');
      if (im) {
        var job = { card: card, image: im, generation: loadingGeneration };
        card._dbhImage = job;
        imageJobs.push(job);
      } else card.classList.add('is-image-ready');
      preloadObserver.observe(card);
      revealObserver.observe(card);
    });
  }
  window.addEventListener('resize', scheduleReveal);


  // Search box. Debounced so typing does not rebuild the grid on every key.
  (function () {
    var box = document.getElementById('pt-q');
    if (!box) return;
    var wrap = box.parentNode, x = document.getElementById('pt-qx'), t;
    function apply() {
      searchQ = box.value.trim().toLowerCase();
      wrap.classList.toggle('has-q', !!searchQ);
      // Celebrity mode swaps the grid for celeb cards, so a search typed while
      // it is on would return matches nobody can see. Drop out of it.
      if (searchQ && (celebsMode() || currentCeleb)) {
        currentCeleb = null;
        var cb = panels.querySelector('input[value="Celebrities"]');
        if (cb && cb.checked) { cb.checked = false; selected.collection = (selected.collection || []).filter(function (v) { return v !== 'Celebrities'; }); }
        if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      }
      render();
    }
    box.addEventListener('input', function () { clearTimeout(t); t = setTimeout(apply, 180); });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); clearTimeout(t); apply(); }
      if (e.key === 'Escape') { box.value = ''; clearTimeout(t); apply(); }
    });
    if (x) x.addEventListener('click', function () { box.value = ''; apply(); box.focus(); });
  })();

  count.textContent = 'Loading inventory\u2026';
  // buy/index.html kicks the request off from <head>, before the stylesheet
  // and this file have even arrived, and parks the promise on window. Fall
  // back to fetching here if that inline script is ever missing.
  var INV_URL = '/api/get-inventory?grid=1';
  (window.dbhInventory || fetch(INV_URL))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      // ?grid=1 sends one short storage path per piece (i) plus a cutout hint
      // (c) instead of five full URLs; rebuild the fields the grid reads from
      // them. The plain array form is still accepted so the old payload works.
      var base = (data && data.base) || '';
      var variant = function (u, s) { return u.replace(/\.webp$/, '-' + s + '.webp'); };
      var full = function (p) { return /^https?:\/\//i.test(p) ? p : base + p; };
      var list = Array.isArray(data) ? data : ((data && data.pieces) || []);
      list.forEach(function (w) {
        if (!w.i) return;
        var abs = full(w.i);
        w.image = abs;
        w.imageThumb = variant(abs, 'thumb');
        w.imageMedium = variant(abs, 'medium');
        w.imageCutout = w.c === 1 ? variant(abs, 'cutout') : (w.c ? full(w.c) : abs);
      });
      INV = list.filter(function (w) { return w.image; });
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
      syncCelebHash();
      buildFacets();
      buildBar();
      refreshModelPanel();
      render();
    })
    .catch(function () { count.textContent = 'Inventory unavailable \u2014 DM me on WhatsApp.'; });
})();
