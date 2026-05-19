/**
 * animation.js — Keyframe capture, playback, trail drawing, PNG export
 */

'use strict';

import { State, PITCH }          from './state.js';
import { pushHistory }           from './state.js';
import { vbPct, movePlayerEl, showToast, renderShapes } from './render.js';

// ─── Keyframe capture ─────────────────────────────────────────────────────────

/**
 * Capture current player + ball positions as a keyframe.
 * Positions are stored as DOM percentages so playback is layout-independent.
 */
export function captureKF() {
  const kf = {
    players: State.players.map(p => {
      const el = document.getElementById(`tp${p.id}`);
      return {
        id:  p.id,
        xp:  el ? parseFloat(el.style.left)  || 0 : (p.x / 68)  * 100,
        yp:  el ? parseFloat(el.style.top)   || 0 : (p.y / 105) * 100,
        ang: p.angle || 0
      };
    }),
    opp: State.opp.map(p => {
      const el = document.getElementById(`tp${p.id}`);
      return {
        id:  p.id,
        xp:  el ? parseFloat(el.style.left)  || 0 : (p.x / 68)  * 100,
        yp:  el ? parseFloat(el.style.top)   || 0 : (p.y / 105) * 100,
        ang: p.angle || 0
      };
    }),
    ball: (() => {
      const ball = document.getElementById('ball');
      return ball
        ? { x: parseFloat(ball.style.left) || 50, y: parseFloat(ball.style.top) || 50 }
        : null;
    })(),
    tShapes: JSON.parse(JSON.stringify(State.tShapes || [])),
    bShapes: JSON.parse(JSON.stringify(State.bShapes || [])),
    pShapes: JSON.parse(JSON.stringify(State.pShapes || []))
  };

  pushHistory();
  if (State.activeKfIdx != null && State.activeKfIdx >= 0 && State.activeKfIdx < State.keyframes.length) {
    State.keyframes[State.activeKfIdx] = kf;
    showToast(`Fotograma ${State.activeKfIdx + 1} atualizado`);
    // Deselect after updating
    State.activeKfIdx = null;
  } else {
    State.keyframes.push(kf);
    showToast(`Fotograma ${State.keyframes.length} gravado`);
  }

  // Clear shapes after capture so user can draw next phase (pro workflow)
  State.tShapes = [];
  State.bShapes = [];
  State.pShapes = [];
  renderShapes('t');
  renderShapes('b');
  renderShapes('p');

  document.getElementById('kf-count').textContent = State.keyframes.length;
  if (State.showTrails) drawTrails();
}

export function clearKF() {
  pushHistory();
  State.keyframes = [];
  document.getElementById('kf-count').textContent = '0';
  clearTrails();
  showToast('Fotogramas limpos');
}

// ─── Playback ─────────────────────────────────────────────────────────────────

let _kfAnimating = false;

