// Lucy · asistente de tueste para Gene Café
// Lógica del cronómetro, temperatura por escalones, alertas (visual + beep + voz)
// y persistencia ligera de la sesión en localStorage.

const STORAGE_KEY = 'lucy-coffee-session';
const MUTE_KEY = 'lucy-coffee-mute';

const els = {
  timer: document.getElementById('timer'),
  timerMeta: document.getElementById('timer-meta'),
  phase: document.getElementById('phase'),
  temp: document.getElementById('temperature'),
  note: document.getElementById('note'),
  nextTemp: document.getElementById('next-temp'),
  countdown: document.getElementById('countdown'),
  progress: document.getElementById('phase-progress-fill'),
  select: document.getElementById('profile-select'),
  btnStart: document.getElementById('btn-start'),
  btnPause: document.getElementById('btn-pause'),
  btnReset: document.getElementById('btn-reset'),
  btnMute: document.getElementById('btn-mute')
};

let profile = PROFILES[0];
let elapsedSeconds = 0;
let interval = null;
let running = false;
let chart = null;
let lastPointTime = null;
let muted = false;
let audioCtx = null;
let alertTimeout = null;
const ALERT_DURATION_MS = 12000;

/* ---------- helpers ---------- */

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function maxMinutes() {
  return profile.points[profile.points.length - 1].time;
}

function getCurrentPoint(minutes) {
  let current = profile.points[0];
  for (const p of profile.points) {
    if (minutes >= p.time) current = p;
  }
  return current;
}

function getNextPoint(minutes) {
  for (const p of profile.points) {
    if (p.time > minutes) return p;
  }
  return null;
}

function phaseProgress(minutes) {
  const cur = getCurrentPoint(minutes);
  const next = getNextPoint(minutes);
  if (!next) return 1;
  return Math.min(1, Math.max(0, (minutes - cur.time) / (next.time - cur.time)));
}

/* ---------- alertas ---------- */

function ensureAudio() {
  if (audioCtx) return audioCtx;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (_) { audioCtx = null; }
  return audioCtx;
}

function playBeepSequence(ctx) {
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1000;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime + 0.05 + i * 0.22;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.55, t + 0.012);
    gain.gain.setValueAtTime(0.55, t + 0.16);
    gain.gain.linearRampToValueAtTime(0, t + 0.2);
    osc.start(t);
    osc.stop(t + 0.22);
  }
}

function tripleBeep() {
  const ctx = ensureAudio();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().then(() => playBeepSequence(ctx)).catch(() => {});
  } else {
    playBeepSequence(ctx);
  }
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  try {
    if (speechSynthesis.speaking || speechSynthesis.pending) {
      speechSynthesis.cancel();
    }
    const fire = () => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES';
      u.rate = 1.0;
      u.pitch = 1.0;
      u.volume = 1.0;
      speechSynthesis.speak(u);
    };
    // Pequeño retardo para sortear el bug Chrome cancel+speak
    setTimeout(fire, 120);
  } catch (_) { /* ignore */ }
}

function triggerStepAlert(point) {
  els.temp.classList.add('alerting');
  els.nextTemp.classList.add('alerting');
  if (alertTimeout) clearTimeout(alertTimeout);
  alertTimeout = setTimeout(() => {
    els.temp.classList.remove('alerting');
    els.nextTemp.classList.remove('alerting');
  }, ALERT_DURATION_MS);

  if (!muted) {
    tripleBeep();
    speak(point.phase + '. ' + point.temp + ' grados');
  }
}

function setMuted(value) {
  const wasMuted = muted;
  muted = !!value;
  els.btnMute.textContent = muted ? 'Silencio' : 'Sonido';
  els.btnMute.classList.toggle('muted', muted);
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (_) {}
  if (muted && 'speechSynthesis' in window) speechSynthesis.cancel();
  // Al activar el sonido, lanza un beep de prueba para verificar audio
  if (wasMuted && !muted) {
    ensureAudio();
    tripleBeep();
  }
}

/* ---------- UI sync ---------- */

function updateUI() {
  const minutes = elapsedSeconds / 60;
  const point = getCurrentPoint(minutes);
  const next = getNextPoint(minutes);

  // Detectar transición a un nuevo escalón
  if (lastPointTime !== null && point.time !== lastPointTime) {
    triggerStepAlert(point);
  }
  lastPointTime = point.time;

  els.timer.textContent = formatTime(elapsedSeconds);
  els.timerMeta.textContent = '/ ' + formatTime(maxMinutes() * 60);
  els.phase.textContent = point.phase;
  els.temp.innerHTML = point.temp + '<span class="temp-unit">°C</span>';
  els.note.textContent = point.note;

  // Barra: decrece según el tiempo restante hasta el próximo cambio
  const remainingRatio = next ? (1 - phaseProgress(minutes)) : 0;
  els.progress.style.width = (remainingRatio * 100).toFixed(1) + '%';

  if (next) {
    const remaining = Math.max(0, Math.round(next.time * 60 - elapsedSeconds));
    els.countdown.textContent = formatTime(remaining);
    els.nextTemp.innerHTML = next.temp + '<span class="temp-unit">°C</span>';
  } else {
    els.countdown.textContent = '—';
    els.nextTemp.textContent = '—';
  }

  if (point.alert) {
    document.body.classList.add('flash-red');
  } else {
    document.body.classList.remove('flash-red');
  }

  updateChart(minutes, point.temp);
}

