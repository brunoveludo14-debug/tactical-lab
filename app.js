/**
 * app.js — Main application controller
 *
 * Wires all events, coordinates modules, implements business logic.
 * No inline onclick handlers — everything is addEventListener here.
 */

'use strict';

import {
  State, FMTS, PITCH, BPZ, SHAPE_STYLES, SHAPE_NAMES, HINTS,
  PNAMES, PNAMES_OPP, pushHistory, undo, redo, canUndo, canRedo, getHistoryCounts,
  buildSession, restoreSession,
  Club, loadClubConfig, saveClubConfig
} from './state.js';

import {
  vbPct, pctVb, getPct,
  createPlayerEl, movePlayerEl, setPlayerSelected, clearPlayerEls,
  renderShapes, renderAllShapes, renderDrawPreview,
  renderNotesList, renderSaveList, showToast
} from './render.js';

import {
  captureKF, clearKF, playKF, toggleTrails, drawTrails, clearTrails, exportPNG
} from './animation.js';

import {
  getSaves, saveSession, deleteSession, loadSession,
  scheduleAutosave, autosaveNow, restoreAutosave, hasAutosave,
  downloadSessionFile, importSessionFromFile
} from './storage.js';

import { initServiceWorker, initInstallPrompt, initOnlineStatus } from './pwa.js';
import { applyClubColors, applyLabelMode, getPlayerToken, openClubPanel, closeClubPanel, bindClubPanel } from './club.js';
import { getLibrary, savePlay, deletePlay, loadPlay, seedTemplates, buildShareURL, parseShareURL, exportLibrary, importLibrary } from './library.js';
import { openPlayerEditor, closePlayerEditor } from './player-editor.js';
import { openPlayerFit, getOverallScore, getPlayerRating } from './playerfit.js';

// ─── Shape counters (not in State — derived on restore) ───────────────────────
let tSC = 0, bSC = 0, pSC = 0;
let bpZoneId = null, bpBallId = null;

// ─── Drag state ───────────────────────────────────────────────────────────────
let DG            = null;   // active drag: { id, w, pfx, pitchId, vw, vh, list }
let ballDragging  = false;
let swipeReady    = null;   // { id, w, el }
let swipeDraw     = null;   // { id, w, startX, startY, pitchId, vw, vh, pfx }
let lastTapId     = null;
let lastTapTime   = 0;
let arrowDir      = null;

// ─── Initialisation ───────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadClubConfig();
  bindTopbar();
  bindToolbar();
  bindPitchEvents();
  bindDragEvents();
  bindModal();
  bindNotes();
  bindKeyboard();
  bindOrientation();
  bindOnboarding();
  bindLibrary();
  bindClubPanel(() => { applyLabelMode(State.players); });
  bindCustomConfirm();
  bindShapeActionBar();
  bindCustomFormations();

  initServiceWorker();
  initInstallPrompt();
  initOnlineStatus();

  // Seed templates on first run
  seedTemplates();

  // Restore custom formations from localStorage
  try {
    const cf = JSON.parse(localStorage.getItem('tl_custom_fmts') || '[]');
    State.customFmts = Array.isArray(cf) ? cf : [];
  } catch {}

  // Handle shared play URL
  const sharedPlay = parseShareURL();
  if (sharedPlay) {
    const err = restoreSession(sharedPlay.session);
    if (!err) { rebuildAllFromState(); showToast(`Jogada "${sharedPlay.name}" carregada`); location.hash=''; }
  }

  window.addEventListener('resize', () => {
    renderAllShapes();
    if (State.showTrails) drawTrails();
  });

  // Restore autosave if available (silently)
  if (hasAutosave()) {
    const err = restoreAutosave();
    if (!err) {
      rebuildAllFromState();
      showToast('Sessão anterior restaurada');
    }
  } else {
    // Start clean — no demo data, no default formation
    clearPlayerEls('pitch', ['pl-opp','pl-opp-gk']);
    State.players = [];
    State.fmt = '';
    State.tShapes = []; State.tDraw = [];
    State.opp = [];
    State.ball = { x: 50, y: 50 };
    const ballEl = document.getElementById('ball');
    if (ballEl) ballEl.style.left = '50%';
    if (ballEl) ballEl.style.top = '50%';
    document.getElementById('fsel').value = '';
    document.getElementById('ball')?.remove();
    renderShapes('t');
    renderNotesList(openNote);
  }

  // Wire shape click to select function
  window._onShapeClick = (w, id) => selectShape(w, id);

  // Global field ball drag handlers
  document.addEventListener('mousemove', e => {
    if (!_fieldBallDrag) return;
    const { ballId, pitchId, stateRef, stateKey, vw, vh } = _fieldBallDrag;
    const ball  = document.getElementById(ballId);
    const pitch = document.getElementById(pitchId);
    if (!ball || !pitch) return;
    const r = pitch.getBoundingClientRect();
    const xp = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    const yp = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
    ball.style.left = `${xp}%`;
    ball.style.top  = `${yp}%`;
    stateRef[stateKey] = { x: (xp / 100) * vw, y: (yp / 100) * vh };
  });
  document.addEventListener('mouseup', () => {
    if (!_fieldBallDrag) return;
    const ball = document.getElementById(_fieldBallDrag.ballId);
    if (ball) { ball.style.cursor = ''; ball.classList.remove('dragging'); }
    _fieldBallDrag = null;
    scheduleAutosave();
  });
  document.addEventListener('touchmove', e => {
    if (!_fieldBallDrag) return;
    const { ballId, pitchId, stateRef, stateKey, vw, vh } = _fieldBallDrag;
    const ball  = document.getElementById(ballId);
    const pitch = document.getElementById(pitchId);
    if (!ball || !pitch) return;
    const r = pitch.getBoundingClientRect();
    const t = e.touches[0];
    const xp = Math.max(0, Math.min(100, ((t.clientX - r.left) / r.width) * 100));
    const yp = Math.max(0, Math.min(100, ((t.clientY - r.top) / r.height) * 100));
    ball.style.left = `${xp}%`;
    ball.style.top  = `${yp}%`;
    stateRef[stateKey] = { x: (xp / 100) * vw, y: (yp / 100) * vh };
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (!_fieldBallDrag) return;
    const ball = document.getElementById(_fieldBallDrag.ballId);
    if (ball) { ball.style.cursor = ''; ball.classList.remove('dragging'); }
    _fieldBallDrag = null;
    scheduleAutosave();
  });

  applyOrientation();
  applyClubColors();
  updateAutosaveIndicator();
});

// ─── Custom Confirm Modal ─────────────────────────────────────────────────────

function bindCustomConfirm() {
  document.getElementById('cfm-cancel')?.addEventListener('click', () => {
    _confirmReject && _confirmReject(false);
    document.getElementById('confirm-overlay')?.classList.remove('open');
  });
  document.getElementById('cfm-confirm')?.addEventListener('click', () => {
    _confirmResolve && _confirmResolve(true);
    document.getElementById('confirm-overlay')?.classList.remove('open');
  });
  document.getElementById('confirm-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) {
      _confirmReject && _confirmReject(false);
      document.getElementById('confirm-overlay').classList.remove('open');
    }
  });
}

let _confirmResolve = null, _confirmReject = null;

function customConfirm(title, msg) {
  return new Promise((resolve, reject) => {
    _confirmResolve = resolve;
    _confirmReject  = reject;
    const titleEl = document.getElementById('cfm-title-el');
    const msgEl   = document.getElementById('cfm-msg-el');
    if (titleEl) titleEl.textContent = title;
    if (msgEl)   msgEl.textContent   = msg;
    document.getElementById('confirm-overlay')?.classList.add('open');
  });
}

// ─── Autosave indicator ───────────────────────────────────────────────────────

let _lastAutosaveTime = null;

function updateAutosaveIndicator() {
  const el = document.getElementById('autosave-indicator');
  if (!el) return;
  if (!_lastAutosaveTime) { el.textContent = ''; el.classList.remove('visible'); return; }
  const mins = Math.round((Date.now() - _lastAutosaveTime) / 60000);
  el.textContent = mins < 1 ? '✓ agora' : `✓ ${mins}min`;
  el.classList.add('visible');
  el.title = `Autosave: ${new Date(_lastAutosaveTime).toLocaleTimeString('pt-PT')}`;
}

// Patch scheduleAutosave to update indicator
const _origScheduleAutosave = scheduleAutosave;
const _patchedAutosave = () => {
  _origScheduleAutosave();
};

// Override autosaveNow via wrapper (update indicator after save)
function patchedAutosaveNow() {
  autosaveNow();
  _lastAutosaveTime = Date.now();
  updateAutosaveIndicator();
}

// Update indicator every 60s
setInterval(updateAutosaveIndicator, 60000);


// ─── Topbar ───────────────────────────────────────────────────────────────────

function bindTopbar() {
  document.querySelectorAll('.top-btn[data-v]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.v, btn));
  });
  document.getElementById('btn-library')?.addEventListener('click', openLibraryModal);
  document.getElementById('btn-club')?.addEventListener('click', openClubPanel);
  document.getElementById('btn-field-fs')?.addEventListener('click', () => {
    document.body.classList.toggle('field-fullscreen');
  });
}

function switchView(v, btn) {
  State.view = v;
  document.querySelectorAll('.top-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  document.querySelectorAll('.view').forEach(el => {
    if (el.classList.contains('active')) {
      el.classList.add('view-out');
      setTimeout(() => el.classList.remove('active', 'view-out'), 200);
    }
  });

  setTimeout(() => {
    const viewEl = document.getElementById(`view-${v}`);
    if (viewEl) viewEl.classList.add('active');

    const toolbar = document.getElementById('toolbar');
    toolbar.classList.toggle('tb-hidden', v === 'notes');

    const modeBar = document.getElementById('mode-bar');
    if (modeBar) modeBar.classList.remove('show');

    document.getElementById('fwrap')?.closest('.tg')?.classList.toggle('tg-hidden', v !== 'tactic');
    document.getElementById('fwrap-opp-tg')?.classList.toggle('tg-hidden', v !== 'tactic');

    setMode('none');
    closePlayerEditor();
  }, 210);
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

function bindToolbar() {
  // Formation selectors
  document.getElementById('fsel')?.addEventListener('change', e => {
    pushHistory();
    loadFormation(e.target.value);
  });
  document.getElementById('fsel-opp')?.addEventListener('change', e => {
    pushHistory();
    loadOppFormation(e.target.value);
  });

  // Mode: select/move
  document.getElementById('t-sel')?.addEventListener('click', () => setMode('none'));

  // Arrow directions
  ['right','left','up','down'].forEach(dir => {
    document.getElementById(`t-a${dir[0] === 'r' ? 'r' : dir[0] === 'l' ? 'l' : dir[0] === 'u' ? 'u' : 'd'}`)
      ?.addEventListener('click', function() { setArrowDir(dir, this); });
  });
  // More robust binding by data attribute
  document.querySelectorAll('[data-arrow-dir]').forEach(btn => {
    btn.addEventListener('click', function() { setArrowDir(this.dataset.arrowDir, this); });
  });

  // Shapes
  document.getElementById('t-poly')?.addEventListener('click', function() { setMode('polygon', this); });
  document.getElementById('t-zone')?.addEventListener('click', function() { setMode('zone', this); });
  document.getElementById('t-linked')?.addEventListener('click', function() { setMode('linked', this); });
  document.getElementById('t-ruler')?.addEventListener('click', function() { setMode('ruler', this); });
  document.getElementById('t-curve')?.addEventListener('click', function() { setMode('curve', this); });
  document.getElementById('t-spotlight')?.addEventListener('click', function() { setMode('spotlight', this); });

  // Edit actions
  document.getElementById('btn-undo')?.addEventListener('click', doUndo);
  document.getElementById('btn-redo')?.addEventListener('click', doRedo);
  document.getElementById('btn-clear')?.addEventListener('click', clearAllShapes);

  // Keyframes
  document.getElementById('btn-capture')?.addEventListener('click', () => {
    captureKF();
    renderTimeline();
  });
  document.getElementById('btn-play')?.addEventListener('click', () => {
    State.animSpeed = parseInt(document.getElementById('kf-speed')?.value || 800);
    playKF();
  });
  document.getElementById('btn-trails')?.addEventListener('click', toggleTrails);
  document.getElementById('btn-clear-kf')?.addEventListener('click', async () => {
    if (State.keyframes.length) {
      const ok = await customConfirm('Limpar fotogramas', 'Tens a certeza que queres eliminar todos os fotogramas?');
      if (!ok) return;
    }
    clearKF();
    renderTimeline();
  });
  document.getElementById('btn-export-gif')?.addEventListener('click', exportGIF);
  document.getElementById('btn-export-mp4')?.addEventListener('click', exportMP4);

  // Presentation Mode bindings
  document.getElementById('btn-present')?.addEventListener('click', togglePresentation);
  document.getElementById('btn-pres-exit')?.addEventListener('click', togglePresentation);
  document.getElementById('btn-pres-play')?.addEventListener('click', playKF);
  document.getElementById('btn-pres-prev')?.addEventListener('click', () => jumpPresFrame(-1));
  document.getElementById('btn-pres-next')?.addEventListener('click', () => jumpPresFrame(1));
  


  // Tactic Panel - collapse button hides panel
  document.getElementById('btn-tp-collapse')?.addEventListener('click', () => {
    const panel = document.getElementById('tactic-panel');
    panel?.classList.add('collapsed');
    document.getElementById('btn-toggle-plantel')?.classList.remove('active');
  });

  // Toolbar toggle button shows/hides plantel
  document.getElementById('btn-toggle-plantel')?.addEventListener('click', () => {
    const panel = document.getElementById('tactic-panel');
    if (panel) {
      panel.classList.toggle('collapsed');
      const isVisible = !panel.classList.contains('collapsed');
      document.getElementById('btn-toggle-plantel')?.classList.toggle('active', isVisible);
      if (isVisible) renderPlantel();
    }
  });

  // Mirror mode
  document.getElementById('btn-mirror')?.addEventListener('click', () => {
    State.mirrorMode = !State.mirrorMode;
    document.getElementById('btn-mirror')?.classList.toggle('active', State.mirrorMode);
    showToast(State.mirrorMode ? 'Modo espelho ativo' : 'Modo espelho desativo');
    // Re-render opponent in mirror mode
    if (State.fmtOpp) {
      const fmtOppName = State.fmtOpp;
      loadOppFormation(fmtOppName);
    }
  });

  // Speed slider — live label
  document.getElementById('kf-speed')?.addEventListener('input', e => {
    State.animSpeed = parseInt(e.target.value);
  });

  // Session
  document.getElementById('btn-save')?.addEventListener('click', openSaveModal);
  document.getElementById('btn-load')?.addEventListener('click', openLoadModal);
  document.getElementById('btn-export-png')?.addEventListener('click', () => exportPNG(State.view));
  document.getElementById('btn-export-json')?.addEventListener('click', () => downloadSessionFile());
  document.getElementById('btn-import-json')?.addEventListener('click', async () => {
    const err = await importSessionFromFile();
    if (err) { showToast(`Erro: ${err}`); return; }
    pushHistory();
    rebuildAllFromState();
    showToast('Sessão importada ✓');
  });

  // Mode-bar cancel
  document.getElementById('btn-mode-cancel')?.addEventListener('click', () => setMode('none'));

  // Cenários de Jogo panel
  document.getElementById('btn-save-box')?.addEventListener('click', openSaveModal);
  document.getElementById('btn-load-box')?.addEventListener('click', openLoadModal);
  document.getElementById('btn-add-att')?.addEventListener('click', () => addBoxPlayer('att'));
  document.getElementById('btn-add-def')?.addEventListener('click', () => addBoxPlayer('def'));
  document.getElementById('btn-add-gk')?.addEventListener('click',  () => addBoxPlayer('gk'));
  document.getElementById('btn-clear-box-pl')?.addEventListener('click', async () => {
    if (State.bPlayers.length) {
      const ok = await customConfirm('Remover jogadores', 'Remover todos os jogadores da grande área?');
      if (!ok) return;
    }
    clearBoxPlayers();
  });
  document.getElementById('btn-clear-box-shapes')?.addEventListener('click', clearBoxShapes);
  document.getElementById('btn-del-box-pl')?.addEventListener('click', () => deleteSelectedPlayer('b'));
  document.querySelectorAll('[data-bp-zone]').forEach(btn => {
    btn.addEventListener('click', function() { selectSetPiece(this, this.dataset.bpZone); });
  });

  // Bolas Paradas / Cenários panel
  document.getElementById('btn-save-scenario')?.addEventListener('click', openSaveModal);
  document.getElementById('btn-load-scenario')?.addEventListener('click', openLoadModal);
  document.getElementById('btn-pbox-att')?.addEventListener('click', () => addPboxPlayer('att'));
  document.getElementById('btn-pbox-def')?.addEventListener('click', () => addPboxPlayer('def'));
  document.getElementById('btn-pbox-gk')?.addEventListener('click',  () => addPboxPlayer('gk'));
  document.getElementById('btn-pbox-opp-att')?.addEventListener('click', () => addPboxPlayer('opp-att'));
  document.getElementById('btn-pbox-opp-def')?.addEventListener('click', () => addPboxPlayer('opp-def'));
  document.getElementById('btn-pbox-opp-gk')?.addEventListener('click',  () => addPboxPlayer('opp-gk'));
  document.getElementById('btn-clear-pbox-pl')?.addEventListener('click', async () => {
    if (State.pPlayers.length) {
      const ok = await customConfirm('Remover jogadores', 'Remover todos os jogadores do meio campo?');
      if (!ok) return;
    }
    clearPboxPlayers();
  });
  document.getElementById('btn-del-pbox-pl')?.addEventListener('click', () => deleteSelectedPlayer('p'));
  document.getElementById('btn-clear-pbox-shapes')?.addEventListener('click', clearPboxShapes);
}

