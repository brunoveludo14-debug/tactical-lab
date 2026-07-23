/**
 * render.js — DOM rendering
 *
 * Reads from State and writes to the DOM.
 * Never mutates State directly.
 */

'use strict';

import { State, SHAPE_STYLES, SHAPE_NAMES, PITCH } from './state.js';

// ─── Coordinate helpers ───────────────────────────────────────────────────────

/** Convert viewBox coords → percentage */
export function vbPct(vx, vy, vw, vh) {
  return { x: (vx / vw) * 100, y: (vy / vh) * 100 };
}

/** Convert percentage → viewBox coords */
export function pctVb(px, py, vw, vh) {
  return { x: (px / 100) * vw, y: (py / 100) * vh };
}

/** Get cursor position as percentage of pitch element */
export function getPct(e, pitchId) {
  const r = document.getElementById(pitchId).getBoundingClientRect();
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: Math.max(0, Math.min(100, ((cx - r.left) / r.width)  * 100)),
    y: Math.max(0, Math.min(100, ((cy - r.top)  / r.height) * 100)),
  };
}

// ─── Player elements ──────────────────────────────────────────────────────────

/**
 * Create a player DOM element. Does NOT attach event listeners — the caller does.
 * @param {string} elId      — DOM id e.g. 'tp1'
 * @param {string|number} token — shirt number or label
 * @param {string} cls       — 'gk' | 'f' | 'opp' | 'opp-gk'
 * @param {string} name      — tooltip / label
 * @param {number} vx        — viewBox x
 * @param {number} vy        — viewBox y
 * @param {number} animIdx   — stagger delay index
 * @param {number} vw        — viewBox width
 * @param {number} vh        — viewBox height
 * @returns {HTMLElement}
 */
export function createPlayerEl(elId, token, cls, name, vx, vy, animIdx, vw, vh, angle = 0) {
  const el  = document.createElement('div');
  el.className = `pl pl-${cls}`;
  el.id = elId;
  const p   = vbPct(vx, vy, vw, vh);
  el.style.left = `${p.x}%`;
  el.style.top  = `${p.y}%`;
  el.style.setProperty('--pl-angle', `${angle}rad`);
  el.style.animationDelay = `${animIdx * 0.04}s`;
  el.style.animation = `scaleIn .3s ${animIdx * 0.04}s both`;
  el.innerHTML = `
    <div class="pl-cone" aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <defs>
          <radialGradient id="cone-grad-${elId}" cx="50%" cy="50%" r="50%">
            <stop offset="30%" stop-color="currentColor" stop-opacity="0"/>
            <stop offset="100%" stop-color="currentColor" stop-opacity="0.35"/>
          </radialGradient>
        </defs>
        <path d="M50,50 L25,6.7 A50,50 0 0,1 75,6.7 Z" fill="url(#cone-grad-${elId})" pointer-events="none"/>
      </svg>
      <div class="pl-rot-handle"></div>
    </div>
    <div class="pl-ring" aria-hidden="true"></div>
    <div class="pl-tok" aria-hidden="true">${token}</div>
    <div class="pl-nm">${name}</div>
    <div class="pl-dtap" aria-hidden="true">✦ arrastar</div>
  `;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `${name} — arrastar para mover`);
  el.setAttribute('tabindex', '0');
  return el;
}

/** Move a player DOM element to new percentage position */
export function movePlayerEl(elId, xPct, yPct) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.style.left = `${xPct}%`;
  el.style.top  = `${yPct}%`;
}

/** Mark / unmark a player as selected */
export function setPlayerSelected(elId, selected) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.classList.toggle('sel', selected);
}

/** Remove all player elements from a pitch */
export function clearPlayerEls(pitchId, excludeClasses = []) {
  const pitch = document.getElementById(pitchId);
  if (!pitch) return;
  const sel = excludeClasses.length
    ? `.pl:not(${excludeClasses.map(c => `.${c}`).join('):not(')})`
    : '.pl';
  pitch.querySelectorAll(sel).forEach(el => el.remove());
}

// ─── Shape SVG rendering ──────────────────────────────────────────────────────

