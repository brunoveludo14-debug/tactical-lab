import { saveSession, getSaves, loadSession, deleteSession } from '../storage.js';
import { renderSaveList } from '../render.js';

let _onLoadCallback = null;
export function setOnLoadCallback(cb) { _onLoadCallback = cb; }

// --- Toasts ---
let _toastTimeout;
export function showToast(msg, duration = 2200) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimeout);
  _toastTimeout = setTimeout(() => {
    t.classList.remove('show');
  }, duration);
}

// --- Custom Prompt ---
export function askPrompt(title, defaultText = '') {
  return new Promise(resolve => {
    const ov = document.getElementById('prompt-overlay');
    const input = document.getElementById('prompt-input-el');
    const titleEl = document.getElementById('prompt-title-el');
    const btnCancel = document.getElementById('prompt-cancel');
    const btnConfirm = document.getElementById('prompt-confirm');
    if (!ov || !input || !titleEl) { resolve(null); return; }

    titleEl.textContent = title;
    input.value = defaultText;

    const cleanup = () => {
      ov.style.opacity = '0';
      setTimeout(() => ov.style.display = 'none', 200);
      btnCancel.removeEventListener('click', onCancel);
      btnConfirm.removeEventListener('click', onConfirm);
      input.removeEventListener('keydown', onKey);
    };

    const onCancel = () => { cleanup(); resolve(null); };
    const onConfirm = () => { cleanup(); resolve(input.value); };
    const onKey = (e) => {
      if (e.key === 'Enter') onConfirm();
      if (e.key === 'Escape') onCancel();
    };

    btnCancel.addEventListener('click', onCancel);
    btnConfirm.addEventListener('click', onConfirm);
    input.addEventListener('keydown', onKey);

    ov.style.display = 'flex';
    // Trigger reflow
    void ov.offsetWidth;
    ov.style.opacity = '1';
    input.focus();
    if (defaultText) input.select();
  });
}

// --- Modals ---
export function bindModal() {
  document.getElementById('btn-save-ok')?.addEventListener('click', doSave);
  document.getElementById('save-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSave();
  });
  document.getElementById('modal-close')?.addEventListener('click', closeModal);
  document.getElementById('modal-ov')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
}

export function openSaveModal() {
  const title = document.getElementById('modal-title-txt');
  if(title) title.textContent = 'Guardar Sessão';
  const saveArea = document.getElementById('save-area');
  if(saveArea) saveArea.style.display = 'flex';
  const saveName = document.getElementById('save-name');
  if(saveName) saveName.value = '';
  document.getElementById('modal-ov')?.classList.add('open');
  refreshSaveList();
  if(saveName) setTimeout(() => saveName.focus(), 100);
}

export function openLoadModal() {
  const title = document.getElementById('modal-title-txt');
  if(title) title.textContent = 'Carregar Sessão';
  const saveArea = document.getElementById('save-area');
  if(saveArea) saveArea.style.display = 'none';
  document.getElementById('modal-ov')?.classList.add('open');
  refreshSaveList();
}

export function closeModal() {
  document.getElementById('modal-ov')?.classList.remove('open');
}

export async function doSave() {
  const saveName = document.getElementById('save-name');
  if(!saveName) return;
  const name = saveName.value.trim();
  const btn = document.getElementById('btn-save-ok');
  if(btn) btn.textContent = 'A guardar...';
  
  await saveSession(name);
  refreshSaveList();
  
  if(btn) {
    btn.textContent = '✓ Guardado!';
    setTimeout(() => { btn.textContent = 'Guardar'; }, 1400);
  }
  showToast('Sessão guardada');
}

export function refreshSaveList() {
  renderSaveList(getSaves(), (id) => {
    const err = loadSession(id);
    if (err) { showToast(`Erro: ${err}`); return; }
    if (_onLoadCallback) _onLoadCallback();
    closeModal();
    showToast('Sessão carregada');
  }, (id) => {
    if (!confirm('Eliminar esta sessão?')) return;
    deleteSession(id);
    refreshSaveList();
  });
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