// ─── Drawing mode ─────────────────────────────────────────────────────────────

function setMode(mode, triggerBtn = null) {
  State.mode   = mode;
  State.tDraw  = [];
  State.bDraw  = [];
  State.pDraw  = [];

  renderDrawPreview('t', mode, []);
  renderDrawPreview('b', mode, []);
  renderDrawPreview('p', mode, []);

  // Clear all toolbar active states and re-set
  document.querySelectorAll('.tb').forEach(b => b.classList.remove('active'));
  if (triggerBtn) triggerBtn.classList.add('active');
  else document.getElementById('t-sel')?.classList.add('active');

  // Update each pitch cursor and hint
  ['t','b','p'].forEach(w => {
    const { id: pitchId } = PITCH[w];
    const pitch = document.getElementById(pitchId);
    const hintEl = document.getElementById(w === 't' ? 'dhint' : w === 'b' ? 'b-hint' : 'pb-hint');
    const hintTxt = hintEl?.querySelector('[id$="-hint-txt"], .hint-txt');
    if (!pitch) return;
    if (mode !== 'none') {
      pitch.classList.add('xhair');
      hintEl?.classList.remove('hide');
      if (hintTxt) hintTxt.textContent = HINTS[mode] || '';
    } else {
      pitch.classList.remove('xhair');
      hintEl?.classList.add('hide');
    }
  });

  // Mode indicator bar
  const modeBar = document.getElementById('mode-bar');
  const modeBarTxt = document.getElementById('mode-bar-txt');
  if (modeBar) {
    modeBar.classList.toggle('show', mode !== 'none');
    if (modeBarTxt) {
      modeBarTxt.textContent = {
        polygon:      'Modo Polígono — clique para pontos · duplo-clique para fechar',
        zone:         'Modo Zona — clique pontos · duplo-clique para fechar',
        arrow:        'Modo Seta — clique pontos · duplo-clique para finalizar',
        linked:       'Modo Linha — clique nos jogadores · duplo-clique para fechar',
        ruler:        'Modo Régua — clique ponto A, depois clique ponto B para medir',
        curve:        'Modo Curva — clique início, ponto curva, duplo-clique fim',
        spotlight:    'Modo Foco — clique centro, depois clique no limite do foco',
        'arrow-simple': `Modo Seta ${arrowDir ? { right:'→', left:'←', up:'↑', down:'↓' }[arrowDir] : ''} — clique no campo`,
      }[mode] || '';
    }
  }
}

function setArrowDir(dir, btn) {
  if (arrowDir === dir) {
    arrowDir = null;
    setMode('none');
    return;
  }
  arrowDir = dir;
  setMode('arrow-simple', btn);
}

// ─── Pitch events ─────────────────────────────────────────────────────────────

function bindPitchEvents() {
  ['t','b','p'].forEach(w => {
    const { id } = PITCH[w];
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click',    e => pitchClick(e, w));
    el.addEventListener('dblclick', e => pitchDblClick(e, w));
  });
}

function pitchClick(e, w) {
  if (State.mode === 'none') {
    if (!e.target.closest('.pl') && e.target.id !== 'ball') {
      cancelSwipe();
      selectPlayer(w, null);
    }
    return;
  }

  if (State.mode === 'arrow-simple') {
    if (arrowDir) placeSimpleArrow(getPct(e, PITCH[w].id), w);
    return;
  }

  const { id: pitchId, vw, vh } = PITCH[w];
  const pct = getPct(e, pitchId);
  const pt  = pctVb(pct.x, pct.y, vw, vh);
  const drawArr = w === 't' ? State.tDraw : w === 'b' ? State.bDraw : State.pDraw;
  drawArr.push(pt);
  renderDrawPreview(w, State.mode, drawArr);

  // Ruler and Spotlight auto-commit after exactly 2 points (no dblclick needed)
  if ((State.mode === 'ruler' || State.mode === 'spotlight') && drawArr.length === 2) {
    pushHistory();
    commitShape(w, State.mode, [...drawArr]);
    if (w === 't') State.tDraw = [];
    else if (w === 'b') State.bDraw = [];
    else State.pDraw = [];
    renderDrawPreview(w, State.mode, []);
    setMode('none');
  }
}

function pitchDblClick(e, w) {
  if (State.mode === 'none') return;
  const drawArr = w === 't' ? State.tDraw : w === 'b' ? State.bDraw : State.pDraw;
  if (drawArr.length < 2) return;
  drawArr.pop(); // remove the point added by the click that triggered dblclick
  pushHistory();
  commitShape(w, State.mode, [...drawArr]);
  if (w === 't') State.tDraw = [];
  else if (w === 'b') State.bDraw = [];
  else State.pDraw = [];
  renderDrawPreview(w, State.mode, []);
  setMode('none');
}

function commitShape(w, type, points, overrides = {}) {
  const c   = SHAPE_STYLES[type] || SHAPE_STYLES.polygon;
  const cnt = w === 't' ? ++tSC : w === 'b' ? ++bSC : ++pSC;
  const sh  = {
    id:     `${w}s${cnt}`,
    type,
    points: [...points],
    fill:   overrides.fill   || c.fill,
    stroke: overrides.stroke || c.stroke,
    label:  overrides.label  || `${SHAPE_NAMES[type]} ${cnt}`,
    nl:     overrides.nl     || false,
    _bp:    overrides._bp    || false,
  };
  if (w === 't') State.tShapes.push(sh);
  else if (w === 'b') State.bShapes.push(sh);
  else State.pShapes.push(sh);
  renderShapes(w);
  scheduleAutosave();
}

function placeSimpleArrow(pct, w) {
  const { vw, vh } = PITCH[w];
  const cx   = (pct.x / 100) * vw;
  const cy   = (pct.y / 100) * vh;
  const len  = 7;
  const dirs = { right:{dx:len,dy:0}, left:{dx:-len,dy:0}, up:{dx:0,dy:-len}, down:{dx:0,dy:len} };
  const d    = dirs[arrowDir];
  if (!d) return;
  pushHistory();
  commitShape(w, 'arrow', [{ x: cx, y: cy }, { x: cx + d.dx, y: cy + d.dy }],
    { stroke: 'rgba(240,192,64,.95)' });
}

function clearAllShapes() {
  pushHistory();
  if (State.view === 'tactic') {
    State.tShapes = []; State.tDraw = [];
    clearPlayerEls('pitch', ['pl-opp','pl-opp-gk']);
    State.players = [];
    State.fmt = '';
    document.getElementById('ball')?.remove();
    State.ball = { x: 50, y: 50 };
    document.getElementById('fsel').value = '';
  } else if (State.view === 'box') {
    State.bShapes = State.bShapes.filter(s => s._bp); State.bDraw = [];
    clearPlayerEls('box-pitch', []);
    bpZoneId = null; bpBallId = null;
  } else {
    State.pShapes = []; State.pDraw = [];
    clearPlayerEls('pbox-pitch', []);
  }

  document.querySelectorAll(`.slbl[data-w="${State.view === 'box' ? 'b' : State.view === 'pbox' ? 'p' : 't'}"]`).forEach(l => l.remove());
  renderShapes(State.view === 'box' ? 'b' : State.view === 'pbox' ? 'p' : 't');
  setMode('none');
  scheduleAutosave();
}

// ─── Undo / Redo ──────────────────────────────────────────────────────────────

function doUndo() {
  if (!undo()) { showToast('Nada para desfazer'); return; }
  rebuildAllFromState();
  showToast('Desfeito');
}

function doRedo() {
  if (!redo()) { showToast('Nada para refazer'); return; }
  rebuildAllFromState();
  showToast('Refeito');
}

function updateUndoRedoBtns() {
  const counts = getHistoryCounts();
  const ub = document.getElementById('undo-badge');
  const rb = document.getElementById('redo-badge');
  if (ub) { ub.textContent = counts.past || ''; ub.style.opacity = counts.past > 0 ? 1 : 0; }
  if (rb) { rb.textContent = counts.future || ''; rb.style.opacity = counts.future > 0 ? 1 : 0; }
}
setInterval(updateUndoRedoBtns, 400);

// ─── Keyframe Timeline ────────────────────────────────────────────────────────

