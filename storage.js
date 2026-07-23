/**
 * storage.js — Persistence layer
 *
 * Handles localStorage read/write, autosave, JSON export/import.
 * Isolated so the rest of the app never touches localStorage directly.
 */

'use strict';

import { buildSession, restoreSession } from './state.js';
// Supabase removido — cloud sync desativado

const SAVES_KEY    = 'tacticallab_saves';
const AUTOSAVE_KEY = 'tacticallab_autosave';
const SCHEMA_VERSION = 2;
const MAX_SAVES = 50;

// ─── Raw localStorage helpers ─────────────────────────────────────────────────

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    // QuotaExceededError or SecurityError
    console.warn('[storage] write failed:', err);
    return false;
  }
}

// ─── Named saves ─────────────────────────────────────────────────────────────

/** @returns {SaveEntry[]} */
export function getSaves() {
  const raw = readJSON(SAVES_KEY);
  if (!Array.isArray(raw)) return [];
  // Filter out corrupt entries
  return raw.filter(s => s && s.id && s.name);
}

/** @param {SaveEntry[]} saves */
function putSaves(saves) {
  writeJSON(SAVES_KEY, saves.slice(0, MAX_SAVES));
}

/**
 * Save current State under a given name.
 * @param {string} name
 * @returns {SaveEntry}
 */
export async function saveSession(name, existingId = null) {
  const sessionData = buildSession();
  const entryName = name.trim() || `Sessão ${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
  
  let entry = {
    id: existingId || Date.now(),
    name: entryName,
    date: new Date().toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }),
    session: sessionData,
  };

  if (window.SUPABASE_USER_ID) {
    const cloudRecord = await saveSessionCloud(entryName, sessionData, typeof existingId === 'string' ? existingId : null);
    if (cloudRecord) {
      entry.id = cloudRecord.id;
      entry.date = new Date(cloudRecord.created_at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
    }
  }

  const saves = getSaves();
  // remove if updating
  const idx = saves.findIndex(s => s.id === existingId);
  if (idx !== -1) saves.splice(idx, 1);
  
  saves.unshift(entry);
  putSaves(saves);
  return entry;
}

/**
 * Delete a save by id.
 * @param {number} id
 */
export function deleteSession(id) {
  putSaves(getSaves().filter(s => s.id !== id));
}

/**
 * Load a save by id into State.
 * @param {number} id
 * @returns {string|null} error message or null on success
 */
export function loadSession(id) {
  const save = getSaves().find(s => s.id === id);
  if (!save) return 'Sessão não encontrada';
  return restoreSession(save.session);
}

// ─── Autosave ─────────────────────────────────────────────────────────────────

let autosaveTimer = null;
const AUTOSAVE_INTERVAL = 30_000; // 30 s

/** Trigger a debounced autosave */
export function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(autosaveNow, AUTOSAVE_INTERVAL);
}

export function autosaveNow() {
  const ok = writeJSON(AUTOSAVE_KEY, buildSession());
  if (ok) {
    console.debug('[storage] autosaved');
  }
}

/** Restore from autosave. Returns error string or null. */
export function restoreAutosave() {
  const session = readJSON(AUTOSAVE_KEY);
  if (!session) return 'Sem autosave';
  return restoreSession(session);
}

export function hasAutosave() {
  return localStorage.getItem(AUTOSAVE_KEY) !== null;
}

// ─── JSON Export / Import ─────────────────────────────────────────────────────

/**
 * Export the current session as a JSON string (for file download).
 * @returns {string}
 */
export function exportSessionToJSON() {
  const session = buildSession();
  session._export = { app: 'TacticalLab', schema: SCHEMA_VERSION, exported: new Date().toISOString() };
  return JSON.stringify(session, null, 2);
}

/**
 * Import a session from a JSON string.
 * @param {string} jsonStr
 * @returns {string|null} error message or null on success
 */
export function importSessionFromJSON(jsonStr) {
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return 'Ficheiro JSON inválido';
  }
  if (!parsed || typeof parsed !== 'object') return 'Formato não reconhecido';
  return restoreSession(parsed);
}

/**
 * Trigger a browser file download of a JSON export.
 * @param {string} filename
 */
export function downloadSessionFile(filename) {
  const json = exportSessionToJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename || `tactical-lab-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Open a file picker, read the selected file, and import it.
 * @returns {Promise<string|null>} error or null
 */
export function importSessionFromFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type  = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return resolve('Nenhum ficheiro selecionado');
      const reader = new FileReader();
      reader.onload = (e) => resolve(importSessionFromJSON(e.target.result));
      reader.onerror = () => resolve('Erro ao ler ficheiro');
      reader.readAsText(file);
    };
    input.click();
  });
}



// --- Cloud Sync (desativado — sem autenticação) ---
export async function syncCloudToLocal() {
  // No-op: sem Supabase
}

export async function saveSessionCloud(name, sessionData, cloudId = null) {
  return null; // No-op: sem Supabase
}

export async function deleteSessionCloud(cloudId) {
  // No-op: sem Supabase
}

