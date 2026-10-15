/* 부산 수퍼마켓 지도 - 바닐라 JavaScript (외부 의존성: Leaflet만) */
(function () {
  'use strict';

  var STORES = (window.STORES || []).slice();

  /* ---------- 브랜드 분류 (상호명 키워드, 위에서부터 우선 적용) ---------- */
  var BRAND_RULES = [
    ['이마트', /이마트(?!24)|이마트24|트레이더스/],
    ['홈플러스', /홈플러스/],
    ['롯데마트', /롯데마트/],
    ['서원유통 탑마트', /서원/],
    ['농협 하나로마트', /농협|하나로마트/],
    ['메가마트', /메가마트/],
    ['탑마트', /탑마트/],
    ['케이마트', /케이마트/],
    ['제이마트', /제이마트|재이마트/],
    ['아이마트', /아이마트/],
    ['스카이마트', /스카이마트/],
    ['오케이마트', /오케이마트/],
    ['자이마트', /자이마트/],
    ['하나로(소매)', /하나로/]
  ];
  var BRAND_OTHER = '기타 (동네마트)';
  var PALETTE = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
                 '#f97316', '#84cc16', '#06b6d4', '#6366f1', '#d946ef', '#eab308', '#0ea5e9'];
  var OTHER_COLOR = '#64748b';

  function brandOf(name) {
    for (var i = 0; i < BRAND_RULES.length; i++) {
      if (BRAND_RULES[i][1].test(name)) return BRAND_RULES[i][0];
    }
    return BRAND_OTHER;
  }

  /* ---------- 데이터 가공 ---------- */
  var brandCount = {};
  STORES.forEach(function (s) {
    s.brand = brandOf(s.name);
    s.title = s.branch ? s.name + ' ' + s.branch : s.name;
    s.hay = (s.title + ' ' + s.road + ' ' + s.jibun + ' ' + s.dong + ' ' + s.brand).toLowerCase().replace(/\s+/g, '');
    brandCount[s.brand] = (brandCount[s.brand] || 0) + 1;
  });

  var brands = Object.keys(brandCount)
    .filter(function (b) { return b !== BRAND_OTHER; })
    .sort(function (a, b) { return brandCount[b] - brandCount[a]; });
  if (brandCount[BRAND_OTHER]) brands.push(BRAND_OTHER);

  var brandColor = {};
  brands.forEach(function (b, i) {
    brandColor[b] = b === BRAND_OTHER ? OTHER_COLOR : PALETTE[i % PALETTE.length];
  });

  var guList = Array.from(new Set(STORES.map(function (s) { return s.gu; })))
    .sort(function (a, b) { return a.localeCompare(b, 'ko'); });

  /* 동일 좌표 매장은 겹치지 않도록 미세 분산 (표시 전용, 약 6~8m) */
  (function spread() {
    var seen = {};
    STORES.forEach(function (s) {
      var key = s.lat.toFixed(6) + ',' + s.lng.toFixed(6);
      var n = seen[key] = (seen[key] || 0) + 1;
      s.dLat = s.lat; s.dLng = s.lng;
      if (n > 1) {
        var ang = (n - 1) * (Math.PI / 2);
        s.dLat += Math.sin(ang) * 0.00006;
        s.dLng += Math.cos(ang) * 0.00007;
      }
    });
  })();

  /* ---------- 상태 ---------- */
  var state = { q: '', gu: '', brand: '' };
  var activeId = null;

  /* ---------- DOM ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var elSearch = $('searchInput'), elGu = $('guSelect'), elReset = $('resetBtn');
  var elChips = $('brandChips'), elCount = $('resultCount'), elList = $('storeList');
  var elSkip = $('skipNote'), elPanel = $('panel'), elToggle = $('sheetToggle');

  /* ---------- 지도 ---------- */
  var map = L.map('map', { zoomControl: false, preferCanvas: true }).setView([35.16, 129.06], 11);
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  var layer = L.layerGroup().addTo(map);
  var markerById = {};

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function popupNode(s) {
    var box = el('div');
    box.appendChild(el('h2', 'pop__name', s.title));
    var tag = el('span', 'pop__tag', s.brand);
    tag.style.background = brandColor[s.brand];
    box.appendChild(tag);
    var dl = el('dl'); dl.style.margin = '0';
    function row(k, v) {
      if (!v) return;
      var r = el('div', 'pop__row');
      r.appendChild(el('dt', null, k));
      r.appendChild(el('dd', null, v));
      dl.appendChild(r);
    }
    row('도로명', s.road);
    row('지번', s.jibun);
    row('우편번호', s.zip);
    row('건물', [s.bldg, s.floor ? s.floor + '층' : ''].filter(Boolean).join(' '));
    row('업종', s.std || s.kind);
    box.appendChild(dl);
    return box;
  }

  STORES.forEach(function (s) {
    var m = L.circleMarker([s.dLat, s.dLng], {
      radius: 8, weight: 2, color: '#ffffff', fillColor: brandColor[s.brand], fillOpacity: .95
    });
    m.bindPopup(function () { return popupNode(s); }, { maxWidth: 300 });
    m.bindTooltip(s.title, { direction: 'top', offset: [0, -6] });
    m.on('click', function () { setActive(s.id, false); });
    markerById[s.id] = m;
  });

  /* ---------- 필터 / 렌더 ---------- */
  function filtered() {
    var q = state.q.toLowerCase().replace(/\s+/g, '');
    return STORES.filter(function (s) {
      return (!state.gu || s.gu === state.gu) &&
             (!state.brand || s.brand === state.brand) &&
             (!q || s.hay.indexOf(q) !== -1);
    });
  }

  function setActive(id, scrollList) {
    activeId = id;
    Array.prototype.forEach.call(elList.querySelectorAll('.list__item'), function (b) {
      var on = b.dataset.id === id;
      b.classList.toggle('is-active', on);
      if (on && scrollList) b.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  function renderChips() {
    elChips.textContent = '';
    brands.forEach(function (b) {
      var btn = el('button', 'chip');
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(state.brand === b));
      var dot = el('span', 'chip__dot'); dot.style.background = brandColor[b];
      btn.appendChild(dot);
      btn.appendChild(document.createTextNode(b + ' '));
      btn.appendChild(el('span', 'chip__n', String(brandCount[b])));
      btn.addEventListener('click', function () {
        state.brand = state.brand === b ? '' : b;
        renderChips(); update(true);
      });
      elChips.appendChild(btn);
    });
  }

  function update(fit) {
    var rows = filtered();
    elCount.textContent = String(rows.length);

    layer.clearLayers();
    var pts = [];
    rows.forEach(function (s) {
      layer.addLayer(markerById[s.id]);
      pts.push([s.dLat, s.dLng]);
    });

    elList.textContent = '';
    if (!rows.length) {
      elList.appendChild(el('li', 'list__empty', '조건에 맞는 매장이 없습니다.'));
    }
    var frag = document.createDocumentFragment();
    rows.forEach(function (s) {
      var li = el('li');
      var b = el('button', 'list__item');
      b.type = 'button'; b.dataset.id = s.id;
      var name = el('div', 'list__name');
      var dot = el('span', 'list__dot'); dot.style.background = brandColor[s.brand];
      name.appendChild(dot); name.appendChild(document.createTextNode(s.title));
      b.appendChild(name);
      b.appendChild(el('div', 'list__addr', s.road || s.jibun));
      b.addEventListener('click', function () { focusStore(s); });
      li.appendChild(b); frag.appendChild(li);
    });
    elList.appendChild(frag);
    if (activeId) setActive(activeId, false);

    if (fit && pts.length) {
      map.flyToBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 16, duration: .6 });
    }
  }

  function focusStore(s) {
    setActive(s.id, false);
    var m = markerById[s.id];
    if (!layer.hasLayer(m)) layer.addLayer(m);
    map.flyTo([s.dLat, s.dLng], Math.max(map.getZoom(), 16), { duration: .6 });
    map.once('moveend', function () { m.openPopup(); });
    if (window.matchMedia('(max-width: 760px)').matches) collapse(true);
  }

  map.on('popupopen', function (e) {
    var id = Object.keys(markerById).filter(function (k) { return markerById[k].getPopup() === e.popup; })[0];
    if (id) setActive(id, true);
  });

  /* ---------- 이벤트 ---------- */
  var timer;
  elSearch.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { state.q = elSearch.value.trim(); update(true); }, 150);
  });

  guList.forEach(function (g) {
    var o = el('option', null, g); o.value = g; elGu.appendChild(o);
  });
  elGu.addEventListener('change', function () { state.gu = elGu.value; update(true); });

  elReset.addEventListener('click', function () {
    state = { q: '', gu: '', brand: '' };
    elSearch.value = ''; elGu.value = '';
    activeId = null; map.closePopup();
    renderChips(); update(true);
  });

  function collapse(on) {
    elPanel.classList.toggle('is-collapsed', on);
    elToggle.textContent = on ? '목록 보기' : '지도 보기';
    elToggle.setAttribute('aria-expanded', String(!on));
  }
  elToggle.addEventListener('click', function () {
    collapse(!elPanel.classList.contains('is-collapsed'));
  });
  if (window.matchMedia('(max-width: 760px)').matches) collapse(true);

  /* ---------- 시작 ---------- */
  if (window.STORES_SKIPPED) elSkip.textContent = '좌표 누락 ' + window.STORES_SKIPPED + '건 제외';
  renderChips();
  update(false);
  var allPts = STORES.map(function (s) { return [s.dLat, s.dLng]; });
  if (allPts.length) map.fitBounds(L.latLngBounds(allPts), { padding: [40, 40] });
  setTimeout(function () { map.invalidateSize(); }, 200);
})();