function renderTimeline() {
  const tl = document.getElementById('kf-timeline');
  if (!tl) return;
  const frames = State.keyframes;
  tl.classList.toggle('visible', frames.length > 0);
  tl.querySelectorAll('.kf-frame').forEach(f => f.remove());
  let dragSrcIdx = null;

  frames.forEach((kf, idx) => {
    const frame = document.createElement('div');
    frame.className = 'kf-frame';
    frame.setAttribute('role', 'listitem');
    frame.setAttribute('draggable', 'true');
    frame.setAttribute('aria-label', `Fotograma ${idx + 1}`);
    frame.title = `Frame ${idx + 1} — clique para editar, arraste para reordenar`;
    frame.dataset.kfIdx = idx;

    // ── Retina thumbnail ──
    const TW = 96, TH = 63;
    const cv = document.createElement('canvas');
    cv.width = TW * 2; cv.height = TH * 2;
    cv.style.width = TW + 'px'; cv.style.height = TH + 'px';
    const ctx = cv.getContext('2d');
    ctx.scale(2, 2);
    for (let y = 0; y < TH; y += 8) { ctx.fillStyle = Math.floor(y/8)%2===0?'#0e2318':'#0c1f15'; ctx.fillRect(0,y,TW,8); }
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = .6;
    ctx.strokeRect(4, 3, TW-8, TH-6);
    ctx.beginPath(); ctx.moveTo(4, TH/2); ctx.lineTo(TW-4, TH/2); ctx.stroke();
    ctx.beginPath(); ctx.arc(TW/2, TH/2, 8, 0, Math.PI*2); ctx.stroke();
    ctx.strokeRect(TW/2-16, 3, 32, 10); ctx.strokeRect(TW/2-16, TH-13, 32, 10);
    kf.players.forEach(p => {
      const px=(p.xp/100)*TW, py=(p.yp/100)*TH;
      ctx.beginPath(); ctx.arc(px,py,3.5,0,Math.PI*2);
      const t = State.players.find(x=>x.id===p.id);
      ctx.fillStyle = t?.isGk?'#5bbfff':'#3ddc84'; ctx.fill();
      ctx.fillStyle='#031108'; ctx.font='bold 4px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
      if(t) ctx.fillText(t.n,px,py);
    });
    (kf.opp||[]).forEach(p => {
      const px=(p.xp/100)*TW, py=(p.yp/100)*TH;
      ctx.beginPath(); ctx.arc(px,py,3.5,0,Math.PI*2); ctx.fillStyle='#ff6b4a'; ctx.fill();
    });
    if(kf.ball){ ctx.beginPath(); ctx.arc((kf.ball.x/100)*TW,(kf.ball.y/100)*TH,2.5,0,Math.PI*2); ctx.fillStyle='white'; ctx.fill(); }
    (kf.tShapes||[]).forEach(s => {
      if(s.points&&s.points.length>=2){ ctx.beginPath(); ctx.strokeStyle=s.stroke||'rgba(255,255,255,.4)'; ctx.lineWidth=.4;
        s.points.forEach((pt,i)=>{ const sx=(pt.x/68)*TW, sy=(pt.y/105)*TH; i===0?ctx.moveTo(sx,sy):ctx.lineTo(sx,sy); });
        if(s.type==='polygon'||s.type==='zone') ctx.closePath(); ctx.stroke(); }
    });
    frame.appendChild(cv);

    const num = document.createElement('span'); num.className='kf-frame-num'; num.textContent=idx+1; frame.appendChild(num);
    const del = document.createElement('span'); del.className='kf-frame-del'; del.textContent='✕'; del.title='Eliminar';
    del.addEventListener('click', e => { e.stopPropagation(); pushHistory(); State.keyframes.splice(idx,1);
      if(State.activeKfIdx===idx) State.activeKfIdx=null; else if(State.activeKfIdx!=null&&State.activeKfIdx>idx) State.activeKfIdx--;
      document.getElementById('kf-count').textContent=State.keyframes.length; renderTimeline(); showToast(`Frame ${idx+1} eliminado`); });
    frame.appendChild(del);

    // ── Drag-to-Reorder ──
    frame.addEventListener('dragstart', e => { dragSrcIdx=idx; frame.classList.add('kf-dragging'); e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',idx); });
    frame.addEventListener('dragend', () => { frame.classList.remove('kf-dragging'); tl.querySelectorAll('.kf-frame').forEach(f=>f.classList.remove('kf-drop-target')); dragSrcIdx=null; });
    frame.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect='move'; if(dragSrcIdx!==null&&dragSrcIdx!==idx) frame.classList.add('kf-drop-target'); });
    frame.addEventListener('dragleave', () => { frame.classList.remove('kf-drop-target'); });
    frame.addEventListener('drop', e => { e.preventDefault(); frame.classList.remove('kf-drop-target');
      if(dragSrcIdx===null||dragSrcIdx===idx) return; pushHistory();
      const moved=State.keyframes.splice(dragSrcIdx,1)[0]; State.keyframes.splice(idx,0,moved); State.activeKfIdx=null;
      renderTimeline(); showToast(`Frame movido para posição ${idx+1}`); });

    // ── Click to Restore ──
    frame.addEventListener('click', () => {
      if(State.kfAnimating) return;
      if(frame.classList.contains('kf-active')){ frame.classList.remove('kf-active'); State.activeKfIdx=null; showToast(`Frame ${idx+1} deseleccionado`); return; }
      pushHistory();
      kf.players.forEach(kp => { const p=State.players.find(x=>x.id===kp.id), el=document.getElementById(`tp${kp.id}`);
        if(p&&el){ const xp=kp.xp!==undefined?kp.xp:(p.x/68)*100, yp=kp.yp!==undefined?kp.yp:(p.y/105)*100, ang=kp.ang||0;
          el.style.left=`${xp}%`; el.style.top=`${yp}%`; el.style.setProperty('--pl-angle',`${ang}rad`); p.x=(xp/100)*68; p.y=(yp/100)*105; p.angle=ang; }});
      (kf.opp||[]).forEach(kp => { const p=State.opp.find(x=>x.id===kp.id), el=document.getElementById(`tp${kp.id}`);
        if(p&&el){ const xp=kp.xp!==undefined?kp.xp:(p.x/68)*100, yp=kp.yp!==undefined?kp.yp:(p.y/105)*100, ang=kp.ang||0;
          el.style.left=`${xp}%`; el.style.top=`${yp}%`; el.style.setProperty('--pl-angle',`${ang}rad`); p.x=(xp/100)*68; p.y=(yp/100)*105; p.angle=ang; }});
      if(kf.ball){ const ball=document.getElementById('ball'); if(ball){ ball.style.left=`${kf.ball.x}%`; ball.style.top=`${kf.ball.y}%`; if(!State.ball) State.ball={x:50,y:50}; State.ball.x=kf.ball.x; State.ball.y=kf.ball.y; }}
      State.tShapes=kf.tShapes?JSON.parse(JSON.stringify(kf.tShapes)):[]; State.bShapes=kf.bShapes?JSON.parse(JSON.stringify(kf.bShapes)):[]; State.pShapes=kf.pShapes?JSON.parse(JSON.stringify(kf.pShapes)):[];
      window.dispatchEvent(new Event('tl-rebuild'));
      tl.querySelectorAll('.kf-frame').forEach(f=>f.classList.remove('kf-active')); frame.classList.add('kf-active'); State.activeKfIdx=idx;
      showToast(`Editando Frame ${idx+1}`);
    });
    tl.appendChild(frame);
  });
}

// ─── Formation loading ────────────────────────────────────────────────────────

function loadFormation(name) {
  const pts = FMTS[name];
  if (!pts) return;
  State.fmt     = name;
  State.players = pts.map((d, i) => ({ id: i + 1, x: d.x, y: d.y, n: d.n, name: PNAMES[i], isGk: i === 0 }));

  clearPlayerEls('pitch', ['pl-opp','pl-opp-gk']);
  State.players.forEach((pl, i) => {
    const el = createPlayerEl(`tp${pl.id}`, pl.n, pl.isGk ? 'gk' : 'f', pl.name, pl.x, pl.y, i, 68, 105);
    attachPlayerEvents(el, pl.id, 't', 'pitch', 68, 105);
    document.getElementById('pitch').appendChild(el);
  });

  selectPlayer('t', null);
  document.getElementById('fsel').value = name;
  applyClubColors();
  scheduleAutosave();
}

function loadOppFormation(name) {
  State.fmtOpp = name;
  document.querySelectorAll('#pitch .pl-opp, #pitch .pl-opp-gk').forEach(e => e.remove());
  State.opp = [];
  if (!name) return;

  const pts = FMTS[name];
  if (!pts) return;

  // mirrorMode: show opponent from same side (not mirrored)
  State.opp = pts.map((d, i) => ({
    id: `o${i + 1}`,
    x: d.x,
    y: State.mirrorMode ? d.y : 105 - d.y,
    n: d.n, name: PNAMES_OPP[i], isGk: i === 0, isOpp: true
  }));

  State.opp.forEach((pl, i) => {
    const el = createPlayerEl(`tp${pl.id}`, pl.n, pl.isGk ? 'opp-gk' : 'opp', pl.name, pl.x, pl.y, i, 68, 105);
    attachPlayerEvents(el, pl.id, 't', 'pitch', 68, 105);
    document.getElementById('pitch').appendChild(el);
  });

  selectPlayer('t', null);
  scheduleAutosave();
}

function clearOpp() {
  pushHistory();
  document.querySelectorAll('#pitch .pl-opp, #pitch .pl-opp-gk').forEach(e => e.remove());
  State.opp   = [];
  State.fmtOpp = '';
  document.getElementById('fsel-opp').value = '';
  scheduleAutosave();
}

// ─── Ball ─────────────────────────────────────────────────────────────────────

function spawnBall() {
  document.getElementById('ball')?.remove();
  const el  = document.createElement('div');
  el.id = 'ball';
  el.setAttribute('aria-label', 'Bola — arrastar para mover');
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  const p   = vbPct(34, 52.5, 68, 105);
  el.style.cssText = `left:${p.x}%;top:${p.y}%;position:absolute;transform:translate(-50%,-50%);z-index:9;cursor:grab;`;
  el.innerHTML = `
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"
         style="filter:drop-shadow(0 3px 8px rgba(0,0,0,.7))">
      <defs>
        <radialGradient id="bg1" cx="38%" cy="32%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="65%" stop-color="#f0f0f0"/>
          <stop offset="100%" stop-color="#c8c8c8"/>
        </radialGradient>
      </defs>
      <circle cx="14" cy="14" r="13" fill="url(#bg1)" stroke="rgba(0,0,0,.18)" stroke-width=".5"/>
      <!-- UCL navy panels -->
      <polygon points="14,2.5 17.5,7.5 14,10.5 10.5,7.5" fill="#1a1f70" opacity=".9"/>
      <polygon points="24,8.5 21.5,13.5 18,12 17.5,7.5" fill="#1a1f70" opacity=".9"/>
      <polygon points="22,21.5 17.5,23 16,18.5 19.5,15.5" fill="#1a1f70" opacity=".9"/>
      <polygon points="6,21.5 8.5,15.5 12,18.5 10.5,23" fill="#1a1f70" opacity=".9"/>
      <polygon points="4,8.5 10.5,7.5 10,12 6.5,13.5" fill="#1a1f70" opacity=".9"/>
      <polygon points="14,10.5 17.5,13.5 15,17 13,17 10.5,13.5" fill="#1a1f70" opacity=".55"/>
      <!-- Gold UCL star accent -->
      <path d="M14,3.5 l.6,1.8h1.9l-1.5,1.1.6,1.8L14,7.2l-1.6 1 .6-1.8L11.5,5.3h1.9z" fill="#f0c040" opacity=".85"/>
      <!-- Shine -->
      <ellipse cx="10" cy="9" rx="3.2" ry="1.6" fill="white" opacity=".25" transform="rotate(-35 10 9)"/>
    </svg>`;

  el.addEventListener('mousedown', startBallDrag);
  el.addEventListener('touchstart', startBallDrag, { passive: false });
  document.getElementById('pitch').appendChild(el);

  State.ball = { x: p.x, y: p.y };
}

function startBallDrag(e) {
  e.stopPropagation();
  e.preventDefault();
  ballDragging = true;
  const ball = document.getElementById('ball');
  if (ball) { ball.style.cursor = 'grabbing'; ball.style.transition = 'none'; }
}

// ─── Player events ────────────────────────────────────────────────────────────

function attachPlayerEvents(el, playerId, w, pitchId, vw, vh) {
  el.addEventListener('mousedown', e => startPlayerDrag(e, playerId, w, pitchId, vw, vh));
  el.addEventListener('touchstart', e => startPlayerDrag(e, playerId, w, pitchId, vw, vh), { passive: false });
  const handle = el.querySelector('.pl-rot-handle');
  if (handle) {
    handle.addEventListener('mousedown', e => startPlayerRotate(e, playerId, w, pitchId, vw, vh));
    handle.addEventListener('touchstart', e => startPlayerRotate(e, playerId, w, pitchId, vw, vh), { passive: false });
  }
  el.addEventListener('click', e => {
    e.stopPropagation();
    if (State.mode === 'linked') {
      if (e.detail >= 2) {
         pitchDblClick(e, w);
         return;
      }
      const drawArr = w === 't' ? State.tDraw : w === 'b' ? State.bDraw : State.pDraw;
      drawArr.push({ isPlayer: true, id: playerId });
      renderDrawPreview(w, State.mode, drawArr);
      return;
    }
    if (State.mode !== 'none') return;
    const isOpp = String(playerId).startsWith('o');
    if (e.detail >= 3) {
      // Triple-click → open player label editor (team + opp players)
      openPlayerEditor(playerId, el);
      return;
    }
    if (e.detail >= 2) {
      // Double-click → enter swipe-arrow mode
      closePlayerEditor();
      enterSwipe(playerId, w, el);
      return;
    }
    if (swipeReady && swipeReady.id === playerId && swipeReady.w === w) return;
    if (swipeReady) cancelSwipe();
    closePlayerEditor();
    selectPlayer(w, playerId);
  });
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (swipeReady && swipeReady.id === playerId && swipeReady.w === w) cancelSwipe();
      else selectPlayer(w, playerId);
    }
  });
}

// ─── Drag system ──────────────────────────────────────────────────────────────

function bindDragEvents() {
  window.addEventListener('mousemove', onDrag);
  window.addEventListener('mouseup',   endDrag);
  window.addEventListener('touchmove', onDrag, { passive: false });
  window.addEventListener('touchend',  endDrag);
}

function startPlayerDrag(e, id, w, pitchId, vw, vh) {
  if (State.mode !== 'none') return;
  e.stopPropagation();
  e.preventDefault();

  const pfx  = w === 't' ? 'tp' : w === 'p' ? 'pb' : 'bp';
  const el   = document.getElementById(pfx + id);

  // Touch: detect double-tap
  const now = Date.now();
  const isDoubleTap = e.touches && lastTapId === pfx + id && (now - lastTapTime) < 380;
  if (e.touches) { lastTapId = pfx + id; lastTapTime = now; }

  if (isDoubleTap) {
    enterSwipe(id, w, el);
    return;
  }

  // If in swipe-ready mode for this player → start swipe draw
  if (swipeReady && swipeReady.id === id && swipeReady.w === w) {
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    const r  = document.getElementById(pitchId).getBoundingClientRect();
    const px = Math.max(0, Math.min(100, ((cx - r.left) / r.width)  * 100));
    const py = Math.max(0, Math.min(100, ((cy - r.top)  / r.height) * 100));
    swipeDraw = { id, w, pitchId, vw, vh, pfx, startX: px, startY: py };
    el?.classList.add('drag');
    return;
  }

  // Normal drag
  const list = w === 't' ? (id.toString().startsWith('o') ? State.opp : State.players)
             : w === 'p' ? State.pPlayers
             : State.bPlayers;
  DG = { id, w, pfx, pitchId, vw, vh, list };
  el?.classList.add('drag');
}

