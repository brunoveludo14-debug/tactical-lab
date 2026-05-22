/**
 * club.js ??? Club personalisation UI
 *
 * Renders the club settings panel and applies colours via CSS custom properties.
 * Reads/writes to Club object in state.js and persists via saveClubConfig().
 */

'use strict';

import { Club, saveClubConfig } from './state.js';

/** Apply Club colours to CSS custom properties on :root */
export function applyClubColors() {
  const root = document.documentElement;
  root.style.setProperty('--club-main', Club.colorMain);
  root.style.setProperty('--club-gk',   Club.colorGk);
  root.style.setProperty('--opp',       Club.colorOpp);
  root.style.setProperty('--opp-gk',    Club.colorOppGk);

  // Update all player tokens to reflect club color
  document.querySelectorAll('.pl-f .pl-tok').forEach(tok => {
    tok.style.background = Club.colorMain;
    tok.style.boxShadow  = `0 0 16px ${Club.colorMain}70, 0 2px 8px rgba(0,0,0,.5)`;
    tok.style.color      = getContrastColor(Club.colorMain);
    tok.style.borderColor= `${Club.colorMain}70`;
  });
  document.querySelectorAll('.pl-gk .pl-tok').forEach(tok => {
    tok.style.background = Club.colorGk;
    tok.style.boxShadow  = `0 0 16px ${Club.colorGk}80, 0 2px 8px rgba(0,0,0,.5)`;
    tok.style.color      = getContrastColor(Club.colorGk);
    tok.style.borderColor= `${Club.colorGk}70`;
  });
  document.querySelectorAll('.pl-opp .pl-tok').forEach(tok => {
    tok.style.background = Club.colorOpp;
    tok.style.boxShadow  = `0 0 16px ${Club.colorOpp}70, 0 2px 8px rgba(0,0,0,.5)`;
    tok.style.color      = getContrastColor(Club.colorOpp);
    tok.style.borderColor= `${Club.colorOpp}70`;
  });
  document.querySelectorAll('.pl-opp-gk .pl-tok').forEach(tok => {
    tok.style.background = Club.colorOppGk;
    tok.style.boxShadow  = `0 0 16px ${Club.colorOppGk}80, 0 2px 8px rgba(0,0,0,.5)`;
    tok.style.color      = getContrastColor(Club.colorOppGk);
    tok.style.borderColor= `${Club.colorOppGk}70`;
  });

  // Update club name in topbar if present
  const nameEl = document.getElementById('club-name-display');
  if (nameEl) nameEl.textContent = Club.name || 'Tactical Lab';
}

/** Update all player token labels based on labelMode ('number' | 'name') */
export function applyLabelMode(players) {
  players.forEach(p => {
    const el = document.getElementById(`tp${p.id}`);
    if (!el) return;
    const tok = el.querySelector('.pl-tok');
    if (tok) tok.textContent = getPlayerToken(p);
  });
}

/** Get the display token for a player given current Club.labelMode */
export function getPlayerToken(p) {
  if (Club.labelMode === 'name' && p.label) {
    return p.label.slice(0, 4).toUpperCase(); // max 4 chars in token
  }
  return p.n;
}

/** Compute readable text colour for a given background */
function getContrastColor(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  const luminance = (0.299*r + 0.587*g + 0.114*b) / 255;
  return luminance > 0.5 ? '#0a1a0a' : '#e4ede5';
}

