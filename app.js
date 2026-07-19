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
let elapsedSeconds = 0;       // valor mostrado (segundos enteros)
let pausedElapsed = 0;        // segundos acumulados al inicio del tramo activo
let startTimestamp = null;    // Date.now() en el último start
let interval = null;
let running = false;
let chart = null;
let lastPointTime = null;
let muted = false;
let audioCtx = null;
let alertTimeout = null;
let wakeLock = null;
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

function playMarimbaNote(ctx, freq, when) {
  // Sine fundamental + segundo armónico atenuado dan el carácter "pluck"
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  const gain2 = ctx.createGain();

  osc1.type = 'sine';
  osc1.frequency.value = freq;
  osc2.type = 'sine';
  osc2.frequency.value = freq * 2;

  osc1.connect(gain1).connect(ctx.destination);
  osc2.connect(gain2).connect(ctx.destination);

  const attack = 0.006;
  const decay = 0.34;

  gain1.gain.setValueAtTime(0, when);
  gain1.gain.linearRampToValueAtTime(0.55, when + attack);
  gain1.gain.exponentialRampToValueAtTime(0.0001, when + decay);

  gain2.gain.setValueAtTime(0, when);
  gain2.gain.linearRampToValueAtTime(0.18, when + attack);
  gain2.gain.exponentialRampToValueAtTime(0.0001, when + decay * 0.6);

  osc1.start(when);
  osc1.stop(when + decay + 0.05);
  osc2.start(when);
  osc2.stop(when + decay + 0.05);
}

function playBeepSequence(ctx) {
  // Arpegio ascendente G5 · A5 · C6, marimba
  const freqs = [784, 880, 1047];
  const spacing = 0.15;
  const start = ctx.currentTime + 0.05;
  freqs.forEach((f, i) => playMarimbaNote(ctx, f, start + i * spacing));
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
  try {
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
  } catch (err) {
    console.error('alert error', err);
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

function tick() {
  if (startTimestamp === null) return;
  const newElapsed = pausedElapsed + Math.floor((Date.now() - startTimestamp) / 1000);
  if (newElapsed === elapsedSeconds) return;
  elapsedSeconds = newElapsed;
  updateUI();
  saveSession();
  if (elapsedSeconds >= maxMinutes() * 60) {
    pauseRoast();
  }
}

async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (_) { /* permiso denegado o no soportado */ }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

function startRoast() {
  if (running) return;
  ensureAudio();
  running = true;
  pausedElapsed = elapsedSeconds;
  startTimestamp = Date.now();
  setButtons();
  saveSession();
  acquireWakeLock();
  interval = setInterval(tick, 250);
}

function pauseRoast() {
  if (!running) return;
  running = false;
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  if (startTimestamp !== null) {
    elapsedSeconds = pausedElapsed + Math.floor((Date.now() - startTimestamp) / 1000);
    pausedElapsed = elapsedSeconds;
    startTimestamp = null;
  }
  releaseWakeLock();
  setButtons();
  saveSession();
}

function resetRoast() {
  pauseRoast();
  elapsedSeconds = 0;
  pausedElapsed = 0;
  startTimestamp = null;
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

function chartMaxX() {
  const synthEnd = SYNTHETIC_CURVE.length ? SYNTHETIC_CURVE[SYNTHETIC_CURVE.length - 1].x : 0;
  return Math.ceil(Math.max(maxMinutes(), synthEnd));
}

function buildChart() {
  const ctx = document.getElementById('roastChart').getContext('2d');
  const axisColor = '#7a7a7a';
  const gridColor = 'rgba(255, 255, 255, 0.04)';
  const lineColor = '#cfcfcf';
  const accent = '#f4c542';
  const synthetic = '#5fc8ab';
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
        },
        {
          label: 'Curva sintética',
          data: SYNTHETIC_CURVE,
          borderWidth: 2,
          borderColor: synthetic,
          borderDash: [6, 4],
          backgroundColor: 'transparent',
          pointRadius: 0,
          pointHitRadius: 0,
          tension: 0.35,
          fill: false
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
          max: chartMaxX(),
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
  chart.options.scales.x.max = chartMaxX();
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
  // Re-sincroniza el reloj (Date.now real) al volver a la pestaña y reintenta el wake lock
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (running) {
      tick();
      acquireWakeLock();
    }
  });
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
