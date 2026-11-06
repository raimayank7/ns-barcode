/* NSB: small shared kit of the stock and books sites (stock., barcode., bank-reco., profit-loss.).
   Loads the data home once per screen, picks the business (same choice as the Nivesh Sahayak App), names saved
   documents, draws the period bar, opens a form dialog, prints or shares one sheet. Screen words: NS.t('sb.*'). */
(function () {
  'use strict';
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, key = function (s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); };
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var TOOLS = (window.NS_CFG && NS_CFG.tools) || [];
  var C = { biz: [], party: [], item: [], doc: [] }, CFG = {}, BIZ = null;

  function t(k, v) { return NS.t(k, v); }
  function load() {
    return Promise.all(['biz', 'party', 'item', 'doc'].map(function (s) { return NSStore.list(s); }).concat([NSStore.meta('settings')])).then(function (r) {
      C = { biz: r[0], party: r[1], item: r[2], doc: r[3] }; CFG = r[4] || {};
      NS.bizCache = C.biz;
      if (NS.cfgSplit(CFG, C.biz)) NSStore.meta('settings', CFG).catch(function () {});   /* settings per business: one-time copy */
      var RAW = CFG;
      var want = NS.curBiz();
      BIZ = C.biz.filter(function (b) { return b.id === want; })[0] || C.biz.filter(function (b) { return b.id === CFG.defBiz; })[0] || C.biz[0] || null;
      if (!BIZ) {   /* no business master yet: the seller of the newest document */
        var d = C.doc.slice().sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); }).filter(function (d) { return d.seller && d.seller.name; })[0];
        if (d) BIZ = Object.assign({ id: '', name: d.seller.name }, d.seller);
      }
      CFG = NS.cfgFor(RAW, BIZ, C.biz);   /* the settings of the business this page works in */
      if (window.NSStock && NSStock.valuation) NSStock.valuation(CFG.stockValue);   /* FIFO or weighted average, My data › Settings */
      return C;
    });
  }
  function bizName() { return BIZ ? BIZ.name : ''; }
  function mine() { var b = key(bizName()); return C.doc.filter(function (d) { return key(d.seller && d.seller.name) === b; }); }
  function sellerCopy() { var s = JSON.parse(JSON.stringify(BIZ || {})); delete s.id; delete s.created; delete s.updated; return s; }
  function bizBar() {
    if (C.biz.length < 2) return '';
    return '<div class="bizbar"><label for="sb-biz">' + esc(t('sb.biz')) + '</label><select id="sb-biz" data-sb-biz>' + C.biz.map(function (b) {
      return '<option value="' + esc(b.id) + '"' + (BIZ && b.id === BIZ.id ? ' selected' : '') + '>' + esc(b.name) + '</option>'; }).join('') + '</select></div>';
  }
  function wireBiz(root, again) {
    var s = $('[data-sb-biz]', root);
    if (s) s.addEventListener('change', function () { NS.setCurBiz(s.value); again(); });
  }
  function toolUrl(site) { var x = TOOLS.filter(function (x) { return x[0] === site; })[0]; if (!x) return 'https://' + site + '.niveshsahayak.in/'; return LOCAL ? 'http://localhost:' + x[4] + '/' : 'https://' + x[1] + '/'; }
  function myUrl(h) { return (LOCAL ? 'http://localhost:8862/' : 'https://my.niveshsahayak.in/') + (h || ''); }
  function noBiz() {
    return '<div class="card"><h2>' + esc(t('sb.nobiz')) + '</h2><p>' + esc(t('sb.nobizp')) + '</p><p><a class="btn primary" href="' + myUrl('#biz/new') + '">' + esc(t('sb.addbiz')) + '</a></p></div>';
  }

  /* the name of any saved record, in the screen language */
  var NAMES = { invoice: 'sb.d.inv', cashmemo: 'sb.d.cm', self: 'sb.d.self', receipt: 'sb.d.rcpt', exp: 'sb.d.exp', ob: 'sb.d.ob' };
  function docName(d) {
    var ty = d.type || 'invoice';
    if (ty === 'note') return t(d.kind === 'debit' ? 'sb.d.dn' : 'sb.d.cn');
    if (ty === 'pbill') return t(d.kind === 'return' ? 'sb.d.pret' : 'sb.d.pbill');
    if (ty === 'voucher') return t('sb.d.vch');
    if (ty === 'stk') return t(d.kind === 'open' ? 'sb.d.open' : 'sb.d.adj');
    return NAMES[ty] ? t(NAMES[ty]) : ty;
  }
  /* the same in English, for printed sheets */
  var EN_NAMES = { invoice: 'Invoice', cashmemo: 'Cash memo', self: 'Self invoice', receipt: 'Receipt', exp: 'Expense', ob: 'Opening balance', voucher: 'Payment' };
  function enName(d) {
    var ty = d.type || 'invoice';
    if (ty === 'note') return d.kind === 'debit' ? 'Debit note' : 'Credit note';
    if (ty === 'pbill') return d.kind === 'return' ? 'Purchase return' : 'Purchase bill';
    if (ty === 'stk') return d.kind === 'open' ? 'Opening stock' : 'Stock adjustment';
    return EN_NAMES[ty] || ty;
  }

  /* period: this financial year to today by default; kept per site in this browser */
  function fyStart(iso) { return NS.fy(iso).slice(0, 4) + '-04-01'; }
  function period(site) {
    var p = {}; try { p = JSON.parse(localStorage.getItem('ns-' + site + '-period') || '{}'); } catch (e) {}
    return { from: p.from || fyStart(NS.today()), to: p.to || NS.today() };
  }
  function periodBar(site, extra) {
    var p = period(site);
    return '<div class="sb-period"><div class="f"><label for="sb-from">' + esc(t('sb.from')) + '</label><input type="date" id="sb-from" value="' + esc(p.from) + '"></div>' +
      '<div class="f"><label for="sb-to">' + esc(t('sb.to')) + '</label><input type="date" id="sb-to" value="' + esc(p.to) + '"></div>' +
      '<button type="button" class="btn sm" data-sb-fy>' + esc(t('sb.thisfy')) + '</button>' + (extra || '') + '</div>';
  }
  function wirePeriod(root, site, again) {
    function set(f, to) { try { localStorage.setItem('ns-' + site + '-period', JSON.stringify({ from: f, to: to })); } catch (e) {} again(); }
    var f = $('#sb-from', root), to = $('#sb-to', root), fy = $('[data-sb-fy]', root);
    if (f) f.addEventListener('change', function () { set(f.value, to.value); });
    if (to) to.addEventListener('change', function () { set(f.value, to.value); });
    if (fy) fy.addEventListener('click', function () { set(fyStart(NS.today()), NS.today()); });
  }

  /* one form dialog for the whole site: <dialog id="sb-form"> with a title and a <form> */
  function dialog(title, html) {
    var dlg = $('#sb-form');
    $('[data-form-title]', dlg).textContent = title;
    var form = $('form', dlg);
    form.innerHTML = html;
    if (!dlg.open) dlg.showModal();
    NS.applyLang(form);
    var first = $('input:not([type=hidden]),select', form); if (first) first.focus();
    return form;
  }
  function closeDialog() { var dlg = $('#sb-form'); if (dlg.open) dlg.close(); }

  /* print one sheet (the page's print CSS shows only .stsheet), or share it as a PDF */
  function printSheet() { window.print(); }
  function shareSheet(node, name, text) { return NS.sharePdf([node], name, 'a4', name, text || name); }
  function csv(name, rows) {
    var cell = function (v) { v = v == null ? '' : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var blob = new Blob(['﻿' + rows.map(function (r) { return r.map(cell).join(','); }).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
  }
  function modeLine() { var m = $('[data-mode]'); if (m) m.textContent = t(NSStore.mode() === 'vault' ? 'sb.vault' : 'sb.local'); }
  function focusH2(pane) { var h2 = $('h2', pane); if (h2) { h2.tabIndex = -1; h2.focus({ preventScroll: true }); } }
  function navMark(cur) { $$('[data-sec]').forEach(function (b) { b.setAttribute('aria-current', b.getAttribute('data-sec') === cur ? 'page' : 'false'); }); }

  window.NSB = { t: t, key: key, load: load, data: function () { return C; }, cfg: function () { return CFG; }, biz: function () { return BIZ; }, bizName: bizName, mine: mine, sellerCopy: sellerCopy,
    bizBar: bizBar, wireBiz: wireBiz, noBiz: noBiz, toolUrl: toolUrl, myUrl: myUrl, docName: docName, enName: enName, fyStart: fyStart, period: period, periodBar: periodBar,
    wirePeriod: wirePeriod, dialog: dialog, closeDialog: closeDialog, printSheet: printSheet, shareSheet: shareSheet, csv: csv, modeLine: modeLine, focusH2: focusH2, navMark: navMark, LOCAL: LOCAL };
})();
