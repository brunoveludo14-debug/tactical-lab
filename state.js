/**
 * state.js — Central application state + undo/redo history
 */
'use strict';

export const PNAMES = ['Guarda-Redes','Lateral Dir.','Central Esq.','Central Dir.','Lateral Esq.','Médio Int.','Trinco','Meia','Ext. Esq.','Avançado','Ext. Dir.'];
export const PNAMES_OPP = ['GR Adv.','Lat.Dir. Adv.','Def.Esq. Adv.','Def.Dir. Adv.','Lat.Esq. Adv.','Med. Adv.','Trinco Adv.','Meia Adv.','Ext.Esq. Adv.','Avançado Adv.','Ext.Dir. Adv.'];

export const FMTS = {
  '4-3-3 ATK': [{x:34,y:94,n:1},{x:10,y:78,n:2},{x:24,y:82,n:4},{x:44,y:82,n:5},{x:58,y:78,n:3},{x:20,y:60,n:8},{x:34,y:64,n:6},{x:48,y:60,n:10},{x:10,y:36,n:7},{x:34,y:30,n:9},{x:58,y:36,n:11}],
  '4-3-3 DEF': [{x:34,y:94,n:1},{x:10,y:80,n:2},{x:24,y:84,n:4},{x:44,y:84,n:5},{x:58,y:80,n:3},{x:16,y:65,n:8},{x:34,y:68,n:6},{x:52,y:65,n:10},{x:12,y:42,n:7},{x:34,y:38,n:9},{x:56,y:42,n:11}],
  '4-4-2':     [{x:34,y:94,n:1},{x:10,y:78,n:2},{x:24,y:82,n:4},{x:44,y:82,n:5},{x:58,y:78,n:3},{x:10,y:56,n:7},{x:26,y:60,n:8},{x:42,y:60,n:6},{x:58,y:56,n:11},{x:24,y:34,n:9},{x:44,y:34,n:10}],
  '4-4-2 Diamante': [{x:34,y:94,n:1},{x:10,y:80,n:2},{x:24,y:84,n:4},{x:44,y:84,n:5},{x:58,y:80,n:3},{x:34,y:72,n:6},{x:16,y:58,n:8},{x:52,y:58,n:7},{x:34,y:46,n:10},{x:26,y:32,n:9},{x:42,y:32,n:11}],
  '4-2-3-1':   [{x:34,y:94,n:1},{x:10,y:78,n:2},{x:24,y:82,n:4},{x:44,y:82,n:5},{x:58,y:78,n:3},{x:24,y:64,n:6},{x:44,y:64,n:8},{x:10,y:46,n:7},{x:34,y:48,n:10},{x:58,y:46,n:11},{x:34,y:30,n:9}],
  '4-1-4-1':   [{x:34,y:94,n:1},{x:10,y:80,n:2},{x:24,y:84,n:4},{x:44,y:84,n:5},{x:58,y:80,n:3},{x:34,y:70,n:6},{x:10,y:54,n:7},{x:26,y:56,n:8},{x:42,y:56,n:10},{x:58,y:54,n:11},{x:34,y:32,n:9}],
  '4-5-1':     [{x:34,y:94,n:1},{x:10,y:80,n:2},{x:24,y:84,n:4},{x:44,y:84,n:5},{x:58,y:80,n:3},{x:8,y:58,n:7},{x:20,y:62,n:8},{x:34,y:64,n:6},{x:48,y:62,n:10},{x:60,y:58,n:11},{x:34,y:32,n:9}],
  '4-2-2-2':   [{x:34,y:94,n:1},{x:10,y:80,n:2},{x:24,y:84,n:4},{x:44,y:84,n:5},{x:58,y:80,n:3},{x:22,y:66,n:6},{x:46,y:66,n:8},{x:14,y:50,n:7},{x:54,y:50,n:11},{x:26,y:32,n:9},{x:42,y:32,n:10}],
  '3-5-2':     [{x:34,y:94,n:1},{x:20,y:82,n:4},{x:34,y:84,n:5},{x:48,y:82,n:6},{x:6,y:60,n:2},{x:22,y:56,n:8},{x:34,y:62,n:3},{x:46,y:56,n:10},{x:62,y:60,n:7},{x:26,y:34,n:9},{x:42,y:34,n:11}],
  '3-4-3':     [{x:34,y:94,n:1},{x:20,y:82,n:4},{x:34,y:84,n:5},{x:48,y:82,n:6},{x:14,y:60,n:2},{x:28,y:62,n:8},{x:40,y:62,n:10},{x:54,y:60,n:7},{x:10,y:36,n:11},{x:34,y:30,n:9},{x:58,y:36,n:7}],
  '3-4-1-2':   [{x:34,y:94,n:1},{x:20,y:82,n:4},{x:34,y:84,n:5},{x:48,y:82,n:6},{x:10,y:62,n:2},{x:26,y:64,n:8},{x:42,y:64,n:10},{x:58,y:62,n:7},{x:34,y:48,n:3},{x:26,y:32,n:9},{x:42,y:32,n:11}],
  '3-6-1':     [{x:34,y:94,n:1},{x:20,y:84,n:4},{x:34,y:86,n:5},{x:48,y:84,n:6},{x:8,y:64,n:2},{x:22,y:60,n:8},{x:34,y:62,n:3},{x:46,y:60,n:10},{x:60,y:64,n:7},{x:28,y:46,n:11},{x:40,y:46,n:11},{x:34,y:30,n:9}].slice(0,11),
  '5-3-2':     [{x:34,y:94,n:1},{x:6,y:76,n:2},{x:20,y:80,n:4},{x:34,y:82,n:5},{x:48,y:80,n:6},{x:62,y:76,n:3},{x:20,y:58,n:8},{x:34,y:60,n:10},{x:48,y:58,n:7},{x:26,y:34,n:9},{x:42,y:34,n:11}],
  '5-4-1':     [{x:34,y:94,n:1},{x:6,y:78,n:2},{x:18,y:82,n:4},{x:34,y:84,n:5},{x:50,y:82,n:6},{x:62,y:78,n:3},{x:10,y:58,n:7},{x:26,y:62,n:8},{x:42,y:62,n:10},{x:58,y:58,n:11},{x:34,y:34,n:9}]
};

