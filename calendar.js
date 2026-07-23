export const CalendarModule = (function() {
  
  // State for Calendar
  let currentMonth = new Date().getMonth();
  let currentYear = new Date().getFullYear();
  let events = {}; // Format: { "YYYY-MM-DD": [ { id, type, title, time, duration, content } ] }
  
  // AI Suggestions Data
  const aiSuggestions = [
    { id: 'org_ofensiva', title: '⚽ Organização Ofensiva', desc: 'Posse de bola, construção e criação.', text: "🔹 FOCO: Organização Ofensiva\n\n1. Aquecimento (15m): Rondos 6x2 com transição.\n2. Ex. Principal (35m): Jogo de Posição 8x8+3 curingas. Foco em encontrar homem livre entre linhas.\n3. Jogo (40m): 11x11, golos após 10 trocas de bola valem a dobrar." },
    { id: 'trans_ofensiva', title: '🚀 Transição Ofensiva', desc: 'Saída rápida e ataque à profundidade.', text: "🔹 FOCO: Transição Ofensiva\n\n1. Aquecimento (15m): Exercício de passe com aceleração.\n2. Ex. Principal (35m): Ataque rápido 3x2 e 4x3. Finalizar em menos de 8 segundos.\n3. Jogo (40m): Jogo condicionado, transições após recuperação no meio campo defensivo." },
    { id: 'org_defensiva', title: '🛡️ Organização Defensiva', desc: 'Bloco compacto, coberturas e basculação.', text: "🔹 FOCO: Organização Defensiva\n\n1. Aquecimento (15m): Deslocamentos defensivos sem bola.\n2. Ex. Principal (35m): Defesa do bloco (linha de 4 e 3) contra ataque organizado. Foco em não ser penetrado pelo centro.\n3. Jogo (40m): 11x11, defesa só pode usar meio campo para trás." },
    { id: 'trans_defensiva', title: '🛑 Transição Defensiva', desc: 'Reação à perda da bola.', text: "🔹 FOCO: Transição Defensiva (Gegenpressing)\n\n1. Aquecimento (15m): Rondos rápidos, quem perde a bola tenta recuperar imediatamente.\n2. Ex. Principal (35m): Posse 7x7 em espaço reduzido. Quem perde tem 5s para recuperar ou adversário marca golo em mini-balizas.\n3. Jogo (40m): Jogo formal com foco na pressão pós-perda." },
    { id: 'bolas_ofensivas', title: '🎯 Bolas Paradas Ofensivas', desc: 'Cantos, livres e esquemas táticos.', text: "🔹 FOCO: Bolas Paradas Ofensivas\n\n1. Aquecimento (15m): Coordenação e impulsão.\n2. Ex. Principal (45m): Ensaiar 3 esquemas de cantos (1º poste, 2º poste, curto) e 2 livres laterais.\n3. Jogo (30m): Jogo formal onde cada falta gera uma bola parada trabalhada." },
    { id: 'bolas_defensivas', title: '🧱 Bolas Paradas Defensivas', desc: 'Marcação homem a homem ou zona.', text: "🔹 FOCO: Bolas Paradas Defensivas\n\n1. Aquecimento (15m): Disputa de bola aérea.\n2. Ex. Principal (45m): Posicionamento defensivo em cantos (zona + homem). Simulação de bloqueios do adversário.\n3. Jogo (30m): Foco em não cometer faltas perigosas e afastar segundas bolas." },
    { id: 'fisico', title: '🏃 Treino Físico/Força', desc: 'Condicionamento, sprints e ginásio.', text: "🔹 FOCO: Físico & Força\n\n1. Ginásio (45m): Circuito de força explosiva (membros inferiores) e core.\n2. Campo (45m): Sprints repetidos, mudanças de direção e resistência intermitente (sem bola)." },
    { id: 'recuperacao', title: '🧘 Recuperação Ativa', desc: 'Pós-jogo, alongamentos e crioterapia.', text: "🔹 FOCO: Recuperação Ativa\n\n1. Campo (30m): Corrida leve, mobilidade articular, rolo de massagem.\n2. Hidroterapia (20m): Banhos de contraste (gelo/água quente).\n3. Fisioterapia: Avaliação de toques do jogo anterior." }
  ];

  // DOM Elements
  let els = {};
  
  // Selected Day
  let selectedDate = null;
  let editingEventId = null;

  function init() {
    loadEvents();
    
    // Create Calendar UI
    const view = document.getElementById('view-calendar');
    if(!view) return;
    
    view.innerHTML = `
      <div class="cal-container">
        <div class="cal-header">
          <div class="cal-month-title">
            <button class="cal-nav-btn" id="cal-prev-mo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>
            <span id="cal-mo-txt"></span>
            <button class="cal-nav-btn" id="cal-next-mo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></button>
          </div>
          <div class="cal-actions">
            <button class="cal-btn-outline" id="cal-btn-today">Ir para Hoje</button>
            <button class="cal-btn-primary" id="cal-btn-add">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Criar Evento
            </button>
          </div>
        </div>
        
        <div class="cal-grid-wrapper">
          <div class="cal-weekdays">
            <div class="cal-weekday">Segunda</div>
            <div class="cal-weekday">Terça</div>
            <div class="cal-weekday">Quarta</div>
            <div class="cal-weekday">Quinta</div>
            <div class="cal-weekday">Sexta</div>
            <div class="cal-weekday">Sábado</div>
            <div class="cal-weekday">Domingo</div>
          </div>
          <div class="cal-grid" id="cal-grid"></div>
        </div>
      </div>

      <!-- Sidebar Form -->
      <div class="cal-sidebar" id="cal-sidebar" style="display:none;">
        <div class="cal-sidebar-header">
          <span id="cal-sb-title">Detalhes do Evento</span>
          <button class="cal-close-btn" id="cal-btn-close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div class="cal-sidebar-body">
          <div class="cal-form-group">
            <label class="cal-form-label">Data</label>
            <input type="date" class="cal-form-input" id="cal-ev-date">
          </div>
          <div class="cal-form-group">
            <label class="cal-form-label">Tipo de Evento</label>
            <div class="cal-type-selector">
              <button class="cal-type-btn active t-treino" data-type="treino">Treino</button>
              <button class="cal-type-btn t-jogo" data-type="jogo">Jogo</button>
              <button class="cal-type-btn t-pre" data-type="pre">Pré-época</button>
            </div>
          </div>
          <div class="cal-form-group">
            <label class="cal-form-label">Título</label>
            <input type="text" class="cal-form-input" id="cal-ev-title" placeholder="Ex: Treino Tático">
          </div>
          <div style="display: flex; gap: 12px;">
            <div class="cal-form-group" style="flex: 1;">
              <label class="cal-form-label">Início</label>
              <input type="time" class="cal-form-input" id="cal-ev-time" value="10:00">
            </div>
            <div class="cal-form-group" style="flex: 1;">
              <label class="cal-form-label">Duração (m)</label>
              <input type="number" class="cal-form-input" id="cal-ev-dur" value="90">
            </div>
          </div>
          <div class="cal-form-group" style="margin-top: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <label class="cal-form-label" style="margin: 0;">Conteúdo</label>
              <div class="ai-container">
                <button class="ai-btn" id="cal-btn-ai" title="Assistente IA">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                  ✨ Sugestões Gemini IA
                </button>
                <div class="ai-dropdown" id="cal-ai-dropdown">
                  <div class="ai-dd-header">Planos Recomendados</div>
                  <div class="ai-dd-body" id="cal-ai-opts"></div>
                </div>
              </div>
            </div>
            <textarea id="cal-ev-content" class="cal-form-textarea" placeholder="Detalhes do exercício, observações..."></textarea>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="cal-btn-outline" id="cal-btn-delete" style="color:var(--red); border-color:rgba(232,85,85,0.3); display:none; padding:14px; flex-shrink:0;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
            <button class="cal-btn-primary" id="cal-btn-save" style="justify-content:center; padding: 14px; flex:1; font-size: 14px;">Guardar Evento</button>
          </div>
        </div>
      </div>
    `;

    // Cache els
    els.grid = document.getElementById('cal-grid');
    els.moTxt = document.getElementById('cal-mo-txt');
    els.sb = document.getElementById('cal-sidebar');
    els.sbTitle = document.getElementById('cal-sb-title');
    
    // AI Dropdown setup
    const aiOpts = document.getElementById('cal-ai-opts');
    aiSuggestions.forEach(s => {
      const d = document.createElement('div');
      d.className = 'ai-option';
      d.innerHTML = `<span class="ai-opt-title">${s.title}</span><span class="ai-opt-desc">${s.desc}</span>`;
      d.onclick = () => {
        document.getElementById('cal-ev-content').value = s.text;
        if(document.getElementById('cal-ev-title').value.trim() === '') {
          document.getElementById('cal-ev-title').value = s.title.replace(/[^a-zA-ZáàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ ]/g, '').trim();
        }
        document.getElementById('cal-ai-dropdown').classList.remove('open');
      };
      aiOpts.appendChild(d);
    });

    document.getElementById('cal-btn-ai').addEventListener('click', (e) => {
      document.getElementById('cal-ai-dropdown').classList.toggle('open');
      e.stopPropagation();
    });
    document.addEventListener('click', () => {
      const dd = document.getElementById('cal-ai-dropdown');
      if(dd) dd.classList.remove('open');
    });

    // Events bindings
    document.getElementById('cal-prev-mo').onclick = () => { currentMonth--; render(); };
    document.getElementById('cal-next-mo').onclick = () => { currentMonth++; render(); };
    document.getElementById('cal-btn-today').onclick = () => {
      currentMonth = new Date().getMonth();
      currentYear = new Date().getFullYear();
      render();
    };
    document.getElementById('cal-btn-add').onclick = () => openSidebar();
    document.getElementById('cal-btn-close').onclick = () => els.sb.style.display = 'none';

    document.getElementById('cal-btn-save').onclick = saveEvent;
    document.getElementById('cal-btn-delete').onclick = deleteEvent;

    // Type selector
    const types = document.querySelectorAll('.cal-type-btn');
    types.forEach(btn => {
      btn.onclick = () => {
        types.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });

    render();
  }

  function loadEvents() {
    const data = localStorage.getItem('tactical_lab_calendar');
    if(data) {
      try { events = JSON.parse(data); } catch(e) { events = {}; }
    }
  }

  function persist() {
    localStorage.setItem('tactical_lab_calendar', JSON.stringify(events));
  }

  function render() {
    if(currentMonth < 0) { currentMonth = 11; currentYear--; }
    if(currentMonth > 11) { currentMonth = 0; currentYear++; }
    
    const date = new Date(currentYear, currentMonth, 1);
    const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    els.moTxt.textContent = `${monthNames[currentMonth]} ${currentYear}`;

    els.grid.innerHTML = '';
    
    // JS days: 0(Sun) to 6(Sat). We want Mon=0 to Sun=6.
    let startDay = date.getDay() - 1;
    if(startDay < 0) startDay = 6;
    
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    // Empty cells
    for(let i = 0; i < startDay; i++) {
      const div = document.createElement('div');
      div.className = 'cal-day empty';
      els.grid.appendChild(div);
    }
    
    const today = new Date();
    
    // Days
    for(let i = 1; i <= daysInMonth; i++) {
      const div = document.createElement('div');
      div.className = 'cal-day';
      
      const isToday = today.getDate() === i && today.getMonth() === currentMonth && today.getFullYear() === currentYear;
      if(isToday) div.classList.add('today');
      
      const dayStr = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
      
      let html = `<span class="day-num">${i}</span><div class="cal-events">`;
      
      if(events[dayStr]) {
        // Sort by time
        events[dayStr].sort((a,b) => a.time.localeCompare(b.time));
        events[dayStr].forEach(ev => {
          html += `<div class="event-pill ev-${ev.type}" data-date="${dayStr}" data-id="${ev.id}">
            <span class="time">${ev.time}</span> ${ev.title}
          </div>`;
        });
      }
      
      html += `</div>`;
      div.innerHTML = html;
      
      // Click empty space in day to add event
      div.onclick = (e) => {
        if(e.target === div || e.target.classList.contains('cal-events')) {
          openSidebar(dayStr);
        }
      };
      
      els.grid.appendChild(div);
    }
    
    // Bind pill clicks
    els.grid.querySelectorAll('.event-pill').forEach(pill => {
      pill.onclick = (e) => {
        e.stopPropagation();
        openSidebar(pill.dataset.date, pill.dataset.id);
      };
    });
  }

  function openSidebar(dateStr = null, eventId = null) {
    els.sb.style.display = 'flex';
    document.getElementById('cal-btn-delete').style.display = eventId ? 'block' : 'none';
    
    if(!dateStr) {
      const today = new Date();
      dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    }
    
    document.getElementById('cal-ev-date').value = dateStr;
    selectedDate = dateStr;
    editingEventId = eventId;
    
    if(eventId && events[dateStr]) {
      const ev = events[dateStr].find(x => x.id === eventId);
      if(ev) {
        els.sbTitle.textContent = "Editar Evento";
        document.getElementById('cal-ev-title').value = ev.title;
        document.getElementById('cal-ev-time').value = ev.time;
        document.getElementById('cal-ev-dur').value = ev.duration;
        document.getElementById('cal-ev-content').value = ev.content || '';
        
        document.querySelectorAll('.cal-type-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.type === ev.type);
        });
        return;
      }
    }
    
    // New Event
    els.sbTitle.textContent = "Novo Evento";
    document.getElementById('cal-ev-title').value = '';
    document.getElementById('cal-ev-time').value = '10:00';
    document.getElementById('cal-ev-dur').value = '90';
    document.getElementById('cal-ev-content').value = '';
    document.querySelectorAll('.cal-type-btn').forEach((b, i) => b.classList.toggle('active', i===0));
  }

  function saveEvent() {
    const dateStr = document.getElementById('cal-ev-date').value;
    if(!dateStr) return;
    
    const type = document.querySelector('.cal-type-btn.active').dataset.type;
    const title = document.getElementById('cal-ev-title').value.trim() || 'Evento Sem Título';
    const time = document.getElementById('cal-ev-time').value || '00:00';
    const duration = document.getElementById('cal-ev-dur').value || '60';
    const content = document.getElementById('cal-ev-content').value;
    
    if(!events[dateStr]) events[dateStr] = [];
    
    if(editingEventId) {
      const idx = events[selectedDate].findIndex(x => x.id === editingEventId);
      if(idx > -1) {
        if(selectedDate !== dateStr) {
          // Moved to another day
          events[selectedDate].splice(idx, 1);
          events[dateStr].push({ id: editingEventId, type, title, time, duration, content });
        } else {
          events[dateStr][idx] = { id: editingEventId, type, title, time, duration, content };
        }
      }
    } else {
      // Create new
      const id = Date.now().toString();
      events[dateStr].push({ id, type, title, time, duration, content });
    }
    
    persist();
    render();
    els.sb.style.display = 'none';
  }

  function deleteEvent() {
    if(!editingEventId || !selectedDate || !events[selectedDate]) return;
    events[selectedDate] = events[selectedDate].filter(x => x.id !== editingEventId);
    persist();
    render();
    els.sb.style.display = 'none';
  }

  return { init };
})();