let ROT_DG = null;

function startPlayerRotate(e, id, w, pitchId, vw, vh) {
  e.stopPropagation();
  e.preventDefault();
  const pfx  = w === 't' ? 'tp' : w === 'p' ? 'pb' : 'bp';
  const list = w === 't' ? (id.toString().startsWith('o') ? State.opp : State.players)
             : w === 'p' ? State.pPlayers
             : State.bPlayers;
  ROT_DG = { id, w, pfx, list, pitchId, vw, vh };
}

function onDrag(e) {
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;

  // Real-time draw preview
  if (State.mode !== 'none' && !DG && !ballDragging && !ROT_DG && !swipeDraw) {
    const w = State.view === 'box' ? 'b' : State.view === 'pbox' ? 'p' : 't';
    const drawArr = w === 't' ? State.tDraw : w === 'b' ? State.bDraw : State.pDraw;
    if (drawArr.length > 0) {
      const { id: pitchId, vw, vh } = PITCH[w];
      const pitchEl = document.getElementById(pitchId);
      if (pitchEl) {
        const r  = pitchEl.getBoundingClientRect();
        const px = Math.max(0, Math.min(100, ((cx - r.left) / r.width)  * 100));
        const py = Math.max(0, Math.min(100, ((cy - r.top)  / r.height) * 100));
        renderDrawPreview(w, State.mode, [...drawArr, pctVb(px, py, vw, vh)]);
      }
    }
  }

  if (ROT_DG) {
    const el = document.getElementById(ROT_DG.pfx + ROT_DG.id);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let angle = Math.atan2(cy - centerY, cx - centerX) + Math.PI / 2;
    const p  = ROT_DG.list.find(x => x.id === ROT_DG.id);
    if (p) {
      p.angle = angle;
      el.style.setProperty('--pl-angle', `${angle}rad`);
    }
    return;
  }

  if (ballDragging) {
    const r  = document.getElementById('pitch').getBoundingClientRect();
    const px = Math.max(0, Math.min(100, ((cx - r.left) / r.width)  * 100));
    const py = Math.max(0, Math.min(100, ((cy - r.top)  / r.height) * 100));
    const ball = document.getElementById('ball');
    if (ball) { ball.style.left = `${px}%`; ball.style.top = `${py}%`; }
    State.ball = { x: px, y: py };
    return;
  }

  if (swipeDraw) {
    const r  = document.getElementById(swipeDraw.pitchId).getBoundingClientRect();
    const px = Math.max(0, Math.min(100, ((cx - r.left) / r.width)  * 100));
    const py = Math.max(0, Math.min(100, ((cy - r.top)  / r.height) * 100));
    drawSwipePreview(swipeDraw.startX, swipeDraw.startY, px, py);
    return;
  }

  if (!DG) return;
  const r  = document.getElementById(DG.pitchId).getBoundingClientRect();
  const px = Math.max(0, Math.min(100, ((cx - r.left) / r.width)  * 100));
  const py = Math.max(0, Math.min(100, ((cy - r.top)  / r.height) * 100));
  const vb = pctVb(px, py, DG.vw, DG.vh);
  const p  = DG.list.find(x => x.id === DG.id);
  if (p) {
    p.x = vb.x; p.y = vb.y;
    const el = document.getElementById(DG.pfx + DG.id);
    if (el) { el.style.left = `${px}%`; el.style.top = `${py}%`; }
  }
}

function endDrag(e) {
  if (ROT_DG) {
    ROT_DG = null;
    scheduleAutosave();
    return;
  }
  if (ballDragging) {
    ballDragging = false;
    const ball = document.getElementById('ball');
    if (ball) { ball.style.cursor = 'grab'; ball.style.transition = ''; }
    scheduleAutosave();
  }

  if (swipeDraw) {
    const cx = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const cy = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    const r  = document.getElementById(swipeDraw.pitchId).getBoundingClientRect();
    const ex = Math.max(0, Math.min(100, ((cx - r.left) / r.width)  * 100));
    const ey = Math.max(0, Math.min(100, ((cy - r.top)  / r.height) * 100));
    const dx = ex - swipeDraw.startX;
    const dy = ey - swipeDraw.startY;
    if (Math.sqrt(dx * dx + dy * dy) > 3) {
      const s = pctVb(swipeDraw.startX, swipeDraw.startY, swipeDraw.vw, swipeDraw.vh);
      const t = pctVb(ex, ey, swipeDraw.vw, swipeDraw.vh);
      pushHistory();
      commitShape(swipeDraw.w, 'arrow', [{ x: s.x, y: s.y }, { x: t.x, y: t.y }],
        { stroke: 'rgba(240,192,64,.95)' });
    }
    const el = document.getElementById(swipeDraw.pfx + swipeDraw.id);
    if (el) el.classList.remove('drag');
    swipeDraw = null;
    cancelSwipe();
    clearSwipeCanvas();
    return;
  }

  if (DG) {
    const el = document.getElementById(DG.pfx + DG.id);
    if (el) el.classList.remove('drag');
    DG = null;
    scheduleAutosave();
  }
}

// ─── Swipe-arrow mode ─────────────────────────────────────────────────────────

function enterSwipe(id, w, el) {
  if (swipeReady) {
    const prevEl = document.getElementById(
      (swipeReady.w === 't' ? (String(swipeReady.id).startsWith('o') ? 'opp' : 'tp') : swipeReady.w === 'p' ? 'pb' : 'bp')
      + swipeReady.id
    );
    if (prevEl) prevEl.classList.remove('swipe-ready');
  }
  swipeReady = { id, w, el };
  el?.classList.add('swipe-ready');
}

function cancelSwipe() {
  if (!swipeReady) return;
  const pfx = swipeReady.w === 't'
    ? (String(swipeReady.id).startsWith('o') ? 'opp' : 'tp')
    : swipeReady.w === 'p' ? 'pb' : 'bp';
  const el = document.getElementById(pfx + swipeReady.id);
  if (el) el.classList.remove('swipe-ready');
  swipeReady = null;
}

function clearSwipeCanvas() {
  const cv    = document.getElementById('swipe-canvas');
  const pitch = document.getElementById('pitch');
  if (!cv || !pitch) return;
  cv.width  = pitch.offsetWidth;
  cv.height = pitch.offsetHeight;
  cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
}

function drawSwipePreview(x1pct, y1pct, x2pct, y2pct) {
  const cv    = document.getElementById('swipe-canvas');
  const pitch = document.getElementById('pitch');
  if (!cv || !pitch) return;
  cv.width  = pitch.offsetWidth;
  cv.height = pitch.offsetHeight;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  const x1 = (x1pct / 100) * cv.width,  y1 = (y1pct / 100) * cv.height;
  const x2 = (x2pct / 100) * cv.width,  y2 = (y2pct / 100) * cv.height;
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 5) return;
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const AL  = 14;
  ctx.save();
  ctx.strokeStyle = 'rgba(240,192,64,.9)';
  ctx.lineWidth   = 2.5;
  ctx.setLineDash([8, 5]);
  ctx.lineCap     = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(240,192,64,.95)';
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - AL * Math.cos(ang - 0.42), y2 - AL * Math.sin(ang - 0.42));
  ctx.lineTo(x2 - AL * Math.cos(ang + 0.42), y2 - AL * Math.sin(ang + 0.42));
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ─── Player selection ─────────────────────────────────────────────────────────

function selectPlayer(w, id) {
  // Clear previous selection
  const prev = w === 't' ? State.tSel : w === 'b' ? State.bSel : State.pbSel;
  if (prev !== null) {
    ['tp','opp','bp','pb'].forEach(pfx => {
      const el = document.getElementById(pfx + prev);
      if (el) el.classList.remove('sel');
    });
  }

  if (w === 't') State.tSel = id;
  else if (w === 'b') State.bSel = id;
  else State.pbSel = id;

  if (id === null) {
    document.getElementById('bc')?.classList.add('hide');
    document.getElementById('pbc')?.classList.add('hide');
    return;
  }

  const pfx  = w === 't' ? (String(id).startsWith('o') ? 'opp' : 'tp') : w === 'p' ? 'pb' : 'bp';
  const el   = document.getElementById(pfx + id);
  if (el) el.classList.add('sel');

  const list = w === 'b' ? State.bPlayers : w === 'p' ? State.pPlayers : null;
  const card = document.getElementById(w === 'b' ? 'bc' : w === 'p' ? 'pbc' : null);
  if (list && card) {
    const p = list.find(x => x.id === id);
    if (p) {
      card.classList.remove('hide');
      const cardPfx = w === 'p' ? 'pb' : 'b';
      const ava = document.getElementById(`${cardPfx}ca`);
      const nam = document.getElementById(`${cardPfx}cn`);
      const pos = document.getElementById(`${cardPfx}cp`);
      if (ava) { ava.textContent = p.n; ava.className = `pav ${p.isGk ? 'gk' : p.isDef ? 'd' : 'f'}`; }
      if (nam) nam.textContent = p.name;
      if (pos) pos.textContent = `(${Math.round(p.x)}, ${Math.round(p.y)})`;
    }
  }
}

// ─── Grande Área players ──────────────────────────────────────────────────────

function addBoxPlayer(type) {
  const counts = State.bPlayerCounts;
  counts.total++;
  const isGk  = type === 'gk';
  const isDef = type === 'def';
  const lbl   = isGk ? 'GR' : type === 'att' ? `A${++counts.att}` : `D${++counts.def}`;
  const nm    = isGk ? 'Guarda-Redes' : type === 'att' ? `Atacante ${counts.att}` : `Defesa ${counts.def}`;
  const cls   = isGk ? 'gk' : isDef ? 'd' : 'f';
  const bases = {
    att: [{x:34,y:75},{x:26,y:78},{x:42,y:78},{x:20,y:82},{x:48,y:82}],
    def: [{x:34,y:90},{x:24,y:86},{x:44,y:86},{x:16,y:82},{x:52,y:82}],
    gk:  [{x:34,y:98}]
  };
  const arr = bases[type];
  const idx = ((type === 'att' ? counts.att : type === 'def' ? counts.def : 1) - 1) % arr.length;
  const jx  = counts.total > 1 ? (Math.random() - 0.5) * 6 : 0;
  const jy  = counts.total > 1 ? (Math.random() - 0.5) * 4 : 0;
  const vx  = Math.max(4, Math.min(64, arr[idx].x + jx));
  const vy  = Math.max(2, Math.min(103, arr[idx].y + jy));
  const id  = counts.total;
  const p   = { id, x: vx, y: vy, n: lbl, isGk, isDef, name: nm };
  State.bPlayers.push(p);

  const el = createPlayerEl(`bp${id}`, lbl, cls, nm, vx, vy, id, 68, 105);
  attachPlayerEvents(el, id, 'b', 'box-pitch', 68, 105);
  document.getElementById('box-pitch').appendChild(el);
  scheduleAutosave();
}

function clearBoxPlayers() {
  pushHistory();
  document.querySelectorAll('#box-pitch .pl').forEach(e => e.remove());
  State.bPlayers = [];
  State.bPlayerCounts = { att: 0, def: 0, gk: 0, total: 0 };
  State.bSel = null;
  document.getElementById('bc')?.classList.add('hide');
  scheduleAutosave();
}

function clearBoxShapes() {
  pushHistory();
  State.bShapes = State.bShapes.filter(s => s._bp);
  document.querySelectorAll('.slbl[data-w="b"]').forEach(l => l.remove());
  renderShapes('b');
  scheduleAutosave();
}

function deleteSelectedPlayer(w) {
  const id = w === 'b' ? State.bSel : State.pbSel;
  if (id === null) return;
  pushHistory();
  if (w === 'b') {
    const pfx = 'bp';
    document.getElementById(pfx + id)?.remove();
    State.bPlayers = State.bPlayers.filter(p => p.id !== id);
    State.bSel = null;
    document.getElementById('bc')?.classList.add('hide');
  } else {
    const pfx = 'pb';
    document.getElementById(pfx + id)?.remove();
    State.pPlayers = State.pPlayers.filter(p => p.id !== id);
    State.pbSel = null;
    document.getElementById('pbc')?.classList.add('hide');
  }
  scheduleAutosave();
  showToast('Jogador removido');
}