export const SHAPE_STYLES = {
  polygon:   { fill:'rgba(61,220,132,.12)', stroke:'rgba(61,220,132,.6)' },
  zone:      { fill:'rgba(91,191,255,.12)', stroke:'rgba(91,191,255,.55)' },
  arrow:     { fill:'none',                 stroke:'rgba(240,192,64,.9)' },
  linked:    { fill:'none',                 stroke:'rgba(255,255,255,.6)' },
  ruler:     { fill:'none',                 stroke:'rgba(255,255,255,.85)' },
  curve:     { fill:'none',                 stroke:'rgba(240,192,64,.9)' },
  spotlight: { fill:'none',                 stroke:'none' }
};
export const SHAPE_NAMES = { polygon:'Zona', zone:'Área', arrow:'Mov.', linked:'Ligação', ruler:'Medida', curve:'Curva', spotlight:'Foco' };
export const HINTS = {
  polygon: 'Polígono — clique para pontos · duplo-clique para fechar',
  arrow:   'Seta — clique pontos · duplo-clique para finalizar',
  zone:    'Zona — clique pontos · duplo-clique para fechar',
  linked:  'Linha Defensiva — clique nos jogadores para unir · duplo clique no fundo para fechar',
  ruler:   'Régua — arraste ou clique p/ ponto A · duplo clique p/ ponto B',
  curve:   'Seta Curva — clique início, clique meio(curva), duplo clique fim',
  spotlight:'Foco — clique para desenhar as formas de foco · duplo-clique para finalizar'
};
export const BPZ = {
  cr:  { pts:[{x:54,y:5},{x:66,y:5},{x:66,y:30},{x:54,y:30}],  fill:'rgba(240,192,64,.15)', stroke:'rgba(240,192,64,.7)',  lbl:'Canto Dir.',  ball:{x:66,y:5}  },
  cl:  { pts:[{x:2,y:5},{x:14,y:5},{x:14,y:30},{x:2,y:30}],    fill:'rgba(240,192,64,.15)', stroke:'rgba(240,192,64,.7)',  lbl:'Canto Esq.',  ball:{x:2,y:5}   },
  fk:  { pts:[{x:20,y:22},{x:48,y:22},{x:48,y:32},{x:20,y:32}],fill:'rgba(91,191,255,.15)', stroke:'rgba(91,191,255,.7)',  lbl:'Livre',       ball:{x:34,y:27} },
  pen: { pts:[{x:30,y:13},{x:38,y:13},{x:38,y:19},{x:30,y:19}],fill:'rgba(232,85,85,.15)',  stroke:'rgba(232,85,85,.7)',   lbl:'Penálti',     ball:{x:34,y:16} }
};
export const PITCH = {
  t: { id:'pitch',      vw:68, vh:105  },
  b: { id:'box-pitch',  vw:68, vh:105  },
  p: { id:'pbox-pitch', vw:68, vh:105 }
};

