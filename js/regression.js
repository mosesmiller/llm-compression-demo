/* Regression as compression: an interactive playground.
   n noisy points from a smooth hidden function are fitted by least squares with a polynomial
   in the Legendre basis (x already lives in [-1, 1]), solved by Householder QR, so even
   degree 15 stays numerically stable. "Decompress" regenerates each point's y from its x
   and the parameters (the x is the input, like an article's title); the red residual lines
   are what the parameters could not keep. */
(function () {
  'use strict';
  const MAXN = 500, NTEST = 400;
  const truth = x => 0.9 * Math.sin(2.4 * x) + 0.3 * Math.cos(4.5 * x + 0.5) + 0.2 * x;
  const S = { n: 60, noise: 0.25, deg: 3, seed: 7, extra: false, truth: false, decomp: false, t: 0 };
  let X = [], Z = [], XT = [], ZT = [], fit = null, anim = 0;
  let canvas, ctx, dpr = 1;

  function mulberry32(a) {
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function generate() {
    const r = mulberry32(S.seed * 9973 + 1);
    const gauss = () => { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    X = []; Z = []; XT = []; ZT = [];
    for (let i = 0; i < MAXN; i++) { X.push(r() * 2 - 1); Z.push(gauss()); }
    for (let i = 0; i < NTEST; i++) { XT.push(r() * 2 - 1); ZT.push(gauss()); }
  }
  function legendre(x, d) {
    const p = [1];
    if (d >= 1) p.push(x);
    for (let k = 1; k < d; k++) p.push(((2 * k + 1) * x * p[k] - k * p[k - 1]) / (k + 1));
    return p;
  }
  // Least squares by Householder QR: minimise ||A c - b||.
  function lstsq(A, b) {
    const m = A.length, n = A[0].length, R = A.map(r => r.slice()), y = b.slice();
    for (let k = 0; k < n; k++) {
      let norm = 0;
      for (let i = k; i < m; i++) norm += R[i][k] * R[i][k];
      norm = Math.sqrt(norm);
      if (norm < 1e-14) continue;
      const alpha = R[k][k] > 0 ? -norm : norm, v = new Float64Array(m);
      for (let i = k; i < m; i++) v[i] = R[i][k];
      v[k] -= alpha;
      let vv = 0;
      for (let i = k; i < m; i++) vv += v[i] * v[i];
      if (vv < 1e-30) continue;
      for (let j = k; j < n; j++) {
        let s = 0; for (let i = k; i < m; i++) s += v[i] * R[i][j];
        s = 2 * s / vv; for (let i = k; i < m; i++) R[i][j] -= s * v[i];
      }
      let s = 0; for (let i = k; i < m; i++) s += v[i] * y[i];
      s = 2 * s / vv; for (let i = k; i < m; i++) y[i] -= s * v[i];
    }
    const c = new Array(n).fill(0);
    for (let k = n - 1; k >= 0; k--) {
      let s = y[k];
      for (let j = k + 1; j < n; j++) s -= R[k][j] * c[j];
      c[k] = Math.abs(R[k][k]) > 1e-12 ? s / R[k][k] : 0;
    }
    return c;
  }
  const predict = (c, x) => legendre(x, c.length - 1).reduce((a, p, i) => a + p * c[i], 0);

  function refit() {
    const xs = X.slice(0, S.n), ys = xs.map((x, i) => truth(x) + S.noise * Z[i]);
    const c = lstsq(xs.map(x => legendre(x, S.deg)), ys);
    const yhat = xs.map(x => predict(c, x));
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    let ssr = 0, sst = 0;
    ys.forEach((y, i) => { ssr += (y - yhat[i]) ** 2; sst += (y - mean) ** 2; });
    let tsr = 0, tst = 0;
    const tm = XT.reduce((a, x, i) => a + truth(x) + S.noise * ZT[i], 0) / NTEST;
    XT.forEach((x, i) => { const y = truth(x) + S.noise * ZT[i]; tsr += (y - predict(c, x)) ** 2; tst += (y - tm) ** 2; });
    // Reference: a moderate fit (degree 6) on the same points, to tell 'too simple' from 'as good as it gets'.
    const cRef = lstsq(xs.map(x => legendre(x, Math.min(6, xs.length - 2))), ys);
    let rsr = 0;
    XT.forEach((x, i) => { const y = truth(x) + S.noise * ZT[i]; rsr += (y - predict(cRef, x)) ** 2; });
    fit = { xs, ys, yhat, c, r2: sst > 0 ? 1 - ssr / sst : 1, rmse: Math.sqrt(ssr / ys.length), r2test: tst > 0 ? 1 - tsr / tst : 1,
            r2ref: tst > 0 ? 1 - rsr / tst : 1 };
  }

  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  function resize() {
    dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    draw();
  }
  function draw() {
    if (!ctx || !fit) return;
    const W = canvas.width / dpr, H = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const pad = { l: 14, r: 14, t: 14, b: 14 };
    const xr = S.extra ? [-1.75, 1.75] : [-1.06, 1.06];
    const ym = 1.7 + 2.0 * S.noise;
    const px = x => pad.l + (x - xr[0]) / (xr[1] - xr[0]) * (W - pad.l - pad.r);
    const py = y => pad.t + (ym - y) / (2 * ym) * (H - pad.t - pad.b);
    const C = { ink: css('--ink'), ink2: css('--ink-2'), muted: css('--muted'), grid: css('--grid'), accent: css('--accent'), crit: css('--crit'), surface: css('--surface'), s2: css('--surface-2'), title: css('--title') };

    // zero line and, when extrapolating, the "no data here" zones
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, py(0)); ctx.lineTo(W - pad.r, py(0)); ctx.stroke();
    if (S.extra) {
      ctx.fillStyle = C.s2;
      ctx.fillRect(pad.l, pad.t, px(-1) - pad.l, H - pad.t - pad.b);
      ctx.fillRect(px(1), pad.t, W - pad.r - px(1), H - pad.t - pad.b);
      ctx.fillStyle = C.ink2; ctx.font = '600 14px system-ui, sans-serif'; ctx.textAlign = 'center';
      const midL = (pad.l + px(-1)) / 2, midR = (px(1) + W - pad.r) / 2;
      ['No data here:', 'the model', 'makes it up'].forEach((s, i) => { ctx.fillText(s, midL, pad.t + 24 + i * 18); ctx.fillText(s, midR, pad.t + 24 + i * 18); });
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(pad.l, pad.t, W - pad.l - pad.r, H - pad.t - pad.b); ctx.clip();

    if (S.truth) {
      ctx.strokeStyle = C.title; ctx.lineWidth = 2; ctx.setLineDash([7, 6]);
      ctx.beginPath();
      for (let i = 0; i <= 300; i++) { const x = xr[0] + (xr[1] - xr[0]) * i / 300; i ? ctx.lineTo(px(x), py(truth(x))) : ctx.moveTo(px(x), py(truth(x))); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    const t = S.t, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const r = S.n > 300 ? 3 : 4.2;
    // residuals (what was lost) and ghost originals
    if (t > 0) {
      ctx.globalAlpha = Math.min(1, t * 1.4);
      ctx.strokeStyle = C.crit; ctx.lineWidth = 1.6;
      ctx.beginPath();
      fit.xs.forEach((x, i) => { ctx.moveTo(px(x), py(fit.ys[i])); ctx.lineTo(px(x), py(fit.ys[i] + (fit.yhat[i] - fit.ys[i]) * e)); });
      ctx.stroke();
      ctx.globalAlpha = 0.28; ctx.fillStyle = C.ink2;
      fit.xs.forEach((x, i) => { ctx.beginPath(); ctx.arc(px(x), py(fit.ys[i]), r, 0, 7); ctx.fill(); });
      ctx.globalAlpha = 1;
    }
    // model curve
    ctx.strokeStyle = C.accent; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 400; i++) { const x = xr[0] + (xr[1] - xr[0]) * i / 400; const y = Math.max(-50, Math.min(50, predict(fit.c, x))); i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y)); }
    ctx.stroke();
    // points (moving onto the curve when decompressed)
    fit.xs.forEach((x, i) => {
      const y = fit.ys[i] + (fit.yhat[i] - fit.ys[i]) * e;
      ctx.beginPath(); ctx.arc(px(x), py(y), r + 1.6, 0, 7); ctx.fillStyle = C.surface; ctx.fill();
      ctx.beginPath(); ctx.arc(px(x), py(y), r, 0, 7); ctx.fillStyle = t > 0 ? C.accent : C.ink2; ctx.fill();
    });
    ctx.restore();
    if (S.extra) {
      ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      [-1, 1].forEach(b => { ctx.beginPath(); ctx.moveTo(px(b), pad.t); ctx.lineTo(px(b), H - pad.b); ctx.stroke(); });
      ctx.setLineDash([]);
    }
  }

  const fmtBytes = b => b >= 1024 ? (b / 1024).toFixed(1) + ' KB' : b + ' B';
  function readout() {
    // Only the y-values count as data: decompression is given each x, as the LLM is given each title.
    const dataB = S.n * 8, modelB = (S.deg + 1) * 8, ratio = dataB / modelB;
    const p = S.deg + 1;
    const overfit = S.deg > 0 && (fit.r2test < fit.r2 - 0.08 || (S.deg >= 11 && S.n < 80));
    let msg;
    if (S.t > 0) msg = '<b>Decompressed.</b> Each point\'s y was regenerated from its x and the ' + p + ' parameters. The red lines are what was lost.';
    else if (S.deg === 0) msg = '<b>One parameter</b> is just the average. Tiny, but it misses the whole pattern.';
    else if (overfit) msg = '<b>Too many parameters for this little data.</b> The curve memorises the noise, so it does worse on new points' +
      (fit.r2test < 0 ? ' than just guessing the average' : '') + '. ' +
      (S.extra ? 'In the shaded zones, beyond the data, it makes things up.' : 'Switch on <i>Predict beyond the data</i> to see what it does where there is no data.');
    else if (S.deg <= 2 || fit.r2 < 0.6 || (S.deg < 6 && fit.r2test < fit.r2ref - 0.05)) msg = '<b>Too simple.</b> Not enough parameters to hold the pattern: a few more would capture clearly more of it.';
    else msg = `<b>Good compression:</b> ${ratio.toFixed(0)}× smaller, and it keeps most of the pattern.`;
    const el = document.getElementById('regReadout');
    const maxB = Math.max(dataB, modelB);
    el.innerHTML = `
      <div class="ro-left">
        <div class="ro-sizes">
          <div><div class="lab">Data</div><div class="v">${fmtBytes(dataB)}</div><div class="eq">${S.n} y-values × 8 B</div></div>
          <div class="ro-ratio">${ratio >= 1 ? ratio.toFixed(ratio < 10 ? 1 : 0) + '×' : '1:' + (1 / ratio).toFixed(1)}<br><small>smaller</small></div>
          <div><div class="lab">Model</div><div class="v" style="color:var(--accent)">${fmtBytes(modelB)}</div><div class="eq">${p} parameter${p > 1 ? 's' : ''} × 8 B</div></div>
        </div>
        <div class="ro-bars" aria-hidden="true"><div class="ro-bar" style="width:${dataB / maxB * 100}%"></div><div class="ro-bar m" style="width:${modelB / maxB * 100}%"></div></div>
      </div>
      <div class="ro-fit">
        <div><div class="lab">R² on this data</div><div class="v">${fit.r2.toFixed(2)}</div></div>
        <div title="${fit.r2test < 0 ? 'Exact value: ' + fit.r2test.toFixed(2) + '. Below 0 means worse than predicting the average for every point.' : ''}"><div class="lab">R² on new data</div><div class="v">${fit.r2test < 0 ? '&lt; 0<small>worse than the average</small>' : fit.r2test.toFixed(2)}</div></div>
        <div><div class="lab">Typical error</div><div class="v">${fit.rmse.toFixed(2)}</div></div>
      </div>
      <p class="ro-msg">${msg}</p>`;
    const pv = document.getElementById('regParams');
    pv.innerHTML = fit.c.map((c, i) => `<span title="Parameter ${i + 1}">${c >= 0 ? '+' : '−'}${Math.abs(c).toPrecision(3)}</span>`).join('');
    document.getElementById('regParamsNote').textContent = `${p} number${p > 1 ? 's' : ''} replace ${S.n} y-values. Feed in any x and they give back a y.`;
    const lg = document.getElementById('regLegend');
    lg.innerHTML = `<span class="k"><i class="dot" style="background:var(--ink-2)"></i>Data points</span><span class="k"><i style="border-color:var(--accent)"></i>Model (${p} parameters)</span>` +
      (S.truth ? '<span class="k"><i class="dash" style="border-color:var(--title)"></i>Hidden truth</span>' : '') +
      (S.t > 0 ? '<span class="k"><i style="border-color:var(--crit);border-top-width:2px"></i>Lost in compression</span>' : '');
    document.querySelectorAll('#mapGrid .map-row').forEach((row, i) => {
      // row 6 ("more parameters, loses less") only while extra parameters are actually helping, never next to the overfit warning
      row.style.borderColor = (i === 4 && S.t > 0) || (i === 5 && S.extra) || (i === 6 && S.deg >= 4 && !overfit && fit.r2 >= 0.6) ? 'var(--accent)' : '';
    });
  }

  function update(keepDecomp) {
    if (!keepDecomp) { S.decomp = false; S.t = 0; setDecompLabel(); }
    refit(); readout(); draw();
  }
  function setDecompLabel() {
    const b = document.getElementById('regDecompress');
    if (b) b.textContent = S.decomp ? 'Show the original data' : 'Decompress';
  }
  function animateTo(target) {
    cancelAnimationFrame(anim);
    const t0 = performance.now(), from = S.t, dur = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 900;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      S.t = from + (target - from) * k;
      draw();
      if (k < 1) anim = requestAnimationFrame(step); else readout();
    };
    anim = requestAnimationFrame(step);
  }

  function bind(id, key, parse, label) {
    const inp = document.getElementById(id);
    inp.addEventListener('input', () => { S[key] = parse(inp.value); label(); update(); });
  }
  function labels() {
    document.getElementById('regNVal').textContent = S.n;
    document.getElementById('regNoiseVal').textContent = S.noise.toFixed(2);
    document.getElementById('regDegVal').textContent = S.deg + 1;
    document.getElementById('regDegNote').textContent = S.deg === 0 ? '(a constant)' : S.deg === 1 ? '(a straight line)' : `(polynomial of degree ${S.deg})`;
  }
  function setControls() {
    document.getElementById('regN').value = S.n;
    document.getElementById('regNoise').value = S.noise;
    document.getElementById('regDeg').value = S.deg;
    document.getElementById('regExtra').checked = S.extra;
    document.getElementById('regTruth').checked = S.truth;
    labels();
  }
  const PRESETS = { under: { n: 80, noise: 0.25, deg: 1, extra: false }, good: { n: 80, noise: 0.25, deg: 6, extra: false }, over: { n: 24, noise: 0.35, deg: 15, extra: true } };

  function init() {
    canvas = document.getElementById('regCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    generate();
    setControls();
    bind('regN', 'n', v => +v, labels);
    bind('regNoise', 'noise', v => +v, labels);
    bind('regDeg', 'deg', v => +v, labels);
    document.getElementById('regExtra').addEventListener('change', e => { S.extra = e.target.checked; readout(); draw(); });
    document.getElementById('regTruth').addEventListener('change', e => { S.truth = e.target.checked; readout(); draw(); });
    document.getElementById('regNew').addEventListener('click', () => { S.seed++; generate(); update(); });
    document.getElementById('regDecompress').addEventListener('click', () => { S.decomp = !S.decomp; setDecompLabel(); animateTo(S.decomp ? 1 : 0); readout(); });
    document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
      Object.assign(S, PRESETS[b.dataset.preset]);
      setControls(); update();
      document.querySelectorAll('[data-preset]').forEach(o => o.classList.toggle('is-on', o === b));
    }));
    update();
    new ResizeObserver(resize).observe(canvas);
    document.addEventListener('themechange', draw);
  }
  window.Regression = { init, lstsq, legendre };
})();
