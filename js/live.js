/* Live lab: talks to live/server.py (FastAPI on 127.0.0.1:8765, also serving this site).
   Detects the server lazily (when the section comes near), then offers: pick an article and
   either stream the model's opening paragraph next to the real lead and score it against the
   baselines, or stream the WHOLE article and fact-check it sentence by sentence against the real
   one (green = confirmed, red = contradicts, grey = can't confirm; drawn by js/decompress.js, as in
   the article viewer); plus a "surprise meter" that shows the bits of any sentence typed in class. */
(function () {
  'use strict';
  const PORT_URL = 'http://127.0.0.1:8765';
  const L = { base: null, health: null, model: null, mode: 'def', busy: false, ctrl: null, history: [] };
  const MODES = { def: { label: 'Opening paragraph', go: 'Write the opening paragraph' }, article: { label: 'The whole article', go: 'Write the whole article' } };
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  async function fetchT(url, opt, ms) {
    const c = new AbortController(), t = setTimeout(() => c.abort(), ms || 4000);
    try { return await fetch(url, Object.assign({ signal: c.signal }, opt || {})); } finally { clearTimeout(t); }
  }
  async function detect() {
    const bases = [];
    if (/^https?:$/.test(location.protocol)) bases.push('');
    if (!(location.hostname === '127.0.0.1' && location.port === '8765')) bases.push(PORT_URL);
    for (const b of bases) {
      try {
        const r = await fetchT(b + '/api/health', { cache: 'no-store' }, 2500);
        if (!r.ok) continue;
        const j = await r.json();
        if (j && j.ok !== false) return { base: b, health: j };
      } catch (e) { /* not running here */ }
    }
    return null;
  }

  function modelInfo(key) {
    const R = window.RESULTS;
    const m = R && Array.isArray(R.models) ? R.models.find(x => x.key === key) : null;
    const short = key.replace(/^qwen/i, 'Qwen').replace('-', ' ').replace(/b$/i, 'B');
    const note = /32b/i.test(key) ? 'slow' : /0\.6b|0\.5b|1\.5b/i.test(key) ? 'fast' : '';
    return { key, label: m ? m.label : short, short, note };
  }
  function modelKeys(h) {
    const a = (h && h.models_available) || [];
    return a.map(x => typeof x === 'string' ? x : (x.key || x.name)).filter(Boolean);
  }

  function renderOffline(root) {
    root.innerHTML = `
      <div class="card offline-box">
        <div class="live-status"><span class="dot"></span><b>Live lab server not running.</b></div>
        <p style="margin:0">The live lab uses the models on this Mac through a small local server. Start it in Terminal:</p>
        <pre>cd ~/Developer/AI4B_2026/llm_compression_demo
python3 live/server.py --open</pre>
        <p class="note" style="margin:0">It opens this page at http://127.0.0.1:8765 with the lab switched on. Everything runs locally, so it works with Wi‑Fi off. (Python here is /opt/anaconda3/bin/python3.)</p>
        <div><button type="button" class="btn" id="liveRetry">Check again</button></div>
      </div>`;
    $('liveRetry').addEventListener('click', () => start(root, true));
  }

  // "offline · N articles to choose from · loaded: ..." from /api/health
  function statusText(h) {
    const loaded = (h.loaded || []).map(k => modelInfo(typeof k === 'string' ? k : k.key).short).join(', ') || 'none yet (first answer loads a model)';
    return `${h.offline ? 'offline' : ''}${h.lookup_articles ? ' · ' + Number(h.lookup_articles).toLocaleString('en-US') + ' articles to choose from' : ''} · loaded: ${loaded}`;
  }
  // The server loads models on first use, so the "loaded" list changes after an answer: ask again.
  async function refreshStatus() {
    try {
      const r = await fetchT(L.base + '/api/health', { cache: 'no-store' }, 2500);
      if (!r.ok) return;
      const h = await r.json(), el = $('liveLoaded');
      if (!h) return;
      L.health = h;
      if (el) el.textContent = statusText(h);
    } catch (e) { /* keep the last status */ }
  }

  function renderOnline(root) {
    const h = L.health, keys = modelKeys(h);
    if (!L.model) L.model = keys.includes('qwen2.5-7b') ? 'qwen2.5-7b' : keys[0];
    root.innerHTML = `
      <div class="live">
        <div class="card">
          <div class="seg live-mode" id="liveMode" role="group" aria-label="What the model writes">${Object.entries(MODES).map(([k, m]) => `<button type="button" class="seg-b${k === L.mode ? ' is-on' : ''}" data-mode="${k}" aria-pressed="${k === L.mode}">${m.label}</button>`).join('')}</div>
          <div class="toolbar">
            <div class="live-status" id="liveStatus"><span class="dot ok"></span><b>Connected</b>
              <span id="liveLoaded">${esc(statusText(h))}</span></div>
            <div class="seg seg-models" id="liveModels" role="group" aria-label="Model"></div>
          </div>
          <div class="live-row">
            <div class="ac">
              <input type="text" id="liveTopic" placeholder="Type a Wikipedia title, e.g. Reichman University" autocomplete="off" aria-label="Wikipedia title" aria-autocomplete="list">
              <div class="ac-list" id="liveAc" hidden></div>
            </div>
            <button type="button" class="btn btn-primary" id="liveGo">${MODES[L.mode].go}</button>
            <button type="button" class="btn" id="liveStop" hidden>Stop</button>
          </div>
          <div class="live-cols" style="margin-top:18px">
            <div class="ex-col orig"><h4>Real Wikipedia lead</h4><div class="txt" id="liveOrig"><span style="color:var(--muted)">Pick an article.</span></div></div>
            <div class="ex-col"><h4><span class="sw" id="liveSw"></span><span><span id="liveModelName"></span> writes <span id="liveWhat">the opening paragraph</span> from the title alone</span></h4><div class="txt" id="liveOut"></div><p class="note" id="liveTiming"></p></div>
          </div>
          <div id="liveScore"></div>
        </div>
        <div class="card">
          <h3>Surprise meter</h3>
          <p class="sub">Type any sentence. The model reads it and shows how surprised it was by every token. A wrong fact costs more bits.</p>
          <div class="sur-in">
            <textarea id="surText" aria-label="Sentence to measure">The capital of France is Paris.</textarea>
            <div class="pills" id="surEx"></div>
            <div class="live-row"><button type="button" class="btn btn-primary" id="surGo">Measure surprise</button><span class="note" id="surNote" style="margin:0"></span></div>
          </div>
          <div class="heat-legend" id="liveHeatLegend"></div>
          <div class="heat" id="surOut"></div>
          <div class="sur-hist" id="surHist"></div>
        </div>
      </div>`;
    const seg = $('liveModels');
    keys.forEach(k => {
      const mi = modelInfo(k);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'seg-b' + (k === L.model ? ' is-on' : ''); b.dataset.k = k;
      b.innerHTML = `<span class="sw" style="background:${window.App ? App.color(k) : 'var(--s1)'}"></span>${esc(mi.short)}${mi.note ? ` <small>${mi.note}</small>` : ''}`;
      b.addEventListener('click', () => {
        if (L.busy) return;                         // the heading must keep naming the model that is writing
        if (k !== L.model) clearResult();
        L.model = k; seg.querySelectorAll('.seg-b').forEach(x => x.classList.toggle('is-on', x === b)); setModelName();
      });
      seg.appendChild(b);
    });
    setModelName();
    $('liveMode').querySelectorAll('.seg-b').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
    setMode(L.mode);
    const ex = [['Paris', 'The capital of France is Paris.'], ['Rome', 'The capital of France is Rome.'],
      ['2009', 'Bitcoin was created by Satoshi Nakamoto in 2009.'], ['1985', 'Bitcoin was created by Satoshi Nakamoto in 1985.'],
      ['Herzliya', 'Reichman University is in Herzliya, Israel.'], ['Gibberish', 'Purple elephants negotiate quarterly with cheese.']];
    ex.forEach(([lab, txt]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = '“' + lab + '”';
      b.title = txt;
      b.addEventListener('click', () => { $('surText').value = txt; surprise(); });
      $('surEx').appendChild(b);
    });
    if (window.VZ && VZ.heatLegend) VZ.heatLegend($('liveHeatLegend'));
    bindAutocomplete();
    $('liveGo').addEventListener('click', () => run($('liveTopic').value.trim()));
    $('liveStop').addEventListener('click', () => L.ctrl && L.ctrl.abort());
    $('surGo').addEventListener('click', surprise);
    $('surText').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) surprise(); });
  }
  // A result belongs to one mode and one model: switching either clears it, so no old text sits under a new heading.
  function clearResult() {
    if (L.busy) return;
    const o = $('liveOut');
    if (o) { o.textContent = ''; o.classList.remove('long', 'cursor'); }
    if ($('liveScore')) $('liveScore').innerHTML = '';
    if ($('liveTiming')) $('liveTiming').textContent = '';
  }
  function setMode(mode) {
    if (!MODES[mode] || L.busy) return;
    if (mode !== L.mode) clearResult();
    L.mode = mode;
    $('liveMode').querySelectorAll('.seg-b').forEach(b => { const on = b.dataset.mode === mode; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
    $('liveGo').textContent = MODES[mode].go;
    $('liveWhat').textContent = mode === 'article' ? 'the whole article' : 'the opening paragraph';
  }
  const run = title => (L.mode === 'article' ? writeArticle : reconstruct)(title);
  function setModelName() {
    $('liveModelName').textContent = modelInfo(L.model).short;
    $('liveSw').style.background = window.App ? App.color(L.model) : 'var(--s1)';
  }

  function bindAutocomplete() {
    const inp = $('liveTopic'), list = $('liveAc');
    let timer = null, items = [], sel = -1, seq = 0;
    const close = () => { list.hidden = true; sel = -1; };
    const paint = () => {
      list.innerHTML = '';
      items.forEach((it, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = i === sel ? 'is-on' : '';
        b.innerHTML = `<span>${esc(it.title)}</span><small>${it.views != null ? Number(it.views).toLocaleString('en-US') + ' views/mo' : ''}</small>`;
        b.addEventListener('mousedown', e => { e.preventDefault(); clearTimeout(timer); seq++; inp.value = it.title; close(); run(it.title); });
        list.appendChild(b);
      });
      list.hidden = !items.length;
    };
    inp.addEventListener('input', () => {
      clearTimeout(timer);
      const q = inp.value.trim();
      if (q.length < 2) { items = []; close(); return; }
      timer = setTimeout(async () => {
        const my = ++seq;
        try {
          const r = await fetchT(L.base + '/api/search?q=' + encodeURIComponent(q), {}, 4000);
          if (!r.ok || my !== seq) return;
          const j = await r.json();
          items = (Array.isArray(j) ? j : (j.results || [])).slice(0, 10); sel = -1; paint();
        } catch (e) { /* ignore */ }
      }, 120);
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' && items.length) { sel = (sel + 1) % items.length; paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp' && items.length) { sel = (sel - 1 + items.length) % items.length; paint(); e.preventDefault(); }
      else if (e.key === 'Escape') { clearTimeout(timer); seq++; close(); }      // a late answer must not reopen the list
      else if (e.key === 'Enter') { clearTimeout(timer); seq++; if (sel >= 0 && items[sel]) inp.value = items[sel].title; close(); run(inp.value.trim()); e.preventDefault(); }
    });
    inp.addEventListener('blur', () => setTimeout(close, 150));
  }

  async function reconstruct(title) {
    if (!title || L.busy) return;
    L.busy = true; L.ctrl = new AbortController();
    const out = $('liveOut'), orig = $('liveOrig'), timing = $('liveTiming'), score = $('liveScore');
    $('liveGo').disabled = true; $('liveStop').hidden = false;
    out.textContent = ''; out.classList.add('cursor'); out.classList.remove('long'); score.innerHTML = ''; timing.textContent = '';
    orig.innerHTML = '<span style="color:var(--muted)">Looking it up…</span>';
    const dot = document.querySelector('#liveStatus .dot'); if (dot) dot.className = 'dot busy';
    const { article, suggestions } = await lookup(title);
    if (article && article.excerpt) {
      orig.innerHTML = matchNote(article, title) + esc(article.excerpt) + `<p class="note">${esc(GAPS)}${article.url ? ` <a href="${esc(article.url)}" target="_blank" rel="noopener">Wikipedia page</a> (needs internet) · ${Number(article.views || 0).toLocaleString('en-US')} views in a month` : ''}</p>`;
      title = article.title || title;
    } else {
      orig.innerHTML = `<span style="color:var(--muted)">“${esc(title)}” is not in the local article list. The model will still try, which is a nice test for a made-up title.</span>` + suggestHtml(suggestions);
      bindSuggestions(orig);
    }
    const t0 = performance.now();
    let text = '';
    try {
      const r = await fetch(L.base + '/api/reconstruct', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, model: L.model }), signal: L.ctrl.signal });
      if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
      const reader = r.body.getReader(), dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        out.textContent = text;
        timing.textContent = `${((performance.now() - t0) / 1000).toFixed(1)} s`;
      }
      text += dec.decode();
      out.textContent = text;
    } catch (e) {
      if (e.name !== 'AbortError') out.innerHTML = `<span style="color:var(--crit-ink)">The model did not answer (${esc(e.message)}). Is the server still running?</span>`;
    }
    out.classList.remove('cursor');
    const secs = (performance.now() - t0) / 1000;
    if (text) timing.textContent = `${secs.toFixed(1)} s · ${text.split(/\s+/).filter(Boolean).length} words · ${modelInfo(L.model).short}, greedy, on this computer`;
    if (text && article && article.excerpt) {
      score.innerHTML = '<p class="note">Scoring…</p>';
      try {
        const r = await fetchT(L.base + '/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ original: article.excerpt, reconstruction: text, title }) }, 30000);
        if (r.ok) renderScore(score, await r.json()); else score.innerHTML = '';
      } catch (e) { score.innerHTML = ''; }
    }
    if (dot) dot.className = 'dot ok';
    L.busy = false; $('liveGo').disabled = false; $('liveStop').hidden = true;
    refreshStatus();
  }

  // {article, suggestions}: the article, or the server's "did you mean" list when there is no unambiguous match
  async function lookup(title) {
    try {
      const r = await fetchT(L.base + '/api/article?title=' + encodeURIComponent(title), {}, 5000);
      const j = await r.json().catch(() => null);
      if (r.ok && j) return { article: j, suggestions: [] };
      return { article: null, suggestions: (j && Array.isArray(j.suggestions) ? j.suggestions : []).filter(x => x && x.title) };
    } catch (e) { /* offline or missing */ }
    return { article: null, suggestions: [] };
  }
  function matchNote(article, typed) {
    const m = article && article.match;
    return m && m !== 'exact' && article.title ? `<p class="live-match">Closest match: <b>${esc(article.title)}</b>${typed && typed !== article.title ? ` <span>(you typed “${esc(typed)}”)</span>` : ''}</p>` : '';
  }
  function suggestHtml(list) {
    return list && list.length ? `<div class="live-sugg"><span class="note" style="margin:0">Did you mean</span>${list.slice(0, 5).map(x => `<button type="button" class="chip" data-title="${esc(x.title)}">${esc(x.title)}</button>`).join('')}</div>` : '';
  }
  function bindSuggestions(box) {
    box.querySelectorAll('.live-sugg .chip').forEach(b => b.addEventListener('click', () => { if (L.busy) return; $('liveTopic').value = b.dataset.title; run(b.dataset.title); }));
  }
  const nWords = t => t.split(/\s+/).filter(Boolean).length;
  const GAPS = "Wikipedia's plain-text version drops tables, math and some numbers, which can leave gaps.";

  async function writeArticle(title) {
    if (!title || L.busy) return;
    L.busy = true; L.ctrl = new AbortController();
    const out = $('liveOut'), orig = $('liveOrig'), timing = $('liveTiming'), score = $('liveScore');
    $('liveGo').disabled = true; $('liveStop').hidden = false;
    out.textContent = ''; out.classList.add('cursor', 'long'); score.innerHTML = ''; timing.textContent = '';
    orig.innerHTML = '<span style="color:var(--muted)">Looking it up…</span>';
    const dot = document.querySelector('#liveStatus .dot'); if (dot) dot.className = 'dot busy';
    const { article, suggestions } = await lookup(title);
    if (article && article.excerpt) {
      orig.innerHTML = matchNote(article, title) + esc(article.excerpt) + `<p class="note">This is the real lead. The check below reads every sentence against the whole real article. ${esc(GAPS)}${article.url ? ` <a href="${esc(article.url)}" target="_blank" rel="noopener">Wikipedia page</a> (needs internet)` : ''}</p>`;
      title = article.title || title;
    } else {
      orig.innerHTML = `<span style="color:var(--muted)">“${esc(title)}” is not in the local article list. The model will still write a whole article, which is a nice test for a made-up title.</span>` + suggestHtml(suggestions);
      bindSuggestions(orig);
    }
    const t0 = performance.now();
    let text = '', stopped = false;
    try {
      const r = await fetch(L.base + '/api/write_article', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, model: L.model }), signal: L.ctrl.signal });
      if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
      const reader = r.body.getReader(), dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        const atEnd = out.scrollHeight - out.scrollTop - out.clientHeight < 60;
        out.textContent = text;
        if (atEnd) out.scrollTop = out.scrollHeight;
        timing.textContent = `${((performance.now() - t0) / 1000).toFixed(1)} s · ${nWords(text)} words so far`;
      }
      text += dec.decode();
      out.textContent = text;
    } catch (e) {
      if (e.name === 'AbortError') stopped = true;
      else out.innerHTML = `<span style="color:var(--crit-ink)">The model did not answer (${esc(e.message)}). Is the server still running?</span>`;
    }
    out.classList.remove('cursor');
    const secs = (performance.now() - t0) / 1000;
    if (text) timing.textContent = `${secs.toFixed(1)} s · ${nWords(text)} words · ${modelInfo(L.model).short}, greedy, on this computer${stopped ? ' · stopped early' : ''}`;
    else if (stopped) out.innerHTML = '<span style="color:var(--muted)">Stopped before the model wrote anything.</span>';
    if (text.trim()) {
      score.innerHTML = '<p class="note" role="status"><span class="spin" aria-hidden="true"></span>Fact-checking every sentence against the real article. This takes a few seconds…</p>';
      try {
        const r = await fetchT(L.base + '/api/check_article', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, text }) }, 180000);
        if (!r.ok) {
          const j = await r.json().catch(() => null);
          throw new Error(j && j.error ? j.error : 'HTTP ' + r.status);
        }
        renderCheck(out, score, await r.json(), title, !(article && article.excerpt));
      } catch (e) { score.innerHTML = `<p class="note">The fact check did not answer (${esc(e.name === 'AbortError' ? 'it took too long' : e.message)}).</p>`; }
    }
    if (dot) dot.className = 'dot ok';
    L.busy = false; $('liveGo').disabled = false; $('liveStop').hidden = true;
    refreshStatus();
  }

  function renderCheck(out, box, j, title, unknown) {
    const fin = VZ.finite, R = window.RESULTS, DC = window.Decompress;
    const paras = (j && Array.isArray(j.paragraphs)) ? j.paragraphs : [];
    if (!j || !j.real_found) {
      box.innerHTML = `<div class="av-none" style="margin-top:16px"><b>We cannot fact-check this one.</b> The full real article for “${esc(title)}” is not in the local copy, which holds the 100,000 most-read topics plus the topics in our sample.${unknown ? ' If the topic does not exist at all, everything above is invented.' : ''} Try a more popular topic to see green, red and grey.</div>`;
      return;
    }
    const kb = v => DC ? DC.fmtKB(v) : (fin(v) ? Math.round(v) + ' B' : 'n/a');
    const fsr = R && R.decompression && fin(R.decompression.false_support_rate) ? R.decompression.false_support_rate : null;   // the control
    const pc = v => fin(v) ? (v > 0 && v < 0.005 ? '<1%' : Math.round(v * 100) + '%') : 'n/a';
    if (DC && DC.hasSentences(paras)) {
      const thr = fin(j.threshold) ? j.threshold : fin(j.nli_threshold) ? j.nli_threshold : undefined;
      out.innerHTML = '<div class="live-paras">' + DC.articleHtml(paras, { thr }) + '</div>';
      out.scrollTop = 0;
      DC.bindArticle(out, paras, { thr });
      const t = DC.tally(paras);
      const b = ['meaningful_bytes', 'contradicted_bytes', 'unconfirmed_bytes'].every(k => fin(j[k]))
        ? { supported: j.meaningful_bytes, contradicted: j.contradicted_bytes, unconfirmed: j.unconfirmed_bytes } : t;
      const sb = b.supported + b.contradicted + b.unconfirmed, n = t.n;
      const m = [['Written', kb(j.gen_bytes)], ['Confirmed', `${kb(b.supported)} (${pc(sb ? b.supported / sb : NaN)})`],
        ['Contradicts the real article', `${kb(b.contradicted)} (${pc(sb ? b.contradicted / sb : NaN)})`], ['Sentences', `${n.supported} ✓ · ${n.contradicted} ✗ · ${n.unconfirmed} ?`]];
      box.innerHTML = `<div class="live-check"><h4 style="margin:18px 0 0">How much of it does the real article confirm?</h4>
        ${DC.summaryBar(b, 'of its sentences, by length')}
        <div class="av-legend" style="margin:0">${DC.legendHtml({ thr, note: `The same check as the experiment: a local fact-checking model reads each sentence next to the most relevant paragraphs of the real article. Hover over or tap a sentence above for its numbers. Green is conservative (a true fact the article does not mention stays grey) but not noise-free${fsr != null ? `: in the experiment, a look-alike wrong article still "confirmed" ${(fsr * 100).toFixed(1)}% of sentences` : ''}. Red is noisier.` })}</div>
        <div class="metrics">${m.map(([l, v]) => `<div class="metric"><div class="lab">${esc(l)}</div><div class="v">${esc(v)}</div></div>`).join('')}</div></div>`;
      return;
    }
    // older server: one similarity verdict per paragraph
    const thr = fin(j && j.threshold) ? j.threshold : R && R.decompression && fin(R.decompression.threshold) ? R.decompression.threshold : null;
    const body = t => DC ? DC.paraHtml(t) : `<span class="gp-t">${esc(t)}</span>`;
    out.innerHTML = '<div class="live-paras">' + paras.map((p, n) => {
      const ok = !!p.meaningful, sc = !fin(p.score) ? '' : DC ? DC.fmtScore(p.score, thr) : p.score.toFixed(2);
      return `<div class="gp ${ok ? 'ok' : 'bad'}" aria-label="Paragraph ${n + 1}: ${ok ? 'matches the real article' : 'not found in the real article'}${sc ? ', score ' + sc : ''}"><span class="gp-badge">${ok ? '✓' : '✗'} ${sc}</span>${body(p.text)}</div>`;
    }).join('') + '</div>';
    out.scrollTop = 0;
    const green = paras.filter(p => p.meaningful).length;
    const share = fin(j.meaningful_share) ? j.meaningful_share : (j.gen_bytes ? j.meaningful_bytes / j.gen_bytes : NaN);
    const m = [['Written', kb(j.gen_bytes)], ['Matches the real article', kb(j.meaningful_bytes)], ['Meaningful share', pc(share)], ['Green paragraphs', `${green} of ${paras.length}`]];
    box.innerHTML = `<div class="live-check"><h4 style="margin:18px 0 0">How much of it is meaningful?</h4>
      <div class="av-legend" style="margin:0">
        <span class="lg ok"><span class="gp-badge">✓</span><b>Green: matches the real article.</b></span>
        <span class="lg bad"><span class="gp-badge">✗</span><b>Red: not found in the real article.</b></span>
        <span class="lg-note">Live check: a paragraph is green when its best match in the real article scores at least ${thr != null ? thr.toFixed(2) : 'the bar from the experiment'}. Green is about meaning, not a guarantee that every fact is right.</span>
      </div>
      <div class="metrics">${m.map(([l, v]) => `<div class="metric"><div class="lab">${l}</div><div class="v">${esc(v)}</div></div>`).join('')}</div></div>`;
  }

  function renderScore(box, s) {
    const R = window.RESULTS, b = R && R.baselines;
    box.innerHTML = '<h4 style="margin:18px 0 0">How similar is it to the real lead?</h4><div class="gauge" id="liveGauge"></div>' +
      '<p class="note">Similarity measures topic, not truth: a paragraph with wrong dates and places can still score high. For a sentence-by-sentence fact check, switch to “The whole article”.</p>' +
      '<div class="metrics" id="liveMetrics"></div>';
    const refs = [];
    if (b) {
      refs.push({ v: b.floor_mean, label: 'Unrelated article', color: 'var(--floor)' });
      refs.push({ v: b.paraphrase_mean, label: 'Paraphrase', color: 'var(--para)' });
    }
    if (VZ.finite(s.title_cos)) refs.push({ v: s.title_cos, label: 'Title only', color: 'var(--title)' });
    VZ.gauge($('liveGauge'), { value: s.cos, color: window.App ? App.color(L.model) : 'var(--s1)', label: 'This rewrite', refs });
    const pct = v => VZ.finite(v) ? Math.round(v * 100) + '%' : 'n/a';
    const m = [['Similarity (topic)', VZ.finite(s.cos) ? s.cos.toFixed(3) : 'n/a'], ['Title-only baseline', VZ.finite(s.title_cos) ? s.title_cos.toFixed(3) : 'n/a'],
      ['Same words (ROUGE-L)', pct(s.rougeL)], ['Copied 8-word runs', pct(s.verbatim8)], ['Years recalled', s.year_recall == null ? 'no years' : pct(s.year_recall)]];
    $('liveMetrics').innerHTML = m.map(([l, v]) => `<div class="metric"><div class="lab">${l}</div><div class="v">${v}</div></div>`).join('');
  }

  async function surprise() {
    const text = $('surText').value.trim();
    if (!text || L.busy) return;
    L.busy = true;
    $('surGo').disabled = true; $('surNote').textContent = 'Reading…';
    try {
      const r = await fetchT(L.base + '/api/surprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, model: L.model }) }, 120000);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      VZ.heat($('surOut'), j.tokens || [], j.bits || []);
      const total = (j.bits || []).reduce((a, b) => a + b, 0);
      $('surNote').textContent = `${total.toFixed(1)} bits in total · ${VZ.finite(j.bpb) ? j.bpb.toFixed(2) : '?'} bits per byte · ${modelInfo(L.model).short}`;
      L.history = L.history.filter(h => h.text !== text || h.model !== L.model);
      L.history.unshift({ text, total, model: L.model });
      L.history = L.history.slice(0, 6);
      const max = Math.max(...L.history.map(h => h.total));
      $('surHist').innerHTML = '<p class="sub" style="margin-top:8px">Compare (shorter bar = less surprising):</p>' + L.history.map(h =>
        `<div class="row"><span>${esc(h.text)}</span><b style="font-variant-numeric:tabular-nums">${h.total.toFixed(1)} bits</b><span class="bt"><span class="bar" style="display:block;width:${(h.total / max * 100).toFixed(1)}%"></span></span></div>`).join('');
    } catch (e) {
      $('surNote').textContent = 'No answer from the server (' + e.message + ').';
    }
    $('surGo').disabled = false; L.busy = false;
    refreshStatus();
  }

  async function start(root, force) {
    if (!root) return;
    if (!force && L.started) return;
    L.started = true;
    root.innerHTML = '<div class="card"><div class="live-status"><span class="dot busy"></span>Looking for the live lab server…</div></div>';
    const found = await detect();
    if (!found) { renderOffline(root); return; }
    L.base = found.base; L.health = found.health;
    renderOnline(root);
  }

  // The online copy (any host other than this computer) never looks for the local server: there is none, and
  // Chrome would ask visitors for permission to reach their local network. Add ?lab to the URL to look anyway.
  const isLocalHost = h => /^(localhost|127\.0\.0\.1|\[::1\]|::1|)$/.test(h) || /\.localhost$/.test(h);
  const onlineCopy = () => !isLocalHost(location.hostname) && !/[?&]lab(=|&|$)/.test(location.search);
  function renderPublic(root) {
    const lead = root.closest('section') && root.closest('section').querySelector('.lead');
    if (lead) lead.textContent = 'In class, a model on the instructor\u2019s computer writes the opening paragraph, or the whole article, from a title while we watch, and the fact check runs live.';
    root.innerHTML = `
      <div class="card offline-box">
        <div class="live-status"><span class="dot"></span><b>The live lab runs in class only.</b></div>
        <p style="margin:0">It needs the Qwen models and a small server on the instructor\u2019s computer, so it is switched off in this online copy. Everything else on this page is the real, recorded experiment.</p>
        <p class="note" style="margin:0">To see a model write a whole article from its title, fact-checked sentence by sentence, open the article viewer in section 4. For topics that do not exist, see section 8.</p>
      </div>`;
  }

  function init() {
    const root = $('live');
    if (!root) return;
    if (onlineCopy()) { renderPublic(root); window.Live.start = () => renderPublic(root); return; }
    root.innerHTML = '<div class="card"><div class="live-status"><span class="dot"></span>The live lab connects when you get here.</div></div>';
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); start(root); } }, { rootMargin: '600px 0px' });
      io.observe(root);
    } else start(root);
  }
  window.Live = { init, start: () => start($('live'), true) };
})();