// ─── Club config (not undoable) ───────────────────────────────────────────────
export const Club = {
  name:      '',
  colorMain: '#3ddc84',
  colorGk:   '#5bbfff',
  colorOpp:  '#ff6b4a',
  colorOppGk:'#ff9f1c',
  labelMode: 'number',   // 'number' | 'name'
};

export function loadClubConfig() {
  try {
    const c = JSON.parse(localStorage.getItem('tl_club') || '{}');
    if (c.name      !== undefined) Club.name      = c.name;
    if (c.colorMain !== undefined) Club.colorMain = c.colorMain;
    if (c.colorGk   !== undefined) Club.colorGk   = c.colorGk;
    if (c.colorOpp  !== undefined) Club.colorOpp  = c.colorOpp;
    if (c.colorOppGk!== undefined) Club.colorOppGk= c.colorOppGk;
    if (c.labelMode !== undefined) Club.labelMode = c.labelMode;
  } catch {}
}
export function saveClubConfig() {
  localStorage.setItem('tl_club', JSON.stringify(Club));
}

// ─── Mutable state ────────────────────────────────────────────────────────────
export const State = {
  view:'tactic', mode:'none', arrowDir:null, forcedOrientation:null,
  mirrorMode:false, animSpeed:800,
  fmt:'4-3-3 ATK', players:[], tShapes:[], tDraw:[],
  fmtOpp:'', opp:[],
  ball:{ x:50, y:50 },
  bPlayers:[], bShapes:[], bDraw:[], bPlayerCounts:{ att:0, def:0, gk:0, total:0 },
  bBall:{ x:34, y:50 },
  pPlayers:[], pShapes:[], pDraw:[], pPlayerCounts:{ att:0, def:0, gk:0, oppAtt:0, oppDef:0, total:0 },
  pBall:{ x:34, y:26 },
  notes:[], curNote:null,
  keyframes:[], kfAnimating:false, showTrails:false,
  tSel:null, bSel:null, pbSel:null,
  selectedShape: null,  // { w, id } currently selected shape
  customFmts: [],       // array of { name, positions[] }
};

// ─── Undo / Redo ──────────────────────────────────────────────────────────────
const HISTORY_LIMIT = 100;
const history = { past:[], future:[] };

function snapshot() {
  return {
    fmt:State.fmt, fmtOpp:State.fmtOpp, ball:{...State.ball},
    players:State.players.map(p=>({...p})),
    tShapes:State.tShapes.map(s=>({...s,points:[...s.points]})),
    opp:State.opp.map(p=>({...p})),
    bPlayers:State.bPlayers.map(p=>({...p})),
    bShapes:State.bShapes.map(s=>({...s,points:[...s.points]})),
    bPlayerCounts:{...State.bPlayerCounts},
    pPlayers:State.pPlayers.map(p=>({...p})),
    pShapes:State.pShapes.map(s=>({...s,points:[...s.points]})),
    pPlayerCounts:{...State.pPlayerCounts},
    notes:State.notes.map(n=>({...n})), curNote:State.curNote,
    keyframes:State.keyframes.map(kf=>({
      players:kf.players.map(p=>({...p})),
      opp:(kf.opp||[]).map(p=>({...p})),
      ball:kf.ball?{...kf.ball}:null
    })),
  };
}

function applySnapshot(s) {
  State.fmt=s.fmt; State.fmtOpp=s.fmtOpp; State.ball={...s.ball};
  State.players=s.players.map(p=>({...p}));
  State.tShapes=s.tShapes.map(x=>({...x,points:[...x.points]}));
  State.opp=s.opp.map(p=>({...p}));
  State.bPlayers=s.bPlayers.map(p=>({...p}));
  State.bShapes=s.bShapes.map(x=>({...x,points:[...x.points]}));
  State.bPlayerCounts={...s.bPlayerCounts};
  State.pPlayers=s.pPlayers.map(p=>({...p}));
  State.pShapes=s.pShapes.map(x=>({...x,points:[...x.points]}));
  State.pPlayerCounts={...s.pPlayerCounts};
  State.notes=s.notes.map(n=>({...n})); State.curNote=s.curNote;
  State.keyframes=s.keyframes.map(kf=>({
    players:kf.players.map(p=>({...p})),
    opp:(kf.opp||[]).map(p=>({...p})),
    ball:kf.ball?{...kf.ball}:null
  }));
}

