'use strict';

// ══════════════════════════════════════════════════════════════════
// APPSTATE COM PROXY REATIVO
// ══════════════════════════════════════════════════════════════════

function createAppState() {
  // Estado interno
  const state = {
    players: [],
    logs: [],
    oppLogs: [],
    tacticalLogs: [],
    seconds: 0,
    isRunning: false,
    half: 1,
    statHalfFilter: 'all',
    activeTab: 'stats',
    selectedPlayer: null,
    pendingAction: null,
    pendingScore: 0,
    tacticalAction: 'acao',
    // Cronómetro timestamp-based
    startTimestamp: null,     // Date.now() quando está a correr, null se parado
    accumulatedPausedMs: 0    // ms acumulados quando estava parado
  };

  // Renderiza a UI inteira
  function updateUI() {
    updateStats();
    updateTimerDisplay();
    renderPlayerGrid();
    renderActionGrid();
    renderHeatmap();
    renderActionChart();
    renderTopPlayers();
    renderOppActions();
    renderMatchHistory();
    renderTacticalHistory();
  }

  // ── CRONÓMETRO TIMESTAMP-BASED ─────────────────────────────
  function getElapsedSeconds() {
    if (state.isRunning && state.startTimestamp !== null) {
      const elapsedMs = Date.now() - state.startTimestamp + state.accumulatedPausedMs;
      return Math.floor(elapsedMs / 1000);
    }
    return Math.floor(state.accumulatedPausedMs / 1000);
  }

  function startTimer() {
    state.startTimestamp = Date.now();
    state.isRunning = true;
    persistTimestamps();
    // Loop de render apenas — a contagem vem do timestamp
    requestAnimationFrame(timerRafLoop);
  }

  let _rafId = null;
  function timerRafLoop() {
    if (!state.isRunning) return;
    state.seconds = getElapsedSeconds();
    updateTimerDisplay();
    _rafId = requestAnimationFrame(timerRafLoop);
  }

  function pauseTimer() {
    if (state.isRunning && state.startTimestamp !== null) {
      state.accumulatedPausedMs += Date.now() - state.startTimestamp;
      state.startTimestamp = null;
    }
    state.isRunning = false;
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    state.seconds = Math.floor(state.accumulatedPausedMs / 1000);
    persistTimestamps();
  }

  function resetTimer() {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    state.startTimestamp = Date.now();
    state.accumulatedPausedMs = 0;
    state.isRunning = false;
    state.seconds = 0;
    persistTimestamps();
  }

  function toggleTimer() {
    if (state.isRunning) {
      pauseTimer();
    } else {
      // Ao recomeçar, soma o tempo que já passou ao accumulated
      if (state.startTimestamp === null) {
        // estava parado — o accumulated já está correto
        state.startTimestamp = Date.now();
        state.isRunning = true;
        requestAnimationFrame(timerRafLoop);
      }
      persistTimestamps();
    }
  }

  function persistTimestamps() {
    localStorage.setItem('ls_startTs', state.startTimestamp || '');
    localStorage.setItem('ls_accumulatedMs', state.accumulatedPausedMs);
    localStorage.setItem('ls_half', state.half);
    localStorage.setItem('ls_time', state.seconds);
  }

  function loadTimestamps() {
    const rawStart = localStorage.getItem('ls_startTs');
    const rawAcc   = parseInt(localStorage.getItem('ls_accumulatedMs')) || 0;
    // Se há startTimestamp e estava a correr, recalcula com base no que está no localStorage
    if (rawStart && rawStart !== 'null' && rawStart !== '') {
      state.startTimestamp = parseInt(rawStart);
    } else {
      state.startTimestamp = null;
    }
    state.accumulatedPausedMs = rawAcc;
  }

  function updateTimerDisplay() {
    const el = document.getElementById('timer-display');
    if (!el) return;
    const s = state.seconds;
    const m = String(Math.floor(s / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    el.textContent = m + ':' + sec;

    const btn = document.getElementById('btn-timer-play');
    if (btn) {
      btn.textContent = state.isRunning ? '⏸' : '▶';
      btn.classList.toggle('running', state.isRunning);
    }
  }

  // ── AÇÕES ──────────────────────────────────────────────────
  function recordAction(zone) {
    if (!state.selectedPlayer) return;
    const min = Math.floor(state.seconds / 60);
    const log = {
      id: Date.now(),
      min,
      half: state.half,
      player: state.selectedPlayer.name,
      num: state.selectedPlayer.num,
      action: state.pendingAction,
      score: state.pendingScore,
      zone
    };
    state.logs.unshift(log);
    localStorage.setItem('ls_logs', JSON.stringify(state.logs));
    state.selectedPlayer = null;
    state.pendingAction = null;
    state.pendingScore = 0;
    document.querySelectorAll('.player-btn').forEach(b => b.classList.remove('selected'));
    updateStats();
    showToast('✅ ' + state.pendingAction + ' — ' + zone);
  }

  function recordOppAction(actionName, zone) {
    const min = Math.floor(state.seconds / 60);
    state.oppLogs.unshift({ id: Date.now(), min, action: actionName, zone, half: state.half });
    localStorage.setItem('ls_opp_logs', JSON.stringify(state.oppLogs));
    renderOppActions();
    updateStats();
  }

  function registerEquipaAction() {
    if (!state.pendingAction) {
      showToast('Seleciona primeiro uma ação na grelha');
      return;
    }
    // Equipa é um "jogador" genérico
    state.selectedPlayer = { name: 'Equipa', num: 0 };
    document.getElementById('zone-modal-title').textContent = state.pendingAction;
    document.getElementById('zone-modal').classList.add('show');
  }

  function setHalf(n) {
    state.half = n;
    localStorage.setItem('ls_half', n);
    const b1 = document.getElementById('btn-1p');
    const b2 = document.getElementById('btn-2p');
    if (b1) b1.classList.toggle('active', n === 1);
    if (b2) b2.classList.toggle('active', n === 2);
  }

  function setStatFilter(filter) {
    state.statHalfFilter = filter;
    document.querySelectorAll('.hf-btn').forEach(b => b.classList.remove('active'));
    if (filter !== 'all') {
      const btn = document.getElementById('filter-half-' + filter);
      if (btn) btn.classList.add('active');
    } else {
      const btn = document.getElementById('filter-half-all');
      if (btn) btn.classList.add('active');
    }
    updateStats();
  }

  function selectPlayer(num) {
    state.selectedPlayer = state.players.find(p => p.num === num);
    document.querySelectorAll('.player-btn').forEach(b => b.classList.remove('selected'));
    const btn = document.getElementById('btn-p' + num);
    if (btn) btn.classList.add('selected');
    renderActionGrid();
  }

  function askZone(action, score) {
    if (!state.selectedPlayer) { showToast('Seleciona um jogador primeiro!'); return; }
    state.pendingAction = action;
    state.pendingScore = score;
    const modal = document.getElementById('zone-modal');
    const title = document.getElementById('zone-modal-title');
    if (title) title.textContent = action;
    if (modal) modal.classList.add('show');
  }

  function closeZoneModal() {
    const modal = document.getElementById('zone-modal');
    if (modal) modal.classList.remove('show');
    state.pendingAction = null;
    state.pendingScore = 0;
  }

  // ── STATS ENGINE ───────────────────────────────────────────
  function updateStats() {
    const filtered = state.statHalfFilter === 'all'
      ? state.logs
      : state.logs.filter(l => l.half === state.statHalfFilter);
    const filteredOpp = state.statHalfFilter === 'all'
      ? state.oppLogs
      : state.oppLogs.filter(o => o.half === state.statHalfFilter);

    const elGolM = document.getElementById('stat-golos-marcados');
    const elGolS = document.getElementById('stat-golos-sofridos');
    if (elGolM) elGolM.textContent = filtered.filter(l => l.action === 'Golo Marcado').length;
    if (elGolS) elGolS.textContent = filteredOpp.filter(o => o.action === 'Golo Sofrido').length;

    const cruzC = filtered.filter(l => l.action === 'Cruzamento Certo').length;
    const cruzF = filtered.filter(l => l.action === 'Cruzamento Falhado').length;
    const cruzPct = cruzC + cruzF > 0 ? Math.round((cruzC / (cruzC + cruzF)) * 100) : 0;
    const elCPct = document.getElementById('stat-cruz-pct');
    const elCBar = document.getElementById('stat-cruz-bar');
    const elCCerto = document.getElementById('stat-cruz-certo');
    const elCErrado = document.getElementById('stat-cruz-errado');
    if (elCPct) elCPct.textContent = cruzPct + '%';
    if (elCBar) elCBar.style.width = cruzPct + '%';
    if (elCCerto) elCCerto.textContent = '✓' + cruzC;
    if (elCErrado) elCErrado.textContent = '✗' + cruzF;

    const remC = filtered.filter(l => l.action === 'Remate à Baliza').length;
    const remF = filtered.filter(l => l.action === 'Remate Fora').length;
    const remPct = remC + remF > 0 ? Math.round((remC / (remC + remF)) * 100) : 0;
    const elRPct = document.getElementById('stat-remates-pct');
    const elRBar = document.getElementById('stat-remates-bar');
    const elRCerto = document.getElementById('stat-remates-certo');
    const elRErrado = document.getElementById('stat-remates-errado');
    if (elRPct) elRPct.textContent = remPct + '%';
    if (elRBar) elRBar.style.width = remPct + '%';
    if (elRCerto) elRCerto.textContent = '✓' + remC;
    if (elRErrado) elRErrado.textContent = '✗' + remF;

    renderHeatmap();
    renderActionChart();
    renderTopPlayers();
  }

  // ── PLAYER GRID ────────────────────────────────────────────
  function renderPlayerGrid() {
    const grid = document.getElementById('player-grid');
    if (!grid) return;
    let html = '';
    state.players.forEach(p => {
      const isGK = p.num === 1;
      html += `<button class="player-btn${isGK ? ' goalkeeper' : ''}" id="btn-p${p.num}" onclick="AppState.selectPlayer(${p.num})">
        <span class="player-btn-num">#${p.num}</span>
        <span class="player-btn-name">${p.name}</span>
      </button>`;
    });
    grid.innerHTML = html;
  }

  // ── ACTION GRID DINÂMICO ───────────────────────────────────
  const regularActions = [
    { name: 'Passe Falhado',       score: -1, color: 'var(--red)' },
    { name: 'Cruzamento Certo',    score: 1,  color: 'var(--acc)' },
    { name: 'Cruzamento Falhado',  score: -1, color: 'var(--red)' },
    { name: 'Remate à Baliza',     score: 1,  color: 'var(--acc)' },
    { name: 'Remate Fora',         score: -1, color: 'var(--red)' },
    { name: 'Desarme Certo',       score: 1,  color: 'var(--acc)' },
    { name: 'Perda de Bola',       score: -1, color: 'var(--red)' },
    { name: 'Falta Sofrida',       score: 0,  color: 'var(--yel)' },
    { name: 'Falta Cometida',      score: 0,  color: 'var(--yel)' },
    { name: 'Golo Marcado',        score: 1,  color: 'var(--gold)' },
    { name: 'Golo Sofrido',        score: -1, color: 'var(--opp)' }
  ];

  const grActions = [
    { name: 'Saque',               score: 0,  color: 'var(--blu)' },
    { name: 'Defesa Difícil',      score: 1,  color: 'var(--acc)' },
    { name: 'Defesa Fácil',        score: 1,  color: 'var(--acc)' },
    { name: 'Soco',                score: 0,  color: 'var(--yel)' },
    { name: 'Passe Longo',         score: 0,  color: 'var(--acc)' },
    { name: 'Passe Curto',         score: 1,  color: 'var(--acc)' },
    { name: 'Erro de Passe',       score: -1, color: 'var(--red)' },
    { name: 'Corte',               score: 1,  color: 'var(--acc)' },
    { name: 'Golo Sofrido',        score: -1, color: 'var(--opp)' },
    { name: 'Penálti Defendido',   score: 1,  color: 'var(--gold)' }
  ];

  function renderActionGrid() {
    const grid = document.getElementById('action-grid');
    const title = document.getElementById('action-section-title');
    if (!grid) return;
    const isGK = state.selectedPlayer && state.selectedPlayer.num === 1;
    const actions = isGK ? grActions : regularActions;
    if (title) title.textContent = isGK ? 'Ações do Guarda-Redes' : 'Registar Ação';
    let html = '';
    actions.forEach(a => {
      const style = `background:var(--bg3);border-color:${a.color};color:${a.color};`;
      html += `<button class="action-btn" style="${style}" onclick="AppState.askZone('${a.name}',${a.score})">${a.name}</button>`;
    });
    grid.innerHTML = html;
  }

  // ── HEATMAP ────────────────────────────────────────────────
  function renderHeatmap() {
    const zonas = ['Ataque Esq.', 'Ataque Centro', 'Ataque Dir.',
                   'Meio Esq.', 'Meio Centro', 'Meio Dir.',
                   'Defesa Esq.', 'Defesa Centro', 'Defesa Dir.'];
    const perdas = state.logs.filter(l =>
      ['Perda de Bola', 'Passe Falhado', 'Cruzamento Falhado'].includes(l.action));
    const zCounts = {};
    perdas.forEach(l => { zCounts[l.zone] = (zCounts[l.zone] || 0) + 1; });
    const maxC = Math.max(1, ...Object.values(zCounts));
    zonas.forEach((z, i) => {
      const el = document.getElementById('hm-' + i);
      if (!el) return;
      const c = zCounts[z] || 0;
      el.textContent = c || '·';
      if (c === 0) {
        el.className = 'heatmap-cell hi-0';
      } else {
        const intensity = Math.ceil((c / maxC) * 5);
        el.className = 'heatmap-cell hi-' + Math.min(5, intensity);
        el.style.color = '#fff';
      }
    });
  }

  // ── ACTION CHART ───────────────────────────────────────────
  function renderActionChart() {
    const el = document.getElementById('action-chart');
    if (!el) return;
    const types = ['Passe Falhado', 'Cruzamento Certo', 'Cruzamento Falhado',
                   'Remate à Baliza', 'Remate Fora', 'Desarme Certo',
                   'Perda de Bola', 'Falta Sofrida', 'Golo Marcado'];
    const counts = {};
    types.forEach(t => { counts[t] = state.logs.filter(l => l.action === t).length; });
    const max = Math.max(1, ...Object.values(counts));
    const html = types.filter(t => counts[t] > 0).map(t => {
      const pct = (counts[t] / max) * 100;
      const color = t.includes('Certo') || t === 'Remate à Baliza' || t === 'Desarme Certo' || t === 'Golo Marcado'
        ? 'var(--acc)' : (t === 'Falta Sofrida' ? 'var(--yel)' : 'var(--red)');
      return `<div style="display:flex;align-items:center;gap:8px;font-size:11px;">
        <span style="color:var(--t2);width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t}</span>
        <div style="flex:1;height:5px;background:var(--bg4);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;"></div>
        </div>
        <span style="color:${color};width:20px;text-align:right;font-weight:600;">${counts[t]}</span>
      </div>`;
    }).join('');
    el.innerHTML = html || '<div class="empty-state" style="padding:12px;">Sem dados ainda</div>';
  }

  // ── TOP PLAYERS ───────────────────────────────────────────
  function renderTopPlayers() {
    const el = document.getElementById('top-players-list');
    if (!el) return;
    const counts = {};
    state.logs.forEach(l => { counts[l.player] = (counts[l.player] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const html = top.map(([name, count], i) => `
      <div class="player-stat-row animate-in">
        <span class="player-rank">${i + 1}</span>
        <div class="player-info"><div class="player-name">${name}</div></div>
        <span class="player-actions-count">${count}</span>
      </div>
    `).join('');
    el.innerHTML = html || '<div class="empty-state" style="padding:12px;">Sem dados ainda</div>';
  }

  // ── OPPONENT ───────────────────────────────────────────────
  function addOppQuick(action) {
    const zone = prompt('Zona do campo:', 'Meio Centro') || 'Meio Centro';
    const min = Math.floor(state.seconds / 60);
    state.oppLogs.unshift({ id: Date.now(), min, action, zone, half: state.half });
    localStorage.setItem('ls_opp_logs', JSON.stringify(state.oppLogs));
    renderOppActions();
    updateStats();
  }

  function renderOppActions() {
    const el = document.getElementById('opp-actions-list');
    if (!el) return;
    const html = state.oppLogs.slice(0, 5).map(o => `
      <div class="history-item">
        <span class="history-time">${o.min}'</span>
        <span class="history-player">${o.action}</span>
        <span class="history-zone">${o.zone}</span>
      </div>
    `).join('');
    el.innerHTML = html || '<div style="font-size:11px;color:var(--t3);padding:4px;">Nenhuma ação</div>';
  }

  // ── HISTORY ────────────────────────────────────────────────
  function saveMatchToHistory() {
    const entry = {
      id: Date.now(),
      date: new Date().toLocaleDateString('pt-PT'),
      golos: state.logs.filter(l => l.action === 'Golo Marcado').length,
      sofridos: state.oppLogs.filter(o => o.action === 'Golo Sofrido').length
    };
    const history = JSON.parse(localStorage.getItem('ls_match_history') || '[]');
    history.unshift(entry);
    if (history.length > 20) history.pop();
    localStorage.setItem('ls_match_history', JSON.stringify(history));
    renderMatchHistory();
    showToast('💾 Jogo guardado!');
  }

  function renderMatchHistory() {
    const el = document.getElementById('match-history-list');
    if (!el) return;
    const history = JSON.parse(localStorage.getItem('ls_match_history') || '[]');
    const html = history.slice(0, 5).map(m => `
      <div class="history-item">
        <span class="history-time">${m.date}</span>
        <span class="history-action">${m.golos} — ${m.sofridos}</span>
      </div>
    `).join('');
    el.innerHTML = html || '<div style="font-size:11px;color:var(--t3);padding:4px;">Nenhum jogo guardado</div>';
  }

  // ── ZONE DETAIL ───────────────────────────────────────────
  function showZoneDetail(zone) {
    const perdas = state.logs.filter(l =>
      l.zone === zone && ['Perda de Bola', 'Passe Falhado', 'Cruzamento Falhado'].includes(l.action));
    if (perdas.length === 0) { showToast(zone + ': sem perdas'); return; }
    const text = zone + ' — ' + perdas.length + ' perdas:\n' +
      perdas.map(p => p.min + "' " + p.player + ': ' + p.action).join('\n');
    alert(text);
  }

  // ── TACTICAL MAP ──────────────────────────────────────────
  function initTacticalMap() {
    document.querySelectorAll('.tactical-zone').forEach(zone => {
      zone.addEventListener('click', () => {
        const zoneName = zone.dataset.zone;
        const min = Math.floor(state.seconds / 60);
        const log = { id: Date.now(), min, half: state.half, zone: zoneName, type: state.tacticalAction, player: 'Equipa' };
        state.tacticalLogs.unshift(log);
        localStorage.setItem('ls_tactical_logs', JSON.stringify(state.tacticalLogs));
        zone.style.fill = 'rgba(61,220,132,0.35)';
        setTimeout(() => { zone.style.fill = ''; }, 600);
        renderTacticalHistory();
        showToast('📍 ' + zoneName + ' — ' + state.tacticalAction);
      });
    });
  }

  function setTacticalAction(type) {
    state.tacticalAction = type;
    document.querySelectorAll('.zone-tag').forEach(t => t.classList.remove('selected'));
    const idMap = { acao: 'action', transicao: 'transition', pressao: 'press' };
    const el = document.getElementById('tag-' + (idMap[type] || 'action'));
    if (el) el.classList.add('selected');
    const labels = { acao: 'Ação na zona clicada', transicao: 'Transição na zona clicada', pressao: 'Pressão na zona clicada' };
    const lbl = document.getElementById('tactical-action-label');
    if (lbl) lbl.textContent = labels[type];
  }

  function renderTacticalHistory() {
    const el = document.getElementById('tactical-history-list');
    if (!el) return;
    const html = state.tacticalLogs.slice(0, 10).map(t => `
      <div class="history-item">
        <span class="history-time">${t.min}'</span>
        <span class="badge badge-${t.type === 'transicao' ? 'away' : t.type === 'pressao' ? 'red' : 'acc'}">${t.type}</span>
        <span class="history-player">${t.zone}</span>
      </div>
    `).join('');
    el.innerHTML = html || '<div style="font-size:11px;color:var(--t3);padding:4px;">Sem registos</div>';
  }

  function clearTacticalMap() {
    state.tacticalLogs = [];
    localStorage.setItem('ls_tactical_logs', JSON.stringify(state.tacticalLogs));
    document.querySelectorAll('.tactical-zone').forEach(z => { z.style.fill = ''; });
    renderTacticalHistory();
    showToast('🗑 Mapa limpo');
  }

  // ── EXCEL EXPORT ───────────────────────────────────────────
  function exportExcel() {
    if (typeof XLSX === 'undefined') { showToast('A carregar... tenta novamente.'); return; }
    if (state.logs.length === 0) { showToast('Sem dados para exportar.'); return; }
    const dateStr = new Date().toLocaleDateString('pt-PT');
    const dataRows = [['Data', 'Minuto', 'Jogador', 'Numero', 'Acao', 'Zona', 'Parte']];
    state.logs.forEach(log => {
      dataRows.push([dateStr, log.min, log.player, log.num, log.action, log.zone, log.half || 1]);
    });
    if (state.oppLogs.length > 0) {
      dataRows.push(['--- ADVERSÁRIO ---']);
      state.oppLogs.forEach(o => {
        dataRows.push(['', o.min, '', '', o.action, o.zone, o.half || '']);
      });
    }
    const resumoRows = [
      ['RESUMO SÃO MANÇOS', dateStr],
      ['Golos Marcados', state.logs.filter(l => l.action === 'Golo Marcado').length],
      ['Golos Sofridos', state.oppLogs.filter(o => o.action === 'Golo Sofrido').length],
      ['Cruzamentos Certos', state.logs.filter(l => l.action === 'Cruzamento Certo').length],
      ['Cruzamentos Falhados', state.logs.filter(l => l.action === 'Cruzamento Falhado').length],
      ['Remates à Baliza', state.logs.filter(l => l.action === 'Remate à Baliza').length],
      ['Remates Fora', state.logs.filter(l => l.action === 'Remate Fora').length],
      ['', ''], ['Jogador', 'Total Ações']
    ];
    const pCounts = {};
    state.logs.forEach(l => { pCounts[l.player] = (pCounts[l.player] || 0) + 1; });
    Object.entries(pCounts).sort((a, b) => b[1] - a[1]).forEach(([n, c]) => { resumoRows.push([n, c]); });

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(dataRows);
    const ws2 = XLSX.utils.aoa_to_sheet(resumoRows);
    ws1['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 8 }, { wch: 18 }, { wch: 15 }, { wch: 6 }];
    ws2['!cols'] = [{ wch: 20 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Base de Dados');
    XLSX.utils.book_append_sheet(wb, ws2, 'Resumo');
    XLSX.writeFile(wb, `SaoMancos_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('📊 Excel descarregado!');
  }

  function exportTacticalExcel() {
    if (typeof XLSX === 'undefined') { showToast('A carregar...'); return; }
    if (state.tacticalLogs.length === 0) { showToast('Sem registos tácticos.'); return; }
    const dateStr = new Date().toLocaleDateString('pt-PT');
    const rows = [['Data', 'Minuto', 'Parte', 'Zona', 'Tipo']];
    state.tacticalLogs.forEach(t => { rows.push([dateStr, t.min, t.half, t.zone, t.type]); });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 6 }, { wch: 15 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Registo Táctico');
    XLSX.writeFile(wb, `SaoMancos_Tactico_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('📊 Mapa táctico exportado!');
  }

  // ── AUTO-SAVE ─────────────────────────────────────────────
  let _autoSaveInterval = null;
  function startAutoSave() {
    if (_autoSaveInterval) clearInterval(_autoSaveInterval);
    _autoSaveInterval = setInterval(() => {
      localStorage.setItem('ls_logs', JSON.stringify(state.logs));
      localStorage.setItem('ls_opp_logs', JSON.stringify(state.oppLogs));
      localStorage.setItem('ls_tactical_logs', JSON.stringify(state.tacticalLogs));
    }, 15000);
  }

  // ── TOAST ─────────────────────────────────────────────────
  function showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => { el.classList.remove('show'); }, 3000);
  }

  // ── TAB SWITCHING ─────────────────────────────────────────
  function switchTab(tab) {
    state.activeTab = tab;
    const vs = document.getElementById('view-stats');
    const vt = document.getElementById('view-tactic');
    const ts = document.getElementById('tab-stats');
    const tt = document.getElementById('tab-tactic');
    if (vs) vs.classList.toggle('active', tab === 'stats');
    if (vt) vt.classList.toggle('active', tab === 'tactic');
    if (ts) ts.classList.toggle('active', tab === 'stats');
    if (tt) tt.classList.toggle('active', tab === 'tactic');
  }

  // ── ONLINE STATUS ────────────────────────────────────────
  function checkOnlineStatus() {
    const el = document.getElementById('offline-status');
    if (!el) return;
    window.addEventListener('online',  () => { el.style.display = 'none'; });
    window.addEventListener('offline', () => { el.style.display = 'inline'; });
  }

  // ── INIT ──────────────────────────────────────────────────
  function init() {
    // Carregar timestamps primeiro
    loadTimestamps();

    // Carregar dados persistidos
    state.half = parseInt(localStorage.getItem('ls_half')) || 1;

    const defaultPlayers = [
      { num: 1, name: 'GR' }, { num: 2, name: 'Defesa D.' }, { num: 3, name: 'Defesa E.' },
      { num: 4, name: 'Central 1' }, { num: 5, name: 'Central 2' }, { num: 6, name: 'Trinco' },
      { num: 8, name: 'Médio' }, { num: 10, name: 'Médio Of.' }, { num: 7, name: 'Extremo D.' },
      { num: 11, name: 'Extremo E.' }, { num: 9, name: 'Ponta Lança' },
      { num: 12, name: 'Suplente 12' }, { num: 13, name: 'Suplente 13' },
      { num: 14, name: 'Suplente 14' }, { num: 15, name: 'Suplente 15' },
      { num: 16, name: 'Suplente 16' }, { num: 17, name: 'Suplente 17' }, { num: 18, name: 'Suplente 18' }
    ];

    state.players = JSON.parse(localStorage.getItem('ls_team')) || defaultPlayers;
    state.logs = JSON.parse(localStorage.getItem('ls_logs')) || [];
    state.oppLogs = JSON.parse(localStorage.getItem('ls_opp_logs')) || [];
    state.tacticalLogs = JSON.parse(localStorage.getItem('ls_tactical_logs')) || [];

    // Recalcular seconds a partir dos timestamps
    state.seconds = getElapsedSeconds();

    // Se estava a correr quando a página fechou, retomar o loop
    if (state.isRunning && state.startTimestamp !== null) {
      requestAnimationFrame(timerRafLoop);
    }

    // Tab switching
    const tabStats = document.getElementById('tab-stats');
    const tabTactic = document.getElementById('tab-tactic');
    if (tabStats) tabStats.addEventListener('click', () => switchTab('stats'));
    if (tabTactic) tabTactic.addEventListener('click', () => switchTab('tactic'));

    // Timer controls
    const btnPlay = document.getElementById('btn-timer-play');
    const btnReset = document.getElementById('btn-timer-reset');
    if (btnPlay) btnPlay.addEventListener('click', () => toggleTimer());
    if (btnReset) btnReset.addEventListener('click', () => resetTimer());

    // Half buttons
    const btn1p = document.getElementById('btn-1p');
    const btn2p = document.getElementById('btn-2p');
    if (btn1p) btn1p.addEventListener('click', () => setHalf(1));
    if (btn2p) btn2p.addEventListener('click', () => setHalf(2));
    updateHalfButtons();

    // Inicializar mapa táctico
    initTacticalMap();

    // Iniciar auto-save
    startAutoSave();

    // Verificar online
    checkOnlineStatus();

    // Primeira render
    updateTimerDisplay();
    renderPlayerGrid();
    renderActionGrid();
    renderHeatmap();
    renderActionChart();
    renderTopPlayers();
    renderOppActions();
    renderMatchHistory();
    renderTacticalHistory();
    updateStats();

    // Demo data se vazio
    if (state.logs.length === 0) {
      state.logs = [
        { id: 1, min: 5,  half: 1, player: 'Médio',       num: 8,  action: 'Passe Falhado',     score: -1, zone: 'Meio Centro' },
        { id: 2, min: 12, half: 1, player: 'Extremo D.', num: 7,  action: 'Cruzamento Certo',   score: 1,  zone: 'Ataque Dir.' },
        { id: 3, min: 23, half: 1, player: 'Ponta Lança', num: 9,  action: 'Remate à Baliza',   score: 1,  zone: 'Ataque Centro' },
        { id: 4, min: 31, half: 1, player: 'Trinco',      num: 6,  action: 'Desarme Certo',     score: 1,  zone: 'Defesa Centro' },
        { id: 5, min: 45, half: 1, player: 'Ponta Lança', num: 9,  action: 'Golo Marcado',      score: 1,  zone: 'Ataque Centro' },
        { id: 6, min: 28, half: 1, player: 'Extremo E.', num: 11,  action: 'Perda de Bola',     score: -1, zone: 'Meio Esq.' },
        { id: 7, min: 15, half: 1, player: 'GR',          num: 1,  action: 'Saque',             score: 0,  zone: 'Defesa Centro' }
      ];
      state.oppLogs = [
        { id: 1, min: 38, action: 'Golo Sofrido', zone: 'Ataque Centro', half: 1 },
        { id: 2, min: 22, action: 'Canto',         zone: 'Ataque Dir.',   half: 1 }
      ];
      updateStats();
      renderOppActions();
      renderMatchHistory();
    }
  }

  function updateHalfButtons() {
    const b1 = document.getElementById('btn-1p');
    const b2 = document.getElementById('btn-2p');
    if (b1) b1.classList.toggle('active', state.half === 1);
    if (b2) b2.classList.toggle('active', state.half === 2);
  }

  // ── PROXY COM HANDLERS ─────────────────────────────────────
  // O Proxy interceeta mudanças em 'state' e dispara re-render
  const handler = {
    get(target, prop, receiver) {
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value) {
      const result = Reflect.set(target, prop, value);
      // Após qualquer mudança de propriedade, re-renderizar
      updateUI();
      return result;
    }
  };

  const proxy = new Proxy(state, handler);

  // Expor funções como métodos no proxy (para uso no HTML via AppState.xxx)
  proxy.selectPlayer      = selectPlayer;
  proxy.renderActionGrid  = renderActionGrid;
  proxy.askZone           = askZone;
  proxy.closeZoneModal    = closeZoneModal;
  proxy.recordAction      = recordAction;
  proxy.registerEquipaAction = registerEquipaAction;
  proxy.addOppQuick       = addOppQuick;
  proxy.setHalf           = setHalf;
  proxy.setStatFilter     = setStatFilter;
  proxy.showZoneDetail    = showZoneDetail;
  proxy.setTacticalAction = setTacticalAction;
  proxy.clearTacticalMap  = clearTacticalMap;
  proxy.exportExcel       = exportExcel;
  proxy.exportTacticalExcel = exportTacticalExcel;
  proxy.saveMatchToHistory = saveMatchToHistory;
  proxy.toggleTimer       = toggleTimer;
  proxy.resetTimer        = resetTimer;
  proxy.updateStats        = updateStats;
  proxy.renderPlayerGrid  = renderPlayerGrid;
  proxy.renderHeatmap     = renderHeatmap;
  proxy.renderActionChart = renderActionChart;
  proxy.renderTopPlayers  = renderTopPlayers;
  proxy.renderOppActions  = renderOppActions;
  proxy.renderMatchHistory = renderMatchHistory;
  proxy.renderTacticalHistory = renderTacticalHistory;
  proxy.showToast         = showToast;
  proxy.switchTab         = switchTab;
  proxy.init              = init;

  return proxy;
}

// Instância global + expor para window (para uso com script tag)
const AppState = createAppState();
window.AppState = AppState;

// Auto-init quando DOM pronto
window.addEventListener('DOMContentLoaded', () => { AppState.init(); });

// Exports (para import noutros módulos)
export { AppState, createAppState };