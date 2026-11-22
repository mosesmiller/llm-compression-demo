/* Section 4, the decompression test. Each model wrote the WHOLE Wikipedia article from the title alone; step 06b
   fact-checked every sentence against the real article with a local natural-language-inference model
   (confirmed / contradicts / can't confirm), and the sample was scaled up to all eligible English topics like
   a poll. Draws the big statement, the decompression calculator (written, and the confirmed part, next to the
   real text of the same topics), the per-popularity chart, the article viewer (sentences coloured by the check, linked to the real article) and
   the method box, from RESULTS.decompression and window.ARTICLES. site/data/articles.js is large, so it is
   loaded only when the viewer comes near and the first paint stays fast. Every part degrades to a short note
   when its data is missing or partial (no 32B yet, some popularity bands missing, no articles file); data from
   the older paragraph-level scoring (embedding similarity, no sentences) still renders, paragraph by paragraph.
   The live lab reuses the sentence rendering through window.Decompress. */
(function () {
  'use strict';
  let C = null;                                    // helpers and data handed over by app.js (CTX there)
  const $ = id => document.getElementById(id);
  const esc = s => VZ.esc(s), fin = v => VZ.finite(v);
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const BIN_LO = { '<10': 0, '10-99': 10, '100-999': 100, '1k-10k': 1000, '10k-100k': 10000, '100k-1M': 100000, '>=1M': 1000000 };
  const SYSTEM_PROMPT = 'You are an encyclopedia. You write accurate, neutral, factual Wikipedia text.';
  const ARTICLE_PROMPT = 'Write the complete English Wikipedia article titled "{title}". Start with the lead section, then write the main sections the real article has, each with its section title on its own line. Write it exactly as it would appear on Wikipedia, as plain text with no markdown, bullet lists or commentary, and include as much accurate detail as Wikipedia does.';
  const st = { model: null, minBin: 0, binsMode: 'bytes' };

  // ---------- data access
  const R = () => (C && C.R) || window.RESULTS || null;
  const D = () => { const r = R(); return (r && r.decompression) || null; };
  const DM = k => { const d = D(); return d && d.models ? d.models[k] || null : null; };
  function byParams(keys) {
    const order = C.MODELS.map(m => m.key);
    return keys.slice().sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)));
  }
  // A model whose full-article run does not yet cover every popularity level (e.g. a 32B run still in progress) is
  // left out of the scaled-up numbers; the article viewer still shows its texts.
  const complete = k => { const d = D(), m = DM(k); return !(d && m && fin(d.eligible_topics) && fin(m.topics_covered) && m.topics_covered < d.eligible_topics * 0.995); };
  const dcModels = () => { const d = D(); return d && d.models ? byParams(Object.keys(d.models).filter(k => DM(k) && (DM(k).totals || DM(k).by_bin) && complete(k))) : []; };
  const diskOf = k => { const m = DM(k); return m && fin(m.model_disk_bytes) ? m.model_disk_bytes : C.model(k).disk_bytes; };
  const wikiBytes = () => { const d = D(); return d && fin(d.wikipedia_text_bytes_total) ? d.wikipedia_text_bytes_total : C.get(C.R, 'sizes.wiki_text_bytes', NaN); };
  const binOrder = () => { const b = C ? C.BINS() : []; return b.length ? b : Object.keys(BIN_LO); };
  // v3 (sentence-level fact check) or the older paragraph-level embedding score
  const isNLI = () => { const d = D(); return !!d && (d.method === 'nli' || Object.values(d.models || {}).some(m => m && m.totals && fin(m.totals.contradicted_bytes))); };
  const nliThr = () => { const d = D(); return d && fin(d.nli_threshold) ? d.nli_threshold : d && d.method === 'nli' && fin(d.threshold) ? d.threshold : null; };
  const topK = () => { const d = D(); return d && fin(d.top_k_premise) ? d.top_k_premise : null; };
  const threshold = () => { const d = D(); return d && !isNLI() && fin(d.threshold) ? d.threshold : null; };     // embedding bar (older data)
  // The control: the share of sentences a look-alike WRONG article "confirms" (noise), and their own article's share.
  const fsrOf = () => { const d = D(); return d && fin(d.false_support_rate) ? d.false_support_rate : null; };
  const ownOf = () => { const d = D(); return d && fin(d.own_support_rate_same) ? d.own_support_rate_same : null; };
  const ELIGIBLE = 'articles with a real opening paragraph, excluding lists and disambiguation pages';
  const allArticles = () => C.get(C.R, 'sizes.wiki_articles', NaN);

  // ---------- formatting
  const fxr = v => !fin(v) ? 'n/a' : v > 0 && v < 0.005 ? '<0.01×' : v < 1 ? v.toFixed(2) + '×' : C.fx(v);
  function fmtKB(v) {
    if (!fin(v)) return 'n/a';
    if (v < 1000) return Math.round(v) + ' B';
    return v < 10000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + ' KB' : Math.round(v / 1000).toLocaleString('en-US') + ' KB';
  }
  function fmtDays(d) {
    if (!fin(d)) return 'n/a';
    if (d < 2) {
      const h = d * 24;
      if (h < 1) { const mi = Math.max(1, Math.round(h * 60)); return mi + (mi === 1 ? ' minute' : ' minutes'); }
      const hr = Math.round(h); return hr + (hr === 1 ? ' hour' : ' hours');
    }
    if (d < 60) return Math.round(d) + ' days';
    if (d < 730) return `${Math.round(d)} days <small>about ${Math.round(d / 30.4)} months, nonstop</small>`;
    return `${Math.round(d).toLocaleString('en-US')} days <small>about ${(d / 365).toFixed(1)} years, nonstop</small>`;
  }
  const near = (v, thr) => thr != null && fin(v) && Math.abs(v - thr) < 0.006;   // 0.738 never shows as the bar's 0.74
  const fmtScore = (v, thr) => !fin(v) ? '' : v.toFixed(near(v, thr) ? 3 : 2);
  const share = v => !fin(v) ? 'n/a' : v > 0 && v < 0.005 ? '<1%' : Math.round(v * 100) + '%';
  const prob = v => !fin(v) ? 'n/a' : v >= 0.995 && v < 1 ? '>99%' : share(v);
  const words = t => String(t || '').split(/\s+/).filter(Boolean).length;
  const enc = new TextEncoder();
  const bytes = t => enc.encode(String(t || '')).length;
  // Same rule as pipeline/06b_article_score.py: a short line without end punctuation is a section title.
  const isHeading = l => { l = l.trim(); return !!l && l.split(/\s+/).length <= 10 && !/[.!?:;"”)]$/.test(l); };
  function paraHtml(text) {
    const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
    return lines.map((l, i) => i < lines.length - 1 && isHeading(l) ? `<span class="gp-h">${esc(l)}</span>` : `<span class="gp-t">${esc(l)}</span>`).join('');
  }

  // =====================================================================
  // Sentence-level article rendering, shared by the viewer and the live lab.
  // A paragraph is {text, heading, sentences: [{text, label, p_entail, p_contra}], support_share, best_real_para, score}.
  const LAB = {
    supported: { c: 'ok', mark: '✓', short: 'confirmed', name: 'Confirmed by the real article' },
    contradicted: { c: 'bad', mark: '✗', short: 'contradicts', name: 'Contradicts the real article' },
    unconfirmed: { c: 'unk', mark: '?', short: "can't confirm", name: "Can't confirm: invented, or not in the article" },
  };
  const KEYS = ['supported', 'contradicted', 'unconfirmed'];
  const labOf = s => s && s.label ? LAB[s.label] || LAB.unconfirmed : null;
  const hasSentences = paras => (paras || []).some(p => p && Array.isArray(p.sentences));
  function tally(paras) {                           // bytes and sentence counts per label
    const t = { supported: 0, contradicted: 0, unconfirmed: 0, n: { supported: 0, contradicted: 0, unconfirmed: 0 } };
    (paras || []).forEach(p => (p.sentences || []).forEach(s => { if (s && t[s.label] != null) { t[s.label] += s.b != null ? s.b : bytes(s.text); t.n[s.label]++; } }));   // s.b: original size of a sentence the online copy hides
    return t;
  }
  // The paragraph's heading line(s), where they stand in its text: before the body, or after it (the last
  // paragraph collects trailing section titles). Sentences are rendered from the data, never searched in the text.
  function headParts(p) {
    const lines = String(p.text || '').split('\n').map(l => l.trim()).filter(Boolean);
    const heads = new Set(p.heading != null ? String(p.heading).split('\n').map(l => l.trim()).filter(Boolean)
      : lines.length > 1 ? lines.filter(isHeading) : []);
    let last = -1;
    lines.forEach((l, i) => { if (!heads.has(l)) last = i; });
    if (last < 0) return { before: [], after: [] };        // only titles: they are the sentences
    return { before: lines.slice(0, last).filter(l => heads.has(l)), after: lines.slice(last + 1) };
  }
  function paraV3(p, n, o) {
    const ss = p.sentences || [], t = tally([p]), tot = t.supported + t.contradicted + t.unconfirmed;
    const sup = fin(p.support_share) ? p.support_share : tot ? t.supported / tot : 0;
    const cls = o.fic ? 'fic' : sup >= 0.5 ? 'p-ok' : tot && t.contradicted / tot >= 0.5 ? 'p-bad' : 'p-unk';
    const { before, after } = headParts(p);
    const h = l => `<span class="gp-h">${esc(l.replace(/^=+\s*(.*?)\s*=+$/, '$1'))}</span>`;     // "== History ==" from wiki markup
    const sn = (s, i) => { const L = o.fic ? null : labOf(s); return `<span class="sn s-${L ? L.c : 'fic'}" data-s="${i}">${esc(s.text)}${L ? `<span class="sr"> (${L.short})</span>` : ''}</span>`; };
    const sum = o.fic ? `Paragraph ${n + 1}, invented.` : `Paragraph ${n + 1}: ${t.n.supported} confirmed, ${t.n.contradicted} contradicted, ${t.n.unconfirmed} can't confirm.`;
    return `<div class="gp v3 ${cls}" data-n="${n}" tabindex="0"><span class="sr">${esc(sum)} </span>${before.map(h).join('')}${ss.length ? `<span class="gp-t">${ss.map(sn).join(' ')}</span>` : ''}${after.map(h).join('')}</div>`;
  }
  function paraLegacy(p, n, o) {                    // older data: one verdict per paragraph (embedding similarity)
    const thr = o.thr !== undefined ? o.thr : threshold();
    const cls = o.fic ? 'fic' : p.meaningful === true ? 'ok' : p.meaningful === false ? 'bad' : 'na';
    const badge = o.fic ? 'invented' : p.meaningful === true ? `✓ ${fmtScore(p.score, thr)}` : p.meaningful === false ? `✗ ${fmtScore(p.score, thr)}` : '';
    const say = o.fic ? 'invented' : p.meaningful ? 'matches the real article' : 'not found in the real article';
    return `<div class="gp ${cls}" data-n="${n}" tabindex="0"><span class="sr">Paragraph ${n + 1}: ${say}. </span><span class="gp-badge">${badge}</span>${paraHtml(p.text)}</div>`;
  }
  const articleHtml = (paras, o) => { o = o || {}; const v3 = hasSentences(paras); return (paras || []).map((p, n) => v3 ? paraV3(p, n, o) : paraLegacy(p, n, o)).join(''); };

  // One bar of three shares (bytes per label), with labels and marks so colour is not the only signal.
  function summaryBar(b, foot) {
    const parts = KEYS.map(k => ({ k, L: LAB[k], v: fin(b && b[k]) ? Math.max(0, b[k]) : 0 }));
    const t = parts.reduce((a, p) => a + p.v, 0);
    if (!(t > 0)) return '';
    parts.forEach(p => { p.s = p.v / t; });
    return `<div class="sbar-wrap"><div class="sbar" role="img" aria-label="${esc(parts.map(p => `${p.L.short} ${share(p.s)}`).join(', '))}">` +
      parts.filter(p => p.s > 0).map(p => `<span class="sb-${p.L.c}" style="flex-grow:${p.s.toFixed(4)}">${p.s >= 0.09 ? share(p.s) : ''}</span>`).join('') +
      `</div><div class="sbar-lg">${parts.map(p => `<span class="k k-${p.L.c}"><i></i>${p.L.mark} ${esc(p.L.short)} <b>${share(p.s)}</b></span>`).join('')}` +
      `${foot ? `<span class="k-note">${esc(foot)}</span>` : ''}</div></div>`;
  }
  function legendHtml(o) {
    o = o || {};
    const k = topK(), thr = o.thr != null ? o.thr : nliThr(), fsr = fsrOf();
    return `<span class="lg"><span class="sn s-ok">✓ confirmed by the real article</span></span>` +
      `<span class="lg"><span class="sn s-bad">✗ contradicts the real article</span></span>` +
      `<span class="lg"><span class="sn s-unk">? can't confirm (invented, or not in the article)</span></span>` +
      `<span class="lg-note">${esc(o.note || `A local fact-checking model reads each sentence next to the ${k ? k + ' ' : ''}most relevant paragraphs of the real article${thr != null ? ` and needs ${Math.round(thr * 100)}% confidence for green or red` : ''}. Green is conservative: a true fact the article does not mention stays grey. It is not noise-free: ${fsr != null ? `a look-alike wrong article still "confirms" ${C.pct(fsr, 1)} of sentences` : 'the checker sometimes confirms a vague or wrong sentence'}. Red is noisier: a nearby place or a near-miss detail can count as a contradiction.`)}</span>`;
  }

  // Tooltips: the fact checker's numbers for a sentence, the counts for a paragraph.
  function sentTip(s, o) {
    if (o.fic) return '<div class="tt-h">Invented</div><div class="tt-f">This topic does not exist: there is no real article to check against.</div>';
    const L = labOf(s) || LAB.unconfirmed, head = `<div class="tt-h">${L.mark} ${esc(L.name)}</div>`;
    if (!fin(s.p_entail) && !fin(s.p_contra)) return head + '<div class="tt-f">Not checked: fewer than 4 words, or a runaway list from a decoding loop. It counts as can\'t confirm.</div>';
    const k = topK(), thr = o.thr != null ? o.thr : nliThr();
    return head + VZ.tip.row('var(--good)', 'The real article supports it', prob(s.p_entail)) + VZ.tip.row('var(--crit)', 'The real article contradicts it', prob(s.p_contra)) +
      `<div class="tt-f">The fact checker's confidence, reading the ${k ? k + ' ' : ''}most relevant paragraphs of the real article.${thr != null ? ` ${Math.round(thr * 100)}% or more makes it green or red.` : ''}</div>`;
  }
  function paraTip(p, n, o) {
    if (o.fic) return `<div class="tt-h">Paragraph ${n + 1}: invented</div><div class="tt-f">There is no real article to check against.</div>`;
    if (!hasSentences([p])) {
      const thr = o.thr !== undefined ? o.thr : threshold();
      return `<div class="tt-h">Paragraph ${n + 1}: ${p.meaningful ? 'matches the real article' : 'not found in the real article'}</div>` + (fin(p.score) ? VZ.tip.row(null, 'Similarity to its closest real paragraph', fmtScore(p.score, thr)) : '');
    }
    const t = tally([p]), nn = t.n.supported + t.n.contradicted + t.n.unconfirmed;
    return `<div class="tt-h">Paragraph ${n + 1}: ${nn} sentence${nn === 1 ? '' : 's'} checked</div>` +
      VZ.tip.row('var(--good)', '✓ Confirmed', String(t.n.supported)) + VZ.tip.row('var(--crit)', '✗ Contradicts the article', String(t.n.contradicted)) +
      VZ.tip.row('var(--unk)', "? Can't confirm", String(t.n.unconfirmed)) + (fin(p.support_share) ? VZ.tip.row(null, 'Confirmed share of its text', share(p.support_share)) : '');
  }

  // Hover, tap and keyboard on a rendered article. Bound once per container; the latest paragraphs and
  // options live on the element, so the live lab can re-render into the same box.
  // Keyboard: Tab reaches each paragraph, Up/Down move between paragraphs, Enter steps into the sentences,
  // Left/Right (or Up/Down) move between sentences, Escape goes back to the paragraph.
  function bindArticle(box, paras, o) {
    box._art = { paras: paras || [], o: o || {} };
    if (box._artBound) return;
    box._artBound = true;
    let lastKey = null, lastHtml = '';
    const hit = target => {
      const g = target && target.closest && target.closest('.gp');
      if (!g || !box.contains(g)) return null;
      const sn = target.closest('.sn');
      return { g, n: +g.dataset.n, sn: sn && g.contains(sn) ? sn : null, s: sn && g.contains(sn) ? +sn.dataset.s : null };
    };
    const show = (h, ev) => {
      const { paras: ps, o: op } = box._art, p = ps[h.n];
      if (!p) return;
      const key = h.n + ':' + h.s;
      if (key !== lastKey) { lastKey = key; lastHtml = h.s != null && p.sentences && p.sentences[h.s] ? sentTip(p.sentences[h.s], op) : paraTip(p, h.n, op); }
      if (ev && ev.clientX) VZ.tip.show(lastHtml, ev.clientX, ev.clientY);
      else { const r = (h.sn || h.g).getBoundingClientRect(); VZ.tip.show(lastHtml, Math.min(r.left + 24, innerWidth - 60), Math.min(r.bottom, innerHeight - 20)); }
      if (op.onPara) op.onPara(h.n, h.s);
    };
    const focusSn = el => { el.setAttribute('tabindex', '-1'); el.focus(); };
    box.addEventListener('pointerover', ev => { const h = hit(ev.target); if (h) show(h, ev); });
    box.addEventListener('pointermove', ev => { if (ev.pointerType === 'touch') return; const h = hit(ev.target); if (h) show(h, ev); });
    box.addEventListener('pointerleave', ev => { if (ev.pointerType !== 'touch') { VZ.tip.hide(); lastKey = null; } });
    box.addEventListener('click', ev => { const h = hit(ev.target); if (h) show(h, ev); });
    box.addEventListener('focusin', ev => { const h = hit(ev.target); if (h && (ev.target === h.g || ev.target === h.sn)) show(h, null); });
    box.addEventListener('focusout', ev => {
      VZ.tip.hide(); lastKey = null;
      if (ev.target.classList && ev.target.classList.contains('sn')) ev.target.removeAttribute('tabindex');
    });
    box.addEventListener('keydown', ev => {
      const t = ev.target;
      if (!t.classList) return;
      if (t.classList.contains('gp')) {
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
          const all = [...box.querySelectorAll('.gp')], nx = all[all.indexOf(t) + (ev.key === 'ArrowDown' ? 1 : -1)];
          if (nx) { ev.preventDefault(); nx.focus(); }
        } else if ((ev.key === 'Enter' || ev.key === ' ') && t.querySelector('.sn')) { ev.preventDefault(); focusSn(t.querySelector('.sn')); }
      } else if (t.classList.contains('sn')) {
        const all = [...box.querySelectorAll('.sn')], i = all.indexOf(t);
        const step = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0;
        if (step) { ev.preventDefault(); ev.stopPropagation(); if (all[i + step]) focusSn(all[i + step]); }   // keep the page's own arrow keys out
        else if (ev.key === 'Escape') { ev.preventDefault(); t.closest('.gp').focus(); }
      }
    });
  }

  // =====================================================================
  // (a) big statement + decompression calculator
  function totalsFor(k) {
    const m = DM(k);
    if (!m) return null;
    const t = m.totals || {}, rows = m.by_bin || [], order = binOrder();
    const sum = (rs, f) => rs.some(b => fin(b[f])) ? rs.reduce((a, b) => a + (fin(b.eligible) && fin(b[f]) ? b.eligible * b[f] : 0), 0) : NaN;
    const vw = rs => {          // confirmed share, each popularity band weighted by its page views (as in step 06b)
      const ok = rs.filter(b => fin(b.views_eligible) && fin(b.meaningful_share)), w = ok.reduce((a, b) => a + b.views_eligible, 0);
      return w > 0 ? ok.reduce((a, b) => a + b.views_eligible * b.meaningful_share, 0) / w : NaN;
    };
    const allGen = sum(rows, 'gen_bytes');
    if (st.minBin === 0 && fin(t.gen_bytes)) {
      return { all: true, topics: fin(m.topics_covered) ? m.topics_covered : rows.reduce((a, b) => a + (b.eligible || 0), 0),
        gen: t.gen_bytes, gen_ci: t.gen_bytes_ci, conf: t.meaningful_bytes, conf_ci: t.meaningful_bytes_ci,
        contra: t.contradicted_bytes, contra_ci: t.contradicted_bytes_ci, unk: t.unconfirmed_bytes, unk_ci: t.unconfirmed_bytes_ci,
        real: t.real_bytes, real_ci: t.real_bytes_ci, days: m.days_to_generate_all,
        vw: fin(m.view_weighted_meaningful_share) ? m.view_weighted_meaningful_share : vw(rows) };
    }
    const inc = rows.filter(b => order.indexOf(b.label) >= st.minBin);
    const gen = sum(inc, 'gen_bytes'), frac = allGen > 0 ? gen / allGen : NaN;
    return { all: st.minBin === 0, topics: inc.reduce((a, b) => a + (b.eligible || 0), 0), gen, conf: sum(inc, 'meaningful_bytes'),
      contra: sum(inc, 'contradicted_bytes'), unk: sum(inc, 'unconfirmed_bytes'), real: sum(inc, 'real_bytes'),
      days: fin(m.days_to_generate_all) ? m.days_to_generate_all * frac : NaN, vw: vw(inc) };
  }
  const ciTxt = (a, f) => a && fin(a[0]) && fin(a[1]) ? `${f(a[0])}–${f(a[1])}` : null;

  function renderBig() {
    const box = $('dcBig'), k = st.model, m = DM(k), d = D();
    if (!m || !m.totals || !fin(m.totals.gen_bytes)) {
      box.innerHTML = '<div class="empty">The decompression results appear here once the full-article run (step 04, task "article"), its fact check (step 06b) and the site data (step 08) are done. The live lab can already write whole articles.</div>';
      return;
    }
    const t = m.totals, disk = diskOf(k), rg = t.gen_bytes / disk, rc = t.meaningful_bytes / disk;
    const topics = fin(m.topics_covered) ? m.topics_covered : d.eligible_topics;
    const partial = fin(d.eligible_topics) && fin(m.topics_covered) && m.topics_covered < d.eligible_topics * 0.995;
    const c = `style="--c:${C.color(k)}"`, B = v => esc(C.fmtBytes(v));
    const zst = C.get(C.R, 'sizes.wiki_zst_bytes', NaN), nAll = allArticles();
    const where = partial ? ` · covers the ${esc(C.fmtBig(topics))} topics in the popularity bands measured so far, of ${esc(C.fmtBig(d.eligible_topics))}` : '';
    const elig = fin(nAll) && fin(d.eligible_topics) ? ` · eligible: ${esc(C.fmtBig(d.eligible_topics))} of all ${esc(C.fmtBig(nAll))} articles (${ELIGIBLE})` : ` · eligible: ${ELIGIBLE}`;
    if (!isNLI()) {
      const gci = ciTxt(t.gen_bytes_ci, C.fmtBytes), mci = ciTxt(t.meaningful_bytes_ci, C.fmtBytes);
      box.innerHTML = `<p class="dc-say">Given only the titles, this <b class="mdl" ${c}>${B(disk)}</b> file would write about <b class="mdl" ${c}>${B(t.gen_bytes)}</b> of encyclopedia for ${partial ? '' : 'all '}${esc(C.fmtBig(topics))} eligible English topics. About <b class="g">${B(t.meaningful_bytes)}</b> of it matches the real articles: <b class="g">${esc(fxr(rc))}</b> its own size${rc < 1 ? ', less than the file itself' : ''}.</p>
        <p class="dc-ci">${esc(C.short(k))}${gci ? ` · 95% intervals: written ${esc(gci)}, meaningful ${esc(mci || 'n/a')}` : ''}${where}${elig}.</p>`;
      return;
    }
    const sent = [t.meaningful_bytes, t.contradicted_bytes, t.unconfirmed_bytes].every(fin) ? t.meaningful_bytes + t.contradicted_bytes + t.unconfirmed_bytes : NaN;
    const cmp = r => !fin(r) ? '' : r < 0.95 ? ', less than the file itself' : r > 1.05 ? ', more than the file itself' : ', about the size of the file itself';
    const gci = ciTxt(t.gen_bytes_ci, C.fmtBytes), cci = ciTxt(t.meaningful_bytes_ci, C.fmtBytes);
    const vw = m.view_weighted_meaningful_share;
    box.innerHTML = `<p class="dc-say">Given only the titles, this <b class="mdl" ${c}>${B(disk)}</b> file would write about <b class="mdl" ${c}>${B(t.gen_bytes)}</b> of encyclopedia text for ${partial ? '' : 'all '}${esc(C.fmtBig(topics))} eligible English topics: <b class="mdl" ${c}>${esc(fxr(rg))}</b> its own size. Fact-checked sentence by sentence against the real articles, <b class="g">${B(t.meaningful_bytes)}</b> of it is confirmed: <b class="g">${esc(fxr(rc))}</b> the model${cmp(rc)}.</p>
      <p class="dc-ci">${esc(C.short(k))}${gci ? ` · 95% intervals: written ${esc(gci)}, confirmed ${esc(cci || 'n/a')}` : ''}${where}${elig}.` +
      (fin(t.contradicted_bytes) && fin(sent) && sent > 0 ? ` The real articles contradict ${B(t.contradicted_bytes)} (${share(t.contradicted_bytes / sent)} of its sentences, by length); ${B(t.unconfirmed_bytes)} (${share(t.unconfirmed_bytes / sent)}) can't be confirmed: invented, or simply not in the article.` : '') +
      (fin(vw) ? ` For the topics people actually read (weighting each popularity band by its page views), ${share(vw)} of what it writes is confirmed.` : '') +
      (fin(zst) ? ` For comparison, all of English Wikipedia${fin(nAll) ? ` (${esc(C.fmtBig(nAll))} articles)` : ''}, zipped with a standard compressor (zstd, maximum level), takes ${B(zst)} and gives back every letter.` : '') + '</p>';
  }

  function renderCalc() {
    const box = $('dcBars'), read = $('dcRead'), nums = $('dcNums'), k = st.model, m = DM(k);
    const t = m && totalsFor(k);
    if (!t || !fin(t.gen) || t.gen <= 0) {
      C.empty(box, 'The calculator appears once the decompression results are built.');
      read.innerHTML = ''; nums.innerHTML = ''; $('dcTopicsBox').hidden = true; return;
    }
    const nli = isNLI();
    const rowsB = (m.by_bin || []).filter(b => fin(b.eligible));
    const order = binOrder();
    const slider = $('dcTopics');
    $('dcTopicsBox').hidden = rowsB.length < 2;
    slider.max = String(Math.max(0, order.length - 1));
    const lab = order[st.minBin];
    $('dcTopicsVal').innerHTML = st.minBin === 0 ? `all ${esc(C.fmtBig(t.topics))}` : `read ${esc(C.fmtInt(BIN_LO[lab] != null ? BIN_LO[lab] : 0))}+ times a month <small>(${esc(C.fmtBig(t.topics))})</small>`;
    const disk = diskOf(k), wiki = wikiBytes(), nAll = allArticles();
    // Like for like: the written text next to the real text of the SAME topics. All of Wikipedia (more articles)
    // is drawn only while every eligible topic is included, and labelled as such.
    const rows = [
      { key: 'model', lab: 'The model file', sub: C.short(k), v: disk, c: C.color(k), x: '1× (the yardstick)' },
    ].concat(t.all ? [
      { key: 'wiki', lab: 'All of English Wikipedia', sub: `${fin(nAll) ? C.fmtBig(nAll) + ' articles, ' : ''}plain text, at least`, v: wiki, c: 'var(--title)', f: C.fmtGB2 },
    ] : []).concat([
      { key: 'real', lab: 'Real Wikipedia text, same topics', sub: `${t.all ? 'all ' : ''}${C.fmtBig(t.topics)} eligible topics, estimated`, v: t.real, ci: t.real_ci, c: 'var(--title)', est: true },
      { key: 'gen', lab: 'Text it would write', sub: `${t.all ? 'all ' : ''}${C.fmtBig(t.topics)} eligible topics, estimated`, v: t.gen, ci: t.gen_ci, c: C.color(k), est: true },
    ]).concat(nli ? [
      { key: 'conf', lab: 'Confirmed', sub: 'by the real articles, a conservative count', v: t.conf, ci: t.conf_ci, c: 'var(--good)', est: true },
    ] : [
      { key: 'mean', lab: 'Of which meaningful', sub: 'matches the real articles', v: t.conf, ci: t.conf_ci, c: 'var(--good)', est: true },
    ]).filter(r => fin(r.v));
    const max = Math.max(...rows.map(r => Math.max(r.v, r.ci && fin(r.ci[1]) ? r.ci[1] : 0))) * 1.03;
    const pos = v => Math.max(0, Math.min(100, v / max * 100));
    // ruler in model files: how many copies of the model fit along each bar
    const W = (box.clientWidth || 700) - (box.clientWidth < 700 ? 0 : 250);
    const nMax = Math.floor(max / disk), steps = [1, 2, 5, 10, 20, 50, 100];
    const step = steps.find(s => nMax / s <= Math.max(3, Math.floor(W / 56))) || 100;
    const ticks = []; for (let j = step; j <= nMax; j += step) ticks.push(j);
    if (!box.querySelector('.dcb')) box.innerHTML = '';
    rows.forEach(r => {
      let row = box.querySelector(`.dcb[data-k="${r.key}"]`);
      if (!row) {
        row = VZ.html('div', 'dcb', box); row.dataset.k = r.key;
        row.innerHTML = '<div class="dcb-lab"><b></b><span></span></div><div class="dcb-tr"><div class="dcb-ticks"></div><div class="dcb-bar" style="width:0"></div><div class="dcb-ci" hidden></div><div class="dcb-val"></div></div>';
      }
      row.querySelector('.dcb-lab b').textContent = r.lab;
      row.querySelector('.dcb-lab span').textContent = r.sub;
      row.style.setProperty('--c', r.c);
      row.querySelector('.dcb-ticks').innerHTML = ticks.map(j => `<i style="left:${pos(j * disk)}%"${j === 1 ? ' class="one"' : ''}></i>`).join('') + (ticks[0] !== 1 ? `<i class="one" style="left:${pos(disk)}%"></i>` : '');
      const bar = row.querySelector('.dcb-bar');
      requestAnimationFrame(() => { bar.style.width = pos(r.v) + '%'; });
      const ci = row.querySelector('.dcb-ci'), hasCi = r.ci && fin(r.ci[0]) && fin(r.ci[1]);
      ci.hidden = !hasCi;
      if (hasCi) { ci.style.left = pos(r.ci[0]) + '%'; ci.style.width = Math.max(0.3, pos(r.ci[1]) - pos(r.ci[0])) + '%'; ci.title = `95% interval: ${C.fmtBytes(r.ci[0])} to ${C.fmtBytes(r.ci[1])}`; }
      const val = row.querySelector('.dcb-val');
      const ratio = r.key === 'model' ? r.x : `${fxr(r.v / disk)} the model`;
      val.innerHTML = `<b>${r.est ? '≈ ' : ''}${esc((r.f || C.fmtBytes)(r.v))}</b><em>${esc(ratio)}</em>`;
      // The value label goes after the bar, or inside a long bar; on a narrow screen it must fit in the track,
      // so it moves inside when there is no room after the bar, and drops the "× the model" chip as a last resort.
      const end = pos(hasCi ? r.ci[1] : r.v), start = pos(hasCi ? r.ci[0] : r.v), trW = row.querySelector('.dcb-tr').clientWidth;
      const em = val.querySelector('em');
      const fitsOut = () => !trW || end / 100 * trW + 10 + val.offsetWidth <= trW;
      const fitsIn = () => !trW || start / 100 * trW - 10 >= val.offsetWidth;
      const prefIn = end > 58 && pos(r.v) > 30;
      let inside = prefIn && fitsIn() ? true : fitsOut() ? false : fitsIn();
      if (!inside && !fitsOut() && em && r.key !== 'model') { em.hidden = true; inside = prefIn && fitsIn() ? true : fitsOut() ? false : fitsIn(); }
      const clamp = !inside && !fitsOut();
      val.classList.toggle('in', inside);
      val.style.left = inside || clamp ? 'auto' : `calc(${end}% + 10px)`;
      val.style.right = inside ? `calc(${100 - start}% + 10px)` : clamp ? '0' : 'auto';
      row.setAttribute('aria-label', `${r.lab}: ${(r.f || C.fmtBytes)(r.v)}, ${ratio}`);
    });
    box.querySelectorAll('.dcb').forEach(n => { if (!n.classList.contains('dcb-axis') && !rows.find(r => r.key === n.dataset.k)) n.remove(); });
    rows.forEach(r => box.appendChild(box.querySelector(`.dcb[data-k="${r.key}"]`)));      // keep the funnel order
    let axis = box.querySelector('.dcb-axis');
    if (!axis) { axis = VZ.html('div', 'dcb dcb-axis', null); axis.setAttribute('aria-hidden', 'true'); }
    box.appendChild(axis);
    axis.innerHTML = `<div class="dcb-lab"><span>Ruler: copies of the model file</span></div><div class="dcb-tr">${(ticks[0] !== 1 ? [1] : []).concat(ticks).map(j => `<span style="left:${pos(j * disk)}%">${j}×</span>`).join('')}</div>`;

    const tps = fin(m.tokens_per_second) ? m.tokens_per_second : fin(m.seconds_per_token) && m.seconds_per_token > 0 ? 1 / m.seconds_per_token : NaN;
    const metric = (l, v, cls) => `<div class="metric${cls ? ' ' + cls : ''}"><div class="lab">${esc(l)}</div><div class="v">${v}</div></div>`;
    const cards = [];
    if (nli) {
      if (fin(t.vw)) cards.push(metric('For the topics people actually read', `${share(t.vw)} confirmed <small>of what it writes, when each popularity band counts by its page views</small>`, 'vw'));
      const bar = summaryBar({ supported: t.conf, contradicted: t.contra, unconfirmed: t.unk });
      if (bar) cards.push(metric(t.all ? 'All topics, by length of text' : 'These topics, by length of text', bar, 'wide'));
    } else {
      cards.push(metric('Meaningful share', `${C.pct(t.conf / t.gen)} <small>of what it writes matches the real article</small>`));
    }
    cards.push(metric('Time to write it all on our test Mac', fmtDays(t.days) + (fin(tps) && tps > 0 ? `<small>at about ${esc(C.fmtInt(tps))} tokens a second, as measured</small>` : '') + (t.all ? '' : '<small>for the topics included above</small>')));
    cards.push(metric('Real Wikipedia text on these topics', fin(t.real) ? `${esc(C.fmtBytes(t.real))} <small>the model writes ${esc(fxr(t.gen / t.real))} as much</small>` : 'n/a'));
    cards.push(metric('Articles actually written', fin(m.n_topics) ? `${esc(C.fmtInt(m.n_topics))} <small>the sample behind these estimates</small>` : 'n/a'));
    read.innerHTML = cards.join('') + (t.all ? '' : '<p class="note">95% intervals are shown for all topics only.</p>');

    // the numbers behind the bars, with intervals
    const line = (l, v, ci, sub) => fin(v) ? `<tr><td>${esc(l)}${sub ? ` <small>${esc(sub)}</small>` : ''}</td><td>${esc(C.fmtBytes(v))}</td><td>${esc(ciTxt(ci, C.fmtBytes) || '–')}</td><td>${esc(fxr(v / disk))}</td></tr>` : '';
    const body = nli ? line('Written', t.gen, t.gen_ci) + line('Confirmed', t.conf, t.conf_ci) +
      line('Contradicted', t.contra, t.contra_ci) + line("Can't confirm", t.unk, t.unk_ci, 'invented, or not in the article') + line('Real Wikipedia text, same topics', t.real, t.real_ci)
      : line('Written', t.gen, t.gen_ci) + line('Meaningful', t.conf, t.conf_ci) + line('Real Wikipedia text, same topics', t.real, t.real_ci);
    const fsr = fsrOf(), own = ownOf();
    const noise = fsr != null ? ` It is not noise-free: a look-alike wrong article still "confirms" ${C.pct(fsr, 1)} of sentences${own != null ? `, against ${C.pct(own, 1)} for the right article` : ''}.` : '';
    nums.innerHTML = (nli ? `<p class="note">Confirmed is conservative: a true fact that the real article does not mention counts as "can't confirm".${esc(noise)} Not contradicted does not mean correct: most of the text can't be checked either way. Sentence totals leave out section titles, so confirmed, contradicted and can't confirm add up to a little less than written.</p>` : '') +
      `<details class="tbl"><summary>The numbers${t.all ? ', with 95% intervals' : ''}</summary><div class="tblwrap"><table class="dt"><thead><tr><th>${t.all ? 'All' : esc(C.fmtBig(t.topics))} topics</th><th>Estimate</th><th>95% interval</th><th>× the model</th></tr></thead><tbody>${body}</tbody></table></div></details>`;
  }

  // =====================================================================
  // (b) per topic, by popularity: what it writes (confirmed / contradicted / can't confirm), next to the real article
  const HATCH = 'repeating-linear-gradient(135deg, var(--crit) 0 3px, color-mix(in srgb, var(--crit) 55%, var(--surface)) 3px 5px)';
  function binParts(nli) {
    return nli ? [
      { f: 'meaningful_bytes', s: 'meaningful_share', label: 'Confirmed', color: 'var(--good)' },
      { f: 'contradicted_bytes', s: 'contradicted_share', label: 'Contradicts the real article', color: 'var(--crit)', hatch: true },
      { f: 'unconfirmed_bytes', s: 'unconfirmed_share', label: "Can't confirm", color: 'var(--unk)' },
    ] : [
      { f: 'meaningful_bytes', s: 'meaningful_share', label: 'Matches the real article', color: 'var(--good)' },
      { f: 'rest_bytes', s: 'rest_share', label: 'Not found in it', color: 'var(--unk)' },
    ];
  }
  function binRow(r, nli) {          // fills what older or partial rows leave out
    const x = Object.assign({}, r);
    if (nli) {
      if (!fin(x.unconfirmed_bytes) && fin(x.gen_bytes)) x.unconfirmed_bytes = Math.max(0, x.gen_bytes - (x.meaningful_bytes || 0) - (x.contradicted_bytes || 0));
      x.unconfirmed_share = fin(x.meaningful_share) ? Math.max(0, 1 - x.meaningful_share - (fin(x.contradicted_share) ? x.contradicted_share : 0)) : NaN;
    } else {
      x.rest_bytes = fin(x.gen_bytes) ? Math.max(0, x.gen_bytes - (x.meaningful_bytes || 0)) : NaN;
      x.rest_share = fin(x.meaningful_share) ? 1 - x.meaningful_share : NaN;
    }
    return x;
  }
  function binsChart(box, rows, order, mode, nli) {
    const parts = binParts(nli), shares = mode === 'share';
    const row = l => rows.find(r => r.label === l) || {};
    const val = (r, p) => shares ? r[p.s] : r[p.f];
    const legend = parts.map(p => ({ label: p.label, color: p.hatch ? HATCH : p.color, kind: 'box' }))
      .concat(shares ? [] : [{ label: 'The real article (↑ above the chart)', color: 'var(--ink-2)', kind: 'ref' }]);
    const fr = VZ.frame(box, { legend, label: 'What the model writes per topic, by popularity', margin: { left: 64, right: 16, top: 30, bottom: 56 }, marginNarrow: { left: 50, right: 6 } });
    const x = VZ.band(order, [0, fr.w], fr.narrow ? 0.22 : 0.36);
    const stackMax = Math.max(...order.map(l => parts.reduce((a, p) => a + (fin(val(row(l), p)) ? val(row(l), p) : 0), 0)));
    const yd = shares ? [0, 1] : VZ.nice(0, Math.max(1, stackMax * 1.12), 5);
    const y = VZ.linear(yd, [fr.h, 0]);
    VZ.axisY(fr, y, { format: shares ? (v => Math.round(v * 100) + '%') : fmtKB, label: shares ? 'Share of what it writes (average per topic)' : 'Bytes per topic (average)' });
    VZ.axisX(fr, x, { format: C.binLabel, label: `Monthly page views (${C.get(C.R, 'meta.pageviews_month', '2023-10')}) → more popular` });
    const id = 'hx' + Math.random().toString(36).slice(2, 8);
    const defs = VZ.el('defs', {}, fr.svg);
    const pat = VZ.el('pattern', { id, patternUnits: 'userSpaceOnUse', width: 6, height: 6, patternTransform: 'rotate(45)' }, defs);
    VZ.el('rect', { width: 6, height: 6, style: { fill: 'var(--crit)' } }, pat);
    VZ.el('rect', { width: 2, height: 6, style: { fill: 'var(--surface)', opacity: 0.45 } }, pat);
    const bw = Math.min(64, x.bw);
    order.forEach(l => {
      const r = row(l), x0 = x(l) - bw / 2;
      let acc = 0;
      parts.forEach(p => {
        const v = val(r, p);
        if (!fin(v) || v <= 0) return;
        const y1 = y(acc), y0 = y(acc + v);
        VZ.el('rect', { x: x0, y: y0, width: bw, height: Math.max(0, y1 - y0), style: { fill: p.hatch ? `url(#${id})` : p.color, stroke: 'var(--surface)', strokeWidth: 1 } }, fr.marks);
        acc += v;
      });
      // the confirmed part, labelled just above its segment
      const g = val(r, parts[0]);
      if (fin(g) && bw >= 30) {
        const txt = shares ? share(g) : fmtKB(g), w = txt.length * 7.4 + 10, ty = Math.max(10, y(g) - 12);
        VZ.el('rect', { x: x(l) - w / 2, y: ty - 10, width: w, height: 20, rx: 6, style: { fill: 'var(--surface)', stroke: 'var(--good)', strokeWidth: 1.5 } }, fr.top);
        VZ.el('text', { x: x(l), y: ty, dy: '0.34em', 'text-anchor': 'middle', text: txt, style: { fill: 'var(--good-ink)', fontSize: '12px', fontWeight: 700 } }, fr.top);
      }
      // the real article's average size: a dashed line, or an arrow when it is off the scale
      if (!shares && fin(r.real_bytes)) {
        const rb = r.real_bytes, over = rb > yd[1], ry = over ? 0 : y(rb);
        const ln = VZ.el('g', { class: 'ref' }, fr.top);
        VZ.el('line', { x1: x(l) - bw / 2 - 6, x2: x(l) + bw / 2 + 6, y1: ry, y2: ry, style: { stroke: 'var(--ink-2)', strokeWidth: 2, strokeDasharray: '5 4' } }, ln);
        if (over) VZ.el('path', { d: `M${x(l) - 6},${ry - 4}L${x(l)},${ry - 12}L${x(l) + 6},${ry - 4}Z`, style: { fill: 'var(--ink-2)' } }, ln);
        if (!fr.narrow) VZ.el('text', { x: x(l), y: ry - (over ? 16 : 6), 'text-anchor': 'middle', text: `real ${fmtKB(rb)}`, style: { fontSize: '12px' } }, ln);
      }
      const hit = VZ.el('rect', { class: 'hit', x: x(l) - x.step / 2, y: -fr.m.top, width: x.step, height: fr.h + fr.m.top, style: { cursor: 'default' } }, fr.top);
      hit.addEventListener('pointermove', ev => VZ.tip.show(`<div class="tt-h">${esc(C.binLabel(l))} views a month</div>` +
        parts.map(p => VZ.tip.row(p.hatch ? 'var(--crit)' : p.color, p.label, `${fmtKB(r[p.f])} · ${share(r[p.s])}`)).join('') +
        VZ.tip.row(null, 'Written per topic', fmtKB(r.gen_bytes)) + VZ.tip.row(null, 'The real article', fmtKB(r.real_bytes)) +
        `<div class="tt-f">${fin(r.n) ? C.fmtInt(r.n) + ' topics written' : ''}${fin(r.eligible) ? ` · ${C.fmtBig(r.eligible)} such topics in Wikipedia` : ''}. Shares are averages per topic.</div>`, ev.clientX, ev.clientY));
      hit.addEventListener('pointerleave', () => VZ.tip.hide());
    });
  }
  function renderBins() {
    const k = st.model, m = DM(k), box = $('chDcBins'), nli = isNLI();
    const raw = (m && m.by_bin) || [];
    if (!raw.length) { C.empty(box, 'Bytes per topic by popularity appear once the decompression results are built.'); $('dcBinsTake').textContent = ''; $('dcBinsTable').innerHTML = ''; return; }
    const rows = raw.map(r => binRow(r, nli));
    const order = binOrder().filter(l => rows.some(r => r.label === l)).concat(rows.map(r => r.label).filter(l => !binOrder().includes(l)));
    const row = l => rows.find(r => r.label === l) || {};
    VZ.mount(box, () => binsChart(box, rows, order, st.binsMode, nli));
    const a = row(order[0]), b = row(order[order.length - 1]), word = nli ? 'confirmed by the real article' : 'matches the real article';
    if (order.length > 1 && fin(a.gen_bytes) && fin(b.gen_bytes) && fin(a.meaningful_share) && fin(b.meaningful_share)) {
      const real = r => fin(r.real_bytes) ? ` (the real article: ${fmtKB(r.real_bytes)})` : '';
      const gens = rows.map(r => r.gen_bytes).filter(fin), even = Math.max(...gens) <= 1.6 * Math.min(...gens);
      const part = nli ? 'The confirmed part' : 'The matching part';
      const trend = b.meaningful_share > a.meaningful_share * 1.5 ? `${part} grows with popularity` : b.meaningful_share < a.meaningful_share / 1.5 ? `${part} shrinks with popularity` : `${part} changes little with popularity`;
      // the check's noise level: the share a look-alike WRONG article "confirms" (pooled over all topics)
      const fsr = nli ? fsrOf() : null, atNoise = fsr != null && a.meaningful_share <= 1.5 * fsr;
      $('dcBinsTake').textContent = `Rarely read topics (${C.binLabel(a.label)} views a month): about ${fmtKB(a.gen_bytes)} written per topic${real(a)}, ${share(a.meaningful_share)} of it ${word}. ${b.label === binOrder()[binOrder().length - 1] ? 'The most-read topics' : 'The most popular topics measured so far'} (${C.binLabel(b.label)} views a month): about ${fmtKB(b.gen_bytes)}${real(b)}, ${share(b.meaningful_share)} ${word}. ` +
        `${even ? 'It writes about as much for every topic. ' : ''}${trend}.` +
        (atNoise ? ` For rarely read topics, that ${share(a.meaningful_share)} is about the check's noise level: a look-alike wrong article "confirms" ${C.pct(fsr, 1)} of sentences.` : '');
    } else $('dcBinsTake').textContent = '';
    const cols = binParts(nli);
    $('dcBinsTable').innerHTML = `<div class="tblwrap"><table class="dt"><thead><tr><th>Views a month</th><th>Written per topic</th>${cols.map(p => `<th>${esc(p.label)}</th>`).join('')}<th>Real article</th><th>Real article covered</th><th>Topics written</th><th>Topics in Wikipedia</th></tr></thead><tbody>${order.map(l => { const r = row(l); return `<tr><td>${esc(C.binLabel(l))}</td><td>${fmtKB(r.gen_bytes)}</td>${cols.map(p => `<td>${fmtKB(r[p.f])} <small>(${share(r[p.s])})</small></td>`).join('')}<td>${fmtKB(r.real_bytes)}</td><td>${share(r.coverage)}</td><td>${C.fmtInt(r.n)}</td><td>${C.fmtInt(r.eligible)}</td></tr>`; }).join('')}</tbody></table></div><p class="note">Bytes are averages per topic; shares are averages of each topic's own share. “Real article covered”: the share of the real article's text in the paragraphs that best match a confirmed sentence. It is generous for short articles: one confirmed sentence, even a chance one at the check's noise level, can cover a one-paragraph stub, so rarely read topics can look better covered than famous ones.</p>`;
  }

  // =====================================================================
  // (c) article viewer
  const av = { state: 'idle', id: null, model: null, list: [], fic: [], models: [], gen: [], real: [], kind: null, k: null };
  function articles() {
    const A = window.ARTICLES;
    if (!A || typeof A !== 'object') return null;
    if (window.ARTICLES_MOCK && C.get(C.R, 'meta.mock', true) === false) return null;   // never mix a layout mock with real results
    return A;
  }
  // "Random topic" skips adult and other sensitive topics (title, or the start of the real lead), so a projected
  // class page does not land on them by chance. They stay in every statistic, and search still finds them.
  const SENS_TITLE = /porn|xnxx|\bsex|erotic|\bnude|nazi|massacre|genocide|holocaust|terroris|suicide|\brap(e|ist)\b|murder|lynch(ing|ed)\b/i;
  const SENS_LEAD = /pornograph|erotic|sex offender|sexual (abuse|assault|misconduct)|child abuse|massacre|genocide/i;
  const sensitive = a => !a || SENS_TITLE.test(String(a.title || '')) || SENS_LEAD.test(String((a.real || [])[0] || '').slice(0, 600));
  function loadArticles() {
    if (av.state !== 'idle') return;
    if (window.ARTICLES) { av.state = 'ready'; C.safe('article viewer', setupViewer); return; }
    av.state = 'loading';
    $('avBody').innerHTML = '<div class="empty">Loading the articles…</div>';
    const load = src => new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = fail;
      document.body.appendChild(s);
    });
    // The online copy splits the file into parts: there, data/articles.js only lists them (window.ARTICLES_PARTS).
    (async () => {
      try {
        await load('data/articles.js');
        if (!window.ARTICLES && Array.isArray(window.ARTICLES_PARTS)) for (const p of window.ARTICLES_PARTS) await load(p);
        av.state = 'ready';
      } catch (e) {
        if (Array.isArray(window.ARTICLES_PARTS)) window.ARTICLES = null;   // never show a partly loaded set
        av.state = 'missing';
      }
      C.safe('article viewer', setupViewer);
    })();
  }
  function setupViewer() {
    $('avBody').classList.remove('av-wait');
    const A = articles();
    if (!A || !Object.keys(A).length) {
      $('avPick').hidden = true; $('avLegend').hidden = true; $('avModel').innerHTML = '';
      $('avBody').innerHTML = Array.isArray(window.ARTICLES_PARTS) ? '<div class="empty">The article texts could not be loaded. Reload the page to try again.</div>' : `<div class="empty">${window.ARTICLES_MOCK ? 'The real articles file is not built yet (only a layout mock exists).' : 'The article viewer appears once step 08 writes site/data/articles.js.'} It needs the full-article run (step 04) and its fact check (step 06b).</div>`;
      return;
    }
    const ids = Object.keys(A);
    av.list = ids.map(id => ({ id, title: String(A[id].title || id), kind: A[id].kind, views: +A[id].views || 0, bin: A[id].bin }))
      .map(x => Object.assign(x, { lc: x.title.toLowerCase() })).sort((a, b) => b.views - a.views);
    av.fic = av.list.filter(x => x.kind === 'fictional').map(x => x.id);
    const present = new Set();
    let v3 = false;
    ids.forEach(id => Object.keys(A[id].gen || {}).forEach(k => { const g = A[id].gen[k] || []; if (g.length) present.add(k); if (!v3 && hasSentences(g)) v3 = true; }));
    av.models = byParams([...present]);
    av.model = av.models.includes(C.MAIN) ? C.MAIN : av.models[0];
    // featured: the list from step 08, else the famous topics and one per popularity band
    let feat = (C.get(C.R, 'decompression.featured', []) || []).filter(id => A[id]);
    if (!feat.length) {
      feat = av.list.filter(x => x.kind === 'showcase').slice(0, 6).map(x => x.id);
      binOrder().forEach(l => { const x = av.list.find(i => i.kind === 'real' && i.bin === l); if (x) feat.push(x.id); });
    }
    const famous = feat.filter(id => A[id].kind === 'showcase'), banded = feat.filter(id => A[id].kind !== 'showcase');
    const chip = id => `<button type="button" class="chip" data-id="${esc(id)}" title="${A[id].kind === 'fictional' ? 'Made-up topic' : esc(C.fmtInt(A[id].views)) + ' views a month'}">${esc(A[id].title)}${A[id].kind === 'real' && A[id].bin ? ` <small>${esc(C.binLabel(A[id].bin))}</small>` : ''}</button>`;
    $('avFeatured').innerHTML = (famous.length ? `<span class="pl">Famous</span>${famous.map(chip).join('')}` : '') +
      (banded.length ? `${famous.length ? '<span class="br"></span>' : ''}<span class="pl">One per popularity band <small>(views a month)</small></span>${banded.map(chip).join('')}` : '');
    $('avFeatured').querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => select(b.dataset.id)));
    $('avPick').hidden = false; $('avLegend').hidden = false;
    $('avFic').hidden = !av.fic.length;
    $('avSearch').placeholder = `Search all ${C.fmtInt(av.list.length)} topics…`;
    const mock = window.ARTICLES_MOCK ? ' Mock data: these "generated" articles are stitched from real paragraphs and filler, for layout only.' : '';
    if (v3) $('avLegend').innerHTML = legendHtml() + (mock ? `<span class="lg-note">${esc(mock)}</span>` : '');
    else {
      const thr = threshold();
      $('avLegend').innerHTML = '<span class="lg ok"><span class="gp-badge">✓</span><b>Green: matches the real article.</b></span><span class="lg bad"><span class="gp-badge">✗</span><b>Red: not found in the real article.</b></span>' +
        `<span class="lg-note">${esc(`Green is about meaning${thr != null ? ` (score ${thr.toFixed(2)} or more)` : ''}, not a guarantee that every fact is right. Red: invented, or at least not in this article.${mock}`)}</span>`;
    }
    bindSearch();
    $('avRandom').onclick = () => { const pool = av.list.filter(x => x.kind !== 'fictional' && !sensitive(A[x.id])); if (pool.length) select(pool[Math.floor(Math.random() * pool.length)].id); };
    $('avFic').onclick = () => { if (!av.fic.length) return; const others = av.fic.filter(id => id !== av.id); const p = others.length ? others : av.fic; select(p[Math.floor(Math.random() * p.length)]); };
    select(feat[0] || av.list[0].id);
  }
  function bindSearch() {
    const inp = $('avSearch'), list = $('avAc');
    let items = [], sel = -1;
    const close = () => { list.hidden = true; sel = -1; inp.setAttribute('aria-expanded', 'false'); };
    const pick = x => { inp.value = ''; close(); select(x.id); };
    const paint = () => {
      list.innerHTML = '';
      items.forEach((x, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = i === sel ? 'is-on' : '';
        b.innerHTML = `<span>${esc(x.title)}</span><small>${x.kind === 'fictional' ? 'made-up topic' : C.fmtInt(x.views) + ' views/mo'}</small>`;
        b.addEventListener('mousedown', e => { e.preventDefault(); pick(x); });
        list.appendChild(b);
      });
      list.hidden = !items.length; inp.setAttribute('aria-expanded', String(!!items.length));
    };
    inp.oninput = () => {
      const q = inp.value.trim().toLowerCase();
      if (!q) { items = []; close(); return; }
      const pre = [], mid = [];
      for (const x of av.list) { const i = x.lc.indexOf(q); if (i === 0) pre.push(x); else if (i > 0 && mid.length < 10) mid.push(x); if (pre.length >= 10) break; }
      items = pre.concat(mid).slice(0, 10); sel = -1; paint();
    };
    inp.onkeydown = e => {
      if (e.key === 'ArrowDown' && items.length) { sel = (sel + 1) % items.length; paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp' && items.length) { sel = (sel - 1 + items.length) % items.length; paint(); e.preventDefault(); }
      else if (e.key === 'Escape') close();
      else if (e.key === 'Enter') { const x = items[sel >= 0 ? sel : 0]; if (x) pick(x); e.preventDefault(); }
    };
    inp.onblur = () => setTimeout(close, 150);
  }
  function select(id) {
    av.id = id;
    $('avFeatured').querySelectorAll('.chip').forEach(b => { const on = b.dataset.id === id; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
    renderArticle();
  }
  function modelSeg(avail, current) {
    C.seg($('avModel'), av.models.map(k => ({ value: k, label: C.short(k), color: C.color(k) })), current, v => { av.model = v; renderArticle(); });
    $('avModel').querySelectorAll('.seg-b').forEach((b, i) => {
      const ok = avail.includes(av.models[i]);
      b.disabled = !ok; b.classList.toggle('is-off', !ok);
      b.title = ok ? '' : 'This model has not written this topic (yet)';
    });
  }
  function renderArticle() {
    const A = articles(), a = A && A[av.id], body = $('avBody');
    if (!a) { body.innerHTML = '<div class="empty">Pick a topic above.</div>'; return; }
    VZ.tip.hide();
    const gens = a.gen || {};
    const avail = av.models.filter(k => (gens[k] || []).length);
    let k = av.model, note = '';
    if (!avail.includes(k) && avail.length) { note = `${C.short(k)} has not written this topic yet, so this shows ${C.short(avail[0])}.`; k = avail[0]; }
    modelSeg(avail, k);
    const fic = a.kind === 'fictional', gen = k ? gens[k] || [] : [], real = a.real || [], v3 = hasSentences(gen);
    av.gen = gen; av.real = real; av.kind = a.kind; av.k = k;
    // stats: from step 08 when present, else counted here
    const s0 = (a.stats || {})[k] || {};
    const genBytes = fin(s0.gen_bytes) ? s0.gen_bytes : gen.reduce((x, p) => x + bytes(p.text), 0);
    const genWords = fin(s0.gen_words) ? s0.gen_words : gen.reduce((x, p) => x + words(p.text), 0);
    const realBytes = real.reduce((x, p) => x + bytes(p), 0), realWords = real.reduce((x, p) => x + words(p), 0);
    const cut = fin(a.real_total_paras) && a.real_total_paras > real.length;
    const realSub = cut ? `first ${C.fmtInt(real.length)} of ${C.fmtInt(a.real_total_paras)} paragraphs shown` : realWords >= 2400 ? 'first 2,500 words shown' : `${C.fmtInt(realWords)} words`;
    const metric = (l, v, sm) => `<div class="metric"><div class="lab">${esc(l)}</div><div class="v">${v}${sm ? `<small>${esc(sm)}</small>` : ''}</div></div>`;
    // The whole real article's size comes from step 08 (a.real_bytes, or the per-model stats). Without it, the
    // only size known here is the text shown on the right (capped, and without lists or short lines): say so.
    const fullBytes = fin(a.real_bytes) ? a.real_bytes : fin(s0.real_bytes) ? s0.real_bytes : NaN;
    const fullWords = fin(a.real_words) ? a.real_words : NaN;
    const realCard = fin(fullBytes)
      ? metric('Real article', esc(fmtKB(fullBytes)), [fin(fullWords) ? `${C.fmtInt(fullWords)} words` : '',
        fullBytes > realBytes * 1.05 && realBytes > 0 ? `${fmtKB(realBytes)} of its text shown` : ''].filter(Boolean).join(' · ') || (real.length ? realSub : 'its text is not in this file'))
      : metric('Real article, shown excerpt', esc(fmtKB(realBytes)), realSub);
    const t = tally(gen);
    const b3 = ['meaningful_bytes', 'contradicted_bytes', 'unconfirmed_bytes'].every(c => fin(s0[c]))
      ? { supported: s0.meaningful_bytes, contradicted: s0.contradicted_bytes, unconfirmed: s0.unconfirmed_bytes } : t;
    const sentBytes = b3.supported + b3.contradicted + b3.unconfirmed;
    const tags = [fic ? '<span class="tag madeup">made-up topic: does not exist</span>' : `<span class="tag">${esc(C.fmtInt(a.views))} views a month</span>`,
      a.kind === 'showcase' ? '<span class="tag famous">famous</span>' : a.kind === 'real' && a.bin ? `<span class="tag">${esc(C.binLabel(a.bin))} band</span>` : '',
      window.ARTICLES_MOCK ? '<span class="tag mock">mock text</span>' : ''].join('');
    let stats;
    if (fic) stats = metric('Written', esc(fmtKB(genBytes)), `${C.fmtInt(genWords)} words`) + metric('Real article', 'none', 'the topic does not exist');
    else if (v3) {
      stats = metric('Written', esc(fmtKB(genBytes)), `${C.fmtInt(genWords)} words`) +
        metric('Confirmed', esc(fmtKB(b3.supported)), `${share(sentBytes ? b3.supported / sentBytes : NaN)} of its sentences, by length`) +
        realCard +
        metric('Real article covered', fin(s0.coverage) ? share(s0.coverage) : 'n/a', 'of its text best matches a confirmed sentence');
    } else {
      const meanBytes = fin(s0.meaningful_bytes) ? s0.meaningful_bytes : gen.reduce((x, p) => x + (p.meaningful ? bytes(p.text) : 0), 0);
      stats = metric('Written', esc(fmtKB(genBytes)), `${C.fmtInt(genWords)} words`) +
        metric('Matches the real article', esc(fmtKB(meanBytes)), `${C.pct(genBytes ? meanBytes / genBytes : NaN)} of what it wrote`) +
        realCard +
        metric('Real article covered', fin(s0.coverage) ? C.pct(s0.coverage) : 'n/a', 'matched by some paragraph');
    }
    const link = a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener" title="Opens Wikipedia (needs internet)">Wikipedia ↗</a>` : '';
    const realHtml = fic
      ? `<div class="av-none"><b>There is no real article.</b> No English Wikipedia title matches “${esc(a.title)}”: we invented it and checked all ${esc(C.fmtBig(C.get(C.R, 'sizes.wiki_articles', 6.4e6)))} titles. Everything on the left is made up, in the same confident encyclopedia voice and at the same length as a real article.</div>`
      : real.length ? '<p class="note" style="margin:0">Wikipedia\'s plain-text version drops tables, math and some numbers, which can leave gaps in the text.</p>' + real.map((p, i) => `<p class="rp" data-i="${i}">${esc(p)}</p>`).join('') + (cut ? `<p class="note">The real article goes on: ${C.fmtInt(a.real_total_paras - real.length)} more paragraphs are not shown here.</p>` : '')
        : '<div class="av-none">The real article text is not in this file.</div>';
    const intro = fic ? '<b>Made-up topic.</b> This subject does not exist, so nothing can be checked: every sentence on the left is invented.'
      : v3 ? 'Hover over or tap a sentence to see the fact check. Its paragraph\'s closest match lights up in the real article.'
        : 'Hover over or tap a generated paragraph: its closest match lights up in the real article.';
    body.innerHTML = `<div class="av-head"><div><h4 class="av-title">${esc(a.title)}</h4><div class="ex-meta">${tags}</div></div><div class="av-stats">${stats}</div></div>
      ${v3 && !fic ? summaryBar(b3, 'of its sentences, by length') : ''}
      ${note ? `<p class="note av-note">${esc(note)}</p>` : ''}
      <div class="av-status${fic ? ' madeup' : ''}" id="avStatus" aria-live="polite">${intro}</div>
      <div class="av-cols">
        <div class="av-col"><h4><span class="h4l"><span class="sw" style="background:${C.color(k)}"></span>${esc(C.short(k))} writes, from the title alone</span></h4><div class="av-scroll" id="avGen">${articleHtml(gen, { fic }) || '<div class="av-none">No generated text for this topic.</div>'}</div></div>
        <div class="av-col orig"><h4><span class="h4l">The real Wikipedia article</span>${link}</h4><div class="av-scroll" id="avReal">${realHtml}</div></div>
      </div>
      <p class="note av-keys">Keyboard: <kbd>Tab</kbd> into the article, <kbd>↑</kbd> <kbd>↓</kbd> between paragraphs${v3 ? ', <kbd>Enter</kbd> then <kbd>←</kbd> <kbd>→</kbd> between sentences, <kbd>Esc</kbd> back' : ''}.${C.hasItem(av.id) ? ' · <a href="#s6" id="avToEx">See this topic in the definition test (explorer, section 6) →</a>' : ''}</p>`;
    $('avGen').scrollTop = 0; $('avReal').scrollTop = 0;
    bindLinks(v3, fic);
    const toEx = $('avToEx');
    if (toEx) toEx.addEventListener('click', e => { e.preventDefault(); C.openItem(av.id, av.k); });
  }
  function status(html) { const s = $('avStatus'); if (s) s.innerHTML = html; }
  function scrollInto(box, el) {
    const top = el.offsetTop - box.clientHeight * 0.18;
    box.scrollTo({ top: Math.max(0, top), behavior: reduced() ? 'auto' : 'smooth' });
  }
  function bindLinks(v3, fic) {
    const gb = $('avGen'), rb = $('avReal');
    let cur = null, curS = null;
    const clear = () => {
      gb.querySelectorAll('.gp.is-act').forEach(x => x.classList.remove('is-act'));
      rb.querySelectorAll('.rp.is-act').forEach(x => x.classList.remove('is-act', 'act-ok', 'act-bad'));
    };
    const thr = threshold();
    const legacyWhy = p => {
      const sc = fin(p.score) ? fmtScore(p.score, thr) : 'n/a', bar = thr != null ? ` (the bar is ${thr.toFixed(near(p.score, thr) ? 3 : 2)})` : '';
      if (p.meaningful) return `<b class="ok">✓ Matches</b> real paragraph ${p.best_real_para + 1}: score ${sc}${bar}.`;
      if (thr != null && fin(p.score) && p.score >= thr && fin(p.null_score) && p.null_score >= p.score) return `<b class="bad">✗ Not counted:</b> its score ${sc} clears the bar, but it fits a look-alike wrong article even better (${p.null_score.toFixed(2)}), so it is generic.`;
      return `<b class="bad">✗ Not found:</b> the closest real paragraph (${p.best_real_para + 1}) scores only ${sc}${bar}.`;
    };
    const link = (n, s) => {
      if (n === cur && s === curS) return;
      const p = av.gen[n], el = gb.querySelector(`.gp[data-n="${n}"]`);
      if (!p || !el) return;
      let r = null;
      if (n !== cur) {
        clear(); cur = n;
        el.classList.add('is-act');
        r = !fic && fin(p.best_real_para) ? rb.querySelector(`.rp[data-i="${p.best_real_para}"]`) : null;
        if (r) { r.classList.add('is-act'); if (!v3) r.classList.add(p.meaningful ? 'act-ok' : 'act-bad'); scrollInto(rb, r); }
      } else r = fin(p.best_real_para) ? rb.querySelector(`.rp[data-i="${p.best_real_para}"]`) : null;
      curS = s;
      const where = fic ? '' : !fin(p.best_real_para) || !av.real.length ? ' Its closest real paragraph is further down the real article, beyond the part shown here.'
        : r ? ` Highlighted in the real article: its paragraph ${p.best_real_para + 1}, the closest to this one.` : ' Its closest real paragraph is further down the real article, beyond the part shown here.';
      if (fic) return;                       // keep the "made-up topic" note in view
      if (!v3) { status(`Paragraph ${n + 1}: ${fin(p.best_real_para) ? legacyWhy(p) : 'no match information.'}${r || !fin(p.best_real_para) ? '' : ' That paragraph is further down the real article, beyond the part shown here.'}`); return; }
      if (s != null && p.sentences && p.sentences[s]) {
        const x = p.sentences[s], L = labOf(x) || LAB.unconfirmed;
        const nums = fin(x.p_entail) || fin(x.p_contra) ? ` (supports ${prob(x.p_entail)}, contradicts ${prob(x.p_contra)})` : ' (too short to check)';
        status(`Paragraph ${n + 1}, sentence ${s + 1}: <b class="${L.c}">${L.mark} ${esc(L.name.toLowerCase().replace(/^can't confirm:.*/, "can't confirm"))}</b>${nums}.${where}`);
      } else {
        const c = tally([p]).n;
        status(`Paragraph ${n + 1}: <b class="ok">${c.supported} confirmed</b>, <b class="bad">${c.contradicted} contradict${c.contradicted === 1 ? 's' : ''}</b>, ${c.unconfirmed} can't confirm.${where}`);
      }
    };
    bindArticle(gb, av.gen, { fic, onPara: link });
    // the other way: click a real paragraph to see which generated paragraphs point at it
    rb.addEventListener('click', ev => {
      const r = ev.target.closest && ev.target.closest('.rp'); if (!r) return;
      const i = +r.dataset.i, hits = av.gen.map((p, n) => p.best_real_para === i ? n : -1).filter(n => n >= 0);
      cur = null; curS = null; clear();
      r.classList.add('is-act');
      if (!v3) r.classList.add(hits.some(n => av.gen[n].meaningful) ? 'act-ok' : 'act-bad');
      hits.forEach(n => { const g = gb.querySelector(`.gp[data-n="${n}"]`); if (g) g.classList.add('is-act'); });
      const first = hits.length && gb.querySelector(`.gp[data-n="${hits[0]}"]`);
      if (first) scrollInto(gb, first);
      status(hits.length ? `Real paragraph ${i + 1} is the closest match of generated paragraph${hits.length > 1 ? 's' : ''} ${hits.map(n => n + 1).join(', ')}.` : `No generated paragraph has real paragraph ${i + 1} as its closest match: the model did not write about this part.`);
    });
  }

  // =====================================================================
  // (d) how we fact-check, and how we scale up
  function renderHow() {
    const d = D(), r = C.R;
    const emb = String((d && d.embed_model) || C.get(r, 'meta.embed_model', 'BAAI/bge-small-en-v1.5')).split('/').pop();
    let items;
    if (isNLI()) {
      const nli = String(d.nli_model || 'facebook/bart-large-mnli'), thr = nliThr(), k = topK();
      const tp = thr != null ? `${Math.round(thr * 100)}%` : 'a set level';
      const fsr = d.false_support_rate, own = d.own_support_rate_same, nc = d.control_sentences;
      const b0 = ((DM(st.model) || {}).by_bin || []).find(b => b.label === binOrder()[0]);   // the least-read band
      const rare = b0 && fin(fsr) && fin(b0.meaningful_share) && b0.meaningful_share <= 1.5 * fsr ? b0 : null;
      $('howTitle').textContent = 'How we fact-check';
      items = [
        ['Split', 'We cut each generated article into paragraphs and sentences, and drop every sentence the model repeats: greedy decoding sometimes goes in loops.'],
        ['Find the evidence', `For each sentence, a small local model (${emb}) picks the ${k ? k + ' ' : ''}most relevant paragraphs of the real article.`],
        ['Fact-check', `A second local model, ${nli}, is trained to tell whether a passage supports a statement, contradicts it, or says nothing about it. It reads the evidence, then the sentence. Supported with ${tp} confidence or more: confirmed (green). Contradicted with ${tp} or more: contradicts (red). Otherwise: can't confirm (grey). Fragments under 4 words count as can't confirm.`],
        ['Control', fin(fsr) ? `We re-check ${fin(nc) ? C.fmtInt(nc) + ' ' : ''}sentences against a look-alike WRONG article (a village gets another village). The wrong article "confirms" ${C.pct(fsr, 1)} of them (the false-confirmation rate)${fin(own) && own > 0 ? `; their own article confirms ${C.pct(own, 1)}` : ''}.${fin(own) && fsr > 0 && own > fsr ? ` So green is about ${Math.round(own / fsr)} times more common with the right article, but part of it is noise.` : ''}` : 'A control against a look-alike wrong article measures the false-confirmation rate (not in this data yet).'],
        ['Read it with care', `Confirmed is conservative: a true fact that the real article does not mention stays grey, and so does anything newer than the Wikipedia snapshot (${C.get(r, 'meta.wiki_snapshot', '2023-11-01')}). It is not noise-free (see the control)${rare ? `: for rarely read topics (${C.binLabel(rare.label)} views a month), the ${share(rare.meaningful_share)} confirmed is about the noise level` : ''}. Red is noisier than green: a nearby place, a near-miss date or a misread sentence can count as a contradiction. Wikipedia's plain-text version drops tables, math and some numbers, so sentences about those can only stay grey. The live lab uses the same check.`],
      ];
    } else {
      const thr = threshold(), q = d && fin(d.null_quantile) ? d.null_quantile : 0.95, bar = thr != null ? thr.toFixed(2) : 'the bar';
      $('howTitle').textContent = 'How we decide “meaningful”';
      items = [
        ['Split', 'We cut each generated article into paragraphs (a section title stays with its paragraph) and drop every sentence the model repeats: greedy decoding sometimes goes in loops.'],
        ['Compare', `A small local model (${emb}) turns each paragraph into a list of numbers that captures its meaning. We compare it with every paragraph of the real article and keep the best match (1 = same meaning).`],
        ['Calibrate on a wrong article', `For each topic we pick a look-alike wrong article and score the same paragraphs against it. Only ${C.pct(1 - q)} of them reach ${bar} there, so ${bar} is the bar.`],
        ['Decide', 'Green (meaningful) = it reaches the bar against the right article AND fits the right article better than the look-alike.'],
        ['Remember', 'Meaningful is about meaning, not exact facts: a green paragraph can still have a wrong date or number.'],
      ];
    }
    $('howList').innerHTML = items.map(([h, t]) => `<li><b>${esc(h)}</b><span>${esc(t)}</span></li>`).join('');
    const p = C.get(r, 'meta.article_prompt', ARTICLE_PROMPT), sys = C.get(r, 'meta.system_prompt', SYSTEM_PROMPT);
    $('articlePrompt').innerHTML = `<span class="role">System:</span> ${esc(sys)}\n\n<span class="role">User:</span> ${esc(p).replace('{title}', '<b style="color:var(--accent-ink)">{title}</b>')}\n\n<span class="role">Settings:</span> up to 1,400 tokens (about 1,000 words), greedy decoding, run locally with MLX.`;
    const mk = DM(st.model) ? st.model : dcModels()[0], m = DM(mk), elig = d && d.eligible_topics, nAll = allArticles();
    const per = (C.get(r, 'bins', []) || []).filter(b => fin(b.n_sampled));
    const sizes = per.map(b => b.n_sampled), total = sizes.reduce((a, b) => a + b, 0), nb = binOrder().length;
    const big = sizes.length ? Math.max(...sizes) : NaN, small = per.find(b => b.n_sampled < big);
    const nPer = sizes.length ? `${C.fmtInt(big)} topics from each of the ${nb} popularity bands` +
      (small ? ` (${C.fmtInt(small.n_sampled)} in the ${C.binLabel(small.label)} band${fin(small.articles_eligible) ? `, which has only ${C.fmtInt(small.articles_eligible)} eligible topics` : ''})` : '') + `, ${C.fmtInt(total)} in all`
      : `the same number of topics from each of the ${nb} popularity bands`;
    // whole articles: every sampled topic, or a subset (the 32B: a fixed number per band)
    let whole = '';
    if (m && fin(m.n_topics)) {
      const ns = (m.by_bin || []).map(b => b.n).filter(fin), lo = Math.min(...ns), hi = Math.max(...ns);
      const perBand = !ns.length ? '' : lo === hi ? ` (${C.fmtInt(lo)} per band)` : ` (${C.fmtInt(lo)}–${C.fmtInt(hi)} per band)`;
      whole = total && m.n_topics >= total ? ` ${C.short(mk)} wrote a whole article for every one of them, and each was fact-checked.`
        : ` ${C.short(mk)} wrote whole articles for ${C.fmtInt(m.n_topics)} of them${perBand}, each fact-checked.`;
    }
    $('scaleText').innerHTML = esc(`Writing all ${fin(elig) ? C.fmtBig(elig) + ' ' : ''}eligible English articles would take ${m && fin(m.days_to_generate_all) ? fmtDays(m.days_to_generate_all).replace(/<small>.*<\/small>/, '').trim() : 'months'} on our test Mac, so we work like a poll. The sample: ${nPer}, used for the opening-paragraph test.${whole} For each band, the average bytes per topic times the number of eligible articles in it, added up over the bands. The 95% intervals come from resampling the topics 2,000 times. Eligible means articles with a real opening paragraph (at least 25 words), excluding lists, disambiguation and "year in" pages${fin(elig) && fin(nAll) ? `: ${C.fmtBig(elig)} of all ${C.fmtBig(nAll)} articles` : ''}.`);
  }

  // =====================================================================
  function setModel(v) {
    st.model = v;
    ['dcModel', 'dcBinsModel'].forEach(id => $(id).querySelectorAll('.seg-b').forEach((b, i) => { const on = dcModels()[i] === v; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); }));
    renderParts();
  }
  function renderAll() {
    const ms = dcModels();
    if (!st.model || !ms.includes(st.model)) st.model = ms.includes(C.MAIN) ? C.MAIN : ms[0] || C.MAIN;
    ['dcModel', 'dcBinsModel'].forEach(id => {
      if (ms.length > (id === 'dcModel' ? 0 : 1)) C.seg($(id), ms.map(k => ({ value: k, label: C.short(k), color: C.color(k) })), st.model, setModel);
      else $(id).innerHTML = '';
    });
    const nli = isNLI();
    $('dcBinsMode').hidden = !(D() && dcModels().length);
    C.seg($('dcBinsMode'), [{ value: 'bytes', label: 'Bytes per topic' }, { value: 'share', label: 'Shares' }], st.binsMode, v => { st.binsMode = v; C.safe('bytes per topic', renderBins); });
    $('dcBinsTitle').textContent = nli ? 'Every topic gets an article. How much of it holds up?' : 'Every topic gets an article. How much of it matches?';
    $('dcBinsSub').textContent = nli ? 'Per topic, by popularity: what the model writes, split by the fact check, next to the length of the real article (dashed). Pick “Shares” to compare the colours directly.'
      : 'Per topic, by popularity: how much the model writes, how much of that matches the real article, and how long the real article is.';
    renderParts();
  }
  function renderParts() {
    C.safe('decompression statement', renderBig);
    C.safe('decompression calculator', renderCalc);
    C.safe('bytes per topic', renderBins);
    C.safe('how we fact-check', renderHow);
  }
  function init(ctx) {
    C = ctx;
    renderAll();
    $('dcTopics').addEventListener('input', e => { st.minBin = +e.target.value; C.safe('decompression calculator', renderCalc); });
    let rt = null, w = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { const nw = $('dcBars').clientWidth; if (Math.abs(nw - w) > 30) { w = nw; C.safe('decompression calculator', renderCalc); } }, 200); });
    window.addEventListener('scroll', () => VZ.tip.hide(), { passive: true });     // a tapped tooltip goes away when the page moves
    const target = $('b-viewer');
    if ('IntersectionObserver' in window && target) {
      const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); loadArticles(); } }, { rootMargin: '1200px 0px' });
      io.observe(target);
    } else loadArticles();
  }
  window.Decompress = {
    init,
    rerender() { if (!C) return; renderAll(); if (av.state === 'ready' && av.id) C.safe('article viewer', renderArticle); },
    // shared with the live lab
    articleHtml, bindArticle, summaryBar, legendHtml, hasSentences, tally,
    paraHtml, isHeading, fmtKB, fmtScore,
  };
})();
