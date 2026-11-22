/* Tiny SVG chart helper for the class site: scales, axes, lines with CI bands, histograms,
   horizontal bars, stacked bars, scatter and one shared tooltip. Colours are CSS variables,
   so switching the theme needs no redraw. Charts redraw themselves when their box resizes. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null) continue;
      if (k === 'style') Object.assign(e.style, v);
      else if (k === 'text') e.textContent = v;
      else e.setAttribute(k, v);
    }
    if (parent) parent.appendChild(e);
    return e;
  }
  function html(tag, cls, parent, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const finite = v => typeof v === 'number' && isFinite(v);

  // ---------- scales
  function niceStep(span, n) {
    const raw = span / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }
  function ticks(min, max, n) {
    const s = niceStep(max - min, n || 5), out = [];
    for (let v = Math.ceil(min / s - 1e-9) * s; v <= max + s * 1e-9; v += s) out.push(+v.toFixed(10));
    return out;
  }
  function nice(min, max, n) {
    if (min === max) { min -= 0.5; max += 0.5; }
    const s = niceStep(max - min, n || 5);
    return [Math.floor(min / s + 1e-9) * s, Math.ceil(max / s - 1e-9) * s];
  }
  function linear(d, r) {
    const f = v => r[0] + (v - d[0]) / (d[1] - d[0]) * (r[1] - r[0]);
    f.domain = d; f.range = r; f.ticks = n => ticks(d[0], d[1], n);
    f.invert = p => d[0] + (p - r[0]) / (r[1] - r[0]) * (d[1] - d[0]);
    return f;
  }
  function log(d, r) {
    const l0 = Math.log10(d[0]), l1 = Math.log10(d[1]);
    const f = v => r[0] + (Math.log10(v) - l0) / (l1 - l0) * (r[1] - r[0]);
    f.domain = d; f.range = r;
    f.ticks = () => { const out = []; for (let e = Math.floor(l0); e <= Math.ceil(l1); e++) { const v = Math.pow(10, e); if (v >= d[0] * 0.999 && v <= d[1] * 1.001) out.push(v); } return out; };
    f.invert = p => Math.pow(10, l0 + (p - r[0]) / (r[1] - r[0]) * (l1 - l0));
    return f;
  }
  function band(labels, r, pad) {
    const n = labels.length, step = (r[1] - r[0]) / n;
    const f = l => r[0] + step * (labels.indexOf(l) + 0.5);
    f.step = step; f.bw = step * (1 - (pad == null ? 0.3 : pad)); f.labels = labels; f.range = r;
    f.index = px => Math.max(0, Math.min(n - 1, Math.floor((px - r[0]) / step)));
    return f;
  }

  // ---------- tooltip (one shared element)
  const tip = {
    node: null,
    show(content, x, y) {
      const t = this.node || (this.node = document.getElementById('tooltip'));
      if (!t) return;
      t.innerHTML = content; t.hidden = false;
      const r = t.getBoundingClientRect(), pad = 14;
      let left = x + pad, top = y + pad;
      if (left + r.width > window.innerWidth - 8) left = x - r.width - pad;
      if (top + r.height > window.innerHeight - 8) top = y - r.height - pad;
      t.style.left = Math.max(8, left) + 'px'; t.style.top = Math.max(8, top) + 'px';
    },
    hide() { if (this.node) this.node.hidden = true; },
    row(color, label, value) {
      return `<div class="tt-r"><span>${color ? `<i style="background:${color}"></i>` : ''}${esc(label)}</span><b>${esc(value)}</b></div>`;
    },
  };

  // ---------- legend + frame
  function legend(parent, items) {
    const d = html('div', 'legend', parent);
    items.forEach(it => {
      const k = html('span', 'k', d);
      const i = html('i', it.kind || 'line', k);
      if (it.kind === 'ref') i.style.borderColor = it.color; else i.style.background = it.color;
      html('span', '', k, it.label);
    });
    return d;
  }
  function frame(container, o) {
    container.innerHTML = '';
    let lg = null;
    if (o.legend && o.legend.length) lg = legend(container, o.legend);
    const W = Math.max(280, container.clientWidth || 600);
    const H = Math.max(180, (container.clientHeight || 360) - (lg ? lg.offsetHeight + 14 : 0));
    const narrow = W < 560;
    const m = Object.assign({ top: 38, right: 24, bottom: 52, left: 60 }, o.margin || {}, narrow ? (o.marginNarrow || {}) : {});
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': o.label || '' }, container);
    svg.style.height = H + 'px';
    const g = el('g', { transform: `translate(${m.left},${m.top})` }, svg);
    const fr = { svg, g, W, H, m, w: W - m.left - m.right, h: H - m.top - m.bottom, narrow };
    fr.grid = el('g', { class: 'grid' }, g);
    fr.marks = el('g', { class: 'marks' }, g);
    fr.axes = el('g', { class: 'ax' }, g);
    fr.top = el('g', { class: 'top' }, g);
    return fr;
  }
  function axisY(fr, y, o) {
    o = o || {};
    const fmt = o.format || (v => v);
    const tk = o.ticks || y.ticks(fr.h < 240 ? 4 : 6);
    tk.forEach(v => {
      const py = y(v);
      if (o.grid !== false) el('line', { x1: 0, x2: fr.w, y1: py, y2: py }, fr.grid);
      el('text', { x: -10, y: py, dy: '0.34em', 'text-anchor': 'end', text: fmt(v) }, fr.axes);
    });
    if (o.label) el('text', { class: 'axlab', x: -fr.m.left + 4, y: -22, 'text-anchor': 'start', text: o.label }, fr.axes);
  }
  function axisX(fr, x, o) {
    o = o || {};
    const fmt = o.format || (v => v);
    el('line', { class: 'base', x1: 0, x2: fr.w, y1: fr.h, y2: fr.h }, fr.axes);
    const vals = x.labels || o.ticks || x.ticks(fr.narrow ? 4 : 7);
    const every = x.labels && fr.narrow && vals.length > 5 ? 2 : 1;
    vals.forEach((v, i) => {
      if (i % every) return;
      const px = x(v);
      if (o.grid) el('line', { x1: px, x2: px, y1: 0, y2: fr.h }, fr.grid);
      el('text', { x: px, y: fr.h + 22, 'text-anchor': 'middle', text: fmt(v) }, fr.axes);
    });
    if (o.label) el('text', { class: 'axlab', x: fr.w / 2, y: fr.h + 44, 'text-anchor': 'middle', text: o.label }, fr.axes);
  }
  const path = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');

  // Spread end labels so they do not overlap (keeps order, minimal moves).
  function spread(labels, minGap, lo, hi) {
    labels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < minGap) labels[i].y = labels[i - 1].y + minGap;
    const over = labels.length ? labels[labels.length - 1].y - hi : 0;
    if (over > 0) { labels.forEach(l => l.y -= over); for (let i = labels.length - 2; i >= 0; i--) if (labels[i + 1].y - labels[i].y < minGap) labels[i].y = labels[i + 1].y - minGap; }
    labels.forEach(l => l.y = Math.max(lo, l.y));
    return labels;
  }

  // ---------- line chart with optional CI bands and reference lines
  // o: { x: {type:'band', labels} | {type:'log'|'linear', domain}, y: {domain, format, label}, xLabel, xFormat,
  //      series: [{key, label, color, points: [{x, y, lo, hi}]}], refs: [{y, label, color}], endLabels, tooltip(xv, rows) }
  function lineChart(container, o) {
    const series = o.series.filter(s => s.points.some(p => finite(p.y)));
    const lg = (o.legendItems || series.map(s => ({ label: s.label, color: s.color, kind: 'line' }))).concat((o.refs || []).filter(r => finite(r.y)).map(r => ({ label: r.label, color: r.color, kind: 'ref' })));
    const endLabels = o.endLabels !== false;
    const fr = frame(container, { legend: lg, label: o.label, margin: Object.assign({ right: endLabels ? 128 : 24 }, o.margin), marginNarrow: { right: 18, left: 50 } });
    if (!series.length) { html('div', 'empty', container, o.emptyText || 'No data yet.'); return; }
    let ys = [];
    series.forEach(s => s.points.forEach(p => { [p.y, p.lo, p.hi].forEach(v => finite(v) && ys.push(v)); }));
    (o.refs || []).forEach(r => finite(r.y) && ys.push(r.y));
    const yd = o.y.domain || nice(Math.min(...ys), Math.max(...ys), 5);
    const y = linear(yd, [fr.h, 0]);
    let x;
    if (o.x.type === 'band') x = band(o.x.labels, [0, fr.w], 0);
    else {
      const xs = []; series.forEach(s => s.points.forEach(p => xs.push(p.x)));
      const d = o.x.domain || [Math.min(...xs), Math.max(...xs)];
      x = (o.x.type === 'log' ? log : linear)(d, [0, fr.w]);
    }
    axisY(fr, y, { format: o.y.format, label: o.y.label, ticks: o.y.ticks });
    axisX(fr, x, { format: o.xFormat, label: o.xLabel, ticks: o.x.ticks, grid: o.x.type !== 'band' && o.x.grid });
    // reference lines (baselines)
    (o.refs || []).forEach(r => {
      if (!finite(r.y) || r.y < yd[0] || r.y > yd[1]) return;
      const g = el('g', { class: 'ref' }, fr.marks);
      el('line', { x1: 0, x2: fr.w, y1: y(r.y), y2: y(r.y), style: { stroke: r.color, strokeWidth: 2, strokeDasharray: '6 5' } }, g);
      el('text', { x: 6, y: y(r.y) - 7, text: r.label }, g);
    });
    const ends = [];
    series.forEach(s => {
      const pts = s.points.filter(p => finite(p.y));
      const bandPts = pts.filter(p => finite(p.lo) && finite(p.hi));
      if (bandPts.length > 1) {
        const up = bandPts.map(p => [x(p.x), y(p.hi)]), dn = bandPts.map(p => [x(p.x), y(p.lo)]).reverse();
        el('path', { d: path(up.concat(dn)) + 'Z', style: { fill: s.color, fillOpacity: 0.13, stroke: 'none' } }, fr.marks);
      }
      el('path', { d: path(pts.map(p => [x(p.x), y(p.y)])), style: { fill: 'none', stroke: s.color, strokeWidth: s.width || 2.5, strokeLinejoin: 'round', strokeLinecap: 'round', strokeDasharray: s.dash || '' } }, fr.marks);
      pts.forEach(p => el('circle', { cx: x(p.x), cy: y(p.y), r: 4.5, style: { fill: s.color, stroke: 'var(--surface)', strokeWidth: 2 } }, fr.marks));
      const last = pts[pts.length - 1];
      if (last) ends.push({ y: y(last.y), x: x(last.x), s, v: last.y });
    });
    if (endLabels && !fr.narrow) {
      spread(ends, 19, 6, fr.h - 4).forEach(e => {
        el('text', { class: 'dl', x: e.x + 12, y: e.y, dy: '0.34em', text: e.s.short || e.s.label }, fr.top);
      });
    }
    // hover: crosshair + tooltip with every series at this x
    const xsAll = o.x.type === 'band' ? o.x.labels : [...new Set(series.flatMap(s => s.points.map(p => p.x)))].sort((a, b) => a - b);
    const cross = el('line', { class: 'cross', y1: 0, y2: fr.h, style: { visibility: 'hidden' } }, fr.top);
    const hit = el('rect', { class: 'hit', x: 0, y: 0, width: fr.w, height: fr.h }, fr.top);
    const onMove = ev => {
      const pt = fr.svg.getBoundingClientRect();
      const px = (ev.clientX - pt.left) * (fr.W / pt.width) - fr.m.left;
      let xv;
      if (o.x.type === 'band') xv = o.x.labels[x.index(px)];
      else xv = xsAll.reduce((b, v) => Math.abs(x(v) - px) < Math.abs(x(b) - px) ? v : b, xsAll[0]);
      cross.setAttribute('x1', x(xv)); cross.setAttribute('x2', x(xv)); cross.style.visibility = 'visible';
      const rows = series.map(s => ({ s, p: s.points.find(p => p.x === xv) })).filter(r => r.p && finite(r.p.y));
      const fmt = o.y.tipFormat || o.y.format || (v => v);
      const head = o.tooltipHead ? o.tooltipHead(xv) : (o.xFormat ? o.xFormat(xv) : xv);
      tip.show(`<div class="tt-h">${esc(head)}</div>` + rows.map(r => tip.row(r.s.color, r.s.label, fmt(r.p.y) + (finite(r.p.lo) ? `  (${fmt(r.p.lo)}–${fmt(r.p.hi)})` : ''))).join('') + (o.tooltipFoot ? o.tooltipFoot(xv) : ''), ev.clientX, ev.clientY);
    };
    hit.addEventListener('pointermove', onMove);
    hit.addEventListener('pointerleave', () => { cross.style.visibility = 'hidden'; tip.hide(); });
    return fr;
  }

  // ---------- overlaid distributions (histogram counts -> share per bin, step areas)
  // o: { edges, series: [{label, color, counts, emphasis}], xLabel, xFormat }
  function histChart(container, o) {
    const series = o.series.filter(s => s.counts && s.counts.some(c => c > 0));
    const fr = frame(container, { legend: series.map(s => ({ label: s.label, color: s.color, kind: 'box' })), label: o.label, margin: { left: 56 } });
    if (!series.length) { html('div', 'empty', container, 'No data yet.'); return; }
    const e = o.edges;
    const shares = series.map(s => { const n = s.counts.reduce((a, b) => a + b, 0) || 1; return s.counts.map(c => c / n); });
    const ymax = Math.max(...shares.flat());
    const lo = o.xDomain ? o.xDomain[0] : e[0], hi = o.xDomain ? o.xDomain[1] : e[e.length - 1];
    const x = linear([lo, hi], [0, fr.w]);
    const y = linear(nice(0, ymax, 4), [fr.h, 0]);
    axisY(fr, y, { format: v => Math.round(v * 100) + '%', label: o.yLabel || 'Share of articles' });
    axisX(fr, x, { format: o.xFormat, label: o.xLabel });
    series.forEach((s, k) => {
      const pts = [[x(e[0]), y(0)]];
      shares[k].forEach((v, i) => { pts.push([x(e[i]), y(v)]); pts.push([x(e[i + 1]), y(v)]); });
      pts.push([x(e[e.length - 1]), y(0)]);
      el('path', { d: path(pts) + 'Z', style: { fill: s.color, fillOpacity: s.emphasis ? 0.22 : 0.10, stroke: 'none' } }, fr.marks);
      el('path', { d: path(pts.slice(1, -1)), style: { fill: 'none', stroke: s.color, strokeWidth: s.emphasis ? 2.5 : 2, strokeLinejoin: 'round' } }, fr.marks);
      // direct label above the peak
      let bi = 0; shares[k].forEach((v, i) => { if (v > shares[k][bi]) bi = i; });
      const cx = x((e[bi] + e[bi + 1]) / 2);
      if (!fr.narrow) el('text', { class: 'dl', x: cx, y: y(shares[k][bi]) - 10, 'text-anchor': 'middle', text: s.short || s.label }, fr.top);
    });
    const cross = el('line', { class: 'cross', y1: 0, y2: fr.h, style: { visibility: 'hidden' } }, fr.top);
    const hit = el('rect', { class: 'hit', x: 0, y: 0, width: fr.w, height: fr.h }, fr.top);
    hit.addEventListener('pointermove', ev => {
      const r = fr.svg.getBoundingClientRect();
      const v = x.invert((ev.clientX - r.left) * (fr.W / r.width) - fr.m.left);
      const i = Math.max(0, Math.min(e.length - 2, e.findIndex((ed, j) => v >= ed && v < e[j + 1])));
      cross.setAttribute('x1', x(v)); cross.setAttribute('x2', x(v)); cross.style.visibility = 'visible';
      const f = o.xFormat || (z => z);
      tip.show(`<div class="tt-h">Similarity ${f(e[i])}–${f(e[i + 1])}</div>` + series.map((s, k) => tip.row(s.color, s.label, (shares[k][i] * 100).toFixed(1) + '%')).join(''), ev.clientX, ev.clientY);
    });
    hit.addEventListener('pointerleave', () => { cross.style.visibility = 'hidden'; tip.hide(); });
  }

  // ---------- horizontal bars with optional CI whiskers and group headings
  // o: { rows: [{label, sub, value, lo, hi, color, group, pattern}], format, xLabel, xDomain, refs: [{x, label}] }
  function barChart(container, o) {
    const rows = o.rows.filter(r => finite(r.value));
    const groups = [];
    rows.forEach(r => { if (!groups.length || groups[groups.length - 1].name !== r.group) groups.push({ name: r.group, rows: [] }); groups[groups.length - 1].rows.push(r); });
    const rowH = o.rowH || 38, headH = groups.some(g => g.name) ? 30 : 0;
    const needH = rows.length * rowH + groups.length * headH + 70;
    container.style.height = Math.max(needH, 200) + 'px';
    const fr = frame(container, { label: o.label, legend: o.legend, margin: { left: Math.min(250, Math.max(150, (container.clientWidth || 600) * 0.3)), right: 70, top: 8, bottom: 48 }, marginNarrow: { left: 128, right: 54 } });
    const vmax = Math.max(...rows.map(r => finite(r.hi) ? r.hi : r.value));
    const x = linear(o.xDomain || [0, nice(0, vmax, 5)[1]], [0, fr.w]);
    axisX(fr, x, { format: o.tickFormat || o.format, label: o.xLabel, grid: true });
    const fmt = o.format || (v => v);
    let cy = 0;
    groups.forEach(g => {
      if (g.name) { el('text', { class: 'dl2', x: -fr.m.left + 4, y: cy + 20, text: g.name, style: { fontWeight: 700, fill: 'var(--ink)' } }, fr.axes); cy += headH; }
      g.rows.forEach(r => {
        const bh = Math.min(24, rowH - 12), y0 = cy + (rowH - bh) / 2, x1 = Math.max(x(r.value), 3), rr = Math.min(4, x1 / 2);
        const d = `M0,${y0}H${x1 - rr}A${rr},${rr} 0 0 1 ${x1},${y0 + rr}V${y0 + bh - rr}A${rr},${rr} 0 0 1 ${x1 - rr},${y0 + bh}H0Z`;
        const bar = el('path', { d, style: { fill: r.color } }, fr.marks);
        if (r.pattern) bar.style.fillOpacity = 0.55;
        if (finite(r.lo) && finite(r.hi)) {
          const g2 = el('g', { style: { stroke: 'var(--ink)', strokeWidth: 1.5 } }, fr.marks);
          el('line', { x1: x(r.lo), x2: x(r.hi), y1: y0 + bh / 2, y2: y0 + bh / 2 }, g2);
          el('line', { x1: x(r.lo), x2: x(r.lo), y1: y0 + bh / 2 - 5, y2: y0 + bh / 2 + 5 }, g2);
          el('line', { x1: x(r.hi), x2: x(r.hi), y1: y0 + bh / 2 - 5, y2: y0 + bh / 2 + 5 }, g2);
        }
        const tx = Math.max(x1, finite(r.hi) ? x(r.hi) : 0) + 8;
        el('text', { class: 'dl', x: tx, y: y0 + bh / 2, dy: '0.34em', text: fmt(r.value) }, fr.top);
        const lab = el('text', { x: -12, y: y0 + bh / 2 - (r.sub ? 7 : 0), dy: '0.34em', 'text-anchor': 'end', text: r.label, style: { fill: 'var(--ink)', fontSize: '14px', fontWeight: 600 } }, fr.axes);
        if (r.sub && !fr.narrow) el('text', { x: -12, y: y0 + bh / 2 + 10, dy: '0.34em', 'text-anchor': 'end', text: r.sub, style: { fontSize: '12px' } }, fr.axes);
        const hit = el('rect', { class: 'hit', x: -fr.m.left, y: cy, width: fr.w + fr.m.left + fr.m.right, height: rowH, style: { cursor: 'default' } }, fr.top);
        hit.addEventListener('pointermove', ev => tip.show(`<div class="tt-h">${esc(r.label)}</div>${r.sub ? `<div>${esc(r.sub)}</div>` : ''}` + tip.row(r.color, o.valueLabel || 'Value', fmt(r.value)) + (finite(r.lo) ? tip.row(null, '95% CI', fmt(r.lo) + '–' + fmt(r.hi)) : '') + (r.note ? `<div style="margin-top:4px;color:var(--ink-2)">${esc(r.note)}</div>` : ''), ev.clientX, ev.clientY));
        hit.addEventListener('pointerleave', () => tip.hide());
        lab.setAttribute('aria-label', `${r.label}: ${fmt(r.value)}`);
        cy += rowH;
      });
    });
    (o.refs || []).forEach(rf => {
      const g = el('g', { class: 'ref' }, fr.marks);
      el('line', { x1: x(rf.x), x2: x(rf.x), y1: -4, y2: cy, style: { stroke: rf.color || 'var(--title)', strokeWidth: 2, strokeDasharray: '6 5' } }, g);
    });
  }

  // ---------- 100% stacked horizontal bars (fact check)
  // o: { rows: [{label, color, parts: [{key, label, value, color}]}], legend }
  function stackChart(container, o) {
    const rows = o.rows.filter(r => r.parts.some(p => finite(p.value)));
    const fr = frame(container, { legend: o.legend, label: o.label, margin: { left: o.left || 130, right: 16, top: 6, bottom: 40 }, marginNarrow: { left: 96 } });
    if (!rows.length) { html('div', 'empty', container, o.emptyText || 'Not available yet.'); return; }
    const x = linear([0, 1], [0, fr.w]);
    axisX(fr, x, { format: v => Math.round(v * 100) + '%', ticks: [0, .25, .5, .75, 1], grid: true });
    const rowH = Math.min(54, fr.h / rows.length), bh = Math.min(28, rowH - 12);
    rows.forEach((r, i) => {
      const y0 = i * rowH + (rowH - bh) / 2;
      const tot = r.parts.reduce((a, p) => a + (p.value || 0), 0) || 1;
      let acc = 0;
      r.parts.forEach(p => {
        const w = (p.value || 0) / tot;
        if (w <= 0) return;
        const x0 = x(acc) + (acc > 0 ? 1 : 0), x1 = x(acc + w) - (acc + w < 0.999 ? 1 : 0);
        el('rect', { x: x0, y: y0, width: Math.max(0, x1 - x0), height: bh, rx: 4, style: { fill: p.color } }, fr.marks);
        const label = Math.round(w * 100) + '%';
        if (x1 - x0 > label.length * 8 + 12) el('text', { x: x0 + 8, y: y0 + bh / 2, dy: '0.34em', text: label, style: { fill: p.ink || '#fff', fontSize: '13px', fontWeight: 700 } }, fr.top);
        const hit = el('rect', { class: 'hit', x: x0, y: y0 - 4, width: Math.max(0, x1 - x0), height: bh + 8, style: { cursor: 'default' } }, fr.top);
        hit.addEventListener('pointermove', ev => tip.show(`<div class="tt-h">${esc(r.label)}</div>` + tip.row(p.color, p.label, label), ev.clientX, ev.clientY));
        hit.addEventListener('pointerleave', () => tip.hide());
        acc += w;
      });
      if (r.color) el('circle', { cx: -fr.m.left + 10, cy: y0 + bh / 2, r: 5, style: { fill: r.color } }, fr.axes);
      el('text', { x: -12, y: y0 + bh / 2, dy: '0.34em', 'text-anchor': 'end', text: r.label, style: { fill: 'var(--ink)', fontSize: '14px', fontWeight: 600 } }, fr.axes);
    });
  }

  // ---------- scatter
  // o: { points: [{x, y, color, title, sub}], x: {domain, format, label}, y: {domain, format, label}, refs: [{y,label,color}], onClick }
  function scatter(container, o) {
    const fr = frame(container, { legend: o.legend, label: o.label, margin: { left: 60, right: 24 } });
    const pts = o.points.filter(p => finite(p.x) && finite(p.y));
    if (!pts.length) { html('div', 'empty', container, 'No data yet.'); return; }
    const x = linear(o.x.domain || nice(Math.min(...pts.map(p => p.x)), Math.max(...pts.map(p => p.x))), [0, fr.w]);
    const y = linear(o.y.domain || nice(Math.min(...pts.map(p => p.y)), Math.max(...pts.map(p => p.y))), [fr.h, 0]);
    axisY(fr, y, { format: o.y.format, label: o.y.label });
    axisX(fr, x, { format: o.x.format, label: o.x.label, grid: true });
    (o.refs || []).forEach(r => {
      if (!finite(r.y)) return;
      const g = el('g', { class: 'ref' }, fr.marks);
      el('line', { x1: 0, x2: fr.w, y1: y(r.y), y2: y(r.y), style: { stroke: r.color, strokeWidth: 2, strokeDasharray: '6 5' } }, g);
      el('text', { x: fr.w - 6, y: y(r.y) - 7, 'text-anchor': 'end', text: r.label }, g);
    });
    const r = pts.length > 600 ? 3.5 : 5;
    pts.forEach(p => { p._x = x(Math.min(Math.max(p.x, x.domain[0]), x.domain[1])); p._y = y(Math.min(Math.max(p.y, y.domain[0]), y.domain[1])); el('circle', { cx: p._x, cy: p._y, r, style: { fill: p.color, fillOpacity: 0.75, stroke: 'var(--surface)', strokeWidth: 1.2 } }, fr.marks); });
    const ring = el('circle', { r: r + 4, style: { fill: 'none', stroke: 'var(--ink)', strokeWidth: 2, visibility: 'hidden' } }, fr.top);
    const hit = el('rect', { class: 'hit', x: -10, y: -10, width: fr.w + 20, height: fr.h + 20 }, fr.top);
    let cur = null;
    hit.addEventListener('pointermove', ev => {
      const b = fr.svg.getBoundingClientRect(), s = fr.W / b.width;
      const px = (ev.clientX - b.left) * s - fr.m.left, py = (ev.clientY - b.top) * s - fr.m.top;
      let best = null, bd = 18 * 18;
      for (const p of pts) { const d = (p._x - px) ** 2 + (p._y - py) ** 2; if (d < bd) { bd = d; best = p; } }
      cur = best;
      if (!best) { ring.style.visibility = 'hidden'; tip.hide(); hit.style.cursor = 'crosshair'; return; }
      ring.setAttribute('cx', best._x); ring.setAttribute('cy', best._y); ring.style.visibility = 'visible';
      hit.style.cursor = o.onClick ? 'pointer' : 'crosshair';
      tip.show(`<div class="tt-h">${esc(best.title)}</div>${best.sub || ''}` + tip.row(best.color, o.x.label, (o.x.format || String)(best.x)) + tip.row(null, o.y.label, (o.y.format || String)(best.y)), ev.clientX, ev.clientY);
    });
    hit.addEventListener('pointerleave', () => { ring.style.visibility = 'hidden'; tip.hide(); });
    if (o.onClick) hit.addEventListener('click', () => cur && o.onClick(cur));
  }

  // ---------- redraw on resize
  const registry = new Map();
  function mount(container, draw) {
    if (!container) return;
    registry.set(container, { draw, w: container.clientWidth });
    draw();
  }
  let rt = null;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => registry.forEach((v, c) => { if (!c.isConnected) { registry.delete(c); return; } if (c.clientWidth !== v.w) { v.w = c.clientWidth; v.draw(); } }), 160);
  });

  // ---------- token heatmap (bits of surprise per token, one-hue sequential ramp)
  const HEAT_MAX = 12;
  const heatPct = b => Math.round(Math.pow(Math.min(Math.max(b, 0), HEAT_MAX) / HEAT_MAX, 0.75) * 100);
  const heatBg = p => `color-mix(in srgb, var(--heat) ${p}%, var(--surface))`;
  function heat(container, tokens, bits) {
    container.innerHTML = '';
    const frag = document.createDocumentFragment();
    tokens.forEach((t, i) => {
      const b = bits[i], s = document.createElement('span');
      s.className = 'tk'; s.textContent = t;
      if (finite(b)) {
        const p = heatPct(b);
        s.style.backgroundColor = heatBg(p);
        if (p > 58) s.classList.add('on-dark');
        s.dataset.b = b.toFixed(1);
      }
      frag.appendChild(s);
    });
    container.appendChild(frag);
    container.onpointermove = ev => {
      const s = ev.target.closest('.tk');
      if (!s || s.dataset.b == null) { tip.hide(); return; }
      const b = +s.dataset.b, odds = Math.pow(2, b);
      tip.show(`<div class="tt-h">“${esc(s.textContent.replace(/\n/g, '⏎'))}”</div>` + tip.row(null, 'Surprise', b.toFixed(1) + ' bits') +
        tip.row(null, 'Like guessing', odds < 1.5 ? 'almost certain' : '1 in ' + (odds < 1000 ? Math.round(odds) : Math.round(odds).toLocaleString('en-US'))), ev.clientX, ev.clientY);
    };
    container.onpointerleave = () => tip.hide();
  }
  function heatLegend(container) {
    if (!container) return;
    const steps = [0, 2, 4, 6, 8, 10, 12];
    container.innerHTML = '<span>Surprise per token:</span><span class="ramp">' + steps.map(b => {
      const p = heatPct(b);
      return `<span style="background:${heatBg(p)};color:${p > 58 ? '#fff' : 'var(--ink)'}">${b}${b === HEAT_MAX ? '+' : ''}</span>`;
    }).join('') + '</span><span>bits · 0 = already known, 10 = a 1‑in‑1,000 guess</span>';
  }

  // ---------- similarity gauge: one value against reference points on a 0..1 track
  // o: { value, color, label, refs: [{v, label, color}], domain }
  function gauge(container, o) {
    container.innerHTML = '';
    const W = Math.max(280, container.clientWidth || 500), H = 104, pad = 18;
    const vals = [o.value].concat((o.refs || []).map(r => r.v)).filter(finite);
    const d = o.domain || [Math.min(0.3, Math.floor(Math.min(...vals) * 10) / 10), 1];
    const x = linear(d, [pad, W - pad]);
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `${o.label}: ${finite(o.value) ? o.value.toFixed(3) : 'n/a'}` }, container);
    const ty = 52;
    el('line', { x1: x(d[0]), x2: x(d[1]), y1: ty, y2: ty, style: { stroke: 'var(--grid)', strokeWidth: 8, strokeLinecap: 'round' } }, svg);
    ticks(d[0], d[1], 5).forEach(v => el('text', { x: x(v), y: ty + 24, 'text-anchor': 'middle', text: v.toFixed(1), style: { fill: 'var(--muted)', fontSize: '11px' } }, svg));
    const refs = (o.refs || []).filter(r => finite(r.v)).sort((a, b) => a.v - b.v);
    let lastX = -1e9, row = 0;
    refs.forEach(r => {
      const px = x(r.v);
      row = px - lastX < 120 ? 1 - row : 0; lastX = px;
      const ly = row ? 12 : 28;
      el('line', { x1: px, x2: px, y1: ly + 4, y2: ty + 7, style: { stroke: r.color, strokeWidth: 2.5 } }, svg);
      el('text', { x: px, y: ly, 'text-anchor': px < 70 ? 'start' : px > W - 70 ? 'end' : 'middle', text: `${r.label} ${r.v.toFixed(2)}` }, svg);
    });
    if (finite(o.value)) {
      const px = x(Math.max(d[0], Math.min(d[1], o.value)));
      el('circle', { cx: px, cy: ty, r: 9, style: { fill: o.color, stroke: 'var(--surface)', strokeWidth: 3 } }, svg);
      el('text', { class: 'gl', x: px, y: ty + 46, 'text-anchor': px < 70 ? 'start' : px > W - 70 ? 'end' : 'middle', text: `${o.label} ${o.value.toFixed(2)}` }, svg);
    }
  }

  window.VZ = { el, html, esc, finite, linear, log, band, nice, ticks, tip, legend, frame, axisX, axisY, lineChart, histChart, barChart, stackChart, scatter, mount, heat, heatLegend, gauge };
})();
