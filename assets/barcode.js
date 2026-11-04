/* barcode.niveshsahayak.in: barcode labels and scanning on the shared data home.
   Print: pick items from the item masters (or type labels by hand), choose a label sheet (A4 sheets of 65/40/24/21/14,
   label-printer rolls, or your own sizes), barcode type (Code 128, EAN-13, EAN-8, UPC-A, QR) and what to print
   (name, price, business, code). Items without a code can be given one (NS000001…), saved on the item as `code`.
   Scan: phone camera (BarcodeDetector, else ZXing) or a USB scanner typing into the box; known codes count up,
   unknown codes can be saved as new items. Libraries load only when needed (cdnjs / unpkg, SRI-pinned). */
(function () {
  'use strict';
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, money = NS.money, t = NSB.t, key = NSB.key;
  var LIB = {
    bar: ['https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js', 'sha384-Kk5SjBOKprEnGfyBWfD2zROFd1Cu8kwOXxG2GIhYPcoDL2rBJS9P8Ud1ZMy4412a'],
    qr: ['https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js', 'sha384-mZT2gIty7ZDdOGkxfP6joZcYdMW1Jvj9dRlfpTmaJAKKXTqzygtB22k7FLe+KZC1'],
    zx: ['https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js', 'sha384-BzBxP10ZE72aitqj5UMmUsbKFliP/DZqA8Wq+BNNhlIJDGoEd1tpkMYXOg9+n6sB']
  };
  /* label layouts in mm: page w/h, columns, rows, label w/h, top and left margin, gap between labels */
  var LAYOUTS = {
    a4_65: { page: 'a4', cols: 5, rows: 13, w: 38.1, h: 21.2, top: 10.7, left: 4.7, gx: 2.5, gy: 0 },
    a4_40: { page: 'a4', cols: 4, rows: 10, w: 45.7, h: 25.4, top: 21.5, left: 9.7, gx: 2.6, gy: 0 },
    a4_24: { page: 'a4', cols: 3, rows: 8, w: 63.5, h: 33.9, top: 12.9, left: 7.2, gx: 2.5, gy: 0 },
    a4_21: { page: 'a4', cols: 3, rows: 7, w: 63.5, h: 38.1, top: 15.2, left: 7.2, gx: 2.5, gy: 0 },
    a4_14: { page: 'a4', cols: 2, rows: 7, w: 99.1, h: 38.1, top: 15.2, left: 4.7, gx: 2.6, gy: 0 },
    roll_50x25: { page: 'roll', w: 50, h: 25 }, roll_38x25: { page: 'roll', w: 38, h: 25 }, roll_2x1: { page: 'roll', w: 50.8, h: 25.4 }, roll_100x50: { page: 'roll', w: 100, h: 50 }
  };
  var TYPES = ['CODE128', 'EAN13', 'EAN8', 'UPC', 'QR'];
  var DEF = { layout: 'a4_40', type: 'CODE128', name: true, price: 'mrp', biz: false, text: true, start: 1, custom: { page: 'a4', cols: 3, rows: 8, w: 63.5, h: 33.9, top: 12.9, left: 7.2, gx: 2.5, gy: 0 } };
  var SET = load(), sel = {}, extra = [], scans = [], cur = 'home', q = '';
  function load() { try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem('ns-bc-set') || '{}')); } catch (e) { return Object.assign({}, DEF); } }
  function keep() { try { localStorage.setItem('ns-bc-set', JSON.stringify(SET)); } catch (e) {} }
  function layout() { return SET.layout === 'custom' ? Object.assign({ page: 'a4' }, SET.custom) : LAYOUTS[SET.layout] || LAYOUTS.a4_40; }
  function items() { return NSB.data().item.slice().sort(function (a, b) { return String(a.desc || '').localeCompare(String(b.desc || '')); }); }

  /* ---------- check digits ---------- */
  function gtinCheck(d) { var s = 0, n = d.length; for (var i = 0; i < n; i++) s += +d[n - 1 - i] * (i % 2 ? 1 : 3); return (10 - s % 10) % 10; }
  /* a value the chosen barcode can draw: EAN/UPC get their check digit added (or checked); else falls back to Code 128 */
  function fit(value, type) {
    var v = String(value || '').trim(), L = { EAN13: 13, EAN8: 8, UPC: 12 }[type];
    if (!L) return { v: v, type: type };
    if (/^\d+$/.test(v) && v.length === L - 1) return { v: v + gtinCheck(v), type: type };
    if (/^\d+$/.test(v) && v.length === L && gtinCheck(v.slice(0, -1)) === +v.slice(-1)) return { v: v, type: type };
    return { v: v, type: 'CODE128', fallback: true };
  }

  /* every way a saved code can come back from a scanner: as typed, with its EAN/UPC check digit, UPC-A read as EAN-13 */
  function byCode() {
    var by = {};
    items().forEach(function (m) {
      if (!m.code) return; var c = String(m.code).trim();
      [c, fit(c, 'EAN13').v, fit(c, 'EAN8').v, fit(c, 'UPC').v, /^\d{12}$/.test(c) ? '0' + c : ''].forEach(function (k) { if (k && !by[k]) by[k] = m; });
    });
    return by;
  }

  /* ---------- sections ---------- */
  function route() { var h = location.hash.slice(1); cur = h === 'scan' || h === 'codes' ? h : 'home'; show(true); }
  function show(focus) {
    NSB.navMark(cur);
    if (cur !== 'scan') stopCam();
    return NSB.load().then(function () {
      var pane = $('[data-pane]');
      NSB.modeLine();
      pane.innerHTML = ({ home: printHtml, scan: scanHtml, codes: codesHtml })[cur]();
      wire(pane);
      if (cur === 'home') drawPreview();
      if (focus) NSB.focusH2(pane);
    });
  }

  /* ---------- print labels ---------- */
  function labels() {
    var L = [], by = {};
    items().forEach(function (m) { by[m.id] = m; });
    Object.keys(sel).forEach(function (id) {
      var s = sel[id], m = by[id]; if (!m || !(s.n > 0)) return;
      for (var i = 0; i < s.n; i++) L.push({ name: m.desc, code: m.code || '', price: s.price });
    });
    extra.forEach(function (x) { for (var i = 0; i < (x.n || 1); i++) L.push(x); });
    return L;
  }
  function printHtml() {
    var list = items().filter(function (m) { return !q || String(m.desc + ' ' + (m.code || '')).toLowerCase().indexOf(q.toLowerCase()) >= 0; });
    var noCode = items().filter(function (m) { return !m.code; }).length, lay = layout();
    var rows = list.map(function (m) {
      var s = sel[m.id] || { n: 0, price: m.mrp != null && m.mrp !== '' ? m.mrp : m.rate };
      return '<tr><td class="l"><label class="chk"><input type="checkbox" data-pick="' + esc(m.id) + '"' + (s.n > 0 ? ' checked' : '') + '> ' + esc(m.desc) + '</label></td>' +
        '<td class="mono">' + (m.code ? esc(m.code) : '<span class="pill warn">' + esc(t('bc.nocode')) + '</span>') + '</td>' +
        '<td><input class="bc-n" inputmode="decimal" data-price="' + esc(m.id) + '" value="' + esc(s.price == null ? '' : s.price) + '" aria-label="' + esc(t('bc.price')) + '"></td>' +
        '<td><input class="bc-n" inputmode="numeric" data-copies="' + esc(m.id) + '" value="' + (s.n || '') + '" placeholder="0" aria-label="' + esc(t('bc.copies')) + '"></td></tr>';
    }).join('');
    var opts = function (arr, v, pre) { return arr.map(function (x) { return '<option value="' + x + '"' + (x === v ? ' selected' : '') + '>' + esc(t(pre + x)) + '</option>'; }).join(''); };
    return '<div class="pane-hd"><h2>' + esc(t('bc.print')) + '</h2><div class="quick"><button type="button" class="btn" data-add-hand>+ ' + esc(t('bc.byhand')) + '</button>' +
      (noCode ? '<button type="button" class="btn" data-givecodes>' + esc(t('bc.give', { n: noCode })) + '</button>' : '') + '</div></div>' +
      (items().length ? '' : '<div class="card"><p>' + esc(t('bc.noitems')) + '</p><p><a class="btn" href="' + NSB.myUrl('#item') + '">' + esc(t('bc.additems')) + '</a></p></div>') +
      '<fieldset class="bc-set"><legend>' + esc(t('bc.setup')) + '</legend><div class="fg">' +
      '<div class="f"><label for="bc-layout">' + esc(t('bc.layout')) + '</label><select id="bc-layout">' + opts(Object.keys(LAYOUTS).concat(['custom']), SET.layout, 'bc.l_') + '</select></div>' +
      '<div class="f"><label for="bc-type">' + esc(t('bc.type')) + '</label><select id="bc-type">' + opts(TYPES, SET.type, 'bc.t_') + '</select></div>' +
      '<div class="f"><label for="bc-pricel">' + esc(t('bc.pricel')) + '</label><select id="bc-pricel">' + opts(['mrp', 'price', 'none'], SET.price, 'bc.p_') + '</select></div>' +
      (lay.page === 'a4' ? '<div class="f"><label for="bc-start">' + esc(t('bc.start')) + '</label><input id="bc-start" inputmode="numeric" value="' + esc(SET.start) + '"><span class="hint">' + esc(t('bc.starth')) + '</span></div>' : '') +
      '<label class="chk"><input type="checkbox" id="bc-name"' + (SET.name ? ' checked' : '') + '> ' + esc(t('bc.showname')) + '</label>' +
      '<label class="chk"><input type="checkbox" id="bc-text"' + (SET.text ? ' checked' : '') + '> ' + esc(t('bc.showcode')) + '</label>' +
      '<label class="chk"><input type="checkbox" id="bc-biz"' + (SET.biz ? ' checked' : '') + '> ' + esc(t('bc.showbiz')) + '</label></div>' +
      (SET.layout === 'custom' ? customHtml() : '') + '</fieldset>' +
      '<div class="tools-row"><label class="sr" for="sb-q">' + esc(t('bc.search')) + '</label><input id="sb-q" type="search" data-q value="' + esc(q) + '" placeholder="' + esc(t('bc.search')) + '"></div>' +
      (rows ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">' + esc(t('bc.item')) + '</th><th>' + esc(t('bc.code')) + '</th><th>' + esc(t('bc.price')) + '</th><th>' + esc(t('bc.copies')) + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '') +
      (extra.length ? '<ul class="rows">' + extra.map(function (x, i) { return '<li><div class="ln"><span><b>' + esc(x.name || x.code) + '</b><span class="soft mono"> · ' + esc(x.code) + ' × ' + x.n + '</span></span><button type="button" class="btn sm danger" data-rmx="' + i + '">' + esc(t('sb.del')) + '</button></div></li>'; }).join('') + '</ul>' : '') +
      '<p class="sb-note" data-count></p><div class="btns"><button type="button" class="btn primary" data-print>' + esc(t('sb.print')) + '</button>' +
      (lay.page === 'a4' ? '<button type="button" class="btn" data-pdf>' + esc(t('sb.pdf')) + '</button>' : '') + '</div>' +
      '<p class="sb-note">' + esc(t(lay.page === 'a4' ? 'bc.printh' : 'bc.rollh')) + '</p>' +
      '<div class="bc-pv" aria-label="' + esc(t('bc.preview')) + '"><div data-pv></div></div><div id="bc-print" aria-hidden="true"></div>';
  }
  function customHtml() {
    var c = SET.custom, f = function (k, lbl) { return '<div class="f"><label for="bc-c-' + k + '">' + esc(t(lbl)) + '</label><input id="bc-c-' + k + '" data-cust="' + k + '" inputmode="decimal" value="' + esc(c[k]) + '"></div>'; };
    return '<div class="fg bc-cust"><div class="f"><label for="bc-c-page">' + esc(t('bc.c_page')) + '</label><select id="bc-c-page" data-cust="page"><option value="a4"' + (c.page === 'a4' ? ' selected' : '') + '>A4</option><option value="roll"' + (c.page === 'roll' ? ' selected' : '') + '>' + esc(t('bc.c_roll')) + '</option></select></div>' +
      f('w', 'bc.c_w') + f('h', 'bc.c_h') + (c.page === 'a4' ? f('cols', 'bc.c_cols') + f('rows', 'bc.c_rows') + f('top', 'bc.c_top') + f('left', 'bc.c_left') + f('gx', 'bc.c_gx') + f('gy', 'bc.c_gy') : '') + '</div>';
  }

  /* one label's inner HTML; barcodes are drawn into the <svg data-bc> afterwards */
  function labelHtml(x, lay) {
    var b = NSB.biz() || {}, f = fit(x.code, SET.type), h = lay.h, small = h < 24;
    var price = SET.price !== 'none' && x.price !== '' && x.price != null && !isNaN(num(x.price)) ? (SET.price === 'mrp' ? 'MRP ' : '') + money(num(x.price)) : '';
    return '<div class="bc-lab" style="width:' + lay.w + 'mm;height:' + lay.h + 'mm">' +
      (SET.biz && b.name ? '<div class="bc-b">' + esc(b.name) + '</div>' : '') +
      (SET.name && x.name ? '<div class="bc-nm' + (small ? ' sm' : '') + '">' + esc(x.name) + '</div>' : '') +
      (x.code ? (f.type === 'QR' ? '<div class="bc-qr" data-qr="' + esc(f.v) + '"></div>' : '<svg class="bc-svg" data-bc="' + esc(f.v) + '" data-type="' + f.type + '"></svg>') : '<div class="bc-miss">' + esc(t('bc.nocode')) + '</div>') +
      (SET.text && x.code && f.type === 'QR' ? '<div class="bc-tx">' + esc(f.v) + '</div>' : '') +
      (price ? '<div class="bc-pr' + (small ? ' sm' : '') + '">' + esc(price) + (SET.price === 'mrp' ? '<small>(incl. of all taxes)</small>' : '') + '</div>' : '') + '</div>';
  }
  /* sheets (A4) or single labels (roll) as page-size boxes */
  function sheetsHtml() {
    var L = labels(), lay = layout(), out = [];
    if (lay.page === 'roll') {
      return L.map(function (x) { return '<div class="bc-page roll" style="width:' + lay.w + 'mm;height:' + lay.h + 'mm">' + labelHtml(x, lay) + '</div>'; }).join('');
    }
    var per = lay.cols * lay.rows, skip = Math.max(0, Math.min(per - 1, (parseInt(SET.start, 10) || 1) - 1)), slots = [];
    for (var i = 0; i < skip; i++) slots.push(null);
    slots = slots.concat(L);
    for (var p = 0; p < slots.length; p += per) {
      var cells = slots.slice(p, p + per).map(function (x, i) {
        var c = i % lay.cols, r = Math.floor(i / lay.cols);
        return x ? '<div class="bc-cell" style="left:' + (lay.left + c * (lay.w + lay.gx)) + 'mm;top:' + (lay.top + r * (lay.h + lay.gy)) + 'mm">' + labelHtml(x, lay) + '</div>' : '';
      }).join('');
      out.push('<div class="bc-page a4">' + cells + '</div>');
    }
    return out.join('');
  }
  function render(box) {
    box.innerHTML = sheetsHtml();
    var need = $$('[data-bc]', box).length, qr = $$('[data-qr]', box).length, jobs = [];
    if (need) jobs.push(NS.loadJs(LIB.bar[0], LIB.bar[1]));
    if (qr) jobs.push(NS.loadJs(LIB.qr[0], LIB.qr[1]));
    return Promise.all(jobs).then(function () {
      var lay = layout(), bh = Math.max(6, lay.h * (SET.name ? 0.42 : 0.55) - (SET.price !== 'none' ? 3 : 0));
      $$('[data-bc]', box).forEach(function (s) {
        try { window.JsBarcode(s, s.getAttribute('data-bc'), { format: s.getAttribute('data-type'), height: bh * 4, width: 2, displayValue: SET.text, fontSize: 16, margin: 2, textMargin: 0, flat: true }); }
        catch (e) { s.outerHTML = '<div class="bc-miss">' + esc(t('bc.bad')) + '</div>'; return; }
        var w = s.getAttribute('width'), h = s.getAttribute('height');   /* scale the drawing to the label */
        if (w && h) { s.setAttribute('viewBox', '0 0 ' + parseFloat(w) + ' ' + parseFloat(h)); s.removeAttribute('width'); s.removeAttribute('height'); s.setAttribute('preserveAspectRatio', 'xMidYMid meet'); }
      });
      $$('[data-qr]', box).forEach(function (d) {
        var qrc = window.qrcode(0, 'M'); qrc.addData(d.getAttribute('data-qr')); qrc.make();
        d.innerHTML = qrc.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
      });
    }).catch(function () { NS.toast(t('bc.libfail'), 'bad'); });
  }
  function drawPreview() {
    var pv = $('[data-pv]'); if (!pv) return;
    var L = labels(), c = $('[data-count]'), fb = L.filter(function (x) { return x.code && fit(x.code, SET.type).fallback; }).length;
    if (c) c.textContent = L.length ? t('bc.count', { n: L.length }) + (fb ? ' ' + t('bc.fallback', { n: fb }) : '') : t('bc.pickfirst');
    render(pv).then(function () { var pg = $('.bc-page', pv); if (pg) pv.style.zoom = Math.min(1, (pv.parentNode.clientWidth - 8) / pg.offsetWidth); });
  }
  function doPrint() {
    if (!labels().length) { NS.toast(t('bc.pickfirst'), 'bad'); return; }
    var lay = layout(), box = $('#bc-out') || document.body.appendChild(NS.el('div', { id: 'bc-out', 'aria-hidden': 'true' })), st = $('#bc-page-css') || document.head.appendChild(NS.el('style', { id: 'bc-page-css' }));
    st.textContent = '@media print{@page{size:' + (lay.page === 'a4' ? '210mm 297mm' : lay.w + 'mm ' + lay.h + 'mm') + ';margin:0}}';
    document.documentElement.classList.add('bc-printing');
    window.addEventListener('afterprint', function done() { document.documentElement.classList.remove('bc-printing'); window.removeEventListener('afterprint', done); });
    render(box).then(function () { setTimeout(function () { window.print(); }, 150); });
  }

  /* ---------- items and their codes ---------- */
  function codesHtml() {
    var list = items();
    return '<div class="pane-hd"><h2>' + esc(t('bc.codes')) + '</h2></div><p class="sb-note">' + esc(t('bc.codesh')) + '</p>' +
      (list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="l">' + esc(t('bc.item')) + '</th><th>' + esc(t('bc.code')) + '</th><th></th></tr></thead><tbody>' + list.map(function (m) {
        return '<tr><td class="l">' + esc(m.desc) + '</td><td><input class="mono" data-code="' + esc(m.id) + '" value="' + esc(m.code || '') + '" aria-label="' + esc(t('bc.code')) + ' ' + esc(m.desc) + '"></td><td><span class="hint" data-ck="' + esc(m.id) + '"></span></td></tr>';
      }).join('') + '</tbody></table></div><div class="btns"><button type="button" class="btn primary" data-savecodes>' + esc(t('sb.save')) + '</button></div>'
        : '<p class="soft">' + esc(t('bc.noitems')) + '</p>');
  }
  function nextCodes(n) {
    var used = {}, k = 0, out = [];
    items().forEach(function (m) { if (m.code) used[m.code] = 1; });
    while (out.length < n) { k++; var c = 'NS' + String(k).padStart(6, '0'); if (!used[c]) out.push(c); }
    return out;
  }
  function giveCodes() {
    var need = items().filter(function (m) { return !m.code; }), codes = nextCodes(need.length);
    if (!need.length || !confirm(t('bc.givec', { n: need.length }))) return;
    Promise.all(need.map(function (m, i) { m.code = codes[i]; return NSStore.put('item', m); })).then(function () { NS.toast(t('sb.saved')); show(); });
  }

  /* ---------- scanning ---------- */
  var cam = null;
  function scanHtml() {
    var by = byCode();
    return '<div class="pane-hd"><h2>' + esc(t('bc.scan')) + '</h2></div><p class="sb-note">' + esc(t('bc.scanh')) + '</p>' +
      '<div class="btns"><button type="button" class="btn primary" data-cam>' + esc(t('bc.camon')) + '</button><button type="button" class="btn" data-camoff hidden>' + esc(t('bc.camoff')) + '</button></div>' +
      '<div class="bc-cam" hidden><video playsinline muted></video><div class="bc-aim" aria-hidden="true"></div></div>' +
      '<form class="tools-row" data-typed><label for="bc-typed">' + esc(t('bc.typed')) + '</label><input id="bc-typed" class="mono" autocomplete="off" enterkeyhint="done"><button class="btn sm">' + esc(t('bc.add')) + '</button></form>' +
      (scans.length ? '<ul class="rows">' + scans.map(function (s, i) {
        var m = by[s.code];
        return '<li><div class="ln"><span><b>' + esc(m ? m.desc : t('bc.unknown')) + '</b><span class="soft mono"> · ' + esc(s.code) + '</span></span><b class="amt">× ' + s.n + '</b></div>' +
          '<div class="acts"><button type="button" class="btn sm" data-minus="' + i + '">−1</button>' + (m ? '' : '<button type="button" class="btn sm primary" data-newitem="' + i + '">' + esc(t('bc.saveitem')) + '</button>') +
          '<button type="button" class="btn sm danger" data-rms="' + i + '">' + esc(t('sb.del')) + '</button></div></li>';
      }).join('') + '</ul><div class="btns"><button type="button" class="btn" data-tolabels>' + esc(t('bc.tolabels')) + '</button><button type="button" class="btn" data-csv>' + esc(t('sb.csv')) + '</button><button type="button" class="btn danger" data-clear>' + esc(t('bc.clear')) + '</button></div>'
        : '<p class="soft">' + esc(t('bc.noscans')) + '</p>');
  }
  var last = { code: '', at: 0 };
  function gotCode(code) {
    code = String(code || '').trim(); if (!code) return;
    var now = Date.now(); if (code === last.code && now - last.at < 1500) return;   /* the camera sees the same code many times a second */
    last = { code: code, at: now };
    var s = scans.filter(function (x) { return x.code === code; })[0];
    if (s) s.n++; else scans.unshift({ code: code, n: 1 });
    if (navigator.vibrate) navigator.vibrate(60);
    NS.toast(t('bc.got', { c: code }));
    var pane = $('[data-pane]'); if (!pane) return;
    var on = !!cam; pane.innerHTML = scanHtml(); wire(pane);
    if (on) { $('.bc-cam', pane).hidden = false; $('[data-cam]', pane).hidden = true; $('[data-camoff]', pane).hidden = false; $('.bc-cam', pane).replaceChild(cam.video, $('.bc-cam video', pane)); }
  }
  function startCam() {
    var box = $('.bc-cam'), video = $('.bc-cam video');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { NS.toast(t('bc.nocam'), 'bad'); return; }
    box.hidden = false; $('[data-cam]').hidden = true; $('[data-camoff]').hidden = false;
    var formats = ['code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code', 'code_39'];
    var useNative = 'BarcodeDetector' in window;
    (useNative ? window.BarcodeDetector.getSupportedFormats().then(function (f) { return f.filter(function (x) { return formats.indexOf(x) >= 0; }); }) : Promise.resolve(null)).then(function (fmts) {
      if (useNative && fmts && fmts.length) {
        return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(function (stream) {
          video.srcObject = stream; return video.play().then(function () {
            var det = new window.BarcodeDetector({ formats: fmts });
            cam = { video: video, stream: stream, timer: setInterval(function () { det.detect(video).then(function (r) { if (r && r[0]) gotCode(r[0].rawValue); }).catch(function () {}); }, 250) };
          });
        });
      }
      return NS.loadJs(LIB.zx[0], LIB.zx[1]).then(function () {
        var reader = new window.ZXing.BrowserMultiFormatReader();
        cam = { video: video, reader: reader };
        return reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, function (res) { if (res) gotCode(res.getText()); });
      });
    }).catch(function () { stopCam(); NS.toast(t('bc.camfail'), 'bad'); });
  }
  function stopCam() {
    if (!cam) return;
    try { if (cam.timer) clearInterval(cam.timer); if (cam.stream) cam.stream.getTracks().forEach(function (x) { x.stop(); }); if (cam.reader) cam.reader.reset(); } catch (e) {}
    cam = null;
    var box = $('.bc-cam'); if (box) { box.hidden = true; $('[data-cam]').hidden = false; $('[data-camoff]').hidden = true; }
  }
  function newItemForm(i) {
    var s = scans[i];
    var f = NSB.dialog(t('bc.saveitem'), '<p class="hint mono">' + esc(s.code) + '</p><div class="fg"><div class="f wide"><label for="f-desc">' + esc(t('bc.item')) + '</label><input id="f-desc" dir="auto" required></div>' +
      '<div class="f"><label for="f-rate">' + esc(t('bc.rate')) + '</label><input id="f-rate" inputmode="decimal"></div><div class="f"><label for="f-unit">' + esc(t('stk.unit')) + '</label><input id="f-unit" value="Nos"></div></div>' +
      '<div class="dlg-foot"><button type="submit" class="btn primary">' + esc(t('sb.save')) + '</button><button type="button" class="btn" data-cancel>' + esc(t('sb.cancel')) + '</button></div>');
    $('[data-cancel]', f).addEventListener('click', NSB.closeDialog);
    f.onsubmit = function (e) {
      e.preventDefault();
      var name = $('#f-desc', f).value.trim(); if (!name) return;
      var hit = items().filter(function (m) { return key(m.desc) === key(name); })[0];
      var m = hit || { desc: name, kind: 'goods', unit: $('#f-unit', f).value.trim() || 'Nos', rate: $('#f-rate', f).value === '' ? '' : num($('#f-rate', f).value), gst: '' };
      m.code = s.code;
      NSStore.put('item', m).then(function () { NSB.closeDialog(); NS.toast(t('sb.saved')); show(); });
    };
  }

  function wire(pane) {
    var qi = $('[data-q]', pane);
    if (qi) qi.addEventListener('input', function () { q = qi.value; var pos = qi.selectionStart; show().then(function () { var n = $('[data-q]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }); });
    function set(id, k, fn) { var e = $(id, pane); if (e) e.addEventListener('change', function () { SET[k] = fn ? fn(e) : e.value; keep(); show(); }); }
    set('#bc-layout', 'layout'); set('#bc-type', 'type'); set('#bc-pricel', 'price'); set('#bc-start', 'start', function (e) { return parseInt(e.value, 10) || 1; });
    set('#bc-name', 'name', function (e) { return e.checked; }); set('#bc-text', 'text', function (e) { return e.checked; }); set('#bc-biz', 'biz', function (e) { return e.checked; });
    $$('[data-cust]', pane).forEach(function (e) { e.addEventListener('change', function () { var k = e.getAttribute('data-cust'); SET.custom[k] = k === 'page' ? e.value : num(e.value); keep(); show(); }); });
    $$('[data-pick]', pane).forEach(function (c) { c.addEventListener('change', function () {
      var id = c.getAttribute('data-pick'), m = items().filter(function (x) { return x.id === id; })[0];
      var s = sel[id] || { n: 0, price: m && (m.mrp != null && m.mrp !== '' ? m.mrp : m.rate) };
      s.n = c.checked ? Math.max(1, s.n) : 0; sel[id] = s; show();
    }); });
    $$('[data-copies]', pane).forEach(function (c) { c.addEventListener('change', function () { var id = c.getAttribute('data-copies'), s = sel[id] || {}; s.n = Math.max(0, Math.min(999, parseInt(c.value, 10) || 0)); if (s.price == null) { var m = items().filter(function (x) { return x.id === id; })[0]; s.price = m && m.rate; } sel[id] = s; show(); }); });
    $$('[data-price]', pane).forEach(function (c) { c.addEventListener('change', function () { var id = c.getAttribute('data-price'), s = sel[id] || { n: 0 }; s.price = c.value; sel[id] = s; drawPreview(); }); });
    $$('[data-rmx]', pane).forEach(function (b) { b.addEventListener('click', function () { extra.splice(+b.getAttribute('data-rmx'), 1); show(); }); });
    var ah = $('[data-add-hand]', pane); if (ah) ah.addEventListener('click', function () {
      var f = NSB.dialog(t('bc.byhand'), '<div class="fg"><div class="f"><label for="f-code">' + esc(t('bc.code')) + '</label><input id="f-code" class="mono" required></div><div class="f wide"><label for="f-name">' + esc(t('bc.item')) + '</label><input id="f-name" dir="auto"></div>' +
        '<div class="f"><label for="f-price">' + esc(t('bc.price')) + '</label><input id="f-price" inputmode="decimal"></div><div class="f"><label for="f-n">' + esc(t('bc.copies')) + '</label><input id="f-n" inputmode="numeric" value="1"></div></div>' +
        '<div class="dlg-foot"><button type="submit" class="btn primary">' + esc(t('bc.add')) + '</button><button type="button" class="btn" data-cancel>' + esc(t('sb.cancel')) + '</button></div>');
      $('[data-cancel]', f).addEventListener('click', NSB.closeDialog);
      f.onsubmit = function (e) { e.preventDefault(); var c = $('#f-code', f).value.trim(); if (!c) return; extra.push({ code: c, name: $('#f-name', f).value.trim(), price: $('#f-price', f).value, n: Math.max(1, parseInt($('#f-n', f).value, 10) || 1) }); NSB.closeDialog(); show(); };
    });
    var gc = $('[data-givecodes]', pane); if (gc) gc.addEventListener('click', giveCodes);
    var pr = $('[data-print]', pane); if (pr) pr.addEventListener('click', doPrint);
    var pdf = $('[data-pdf]', pane); if (pdf) pdf.addEventListener('click', function () {
      if (!labels().length) { NS.toast(t('bc.pickfirst'), 'bad'); return; }
      var box = $('#bc-print'); render(box).then(function () { NS.sharePdf($$('.bc-page', box), 'barcode-labels-' + NS.today(), 'a4', 'Barcode labels', 'Barcode labels'); });
    });
    var sc = $('[data-savecodes]', pane); if (sc) sc.addEventListener('click', function () {
      var by = {}, seen = {}, dup = ''; items().forEach(function (m) { by[m.id] = m; });
      var jobs = $$('[data-code]', pane).map(function (inp) {
        var m = by[inp.getAttribute('data-code')], v = inp.value.trim();
        if (v && seen[v]) dup = v; seen[v] = 1;
        if (m && (m.code || '') !== v) { if (v) m.code = v; else delete m.code; return m; }
      }).filter(Boolean);
      if (dup) { NS.toast(t('bc.dup', { c: dup }), 'bad'); return; }
      Promise.all(jobs.map(function (m) { return NSStore.put('item', m); })).then(function () { NS.toast(t('sb.saved')); show(); });
    });
    $$('[data-code]', pane).forEach(function (inp) { function chk() { var v = inp.value.trim(), h = $('[data-ck="' + inp.getAttribute('data-code') + '"]', pane); if (!h) return;
      h.textContent = /^\d{13}$/.test(v) ? (gtinCheck(v.slice(0, 12)) === +v[12] ? t('bc.ean_ok') : t('bc.ean_bad')) : ''; h.className = 'hint ' + (/^\d{13}$/.test(v) && gtinCheck(v.slice(0, 12)) !== +v[12] ? 'bad' : 'good'); }
      inp.addEventListener('input', chk); chk(); });
    var cb = $('[data-cam]', pane); if (cb) cb.addEventListener('click', startCam);
    var cf = $('[data-camoff]', pane); if (cf) cf.addEventListener('click', stopCam);
    var tf = $('[data-typed]', pane); if (tf) { tf.onsubmit = function (e) { e.preventDefault(); var i = $('#bc-typed', tf); var v = i.value; i.value = ''; last.at = 0; gotCode(v); var n = $('#bc-typed'); if (n) n.focus(); }; if (!cam) $('#bc-typed', tf).focus({ preventScroll: true }); }
    $$('[data-minus]', pane).forEach(function (b) { b.addEventListener('click', function () { var s = scans[+b.getAttribute('data-minus')]; s.n--; if (s.n <= 0) scans.splice(scans.indexOf(s), 1); gotRefresh(); }); });
    $$('[data-rms]', pane).forEach(function (b) { b.addEventListener('click', function () { scans.splice(+b.getAttribute('data-rms'), 1); gotRefresh(); }); });
    $$('[data-newitem]', pane).forEach(function (b) { b.addEventListener('click', function () { newItemForm(+b.getAttribute('data-newitem')); }); });
    var cl = $('[data-clear]', pane); if (cl) cl.addEventListener('click', function () { if (confirm(t('bc.clearc'))) { scans = []; gotRefresh(); } });
    var cv = $('[data-csv]', pane); if (cv) cv.addEventListener('click', function () {
      var by = byCode();
      NSB.csv('scanned-' + NS.today() + '.csv', [['Code', 'Item', 'Quantity']].concat(scans.map(function (s) { return [s.code, by[s.code] ? by[s.code].desc : '', s.n]; })));
    });
    var tl = $('[data-tolabels]', pane); if (tl) tl.addEventListener('click', function () {
      var by = byCode();
      scans.forEach(function (s) { var m = by[s.code]; if (m) sel[m.id] = { n: s.n, price: m.mrp != null && m.mrp !== '' ? m.mrp : m.rate }; else extra.push({ code: s.code, name: '', price: '', n: s.n }); });
      location.hash = '';
    });
  }
  function gotRefresh() { var pane = $('[data-pane]'), on = !!cam; pane.innerHTML = scanHtml(); wire(pane); if (on) { $('.bc-cam', pane).hidden = false; $('[data-cam]', pane).hidden = true; $('[data-camoff]', pane).hidden = false; $('.bc-cam', pane).replaceChild(cam.video, $('.bc-cam video', pane)); } }

  function init() {
    if (!$('#barcode')) return;
    window.addEventListener('hashchange', route);
    document.addEventListener('ns-lang', function () { show(); });
    NSStore.ready().then(route).then(function () { NSStore.persist().catch(function () {}); });
    window.addEventListener('pagehide', stopCam);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
