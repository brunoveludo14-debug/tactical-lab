const fs = require('fs');

let html = fs.readFileSync('tactical.html', 'utf8');

const promptModal = `<!-- ── CUSTOM PROMPT MODAL ─────────────────────────────────────── -->
<div id="prompt-overlay" role="dialog" aria-modal="true" aria-labelledby="prompt-title-el" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:9999; justify-content:center; align-items:center; opacity:0; transition:opacity 0.2s;">
  <div id="prompt-modal" style="background:#112217; border:1px solid #2a5a3b; border-radius:12px; padding:24px; width:90%; max-width:400px; box-shadow:0 10px 30px rgba(0,0,0,0.5); transform:translateY(20px); transition:transform 0.2s;">
    <div class="cfm-head" style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
      <div class="cfm-icon" style="background:rgba(61, 220, 132, 0.1); color:#3ddc84; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
      </div>
      <div class="cfm-title" id="prompt-title-el" style="font-size:1.1em; font-weight:600; color:white;">Inserir Valor</div>
    </div>
    <input type="text" id="prompt-input-el" style="width:100%; padding:12px; border-radius:6px; border:1px solid #2a5a3b; background:#0c1610; color:white; font-size:16px; margin-bottom:20px; outline:none;" autocomplete="off" />
    <div class="cfm-actions" style="display:flex; justify-content:flex-end; gap:12px;">
      <button class="cfm-btn cancel" id="prompt-cancel" style="padding:10px 16px; border-radius:6px; border:1px solid #333; background:transparent; color:#aaa; cursor:pointer;">Cancelar</button>
      <button class="cfm-btn confirm" id="prompt-confirm" style="padding:10px 16px; border-radius:6px; border:none; background:#3ddc84; color:#031108; font-weight:600; cursor:pointer;">OK</button>
    </div>
  </div>
</div>`;

html = html.replace('<!-- ── CUSTOM CONFIRM MODAL ─────────────────────────────────────── -->', promptModal + '\n\n<!-- ── CUSTOM CONFIRM MODAL ─────────────────────────────────────── -->');
html = html.replace('<script type="module" src="app.js?v=105"></script>', '<script src="modules/qrcode.min.js"></script>\n  <script type="module" src="app.js?v=105"></script>');
html = html.replace('<canvas id="share-qr-canvas" width="180" height="180" aria-label="QR Code"></canvas>', '<div id="share-qr-canvas" aria-label="QR Code"></div>');

fs.writeFileSync('tactical.html', html, 'utf8');
console.log('HTML updated successfully!');
