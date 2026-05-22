/**
 * playerfit.js ??? Sistema de avalia????o de jogadores por posi????o
 *
 * Guarda ratings por jogador em localStorage (chave: tl_playerfit).
 * Cada entrada: { id, name, vel, tec, fis, men }  ??? valores 0-10
 *
 * UI: modal que abre ao clicar numa linha do plantel.
 */
'use strict';

const KEY = 'tl_playerfit';
const ATTRS = [
  { key: 'vel', label: 'Velocidade', icon: '???' },
  { key: 'tec', label: 'T??cnica',    icon: '????' },
  { key: 'fis', label: 'F??sico',     icon: '????' },
  { key: 'men', label: 'Mentalidade',icon: '????' },
];

// ????????? Persistence ??????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
  catch { return {}; }
}

function writeAll(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

export function getPlayerRating(playerId) {
  return readAll()[playerId] || { vel: 5, tec: 5, fis: 5, men: 5 };
}

export function savePlayerRating(playerId, ratings) {
  const all = readAll();
  all[playerId] = { ...ratings };
  writeAll(all);
}

/** Overall score 0-10, weighted average */
export function getOverallScore(playerId) {
  const r = getPlayerRating(playerId);
  return Math.round((r.vel + r.tec + r.fis + r.men) / 4 * 10) / 10;
}

// ????????? UI ?????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

let _overlay = null;

function ensureOverlay() {
  if (_overlay) return _overlay;

  _overlay = document.createElement('div');
  _overlay.id = 'pfit-overlay';
  _overlay.innerHTML = `
    <div id="pfit-modal">
      <div class="pfit-head">
        <div>
          <div class="pfit-name" id="pfit-player-name">Jogador</div>
          <div class="pfit-pos" id="pfit-player-pos">Posi????o</div>
        </div>
        <div class="pfit-overall-wrap">
          <div class="pfit-overall" id="pfit-overall">5.0</div>
          <div class="pfit-overall-label">Overall</div>
        </div>
        <button class="pfit-close" id="pfit-close">???</button>
      </div>
      <div class="pfit-attrs" id="pfit-attrs"></div>
      <div class="pfit-actions">
        <button class="pfit-btn pfit-save" id="pfit-save">???? Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(_overlay);

  _overlay.addEventListener('click', e => { if (e.target === _overlay) closePlayerFit(); });
  document.getElementById('pfit-close').addEventListener('click', closePlayerFit);
  document.getElementById('pfit-save').addEventListener('click', _onSave);

  return _overlay;
}

let _currentPlayerId = null;
let _currentRatings  = {};
let _onSaveCallback  = null;

function _buildSlider(attr, value) {
  return `
    <div class="pfit-attr">
      <div class="pfit-attr-top">
        <span class="pfit-attr-icon">${attr.icon}</span>
        <span class="pfit-attr-label">${attr.label}</span>
        <span class="pfit-attr-val" id="pfit-val-${attr.key}">${value}</span>
      </div>
      <div class="pfit-slider-wrap">
        <input type="range" min="0" max="10" step="1" value="${value}"
               id="pfit-range-${attr.key}" class="pfit-range"
               data-attr="${attr.key}">
        <div class="pfit-slider-bar">
          <div class="pfit-slider-fill" id="pfit-fill-${attr.key}"
               style="width:${value * 10}%"></div>
        </div>
      </div>
    </div>`;
}

function _updateOverall() {
  const sum = ATTRS.reduce((s, a) => s + (_currentRatings[a.key] || 0), 0);
  const avg = Math.round(sum / ATTRS.length * 10) / 10;
  const el  = document.getElementById('pfit-overall');
  if (el) {
    el.textContent = avg.toFixed(1);
    // Colour: red < 4, orange < 6.5, green >= 6.5
    el.style.color = avg >= 6.5 ? 'var(--acc)' : avg >= 4 ? '#f0c040' : '#e85555';
  }
}

function _onSave() {
  savePlayerRating(_currentPlayerId, { ..._currentRatings });
  if (_onSaveCallback) _onSaveCallback(_currentPlayerId);
  closePlayerFit();
}

export function openPlayerFit(playerId, playerName, posLabel, onSave) {
  const ov = ensureOverlay();
  _currentPlayerId = playerId;
  _currentRatings  = { ...getPlayerRating(playerId) };
  _onSaveCallback  = onSave || null;

  document.getElementById('pfit-player-name').textContent = playerName;
  document.getElementById('pfit-player-pos').textContent  = posLabel;

  const container = document.getElementById('pfit-attrs');
  container.innerHTML = ATTRS.map(a => _buildSlider(a, _currentRatings[a.key] ?? 5)).join('');

  // Bind sliders
  ATTRS.forEach(attr => {
    const range = document.getElementById(`pfit-range-${attr.key}`);
    const fill  = document.getElementById(`pfit-fill-${attr.key}`);
    const valEl = document.getElementById(`pfit-val-${attr.key}`);
    range.addEventListener('input', () => {
      const v = Number(range.value);
      _currentRatings[attr.key] = v;
      fill.style.width = v * 10 + '%';
      valEl.textContent = v;
      _updateOverall();
    });
  });

  _updateOverall();
  ov.classList.add('active');
}

export function closePlayerFit() {
  _overlay?.classList.remove('active');
}
