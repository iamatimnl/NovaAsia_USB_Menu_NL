/* Nova Asia menu screen engine.
   Reads display.json (what to show, in which order) and menu.json (names, prices, photos,
   availability — the same menu the kiosk sells), builds the pages and plays them on a loop.
   No interaction. Survives lost network (last good data + cached photos), reloads itself
   once a night, and restarts if it ever stops advancing. */
(function () {
  'use strict';

  var STAGE_W = 1080;
  var STAGE_H = 1920;
  var MAX_ROWS = 11;
  var FADE_MS = 900;
  var PRELOAD_TIMEOUT_MS = 4000;
  var STORE_KEY = 'nova-display-last-good-v1';
  var preview = window.NOVA_DISPLAY_PREVIEW || null; // single-file preview build only

  var stage = document.getElementById('stage');
  var deck = document.getElementById('deck');
  var bar = document.getElementById('progress');
  var state = { config: null, menu: null, slides: [], index: -1, timer: null, pending: null, lastAdvance: Date.now(), bootedAt: Date.now() };

  // ---------- layout ----------
  function fit() {
    var scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    stage.style.transform = 'scale(' + scale + ')';
  }

  // ---------- data ----------
  function readStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (_) { return null; }
  }
  function writeStore(value) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(value)); } catch (_) { /* storage full or blocked: cache still has it */ }
  }
  function fetchJSON(name) {
    return fetch(name, { cache: 'no-cache' }).then(function (response) {
      if (!response.ok) throw new Error(name + ' ' + response.status);
      return response.json();
    });
  }
  function loadData() {
    if (preview && preview.config) return Promise.resolve({ config: preview.config, menu: preview.menu });
    return Promise.all([fetchJSON('display.json'), fetchJSON('menu.json')]).then(function (pair) {
      var data = { config: pair[0], menu: pair[1] };
      if (!valid(data)) throw new Error('invalid display data');
      writeStore(data);
      return data;
    }).catch(function () {
      var saved = readStore();
      if (saved && valid(saved)) return saved;
      throw new Error('no display data available');
    });
  }
  function valid(data) {
    return data && data.config && Array.isArray(data.config.slides) && data.menu && Array.isArray(data.menu.items);
  }

  // ---------- money and words ----------
  function euro(cents) {
    return '€ ' + (cents / 100).toFixed(2).replace('.', ',');
  }
  function priceHTML(item) {
    if (item.price_kind === 'build' || (item.price_kind === 'from' && !item.price_cents)) return '<small>Stel zelf samen</small>';
    if (item.price_kind === 'from') return '<small>vanaf</small>' + euro(item.price_cents);
    return euro(item.price_cents);
  }
  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function photoURL(item) {
    if (!item) return '';
    if (preview && preview.photos) return preview.photos[item.id] || '';
    var url = item.image || '';
    return /^https:\/\//.test(url) ? url : '';
  }
  function img(url, cls) {
    return url ? '<img class="' + (cls || '') + '" src="' + esc(url) + '" alt="" decoding="async">' : '';
  }

  // ---------- building pages ----------
  function indexItems(menu) {
    var byId = {};
    menu.items.forEach(function (item) { if (item.available !== false) byId[item.id] = item; });
    return byId;
  }

  function summary(list) {
    var priced = list.filter(function (item) { return item.price_cents > 0; });
    if (!priced.length) return '';
    var fixed = priced.every(function (item) { return item.price_kind === 'fixed'; });
    var first = priced[0].price_cents;
    if (fixed && priced.length === list.length && priced.every(function (item) { return item.price_cents === first; })) {
      return 'Allemaal ' + euro(first);
    }
    var max = Math.max.apply(null, priced.map(function (item) { return item.price_cents; }));
    if (fixed && max < 1000) return 'Alles onder ' + euro(Math.ceil((max + 1) / 100) * 100).replace(',00', '');
    return 'Vanaf ' + euro(Math.min.apply(null, priced.map(function (item) { return item.price_cents; })));
  }

  function expand(config, menu) {
    var byId = indexItems(menu);
    var named = {};
    var cats = {};
    (menu.categories || []).forEach(function (category) { cats[category.id] = category.name; });
    config.slides.forEach(function (slide) { if (slide.id) named[slide.id] = slide; });
    var durations = config.durations || {};
    var pages = [];

    config.slides.forEach(function (raw) {
      var slide = raw.ref ? named[raw.ref] : raw;
      if (!slide) return;
      var seconds = slide.seconds || durations[slide.type] || 10;
      if (slide.type === 'feature') {
        var variants = (slide.variants || []).map(function (variant) {
          return byId[variant.item] ? Object.assign({}, variant, { data: byId[variant.item] }) : null;
        }).filter(Boolean);
        var main = byId[slide.photo || slide.item] || (variants[0] && variants[0].data);
        if (!main || (slide.variants && !variants.length) || (!slide.variants && !byId[slide.item])) return;
        pages.push({ type: 'feature', seconds: seconds, slide: slide, item: byId[slide.item] || main, photo: main, variants: variants });
      } else if (slide.type === 'grid') {
        var cards = (slide.items || []).map(function (id) { return byId[id]; }).filter(Boolean).slice(0, 6);
        if (cards.length >= 2) pages.push({ type: 'grid', seconds: seconds, slide: slide, cards: cards });
      } else if (slide.type === 'list') {
        listPages(slide, byId, cats, menu).forEach(function (page) { page.seconds = seconds; pages.push(page); });
      } else if (slide.type === 'brand') {
        pages.push({ type: 'brand', seconds: seconds, slide: slide });
      }
    });
    return pages;
  }

  // A list slide may span several categories (each gets a small label) and is split into pages of MAX_ROWS.
  function listPages(slide, byId, cats, menu) {
    var exclude = slide.exclude || [];
    var pair = slide.pair || null;
    var entries = [];
    var all = [];
    (slide.categories || []).forEach(function (categoryId) {
      var rows = menu.items.filter(function (item) {
        return item.category === categoryId && byId[item.id] && exclude.indexOf(item.id) < 0 &&
          !(pair && item.id.indexOf(pair.prefix) === 0);
      });
      if (!rows.length) return;
      if ((slide.categories || []).length > 1) entries.push({ label: cats[categoryId] || categoryId });
      rows.forEach(function (item) {
        var partner = pair ? byId[pair.prefix + item.id] : null;
        entries.push({ item: item, partner: partner });
        all.push(item);
      });
    });
    if (!all.length) return [];
    // Even pages (23 rows become 8 + 8 + 7, not 10 + 10 + 3); a category label never ends a page.
    var maxRows = slide.max_rows || MAX_ROWS;
    var perPage = Math.ceil(entries.length / Math.ceil(entries.length / maxRows));
    var chunks = [];
    var current = [];
    entries.forEach(function (entry) {
      if (current.length >= (entry.label ? perPage - 1 : perPage)) { chunks.push(current); current = []; }
      current.push(entry);
    });
    if (current.length) chunks.push(current);
    var heroes = slide.heroes || (slide.hero ? [slide.hero] : []);
    var sub = slide.subtitle || summary(all);
    return chunks.map(function (rows, page) {
      var heroId = heroes[page % Math.max(heroes.length, 1)];
      var hero = byId[heroId] || null;
      return { type: 'list', slide: slide, rows: rows, hero: hero, sub: sub, page: page + 1, pages: chunks.length };
    });
  }

  // ---------- rendering ----------
  function render(page) {
    var el = document.createElement('section');
    el.className = 'slide slide--' + page.type;
    el.style.setProperty('--slide-ms', (page.seconds * 1000 + FADE_MS) + 'ms');
    var s = page.slide;
    if (page.type === 'feature') {
      var body = '<p class="kicker">' + esc(s.kicker || '') + '</p>' +
        '<h1 class="feature__title">' + esc(s.title || page.item.name) + '</h1>' +
        (s.line ? '<p class="feature__line">' + esc(s.line) + '</p>' : '');
      if (page.variants.length) {
        body += '<ul class="variants">' + page.variants.map(function (variant) {
          return '<li><span class="variant__name">' + esc(variant.label || variant.data.name) + '</span>' +
            '<span class="variant__price">' + priceHTML(variant.data) + '</span>' +
            (variant.note ? '<span class="variant__note">' + esc(variant.note) + '</span>' : '') + '</li>';
        }).join('') + '</ul>';
      } else {
        body += '<div class="feature__foot"><span class="feature__extra">' + esc(s.extra || '') + '</span>' +
          '<span class="price-badge">' + priceHTML(page.item) + '</span></div>';
      }
      el.innerHTML = '<div class="feature__photo">' + img(photoURL(page.photo)) + '</div><div class="feature__body">' + body + '</div>';
      if (!photoURL(page.photo)) el.querySelector('.feature__photo').classList.add('no-photo');
    } else if (page.type === 'list') {
      var pair = s.pair;
      var rows = page.rows.map(function (entry) {
        if (entry.label) return '<div class="section-label">' + esc(entry.label) + '</div>';
        var item = entry.item;
        if (pair) {
          return '<div class="row row--pair"><span class="row__name">' + esc(item.name) + '</span>' +
            '<span class="row__price">' + euro(item.price_cents) + '</span>' +
            '<span class="row__price">' + (entry.partner ? euro(entry.partner.price_cents) : '–') + '</span></div>';
        }
        return '<div class="row"><span class="row__name">' + esc(item.name) + '</span><span class="row__price">' + priceHTML(item) + '</span></div>';
      }).join('');
      var labels = pair ? '<div class="row row--pair row--labels"><span></span><span>' + esc(pair.labels[0]) + '</span><span>' + esc(pair.labels[1]) + '</span></div>' : '';
      var heroURL = photoURL(page.hero);
      var count = page.rows.filter(function (entry) { return entry.item; }).length;
      el.style.setProperty('--hero-h', (count > 10 ? 330 : count > 8 ? 400 : 500) + 'px');
      el.innerHTML = '<div class="list__head"><div><h1 class="list__title">' + esc(s.title) + '</h1>' +
        (page.sub ? '<p class="list__sub">' + esc(page.sub) + '</p>' : '') + '</div>' +
        (page.pages > 1 ? '<span class="list__page">' + page.page + ' / ' + page.pages + '</span>' : '') + '</div>' +
        (heroURL ? '<figure class="list__hero">' + img(heroURL) + '<figcaption>' + esc(page.hero.name) + '</figcaption></figure>' : '') +
        '<div class="list__rows">' + labels + rows + (s.footnote && page.page === page.pages ? '<p class="list__note">' + esc(s.footnote) + '</p>' : '') + '</div>';
    } else if (page.type === 'grid') {
      el.innerHTML = '<div class="list__head"><div><h1 class="list__title">' + esc(s.title) + '</h1>' +
        (s.subtitle ? '<p class="list__sub">' + esc(s.subtitle) + '</p>' : '') + '</div></div>' +
        '<div class="grid__cards">' + page.cards.map(function (item) {
          var url = photoURL(item);
          return '<div class="card"><div class="card__photo' + (url ? '' : ' no-photo') + '">' + img(url) + '</div>' +
            '<span class="card__name">' + esc(item.name) + '</span><span class="card__price">' + priceHTML(item) + '</span></div>';
        }).join('') + '</div>';
    } else {
      el.innerHTML = '<img class="brand__logo" src="assets/nova-asia-logo-white.png" alt="">' +
        '<h1 class="brand__title">' + esc(s.title) + '</h1>' +
        (s.lines || []).map(function (line) { return '<p class="brand__line">' + esc(line) + '</p>'; }).join('');
    }
    return el;
  }

  // Shrink the rows until every row fits: names never get cut off.
  function fitRows(el) {
    var rows = el.querySelector('.list__rows');
    if (!rows) return;
    var size = 44;
    while (rows.scrollHeight > rows.clientHeight + 1 && size > 32) {
      size -= 2;
      rows.style.setProperty('--row-size', size + 'px');
    }
  }

  // Wait for this page's photos (with a time limit); a photo that fails is hidden, never shown broken.
  function preload(el) {
    var images = Array.prototype.slice.call(el.querySelectorAll('img'));
    return Promise.all(images.map(function (image) {
      var done = new Promise(function (resolve) {
        if (image.complete && image.naturalWidth) return resolve();
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', function () {
          var frame = image.parentNode;
          if (frame && frame.classList) frame.classList.add('no-photo');
          resolve();
        }, { once: true });
      });
      var limit = new Promise(function (resolve) { setTimeout(resolve, PRELOAD_TIMEOUT_MS); });
      return Promise.race([done, limit]);
    }));
  }

  // ---------- colours: day palette, and an after-dark palette from sunset to sunrise ----------
  // Sunrise and sunset (ms since 1970) on the given day at lat/lon: the standard sunrise equation,
  // within a minute or two at Dutch latitudes. Works from the device clock only, not its time zone.
  function sunTimes(date, lat, lon) {
    var rad = Math.PI / 180;
    var sin = function (deg) { return Math.sin(deg * rad); };
    var noon = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    var n = Math.round(noon / 864e5 + 2440587.5 - 2451545 + 0.0008);
    var meanNoon = n - lon / 360;
    var anomaly = (357.5291 + 0.98560028 * meanNoon) % 360;
    var centre = 1.9148 * sin(anomaly) + 0.02 * sin(2 * anomaly) + 0.0003 * sin(3 * anomaly);
    var longitude = (anomaly + centre + 180 + 102.9372) % 360;
    var transit = 2451545 + meanNoon + 0.0053 * sin(anomaly) - 0.0069 * sin(2 * longitude);
    var sinDecl = sin(longitude) * sin(23.4397);
    var cosDecl = Math.cos(Math.asin(sinDecl));
    var cosHour = (sin(-0.833) - sin(lat) * sinDecl) / (Math.cos(lat * rad) * cosDecl);
    if (cosHour < -1 || cosHour > 1) return null; // midnight sun or polar night
    var half = Math.acos(cosHour) / rad / 360;
    var toMs = function (julian) { return (julian - 2440587.5) * 864e5; };
    return { rise: toMs(transit - half), set: toMs(transit + half) };
  }

  // Which palette now: the day palette, or palette_after_dark.palette from margin_minutes before sunset
  // until margin_minutes after sunrise.
  function paletteFor(config, now) {
    var day = config.palette || 'green';
    var dark = config.palette_after_dark;
    if (!dark || !dark.palette || typeof dark.lat !== 'number' || typeof dark.lon !== 'number') return day;
    var sun = sunTimes(new Date(now), dark.lat, dark.lon);
    if (!sun) return day;
    var margin = (dark.margin_minutes || 0) * 60 * 1000;
    return now >= sun.rise + margin && now < sun.set - margin ? day : dark.palette;
  }

  // ?palette=… in the address (for trying one out) wins over display.json and the clock.
  // Each page keeps the palette it was built with, so a page fading out never changes colour;
  // the masthead and footer follow the root and blend over (see .masthead transition).
  function currentPalette() {
    var fromAddress = (location.search.match(/[?&]palette=([a-z]+)/) || [])[1];
    return fromAddress || paletteFor(state.config || {}, Date.now());
  }
  function applyPalette() {
    var palette = currentPalette();
    if (document.documentElement.getAttribute('data-palette') !== palette) {
      document.documentElement.setAttribute('data-palette', palette);
    }
    return palette;
  }

  // ---------- playing ----------
  function rebuild(data) {
    state.config = data.config;
    state.menu = data.menu;
    state.slides = expand(data.config, data.menu);
    var footer = data.config.footer || {};
    if (footer.left) document.getElementById('footer-left').textContent = footer.left;
    if (footer.right) document.getElementById('footer-right').textContent = footer.right;
    if (data.config.tagline) document.getElementById('tagline').textContent = data.config.tagline;
    applyPalette();
  }

  function advance() {
    clearTimeout(state.timer);
    if (state.pending && state.index >= state.slides.length - 1) {
      rebuild(state.pending);
      state.pending = null;
      state.index = -1;
    }
    if (!state.slides.length) return;
    state.index = (state.index + 1) % state.slides.length;
    var page = state.slides[state.index];
    var el = render(page);
    el.setAttribute('data-palette', applyPalette());
    el.setAttribute('aria-hidden', 'true');
    deck.appendChild(el);
    fitRows(el);
    preload(el).then(function () {
      var old = Array.prototype.slice.call(deck.querySelectorAll('.slide.is-active'));
      el.getBoundingClientRect();
      el.classList.add('is-active');
      old.forEach(function (node) {
        node.classList.remove('is-active');
        setTimeout(function () { node.remove(); }, FADE_MS + 100);
      });
      runProgress(page.seconds * 1000);
      state.lastAdvance = Date.now();
      state.timer = setTimeout(advance, page.seconds * 1000);
    });
  }

  var progressAnimation = null;
  function runProgress(ms) {
    if (!bar.animate) return;
    if (progressAnimation) progressAnimation.cancel();
    progressAnimation = bar.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: ms, easing: 'linear', fill: 'forwards' });
  }

  function refresh() {
    if (preview) return;
    loadData().then(function (data) {
      var next = JSON.stringify(data);
      var now = JSON.stringify({ config: state.config, menu: state.menu });
      if (next !== now) state.pending = data; // applied at the start of the next round
    }).catch(function () { /* offline: keep playing what we have */ });
  }

  function housekeeping() {
    var minutes = (state.config && state.config.refresh_minutes) || 10;
    setInterval(refresh, minutes * 60 * 1000);
    setInterval(function () {
      var longest = 3 * 20 * 1000;
      if (Date.now() - state.lastAdvance > longest) location.reload(); // stalled: start clean
      var at = state.config && state.config.reload_at;
      if (at && !preview) {
        var now = new Date();
        var hhmm = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
        if (hhmm === at && Date.now() - state.bootedAt > 2 * 3600 * 1000) location.reload(); // nightly fresh start
      }
    }, 30 * 1000);
  }

  function keepAwake() {
    if (!navigator.wakeLock) return;
    var request = function () { navigator.wakeLock.request('screen').catch(function () {}); };
    request();
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') request(); });
  }

  // One tap by staff after start-up switches to full screen where the browser allows it.
  function fullscreenOnTap() {
    window.addEventListener('pointerdown', function () {
      var root = document.documentElement;
      if (!document.fullscreenElement && root.requestFullscreen) root.requestFullscreen().catch(function () {});
    });
  }

  function registerWorker() {
    if (preview || !('serviceWorker' in navigator) || !/^https:|^http:\/\/(localhost|127\.0\.0\.1)/.test(location.href)) return;
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  function showError() {
    deck.innerHTML = '<section class="slide slide--brand is-active"><img class="brand__logo" src="assets/nova-asia-logo-white.png" alt="">' +
      '<h1 class="brand__title">Nova Asia</h1><p class="brand__line">Bestel binnen aan de kiosk</p></section>';
    setTimeout(function () { location.reload(); }, 60 * 1000);
  }

  fit();
  window.addEventListener('resize', fit);
  document.addEventListener('contextmenu', function (event) { event.preventDefault(); });
  registerWorker();
  keepAwake();
  fullscreenOnTap();
  loadData().then(function (data) {
    rebuild(data);
    advance();
    housekeeping();
  }).catch(showError);

  window.NovaDisplay = { expand: expand, summary: summary, euro: euro, state: state, advance: advance, sunTimes: sunTimes, paletteFor: paletteFor };
}());