function selectSetPiece(btn, key) {
  document.querySelectorAll('[data-bp-zone]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  // Remove previous set-piece shapes
  if (bpZoneId) State.bShapes = State.bShapes.filter(s => s.id !== bpZoneId && s.id !== bpBallId);
  bpZoneId = null; bpBallId = null;

  const z = BPZ[key];
  if (!z) return;

  pushHistory();
  const zid = `bpz${++bSC}`; bpZoneId = zid;
  State.bShapes.push({ id: zid, type: 'zone', points: z.pts, fill: z.fill, stroke: z.stroke, label: z.lbl, nl: false, _bp: true });

  if (z.ball) {
    const bid = `bpb${bSC}`; bpBallId = bid;
    const br  = z.ball;
    const r   = 1.2;
    State.bShapes.push({ id: bid, type: 'polygon', nl: true, _bp: true,
      points: [{ x: br.x - r, y: br.y - r }, { x: br.x + r, y: br.y - r }, { x: br.x + r, y: br.y + r }, { x: br.x - r, y: br.y + r }],
      fill: 'rgba(255,255,255,.95)', stroke: 'rgba(255,255,255,.5)', label: 'Bola' });
  }

  renderShapes('b');
  scheduleAutosave();
}

// ─── Meio Campo players ───────────────────────────────────────────────────────

function addPboxPlayer(type) {
  const counts  = State.pPlayerCounts;
  counts.total++;
  const isOpp   = type.startsWith('opp-');
  const baseType = isOpp ? type.replace('opp-', '') : type;
  const isGk    = baseType === 'gk';
  const isDef   = baseType === 'def';
  let lbl, nm, cls;

  if (isOpp) {
    if (isGk)      { lbl = 'GR';  nm = 'GR Adv.';           cls = 'opp-gk'; }
    else if (isDef){ lbl = `D${++counts.oppDef}`; nm = `Def. Adv. ${counts.oppDef}`; cls = 'opp'; }
    else           { lbl = `A${++counts.oppAtt}`; nm = `Atq. Adv. ${counts.oppAtt}`; cls = 'opp'; }
  } else {
    if (isGk)      { lbl = 'GR';  nm = 'Guarda-Redes';       cls = 'gk'; }
    else if (isDef){ lbl = `D${++counts.def}`; nm = `Defesa ${counts.def}`;   cls = 'f'; }
    else           { lbl = `A${++counts.att}`; nm = `Atacante ${counts.att}`; cls = 'f'; }
  }

  const bases = {
    att:       [{x:34,y:80},{x:24,y:75},{x:44,y:75},{x:18,y:85},{x:50,y:85}],
    def:       [{x:34,y:60},{x:22,y:55},{x:46,y:55},{x:14,y:65},{x:54,y:65}],
    gk:        [{x:34,y:98}],
    'opp-att': [{x:34,y:30},{x:24,y:35},{x:44,y:35},{x:16,y:25},{x:52,y:25}],
    'opp-def': [{x:34,y:45},{x:22,y:40},{x:46,y:40},{x:14,y:50},{x:54,y:50}],
    'opp-gk':  [{x:34,y:7}],
  };
  const arr = bases[type] || bases.att;
  const idx = (counts.total - 1) % arr.length;
  const jx  = counts.total > 1 ? (Math.random() - 0.5) * 5 : 0;
  const jy  = counts.total > 1 ? (Math.random() - 0.5) * 3 : 0;
  const vx  = Math.max(4, Math.min(64, arr[idx].x + jx));
  const vy  = Math.max(2, Math.min(103, arr[idx].y + jy));
  const id  = counts.total;
  const p   = { id, x: vx, y: vy, n: lbl, isGk, isDef, isOpp, name: nm };
  State.pPlayers.push(p);

  const el = createPlayerEl(`pb${id}`, lbl, cls, nm, vx, vy, id, 68, 105);
  attachPlayerEvents(el, id, 'p', 'pbox-pitch', 68, 105);
  document.getElementById('pbox-pitch').appendChild(el);
  scheduleAutosave();
}

function clearPboxPlayers() {
  pushHistory();
  document.querySelectorAll('#pbox-pitch .pl').forEach(e => e.remove());
  State.pPlayers = [];
  State.pPlayerCounts = { att: 0, def: 0, gk: 0, oppAtt: 0, oppDef: 0, total: 0 };
  State.pbSel = null;
  document.getElementById('pbc')?.classList.add('hide');
  scheduleAutosave();
}

function clearPboxShapes() {
  pushHistory();
  State.pShapes = [];
  document.querySelectorAll('.slbl[data-w="p"]').forEach(l => l.remove());
  document.getElementById('pb-shapes').innerHTML = '';
  document.getElementById('pb-draw').innerHTML   = '';
  scheduleAutosave();
}

// ─── Notes ────────────────────────────────────────────────────────────────────

function bindNotes() {
  document.getElementById('btn-new-note')?.addEventListener('click', newNote);
  document.getElementById('note-title')?.addEventListener('input', saveCurrentNote);
  document.getElementById('note-body')?.addEventListener('input',  saveCurrentNote);
  document.getElementById('btn-del-note')?.addEventListener('click', deleteCurrentNote);

  ['tc','bp','ge'].forEach(tag => {
    document.getElementById(`tag-${tag}`)?.addEventListener('click', () => setNoteTag(tag));
  });
}

function newNote() {
  pushHistory();
  const note = { id: Date.now(), title: 'Nova Nota', body: '', tag: 'ge', date: todayStr() };
  State.notes.unshift(note);
  renderNotesList(openNote);
  openNote(note.id);
  scheduleAutosave();
}

function openNote(id) {
  State.curNote = id;
  const note = State.notes.find(n => n.id === id);
  if (!note) return;

  document.getElementById('note-title').value = note.title;
  document.getElementById('note-body').value  = note.body;
  document.getElementById('ne-head').style.display = 'flex';
  document.getElementById('note-body').style.display = 'block';
  document.getElementById('ne-empty').style.display  = 'none';
  document.getElementById('ne-foot').style.display   = 'flex';

  ['tc','bp','ge'].forEach(t => document.getElementById(`tag-${t}`)?.classList.toggle('on', t === note.tag));
  updateNoteStat(note);
  renderNotesList(openNote);
}

function saveCurrentNote() {
  if (!State.curNote) return;
  const note = State.notes.find(n => n.id === State.curNote);
  if (!note) return;
  note.title = document.getElementById('note-title').value || 'Sem título';
  note.body  = document.getElementById('note-body').value;
  note.date  = todayStr();
  updateNoteStat(note);
  renderNotesList(openNote);
  scheduleAutosave();
}

function setNoteTag(tag) {
  if (!State.curNote) return;
  const note = State.notes.find(n => n.id === State.curNote);
  if (!note) return;
  pushHistory();
  note.tag = tag;
  ['tc','bp','ge'].forEach(t => document.getElementById(`tag-${t}`)?.classList.toggle('on', t === tag));
  renderNotesList(openNote);
  scheduleAutosave();
}

function deleteCurrentNote() {
  if (!State.curNote) return;
  const note = State.notes.find(n => n.id === State.curNote);
  if (note && !confirm(`Eliminar "${note.title}"?`)) return;
  pushHistory();
  State.notes = State.notes.filter(n => n.id !== State.curNote);
  State.curNote = null;
  document.getElementById('ne-head').style.display  = 'none';
  document.getElementById('note-body').style.display = 'none';
  document.getElementById('ne-empty').style.display  = 'flex';
  document.getElementById('ne-foot').style.display   = 'none';
  renderNotesList(openNote);
  scheduleAutosave();
}

function updateNoteStat(note) {
  const wc  = (note.body || '').trim().split(/\s+/).filter(Boolean).length;
  const el  = document.getElementById('ne-stat');
  if (el) el.textContent = `${wc} palavra${wc !== 1 ? 's' : ''}  ·  ${note.date}`;
}

// ─── Save / Load modal ────────────────────────────────────────────────────────

function bindModal() {
  document.getElementById('btn-save-ok')?.addEventListener('click', doSave);
  document.getElementById('save-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSave();
  });
  document.getElementById('modal-close')?.addEventListener('click', closeModal);
  document.getElementById('modal-ov')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
}

function openSaveModal() {
  document.getElementById('modal-title-txt').textContent = 'Guardar Sessão';
  document.getElementById('save-area').style.display = 'flex';
  document.getElementById('save-name').value = '';
  document.getElementById('modal-ov').classList.add('open');
  refreshSaveList();
  setTimeout(() => document.getElementById('save-name').focus(), 100);
}

function openLoadModal() {
  document.getElementById('modal-title-txt').textContent = 'Carregar Sessão';
  document.getElementById('save-area').style.display = 'none';
  document.getElementById('modal-ov').classList.add('open');
  refreshSaveList();
}

function closeModal() {
  document.getElementById('modal-ov').classList.remove('open');
}

function doSave() {
  const name = document.getElementById('save-name').value.trim();
  saveSession(name);
  refreshSaveList();
  const btn = document.getElementById('btn-save-ok');
  btn.textContent = '✓ Guardado!';
  setTimeout(() => { btn.textContent = 'Guardar'; }, 1400);
  showToast('Sessão guardada');
}

function refreshSaveList() {
  renderSaveList(getSaves(), (id) => {
    const err = loadSession(id);
    if (err) { showToast(`Erro: ${err}`); return; }
    rebuildAllFromState();
    closeModal();
    showToast('Sessão carregada');
  }, (id) => {
    if (!confirm('Eliminar esta sessão?')) return;
    deleteSession(id);
    refreshSaveList();
  });
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

function bindKeyboard() {
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const mod = e.ctrlKey || e.metaKey;

    if (e.key === 'Escape') {
      cancelSwipe();
      setMode('none');
      arrowDir = null;
      clearShapeSelection();
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (State.selectedShape) deleteSelectedShape();
    }

    if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
    if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); doRedo(); }
    if (mod && e.key === 's') { e.preventDefault(); patchedAutosaveNow(); showToast('Autosave ✓'); }
  });
}

// ─── Orientation ──────────────────────────────────────────────────────────────

function bindOrientation() {
  document.getElementById('btn-orient')?.addEventListener('click', toggleOrientation);

  const mq = window.matchMedia('(orientation: landscape) and (max-height: 520px)');
  mq.addEventListener('change', () => { if (!State.forcedOrientation) applyOrientation(); });
}

function applyOrientation() {
  const isLandscape = window.matchMedia('(orientation: landscape) and (max-height: 520px)').matches;
  const effective   = State.forcedOrientation || (isLandscape ? 'landscape' : 'portrait');

  document.body.classList.toggle('force-landscape', effective === 'landscape');
  document.body.classList.toggle('force-portrait',  effective === 'portrait');

  const icon = document.getElementById('orient-icon');
  const btn  = document.getElementById('btn-orient');
  if (!icon || !btn) return;

  if (effective === 'landscape') {
    icon.innerHTML = '<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.5" y2="18" stroke-width="2.5"/>';
    btn.title       = 'Mudar para vertical';
    btn.style.color = 'var(--acc)';
    btn.style.borderColor = 'rgba(61,220,132,.4)';
  } else {
    icon.innerHTML = '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="18" y1="12" x2="18.5" y2="12" stroke-width="2.5"/>';
    btn.title       = 'Mudar para horizontal';
    btn.style.color = 'var(--t3)';
    btn.style.borderColor = 'var(--b2)';
  }

  setTimeout(() => renderAllShapes(), 320);
}

