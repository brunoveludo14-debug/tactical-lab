import { State } from '../state.js';
import { showToast } from './ui.js';
import { playKF } from '../animation.js';

export async function exportGIF() {
  if (State.keyframes.length < 2) {
    showToast('Precisa de 2+ fotogramas para exportar GIF');
    return;
  }

  const progEl  = document.getElementById('gif-progress');
  const barEl   = document.getElementById('gif-prog-bar');
  const txtEl   = document.getElementById('gif-prog-txt');
  progEl?.classList.add('show');
  if (txtEl) txtEl.textContent = 'A preparar GIF…';
  if (barEl) barEl.style.width = '0%';

  const frames = [];
  try {
    for (let i = 0; i < State.keyframes.length; i++) {
      const kf = State.keyframes[i];
      const progress = Math.round(((i + 1) / State.keyframes.length) * 80);
      if (barEl) barEl.style.width = `${progress}%`;
      if (txtEl) txtEl.textContent = `Frame ${i + 1}/${State.keyframes.length}…`;

      const W = 320, H = 200;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0c1f15'; ctx.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 14) {
        if (Math.floor(y / 14) % 2 === 0) { ctx.fillStyle = '#0e2318'; ctx.fillRect(0, y, W, 14); }
      }
      ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1;
      ctx.strokeRect(6, 4, W - 12, H - 8);
      ctx.beginPath(); ctx.moveTo(W / 2, 4); ctx.lineTo(W / 2, H - 4); ctx.stroke();
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 32, 0, Math.PI * 2); ctx.stroke();

      kf.players.forEach(p => {
        const px = (p.xp / 100) * W; const py = (p.yp / 100) * H;
        ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2);
        const pl = State.players.find(x => x.id === p.id);
        ctx.fillStyle = pl?.isGk ? '#5bbfff' : '#3ddc84'; ctx.fill();
        ctx.fillStyle = pl?.isGk ? '#031222' : '#031108';
        ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (pl) ctx.fillText(pl.n, px, py);
      });
      (kf.opp || []).forEach(p => {
        const px = (p.xp / 100) * W; const py = (p.yp / 100) * H;
        ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#ff6b4a'; ctx.fill();
      });
      if (kf.ball) {
        ctx.beginPath(); ctx.arc((kf.ball.x / 100) * W, (kf.ball.y / 100) * H, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'white'; ctx.fill();
      }

      frames.push(canvas.toDataURL('image/png'));
      await new Promise(r => setTimeout(r, 10)); 
    }

    if (barEl) barEl.style.width = '90%';
    if (txtEl) txtEl.textContent = 'A gerar ficheiro…';

    const links = frames.map((dataUrl, i) => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `tactical-lab-frame-${String(i + 1).padStart(2, '0')}.png`;
      return a;
    });

    if (barEl) barEl.style.width = '100%';
    if (txtEl) txtEl.textContent = `${frames.length} frames exportados!`;

    for (const link of links) {
      link.click();
      await new Promise(r => setTimeout(r, 200));
    }

    setTimeout(() => { progEl?.classList.remove('show'); }, 2500);
    showToast(`${frames.length} frames exportados como PNG`);

  } catch (err) {
    progEl?.classList.remove('show');
    showToast('Erro ao exportar frames');
  }
}