export async function playKF() {
  if (State.keyframes.length < 2) {
    showToast('Precisa de 2+ fotogramas!');
    return;
  }
  if (_kfAnimating) return;
  _kfAnimating = true;
  State.kfAnimating = true;

  const btn  = document.getElementById('btn-play');
  const orig = btn.innerHTML;
  btn.classList.add('active');
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
    </svg>A animar…`;

  const duration = State.animSpeed || 800;
  const easing = State.keyframes.length > 2 ? 'linear' : 'ease-in-out';
  const transStr = `left ${duration}ms ${easing}, top ${duration}ms ${easing}`;

  document.querySelectorAll('#pitch .pl').forEach(el => {
    el.classList.add('kf-animating');
    el.style.transition = transStr;
  });
  const ball = document.getElementById('ball');
  if (ball) ball.style.transition = transStr;

  for (const kf of State.keyframes) {
    kf.players.forEach(kp => {
      const p  = State.players.find(x => x.id === kp.id);
      const el = document.getElementById(`tp${kp.id}`);
      if (p && el) {
        const xp = kp.xp !== undefined ? kp.xp : (p.x / 68) * 100;
        const yp = kp.yp !== undefined ? kp.yp : (p.y / 105) * 100;
        const ang = kp.ang !== undefined ? kp.ang : p.angle || 0;
        el.style.left = `${xp}%`;
        el.style.top  = `${yp}%`;
        el.style.setProperty('--pl-angle', `${ang}rad`);
        p.x = (xp / 100) * 68;
        p.y = (yp / 100) * 105;
        p.angle = ang;
      }
    });

    (kf.opp || []).forEach(kp => {
      const p  = State.opp.find(x => x.id === kp.id);
      const el = document.getElementById(`tp${kp.id}`);
      if (p && el) {
        const xp = kp.xp !== undefined ? kp.xp : (p.x / 68) * 100;
        const yp = kp.yp !== undefined ? kp.yp : (p.y / 105) * 100;
        const ang = kp.ang !== undefined ? kp.ang : p.angle || 0;
        el.style.left = `${xp}%`;
        el.style.top  = `${yp}%`;
        el.style.setProperty('--pl-angle', `${ang}rad`);
        p.x = (xp / 100) * 68;
        p.y = (yp / 100) * 105;
        p.angle = ang;
      }
    });

    if (kf.tShapes) renderShapes('t', kf.tShapes);
    if (kf.bShapes) renderShapes('b', kf.bShapes);
    if (kf.pShapes) renderShapes('p', kf.pShapes);

    // Apply CSS animations to shapes so they fade/draw in each frame
    document.querySelectorAll('.shape-el, .slbl').forEach(el => {
      if (el.tagName === 'polyline' && el.getAttribute('stroke-dasharray')) {
        // don't animate dotted linked lines aggressively
      } else if (el.tagName === 'polygon' && el.getAttribute('fill') !== 'none') {
        el.style.animation = 'none';
        el.offsetHeight; // trigger reflow
        el.style.animation = 'fadeInZone .6s cubic-bezier(.4,0,.2,1) forwards';
      } else {
        el.style.animation = 'none';
        el.offsetHeight;
        el.style.animation = 'fadeIn .3s forwards';
      }
    });

    if (kf.ball && ball) {
      ball.style.left = `${kf.ball.x}%`;
      ball.style.top  = `${kf.ball.y}%`;
    }

    await new Promise(r => setTimeout(r, duration));
  }

  document.querySelectorAll('#pitch .pl').forEach(el => {
    el.classList.remove('kf-animating');
    el.style.transition = '';
  });
  if (ball) ball.style.transition = '';
  
  // Restore original shapes
  renderShapes('t');
  renderShapes('b');
  renderShapes('p');
  
  _kfAnimating = false;
  State.kfAnimating = false;
  btn.classList.remove('active');
  btn.innerHTML = orig;
  if (State.showTrails) drawTrails();
  showToast('Animação concluída');
}

// ─── Trails ───────────────────────────────────────────────────────────────────

export function toggleTrails() {
  State.showTrails = !State.showTrails;
  document.getElementById('btn-trails').classList.toggle('active', State.showTrails);
  State.showTrails ? drawTrails() : clearTrails();
}

export function drawTrails() {
  const cv    = document.getElementById('trail-canvas');
  const pitch = document.getElementById('pitch');
  if (!cv || !pitch || State.keyframes.length < 2) return;

  const W = pitch.offsetWidth;
  const H = pitch.offsetHeight;
  cv.width  = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  /** Helper: get percentage coords from a keyframe point (supports both formats) */
  const getPct = (pos) => ({
    x: pos.xp !== undefined ? pos.xp : pos.x,
    y: pos.yp !== undefined ? pos.yp : pos.y,
  });

  const drawGroup = (players, getKfEntry, colorFn) => {
    players.forEach(pl => {
      const pts = State.keyframes.map(kf => getKfEntry(kf, pl.id)).filter(Boolean);
      if (pts.length < 2) return;
      const color = colorFn(pl);
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2;
      ctx.setLineDash([5, 4]);
      ctx.globalAlpha = 0.55;
      pts.forEach((pos, i) => {
        const pp = getPct(pos);
        const px = (pp.x / 100) * W;
        const py = (pp.y / 100) * H;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      
      // Draw Ghosts
      pts.forEach((pos, i) => {
        if (i === pts.length - 1) return; // Skip the last point, real player is here
        const pp = getPct(pos);
        const px = (pp.x / 100) * W;
        const py = (pp.y / 100) * H;
        ctx.beginPath();
        ctx.arc(px, py, 13, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.15 + (0.35 * (i / pts.length));
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.stroke();
        
        // Draw small direction indicator
        if (pos.ang !== undefined) {
           ctx.beginPath();
           ctx.moveTo(px, py);
           ctx.lineTo(px + 10 * Math.cos(pos.ang - Math.PI/2), py + 10 * Math.sin(pos.ang - Math.PI/2));
           ctx.strokeStyle = 'rgba(255,255,255,0.4)';
           ctx.stroke();
        }
        ctx.globalAlpha = 1;
      });

      const last = getPct(pts[pts.length - 1]);
      const prev = getPct(pts[pts.length - 2]);
      trailArrow(ctx, (prev.x / 100) * W, (prev.y / 100) * H, (last.x / 100) * W, (last.y / 100) * H, color);
    });
  };

  drawGroup(
    State.players,
    (kf, id) => kf.players.find(p => p.id === id),
    pl => pl.isGk ? '#5bbfff' : '#3ddc84'
  );
  drawGroup(
    State.opp,
    (kf, id) => (kf.opp || []).find(p => p.id === id),
    pl => pl.isGk ? '#ff9f1c' : '#ff6b4a'
  );

  // Ball trail
  const ballPts = State.keyframes.map(kf => kf.ball).filter(Boolean);
  if (ballPts.length >= 2) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([3, 4]);
    ctx.globalAlpha = 0.5;
    ballPts.forEach((pos, i) => {
      const px = (pos.x / 100) * W;
      const py = (pos.y / 100) * H;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}

function trailArrow(ctx, x1, y1, x2, y2, color) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const L = 12;
  ctx.save();
  ctx.fillStyle  = color;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - L * Math.cos(a - 0.38), y2 - L * Math.sin(a - 0.38));
  ctx.lineTo(x2 - L * Math.cos(a + 0.38), y2 - L * Math.sin(a + 0.38));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function clearTrails() {
  const cv = document.getElementById('trail-canvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
}

// ─── PNG Export ───────────────────────────────────────────────────────────────

export async function exportPNG(view) {
  const pitchId = view === 'box' ? 'box-pitch' : view === 'pbox' ? 'pbox-pitch' : 'pitch';
  const pitch   = document.getElementById(pitchId);
  if (!pitch) return;

  const r   = pitch.getBoundingClientRect();
  const W   = Math.round(r.width);
  const H   = Math.round(r.height);
  const DPR = window.devicePixelRatio || 1;

  const canvas = document.createElement('canvas');
  canvas.width  = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);

  // Background stripes
  for (let y = 0; y < H; y += 56) {
    ctx.fillStyle = '#0e2318'; ctx.fillRect(0, y, W, 28);
    ctx.fillStyle = '#0c1f15'; ctx.fillRect(0, y + 28, W, 28);
  }

  // Vignette
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // SVG layers
  const drawSVG = (svgEl) => new Promise(res => {
    const cl  = svgEl.cloneNode(true);
    cl.setAttribute('width', W);
    cl.setAttribute('height', H);
    const xml = new XMLSerializer().serializeToString(cl);
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload  = () => { ctx.drawImage(img, 0, 0, W, H); URL.revokeObjectURL(url); res(); };
    img.onerror = () => res();
    img.src = url;
  });

  const svgEls = Array.from(pitch.querySelectorAll('svg')).filter(s => !s.closest('#ball, .field-ball'));
  for (const svg of svgEls) await drawSVG(svg);

  // Players
  const vw = 68;
  const vh = 105;
  const allPlayers = view === 'tactic' ? [...State.players, ...State.opp]
                   : view === 'box' ? State.bPlayers
                   : State.pPlayers;

  allPlayers.forEach(p => {
    const px = (p.x / vw) * W;
    const py = (p.y / vh) * H;
    const isOpp = p.isOpp;
    ctx.beginPath();
    ctx.arc(px, py, 15, 0, Math.PI * 2);
    ctx.fillStyle   = p.isGk ? (isOpp ? '#ff9f1c' : '#5bbfff') : (isOpp ? '#ff6b4a' : '#3ddc84');
    ctx.shadowColor = ctx.fillStyle.replace(/[^,]+\)/, '.5)');
    ctx.shadowBlur  = 14;
    ctx.fill();
    ctx.shadowBlur  = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.3)';
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.fillStyle      = p.isGk ? (isOpp ? '#1a0800' : '#031222') : (isOpp ? '#1a0800' : '#031108');
    ctx.font           = 'bold 11px monospace';
    ctx.textAlign      = 'center';
    ctx.textBaseline   = 'middle';
    ctx.fillText(p.n, px, py);
  });

  // Ball
  const ballId = view === 'box' ? 'box-ball' : view === 'pbox' ? 'pbox-ball' : 'ball';
  const ball = document.getElementById(ballId);
  if (ball) {
    const br = ball.getBoundingClientRect();
    const pr = pitch.getBoundingClientRect();
    const bx = br.left + br.width  / 2 - pr.left;
    const by = br.top  + br.height / 2 - pr.top;
    ctx.beginPath();
    ctx.arc(bx, by, 11, 0, Math.PI * 2);
    ctx.fillStyle   = 'white';
    ctx.shadowColor = 'rgba(0,0,0,.5)';
    ctx.shadowBlur  = 8;
    ctx.fill();
    ctx.shadowBlur  = 0;
  }

  // Trails
  if (State.showTrails) {
    const cv = document.getElementById('trail-canvas');
    if (cv) ctx.drawImage(cv, 0, 0, W, H);
  }

  const link     = document.createElement('a');
  link.download  = `tactical-lab-${Date.now()}.png`;
  link.href      = canvas.toDataURL('image/png');
  link.click();
  showToast('PNG exportado!');
}
