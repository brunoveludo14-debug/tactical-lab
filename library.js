/**
 * library.js — Biblioteca de Jogadas
 *
 * Stores play entries in localStorage (IndexedDB would be ideal for thumbnails
 * at scale, but localStorage keeps the zero-backend constraint while the user
 * base is small; the schema is forward-compatible for a future migration).
 *
 * Each entry: { id, name, desc, tags, fmt, thumbnail, session, createdAt, updatedAt }
 * thumbnail: base64 data-URL PNG (generated from canvas at save time)
 * session:   full buildSession() snapshot
 */

'use strict';

import { buildSession, restoreSession } from './state.js';

const KEY = 'tl_library';
const MAX_ENTRIES = 200;

// ─── Storage helpers ──────────────────────────────────────────────────────────

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
}

function writeAll(entries) {
  try { localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES))); return true; }
  catch (e) { console.warn('[library] write failed:', e); return false; }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getLibrary() { return readAll(); }

/**
 * Save current State as a play entry.
 * @param {string} name
 * @param {string} desc
 * @param {string[]} tags  e.g. ['ataque','bola-parada']
 * @param {string|null} thumbnail  base64 PNG
 * @returns {LibraryEntry}
 */
export function savePlay(name, desc, tags, thumbnail = null) {
  const entries = readAll();
  const now     = Date.now();
  const entry   = {
    id:        now,
    name:      name.trim() || 'Jogada sem nome',
    desc:      (desc || '').trim(),
    tags:      Array.isArray(tags) ? tags : [],
    fmt:       (buildSession().fmt) || '',
    thumbnail,
    session:   buildSession(),
    createdAt: now,
    updatedAt: now,
  };
  entries.unshift(entry);
  writeAll(entries);
  return entry;
}

/**
 * Update metadata of an existing entry (name, desc, tags, thumbnail).
 * Does NOT update the session snapshot.
 */
export function updatePlayMeta(id, patch) {
  const entries = readAll();
  const idx     = entries.findIndex(e => e.id === id);
  if (idx === -1) return false;
  Object.assign(entries[idx], patch, { updatedAt: Date.now() });
  return writeAll(entries);
}

/** Overwrite the session snapshot of an existing entry with current State. */
export function updatePlaySession(id, thumbnail = null) {
  const entries = readAll();
  const idx     = entries.findIndex(e => e.id === id);
  if (idx === -1) return false;
  entries[idx].session   = buildSession();
  entries[idx].fmt       = entries[idx].session.fmt;
  entries[idx].updatedAt = Date.now();
  if (thumbnail) entries[idx].thumbnail = thumbnail;
  return writeAll(entries);
}

export function deletePlay(id) {
  writeAll(readAll().filter(e => e.id !== id));
}

/**
 * Load a play into State. Returns error string or null.
 */
export function loadPlay(id) {
  const entry = readAll().find(e => e.id === id);
  if (!entry) return 'Jogada não encontrada';
  return restoreSession(entry.session);
}

/**
 * Export all library entries as JSON (for backup / sharing between devices).
 */
export function exportLibrary() {
  return JSON.stringify({ _type: 'tl-library', v: 1, entries: readAll() }, null, 2);
}

/**
 * Import library entries from JSON string. Merges with existing (no duplicates by id).
 * Returns count imported or error string.
 */
export function importLibrary(jsonStr) {
  try {
    const data = JSON.parse(jsonStr);
    const incoming = Array.isArray(data.entries) ? data.entries : (Array.isArray(data) ? data : null);
    if (!incoming) return 'Formato inválido';
    const existing = readAll();
    const existingIds = new Set(existing.map(e => e.id));
    const merged = [...incoming.filter(e => !existingIds.has(e.id)), ...existing];
    writeAll(merged);
    return merged.length - existing.length;
  } catch (e) {
    return `Erro ao importar: ${e.message}`;
  }
}

/**
 * Build a shareable URL for a play using URL hash (base64 JSON, no server needed).
 * Omits thumbnail to keep URL small.
 */
export function buildShareURL(id) {
  const entry = readAll().find(e => e.id === id);
  if (!entry) return null;
  const payload = { name: entry.name, desc: entry.desc, tags: entry.tags, session: entry.session };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  return `${location.origin}${location.pathname}#play=${encoded}`;
}

/**
 * If the URL hash contains a play, parse and return it.
 * Returns null if not present.
 */