export async function exportMP4() {
  if (State.keyframes.length < 2) { showToast('Precisa de 2+ fotogramas para exportar vídeo'); return; }

  const pitchEl = document.getElementById('pitch-wrap') || document.getElementById('pitch');
  if (!pitchEl) { showToast('Elemento do campo não encontrado'); return; }

  showToast('A preparar gravação…');

  const W = 1280, H = Math.round(1280 * (pitchEl.offsetHeight / pitchEl.offsetWidth)) || 800;
  const recCanvas = document.createElement('canvas');
  recCanvas.width = W; recCanvas.height = H;
  const recCtx = recCanvas.getContext('2d');

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : null;

  if (!mimeType) {
    try {
      const ok = confirm('O seu browser não suporta gravação directa. Vamos usar a captura de ecrã.');
      if (!ok) return;
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser" }, audio: false });
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `tactical-lab-${Date.now()}.webm`; a.click();
        URL.revokeObjectURL(url); showToast('Vídeo exportado!'); stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      showToast('A gravar… Animação vai começar');
      setTimeout(async () => { await playKF(); setTimeout(() => recorder.stop(), 2500); }, 1500);
    } catch (e) { showToast('Gravação cancelada'); }
    return;
  }

  const stream = recCanvas.captureStream(30); 
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4000000 });
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  let _recRaf;
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tactical-lab-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('🎬 Vídeo exportado com sucesso!');
    cancelAnimationFrame(_recRaf);
  };

  function renderFrame() {
    recCtx.fillStyle = '#0c1f15';
    recCtx.fillRect(0, 0, W, H);
    const stripeH = H / 14;
    for (let i = 0; i < 14; i++) {
      recCtx.fillStyle = i % 2 === 0 ? '#1a4c2a' : '#164424';
      recCtx.fillRect(0, i * stripeH, W, stripeH);
    }
    recCtx.strokeStyle = 'rgba(255,255,255,.7)';
    recCtx.lineWidth = 2;
    const fm = 30;
    recCtx.strokeRect(fm, fm, W - fm*2, H - fm*2);
    recCtx.beginPath(); recCtx.moveTo(fm, H/2); recCtx.lineTo(W-fm, H/2); recCtx.stroke();
    recCtx.beginPath(); recCtx.arc(W/2, H/2, 60, 0, Math.PI*2); recCtx.stroke();
    recCtx.beginPath(); recCtx.arc(W/2, H/2, 3, 0, Math.PI*2); recCtx.fillStyle='white'; recCtx.fill();
    const pbW = 260, pbH = 100;
    recCtx.strokeRect(W/2 - pbW/2, fm, pbW, pbH);
    recCtx.strokeRect(W/2 - pbW/2, H - fm - pbH, pbW, pbH);

    State.players.forEach(p => {
      const el = document.getElementById(`tp${p.id}`);
      if (!el) return;
      const xp = parseFloat(el.style.left) || 0;
      const yp = parseFloat(el.style.top) || 0;
      const px = (xp/100)*W; const py = (yp/100)*H;
      recCtx.beginPath(); recCtx.arc(px, py, 14, 0, Math.PI*2);
      recCtx.fillStyle = p.isGk ? '#5bbfff' : '#3ddc84'; recCtx.fill();
      recCtx.fillStyle = p.isGk ? '#031222' : '#031108';
      recCtx.font = 'bold 16px monospace'; recCtx.textAlign = 'center'; recCtx.textBaseline = 'middle';
      recCtx.fillText(p.n, px, py);
    });

    State.opp.forEach(p => {
      const el = document.getElementById(`topp${p.id}`);
      if (!el) return;
      const xp = parseFloat(el.style.left) || 0;
      const yp = parseFloat(el.style.top) || 0;
      const px = (xp/100)*W; const py = (yp/100)*H;
      recCtx.beginPath(); recCtx.arc(px, py, 14, 0, Math.PI*2);
      recCtx.fillStyle = '#ff6b4a'; recCtx.fill();
    });

    const ballEl = document.getElementById('tball');
    if (ballEl) {
      const bx = parseFloat(ballEl.style.left)||50;
      const by = parseFloat(ballEl.style.top)||50;
      recCtx.beginPath(); recCtx.arc((bx/100)*W, (by/100)*H, 8, 0, Math.PI*2);
      recCtx.fillStyle = 'white'; recCtx.fill();
    }

    _recRaf = requestAnimationFrame(renderFrame);
  }

  renderFrame();
  recorder.start();
  showToast('🔴 A gravar animação…');
  setTimeout(async () => {
    await playKF();
    setTimeout(() => recorder.stop(), 2500);
  }, 1000);
}