export function pushHistory() {
  history.past.push(snapshot());
  if (history.past.length > HISTORY_LIMIT) history.past.shift();
  history.future = [];
}
export function undo() {
  if (!history.past.length) return false;
  history.future.push(snapshot());
  applySnapshot(history.past.pop());
  return true;
}
export function redo() {
  if (!history.future.length) return false;
  history.past.push(snapshot());
  applySnapshot(history.future.pop());
  return true;
}
export const canUndo = () => history.past.length > 0;
export const canRedo = () => history.future.length > 0;
export const getHistoryCounts = () => ({ past: history.past.length, future: history.future.length });

// ─── Serialisation ────────────────────────────────────────────────────────────
export function buildSession() {
  return {
    v:2, ts:Date.now(),
    fmt:State.fmt, fmtOpp:State.fmtOpp, ball:{...State.ball},
    players:State.players.map(p=>({...p})),
    opp:State.opp.map(p=>({...p})),
    tShapes:State.tShapes.map(s=>({...s,points:[...s.points]})),
    bPlayers:State.bPlayers.map(p=>({...p})),
    bShapes:State.bShapes.map(s=>({...s,points:[...s.points]})),
    bPlayerCounts:{...State.bPlayerCounts},
    pPlayers:State.pPlayers.map(p=>({...p})),
    pShapes:State.pShapes.map(s=>({...s,points:[...s.points]})),
    pPlayerCounts:{...State.pPlayerCounts},
    keyframes:State.keyframes.map(kf=>({
      players:kf.players.map(p=>({...p})),
      opp:(kf.opp||[]).map(p=>({...p})),
      ball:kf.ball?{...kf.ball}:null
    })),
    notes:State.notes.map(n=>({...n})),
  };
}

export function restoreSession(session) {
  if (!session || typeof session !== 'object') return 'Sessão inválida';
  try {
    State.fmt    = session.fmt    || '4-3-3 ATK';
    State.fmtOpp = session.fmtOpp || '';
    State.ball   = session.ball   ? {...session.ball} : {x:50,y:50};
    State.players      = Array.isArray(session.players)  ? session.players.map(p=>({...p})) : [];
    State.opp          = Array.isArray(session.opp)      ? session.opp.map(p=>({...p})) : [];
    State.tShapes      = Array.isArray(session.tShapes)  ? session.tShapes.map(s=>({...s,points:[...(s.points||[])]})) : [];
    State.bPlayers     = Array.isArray(session.bPlayers) ? session.bPlayers.map(p=>({...p})) : [];
    State.bShapes      = Array.isArray(session.bShapes)  ? session.bShapes.map(s=>({...s,points:[...(s.points||[])]})) : [];
    State.bPlayerCounts= session.bPlayerCounts ? {...session.bPlayerCounts} : {att:0,def:0,gk:0,total:0};
    State.pPlayers     = Array.isArray(session.pPlayers) ? session.pPlayers.map(p=>({...p})) : [];
    State.pShapes      = Array.isArray(session.pShapes)  ? session.pShapes.map(s=>({...s,points:[...(s.points||[])]})) : [];
    State.pPlayerCounts= session.pPlayerCounts ? {...session.pPlayerCounts} : {att:0,def:0,gk:0,oppAtt:0,oppDef:0,total:0};
    State.keyframes    = Array.isArray(session.keyframes) ? session.keyframes.map(kf=>({
      players:(kf.players||[]).map(p=>({...p})),
      opp:(kf.opp||[]).map(p=>({...p})),
      ball:kf.ball?{...kf.ball}:null
    })) : [];
    State.notes   = Array.isArray(session.notes) ? session.notes.map(n=>({...n})) : [];
    State.curNote = null;
    State.tDraw=[]; State.bDraw=[]; State.pDraw=[];
    return null;
  } catch(err) { return `Erro ao restaurar: ${err.message}`; }
}