/** Open the club settings panel (modal) */
export function openClubPanel() {
  const ov = document.getElementById('club-modal-ov');
  if (!ov) return;

  // Populate current values
  const nameIn   = document.getElementById('club-name-input');
  const mainIn   = document.getElementById('club-color-main');
  const gkIn     = document.getElementById('club-color-gk');
  const oppIn    = document.getElementById('club-color-opp');
  const oppGkIn  = document.getElementById('club-color-opp-gk');
  const numBtn   = document.getElementById('club-label-num');
  const nameBtn  = document.getElementById('club-label-name');
  const preview  = document.getElementById('club-color-preview');

  if (nameIn)   nameIn.value  = Club.name;
  if (mainIn)   mainIn.value  = Club.colorMain;
  if (gkIn)     gkIn.value    = Club.colorGk;
  if (oppIn)    oppIn.value   = Club.colorOpp;
  if (oppGkIn)  oppGkIn.value = Club.colorOppGk;
  if (numBtn)   numBtn.classList.toggle('active', Club.labelMode === 'number');
  if (nameBtn)  nameBtn.classList.toggle('active', Club.labelMode === 'name');
  updatePreview(preview, Club.colorMain, Club.colorGk, Club.colorOpp, Club.colorOppGk);

  ov.classList.add('open');
}

export function closeClubPanel() {
  document.getElementById('club-modal-ov')?.classList.remove('open');
}

/** Bind all events inside the club panel */
export function bindClubPanel(onChanged) {
  const mainIn   = document.getElementById('club-color-main');
  const gkIn     = document.getElementById('club-color-gk');
  const oppIn    = document.getElementById('club-color-opp');
  const oppGkIn  = document.getElementById('club-color-opp-gk');
  const nameIn   = document.getElementById('club-name-input');
  const numBtn   = document.getElementById('club-label-num');
  const nameBtn  = document.getElementById('club-label-name');
  const saveBtn  = document.getElementById('club-save-btn');
  const closeBtn = document.getElementById('club-modal-close');
  const ov       = document.getElementById('club-modal-ov');
  const preview  = document.getElementById('club-color-preview');

  const refreshPreview = () => {
    updatePreview(preview,
      mainIn?.value || Club.colorMain,
      gkIn?.value   || Club.colorGk,
      oppIn?.value  || Club.colorOpp,
      oppGkIn?.value|| Club.colorOppGk
    );
  };

  mainIn?.addEventListener('input',   refreshPreview);
  gkIn?.addEventListener('input',     refreshPreview);
  oppIn?.addEventListener('input',    refreshPreview);
  oppGkIn?.addEventListener('input',  refreshPreview);

  numBtn?.addEventListener('click', () => {
    numBtn.classList.add('active');
    nameBtn?.classList.remove('active');
  });
  nameBtn?.addEventListener('click', () => {
    nameBtn.classList.add('active');
    numBtn?.classList.remove('active');
  });

  saveBtn?.addEventListener('click', () => {
    Club.name       = nameIn?.value.trim() || '';
    Club.colorMain  = mainIn?.value  || '#3ddc84';
    Club.colorGk    = gkIn?.value    || '#5bbfff';
    Club.colorOpp   = oppIn?.value   || '#ff6b4a';
    Club.colorOppGk = oppGkIn?.value || '#ff9f1c';
    Club.labelMode  = nameBtn?.classList.contains('active') ? 'name' : 'number';
    saveClubConfig();
    applyClubColors();
    if (onChanged) onChanged();
    closeClubPanel();
  });

  closeBtn?.addEventListener('click', closeClubPanel);
  ov?.addEventListener('click', e => { if (e.target === ov) closeClubPanel(); });
}

function updatePreview(el, colorMain, colorGk) {
  if (!el) return;
  el.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;justify-content:center;padding:10px;">
      <div style="width:34px;height:34px;border-radius:50%;background:${colorGk};
        display:flex;align-items:center;justify-content:center;
        font-family:'DM Mono',monospace;font-size:11px;font-weight:700;
        color:${getContrastColor(colorGk)};
        box-shadow:0 0 12px ${colorGk}80;">
        GR
      </div>
      ${[7,8,9,10,11].map(n => `
        <div style="width:34px;height:34px;border-radius:50%;background:${colorMain};
          display:flex;align-items:center;justify-content:center;
          font-family:'DM Mono',monospace;font-size:11px;font-weight:700;
          color:${getContrastColor(colorMain)};
          box-shadow:0 0 12px ${colorMain}70;">
          ${n}
        </div>
      `).join('')}
    </div>`;
}