export function parseShareURL() {
  const m = location.hash.match(/^#play=(.+)/);
  if (!m) return null;
  try {
    const decoded = decodeURIComponent(escape(atob(m[1])));
    return JSON.parse(decoded);
  } catch { return null; }
}

// ─── Built-in templates ───────────────────────────────────────────────────────

/**
 * Seed the library with built-in template plays if it's empty.
 * Templates are hand-crafted position snapshots stored inline.
 * Each is tagged 'template' so users can filter them.
 */
export function seedTemplates() {
  if (readAll().length > 0) return; // only seed on first run

  const templates = buildTemplates();
  writeAll(templates);
  console.info(`[library] seeded ${templates.length} templates`);
}

function mkSession(fmt, tShapes = []) {
  return {
    v:2, ts:0,
    fmt, fmtOpp:'', ball:{x:50,y:50},
    players:[], opp:[], tShapes,
    bPlayers:[], bShapes:[], bPlayerCounts:{att:0,def:0,gk:0,total:0},
    pPlayers:[], pShapes:[], pPlayerCounts:{att:0,def:0,gk:0,oppAtt:0,oppDef:0,total:0},
    keyframes:[], notes:[],
  };
}

function buildTemplates() {
  const now = Date.now();
  let id = now - 100000; // offset so user saves appear first

  const t = (name, desc, tags, fmt, tShapes = []) => ({
    id: id++,
    name, desc,
    tags: ['template', ...tags],
    fmt,
    thumbnail: null,
    session: mkSession(fmt, tShapes),
    createdAt: id,
    updatedAt: id,
  });

  // Arrow helpers (viewBox coords, 68×105)
  const arr = (x1,y1,x2,y2,stroke='rgba(240,192,64,.9)') => ({
    id:`ts${id}`, type:'arrow',
    points:[{x:x1,y:y1},{x:x2,y:y2}],
    fill:'none', stroke, label:'Mov.', nl:true, _bp:false
  });
  const zone = (pts, stroke='rgba(61,220,132,.6)', fill='rgba(61,220,132,.12)') => ({
    id:`ts${id}`, type:'polygon',
    points:pts, fill, stroke, label:'Zona', nl:false, _bp:false
  });

  return [
    t('Pressão Alta','Equipa sobe linha e pressiona saída adversária',['defesa','pressão'],'4-3-3 ATK',[
      arr(10,36, 10,48),  // extremo esq sobe
      arr(58,36, 58,48),  // extremo dir sobe
      arr(34,30, 34,42),  // avançado cai
      zone([{x:2,y:42},{x:66,y:42},{x:66,y:60},{x:2,y:60}],'rgba(232,85,85,.6)','rgba(232,85,85,.08)'),
    ]),

    t('Contra-Ataque Rápido','Transição rápida após recuperação no bloco médio',['ataque','transição'],'4-2-3-1',[
      arr(34,64, 34,42),  // trinco para médio
      arr(10,46, 26,34),  // ext esq corta interior
      arr(58,46, 42,30),  // ext dir corta interior
      arr(34,42, 34,22),  // meia para avançado
    ]),

    t('Saída a Jogar pelo GR','Construção curta desde o GR pressionado',['ataque','construção'],'4-3-3 DEF',[
      arr(34,94, 14,82),  // GR para lateral esq
      arr(14,82, 24,70),  // lateral para defesa
      arr(24,70, 34,62),  // defesa para médio
      arr(34,62, 48,54),  // médio para meia
    ]),

    t('Canto Curto','Canto curto com triangulação na zona',['bola-parada','ataque'],'4-3-3 ATK',[
      arr(66,5,  54,12),  // cruzamento curto
      arr(54,12, 48,20),  // second ball
      arr(48,20, 34,15),  // cruzamento para área
      zone([{x:20,y:8},{x:50,y:8},{x:50,y:22},{x:20,y:22}],'rgba(240,192,64,.6)','rgba(240,192,64,.1)'),
    ]),

    t('Livre Lateral Direto','Livre lateral com cruzamento na primeira fase',['bola-parada','ataque'],'4-2-3-1',[
      arr(10,46, 24,24),  // cruzamento
      zone([{x:22,y:14},{x:46,y:14},{x:46,y:30},{x:22,y:30}],'rgba(91,191,255,.6)','rgba(91,191,255,.1)'),
    ]),

    t('Bloco Médio 4-4-2','Bloco compacto médio pronto para transição',['defesa','bloco'],'4-4-2',[
      zone([{x:4,y:54},{x:64,y:54},{x:64,y:78},{x:4,y:78}],'rgba(232,85,85,.5)','rgba(232,85,85,.06)'),
    ]),

    t('Triângulo Interior','Combinação de triângulo na faixa direita interior',['ataque','combinação'],'4-3-3 ATK',[
      arr(48,60, 58,48),
      arr(58,48, 44,40),
      arr(44,40, 34,30),
    ]),

    t('Pressing Trap','Isolar lateral adversário com pressing coordenado',['defesa','pressing'],'4-3-3 ATK',[
      zone([{x:48,y:60},{x:68,y:60},{x:68,y:85},{x:48,y:85}],'rgba(232,85,85,.55)','rgba(232,85,85,.08)'),
      arr(58,36, 62,52),
      arr(48,60, 56,68),
      arr(44,82, 54,76),
    ]),

    t('Penálti — Movimento de Apoio','Posicionamento para recuperação de 2º lance',['bola-parada'],'4-2-3-1',[
      zone([{x:13,y:18},{x:55,y:18},{x:55,y:36},{x:13,y:36}],'rgba(91,191,255,.4)','rgba(91,191,255,.06)'),
    ]),

    t('Saída 3-2 com GR','GR como 3.º defesa na construção com 5 homens atrás',['ataque','construção'],'5-3-2',[
      arr(34,94, 20,82),
      arr(20,82, 6,76),
      arr(6,76,  20,62),
      arr(20,62, 34,58),
      arr(34,94, 48,82),
      arr(48,82, 62,76),
    ]),

    t('Transição Defensiva 4-4-2','Reorganização defensiva após perda no ataque',['defesa','transição'],'4-4-2',[
      arr(24,34, 26,50),
      arr(44,34, 42,50),
      arr(10,56, 10,68),
      arr(58,56, 58,68),
    ]),

    t('Overload Esquerda','Sobrecarga numérica no corredor esquerdo',['ataque','variante'],'4-3-3 ATK',[
      arr(10,78, 6,62),   // lateral sobe
      arr(20,60, 10,48),  // médio abre
      arr(10,36, 16,22),  // extremo entra
      zone([{x:2,y:30},{x:30,y:30},{x:30,y:72},{x:2,y:72}],'rgba(61,220,132,.5)','rgba(61,220,132,.06)'),
    ]),
  ];
}