function toggleOrientation() {
  const isLandscape = window.matchMedia('(orientation: landscape) and (max-height: 520px)').matches;
  const current     = State.forcedOrientation || (isLandscape ? 'landscape' : 'portrait');
  State.forcedOrientation = current === 'landscape' ? 'portrait' : 'landscape';
  applyOrientation();
  showToast(State.forcedOrientation === 'landscape' ? 'Modo horizontal' : 'Modo vertical');
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

function bindOnboarding() {
  // Show first-use hint if never used before
  if (!localStorage.getItem('tl_onboarded')) {
    setTimeout(() => {
      const hint = document.getElementById('onboarding-hint');
      if (hint) hint.classList.add('show');
    }, 800);
  }
  document.getElementById('btn-onboarding-dismiss')?.addEventListener('click', () => {
    document.getElementById('onboarding-hint')?.classList.remove('show');
    localStorage.setItem('tl_onboarded', '1');
  });
}

// ─── Full state rebuild ───────────────────────────────────────────────────────

/**
 * After undo/redo or session load, rebuild all DOM from State.
 */
function rebuildAllFromState() {
  // Tactic pitch — team
  clearPlayerEls('pitch', ['pl-opp','pl-opp-gk']);
  State.players.forEach((pl, i) => {
    const el = createPlayerEl(`tp${pl.id}`, pl.n, pl.isGk ? 'gk' : 'f', pl.name, pl.x, pl.y, i, 68, 105);
    attachPlayerEvents(el, pl.id, 't', 'pitch', 68, 105);
    document.getElementById('pitch').appendChild(el);
  });
  document.getElementById('fsel').value = State.fmt;

  // Tactic pitch — opponent
  document.querySelectorAll('#pitch .pl-opp, #pitch .pl-opp-gk').forEach(e => e.remove());
  State.opp.forEach((pl, i) => {
    const el = createPlayerEl(`tp${pl.id}`, pl.n, pl.isGk ? 'opp-gk' : 'opp', pl.name, pl.x, pl.y, i, 68, 105);
    attachPlayerEvents(el, pl.id, 't', 'pitch', 68, 105);
    document.getElementById('pitch').appendChild(el);
  });
  document.getElementById('fsel-opp').value = State.fmtOpp;

  // Ball
  spawnBall();
  const ball = document.getElementById('ball');
  if (ball && State.ball) {
    ball.style.left = `${State.ball.x}%`;
    ball.style.top  = `${State.ball.y}%`;
  }

  // Grande Área players
  document.querySelectorAll('#box-pitch .pl').forEach(e => e.remove());
  State.bPlayers.forEach((pl, i) => {
    const cls = pl.isGk ? 'gk' : pl.isDef ? 'd' : 'f';
    const el  = createPlayerEl(`bp${pl.id}`, pl.n, cls, pl.name, pl.x, pl.y, i, 68, 105);
    attachPlayerEvents(el, pl.id, 'b', 'box-pitch', 68, 105);
    document.getElementById('box-pitch').appendChild(el);
  });

  // Meio Campo players
  document.querySelectorAll('#pbox-pitch .pl').forEach(e => e.remove());
  State.pPlayers.forEach((pl, i) => {
    const cls = pl.isOpp ? (pl.isGk ? 'opp-gk' : 'opp') : pl.isGk ? 'gk' : 'f';
    const el  = createPlayerEl(`pb${pl.id}`, pl.n, cls, pl.name, pl.x, pl.y, i, 68, 105);
    attachPlayerEvents(el, pl.id, 'p', 'pbox-pitch', 68, 105);
    document.getElementById('pbox-pitch').appendChild(el);
  });

  // Field Balls
  spawnFieldBalls();

  // Shapes
  tSC = State.tShapes.length;
  bSC = State.bShapes.length;
  pSC = State.pShapes.length;
  renderAllShapes();

  // Notes
  renderNotesList(openNote);
  if (State.curNote) {
    openNote(State.curNote);
  } else {
    document.getElementById('ne-head').style.display  = 'none';
    document.getElementById('note-body').style.display = 'none';
    document.getElementById('ne-empty').style.display  = 'flex';
    document.getElementById('ne-foot').style.display   = 'none';
  }

  // Keyframe count + timeline
  document.getElementById('kf-count').textContent = State.keyframes.length;
  renderTimeline();

  if (State.showTrails) drawTrails();
  applyClubColors();
  
  renderTacticPanel();
  scheduleAutosave();
}

// ─── Field Balls (box + pbox) ─────────────────────────────────────────────────

function spawnFieldBalls() {
  // Box ball
  document.getElementById('box-ball')?.remove();
  const bb = makeBallEl('box-ball');
  const bPos = State.bBall || { x: 34, y: 11 };
  const bPct = { x: (bPos.x / 68) * 100, y: (bPos.y / 105) * 100 };
  bb.style.left = `${bPct.x}%`;
  bb.style.top  = `${bPct.y}%`;
  bb.addEventListener('mousedown', e => startFieldBallDrag(e, 'box-ball', 'box-pitch', State, 'bBall', 68, 105));
  bb.addEventListener('touchstart', e => startFieldBallDrag(e, 'box-ball', 'box-pitch', State, 'bBall', 68, 105), { passive: false });
  document.getElementById('box-pitch')?.appendChild(bb);

  // Pbox ball
  document.getElementById('pbox-ball')?.remove();
  const pb = makeBallEl('pbox-ball');
  const pPos = State.pBall || { x: 34, y: 26 };
  const pPct = { x: (pPos.x / 68) * 100, y: (pPos.y / 105) * 100 };
  pb.style.left = `${pPct.x}%`;
  pb.style.top  = `${pPct.y}%`;
  pb.addEventListener('mousedown', e => startFieldBallDrag(e, 'pbox-ball', 'pbox-pitch', State, 'pBall', 68, 105));
  pb.addEventListener('touchstart', e => startFieldBallDrag(e, 'pbox-ball', 'pbox-pitch', State, 'pBall', 68, 105), { passive: false });
  document.getElementById('pbox-pitch')?.appendChild(pb);
}

function makeBallEl(id) {
  const el = document.createElement('div');
  el.id = id;
  el.className = 'field-ball';
  el.setAttribute('aria-label', 'Bola — arrastar para mover');
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.innerHTML = `
    <svg width="22" height="22" viewBox="0 0 28 28" aria-hidden="true"
         style="filter:drop-shadow(0 2px 7px rgba(0,0,0,.7))">
      <defs>
        <radialGradient id="bg2" cx="38%" cy="32%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="65%" stop-color="#f0f0f0"/>
          <stop offset="100%" stop-color="#c8c8c8"/>
        </radialGradient>
      </defs>
      <circle cx="14" cy="14" r="13" fill="url(#bg2)" stroke="rgba(0,0,0,.18)" stroke-width=".5"/>
      <polygon points="14,2.5 17.5,7.5 14,10.5 10.5,7.5" fill="#1a1f70" opacity=".9"/>
      <polygon points="24,8.5 21.5,13.5 18,12 17.5,7.5" fill="#1a1f70" opacity=".9"/>
      <polygon points="22,21.5 17.5,23 16,18.5 19.5,15.5" fill="#1a1f70" opacity=".9"/>
      <polygon points="6,21.5 8.5,15.5 12,18.5 10.5,23" fill="#1a1f70" opacity=".9"/>
      <polygon points="4,8.5 10.5,7.5 10,12 6.5,13.5" fill="#1a1f70" opacity=".9"/>
      <polygon points="14,10.5 17.5,13.5 15,17 13,17 10.5,13.5" fill="#1a1f70" opacity=".55"/>
      <path d="M14,3.5 l.6,1.8h1.9l-1.5,1.1.6,1.8L14,7.2l-1.6 1 .6-1.8L11.5,5.3h1.9z" fill="#f0c040" opacity=".85"/>
      <ellipse cx="10" cy="9" rx="3.2" ry="1.6" fill="white" opacity=".25" transform="rotate(-35 10 9)"/>
    </svg>`;
  return el;
}

let _fieldBallDrag = null;

function startFieldBallDrag(e, ballId, pitchId, stateRef, stateKey, vw, vh) {
  e.stopPropagation();
  e.preventDefault();
  _fieldBallDrag = { ballId, pitchId, stateRef, stateKey, vw, vh };
  const ball = document.getElementById(ballId);
  if (ball) { ball.style.cursor = 'grabbing'; ball.classList.add('dragging'); }
}

// ─── Library ──────────────────────────────────────────────────────────────────

function bindLibrary() {
  document.getElementById('lib-close')?.addEventListener('click', closeLibraryModal);
  document.getElementById('lib-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeLibraryModal();
  });
  document.getElementById('lib-save-btn')?.addEventListener('click', saveCurrentPlay);
  document.getElementById('lib-filter-all')?.addEventListener('click', () => renderLibrary('all'));
  document.getElementById('lib-filter-ataque')?.addEventListener('click', () => renderLibrary('ataque'));
  document.getElementById('lib-filter-defesa')?.addEventListener('click', () => renderLibrary('defesa'));
  document.getElementById('lib-filter-bola-parada')?.addEventListener('click', () => renderLibrary('bola-parada'));
  document.getElementById('lib-filter-template')?.addEventListener('click', () => renderLibrary('template'));
  document.getElementById('lib-export-btn')?.addEventListener('click', () => {
    const json = exportLibrary();
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `tl-biblioteca-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    showToast('Biblioteca exportada');
  });
  // Tag buttons for save form — toggle active state
  document.querySelectorAll('.lib-save-tag').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('active'));
  });

  document.getElementById('lib-import-btn')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = () => {
      const reader = new FileReader();
      reader.onload = e => {
        const n = importLibrary(e.target.result);
        if (typeof n === 'string') showToast(`Erro: ${n}`);
        else { renderLibrary(_libCurrentFilter); showToast(`${n} jogadas importadas`); }
      };
      reader.readAsText(input.files[0]);
    };
    input.click();
  });

  // Library search
  document.getElementById('lib-search')?.addEventListener('input', e => {
    _libSearchQuery = e.target.value.toLowerCase().trim();
    renderLibrary(_libCurrentFilter);
  });
}

let _libCurrentFilter = 'all';
let _libSearchQuery   = '';

function openLibraryModal() {
  renderLibrary('all');
  document.getElementById('lib-overlay')?.classList.add('open');
}

function closeLibraryModal() {
  document.getElementById('lib-overlay')?.classList.remove('open');
}

function renderLibrary(filter) {
  _libCurrentFilter = filter;
  const grid = document.getElementById('lib-grid');
  if (!grid) return;

  // Active filter button
  document.querySelectorAll('.lib-filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === filter);
  });

  let entries = getLibrary().filter(e => {
    if (filter === 'all') return true;
    return e.tags && e.tags.includes(filter);
  });

  // Apply search query
  if (_libSearchQuery) {
    entries = entries.filter(e =>
      e.name.toLowerCase().includes(_libSearchQuery) ||
      (e.desc || '').toLowerCase().includes(_libSearchQuery) ||
      (e.tags || []).some(t => t.includes(_libSearchQuery))
    );
  }

  if (!entries.length) {
    grid.innerHTML = `<div class="lib-empty">
      ${_libSearchQuery ? `Nenhum resultado para "${escHtml(_libSearchQuery)}".` : filter === 'all' ? 'Biblioteca vazia. Guarda a tua primeira jogada!' : 'Nenhuma jogada com este filtro.'}
    </div>`;
    return;
  }

  grid.innerHTML = entries.map(e => {
    const tagHtml = (e.tags || []).filter(t => t !== 'template')
      .slice(0,3).map(t => `<span class="lib-tag">${escHtml(t)}</span>`).join('');
    const thumb = e.thumbnail
      ? `<img class="lib-thumb" src="${e.thumbnail}" alt="" loading="lazy">`
      : `<div class="lib-thumb lib-thumb-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </div>`;
    const isTemplate = e.tags?.includes('template');
    return `
      <div class="lib-card ${isTemplate ? 'lib-card-template' : ''}" data-lib-id="${e.id}">
        ${thumb}
        <div class="lib-card-body">
          <div class="lib-card-name">${escHtml(e.name)}</div>
          <div class="lib-card-fmt">${escHtml(e.fmt || '')}</div>
          <div class="lib-card-tags">${tagHtml}</div>
          ${e.desc ? `<div class="lib-card-desc">${escHtml(e.desc)}</div>` : ''}
        </div>
        <div class="lib-card-actions">
          <button class="lib-act-btn lb" data-lib-load="${e.id}" aria-label="Carregar jogada" title="Carregar esta jogada no campo">Carregar</button>
          <button class="lib-act-btn sh" data-lib-share="${e.id}" aria-label="Partilhar jogada" title="Copiar link para partilhar">⇪ Partilhar</button>
          ${!isTemplate ? `<button class="lib-act-btn dl" data-lib-del="${e.id}" aria-label="Eliminar jogada" title="Eliminar esta jogada">✕</button>` : ''}
        </div>
      </div>`;
  }).join('');

  // Bind card actions
  grid.querySelectorAll('[data-lib-load]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); loadLibraryPlay(Number(btn.dataset.libLoad)); });
  });
  grid.querySelectorAll('[data-lib-del]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const ok = await customConfirm('Eliminar jogada', 'Esta jogada será eliminada permanentemente.');
      if (!ok) return;
      deletePlay(Number(btn.dataset.libDel));
      renderLibrary(_libCurrentFilter);
    });
  });
  grid.querySelectorAll('[data-lib-share]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const url = buildShareURL(Number(btn.dataset.libShare));
      if (url) {
        navigator.clipboard?.writeText(url).then(() => showToast('Link copiado!')).catch(() => prompt('Copia este link:', url));
      }
    });
  });
}

function loadLibraryPlay(id) {
  pushHistory();
  const err = loadPlay(id);
  if (err) { showToast(`Erro: ${err}`); return; }
  rebuildAllFromState();
  closeLibraryModal();
  showToast('Jogada carregada');
}

function saveCurrentPlay() {
  const nameIn = document.getElementById('lib-save-name');
  const descIn = document.getElementById('lib-save-desc');
  const tagsIn = document.querySelectorAll('.lib-save-tag.active');
  const name   = nameIn?.value.trim() || '';
  if (!name) { nameIn?.focus(); showToast('Dá um nome à jogada'); return; }
  const tags   = Array.from(tagsIn).map(b => b.dataset.tag);
  const desc   = descIn?.value.trim() || '';

  // Generate thumbnail from current canvas state
  generateThumbnail().then(thumb => {
    savePlay(name, desc, tags, thumb);
    if (nameIn) nameIn.value = '';
    if (descIn) descIn.value = '';
    document.querySelectorAll('.lib-save-tag').forEach(b => b.classList.remove('active'));
    renderLibrary('all');
    showToast('Jogada guardada na biblioteca ✓');
  });
}

async function generateThumbnail() {
  const pitch = document.getElementById('pitch');
  if (!pitch) return null;
  const W = 280, H = 160;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0c1f15'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = '#0e2318';
  for (let y=0; y<H; y+=14) { if(Math.floor(y/14)%2===0) ctx.fillRect(0,y,W,14); }

  // Field lines (simplified)
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 0.8;
  ctx.strokeRect(6,4,W-12,H-8);
  ctx.beginPath(); ctx.moveTo(W/2,4); ctx.lineTo(W/2,H-4); ctx.stroke();
  ctx.beginPath(); ctx.arc(W/2,H/2,28,0,Math.PI*2); ctx.stroke();

  // Players (team)
  const pitch_el = document.getElementById('pitch');
  const pr = pitch_el ? pitch_el.getBoundingClientRect() : {width:1,height:1};
  State.players.forEach(p => {
    const px = (p.x/68)*W; const py = (p.y/105)*H;
    ctx.beginPath(); ctx.arc(px,py,6,0,Math.PI*2);
    ctx.fillStyle = p.isGk ? (Club.colorGk || '#5bbfff') : (Club.colorMain || '#3ddc84');
    ctx.fill();
  });
  State.opp.forEach(p => {
    const px = (p.x/68)*W; const py = (p.y/105)*H;
    ctx.beginPath(); ctx.arc(px,py,6,0,Math.PI*2);
    ctx.fillStyle = p.isGk ? '#ff9f1c' : '#ff6b4a'; ctx.fill();
  });

  // Shapes (arrows)
  State.tShapes.filter(s=>s.type==='arrow'&&s.points.length>=2).forEach(s => {
    ctx.strokeStyle = s.stroke || 'rgba(240,192,64,.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    s.points.forEach((pt,i) => {
      const px=(pt.x/68)*W, py=(pt.y/105)*H;
      i===0?ctx.moveTo(px,py):ctx.lineTo(px,py);
    }); ctx.stroke();
  });

  return canvas.toDataURL('image/png');
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toLocaleDateString('pt-PT');
}

// ─── Shape Selection & Action Bar ─────────────────────────────────────────────

function bindShapeActionBar() {
  document.getElementById('sab-del')?.addEventListener('click', deleteSelectedShape);
  document.getElementById('sab-cancel')?.addEventListener('click', clearShapeSelection);
}

function selectShape(w, id) {
  clearShapeSelection();
  State.selectedShape = { w, id };

  const svgId = w === 't' ? 'p-shapes' : w === 'b' ? 'b-shapes' : 'pb-shapes';
  const svg = document.getElementById(svgId);
  if (!svg) return;

  const shapesArr = w === 't' ? State.tShapes : w === 'b' ? State.bShapes : State.pShapes;
  const sh = shapesArr.find(s => s.id === id);
  if (!sh) return;

  svg.querySelectorAll('.shape-el').forEach(el => el.classList.remove('shape-selected'));
  svg.querySelectorAll(`[data-shape-id="${id}"]`).forEach(el => el.classList.add('shape-selected'));

  const bar = document.getElementById('shape-action-bar');
  const lbl = document.getElementById('sab-label');
  if (lbl) lbl.textContent = sh.label || 'Forma';
  bar?.classList.add('show');
}

function clearShapeSelection() {
  State.selectedShape = null;
  document.querySelectorAll('.shape-selected').forEach(el => el.classList.remove('shape-selected'));
  document.getElementById('shape-action-bar')?.classList.remove('show');
}

