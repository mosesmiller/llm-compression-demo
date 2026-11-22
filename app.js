/* Class site: "A model is a compression". Renders every section from window.RESULTS
   (written by pipeline/08_build_site_data.py, or a mock with meta.mock = true).
   Each section is drawn on its own and degrades to a short note when its data is missing,
   so a partial run (no judge yet, no 32B yet) still gives a working page. */
(function () {
  'use strict';
  const R = window.RESULTS || null;
  const $ = id => document.getElementById(id);
  const esc = VZ.esc, fin = VZ.finite;
  const get = (o, path, d) => { let v = o; for (const k of path.split('.')) { if (v == null) return d; v = v[k]; } return v == null ? d : v; };

  // ---------- formatting
  function fmtBytes(b) {
    if (!fin(b)) return 'n/a';
    const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let i = 0; while (b >= 1000 && i < u.length - 1) { b /= 1000; i++; }
    return (b >= 100 ? b.toFixed(0) : b >= 10 ? b.toFixed(1) : b.toFixed(2)) + ' ' + u[i];
  }
  function fmtBig(n, unitWord) {
    if (!fin(n)) return 'n/a';
    const s = [[1e12, ' trillion'], [1e9, ' billion'], [1e6, ' million'], [1e3, ' thousand']];
    for (const [v, w] of s) if (n >= v) { const x = n / v; return (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)).replace(/\.0+$|(\.\d*[1-9])0+$/, '$1') + (unitWord === false ? w.trim()[0].toUpperCase() : w); }
    return String(Math.round(n));
  }
  const fmtGB2 = b => fin(b) ? (b / 1e9).toFixed(2) + ' GB' : 'n/a';      // "19.57 GB": the measured Wikipedia text
  const fmtParams = p => fin(p) ? (p >= 1e8 ? (p / 1e9).toFixed(1).replace(/\.0$/, '') + 'B' : (p / 1e6).toFixed(0) + 'M') : '?';
  const fmtInt = n => fin(n) ? Math.round(n).toLocaleString('en-US') : 'n/a';
  const pct = (v, d) => fin(v) ? (v * 100).toFixed(d || 0) + '%' : 'n/a';
  const f2 = v => fin(v) ? v.toFixed(2) : 'n/a';
  const f3 = v => fin(v) ? v.toFixed(3) : 'n/a';
  const times = (a, b) => fin(a) && fin(b) && b > 0 ? a / b : NaN;
  const fx = v => fin(v) ? (v >= 100 ? fmtInt(v) : v >= 10 ? v.toFixed(0) : v.toFixed(1)) + '×' : 'n/a';

  // ---------- models and colours (colour follows the model, never its rank)
  const SLOT = { 'qwen2.5-7b': 1, 'qwen3-0.6b': 2, 'qwen2.5-32b': 3 };
  const extraSlots = {};
  function color(key) {
    if (SLOT[key]) return `var(--s${SLOT[key]})`;
    if (!extraSlots[key]) extraSlots[key] = 4 + Object.keys(extraSlots).length % 2;
    return `var(--s${extraSlots[key]})`;
  }
  const MODELS = (get(R, 'models', []) || []).slice().sort((a, b) => (a.params || 0) - (b.params || 0));
  const MAIN = get(R, 'meta.main_model', 'qwen2.5-7b');
  const model = k => MODELS.find(m => m.key === k) || { key: k, label: k };
  const short = k => { const m = model(k); return (m.label || k).replace(/\s*Instruct/i, '').replace(/\s*\(.*\)\s*/, '').trim(); };
  const resultModels = () => MODELS.filter(m => R && R.summary && R.summary[m.key]).map(m => m.key);
  const mainModel = () => { const rm = resultModels(); return rm.includes(MAIN) ? MAIN : rm[0]; };
  const BINS = () => (get(R, 'bins', []) || []).map(b => b.label);
  const binLabel = l => l === '<10' ? 'under 10' : l === '>=1M' ? '1M+' : l;

  // Judge results may arrive as shares or as counts: always show shares.
  function judgeShares(j) {
    if (!j) return null;
    const c = +j.correct || 0, o = +j.omitted || 0, x = +j.contradicted || 0, t = c + o + x;
    if (!(t > 0)) return null;
    return t > 1.5 ? { correct: c / t, omitted: o / t, contradicted: x / t } : { correct: c, omitted: o, contradicted: x };
  }
  function tpb(family) {
    const t = get(R, 'sizes.tokens_per_byte', null);
    if (fin(t)) return t;
    if (t && typeof t === 'object') return t[family] || t[MAIN] || Object.values(t).find(fin);
    return NaN;
  }
  function trainingBytes(family) {
    const tt = get(R, 'sizes.training_tokens', {}) || {};
    const t = fin(tpb(family)) ? tpb(family) : 0.2418;          // tokens per byte measured on Wikipedia text
    return fin(tt[family]) ? tt[family] / t : NaN;
  }
  // English Wikipedia only. The Hugging Face snapshot holds 6.41M of about 6.7M articles, so its text is a lower bound.
  const WIKI_ALL_ARTICLES = 6.7e6;
  const QWEN_REPORT = { url: 'https://arxiv.org/abs/2412.15115', name: 'Qwen2.5 Technical Report', id: 'arXiv:2412.15115' };
  const QWEN3_REPORT = { url: 'https://arxiv.org/abs/2505.09388', name: 'Qwen3 Technical Report', id: 'arXiv:2505.09388' };
  const srcLink = (r = QWEN_REPORT) => `<a href="${r.url}" target="_blank" rel="noopener">${r.name} (${r.id})</a>`;
  // "N parameters at B bits": the file also holds scaling numbers (4-bit) or a second copy of the word table (16-bit),
  // so say how many bits per parameter the file really takes.
  function bitsNote(m, brief) {
    if (!m || !m.bits) return '';
    const per = fin(m.disk_bytes) && fin(m.params) && m.params > 0 ? m.disk_bytes * 8 / m.params : NaN;
    if (!fin(per) || per <= m.bits * 1.05) return ` at ${m.bits} bits each`;
    if (m.bits < 16) return brief ? `, about ${per.toFixed(1)} bits each on disk (${m.bits}-bit weights plus scaling numbers)`
      : `, stored at ${m.bits} bits each plus a scale and an offset for every small group of weights: about ${per.toFixed(1)} bits per parameter on disk`;
    return brief ? `, about ${per.toFixed(1)} bits each on disk`
      : `, stored at ${m.bits} bits each; the file also keeps a second copy of its word table (the output layer), so it works out to about ${per.toFixed(1)} bits per parameter`;
  }
  function decompModel(k) {
    const ms = get(R, 'decompression.models', null);                    // keys contain dots, so no get() path here
    return (ms && ms[k]) || null;
  }
  function decompTotals(k) {
    const m = decompModel(k);
    return m && m.totals && fin(m.totals.gen_bytes) ? m.totals : null;
  }
  // v3: "meaningful" = sentences the real article confirms (fact check); older data: embedding similarity
  const decompNLI = () => get(R, 'decompression.method', '') === 'nli' || fin((decompTotals(MAIN) || {}).contradicted_bytes);
  const fxr = v => !fin(v) ? 'n/a' : v < 1 ? v.toFixed(2) + '×' : fx(v);

  // ---------- weighting. The sample is balanced (the same number of topics from every popularity level), so a plain
  // average over it gives popular topics far more weight than they have in Wikipedia. Where the data allows, levels are
  // re-weighted by their share of articles ("a typical topic") or of page views ("by reading").
  const BALANCED = 'Balanced sample: each popularity level counts equally.';
  const GROUPS = [
    { label: 'Long tail (under 100 views)', short: 'Long tail', idx: [0, 1], color: 'var(--floor)', say: 'read under 100 times a month' },
    { label: 'Middle (100 to 10k)', short: 'Middle', idx: [2, 3], color: 'var(--title)', say: 'read 100 to 10,000 times a month' },
    { label: 'Popular (10k+ views)', short: 'Popular', idx: [4, 5, 6, 7, 8], color: 'var(--ink)', say: 'read 10,000+ times a month' },
  ];
  const binShare = (label, key) => { const b = (get(R, 'bins', []) || []).find(x => x.label === label); return b ? b[key] : NaN; };
  function weightRows(rows, val, key, labels) {          // rows: [{label, ...}], key: 'share_articles' | 'share_views'
    let s = 0, t = 0;
    (rows || []).forEach(r => {
      if (!r || (labels && !labels.includes(r.label))) return;
      const v = val(r), w = binShare(r.label, key);
      if (fin(v) && fin(w) && w > 0) { s += w * v; t += w; }
    });
    return t > 0 ? s / t : NaN;
  }
  const groupLabels = g => g.idx.map(i => BINS()[i]).filter(Boolean);
  // Per popularity level, from the items a model answered: its similarity and the reference points on the same topics.
  const perBinCache = {};
  function perBin(k) {
    if (perBinCache[k]) return perBinCache[k];
    const avg = a => { const v = a.filter(fin); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : NaN; };
    const para = i => i.paraphrase && fin(i.paraphrase.cos) ? i.paraphrase.cos : NaN;
    const rescale = (v, i) => { const d = para(i) - i.floor_cos; return fin(v) && fin(d) && d > 0 ? Math.max(0, Math.min(1, (v - i.floor_cos) / d)) : NaN; };
    const real = (get(R, 'items', []) || []).filter(i => i.kind === 'real' && i.recon && i.recon[k] && fin(i.recon[k].cos));
    return (perBinCache[k] = BINS().map(label => {
      const its = real.filter(i => i.bin === label);
      return { label, n: its.length, cos: avg(its.map(i => i.recon[k].cos)), title: avg(its.map(i => i.title_cos)), para: avg(its.map(para)),
        titleRec: avg(its.map(i => rescale(i.title_cos, i))) };
    }));
  }
  // Share of the way from the bare title (0) to a paraphrase of the real text (1) that the rewrite covers.
  function gapW(k, key) {
    const rows = perBin(k), c = weightRows(rows, r => r.cos, key), t = weightRows(rows, r => r.title, key), p = weightRows(rows, r => r.para, key);
    return fin(c) && fin(t) && fin(p) && p > t ? (c - t) / (p - t) : NaN;
  }
  const fmtGap = v => !fin(v) ? 'n/a' : v >= 0.005 ? pct(v) : 'none';
  // Bits per byte of the real text for all of Wikipedia: step 08's population-weighted mean when it is there.
  function bpbOf(k) {
    const l = (get(R, 'compression.llm', []) || []).find(x => x.model === k) || {};
    if (fin(l.bpb_pop_weighted)) return { v: l.bpb_pop_weighted, weighted: true };
    return { v: fin(l.bpb_mean) ? l.bpb_mean : get(R, 'summary.' + k + '.bpb_mean', NaN), weighted: false };
  }

  // Some titles carry a year ("<year> Chatham Cup"). Step 06 may leave such years out of "years recalled". Tell from the
  // data whether it did: a topic whose real-lead years all appear in its title then has no score at all.
  const YEAR_RE = /(?<![\d.])(1\d{3}|20\d{2})(?!\d)/g;
  const yearsOf = t => new Set(String(t || '').match(YEAR_RE) || []);
  let yearsInfo = null;
  function titleYears() {
    if (yearsInfo) return yearsInfo;
    let none = 0, scored = 0, example = null;
    (get(R, 'items', []) || []).forEach(it => {
      if (it.kind !== 'real' || !it.recon) return;
      const ty = yearsOf(it.title), ey = yearsOf(it.excerpt);
      if (!ty.size || !ey.size || ![...ey].every(y => ty.has(y))) return;
      if (!example && BINS().indexOf(it.bin) < 2 && !sensitive(it)) example = it.title;    // a rarely read, neutral one
      Object.values(it.recon).forEach(r => { if (r) { if (fin(r.year_recall)) scored++; else none++; } });
    });
    return (yearsInfo = { excluded: none + scored ? none > scored : null, example });
  }
  function yearNote() {
    const y = titleYears();
    if (y.excluded === true) return ' Years already in the title are not counted.';
    if (y.excluded === false) return ` Some titles contain a year${y.example ? ` (like "${y.example}")` : ''}, which the model gets for free; that lifts the score of some rarely read topics.`;
    return '';
  }

  // Adult and other sensitive topics stay in every statistic but are left out of the explorer's default list and its
  // random pick, so a projected page does not land on them by chance. Typing the exact title still finds them.
  // Same patterns as the article viewer's "Random topic" (js/decompress.js).
  const SENS_TITLE = /porn|xnxx|\bsex|erotic|\bnude|nazi|massacre|genocide|holocaust|terroris|suicide|\brap(e|ist)\b|murder|lynch(ing|ed)\b/i;
  const SENS_LEAD = /pornograph|erotic|sex offender|sexual (abuse|assault|misconduct)|child abuse|massacre|genocide/i;
  const sensitive = it => !!it && (SENS_TITLE.test(String(it.title || '')) || SENS_LEAD.test(String(it.excerpt || '').slice(0, 600)));
  // The plain-text Wikipedia copy drops values filled in by templates, which leaves holes such as "In  it had a population of ."
  const HOLES = /\(\s*[;,)]|[(;,]\s*;|\b(of|in|between|and|from|to|was|is|at|about|approximately|weighing|tall|standing|by|on|than|around|season|were|are|with)\s+[.,;:)]|\s{2,}[.,;:)]/i;

  // ---------- small DOM helpers
  function empty(container, text) { if (container) container.innerHTML = `<div class="empty">${esc(text)}</div>`; }
  function seg(container, options, current, onPick) {
    container.innerHTML = '';
    options.forEach(o => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'seg-b' + (o.value === current ? ' is-on' : '');
      b.innerHTML = (o.color ? `<span class="sw" style="background:${o.color}"></span>` : '') + esc(o.label) + (o.note ? ` <small>${esc(o.note)}</small>` : '');
      b.setAttribute('aria-pressed', o.value === current);
      b.addEventListener('click', () => {
        container.querySelectorAll('.seg-b').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-pressed', x === b); });
        onPick(o.value);
      });
      container.appendChild(b);
    });
  }
  function safe(name, fn) {
    try { fn(); } catch (e) { console.warn('Section "' + name + '" could not be drawn:', e); }
  }

  // ---------- grouped columns (used for the popularity chart)
  function columns(container, o) {
    const fr = VZ.frame(container, { legend: o.series.map(s => ({ label: s.label, color: s.color, kind: 'box' })), margin: { left: 54, right: 12, bottom: 52 } });
    const x = VZ.band(o.labels, [0, fr.w], 0.28);
    const vmax = Math.max(...o.series.flatMap(s => s.values.filter(fin)));
    const y = VZ.linear(VZ.nice(0, vmax, 4), [fr.h, 0]);
    VZ.axisY(fr, y, { format: o.format, label: o.yLabel });
    VZ.axisX(fr, x, { label: o.xLabel, format: o.xFormat });
    const k = o.series.length, gap = 2, bw = Math.min(24, (x.bw - gap * (k - 1)) / k);
    o.labels.forEach((lab, i) => {
      const x0 = x(lab) - (k * bw + (k - 1) * gap) / 2;
      o.series.forEach((s, j) => {
        const v = s.values[i]; if (!fin(v)) return;
        const bx = x0 + j * (bw + gap), by = y(v), h = Math.max(0, y(0) - by), r = Math.min(4, h / 2, bw / 2);
        VZ.el('path', { d: `M${bx},${y(0)}V${by + r}A${r},${r} 0 0 1 ${bx + r},${by}H${bx + bw - r}A${r},${r} 0 0 1 ${bx + bw},${by + r}V${y(0)}Z`, style: { fill: s.color } }, fr.marks);
      });
      const hit = VZ.el('rect', { class: 'hit', x: x(lab) - x.step / 2, y: 0, width: x.step, height: fr.h, style: { cursor: 'default' } }, fr.top);
      hit.addEventListener('pointermove', ev => VZ.tip.show(`<div class="tt-h">${esc(o.tipHead ? o.tipHead(lab) : lab)}</div>` + o.series.map(s => VZ.tip.row(s.color, s.label, (o.tipFormat || o.format)(s.values[i]))).join(''), ev.clientX, ev.clientY));
      hit.addEventListener('pointerleave', () => VZ.tip.hide());
    });
  }

  // =====================================================================
  // 1 the question
  function renderHero() {
    const mm = model(MAIN);
    if (fin(mm.disk_bytes)) $('heroModelSize').textContent = fmtBytes(mm.disk_bytes);
    const s = get(R, 'sizes', null);
    $('heroSrc').innerHTML = '';
    if (!s) { $('heroNums').innerHTML = ''; $('heroPunch').innerHTML = R ? '' : 'Results are not built yet. Run the pipeline (see README), then reload. The regression playground and the live lab work already.'; return; }
    const cards = [
      { c: 'var(--title)', lab: 'English Wikipedia as plain text', pre: 'at least', val: fmtGB2(s.wiki_text_bytes), det: `${fmtBig(s.wiki_articles)} articles (of about ${fmtBig(WIKI_ALL_ARTICLES)}) · ${fmtBig(s.wiki_words)} words` },
      { c: 'var(--floor)', lab: 'The same text, zipped without losing a letter', val: fmtBytes(s.wiki_zst_bytes), det: `zstd level 19 · ${fx(times(s.wiki_text_bytes, s.wiki_zst_bytes))} smaller` },
      { c: color(MAIN), lab: `${short(MAIN)}: the model file`, val: fmtBytes(mm.disk_bytes), det: `${fmtBig(mm.params)} parameters${bitsNote(mm, true)}` },
    ];
    $('heroNums').innerHTML = cards.map(c => `<div class="bignum reveal" style="--c:${c.c}"><div class="lab">${esc(c.lab)}</div><div class="val">${c.pre ? `<span class="pre">${esc(c.pre)}</span>` : ''}${c.val.replace(/\s(\w+)$/, '<small>$1</small>')}</div><div class="det">${esc(c.det)}</div></div>`).join('');
    const fam = mm.family || 'qwen2.5', tb = trainingBytes(fam);
    const vsText = times(s.wiki_text_bytes, mm.disk_bytes), vsZip = times(s.wiki_zst_bytes, mm.disk_bytes);
    let punch = vsZip > 1 ? 'The model file is <b>smaller than English Wikipedia zipped exactly</b> with a standard tool (zstd).' : `The model file is <b>${fx(vsText)} smaller</b> than English Wikipedia's text.`;
    const dt = decompTotals(MAIN), dm = decompModel(MAIN), elig = get(R, 'decompression.eligible_topics', NaN);
    if (dt) {
      const disk = fin(dm.model_disk_bytes) ? dm.model_disk_bytes : mm.disk_bytes;
      const all = !(fin(elig) && fin(dm.topics_covered) && dm.topics_covered < elig * 0.995);
      punch += ` Given only the titles, it writes about <b>${fmtBytes(dt.gen_bytes)}</b> of encyclopedia text, ${fxr(dt.gen_bytes / disk)} its own size, for ${all ? (fin(elig) ? `all ${fmtBig(elig)} eligible English topics (lists, disambiguation pages and very short articles are left out)` : 'every eligible English topic') : 'the English topics measured so far'}.`;
      if (fin(dt.meaningful_bytes)) punch += decompNLI()
        ? ` Fact-checked against the real articles, <b>${fmtBytes(dt.meaningful_bytes)}</b> of it is confirmed (${fxr(dt.meaningful_bytes / disk)} its size).`
        : ` About <b>${fmtBytes(dt.meaningful_bytes)}</b> of it matches the real articles.`;
    } else punch += ' Can it write the encyclopedia back from the titles alone? Section 4 tests it.';
    $('heroPunch').innerHTML = punch;
    const round2 = v => { const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1)); return Math.round(v / p) * p; };
    const tok = (get(R, 'sizes.training_tokens', {}) || {})[fam];
    if (fin(tb)) $('heroSrc').innerHTML = `For context: ${esc(short(MAIN).split(' ')[0])} learned from about ${esc(fmtBig(tok))} tokens, roughly ${esc(fmtBytes(round2(tb)).replace(/\.0+(?=\s)/, ''))} of text (some ${esc(fmtInt(round2(tb / s.wiki_text_bytes)))} English Wikipedias). Source: ${srcLink()}.`;
  }

  // =====================================================================
  // 3 sizes
  function sizeEntries(withTrain) {
    const s = get(R, 'sizes', {});
    const out = [];
    if (fin(s.wiki_text_bytes)) out.push({ k: 'wiki', name: 'English Wikipedia text', sub: `at least · ${fmtBig(s.wiki_articles)} articles`, bytes: s.wiki_text_bytes, val: fmtGB2(s.wiki_text_bytes), c: 'var(--title)',
      say: `English Wikipedia (snapshot ${get(R, 'meta.wiki_snapshot', '2023-11-01')}) as plain text: at least ${fmtGB2(s.wiki_text_bytes)}, with ${fmtBig(s.wiki_articles)} articles and ${fmtBig(s.wiki_words)} words. The copy we used holds ${fmtBig(s.wiki_articles)} of about ${fmtBig(WIKI_ALL_ARTICLES)} articles (some large ones are missing), so the full text is a little bigger. This is the "data" we try to get back.` });
    if (fin(s.wiki_zst_bytes)) out.push({ k: 'zst', name: 'English Wikipedia, zipped exactly', sub: 'zstd -19, lossless', bytes: s.wiki_zst_bytes, c: 'var(--floor)', lossless: true,
      say: `The same text compressed with zstd at level 19: ${fmtBytes(s.wiki_zst_bytes)}. Lossless: unzip it and you get every letter back. Other everyday zip tools land in the same range; a language model driving the zip needs far fewer bits (section 5).` });
    MODELS.forEach(m => {
      if (!fin(m.disk_bytes)) return;
      out.push({ k: m.key, name: short(m.key), sub: `${fmtParams(m.params)} parameters`, bytes: m.disk_bytes, c: color(m.key),
        say: `${m.label}: ${fmtBytes(m.disk_bytes)} on disk, ${fmtBig(m.params)} parameters${bitsNote(m, false)}. ${fx(times(s.wiki_text_bytes, m.disk_bytes))} smaller than English Wikipedia's text${times(s.wiki_zst_bytes, m.disk_bytes) > 1 ? ` and ${fx(times(s.wiki_zst_bytes, m.disk_bytes))} smaller than the zipped text` : `; larger than the zipped text`}.` });
    });
    const fam = model(MAIN).family || 'qwen2.5', tb = trainingBytes(fam);
    if (withTrain && fin(tb)) {
      const tok = (get(R, 'sizes.training_tokens', {}) || {})[fam];
      const famName = f => { const ks = MODELS.filter(m => m.family === f).map(m => short(m.key)); return ks.length ? ks.join(', ') : f; };
      const other = Object.entries(get(R, 'sizes.training_tokens', {}) || {}).filter(([f, t]) => f !== fam && fin(t))
        .map(([f, t]) => `${famName(f)} learned from about ${fmtBig(t)} tokens${f === 'qwen3' ? ` (${QWEN3_REPORT.name}, ${QWEN3_REPORT.id})` : ''}`).join('; ');
      out.push({ k: 'train', name: `${short(MAIN).split(' ')[0]} training data`, sub: `≈ ${fmtBig(tok)} tokens (estimate)`, bytes: tb, c: 'var(--s5)',
        say: `Context, not part of the test: ${short(MAIN).split(' ')[0]} was trained on about ${fmtBig(tok)} tokens (${QWEN_REPORT.name}). At ${f3(fin(tpb(fam)) ? tpb(fam) : 0.2418)} tokens per byte (measured on Wikipedia) that is about ${fmtBytes(tb)} of text: web pages, books, code. ${fx(tb / s.wiki_text_bytes)} English Wikipedia, ${fx(tb / model(MAIN).disk_bytes)} the model file.${other ? ' ' + other + '.' : ''}` });
    }
    return out;
  }
  const sizesState = { mode: 'area', train: false, sel: null };
  function renderSizes() {
    const box = $('sizes');
    if (!get(R, 'sizes', null)) { empty(box, 'Sizes appear once the pipeline has run.'); return; }
    const items = sizeEntries(sizesState.train);
    if (!sizesState.sel || !items.find(i => i.k === sizesState.sel)) sizesState.sel = MAIN;
    const detail = k => { const it = items.find(i => i.k === k); $('sizesDetail').textContent = it ? it.say : ''; };
    if (sizesState.mode === 'area') {
      let row = box.querySelector('.sizes-row');
      if (!row) { box.innerHTML = '<div class="sizes-row"></div>'; row = box.querySelector('.sizes-row'); }
      const W = (box.clientWidth || 800) - 4;
      const maxB = Math.max(...items.map(i => i.bytes));
      // largest square side such that every block (or its label, min 120px) fits on one row
      const gap = 22, labW = W < 640 ? 96 : 136;
      const rowW = S => items.reduce((a, i) => a + Math.max(Math.sqrt(i.bytes / maxB) * S, labW), 0) + gap * (items.length - 1);
      let lo = 20, hi = sizesState.train ? 460 : 300;
      for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (rowW(mid) <= W) lo = mid; else hi = mid; }
      const maxSide = W < 640 ? Math.min(W * 0.62, hi) : lo;
      const order = items.slice().sort((a, b) => b.bytes - a.bytes);
      const existing = new Map([...row.children].map(c => [c.dataset.k, c]));
      order.forEach(it => {
        let node = existing.get(it.k);
        if (!node) {
          node = document.createElement('button'); node.type = 'button'; node.className = 'sz'; node.dataset.k = it.k;
          node.innerHTML = `<div class="sz-box${it.lossless ? ' lossless' : ''}" style="--c:${it.c};width:0;height:0"></div><div class="sz-lab"></div>`;
          node.addEventListener('click', () => { sizesState.sel = it.k; renderSizes(); });
          node.addEventListener('mouseenter', () => detail(it.k));
          node.addEventListener('mouseleave', () => detail(sizesState.sel));
        }
        row.appendChild(node);
        existing.delete(it.k);
        const side = Math.max(3, Math.sqrt(it.bytes / maxB) * maxSide);
        node.style.width = Math.max(side, labW) + 'px';
        requestAnimationFrame(() => { const b = node.querySelector('.sz-box'); b.style.width = side + 'px'; b.style.height = side + 'px'; });
        node.querySelector('.sz-lab').innerHTML = `<b>${it.val || fmtBytes(it.bytes)}</b>${esc(it.name)}<br><span>${esc(it.sub)}</span>`;
        node.classList.toggle('is-sel', it.k === sizesState.sel);
        node.setAttribute('aria-label', `${it.name}: ${it.val || fmtBytes(it.bytes)}`);
      });
      existing.forEach(n => n.remove());
    } else {
      const lo = Math.pow(10, Math.floor(Math.log10(Math.min(...items.map(i => i.bytes))))), hi = Math.pow(10, Math.ceil(Math.log10(Math.max(...items.map(i => i.bytes)))));
      const pos = b => (Math.log10(b) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) * 100;
      const order = items.slice().sort((a, b) => b.bytes - a.bytes);
      let ticks = ''; for (let v = lo; v <= hi * 1.0001; v *= 10) ticks += `<span style="left:${pos(v)}%">${fmtBytes(v).replace(/\.0+(?=\s)/, '')}</span>`;
      box.innerHTML = `<div class="logbars">${order.map(it => `<div class="lb${it.k === sizesState.sel ? ' is-sel' : ''}" data-k="${it.k}" role="button" tabindex="0"><div class="nm">${esc(it.name)}<small>${esc(it.sub)}</small></div><div class="tr"><div class="bar${it.lossless ? ' lossless' : ''}" style="--c:${it.c};width:0"></div><span class="vv" style="left:0">${it.val || fmtBytes(it.bytes)}</span></div></div>`).join('')}<div class="lb lb-axis" aria-hidden="true"><div></div><div class="logaxis">${ticks}</div></div></div><p class="note">Log scale: each step to the right is 10× bigger.</p>`;
      box.querySelectorAll('.lb[data-k]').forEach(n => {
        const it = items.find(i => i.k === n.dataset.k), w = Math.max(0.5, pos(it.bytes));
        requestAnimationFrame(() => { n.querySelector('.bar').style.width = w + '%'; n.querySelector('.vv').style.left = `calc(${w}% + 2px)`; });
        const pick = () => { sizesState.sel = it.k; renderSizes(); };
        n.addEventListener('click', pick);
        n.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
        n.addEventListener('mouseenter', () => detail(it.k));
        n.addEventListener('mouseleave', () => detail(sizesState.sel));
      });
    }
    detail(sizesState.sel);
    const s = R.sizes, mm = model(MAIN);
    $('sizesLead').textContent = sizesState.mode === 'area' ? 'Each square\'s area is proportional to its size on disk. Hover or click for details. Striped = lossless.' : 'The same sizes on a log scale, so the smallest ones stay visible.';
    const bp = bpbOf(MAIN);
    $('sizesTake').textContent = `${short(MAIN)} is ${fx(times(s.wiki_text_bytes, mm.disk_bytes))} smaller than English Wikipedia's text${times(s.wiki_zst_bytes, mm.disk_bytes) > 1 ? ' and smaller than an exact zstd zip of it' : ''}, and it learned from far more than Wikipedia. It cannot keep every word${fin(bp.v) ? `: even with the model in hand, the real text still costs about ${f2(bp.v)} bits per byte (section 5)` : ''}. It keeps the patterns and drops details (lossy compression). The next section tests how much of the encyclopedia it can write back from the titles alone.`;
    const tok = (get(R, 'sizes.training_tokens', {}) || {})[model(MAIN).family || 'qwen2.5'];
    $('sizesSrc').innerHTML = `English Wikipedia only. Training data (the switch above) is context, not part of the test${fin(tok) ? `: about ${esc(fmtBig(tok))} tokens` : ''}, from the ${srcLink()}, converted to bytes at ${f3(fin(tpb(model(MAIN).family || 'qwen2.5')) ? tpb(model(MAIN).family || 'qwen2.5') : 0.2418)} tokens per byte, as measured on Wikipedia text.`;
  }
  function bindSizes() {
    document.querySelectorAll('[data-sizes]').forEach(b => b.addEventListener('click', () => {
      sizesState.mode = b.dataset.sizes;
      document.querySelectorAll('[data-sizes]').forEach(x => x.classList.toggle('is-on', x === b));
      $('sizes').innerHTML = ''; renderSizes();
    }));
    $('sizesTrain').addEventListener('change', e => { sizesState.train = e.target.checked; if (sizesState.mode === 'log') $('sizes').innerHTML = ''; renderSizes(); });
    let w = 0;
    new ResizeObserver(() => { const nw = $('sizes').clientWidth; if (Math.abs(nw - w) > 20) { w = nw; renderSizes(); } }).observe($('sizes'));
  }

  // =====================================================================
  // 4 the experiment
  const ICONS = {
    sample: '<path d="M4 19h16M6 16V9M10 16V5M14 16v-5M18 16V7"/>',
    title: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 12h6"/>',
    write: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    embed: '<circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="9" r="2.5"/><circle cx="10" cy="17" r="2.5"/><path d="M9.2 8.3l5.5 0.4M8 9.4l1.5 5.2M15.3 11l-3.6 4.4"/>',
    compare: '<path d="M4 18l4-6 4 3 4-7 4 5"/><path d="M4 21h16"/>',
  };
  function renderExperiment() {
    const n = get(R, 'meta.n_real', null), nb = BINS().length;
    const bl = (get(R, 'bins', []) || []).filter(b => fin(b.n_sampled)), per = bl.length ? Math.max(...bl.map(b => b.n_sampled)) : null;
    const small = bl.filter(b => b.n_sampled < per).map(b => `${fmtInt(b.n_sampled)} in the ${binLabel(b.label)} band${fin(b.articles_eligible) ? `, which has only ${fmtInt(b.articles_eligible)} eligible articles` : ''}`);
    const steps = [
      ['sample', 'The same topics', n ? `${fmtInt(n)} real articles: ${per ? fmtInt(per) + ' from each of ' + nb + ' page-view bands' + (small.length ? ` (${small.join('; ')})` : '') : 'stratified by page views'} (see section 4).` : 'Real articles, stratified by page views (see section 4).'],
      ['title', 'Keep only the title', 'The model sees nothing else: no text, no search, no internet.'],
      ['write', 'The model writes the opening', 'About 120 words, greedy decoding, on our test Mac.'],
      ['embed', 'Turn both texts into meaning vectors', `A small local embedding model (${esc(get(R, 'meta.embed_model', 'bge-small').split('/').pop())}) maps each text to numbers.`],
      ['compare', 'Compare with reference points', 'Unrelated article (floor), the title alone, and a paraphrase of the real text (ceiling). Similarity shows whether the text is on topic; it does not check facts.'],
    ];
    $('steps').innerHTML = steps.map(([ic, b, s], i) => `<li class="reveal"><span class="num">${i + 1}</span><div class="ic"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[ic]}</svg></div><b>${b}</b><span>${s}</span></li>`).join('');
    const sys = get(R, 'meta.system_prompt', 'You are an encyclopedia. You write accurate, neutral, factual Wikipedia text.');
    const usr = get(R, 'meta.user_prompt', 'Write the opening paragraph of the English Wikipedia article titled "{title}". Write it exactly as it would appear on Wikipedia: start with the subject in the first sentence and give the key facts. Write about 120 words of plain text, with no headings, lists or commentary.');
    $('promptBox').innerHTML = `<span class="role">System:</span> ${esc(sys)}\n\n<span class="role">User:</span> ${esc(usr).replace('{title}', '<b style="color:var(--accent-ink)">{title}</b>')}`;
    const bins = get(R, 'bins', []);
    if (!bins.length) { empty($('chPop'), 'Popularity bands appear once the pipeline has run.'); return; }
    VZ.mount($('chPop'), () => columns($('chPop'), {
      labels: bins.map(b => b.label), xLabel: `Monthly page views (${get(R, 'meta.pageviews_month', '2023-10')})`, format: v => pct(v), tipFormat: v => pct(v, v < 0.1 ? 1 : 0), xFormat: binLabel,
      yLabel: 'Share', tipHead: l => `${binLabel(l)} views a month`,
      series: [{ label: 'Share of articles', color: 'var(--title)', values: bins.map(b => b.share_articles) }, { label: 'Share of reading (views)', color: 'var(--s1)', values: bins.map(b => b.share_views) }],
    }));
    const tailA = bins.slice(0, 2).reduce((a, b) => a + (b.share_articles || 0), 0), tailV = bins.slice(0, 2).reduce((a, b) => a + (b.share_views || 0), 0);
    const nR = get(R, 'meta.n_real', null), popShare = bins.slice(4).reduce((a, b) => a + (b.share_articles || 0), 0), topShare = bins[bins.length - 1].share_articles || 0;
    const popN = fin(nR) ? Math.round(nR * popShare) : NaN, topN = fin(nR) ? Math.round(nR * topShare) : NaN;
    $('popTake').textContent = `${pct(tailA)} of articles get fewer than 100 views a month, but only ${pct(tailV, 1)} of all reading. ` +
      (fin(popN) && bins.length > 4 ? `A random sample of ${fmtInt(nR)} would hold only about ${fmtInt(popN)} topics with 10k+ views a month and ${topN === 0 ? 'none' : 'about ' + fmtInt(topN)} with ${binLabel(bins[bins.length - 1].label)}, so we draw the same number from every band, then weight each band by its share of articles when we scale up.`
        : 'Popular topics are rare, so we draw the same number from every band, then weight each band by its share of articles when we scale up.');
  }

  // =====================================================================
  // 5 results
  const METRICS = {
    // topic: similarity measures, which say "on topic", not "right"; title: the bare title's value on the same scale
    cos: { label: 'Meaning similarity', name: 'similarity', key: 'mean_cos', ci: 'cos_ci', fmt: f2, topic: true, title: r => r.title, refs: true,
      sub: 'Cosine similarity between the real opening paragraph and the rewrite (1 = same meaning). Dashed: the bare title alone, and a paraphrase of the real text. Similarity shows the topic, not whether the facts are right.' },
    recovery: { label: 'Similarity, rescaled', name: 'rescaled similarity', key: 'mean_recovery', fmt: v => pct(v), domain: [0, 1], topic: true, title: r => r.titleRec,
      sub: 'Where the rewrite lands between an unrelated article (0%) and a paraphrase of the real one (100%). Dashed: the bare title alone on the same scale. It measures topic, not facts.' },
    top1: { label: 'Topic match (top-1)', name: 'topic match', key: 'top1', ci: 'top1_ci', fmt: v => pct(v), domain: [0, 1], topic: true, title: r => r.title_top1,
      sub: `Share of rewrites closer to their own article than to any of the other ${fmtInt(get(R, 'meta.n_real', NaN))} sampled articles. On topic is not the same as right: see the fact check in section 4.` },
    judge_correct: { label: 'Facts correct', name: 'facts correct', key: 'judge_correct', better: 'Popular topics keep more of their key facts than rarely read ones.', fmt: v => pct(v), domain: [0, 1], sub: 'Share of key facts from the real opening paragraph that the rewrite states correctly (local judge model, a subset of topics).' },
    judge_contradicted: { label: 'Facts contradicted', name: 'facts contradicted', key: 'judge_contradicted', better: 'It contradicts popular topics less often than rarely read ones.', fmt: v => pct(v), domain: [0, 1], lower: true, sub: 'Share of key facts the rewrite gets wrong: a different date, place or name.' },
    year_recall: { label: 'Years recalled', name: 'years recalled', key: 'year_recall', better: 'Popular topics keep more of their dates than rarely read ones.', fmt: v => pct(v), domain: [0, 1], sub: 'Share of the years in the real opening paragraph that the rewrite also mentions.', years: true },
    verbatim8: { label: 'Copied word for word', name: 'the copied share', key: 'verbatim8', fmt: v => pct(v, 1), sub: 'Share of the rewrite\'s 8-word sequences that appear verbatim in the real article.' },
    bpb: { label: 'Bits per byte (lower = better known)', name: 'bits per byte', key: 'bpb_mean', better: 'Text about popular topics is already more "in" the model.', ci: 'bpb_ci', fmt: f2, lower: true, sub: 'How surprised the model is by the real article text. Lower means the text was already "in" the model.' },
  };
  const metricName = M => M.name || M.label.toLowerCase().replace(/ \(.*\)/, '');
  // The bare title's value per popularity level, when the data has it (top-1 only if step 08 provides title_top1).
  function titlePoints(M, k) {
    if (!M.title) return null;
    const rows = M.key === 'top1' ? binRows(k) : perBin(k);
    const pts = BINS().map(l => { const r = rows.find(x => x.label === l); return { x: l, y: r ? M.title(r) : NaN }; });
    return pts.some(p => fin(p.y)) ? pts : null;
  }
  const state = { distModel: null, metric: 'cos', wordsX: 'rougeL', bpbAll: false };
  const binRows = k => (R && R.by_bin && R.by_bin[k]) || [];
  const metricAvailable = m => resultModels().some(k => binRows(k).some(r => fin(r[METRICS[m].key])));

  function renderHeadline() {
    const k = mainModel(), s = k && R.summary[k], b = get(R, 'baselines', {});
    const rm = resultModels();
    const missing = MODELS.filter(m => !rm.includes(m.key)).map(m => short(m.key));
    $('resLead').textContent = R && s ? `${fmtInt(get(R, 'meta.n_real', s.n))} articles, ${rm.length} model${rm.length > 1 ? 's' : ''}, everything run offline on one Mac. Headline numbers for ${short(k)}. A "typical topic" weights each popularity level by its number of articles; "by reading", by its page views.` + (missing.length ? ` Still to come: ${missing.join(', ')}.` : '') : '';
    if (!s) { empty($('headline'), 'No results yet. Run the pipeline, then reload this page.'); return; }
    if (fin(b.title_mean)) $('defCaveat').textContent = `Similarity tells us whether the rewrite is on topic, not whether its facts are right: the bare title alone already scores ${f2(b.title_mean)}${fin(b.paraphrase_mean) ? `, against ${f2(b.paraphrase_mean)} for a paraphrase of the real text` : ''}. For the facts, see the sentence-by-sentence check in section 4.`;
    const zstd = (get(R, 'compression.classical', []) || []).find(c => /zstd/i.test(c.name));
    const rows = binRows(k), gp = gapW(k, 'share_articles'), gv = gapW(k, 'share_views');
    const j = judgeShares(s.judge);
    const jc = weightRows(rows, r => r.judge_correct, 'share_articles'), jcv = weightRows(rows, r => r.judge_correct, 'share_views');
    const jx = weightRows(rows, r => r.judge_contradicted, 'share_articles');
    const yp = weightRows(rows, r => r.year_recall, 'share_articles'), yv = weightRows(rows, r => r.year_recall, 'share_views');
    const cards = [
      { lab: 'Meaning similarity', val: f2(s.mean_cos), det: `Title alone ${f2(b.title_mean)} · paraphrase ${f2(b.paraphrase_mean)} · unrelated ${f2(b.floor_mean)}. ${BALANCED}` },
      fin(gp)
        ? { lab: 'Beyond the title alone, typical topic', val: fmtGap(gp) === 'none' ? '0%' : pct(gp), det: `How far the rewrite gets from the bare title (0%) toward a paraphrase of the real text (100%). Weighted by reading: ${fmtGap(gv)}.` }
        : { lab: 'Topic match (top-1)', val: pct(s.top1), det: `On topic is not the same as right: see the fact check in section 4. ${BALANCED}` },
      j && fin(jc)
        ? { lab: 'Key facts correct, typical topic', val: pct(jc), det: `${fin(jx) ? pct(jx) + ' contradicted · ' : ''}weighted by reading: ${pct(jcv)} correct. Checked on a subset of topics.` }
        : j ? { lab: 'Key facts correct', val: pct(j.correct), det: `${pct(j.omitted)} left out · ${pct(j.contradicted)} contradicted. ${BALANCED}` }
        : fin(yp) ? { lab: 'Years recalled, typical topic', val: pct(yp), det: `Years in the real opening paragraph that the rewrite also gives. Weighted by reading: ${pct(yv)}.${titleYears().excluded === true ? ' Years already in the title are not counted.' : titleYears().excluded === false ? ' Includes years given away in the title.' : ''}` }
        : { lab: 'Years recalled', val: pct(s.mean_year_recall), det: `Years in the real opening paragraph that the rewrite also gives. ${BALANCED}` },
      { lab: 'Bits per byte', val: f2(s.bpb_mean), det: (zstd ? `zstd on the same sampled text: ${f2(zstd.bpb_concat)} · raw text: 8. ` : 'Raw text: 8 bits per byte. ') + BALANCED },
    ];
    $('headline').innerHTML = cards.map(c => `<div class="stat reveal"><div class="lab">${esc(c.lab)}</div><div class="val">${esc(c.val)}</div><div class="det">${esc(c.det)}</div></div>`).join('');
  }

  function renderDist() {
    const d = get(R, 'distributions', null), b = get(R, 'baselines', {});
    const ms = resultModels().filter(k => d && d.recon && d.recon[k]);
    if (!d || !d.edges) { empty($('chDist'), 'Distributions appear once scoring (step 06) has run.'); $('distModel').innerHTML = ''; return; }
    if (!state.distModel || !ms.includes(state.distModel)) state.distModel = ms.includes(MAIN) ? MAIN : ms[0];
    seg($('distModel'), ms.map(k => ({ value: k, label: short(k), color: color(k) })), state.distModel, v => { state.distModel = v; renderDist(); });
    const k = state.distModel;
    const series = [
      { label: 'Unrelated article', short: 'Unrelated', color: 'var(--floor)', counts: d.floor },
      { label: 'Title only', short: 'Title only', color: 'var(--title)', counts: d.title },
      k ? { label: `${short(k)} rewrite`, short: short(k), color: color(k), counts: d.recon[k], emphasis: true } : null,
      { label: 'Paraphrase of the real text', short: 'Paraphrase', color: 'var(--para)', counts: d.paraphrase },
    ].filter(Boolean);
    VZ.mount($('chDist'), () => VZ.histChart($('chDist'), { edges: d.edges, series, xLabel: 'Similarity to the real article (cosine)', xFormat: v => v.toFixed(2), label: 'Similarity distributions' }));
    const s = k && R.summary[k];
    if (s && fin(b.title_mean) && fin(b.paraphrase_mean)) {
      const gap = (s.mean_cos - b.title_mean) / (b.paraphrase_mean - b.title_mean);   // the balanced sample, as in the chart
      const gp = gapW(k, 'share_articles'), gv = gapW(k, 'share_views');
      $('distTake').textContent = (gap >= 0.005
        ? `${short(k)}'s rewrites sit between "title only" and "paraphrase": on this balanced sample (each popularity level counts equally) they close ${pct(gap)} of that gap.`
        : `${short(k)}'s rewrites are no closer to the real text than the title alone (balanced sample: each popularity level counts equally).`) +
        (fin(gp) && fin(gv) ? ` Weighted to a typical topic they close ${fmtGap(gp)}; weighted by reading, ${fmtGap(gv)}.` : '') +
        ' Similarity shows the topic, not whether the facts are right.';
    }
  }

  function renderCore() {
    const sel = $('coreMetric');
    const avail = Object.keys(METRICS).filter(metricAvailable);
    if (!avail.length) { empty($('chCore'), 'Fidelity by popularity appears once scoring (step 06) has run.'); sel.innerHTML = ''; return; }
    if (!avail.includes(state.metric)) state.metric = avail[0];
    sel.innerHTML = avail.map(m => `<option value="${m}"${m === state.metric ? ' selected' : ''}>${esc(METRICS[m].label)}</option>`).join('');
    sel.onchange = () => { state.metric = sel.value; renderCore(); renderParams(); };
    const M = METRICS[state.metric], bins = BINS(), b = get(R, 'baselines', {});
    $('coreSub').textContent = M.sub + (M.years ? yearNote() : '');
    const ms = resultModels().filter(k => binRows(k).some(r => fin(r[M.key])));
    const series = ms.map(k => ({
      key: k, label: short(k), color: color(k),
      points: bins.map(l => { const r = binRows(k).find(x => x.label === l) || {}; const ci = M.ci && r[M.ci]; return { x: l, y: r[M.key], lo: ci ? ci[0] : null, hi: ci ? ci[1] : null }; }),
    }));
    const kMain = ms.includes(MAIN) ? MAIN : ms[0];
    const tp = kMain ? titlePoints(M, kMain) : null;          // the bare title per popularity level: no model at all
    if (tp) series.push({ key: 'title', label: 'Title only (no model)', short: 'Title only', color: 'var(--title)', dash: '6 5', width: 2, points: tp });
    const refs = M.refs ? [{ y: b.floor_mean, label: 'Unrelated article', color: 'var(--floor)' }, { y: b.paraphrase_mean, label: 'Paraphrase (ceiling)', color: 'var(--para)' }].concat(tp ? [] : [{ y: b.title_mean, label: 'Title only', color: 'var(--title)' }]) : [];
    let domain = M.domain;
    if (M.refs) { const all = series.flatMap(s => s.points.flatMap(p => [p.lo, p.hi, p.y])).concat(refs.slice(1).map(r => r.y)).filter(fin); domain = VZ.nice(Math.min(...all) - 0.01, Math.min(1, Math.max(...all) + 0.01), 5); }
    const shareA = {}; (get(R, 'bins', []) || []).forEach(x => shareA[x.label] = x);
    VZ.mount($('chCore'), () => VZ.lineChart($('chCore'), {
      x: { type: 'band', labels: bins }, xFormat: binLabel, xLabel: `Monthly page views (${get(R, 'meta.pageviews_month', '2023-10')}) → more popular`,
      y: { domain, format: M.fmt, label: M.label }, series, refs: refs.filter(r => fin(r.y) && (!domain || (r.y >= domain[0] && r.y <= domain[1]))),
      legendItems: series.map(s => ({ label: s.label, color: s.color, kind: s.dash ? 'ref' : 'line' })),
      tooltipHead: l => `${binLabel(l)} views a month`,
      tooltipFoot: l => shareA[l] ? `<div style="margin-top:6px;color:var(--muted)">${pct(shareA[l].share_articles, 1)} of all articles · ${pct(shareA[l].share_views, 1)} of all reading</div>` : '',
      label: M.label + ' by popularity',
    }));
    // takeaway: compare the main model at both ends
    const k = kMain, rows = binRows(k).filter(r => fin(r[M.key]));
    $('coreTake').textContent = '';
    if (rows.length > 1) {
      const lo = rows[0], hi = rows[rows.length - 1];
      const better = M.lower ? hi[M.key] < lo[M.key] : hi[M.key] > lo[M.key];
      let t = `${short(k)}: ${metricName(M)} goes from ${M.fmt(lo[M.key])} for articles with ${binLabel(lo.label)} views a month to ${M.fmt(hi[M.key])} for those with ${binLabel(hi.label)}.`;
      const at = l => { const p = tp && tp.find(x => x.x === l); return p ? p.y : NaN; };
      const dlo = ((decompModel(k) || decompModel(MAIN) || {}).by_bin || []).find(r => r.label === lo.label);
      if (M.topic) {
        if (fin(at(lo.label)) && fin(at(hi.label))) t += ` The bare title alone, with no model, scores ${M.fmt(at(lo.label))} and ${M.fmt(at(hi.label))} there.`;
        t += dlo && fin(dlo.meaningful_share) && decompNLI()
          ? ` On topic is not the same as right: for topics with ${binLabel(lo.label)} views a month, the fact check in section 4 confirms only ${pct(dlo.meaningful_share)} of what it writes.`
          : ' Similarity says the text is on topic, not that it is right.';
      } else if (better && M.better) t += ' ' + M.better;
      $('coreTake').textContent = t;
    }
    // table view
    $('coreTable').innerHTML = `<div class="tblwrap"><table class="dt"><thead><tr><th>Views a month</th>${series.map(s => `<th>${esc(s.label)}</th>`).join('')}</tr></thead><tbody>${bins.map((l, i) => `<tr><td>${esc(binLabel(l))}</td>${series.map(s => { const p = s.points[i]; return `<td>${M.fmt(p.y)}${fin(p.lo) ? ` <small style="color:var(--muted)">(${M.fmt(p.lo)}–${M.fmt(p.hi)})</small>` : ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function renderParams() {
    const M = METRICS[state.metric] || METRICS.cos, bins = BINS();
    const ms = resultModels().filter(k => binRows(k).some(r => fin(r[M.key])) && fin(model(k).params));
    if (ms.length < 2) { empty($('chParams'), 'This chart needs results from at least two model sizes.'); $('paramsTake').textContent = ''; return; }
    // each group's value weights its popularity levels by their number of articles
    const series = GROUPS.map(g => ({ label: g.label, short: g.short, color: g.color, width: 2.5, points: ms.map(k => ({ x: model(k).params, y: weightRows(binRows(k), r => r[M.key], 'share_articles', groupLabels(g)) })) }));
    const ps = ms.map(k => model(k).params);
    VZ.mount($('chParams'), () => VZ.lineChart($('chParams'), {
      x: { type: 'log', domain: [Math.min(...ps) / 1.6, Math.max(...ps) * 1.6], ticks: ps }, xFormat: p => fmtParams(p) + (ms.find(k => model(k).params === p) ? ' · ' + short(ms.find(k => model(k).params === p)).split(' ')[0] : ''),
      xLabel: 'Number of parameters (log scale)', y: { domain: M.domain, format: M.fmt, label: M.label },
      series, tooltipHead: p => { const k = ms.find(x => model(x).params === p); return `${short(k)} · ${fmtBig(p)} parameters`; },
      label: M.label + ' by model size',
    }));
    const t = series[0].points, p = series[2].points;
    $('paramsTake').textContent = '';
    if (fin(t[0].y) && fin(t[t.length - 1].y) && fin(p[0].y) && fin(p[p.length - 1].y)) {
      const up = (a, z) => fin(a) && fin(z) && (M.lower ? z < a : z > a) && M.fmt(a) !== M.fmt(z);
      const tUp = up(t[0].y, t[t.length - 1].y), pUp = up(p[0].y, p[p.length - 1].y);
      const verdict = tUp && pUp ? 'The bigger model does better in both groups, like a richer regression.'
        : pUp ? 'The gain is in popular articles; on this measure the long tail barely moves.'
        : tUp ? 'The gain is in the long tail; on this measure popular articles barely move.'
        : 'On this measure the bigger model is not clearly better.';
      const fam = model(MAIN).family, odd = ms.filter(k => model(k).family && model(k).family !== fam);
      const famNote = fam && odd.length ? ` (${odd.map(short).join(', ')} ${odd.length > 1 ? 'are' : 'is'} from a different model family, trained on different data${odd.some(k => model(k).bits !== model(MAIN).bits) ? ' and stored at different precision' : ''}, so read that step as indicative.)` : '';
      $('paramsTake').textContent = `From ${fmtParams(ps[0])} to ${fmtParams(ps[ps.length - 1])} parameters (${fx(ps[ps.length - 1] / ps[0])} more), ${metricName(M)} for the long tail moves from ${M.fmt(t[0].y)} to ${M.fmt(t[t.length - 1].y)}, and for popular articles from ${M.fmt(p[0].y)} to ${M.fmt(p[p.length - 1].y)}. ` + verdict + famNote;
    }
  }

  function renderBpb() {
    const c = get(R, 'compression', null);
    if (!c) { empty($('chBpb'), 'Bits per byte appear once step 05 has run.'); return; }
    const rows = [{ group: 'No compression', label: 'Plain text', sub: 'UTF-8, 1 byte per letter', value: 8, color: 'var(--surface-3)' }];
    const cl = c.classical || [];
    const pick = key => state.bpbAll ? cl.filter(z => fin(z[key])) : cl.filter(z => fin(z[key])).sort((a, b) => a[key] - b[key]).slice(0, 1);
    pick('bpb_per_article').forEach(z => rows.push({ group: state.bpbAll ? 'Zip tools, one article at a time' : 'Best zip tool, one article at a time', label: z.name, value: z.bpb_per_article, color: 'var(--title)', note: 'Each article compressed on its own, like the model reads each article on its own.' }));
    pick('bpb_concat').forEach(z => rows.push({ group: state.bpbAll ? 'Zip tools, all sampled articles together' : 'Best zip tool, all sampled articles together', label: z.name, value: z.bpb_concat, color: 'var(--title)', note: 'All sampled articles in one file, so the tool can learn repeated patterns.' }));
    if (fin(c.wiki_zstd_bpb)) rows.push({ group: 'Zip tool, all of Wikipedia', label: 'zstd -19', sub: fmtBytes(get(R, 'sizes.wiki_text_bytes')) + ' of text', value: c.wiki_zstd_bpb, color: 'var(--floor)' });
    const llm = (c.llm || []).slice().sort((a, b) => (model(a.model).params || 0) - (model(b.model).params || 0));
    // Next to zstd on all of Wikipedia, use step 08's population-weighted mean when it is there; otherwise say that the
    // number is a balanced-sample average (popular topics, which the model knows better, weigh more than in Wikipedia).
    const pw = llm.some(l => fin(l.bpb_pop_weighted));
    llm.forEach(l => {
      const w = pw && fin(l.bpb_pop_weighted), v = w ? l.bpb_pop_weighted : l.bpb_mean, ci = w ? l.bpb_pop_weighted_ci : l.bpb_ci;
      if (fin(v)) rows.push({ group: pw ? 'Language models, weighted to all articles' : 'Language models, balanced sample', label: short(l.model), sub: fmtBig(model(l.model).params) + ' parameters', value: v,
        lo: ci && ci[0], hi: ci && ci[1], color: color(l.model),
        note: w ? 'Each popularity level weighted by its share of articles, so it compares with zstd on all of Wikipedia. The model does the zipping.' : 'Average over the sampled opening paragraphs. ' + BALANCED + ' The model does the zipping.' });
    });
    VZ.mount($('chBpb'), () => VZ.barChart($('chBpb'), { rows, format: f2, tickFormat: v => v.toFixed(0), rowH: state.bpbAll ? 32 : 40,
      xLabel: $('chBpb').clientWidth < 520 ? 'Bits per byte (lower = better)' : 'Bits per byte of real Wikipedia text (lower = better)', valueLabel: 'Bits per byte', label: 'Bits per byte' }));
    const k = mainModel(), m = llm.find(l => l.model === k), best = Math.min(...(c.classical || []).map(z => z.bpb_concat).filter(fin));
    if (m && fin(best) && fin(m.bpb_mean)) {
      const wiki = get(R, 'sizes.wiki_text_bytes', NaN);
      $('bpbTake').textContent = `${short(k)} needs ${f2(m.bpb_mean)} bits per byte on the sampled text: ${fx(best / m.bpb_mean)} fewer than the best zip tool on the same text. It already "knows" English and much of Wikipedia, so the text holds little news for it.` +
        (fin(m.bpb_pop_weighted) && fin(wiki) ? ` Weighted to all articles it needs ${f2(m.bpb_pop_weighted)}: at that rate all of English Wikipedia's text would zip to about ${fmtBytes(m.bpb_pop_weighted * wiki / 8)}, plus the model to unzip it.` : ` (${BALANCED} To unzip you also need the ${fmtBytes(model(k).disk_bytes)} model.)`);
    }
  }

  function renderWords() {
    const items = (get(R, 'items', []) || []).filter(i => i.kind === 'real' && i.recon);
    const ms = resultModels();
    const x = state.wordsX;
    const pts = [];
    ms.forEach(k => items.forEach(it => { const r = it.recon[k]; if (r && fin(r.cos) && fin(r[x])) pts.push({ x: r[x], y: r.cos, color: color(k), title: it.title, sub: `<div style="color:var(--ink-2)">${esc(short(k))} · ${esc(binLabel(it.bin))} views/mo</div>`, id: it.id, model: k }); }));
    // the paraphrase ceiling as a reference cloud
    if (!pts.length) { empty($('chWords'), 'Appears once scoring (step 06) has run.'); return; }
    const b = get(R, 'baselines', {});
    VZ.mount($('chWords'), () => VZ.scatter($('chWords'), {
      points: pts, legend: ms.map(k => ({ label: short(k), color: color(k), kind: 'dot' })).concat([{ label: 'Title only', color: 'var(--title)', kind: 'ref' }]),
      x: { domain: x === 'rougeL' ? [0, 1] : VZ.nice(0, Math.max(0.05, ...pts.map(p => p.x)), 5), format: v => pct(v), label: x === 'rougeL' ? 'Same words (ROUGE-L)' : 'Copied 8-word runs' },
      y: { format: f2, label: 'Meaning similarity' }, refs: [{ y: b.title_mean, label: 'Title only', color: 'var(--title)' }],
      onClick: p => App.openItem(p.id, p.model), label: 'Meaning versus words',
    }));
    const s = R.summary[mainModel()];
    if (s) $('wordsTake').textContent = `Only ${pct(s.mean_verbatim8, 1)} of ${short(mainModel())}'s 8-word runs appear verbatim in the article, and just ${pct(s.mean_rougeL)} of the words line up, yet the meaning similarity is ${f2(s.mean_cos)} (averages over the balanced sample: each popularity level counts equally). Like a regression, it keeps the pattern, not the data points. Click a dot to read it.`;
  }

  function renderFacts() {
    const bins = BINS(), ms = resultModels();
    const ys = ms.filter(k => binRows(k).some(r => fin(r.year_recall)));
    if (ys.length) VZ.mount($('chYears'), () => VZ.lineChart($('chYears'), {
      x: { type: 'band', labels: bins }, xFormat: binLabel, xLabel: 'Monthly page views', y: { domain: [0, 1], format: v => pct(v), label: 'Years recalled' },
      series: ys.map(k => ({ label: short(k), color: color(k), points: bins.map(l => ({ x: l, y: (binRows(k).find(r => r.label === l) || {}).year_recall })) })),
      tooltipHead: l => `${binLabel(l)} views a month`, margin: { right: 24 }, endLabels: false, label: 'Years recalled by popularity',
    }));
    else empty($('chYears'), 'Appears once scoring (step 06) has run.');
    $('yearsSub').textContent = 'Share of the years in the real opening paragraph that the rewrite also mentions.' + yearNote();
    const js = ms.filter(k => R.summary[k] && judgeShares(R.summary[k].judge));
    const judgeName = get(R, 'meta.judge_model', 'Qwen2.5 32B');
    // how many topics per popularity level the judge checked (it runs on a random subset)
    const kj = js.includes(MAIN) ? MAIN : js[0], allItems = get(R, 'items', []) || [];
    const nJ = kj ? BINS().map(l => allItems.filter(i => i.kind === 'real' && i.bin === l && i.recon && i.recon[kj] && i.recon[kj].judge).length).filter(x => x > 0) : [];
    const nTxt = nJ.length ? (Math.min(...nJ) === Math.max(...nJ) ? fmtInt(nJ[0]) : `${fmtInt(Math.min(...nJ))} to ${fmtInt(Math.max(...nJ))}`) : '';
    $('factsSub').textContent = `Key-facts check: ${judgeName}, run locally, lists up to five key facts from the real opening paragraph of ${nTxt ? nTxt + ' random topics per popularity level' : 'a random subset of the topics'} (plus the famous showcase topics) and checks each one against the model's opening paragraph.` + (js.includes('qwen2.5-32b') ? ' (It judges its own rewrites too, so read that row with care.)' : '');
    if (js.length) VZ.mount($('chFacts'), () => VZ.stackChart($('chFacts'), {
      legend: [{ label: '✓ Correct', color: 'var(--good)', kind: 'box' }, { label: '– Left out', color: 'var(--muted)', kind: 'box' }, { label: '✗ Contradicted', color: 'var(--crit)', kind: 'box' }],
      rows: js.map(k => { const j = judgeShares(R.summary[k].judge); return { label: short(k), color: color(k), parts: [{ label: 'Correct', value: j.correct, color: 'var(--good)' }, { label: 'Left out', value: j.omitted, color: 'var(--muted)' }, { label: 'Contradicted', value: j.contradicted, color: 'var(--crit)' }] }; }),
      label: 'Fact check',
    }));
    else empty($('chFacts'), 'The key-facts check (step 07) has not been run yet.');
    const k = mainModel(), rows = binRows(k);
    $('factsTake').textContent = '';
    if (rows.length > 1) {
      const lo = rows[0], tailG = GROUPS[0], popG = GROUPS[2];
      // groups as in "More parameters, less loss": each level weighted by its number of articles
      const tail = weightRows(rows, r => r.year_recall, 'share_articles', groupLabels(tailG)), pop = weightRows(rows, r => r.year_recall, 'share_articles', groupLabels(popG));
      let t = '';
      if (fin(tail) && fin(pop)) t = `Years: for topics ${popG.say}, ${short(k)} gives ${pct(pop)} of the years in the real opening paragraph; for topics ${tailG.say}, ${pop > tail ? 'only ' : ''}${pct(tail)}.` + (titleYears().excluded === false ? ' (Years given away in a title are counted here.)' : '');
      if (fin(lo.judge_correct) && fin(lo.judge_contradicted)) {
        const om = Math.max(0, 1 - lo.judge_correct - lo.judge_contradicted);
        t += ` On the rarest topics (${binLabel(lo.label)} views a month) it gets ${pct(lo.judge_correct)} of key facts right, leaves out ${pct(om)} and contradicts ${pct(lo.judge_contradicted)}` +
          (lo.judge_contradicted > om ? ': when it does not know, it tends to invent rather than stay silent.' : '.');
      }
      $('factsTake').textContent = t.trim();
    }
  }

  // =====================================================================
  // 6 explorer
  const ex = { q: '', bin: '', kind: '', model: null, sort: 'views', sel: null, limit: 150, view: null, pin: null };
  const STOP = new Set(('the a an and or of in on at to for from by with as is was were be been are it its this that which who whom whose their there these those his her he she they them than then also into onto over under about after before between during within without not no but if so such can may might will would should could has have had do does did more most other some any each all both one two first new known called often usually including include includes became become used use made make while where when what has being per its').split(' '));
  const WORD_RE = /(\p{L}[\p{L}\p{M}\p{N}'’-]*|\p{N}[\p{N},.]*\p{N}|\p{N})/u;
  const wkey = w => w.toLowerCase().replace(/['’]s$/, '').replace(/,/g, '');
  const isNum = w => /^\p{N}/u.test(w);
  function keySets(text) {
    const words = new Set(), nums = new Set();
    String(text || '').split(WORD_RE).forEach((t, i) => { if (i % 2 !== 1) return; const k = wkey(t); if (isNum(t)) nums.add(k.replace(/\.$/, '')); else if (k.length >= 3 && !STOP.has(k)) words.add(k); });
    return { words, nums };
  }
  function highlight(text, other) {
    const o = keySets(other);
    return String(text || '').split(WORD_RE).map((t, i) => {
      if (i % 2 !== 1) return esc(t);
      const k = wkey(t);
      if (isNum(t)) return o.nums.has(k.replace(/\.$/, '')) ? `<mark class="sh">${esc(t)}</mark>` : `<span class="num-new" title="This number is not in the other text">${esc(t)}</span>`;
      return k.length >= 3 && !STOP.has(k) && o.words.has(k) ? `<mark class="sh">${esc(t)}</mark>` : esc(t);
    }).join('');
  }
  function exItems() {
    const q = ex.q.toLowerCase(), m = ex.model;
    // sensitive topics only by their exact title (or when opened from a chart)
    let list = (get(R, 'items', []) || []).filter(it => (!q || it.title.toLowerCase().includes(q)) && (!ex.bin || it.bin === ex.bin) && (!ex.kind || it.kind === ex.kind) &&
      (it.id === ex.pin || (q && it.title.toLowerCase() === q) || !sensitive(it)));
    const cos = it => { const r = it.recon && it.recon[m]; return r && fin(r.cos) ? r.cos : -1; };
    const sorts = { views: (a, b) => (b.views || 0) - (a.views || 0), views_asc: (a, b) => (a.views || 0) - (b.views || 0), cos: (a, b) => cos(b) - cos(a), cos_asc: (a, b) => (cos(a) < 0 ? 9 : cos(a)) - (cos(b) < 0 ? 9 : cos(b)), title: (a, b) => a.title.localeCompare(b.title) };
    return list.sort(sorts[ex.sort] || sorts.views);
  }
  function renderExList() {
    const list = exItems(), box = $('exList');
    box.innerHTML = '';
    if (!list.length) { box.innerHTML = '<div class="ex-more" style="color:var(--muted)">No article matches.</div>'; return list; }
    const frag = document.createDocumentFragment();
    list.slice(0, ex.limit).forEach(it => {
      const r = it.recon && it.recon[ex.model];
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ex-item' + (it.id === ex.sel ? ' is-on' : ''); b.dataset.id = it.id; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', it.id === ex.sel);
      const w = r && fin(r.cos) ? Math.max(0, Math.min(1, (r.cos - 0.3) / 0.7)) * 100 : 0;
      b.innerHTML = `<span class="t">${esc(it.title)}</span><span class="m">${it.kind === 'fictional' ? '<span>made-up topic</span>' : `<span>${fmtInt(it.views)} views/mo</span>`}${it.kind === 'showcase' ? '<span>famous</span>' : ''}${r && fin(r.cos) ? `<span>sim ${f2(r.cos)}</span>` : ''}</span>` + (w ? `<span class="bar" style="--c:${color(ex.model)}"><i style="width:${w.toFixed(1)}%"></i></span>` : '');
      b.addEventListener('click', () => { ex.sel = it.id; box.querySelectorAll('.ex-item').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-selected', x === b); }); renderExDetail(); });
      frag.appendChild(b);
    });
    box.appendChild(frag);
    if (list.length > ex.limit) {
      const more = VZ.html('div', 'ex-more', box);
      const btn = VZ.html('button', 'btn', more, `Show ${Math.min(150, list.length - ex.limit)} more of ${fmtInt(list.length - ex.limit)}`);
      btn.type = 'button';
      btn.addEventListener('click', () => { ex.limit += 150; renderExList(); });
    }
    return list;
  }
  function verdictHtml(v) {
    const map = { correct: ['✓', 'Correct'], omitted: ['–', 'Left out'], contradicted: ['✗', 'Contradicted'] };
    const [i, l] = map[v] || ['?', v];
    return `<span class="verdict v-${esc(v)}"><span class="vi" aria-hidden="true">${i}</span>${l}</span>`;
  }
  function renderExDetail() {
    const box = $('exDetail');
    const it = (get(R, 'items', []) || []).find(x => x.id === ex.sel);
    if (ex.shown !== ex.sel) { box.scrollTop = 0; ex.shown = ex.sel; }
    if (!it) { box.innerHTML = '<div class="empty">Pick an article on the left.</div>'; return; }
    const avail = MODELS.map(m => m.key).filter(k => it.recon && it.recon[k]);
    const tags = [it.kind === 'fictional' ? '<span class="tag madeup">made-up topic</span>' : `<span class="tag">${fmtInt(it.views)} views a month</span>`,
      it.kind === 'showcase' ? '<span class="tag famous">famous (showcase)</span>' : it.kind === 'real' ? `<span class="tag">sampled from the ${esc(binLabel(it.bin))} band</span>` : ''].join('');
    const link = it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">Open on Wikipedia ↗</a>` : '';
    if (it.kind === 'fictional') {
      box.innerHTML = `<div class="ex-head"><div><h3>${esc(it.title)}</h3><div class="ex-meta">${tags}</div></div></div>
        <p class="sub">This topic does not exist; we checked all ${fmtBig(get(R, 'sizes.wiki_articles', 6.4e6))} Wikipedia titles. Every model was asked for its article anyway:</p>
        <div class="fic-outs">${avail.map(k => ficOut(k, it.recon[k].text, it.recon[k].hedged)).join('')}</div>`;
      return;
    }
    if (!ex.view || (ex.view !== 'para' && !avail.includes(ex.view))) ex.view = avail.includes(ex.model) ? ex.model : avail[0];
    const opts = avail.map(k => ({ value: k, label: short(k), color: color(k) }));
    if (it.paraphrase && it.paraphrase.text) opts.push({ value: 'para', label: 'Paraphrase', color: 'var(--para)', note: 'ceiling' });
    const isPara = ex.view === 'para';
    const r = isPara ? { text: it.paraphrase.text, cos: it.paraphrase.cos } : it.recon[ex.view] || {};
    const viewColor = isPara ? 'var(--para)' : color(ex.view);
    box.innerHTML = `<div class="ex-head"><div><h3>${esc(it.title)}</h3><div class="ex-meta">${tags}</div></div><div>${link}</div></div>
      <div class="seg" id="exView" role="group" aria-label="Which rewrite"></div>
      <div class="ex-legend"><span><mark class="sh">word</mark> in both texts</span><span><span class="num-new">1871</span> number not in the other text</span></div>
      <div class="ex-cols">
        <div class="ex-col orig"><h4>Real Wikipedia lead</h4><div class="txt">${highlight(it.excerpt, r.text)}</div>${HOLES.test(it.excerpt || '') ? '<p class="note">Blank spots in the real text are values (numbers, dates, pronunciations) that the plain-text copy of Wikipedia leaves out, so they cannot be compared.</p>' : ''}</div>
        <div class="ex-col"><h4><span class="sw" style="background:${viewColor}"></span>${isPara ? 'Paraphrase by ' + esc(short(MAIN)) + ' (it saw the real text)' : esc(short(ex.view)) + ' from the title alone'}</h4><div class="txt">${highlight(r.text || '', it.excerpt)}</div></div>
      </div>
      <div class="gauge" id="exGauge"></div>
      <div class="metrics">${isPara ? '' : [
        ['Meaning similarity', f3(r.cos)], ['Similarity, rescaled', pct(r.recovery)], [`Topic-match rank${fin(get(R, 'meta.n_real', NaN)) ? ` (of ${fmtInt(get(R, 'meta.n_real'))} sampled)` : ''}`, fin(r.rank) ? '#' + fmtInt(r.rank) : 'n/a'],
        ['Years recalled', r.year_recall == null ? 'no years' : pct(r.year_recall)], ['Same words (ROUGE-L)', pct(r.rougeL)], ['Copied 8-word runs', pct(r.verbatim8, 1)],
        ['Bits per byte', f2(r.bpb)], ['Tokens written', fin(r.gen_tokens) ? fmtInt(r.gen_tokens) : 'n/a']].map(([l, v]) => `<div class="metric"><div class="lab">${l}</div><div class="v">${v}</div></div>`).join('')}</div>
      ${isPara ? '' : '<p class="note ex-truth">Similarity and rank show whether the text is on topic, not whether it is true: a rewrite with every fact wrong can still rank #1. Section 4 fact-checks every sentence.</p>'}
      ${!isPara && r.judge && r.judge.facts && r.judge.facts.length ? `<h4 style="margin:18px 0 4px">Fact check</h4><ul class="facts">${r.judge.facts.map(f => `<li>${verdictHtml(f.verdict)}<span>${esc(f.fact)}</span></li>`).join('')}</ul>` : ''}
      ${avail.length > 1 ? `<details class="tbl"><summary>All models for this article</summary><div class="tblwrap"><table class="dt"><thead><tr><th>Model</th><th>Similarity</th><th>Topic rank</th><th>Years</th><th>Facts correct</th></tr></thead><tbody>${avail.map(k => { const x = it.recon[k]; const fc = x.judge && x.judge.facts ? x.judge.facts.filter(f => f.verdict === 'correct').length + ' / ' + x.judge.facts.length : 'n/a'; return `<tr><td>${esc(short(k))}</td><td>${f3(x.cos)}</td><td>${fin(x.rank) ? '#' + fmtInt(x.rank) : 'n/a'}</td><td>${x.year_recall == null ? '–' : pct(x.year_recall)}</td><td>${fc}</td></tr>`; }).join('')}</tbody></table></div></details>` : ''}`;
    seg($('exView'), opts, ex.view, v => { ex.view = v; renderExDetail(); });
    VZ.gauge($('exGauge'), { value: r.cos, color: viewColor, label: isPara ? 'Paraphrase' : 'This rewrite', refs: [
      { v: it.floor_cos, label: 'Unrelated', color: 'var(--floor)' }, { v: it.title_cos, label: 'Title only', color: 'var(--title)' },
      isPara ? null : { v: it.paraphrase && it.paraphrase.cos, label: 'Paraphrase', color: 'var(--para)' }].filter(x => x && fin(x.v)) });
  }
  function revealSel() {
    const list = $('exList'), b = list.querySelector(`[data-id="${CSS.escape(ex.sel)}"]`);
    if (b) list.scrollTop = Math.max(0, b.offsetTop - list.clientHeight / 3);
  }
  function renderExplorer() {
    const items = get(R, 'items', []) || [];
    if (!items.length) { $('exList').innerHTML = ''; empty($('exDetail'), 'Articles appear once the pipeline has run.'); return; }
    const bins = BINS();
    $('exBin').innerHTML = '<option value="">All popularity bands</option>' + bins.map(b => `<option value="${esc(b)}">${esc(binLabel(b))} views/mo</option>`).join('');
    const ms = MODELS.map(m => m.key).filter(k => items.some(i => i.recon && i.recon[k]));
    ex.model = ms.includes(MAIN) ? MAIN : ms[0];
    $('exModel').innerHTML = ms.map(k => `<option value="${esc(k)}"${k === ex.model ? ' selected' : ''}>Bars: ${esc(short(k))}</option>`).join('');
    const re = () => { ex.limit = 150; const l = renderExList(); if (!l.find(i => i.id === ex.sel) && l.length) { ex.sel = l[0].id; renderExList(); } renderExDetail(); };
    let t = null;
    $('exSearch').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { ex.q = e.target.value.trim(); re(); }, 120); });
    $('exBin').addEventListener('change', e => { ex.bin = e.target.value; re(); });
    $('exKind').addEventListener('change', e => { ex.kind = e.target.value; re(); });
    $('exModel').addEventListener('change', e => { ex.model = e.target.value; ex.view = e.target.value; renderExList(); renderExDetail(); });
    $('exSort').addEventListener('change', e => { ex.sort = e.target.value; re(); });
    $('exRandom').addEventListener('click', () => {
      const all = exItems(), l = all.filter(i => !sensitive(i)); if (!l.length) return;
      ex.sel = l[Math.floor(Math.random() * l.length)].id;
      const idx = all.findIndex(i => i.id === ex.sel);
      if (idx >= ex.limit) ex.limit = idx + 1;
      renderExList(); renderExDetail(); revealSel();
    });
    const first = items.find(i => i.kind === 'showcase') || items[0];
    ex.sel = first.id;
    renderExList(); renderExDetail(); revealSel();
  }

  // =====================================================================
  // 7 surprise heatmap
  const sur = { item: null, model: null };
  function renderSurprise() {
    const list = get(R, 'surprise', []) || [];
    if (!list.length) { empty($('surHeat'), 'The token heatmap appears once step 05 has run.'); $('surItems').innerHTML = ''; $('surModel').innerHTML = ''; return; }
    if (!sur.item || !list.find(s => s.id === sur.item)) sur.item = list[0].id;
    const pills = $('surItems'); pills.innerHTML = '';
    list.forEach(s => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (s.id === sur.item ? ' is-on' : '');
      b.textContent = s.title; b.title = s.kind === 'showcase' ? 'Famous article' : `Rarely read: ${binLabel(s.bin)} views a month`;
      b.setAttribute('aria-pressed', s.id === sur.item);
      b.addEventListener('click', () => { sur.item = s.id; renderSurprise(); });
      pills.appendChild(b);
    });
    const it = list.find(s => s.id === sur.item);
    const ms = MODELS.map(m => m.key).filter(k => it.models && it.models[k]);
    if (!sur.model || !ms.includes(sur.model)) sur.model = ms.includes(MAIN) ? MAIN : ms[0];
    seg($('surModel'), ms.map(k => ({ value: k, label: short(k), color: color(k) })), sur.model, v => { sur.model = v; renderSurprise(); });
    VZ.heatLegend($('surLegend'));
    const d = it.models[sur.model];
    VZ.heat($('surHeat'), d.tokens || [], d.bits || []);
    const total = (d.bits || []).reduce((a, b) => a + (fin(b) ? b : 0), 0);
    const bytes = new TextEncoder().encode((d.tokens || []).join('')).length;
    const top = (d.tokens || []).map((t, i) => ({ t: t.trim(), b: d.bits[i] })).filter(x => x.t && fin(x.b)).sort((a, b) => b.b - a.b).slice(0, 4);
    const others = ms.filter(k => k !== sur.model).map(k => `${short(k)}: ${f2(it.models[k].bpb)}`).join(' · ');
    $('surStats').innerHTML = [
      ['Text', `${fmtInt(bytes)} bytes`], ['Total surprise', `${fmtInt(total)} bits`], ['Compressed size', `${fmtInt(total / 8)} bytes <small>(${pct(total / 8 / bytes)} of the text)</small>`],
      ['Bits per byte', `${f2(fin(d.bpb) ? d.bpb : total / bytes)}${others ? ` <small>${esc(others)}</small>` : ''}`],
      ['Most surprising', top.map(x => `“${esc(x.t)}”`).join(', ') || 'n/a'],
    ].map(([l, v]) => `<div class="metric"><div class="lab">${l}</div><div class="v" style="${l === 'Most surprising' ? 'font-size:1em' : ''}">${v}</div></div>`).join('');
  }

  // =====================================================================
  // 8 made-up topics
  function ficOut(k, text, hedged) {
    return `<div class="fic-out" style="--c:${color(k)}"><div class="who"><span>${esc(short(k))}</span>${hedged ? '<span class="conf hedge">✓ Says it does not know</span>' : '<span class="conf made">✗ Makes it up</span>'}</div><div>${esc(text)}</div></div>`;
  }
  const fic = { all: false };
  function renderFiction() {
    const list = get(R, 'fiction', []) || [];
    if (!list.length) { empty($('fiction'), 'Made-up topics appear once step 04 has run.'); $('ficRates').innerHTML = ''; return; }
    const ms = MODELS.map(m => m.key).filter(k => list.some(f => f.outputs && f.outputs[k]));
    const n = get(R, 'meta.n_fictional', list.length);
    $('ficLead').textContent = `We invented ${fmtInt(Math.max(n, list.length))} titles that sound real (people, companies, places, battles, diseases, theories) and checked that none of them exists on Wikipedia. Then we asked each model for the article.`;
    $('ficRates').innerHTML = ms.map(k => {
      const outs = list.map(f => f.outputs && f.outputs[k]).filter(Boolean), h = outs.filter(o => o.hedged).length;
      return `<div class="fic-rate"><span class="sw" style="background:${color(k)}"></span><span>${esc(short(k))}</span><span>made up <b>${outs.length - h}</b> of ${outs.length}</span></div>`;
    }).join('');
    const shown = fic.all ? list : list.slice(0, 4);
    $('fiction').innerHTML = shown.map(f => `<div class="fic reveal in"><h3>${esc(f.title)} <span class="tag madeup">does not exist</span></h3><div class="fic-outs">${ms.filter(k => f.outputs[k]).map(k => ficOut(k, f.outputs[k].text, f.outputs[k].hedged)).join('')}</div></div>`).join('') +
      (list.length > 4 ? `<div><button type="button" class="btn" id="ficMore">${fic.all ? 'Show fewer' : `Show all ${list.length}`}</button></div>` : '');
    const more = $('ficMore'); if (more) more.addEventListener('click', () => { fic.all = !fic.all; renderFiction(); });
  }

  // =====================================================================
  // 10 takeaways + footer
  function renderTakeaways() {
    const k = mainModel(), s = k && R && R.summary[k], rows = k ? binRows(k) : [], lo = rows[0], hi = rows[rows.length - 1];
    const sz = get(R, 'sizes', {}), mm = model(MAIN), b = get(R, 'baselines', {});
    const ms = resultModels(), small = ms[0], big = ms[ms.length - 1];
    const fl = get(R, 'fiction', []) || [];
    const made = fl.filter(f => f.outputs && f.outputs[k] && !f.outputs[k].hedged).length;
    const dt = decompTotals(MAIN), db = ((get(R, 'decompression.models', {}) || {})[MAIN] || {}).by_bin || [], dlo = db[0], dhi = db[db.length - 1];
    const nli = decompNLI(), word = nli ? 'confirmed by the real article' : 'matches the real article';
    const yTail = weightRows(rows, r => r.year_recall, 'share_articles', groupLabels(GROUPS[0])), yPop = weightRows(rows, r => r.year_recall, 'share_articles', groupLabels(GROUPS[2]));
    // bigger vs smaller model: confirmed text scaled to all topics when both have it, else similarity on the balanced sample
    const eligT = get(R, 'decompression.eligible_topics', NaN), full = k => { const m = decompModel(k); return !!m && !(fin(eligT) && fin(m.topics_covered) && m.topics_covered < eligT * 0.995); };
    const dS = small && full(small) && decompTotals(small), dB = big && full(big) && decompTotals(big);
    const sizeEv = !(small && big && small !== big) ? null
      : dS && dB && fin(dS.meaningful_bytes) && fin(dB.meaningful_bytes) ? { up: dB.meaningful_bytes > dS.meaningful_bytes, txt: `${short(small)} → ${short(big)}: ${fmtBytes(dS.meaningful_bytes)} → ${fmtBytes(dB.meaningful_bytes)} ${nli ? 'confirmed' : 'matching'}, scaled to all topics` }
      : fin(R.summary[small].mean_cos) && fin(R.summary[big].mean_cos) ? { up: R.summary[big].mean_cos > R.summary[small].mean_cos, txt: `${short(small)} → ${short(big)}: similarity ${f2(R.summary[small].mean_cos)} → ${f2(R.summary[big].mean_cos)} (balanced sample)` } : null;
    const cards = [
      ['A model is lossy compression', 'An LLM keeps the gist of what it read, not the text: like a regression line, it keeps the trend and loses the residuals. It can write a great deal back, but treat its answers as a reconstruction, not a record.',
        dt ? `${fmtBytes(mm.disk_bytes)} model → writes about ${fmtBytes(dt.gen_bytes)}; ${fmtBytes(dt.meaningful_bytes)} of it ${nli ? 'is confirmed by' : 'matches'} the real articles`
          : s && fin(sz.wiki_text_bytes) ? `${fmtBytes(mm.disk_bytes)} model vs ${fmtBytes(sz.wiki_text_bytes)} of text · similarity ${f2(s.mean_cos)}, not 1.00` : ''],
      ['Popular knowledge survives better than the long tail', 'The more people write about a topic, the more of the model\'s answer holds up. Niche products, small companies, local rules: very little of the detail can be confirmed.',
        dlo && dhi && dlo !== dhi && fin(dhi.meaningful_share) && fin(dlo.meaningful_share) ? `${word[0].toUpperCase() + word.slice(1)}: ${pct(dhi.meaningful_share)} of what it writes on the most-read topics vs ${pct(dlo.meaningful_share)} on the rarely read`
          : ''],
      ['Numbers and dates are the first casualties', 'Exact figures need many repetitions to be memorised. Always check numbers, dates and names before they go into a deck or a contract.',
        fin(yPop) && fin(yTail) ? `Years recalled: ${pct(yPop)} for topics ${GROUPS[2].say} vs ${pct(yTail)} for those ${GROUPS[0].say}${titleYears().excluded === false ? ' (years in titles included)' : ''}` : ''],
      ['Hallucination fills the gaps', 'Where the model has no data it extrapolates, with the same fluent confidence and the same length. Fluency is not evidence.',
        fl.length ? `${short(k)} wrote a confident article for ${made} of ${fl.length} topics that do not exist`
          : dlo && fin(dlo.gen_bytes) ? `Rarely read topics: about ${fmtBytes(dlo.gen_bytes)} written per topic, ${pct(dlo.meaningful_share)} of it ${word}` : ''],
      sizeEv && !sizeEv.up
        ? ['Bigger is not automatically better', 'More parameters cost more memory, energy and time, and on this test the bigger model did not clearly keep more. Pick the smallest model that is good enough for the task.', sizeEv.txt]
        : ['Bigger models lose less, at a cost', 'More parameters keep more detail, but cost more memory, energy and time. Pick the smallest model that is good enough for the task.', sizeEv ? sizeEv.txt : ''],
      ['When details matter, give it your data', 'Paste the source document or connect your own data (retrieval, "RAG"). Then the model mostly has to reword what is in front of it, which it does far more faithfully than writing from memory. It can still slip in details of its own, so check what matters.',
        fin(b.paraphrase_mean) ? `Rewording a pasted paragraph: similarity ${f2(b.paraphrase_mean)}${s && fin(s.mean_cos) ? ` vs ${f2(s.mean_cos)} from memory (the title alone scores ${f2(b.title_mean)}; balanced sample)` : ''}` : ''],
    ];
    $('takeaways').innerHTML = cards.map(([h, p, ev]) => `<div class="tk-card reveal"><h3>${esc(h)}</h3><p>${esc(p)}</p>${ev ? `<div class="ev">${esc(ev)}</div>` : ''}</div>`).join('');
    const m = get(R, 'meta', {});
    $('foot').innerHTML = [
      '<b>AI for Business · Global MBA · Reichman University</b> · Dr. Moses (Moshik) Miller',
      `Data: English Wikipedia snapshot ${esc(m.wiki_snapshot || '2023-11-01')}, text by Wikipedia contributors under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a> (shown as plain text, shortened; each article links to its Wikipedia page) · page views ${esc(m.pageviews_month || '2023-10')} (Wikimedia). Generated text: machine output, often false; do not cite it.`,
      `Models: Qwen (${MODELS.map(x => esc(short(x.key))).join(', ') || 'Qwen2.5 7B'}), run locally with MLX · similarity: ${esc(m.embed_model || 'BAAI/bge-small-en-v1.5')}${m.embed_model_alt ? ', checked with ' + esc(m.embed_model_alt) : ''}.`,
      `Training data size: ${srcLink()}${fin(get(R, 'sizes.training_tokens.qwen3', NaN)) ? `; Qwen3: ${srcLink(QWEN3_REPORT)}` : ''}. English Wikipedia only throughout.`,
      R ? `Results generated ${esc(String(m.generated || '').replace('T', ' '))}${m.seed ? ' · seed ' + esc(m.seed) : ''}.` + (m.mock ? ' <b>Mock data: the numbers are placeholders for layout.</b>' : '') : '<b>No results file yet.</b>',
    ].map(x => `<div>${x}</div>`).join('');
  }

  // =====================================================================
  // navigation, theme, reveal
  function setupNav() {
    const secs = [...document.querySelectorAll('main > .section')];
    const nav = $('secnav');
    nav.innerHTML = secs.map((s, i) => `<a href="#${s.id}" data-id="${s.id}" title="${esc(s.dataset.title)}"><span class="n">${i + 1}</span><span class="t">${esc(s.dataset.short || s.dataset.title)}</span></a>`).join('');
    const links = [...nav.querySelectorAll('a')];
    const setActive = id => links.forEach(a => { const on = a.dataset.id === id; a.classList.toggle('is-on', on); if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    const onScroll = () => {
      const y = window.scrollY + window.innerHeight * 0.35;
      let cur = secs[0];
      secs.forEach(s => { if (s.offsetTop <= y) cur = s; });
      setActive(cur.id);
      const h = document.documentElement.scrollHeight - window.innerHeight;
      $('progress').style.width = (h > 0 ? window.scrollY / h * 100 : 0) + '%';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    // keyboard: → / j next stop, ← / k previous stop (stops = sections + result blocks)
    const stops = () => {
      const head = $('topbar').offsetHeight;
      return [...document.querySelectorAll('main > .section, [data-stop]')]
        .map(e => Math.max(0, Math.round(e.getBoundingClientRect().top + window.scrollY - head - (e.classList.contains('section') ? 0 : 16))))
        .sort((a, b) => a - b);
    };
    // A slider, switch or dropdown used with the mouse should not keep the keyboard: blur it once its value is set, so
    // 1-9/0, ←/→, j/k and t keep working. Keyboard (Tab) users keep native arrow-key control.
    let viaPointer = false;
    document.addEventListener('pointerdown', () => { viaPointer = true; }, true);
    document.addEventListener('keydown', () => { viaPointer = false; }, true);
    document.addEventListener('change', e => {
      const t = e.target;
      if (viaPointer && t && t.matches && t.matches('input[type=range], input[type=checkbox], select')) t.blur();
    });
    // a click on a slider's label, or on its knob without moving it, focuses it without any "change"
    document.addEventListener('pointerup', () => setTimeout(() => {
      const a = document.activeElement;
      if (viaPointer && a && a.matches && a.matches('input[type=range], input[type=checkbox]')) a.blur();
    }, 0), true);
    document.addEventListener('keydown', e => {
      const t = e.target;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Page keys win over a closed dropdown (its type-ahead would otherwise change the selection); ↑/↓/Enter still drive it.
      if (t && t.tagName === 'SELECT' && /^(ArrowLeft|ArrowRight|[jkJKtT0-9])$/.test(e.key)) { e.preventDefault(); t.blur(); }
      else if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const k = e.key;
      if (k === 't' || k === 'T') { toggleTheme(); return; }
      if (/^[0-9]$/.test(k)) {          // 1..9 jump to sections 1..9, 0 to section 10
        const sec = secs[k === '0' ? 9 : +k - 1];
        if (!sec) return;
        e.preventDefault();
        window.scrollTo({ top: Math.max(0, sec.getBoundingClientRect().top + window.scrollY - $('topbar').offsetHeight), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        return;
      }
      let dir = 0;
      if (k === 'ArrowRight' || k === 'j' || k === 'J') dir = 1;
      if (k === 'ArrowLeft' || k === 'k' || k === 'K') dir = -1;
      if (!dir) return;
      e.preventDefault();
      const y = Math.round(window.scrollY), list = stops();
      const target = dir > 0 ? list.find(s => s > y + 8) : [...list].reverse().find(s => s < y - 8);
      if (target != null) window.scrollTo({ top: target, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  }
  function applyTheme(th) {
    document.documentElement.setAttribute('data-theme', th);
    const b = $('themeBtn');
    b.setAttribute('aria-label', th === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    document.dispatchEvent(new Event('themechange'));
  }
  function toggleTheme() {
    const th = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(th);
    try { localStorage.setItem('ai4b-theme', th); } catch (e) { /* private mode */ }
  }
  function setupTheme() {
    let th = 'light';
    try { th = localStorage.getItem('ai4b-theme') || 'light'; } catch (e) { /* ignore */ }
    applyTheme(th === 'dark' ? 'dark' : 'light');
    $('themeBtn').addEventListener('click', toggleTheme);
  }
  let revealIO = null;
  function setupReveal() {
    const els = document.querySelectorAll('.reveal:not(.in)');
    if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) { els.forEach(e => e.classList.add('in')); return; }
    if (!revealIO) revealIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); } }), { rootMargin: '0px 0px -40px 0px' });
    els.forEach(e => revealIO.observe(e));
  }

  // Helpers the decompression section (js/decompress.js) shares with this file.
  const CTX = { R, MODELS, MAIN, get, model, color, short, BINS, binLabel, fmtBytes, fmtGB2, fmtBig, fmtInt, pct, f2, fx, empty, seg, safe, columns, sensitive,
    srcLink, openItem: (id, k) => window.App.openItem(id, k), hasItem: id => (get(R, 'items', []) || []).some(i => i.id === id) };

  // =====================================================================
  function init() {
    setupTheme();
    setupNav();
    if (get(R, 'meta.mock', false)) $('mockBadge').hidden = false;
    safe('regression', () => Regression.init());
    safe('hero', renderHero);
    safe('sizes', () => { renderSizes(); bindSizes(); });
    safe('decompression', () => Decompress.init(CTX));
    safe('experiment', renderExperiment);
    safe('headline', renderHeadline);
    safe('distribution', renderDist);
    safe('core', renderCore);
    safe('params', renderParams);
    safe('bpb', () => {
      renderBpb();
      document.querySelectorAll('#bpbAll .seg-b').forEach(b => b.addEventListener('click', () => {
        state.bpbAll = b.dataset.all === '1'; document.querySelectorAll('#bpbAll .seg-b').forEach(x => x.classList.toggle('is-on', x === b)); renderBpb();
      }));
    });
    safe('words', () => {
      renderWords();
      document.querySelectorAll('#wordsX .seg-b').forEach(b => b.addEventListener('click', () => {
        state.wordsX = b.dataset.x; document.querySelectorAll('#wordsX .seg-b').forEach(x => x.classList.toggle('is-on', x === b)); renderWords();
      }));
    });
    safe('facts', renderFacts);
    safe('explorer', renderExplorer);
    safe('surprise', renderSurprise);
    safe('fiction', renderFiction);
    safe('takeaways', renderTakeaways);
    safe('live', () => Live.init());
    document.querySelectorAll('.card:not(.reg-plot):not(.reg-controls):not(.reg-readout):not(.explorer), .map-row').forEach(e => e.classList.add('reveal'));
    setupReveal();
  }

  window.App = {
    color, short, init,
    openItem(id, k) {
      ex.sel = id; ex.pin = id; if (k) { ex.view = k; }
      ex.q = ''; ex.bin = ''; ex.kind = ''; $('exSearch').value = ''; $('exBin').value = ''; $('exKind').value = '';
      const l = exItems(); const idx = l.findIndex(i => i.id === id); if (idx >= ex.limit) ex.limit = idx + 1;
      renderExList(); renderExDetail(); revealSel();
      $('s6').scrollIntoView({ behavior: 'smooth' });
    },
    rerender() { safe('decompression', () => Decompress.rerender()); [renderHero, renderSizes, renderExperiment, renderHeadline, renderDist, renderCore, renderParams, renderBpb, renderWords, renderFacts, renderSurprise, renderFiction, renderTakeaways].forEach(f => safe(f.name, f)); setupReveal(); },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