function ns(tag) {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

function sa(el, attrs) {
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
}

/** Render all committed shapes for world 't'|'b'|'p' */
function resolvePts(points, w) {
  return points.map(p => {
    if (p.isPlayer) {
      let pObj = null;
      if (w === 't') pObj = State.players.find(x => x.id === p.id) || State.opp.find(x => x.id === p.id);
      else if (w === 'b') pObj = State.bPlayers.find(x => x.id === p.id);
      else pObj = State.pPlayers.find(x => x.id === p.id);
      if (pObj) return { x: pObj.x, y: pObj.y };
    }
    return p;
  });
}

export function renderShapes(w, overrideShapes = null) {
  const shapes   = overrideShapes || (w === 't' ? State.tShapes : w === 'b' ? State.bShapes : State.pShapes);
  const svgId    = w === 't' ? 'p-shapes'  : w === 'b' ? 'b-shapes'  : 'pb-shapes';
  const { id: pitchId, vw, vh } = PITCH[w];
  const svg = document.getElementById(svgId);
  if (!svg) return;
  svg.innerHTML = '';

  // Remove old floating labels for this world
  document.querySelectorAll(`.slbl[data-w="${w}"]`).forEach(l => l.remove());


  // Ghosting effect for previous keyframe
  if (w === 't' && State.activeKfIdx > 0 && State.keyframes && State.keyframes[State.activeKfIdx - 1]) {
    const prevKf = State.keyframes[State.activeKfIdx - 1];
    const drawGhost = (p, color) => {
      const px = (p.xp !== undefined ? p.xp : 0) * (vw / 100);
      const py = (p.yp !== undefined ? p.yp : 0) * (vh / 100);
      const ghost = ns('circle');
      sa(ghost, { cx: px, cy: py, r: '2.5', fill: color, opacity: '0.4' });
      svg.appendChild(ghost);
    };
    prevKf.players.forEach(p => drawGhost(p, '#3ddc84'));
    (prevKf.opp || []).forEach(p => drawGhost(p, '#ff6b4a'));
  }

  shapes.forEach(s => {
    // Ensure shape has a unique id
    if (!s.id) s.id = `sh-${w}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const rPts = resolvePts(s.points, w);

    if (s.type === 'polygon' || s.type === 'zone') {
      const el = ns('polygon');
      el.setAttribute('points', rPts.map(p => `${p.x},${p.y}`).join(' '));
      sa(el, { fill: s.fill, stroke: s.stroke, 'stroke-width': '0.4' });
      if (s.type === 'polygon') el.setAttribute('stroke-dasharray', '1.2 0.6');
      el.classList.add('shape-el');
      el.setAttribute('data-shape-id', s.id);
      el.style.cursor = 'pointer';
      el.addEventListener('click', e => { e.stopPropagation(); _onShapeClick(w, s.id); });
      svg.appendChild(el);
      if (!s.nl) {
        const cx = rPts.reduce((a, p) => a + p.x, 0) / rPts.length;
        const cy = rPts.reduce((a, p) => a + p.y, 0) / rPts.length;
        addLabel(s.label, cx, cy, s.stroke, w, pitchId, vw, vh, s.id);
      }
    } else if (s.type === 'arrow' && rPts.length >= 2) {
      // invisible wider click target
      const hitLine = ns('polyline');
      hitLine.setAttribute('points', rPts.map(p => `${p.x},${p.y}`).join(' '));
      sa(hitLine, { fill: 'none', stroke: 'transparent', 'stroke-width': '3', 'stroke-linecap': 'round' });
      hitLine.classList.add('shape-el');
      hitLine.setAttribute('data-shape-id', s.id);
      hitLine.style.cursor = 'pointer';
      hitLine.addEventListener('click', e => { e.stopPropagation(); _onShapeClick(w, s.id); });

      const line = ns('polyline');
      line.setAttribute('points', rPts.map(p => `${p.x},${p.y}`).join(' '));
      sa(line, { fill: 'none', stroke: s.stroke, 'stroke-width': '0.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      line.classList.add('shape-el');
      line.setAttribute('data-shape-id', s.id);
      svg.appendChild(line);
      svg.appendChild(hitLine);
      const last = rPts[rPts.length - 1];
      const prev = rPts[rPts.length - 2];
      const ang  = Math.atan2(last.y - prev.y, last.x - prev.x);
      const head = ns('polygon');
      const L    = 3.5;
      head.setAttribute('points', [
        `${last.x},${last.y}`,
        `${last.x - L * Math.cos(ang - 0.42)},${last.y - L * Math.sin(ang - 0.42)}`,
        `${last.x - L * Math.cos(ang + 0.42)},${last.y - L * Math.sin(ang + 0.42)}`
      ].join(' '));
      head.setAttribute('fill', s.stroke);
      head.classList.add('shape-el');
      head.setAttribute('data-shape-id', s.id);
      head.style.cursor = 'pointer';
      head.addEventListener('click', e => { e.stopPropagation(); _onShapeClick(w, s.id); });
      svg.appendChild(head);
      const mid = rPts[Math.floor(rPts.length / 2)];
      addLabel(s.label, mid.x, mid.y, s.stroke, w, pitchId, vw, vh, s.id);
    } else if (s.type === 'linked' && rPts.length >= 2) {
      const line = ns('polyline');
      line.setAttribute('points', rPts.map(p => `${p.x},${p.y}`).join(' '));
      sa(line, { fill: 'none', stroke: s.stroke, 'stroke-width': '0.7', 'stroke-dasharray': '0.8 1.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      line.classList.add('shape-el');
      line.setAttribute('data-shape-id', s.id);
      line.style.cursor = 'pointer';
      line.addEventListener('click', e => { e.stopPropagation(); _onShapeClick(w, s.id); });
      svg.appendChild(line);
    } else if (s.type === 'curve' && rPts.length >= 2) {
      const L = 3.5;
      const path = ns('path');
      path.classList.add('shape-el');
      let d = `M${rPts[0].x},${rPts[0].y} `;
      if (rPts.length === 2) {
        d += `L${rPts[1].x},${rPts[1].y}`;
      } else {
        d += `Q${rPts[1].x},${rPts[1].y} ${rPts[2].x},${rPts[2].y}`;
      }
      path.setAttribute('d', d);
      sa(path, { fill: 'none', stroke: s.stroke, 'stroke-width': '0.7', 'stroke-linecap': 'round' });
      path.setAttribute('data-shape-id', s.id);
      path.addEventListener('click', e => { e.stopPropagation(); _onShapeClick(w, s.id); });
      svg.appendChild(path);

      if (rPts.length === 3) {
        const last = rPts[2];
        const prev = rPts[1];
        const ang  = Math.atan2(last.y - prev.y, last.x - prev.x);
        const head = ns('polygon');
        head.setAttribute('points', [
          `${last.x},${last.y}`,
          `${last.x - L * Math.cos(ang - 0.42)},${last.y - L * Math.sin(ang - 0.42)}`,
          `${last.x - L * Math.cos(ang + 0.42)},${last.y - L * Math.sin(ang + 0.42)}`
        ].join(' '));
        head.setAttribute('fill', s.stroke);
        svg.appendChild(head);
      }
    } else if (s.type === 'ruler' && rPts.length === 2) {
      const [p1, p2] = rPts;
      const line = ns('line');
      sa(line, { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: s.stroke, 'stroke-width': '0.5', 'stroke-dasharray': '0.5 0.5' });
      svg.appendChild(line);
      
      const pitchObj = document.getElementById(pitchId);
      const realWidth = w === 't' ? 68 : 68;
      const realHeight = w === 'p' ? 52.5 : w === 'b' ? 38 : 105;
      const dxM = (p2.x - p1.x) * (realWidth / vw);
      const dyM = (p2.y - p1.y) * (realHeight / vh);
      const dist = Math.sqrt(dxM*dxM + dyM*dyM).toFixed(1);
      
      const cx = (p1.x + p2.x) / 2;
      const cy = (p1.y + p2.y) / 2;
      addLabel(`${dist}m`, cx, cy, s.stroke, w, pitchId, vw, vh, s.id);
    } else if (s.type === 'spotlight' && rPts.length >= 2) {
      const [center, edge] = rPts;
      const r = Math.sqrt(Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2));

      // Unique gradient for radial glow effect
      const gradId = `spl-grad-${s.id}`;
      const maskId = `mask-${s.id}`;

      const defs = ns('defs');

      // Radial gradient for soft edge on the spotlight
      const grad = ns('radialGradient');
      grad.id = gradId;
      sa(grad, { cx: center.x, cy: center.y, r: r, gradientUnits: 'userSpaceOnUse' });
      const stop1 = ns('stop');
      sa(stop1, { offset: '70%', 'stop-color': 'black', 'stop-opacity': '0' });
      const stop2 = ns('stop');
      sa(stop2, { offset: '100%', 'stop-color': 'black', 'stop-opacity': '0.55' });
      grad.appendChild(stop1);
      grad.appendChild(stop2);

      const mask = ns('mask');
      mask.id = maskId;
      const bg = ns('rect');
      sa(bg, { width: '100%', height: '100%', fill: 'white' });
      const hole = ns('circle');
      sa(hole, { cx: center.x, cy: center.y, r: r, fill: 'black' });
      mask.appendChild(bg);
      mask.appendChild(hole);
      defs.appendChild(grad);
      defs.appendChild(mask);
      svg.appendChild(defs);

      const overlay = ns('rect');
      sa(overlay, { width: '100%', height: '100%', fill: 'rgba(0,0,0,0.65)', mask: `url(#${maskId})` });
      overlay.setAttribute('data-shape-id', s.id);
      overlay.addEventListener('click', e => { e.stopPropagation(); _onShapeClick(w, s.id); });
      svg.appendChild(overlay);

      // Glowing ring border around spotlight area
      const ring = ns('circle');
      sa(ring, { cx: center.x, cy: center.y, r: r,
        fill: 'none', stroke: 'rgba(255,255,200,0.7)', 'stroke-width': '0.5',
        'stroke-dasharray': '2 1.5' });
      ring.setAttribute('data-shape-id', s.id);
      ring.addEventListener('click', e => { e.stopPropagation(); _onShapeClick(w, s.id); });
      svg.appendChild(ring);

      // Center crosshair dot
      const dot = ns('circle');
      sa(dot, { cx: center.x, cy: center.y, r: '0.8', fill: 'rgba(255,255,200,0.7)' });
      svg.appendChild(dot);
        } else if (s.type === 'dashed-arrow' && rPts.length >= 2) {
      const hitLine = ns('polyline');
      hitLine.setAttribute('points', rPts.map(p => `${p.x},${p.y}`).join(' '));
      sa(hitLine, { fill: 'none', stroke: 'transparent', 'stroke-width': '3', 'stroke-linecap': 'round' });
      hitLine.classList.add('shape-el');
      hitLine.setAttribute('data-shape-id', s.id);
      hitLine.style.cursor = 'pointer';
      hitLine.addEventListener('click', e => { e.stopPropagation(); _onShapeClick(w, s.id); });

      const line = ns('polyline');
      line.setAttribute('points', rPts.map(p => `${p.x},${p.y}`).join(' '));
      sa(line, { fill: 'none', stroke: s.stroke, 'stroke-width': '0.7', 'stroke-dasharray': '1 1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      line.classList.add('shape-el');
      line.setAttribute('data-shape-id', s.id);
      svg.appendChild(line);
      svg.appendChild(hitLine);
      const last = rPts[rPts.length - 1];
      const prev = rPts[rPts.length - 2];
      const ang  = Math.atan2(last.y - prev.y, last.x - prev.x);
      const head = ns('polygon');
      const L = 3.5;
      const W = 1.8;
      const p1 = { x: last.x - L*Math.cos(ang) + W*Math.sin(ang), y: last.y - L*Math.sin(ang) - W*Math.cos(ang) };
      const p2 = { x: last.x - L*Math.cos(ang) - W*Math.sin(ang), y: last.y - L*Math.sin(ang) + W*Math.cos(ang) };
      head.setAttribute('points', `${last.x},${last.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`);
      sa(head, { fill: s.stroke, stroke: 'none' });
      svg.appendChild(head);
    } else if (s.type === 'pencil' && rPts.length >= 2) {
      const path = ns('polyline');
      path.classList.add('shape-el');
      path.setAttribute('points', rPts.map(p => `${p.x},${p.y}`).join(' '));
      sa(path, { fill: 'none', stroke: s.stroke, 'stroke-width': '0.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      path.setAttribute('data-shape-id', s.id);
      path.addEventListener('click', e => { e.stopPropagation(); _onShapeClick(w, s.id); });
      svg.appendChild(path);
    } else if (s.type === 'text' && rPts.length >= 1) {
      addLabel(s.label, rPts[0].x, rPts[0].y, s.stroke, w, pitchId, vw, vh, s.id, 'text');
      const hit = ns('circle');
      sa(hit, { cx: rPts[0].x, cy: rPts[0].y, r: '5', fill: 'transparent', stroke: 'none' });
      hit.classList.add('shape-el');
      hit.setAttribute('data-shape-id', s.id);
      hit.style.cursor = 'pointer';
      hit.addEventListener('click', e => { e.stopPropagation(); _onShapeClick(w, s.id); });
      svg.appendChild(hit);
    }
  });
}

// Callback injected by app.js for shape selection
window._onShapeClick = (w, id) => {};

/** Render all three worlds */
export function renderAllShapes() {
  renderShapes('t');
  renderShapes('b');
  renderShapes('p');
}

/** Render in-progress drawing preview */
export function renderDrawPreview(w, mode, points, tempCol, tempThick) {
  const pId = w === 't' ? 'p-shapes'  : w === 'b' ? 'b-shapes'  : 'pb-shapes';
  const c = document.getElementById(pId);
  if (!c) return;
  const p = c.querySelector('.draw-preview');
  if (p) p.remove();
  if (!points || points.length === 0) return;

  const style = SHAPE_STYLES[mode] || SHAPE_STYLES.polygon;
  const col = tempCol || style.stroke;
  const fill = tempCol ? tempCol.replace(/[\d.]+\)$/, '0.15)') : style.fill;
  const thick = typeof tempThick !== 'undefined' ? tempThick : 0.6;
  const g = ns('g');
  g.setAttribute('class', 'draw-preview');
  g.setAttribute('opacity', '0.6');
  
  const rPts = resolvePts(points, w);
  if (mode === 'arrow' || mode === 'linked' || mode === 'ruler') {
    if (rPts.length >= 2) {
      const l = ns(mode === 'ruler' ? 'line' : 'polyline');
      if (mode === 'ruler') {
        const [p1, p2] = rPts;
        sa(l, { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: col, 'stroke-width': thick, 'stroke-dasharray': '0.5 0.5' });
      } else {
        l.setAttribute('points', rPts.map(p => `${p.x},${p.y}`).join(' '));
        sa(l, { fill: 'none', stroke: col, 'stroke-width': thick, 'stroke-dasharray': mode === 'linked'?'0.8 1.2':'', 'stroke-linecap': 'round' });
      }
      g.appendChild(l);
    }
    rPts.forEach((pt, i) => {
      const ci = ns('circle');
      sa(ci, { cx: pt.x, cy: pt.y, r: i ? '0.7' : '1', fill: col });
      g.appendChild(ci);
    });
  } else if (mode === 'curve') {
    if (rPts.length >= 2) {
      const path = ns('path');
      let d = `M${rPts[0].x},${rPts[0].y} `;
      if (rPts.length === 2) d += `L${rPts[1].x},${rPts[1].y}`;
      else d += `Q${rPts[1].x},${rPts[1].y} ${rPts[2].x},${rPts[2].y}`;
      path.setAttribute('d', d);
      sa(path, { fill: 'none', stroke: col, 'stroke-width': thick, 'stroke-linecap': 'round' });
      g.appendChild(path);
    }
    rPts.forEach((pt, i) => {
      const ci = ns('circle');
      sa(ci, { cx: pt.x, cy: pt.y, r: '0.7', fill: col });
      g.appendChild(ci);
    });
  } else if (mode === 'spotlight') {
    if (rPts.length >= 2) {
      const [center, edge] = rPts;
      const radius = Math.sqrt(Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2));
      const ci = ns('circle');
      sa(ci, { cx: center.x, cy: center.y, r: radius, fill: 'none', stroke: col, 'stroke-width': thick, 'stroke-dasharray': '1 1' });
      g.appendChild(ci);
    }
    rPts.forEach((pt, i) => {
      const ci = ns('circle');
      sa(ci, { cx: pt.x, cy: pt.y, r: '0.7', fill: col });
      g.appendChild(ci);
    });
  } else {
    if (rPts.length > 0) {
      const poly = ns('polygon');
      poly.setAttribute('points', rPts.map(p => `${p.x},${p.y}`).join(' '));
      sa(poly, { fill: fill, stroke: col, 'stroke-width': thick, 'stroke-dasharray': '1.2 0.6' });
      g.appendChild(poly);
    }
    rPts.forEach(pt => {
      const ci = ns('circle');
      sa(ci, { cx: pt.x, cy: pt.y, r: '0.7', fill: col });
      g.appendChild(ci);
    });
  }
  c.appendChild(g);
}

function addLabel(text, svgX, svgY, color, w, pitchId, vw, vh, shapeId = null, shapeType = null) {
  const pitch = document.getElementById(pitchId);
  if (!pitch) return;
  const r   = pitch.getBoundingClientRect();
  const lbl = document.createElement('div');
  lbl.className = 'slbl';
  lbl.dataset.w = w;
  if(shapeType) lbl.dataset.type = shapeType;
  if (shapeId) lbl.dataset.shapeId = shapeId;
  lbl.textContent = text;
  lbl.style.left = `${r.left + (svgX / vw) * r.width}px`;
  lbl.style.top  = `${r.top  + (svgY / vh) * r.height}px`;
  lbl.style.borderColor = color || 'rgba(255,255,255,.12)';
  document.getElementById('slyr').appendChild(lbl);
}


// ─── Notes list ───────────────────────────────────────────────────────────────

const TAG_COLORS = { tc: 'var(--acc)', bp: 'var(--yel)', ge: 'var(--blu)' };

/**
 * Render the notes sidebar list.
 * @param {function(id: number): void} onSelect — callback when a note is clicked
 */
export function renderNotesList(onSelect) {
  const el = document.getElementById('nl-items');
  if (!el) return;

  if (!State.notes.length) {
    el.innerHTML = '<div class="nl-empty">Sem notas.<br>Clica <strong>+</strong> para criar.</div>';
    return;
  }

  el.innerHTML = State.notes.map(n => {
    const dot   = `<span class="ni-dot" style="background:${TAG_COLORS[n.tag] || TAG_COLORS.ge}"></span>`;
    const title = `<div class="ni-title">${escHtml(n.title)}</div>`;
    const prev  = `<div class="ni-prev">${escHtml(n.body ? n.body.replace(/\n/g, ' ').slice(0, 46) + '…' : 'Nota vazia')}</div>`;
    const date  = `<div class="ni-date">${escHtml(n.date)}</div>`;
    const active = n.id === State.curNote ? ' active' : '';
    return `<div class="ni${active}" data-note-id="${n.id}" role="button" tabindex="0" aria-label="${escHtml(n.title)}">${dot}<div>${title}${prev}${date}</div></div>`;
  }).join('');

  el.querySelectorAll('.ni').forEach(item => {
    const id = Number(item.dataset.noteId);
    item.addEventListener('click', () => onSelect(id));
    item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') onSelect(id); });
  });
}

// ─── Save list ────────────────────────────────────────────────────────────────

/**
 * Render the save/load modal list.
 * @param {SaveEntry[]} saves
 * @param {function(id: number): void} onLoad
 * @param {function(id: number): void} onDelete
 */
export function renderSaveList(saves, onLoad, onDelete) {
  const el = document.getElementById('saves-list');
  if (!el) return;

  if (!saves.length) {
    el.innerHTML = '<div class="modal-empty">Nenhuma sessão guardada ainda.</div>';
    return;
  }

  el.innerHTML = saves.map(s => `
    <div class="sv-item" data-save-id="${s.id}">
      <div class="sv-info">
        <div class="sv-name">${escHtml(s.name)}</div>
        <div class="sv-meta">${escHtml(s.date)}</div>
      </div>
      <div class="sv-acts">
        <button class="sv-btn ld" data-action="load" aria-label="Carregar ${escHtml(s.name)}">Carregar</button>
        <button class="sv-btn dl" data-action="delete" aria-label="Eliminar ${escHtml(s.name)}">✕</button>
      </div>
    </div>
  `).join('');

  el.querySelectorAll('.sv-btn').forEach(btn => {
    const id     = Number(btn.closest('.sv-item').dataset.saveId);
    const action = btn.dataset.action;
    btn.addEventListener('click', () => action === 'load' ? onLoad(id) : onDelete(id));
  });
}

// ─── Toast ────────────────────────────────────────────────────────────────────

let toastTimer = null;


// ─── Utility ──────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