function deleteSelectedShape() {
  if (!State.selectedShape) return;
  const { w, id } = State.selectedShape;
  pushHistory();
  if (w === 't') State.tShapes = State.tShapes.filter(s => s.id !== id);
  else if (w === 'b') State.bShapes = State.bShapes.filter(s => s.id !== id);
  else State.pShapes = State.pShapes.filter(s => s.id !== id);
  // Remove label
  document.querySelectorAll(`.slbl[data-w="${w}"]`).forEach(l => {
    if (l.dataset.shapeId === id) l.remove();
  });
  clearShapeSelection();
  renderShapes(w);
  scheduleAutosave();
  showToast('Forma eliminada');
}

// ─── Custom Formations ─────────────────────────────────────────────────────────

function bindCustomFormations() {
  const btn  = document.getElementById('btn-custom-fmt');
  const list = document.getElementById('custom-fmts-list');
  if (!btn || !list) return;

  btn.addEventListener('click', e => {
    e.stopPropagation();
    renderCustomFmtList();
    list.classList.toggle('open');
  });

  document.addEventListener('click', e => {
    if (!btn.contains(e.target) && !list.contains(e.target)) {
      list.classList.remove('open');
    }
  });
}

function renderCustomFmtList() {
  const list = document.getElementById('custom-fmts-list');
  if (!list) return;

  const fmts = State.customFmts || [];
  let html = '';

  if (!fmts.length) {
    html += `<div class="cfmt-empty">Nenhuma formação personalizada</div>`;
  } else {
    html += fmts.map((f, i) => `
      <div class="cfmt-item" data-cfmt-idx="${i}">
        <span>${escHtml(f.name)}</span>
        <button class="cfmt-item-del" data-cfmt-del="${i}" title="Eliminar">✕</button>
      </div>
    `).join('');
  }

  html += `<button class="cfmt-save-btn" id="cfmt-save-now">＋ Guardar formação atual</button>`;
  html += `<div style="display:flex;gap:4px;margin-top:6px;">`;
  html += `<button class="cfmt-save-btn" id="cfmt-export" style="flex:1;font-size:10px;background:var(--b2);">Exportar JSON</button>`;
  html += `<button class="cfmt-save-btn" id="cfmt-import" style="flex:1;font-size:10px;background:var(--b2);">Importar JSON</button>`;
  html += `</div>`;
  list.innerHTML = html;

  // Load custom formation
  list.querySelectorAll('.cfmt-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('[data-cfmt-del]')) return;
      const idx = parseInt(item.dataset.cfmtIdx);
      const f   = State.customFmts[idx];
      if (!f) return;
      pushHistory();
      State.fmt = f.name;
      State.players = f.positions.map((d, i) => ({ id: i + 1, x: d.x, y: d.y, n: d.n, name: PNAMES[i] || `J${i+1}`, isGk: i === 0 }));
      clearPlayerEls('pitch', ['pl-opp','pl-opp-gk']);
      State.players.forEach((pl, i) => {
        const el = createPlayerEl(`tp${pl.id}`, pl.n, pl.isGk ? 'gk' : 'f', pl.name, pl.x, pl.y, i, 68, 105);
        attachPlayerEvents(el, pl.id, 't', 'pitch', 68, 105);
        document.getElementById('pitch').appendChild(el);
      });
      document.getElementById('fsel').value = '';
      applyClubColors();
      scheduleAutosave();
      list.classList.remove('open');
      showToast(`Formação "${f.name}" carregada`);
    });
  });

  // Delete custom formation
  list.querySelectorAll('[data-cfmt-del]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.cfmtDel);
      const f   = State.customFmts[idx];
      const ok  = await customConfirm('Eliminar formação', `Eliminar "${f?.name}"?`);
      if (!ok) return;
      State.customFmts.splice(idx, 1);
      localStorage.setItem('tl_custom_fmts', JSON.stringify(State.customFmts));
      renderCustomFmtList();
    });
  });

  // Save current formation
  document.getElementById('cfmt-save-now')?.addEventListener('click', () => {
    const name = prompt('Nome da formação:');
    if (!name?.trim()) return;
    const positions = State.players.map(p => ({ x: p.x, y: p.y, n: p.n }));
    State.customFmts.push({ name: name.trim(), positions });
    localStorage.setItem('tl_custom_fmts', JSON.stringify(State.customFmts));
    renderCustomFmtList();
    showToast(`Formação "${name.trim()}" guardada`);
  });

  // Export
  document.getElementById('cfmt-export')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!State.customFmts?.length) return showToast('Nenhuma formação para exportar');
    const json = JSON.stringify({ _type: 'tl-custom-fmts', v: 1, fmts: State.customFmts }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `tl-formacoes-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    showToast('Formações exportadas!');
    list.classList.remove('open');
  });

  // Import
  document.getElementById('cfmt-import')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = () => {
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const data = JSON.parse(ev.target.result);
          if (data._type !== 'tl-custom-fmts' || !Array.isArray(data.fmts)) throw new Error('Formato inválido');
          const existing = State.customFmts || [];
          const existingNames = new Set(existing.map(f => f.name));
          let imported = 0;
          for (const f of data.fmts) {
            if (!existingNames.has(f.name)) {
              existing.push(f);
              existingNames.add(f.name);
              imported++;
            }
          }
          State.customFmts = existing;
          localStorage.setItem('tl_custom_fmts', JSON.stringify(State.customFmts));
          renderCustomFmtList();
          showToast(`${imported} formação(ões) importada(s)`);
        } catch (err) {
          showToast(`Erro: ${err.message}`);
        }
      };
      reader.readAsText(input.files[0]);
    };
    input.click();
    list.classList.remove('open');
  });
}

// ─── GIF Export ───────────────────────────────────────────────────────────────

async function exportGIF() {
  if (State.keyframes.length < 2) {
    showToast('Precisa de 2+ fotogramas para exportar GIF');
    return;
  }

  // Show progress
  const progEl  = document.getElementById('gif-progress');
  const barEl   = document.getElementById('gif-prog-bar');
  const txtEl   = document.getElementById('gif-prog-txt');
  progEl?.classList.add('show');
  if (txtEl) txtEl.textContent = 'A preparar GIF…';
  if (barEl) barEl.style.width = '0%';

  // Generate frames as PNG data URLs from thumbnail generator
  const frames = [];
  try {
    for (let i = 0; i < State.keyframes.length; i++) {
      const kf = State.keyframes[i];
      const progress = Math.round(((i + 1) / State.keyframes.length) * 80);
      if (barEl) barEl.style.width = `${progress}%`;
      if (txtEl) txtEl.textContent = `Frame ${i + 1}/${State.keyframes.length}…`;

      // Build thumbnail from keyframe positions
      const W = 320, H = 200;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0c1f15'; ctx.fillRect(0, 0, W, H);
      // stripes
      for (let y = 0; y < H; y += 14) {
        if (Math.floor(y / 14) % 2 === 0) { ctx.fillStyle = '#0e2318'; ctx.fillRect(0, y, W, 14); }
      }
      // field lines
      ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1;
      ctx.strokeRect(6, 4, W - 12, H - 8);
      ctx.beginPath(); ctx.moveTo(W / 2, 4); ctx.lineTo(W / 2, H - 4); ctx.stroke();
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 32, 0, Math.PI * 2); ctx.stroke();

      // players from keyframe
      kf.players.forEach(p => {
        const px = (p.xp / 100) * W; const py = (p.yp / 100) * H;
        ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2);
        const pl = State.players.find(x => x.id === p.id);
        ctx.fillStyle = pl?.isGk ? '#5bbfff' : '#3ddc84'; ctx.fill();
        ctx.fillStyle = pl?.isGk ? '#031222' : '#031108';
        ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (pl) ctx.fillText(pl.n, px, py);
      });
      (kf.opp || []).forEach(p => {
        const px = (p.xp / 100) * W; const py = (p.yp / 100) * H;
        ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#ff6b4a'; ctx.fill();
      });
      if (kf.ball) {
        ctx.beginPath(); ctx.arc((kf.ball.x / 100) * W, (kf.ball.y / 100) * H, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'white'; ctx.fill();
      }

      frames.push(canvas.toDataURL('image/png'));
      await new Promise(r => setTimeout(r, 10)); // yield to UI
    }

    if (barEl) barEl.style.width = '90%';
    if (txtEl) txtEl.textContent = 'A gerar ficheiro…';

    // Create a simple animated GIF using CSS animation trick:
    // We'll create an HTML page with animation and download it,
    // OR use a zip of frames with instructions.
    // For real GIF, we'd need gif.js library. Instead, we export PNG sequence as zip.
    // Simple approach: export as APNG-compatible or offer frame download.
    // Let's export the first/last frame PNG with a note, or offer frame sequence.

    // Export as animated webp via canvas-based approach (frame by frame)
    // Since native GIF requires a library, we'll export all frames as a ZIP of PNGs
    // using a simple base64 approach:
    const links = frames.map((dataUrl, i) => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `tactical-lab-frame-${String(i + 1).padStart(2, '0')}.png`;
      return a;
    });

    if (barEl) barEl.style.width = '100%';
    if (txtEl) txtEl.textContent = `${frames.length} frames exportados!`;

    // Download all frames sequentially
    for (const link of links) {
      link.click();
      await new Promise(r => setTimeout(r, 200));
    }

    setTimeout(() => { progEl?.classList.remove('show'); }, 2500);
    showToast(`${frames.length} frames exportados como PNG`);

  } catch (err) {
    progEl?.classList.remove('show');
    showToast('Erro ao exportar frames');
    console.error(err);
  }
}

// ─── Tactic Panel ────────────────────────────────────────────────────────────

function renderTacticPanel() {
  const tp = document.getElementById('tp-body');
  if (!tp) return;
  const W = 68, H = 105;
  
  const html = State.players.map(p => `
    <div class="tp-pl" data-id="${p.id}" tabindex="0" aria-label="Jogador ${p.n} ${p.name}">
      <div class="tp-av ${p.isGk ? 'gk' : 'f'}">${p.n}</div>
      <div class="tp-info">
        <div class="tp-name">${escHtml(p.name)}</div>
      </div>
    </div>
  `).join('');
  
  tp.innerHTML = html;
  
  // Highlight currently active player if selected
  if (State.mode === 'none') {
    const sel = document.querySelector('#pitch .pl.sel');
    if (sel) {
      const idStr = sel.id.replace('tp','');
      const item = tp.querySelector(`[data-id="${idStr}"]`);
      if (item) item.classList.add('active');
    }
  }

  tp.querySelectorAll('.tp-pl').forEach(el => {
    el.addEventListener('click', () => {
      tp.querySelectorAll('.tp-pl').forEach(e => e.classList.remove('active'));
      el.classList.add('active');
      selectPlayer('t', parseInt(el.dataset.id));
    });
  });
}

// ─── MP4 Export ───────────────────────────────────────────────────────────────

async function exportMP4() {
  if (State.keyframes.length < 2) { showToast('Precisa de 2+ fotogramas para exportar vídeo'); return; }

  const pitchEl = document.getElementById('pitch-wrap') || document.getElementById('pitch');
  if (!pitchEl) { showToast('Elemento do campo não encontrado'); return; }

  showToast('A preparar gravação…');

  // Use html2canvas-style approach: render pitch to offscreen canvas each frame
  const W = 1280, H = Math.round(1280 * (pitchEl.offsetHeight / pitchEl.offsetWidth)) || 800;
  const recCanvas = document.createElement('canvas');
  recCanvas.width = W; recCanvas.height = H;
  const recCtx = recCanvas.getContext('2d');

  // Check for supported mimeTypes
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : null;

  if (!mimeType) {
    // Fallback: use getDisplayMedia (old method)
    try {
      const ok = confirm('O seu browser não suporta gravação directa. Vamos usar a captura de ecrã.');
      if (!ok) return;
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser" }, audio: false });
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `tactical-lab-${Date.now()}.webm`; a.click();
        URL.revokeObjectURL(url); showToast('Vídeo exportado!'); stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      showToast('A gravar… Animação vai começar');
      setTimeout(async () => { await playKF(); setTimeout(() => recorder.stop(), 800); }, 1500);
    } catch (e) { showToast('Gravação cancelada'); }
    return;
  }

  // Main approach: capture pitch element frames
  const stream = recCanvas.captureStream(30); // 30fps
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4000000 });
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tactical-lab-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('🎬 Vídeo exportado com sucesso!');
    cancelAnimationFrame(_recRaf);
  };

  // Render loop: paint pitch-wrap to canvas
  let _recRaf;
  function renderFrame() {
    try {
      // Use SVG foreignObject approach to render DOM to canvas
      const data = `<svg xmlns="http://www.w3.org/2000/svg" width="${pitchEl.offsetWidth}" height="${pitchEl.offsetHeight}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml">${pitchEl.outerHTML}</div>
        </foreignObject>
      </svg>`;
      // Unfortunately foreignObject can't capture CSS well, so we use a simpler approach:
      // paint the keyframe state directly to canvas
    } catch(e) {}

    // Paint field background
    recCtx.fillStyle = '#0c1f15';
    recCtx.fillRect(0, 0, W, H);
    // Stripes
    const stripeH = H / 14;
    for (let i = 0; i < 14; i++) {
      recCtx.fillStyle = i % 2 === 0 ? '#1a4c2a' : '#164424';
      recCtx.fillRect(0, i * stripeH, W, stripeH);
    }
    // Field lines
    recCtx.strokeStyle = 'rgba(255,255,255,.7)';
    recCtx.lineWidth = 2;
    const fm = 30;
    recCtx.strokeRect(fm, fm, W - fm*2, H - fm*2);
    recCtx.beginPath(); recCtx.moveTo(fm, H/2); recCtx.lineTo(W-fm, H/2); recCtx.stroke();
    recCtx.beginPath(); recCtx.arc(W/2, H/2, 60, 0, Math.PI*2); recCtx.stroke();
    recCtx.beginPath(); recCtx.arc(W/2, H/2, 3, 0, Math.PI*2); recCtx.fillStyle='white'; recCtx.fill();
    // Penalty boxes
    const pbW = 260, pbH = 100;
    recCtx.strokeRect(W/2 - pbW/2, fm, pbW, pbH);
    recCtx.strokeRect(W/2 - pbW/2, H - fm - pbH, pbW, pbH);

    // Players (read current DOM positions)
    State.players.forEach(p => {
      const el = document.getElementById(`tp${p.id}`);
      if (!el) return;
      const xp = parseFloat(el.style.left) || 0;
      const yp = parseFloat(el.style.top) || 0;
      const px = (xp / 100) * W;
      const py = (yp / 100) * H;
      recCtx.beginPath(); recCtx.arc(px, py, 14, 0, Math.PI*2);
      recCtx.fillStyle = p.isGk ? '#5bbfff' : '#3ddc84';
      recCtx.fill();
      recCtx.fillStyle = '#031108';
      recCtx.font = 'bold 11px sans-serif'; recCtx.textAlign = 'center'; recCtx.textBaseline = 'middle';
      recCtx.fillText(p.n, px, py);
    });
    State.opp.forEach(p => {
      const el = document.getElementById(`tp${p.id}`);
      if (!el) return;
      const xp = parseFloat(el.style.left) || 0;
      const yp = parseFloat(el.style.top) || 0;
      const px = (xp / 100) * W;
      const py = (yp / 100) * H;
      recCtx.beginPath(); recCtx.arc(px, py, 14, 0, Math.PI*2);
      recCtx.fillStyle = '#ff6b4a'; recCtx.fill();
    });
    // Ball
    const ball = document.getElementById('ball');
    if (ball) {
      const bx = (parseFloat(ball.style.left) || 50) / 100 * W;
      const by = (parseFloat(ball.style.top) || 50) / 100 * H;
      recCtx.beginPath(); recCtx.arc(bx, by, 8, 0, Math.PI*2);
      recCtx.fillStyle = 'white'; recCtx.fill();
      recCtx.strokeStyle = '#333'; recCtx.lineWidth = 1; recCtx.stroke();
    }

    _recRaf = requestAnimationFrame(renderFrame);
  }

  // Start recording
  recorder.start();
  renderFrame();
  showToast('🔴 A gravar animação…');

  // Play animation then stop
  await playKF();
  setTimeout(() => {
    cancelAnimationFrame(_recRaf);
    recorder.stop();
    stream.getTracks().forEach(t => t.stop());
  }, 1000);
}

// ─── Presentation Mode ────────────────────────────────────────────────────────

let _presIdx = 0;

function togglePresentation() {
  const isPres = document.body.classList.contains('presentation-mode');
  const overlay = document.getElementById('presentation-overlay');
  const presField = document.getElementById('pres-field');
  const viewTactic = document.getElementById('view-tactic');
  const pitchWrap = document.getElementById('pitch-wrap');

  if (isPres) {
    document.body.classList.remove('presentation-mode');
    overlay.classList.remove('active');
    // Restore pitch-wrap to original position
    if (viewTactic && pitchWrap) {
      viewTactic.appendChild(pitchWrap);
    }
  } else {
    if (State.keyframes.length === 0) { showToast('Sem fotogramas'); return; }
    document.body.classList.add('presentation-mode');
    overlay.classList.add('active');
    // Move pitch-wrap to presentation overlay
    if (presField && pitchWrap) {
      presField.appendChild(pitchWrap);
    }
    _presIdx = 0;
    jumpPresFrame(0);
  }
}

function jumpPresFrame(dir) {
  if (State.keyframes.length === 0) return;
  _presIdx += dir;
  if (_presIdx < 0) _presIdx = 0;
  if (_presIdx >= State.keyframes.length) _presIdx = State.keyframes.length - 1;
  
  document.getElementById('pres-frame-info').textContent = `Frame ${_presIdx + 1}/${State.keyframes.length}`;
  
  const kf = State.keyframes[_presIdx];
  kf.players.forEach(kp => {
    const el = document.getElementById(`tp${kp.id}`);
    if (el) {
      el.style.left = `${kp.xp}%`; el.style.top = `${kp.yp}%`;
      el.style.setProperty('--pl-angle', `${kp.ang || 0}rad`);
    }
  });
  (kf.opp || []).forEach(kp => {
    const el = document.getElementById(`tp${kp.id}`); // Fix oppo -> tp
    if (el) {
      el.style.left = `${kp.xp}%`; el.style.top = `${kp.yp}%`;
      el.style.setProperty('--pl-angle', `${kp.ang || 0}rad`);
    }
  });
  const ball = document.getElementById('ball');
  if (kf.ball && ball) {
    ball.style.left = `${kf.ball.x}%`;
    ball.style.top  = `${kf.ball.y}%`;
  }
  
  // Restore shapes during presentation
  State.tShapes = kf.tShapes ? JSON.parse(JSON.stringify(kf.tShapes)) : [];
  State.bShapes = kf.bShapes ? JSON.parse(JSON.stringify(kf.bShapes)) : [];
  State.pShapes = kf.pShapes ? JSON.parse(JSON.stringify(kf.pShapes)) : [];
  window.dispatchEvent(new Event('tl-rebuild'));
}

// ─── Toolbar Tabs Logic ────────────────────────────────────────────────────────
document.querySelectorAll('.tb-tab').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.tb-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tb-panel').forEach(p => p.classList.remove('active'));
    const tab = e.currentTarget;
    tab.classList.add('active');
    const targetId = 'tb-' + tab.dataset.tb;
    const targetPanel = document.getElementById(targetId);
    if (targetPanel) targetPanel.classList.add('active');
  });
});

// ─── Fullscreen & Orientation Logic ──────────────────────────────────────────
(function () {
  const PITCH_RATIO = 105 / 68; // height / width of the real pitch

  function applyFsPitchLayout() {
    const pitch = document.getElementById('pitch');
    if (!pitch) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isLandscape = vw > vh;

    if (isLandscape) {
      // In landscape we rotate the (portrait) pitch -90° so the long axis runs horizontally.
      // After rotation the visual width = pitch element height, visual height = pitch element width.
      // We want to fit inside vw × vh:
      //   pitch_el_h / pitch_el_w = PITCH_RATIO → pitch_el_w = pitch_el_h / PITCH_RATIO
      //   visual width  = pitch_el_h  ≤ vw
      //   visual height = pitch_el_w  ≤ vh  →  pitch_el_h / PITCH_RATIO ≤ vh
      const pitchElH = Math.min(vw, vh * PITCH_RATIO);
      const pitchElW = pitchElH / PITCH_RATIO;
      pitch.style.width  = pitchElW + 'px';
      pitch.style.height = pitchElH + 'px';
      pitch.style.transform = 'rotate(-90deg)';
      pitch.style.transformOrigin = 'center center';
      pitch.style.maxWidth  = 'none';
      pitch.style.maxHeight = 'none';
    } else {
      // Portrait – fit to width
      const pitchElW = Math.min(vw, vh / PITCH_RATIO);
      const pitchElH = pitchElW * PITCH_RATIO;
      pitch.style.width  = pitchElW + 'px';
      pitch.style.height = pitchElH + 'px';
      pitch.style.transform = 'none';
      pitch.style.transformOrigin = '';
      pitch.style.maxWidth  = 'none';
      pitch.style.maxHeight = 'none';
    }
  }

  function clearFsPitchLayout() {
    const pitch = document.getElementById('pitch');
    if (!pitch) return;
    pitch.style.width  = '';
    pitch.style.height = '';
    pitch.style.transform = '';
    pitch.style.transformOrigin = '';
    pitch.style.maxWidth  = '';
    pitch.style.maxHeight = '';
  }

  const btnFs = document.getElementById('btn-field-fs');
  if (btnFs) {
    btnFs.addEventListener('click', async () => {
      const isFs = document.body.classList.toggle('field-fullscreen');

      if (isFs) {
        try {
          const docEl = document.documentElement;
          if (docEl.requestFullscreen) await docEl.requestFullscreen();
          else if (docEl.webkitRequestFullscreen) await docEl.webkitRequestFullscreen();
        } catch (e) {
          console.warn('Fullscreen API error:', e);
        }
        // Apply layout after browser has resized
        requestAnimationFrame(() => requestAnimationFrame(applyFsPitchLayout));
      } else {
        try {
          if (document.fullscreenElement || document.webkitFullscreenElement) {
            if (document.exitFullscreen) await document.exitFullscreen();
            else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
          }
        } catch (e) {
          console.warn('Exit Fullscreen error:', e);
        }
        clearFsPitchLayout();
      }
    });
  }

  // Re-apply on window resize (handles orientation change on mobile too)
  window.addEventListener('resize', () => {
    if (document.body.classList.contains('field-fullscreen')) {
      applyFsPitchLayout();
    }
  });

  // Sync CSS class when user exits fullscreen via Escape key
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      document.body.classList.remove('field-fullscreen');
      clearFsPitchLayout();
    }
  });
})();

// ─── Plantel Panel Render ─────────────────────────────────────────────────────
function renderPlantel() {
  const body = document.getElementById('tp-body');
  if (!body) return;
  const players = State.players || [];
  if (!players.length) {
    body.innerHTML = '<div style="padding:10px;font-size:11px;color:var(--t3);">Nenhum jogador no campo.</div>';
    return;
  }
  body.innerHTML = players.map(pl => {
    const score   = getOverallScore(pl.id);
    const cls     = score >= 6.5 ? 'high' : score >= 4 ? 'mid' : 'low';
    const posName = PNAMES[pl.id - 1] || pl.name || `J${pl.id}`;
    return `
      <div class="tp-player-row" data-pid="${pl.id}" role="button" tabindex="0"
           title="Avaliar ${pl.name || posName}" style="cursor:pointer;">
        <span class="tp-player-num">${pl.n}</span>
        <div class="tp-player-info">
          <span class="tp-player-name">${pl.name || posName}</span>
          <span class="tp-player-pos">${posName}</span>
        </div>
        <span class="tp-pfit-badge ${cls}">${score.toFixed(1)}</span>
      </div>`;
  }).join('');

  // Click to open PlayerFit
  body.querySelectorAll('.tp-player-row').forEach(row => {
    const handler = () => {
      const pid    = Number(row.dataset.pid);
      const pl     = State.players.find(p => p.id === pid);
      if (!pl) return;
      const posName = PNAMES[pl.id - 1] || pl.name || `J${pl.id}`;
      openPlayerFit(pl.id, pl.name || posName, posName, () => renderPlantel());
    };
    row.addEventListener('click', handler);
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); });
  });
}

// Listen for updates from player-editor
window.addEventListener('tl-plantel-update', () => {
  if (!document.getElementById('tactic-panel').classList.contains('collapsed')) {
    renderPlantel();
  }
});

// ─── Share Tactic ─────────────────────────────────────────────────────────────

/** Generate a shareable URL from the current session */
function generateShareURL() {
  const session = buildSession();
  const payload = JSON.stringify({ v: 1, session });
  const encoded = btoa(unescape(encodeURIComponent(payload)));
  return `${location.origin}${location.pathname}#share=${encoded}`;
}

