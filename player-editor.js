/**
 * player-editor.js ??? Inline player label editor
 *
 * Double-clicking a selected player opens a small floating input
 * directly above the player token to rename it (label or number).
 * Pressing Enter or clicking away commits the change.
 */

'use strict';

import { State, Club, pushHistory } from './state.js';
import { getPlayerToken, applyLabelMode } from './club.js';
import { showToast } from './render.js';

let _activeEditor = null;

/**
 * Open an inline editor for a tactic-view team player.
 * @param {number|string} playerId
 * @param {HTMLElement} playerEl
 */
export function openPlayerEditor(playerId, playerEl) {
  closePlayerEditor(); // close any existing

  let isOpp = String(playerId).startsWith('o');
  const player = isOpp
    ? State.opp.find(p => p.id === playerId)
    : State.players.find(p => p.id === playerId);
  if (!player) return;

  const pitch = document.getElementById('pitch');
  const pRect = pitch.getBoundingClientRect();
  const eRect = playerEl.getBoundingClientRect();

  const editor = document.createElement('div');
  editor.id = 'player-editor';
  editor.setAttribute('role', 'dialog');
  editor.setAttribute('aria-label', 'Editar jogador');

  const currentToken = getPlayerToken(player);

  editor.innerHTML = `
    <div class="pe-title">Editar ${isOpp ? 'Advers??rio' : 'Jogador'}</div>
    <div class="pe-row">
      <label class="pe-lbl">N??mero</label>
      <input class="pe-input" id="pe-number" type="number" min="1" max="99"
        value="${player.n}" aria-label="N??mero da camisola">
    </div>
    <div class="pe-row">
      <label class="pe-lbl">Nome no Plantel</label>
      <input class="pe-input" id="pe-name" type="text"
        placeholder="Ex: Gon??alo Ramos" value="${player.name || ''}" aria-label="Nome completo">
    </div>
    <div class="pe-row">
      <label class="pe-lbl">Nome no Token</label>
      <input class="pe-input" id="pe-label" type="text" maxlength="8"
        placeholder="Ex: Ramos" value="${player.label || ''}" aria-label="Nome curto">
    </div>
    <div class="pe-actions">
      <button class="pe-btn cancel" id="pe-cancel">Cancelar</button>
      <button class="pe-btn ok" id="pe-ok">Guardar</button>
    </div>`;

  // Position near the player token
  const left = Math.min(
    Math.max(eRect.left - pRect.left - 10, 4),
    pRect.width - 210
  );
  const top = Math.max(eRect.top - pRect.top - 160, 4);

  editor.style.cssText = `
    position:absolute;left:${left}px;top:${top}px;
    z-index:50;width:210px;`;

  pitch.appendChild(editor);
  _activeEditor = editor;

  const numInput  = editor.querySelector('#pe-number');
  const nameInput = editor.querySelector('#pe-name');
  const lblInput  = editor.querySelector('#pe-label');
  const okBtn     = editor.querySelector('#pe-ok');
  const cancelBtn = editor.querySelector('#pe-cancel');

  // Focus the relevant input
  if (Club.labelMode === 'name') nameInput.focus();
  else numInput.focus();

  const commit = () => {
    const newNum = parseInt(numInput.value, 10);
    const newName = nameInput.value.trim();
    const newLbl = lblInput.value.trim();
    if (!isNaN(newNum) && newNum > 0 && newNum < 100) {
      pushHistory();
      player.n     = newNum;
      player.name  = newName || `J${newNum}`;
      player.label = newLbl || null;
      // Update DOM token
      const tok = playerEl.querySelector('.pl-tok');
      if (tok) tok.textContent = getPlayerToken(player);
      // Update aria-label
      const nameEl = playerEl.querySelector('.pl-nm');
      if (nameEl) nameEl.textContent = player.name;
      showToast('Jogador actualizado');
      // If team player, re-render plantel
      if (!isOpp) {
        // App function is global or we trigger it via an event.
        // Let's rely on re-rendering by clicking toggle again, or dispatch a custom event.
        window.dispatchEvent(new Event('tl-plantel-update'));
      }
    }
    closePlayerEditor();
  };

  okBtn.addEventListener('click', commit);
  cancelBtn.addEventListener('click', closePlayerEditor);
  [numInput, nameInput, lblInput].forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') closePlayerEditor();
      e.stopPropagation(); // don't trigger app keyboard shortcuts
    });
  });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('mousedown', _outsideClick, { once: false });
  }, 50);
}

function _outsideClick(e) {
  if (_activeEditor && !_activeEditor.contains(e.target)) {
    closePlayerEditor();
  }
}

export function closePlayerEditor() {
  if (_activeEditor) {
    _activeEditor.remove();
    _activeEditor = null;
    document.removeEventListener('mousedown', _outsideClick);
  }
}
