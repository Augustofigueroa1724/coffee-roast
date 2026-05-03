// Lucy · asistente de tueste para Gene Café
// Lógica del cronómetro, interpolación de temperatura, sincronización con Chart.js
// y persistencia ligera de la sesión en localStorage.

const STORAGE_KEY = 'lucy-coffee-session';

const els = {
  timer: document.getElementById('timer'),
  phase: document.getElementById('phase'),
  temp: document.getElementById('temperature'),
  note: document.getElementById('note'),
  progress: document.getElementById('phase-progress-fill'),
  select: document.getElementById('profile-select'),
  btnStart: document.getElementById('btn-start'),
  btnPause: document.getElementById('btn-pause'),
  btnReset: document.getElementById('btn-reset')
};

let profile = PROFILES[0];
let elapsedSeconds = 0;
let interval = null;
let running = false;
let chart = null;

/* ---------- helpers ---------- */

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function maxMinutes() {
  return profile.points[profile.points.length - 1].time;
}

function interpolateTemp(minutes) {
  const pts = profile.points;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (minutes >= a.time && minutes <= b.time) {
      const ratio = (minutes - a.time) / (b.time - a.time);
      return Math.round(a.temp + ratio * (b.temp - a.temp));
    }
  }
  return pts[pts.length - 1].temp;
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
  return profile.points[profile.points.length - 1];
}

function phaseProgress(minutes) {
  const cur = getCurrentPoint(minutes);
  const next = getNextPoint(minutes);
  if (next.time <= cur.time) return 1;
  return Math.min(1, Math.max(0, (minutes - cur.time) / (next.time - cur.time)));
}

/* ---------- UI sync ---------- */

function updateUI() {
  const minutes = elapsedSeconds / 60;
  const point = getCurrentPoint(minutes);
  const temp = interpolateTemp(minutes);

  els.timer.textContent = formatTime(elapsedSeconds);
  els.phase.textContent = point.phase;
  els.temp.textContent = 'Temp. objetivo: ' + temp + ' °C';
  els.note.textContent = point.note;
  els.progress.style.width = (phaseProgress(minutes) * 100).toFixed(1) + '%';

  if (point.alert) {
    document.body.classList.add('flash-red');
  } else {
    document.body.classList.remove('flash-red');
  }

  updateChart(minutes, temp);
}

function setButtons() {
  els.btnStart.disabled = running;
  els.btnPause.disabled = !running;
}

/* ---------- timer control ---------- */

function startRoast() {
  if (running) return;
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
  updateUI();
  saveSession();
}

/* ---------- profile switching ---------- */

function setProfile(id) {
  const found = PROFILES.find(p => p.id === id);
  if (!found) return;
  profile = found;
  rebuildChart();
  updateUI();
  saveSession();
}

/* ---------- chart ---------- */

function buildChart() {
  const ctx = document.getElementById('roastChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Perfil objetivo',
          data: profile.points.map(p => ({ x: p.time, y: p.temp })),
          borderWidth: 3,
          borderColor: 'red',
          backgroundColor: 'rgba(244, 197, 66, 0.08)',
          pointRadius: 4,
          pointBackgroundColor: 'red',
          tension: 0.25,
          fill: true
        },
        {
          label: 'Momento actual',
          data: [{ x: 0, y: profile.points[0].temp }],
          pointRadius: 9,
          pointBackgroundColor: '#111',
          pointBorderColor: '#f4c542',
          pointBorderWidth: 3,
          showLine: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Minutos' },
          min: 0,
          max: Math.ceil(maxMinutes()),
          ticks: { stepSize: 1 }
        },
        y: {
          title: { display: true, text: 'Temp. Gene Café (°C)' },
          min: 140,
          max: 250
        }
      },
      plugins: { legend: { display: true } }
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
    if (!raw) return;
    const saved = JSON.parse(raw);
    const found = PROFILES.find(p => p.id === saved.profileId);
    if (found) profile = found;
    elapsedSeconds = Number.isFinite(saved.elapsedSeconds) ? saved.elapsedSeconds : 0;
    // resume only if we hadn't finished and were running
    const shouldResume = saved.running && elapsedSeconds < maxMinutes() * 60;
    if (shouldResume) {
      running = false; // startRoast() flips this
      setTimeout(startRoast, 0);
    }
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
  els.select.addEventListener('change', e => setProfile(e.target.value));
}

(function init() {
  loadSession();
  populateProfileSelect();
  buildChart();
  bindEvents();
  updateUI();
  setButtons();
})();