/** Very small QR-like pattern using canvas — just a visual placeholder using real URL */
function drawQRCode(canvas, text) {
  // Use the qrcodejs approach: encode URL as a visual matrix
  // Since we have no library, we draw a simple "branded" placeholder with the URL
  const ctx  = canvas.getContext('2d');
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);

  // Background
  ctx.fillStyle = '#0e1a12';
  ctx.fillRect(0, 0, size, size);

  // Generate a deterministic cell grid from text hash
  const cells = 21;
  const cs    = Math.floor(size / (cells + 4));
  const off   = Math.floor((size - cs * cells) / 2);

  // Simple hash
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash) + text.charCodeAt(i);

  ctx.fillStyle = '#3ddc84';
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      // Finder patterns (corners)
      const inFinder =
        (r < 7 && c < 7) || (r < 7 && c >= cells - 7) || (r >= cells - 7 && c < 7);
      let on;
      if (inFinder) {
        const fr = r % 7, fc = c % 7;
        const pr = r >= cells - 7 ? r - (cells - 7) : r;
        const pc = c >= cells - 7 ? c - (cells - 7) : c;
        on = (pr === 0 || pr === 6 || pc === 0 || pc === 6 ||
              (pr >= 2 && pr <= 4 && pc >= 2 && pc <= 4));
      } else {
        const bit = (hash >> ((r * cells + c) % 31)) & 1;
        on = !!bit;
      }
      if (on) ctx.fillRect(off + c * cs, off + r * cs, cs - 1, cs - 1);
    }
  }
  // Border label
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Scan ou copiar link', size / 2, size - 5);
}

// Share modal events
(function () {
  const overlay   = document.getElementById('share-overlay');
  const closeBtn  = document.getElementById('share-modal-close');
  const input     = document.getElementById('share-url-input');
  const copyBtn   = document.getElementById('share-copy-btn');
  const qrCanvas  = document.getElementById('share-qr-canvas');
  const openBtn   = document.getElementById('btn-share-tactic');

  if (!overlay) return;

  function openShare() {
    const url = generateShareURL();
    if (input) input.value = url;
    if (qrCanvas) drawQRCode(qrCanvas, url);
    overlay.classList.add('active');
  }

  function closeShare() {
    overlay.classList.remove('active');
  }

  openBtn?.addEventListener('click', openShare);
  closeBtn?.addEventListener('click', closeShare);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeShare(); });

  copyBtn?.addEventListener('click', () => {
    const url = input?.value;
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      copyBtn.classList.add('copied');
      copyBtn.innerHTML = '✓ Copiado!';
      setTimeout(() => {
        copyBtn.classList.remove('copied');
        copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copiar';
      }, 2000);
    }).catch(() => {
      // Fallback for older browsers
      input.select();
      document.execCommand('copy');
    });
  });

  // Auto-load from share URL on startup
  const m = location.hash.match(/^#share=(.+)/);
  if (m) {
    try {
      const decoded = decodeURIComponent(escape(atob(m[1])));
      const data    = JSON.parse(decoded);
      if (data?.session) {
        restoreSession(data.session);
        showToast('✅ Tática partilhada carregada!');
        history.replaceState(null, '', location.pathname);
      }
    } catch { /* ignore malformed */ }
  }
})();