function setButtons() {
  els.btnStart.disabled = running;
  els.btnPause.disabled = !running;
}

/* ---------- timer control ---------- */

function startRoast() {
  if (running) return;
  ensureAudio();
  running = true;
  setButtons();
  saveSession();

  interval = setInterval(() => {
    elapsedSeconds++;
    updateUI();
    saveSession();
    if (elapsedSeconds >= maxMinutes() * 60) {
      pauseRoast();
    }
  }, 1000);
}

function pauseRoast() {
  running = false;
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  setButtons();
  saveSession();
}

function resetRoast() {
  pauseRoast();
  elapsedSeconds = 0;
  document.body.classList.remove('flash-red');
  els.temp.classList.remove('alerting');
  els.nextTemp.classList.remove('alerting');
  if (alertTimeout) { clearTimeout(alertTimeout); alertTimeout = null; }
  lastPointTime = getCurrentPoint(0).time;
  updateUI();
  saveSession();
}

/* ---------- profile switching ---------- */

function setProfile(id) {
  const found = PROFILES.find(p => p.id === id);
  if (!found) return;
  profile = found;
  lastPointTime = getCurrentPoint(elapsedSeconds / 60).time;
  rebuildChart();
  updateUI();
  saveSession();
}

/* ---------- chart ---------- */

function buildChart() {
  const ctx = document.getElementById('roastChart').getContext('2d');
  const axisColor = '#7a7a7a';
  const gridColor = 'rgba(255, 255, 255, 0.04)';
  const lineColor = '#cfcfcf';
  const accent = '#f4c542';
  const axisFont = { size: 10, family: "'Inter', sans-serif", weight: '500' };
  const tickFont = { size: 10, family: "'Inter', sans-serif", weight: '400' };

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Perfil',
          data: profile.points.map(p => ({ x: p.time, y: p.temp })),
          borderWidth: 1.25,
          borderColor: lineColor,
          backgroundColor: 'transparent',
          pointRadius: 2.5,
          pointBackgroundColor: lineColor,
          pointBorderWidth: 0,
          stepped: 'before',
          fill: false
        },
        {
          label: 'Ahora',
          data: [{ x: 0, y: profile.points[0].temp }],
          pointRadius: 6,
          pointBackgroundColor: accent,
          pointBorderColor: '#0a0a0a',
          pointBorderWidth: 2,
          showLine: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      layout: { padding: { top: 8, right: 12, bottom: 4, left: 4 } },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'MIN', color: axisColor, font: axisFont, padding: { top: 8 } },
          min: 0,
          max: Math.ceil(maxMinutes()),
          ticks: { stepSize: 1, color: axisColor, font: tickFont },
          grid: { color: gridColor, drawBorder: false, tickColor: 'transparent' },
          border: { display: false }
        },
        y: {
          title: { display: true, text: '°C', color: axisColor, font: axisFont, padding: { bottom: 8 } },
          min: 140,
          max: 250,
          ticks: { color: axisColor, font: tickFont },
          grid: { color: gridColor, drawBorder: false, tickColor: 'transparent' },
          border: { display: false }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: '#b8b8b8',
            boxWidth: 8,
            boxHeight: 8,
            usePointStyle: true,
            font: { size: 10, family: "'Inter', sans-serif", weight: '500' }
          }
        }
      }
    }
  });
}

function rebuildChart() {
  if (!chart) return;
  chart.data.datasets[0].data = profile.points.map(p => ({ x: p.time, y: p.temp }));
  chart.options.scales.x.max = Math.ceil(maxMinutes());
  chart.update();
}

function updateChart(minutes, temp) {
  if (!chart) return;
  chart.data.datasets[1].data = [{ x: minutes, y: temp }];
  chart.update('none');
}

/* ---------- persistence ---------- */

function saveSession() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      profileId: profile.id,
      elapsedSeconds,
      running
    }));
  } catch (_) { /* ignore quota / private mode */ }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const found = PROFILES.find(p => p.id === saved.profileId);
      if (found) profile = found;
      elapsedSeconds = Number.isFinite(saved.elapsedSeconds) ? saved.elapsedSeconds : 0;
      const shouldResume = saved.running && elapsedSeconds < maxMinutes() * 60;
      if (shouldResume) {
        running = false;
        setTimeout(startRoast, 0);
      }
    }
    const m = localStorage.getItem(MUTE_KEY);
    if (m === '1') muted = true;
  } catch (_) { /* ignore parse errors */ }
}

/* ---------- init ---------- */

function populateProfileSelect() {
  els.select.innerHTML = '';
  for (const p of PROFILES) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    els.select.appendChild(opt);
  }
  els.select.value = profile.id;
}

function bindEvents() {
  els.btnStart.addEventListener('click', startRoast);
  els.btnPause.addEventListener('click', pauseRoast);
  els.btnReset.addEventListener('click', resetRoast);
  els.btnMute.addEventListener('click', () => setMuted(!muted));
  els.select.addEventListener('change', e => setProfile(e.target.value));
}

(function init() {
  loadSession();
  populateProfileSelect();
  buildChart();
  bindEvents();
  lastPointTime = getCurrentPoint(elapsedSeconds / 60).time;
  setMuted(muted);
  updateUI();
  setButtons();
})();
