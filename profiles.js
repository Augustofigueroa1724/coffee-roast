// Perfiles de tueste para Gene Café.
// Cada perfil es una secuencia de puntos (tiempo en minutos, temperatura objetivo en °C)
// con su fase asociada y nota de guía. La temperatura entre puntos se interpola linealmente.
// `alert: true` activa el flash rojo durante esa fase.

const PROFILES = [
  {
    id: 'gene-light',
    name: 'Gene Café · Claro',
    subtitle: 'Tueste claro, perfil ágil con descarga temprana.',
    points: [
      { time: 0,    temp: 150, phase: "Inicio / carga",   note: "Empieza el calentamiento inicial." },
      { time: 2,    temp: 170, phase: "Secado",           note: "Evaporación de humedad. Progresión estable." },
      { time: 4,    temp: 188, phase: "Amarilleo",        note: "El grano empieza a cambiar de color." },
      { time: 6,    temp: 205, phase: "Maillard",         note: "Desarrollo de dulzor, cuerpo y aromas." },
      { time: 7.5,  temp: 220, phase: "Pre primer crack", note: "Atento al primer crack. No acelerar." },
      { time: 9,    temp: 230, phase: "Primer crack",     note: "Escucha los cracks. Controla el desarrollo.", alert: true },
      { time: 10.5, temp: 234, phase: "Desarrollo",       note: "Acidez brillante, cuerpo ligero." },
      { time: 11,   temp: 235, phase: "Fin / descarga",   note: "Descarga y enfría rápido.", alert: true }
    ]
  },
  {
    id: 'gene-medium',
    name: 'Gene Café · Medio',
    subtitle: 'Perfil estándar, balance y dulzor.',
    points: [
      { time: 0,    temp: 150, phase: "Inicio / carga",   note: "Empieza el calentamiento inicial." },
      { time: 2,    temp: 170, phase: "Secado",           note: "Evaporación de humedad. Mantén progresión estable." },
      { time: 4,    temp: 190, phase: "Amarilleo",        note: "El grano empieza a cambiar de color." },
      { time: 6,    temp: 210, phase: "Maillard",         note: "Desarrollo de dulzor, cuerpo y aromas." },
      { time: 8,    temp: 225, phase: "Pre primer crack", note: "Atento al primer crack. No acelerar demasiado." },
      { time: 10,   temp: 235, phase: "Primer crack",     note: "Escucha los primeros cracks. Controla desarrollo.", alert: true },
      { time: 11.5, temp: 238, phase: "Desarrollo",       note: "Define acidez, dulzor y cuerpo final." },
      { time: 12.5, temp: 240, phase: "Fin / descarga",   note: "Descarga y enfría rápido.", alert: true }
    ]
  },
  {
    id: 'gene-dark',
    name: 'Gene Café · Oscuro',
    subtitle: 'Cuerpo intenso, descarga cerca del segundo crack.',
    points: [
      { time: 0,    temp: 150, phase: "Inicio / carga",   note: "Empieza el calentamiento inicial." },
      { time: 2,    temp: 170, phase: "Secado",           note: "Evaporación de humedad. Progresión estable." },
      { time: 4,    temp: 192, phase: "Amarilleo",        note: "El grano empieza a cambiar de color." },
      { time: 6,    temp: 212, phase: "Maillard",         note: "Desarrollo profundo de aromas tostados." },
      { time: 8.5,  temp: 228, phase: "Pre primer crack", note: "Atento al primer crack." },
      { time: 10.5, temp: 238, phase: "Primer crack",     note: "Cracks intensos. Mantén calor.", alert: true },
      { time: 12.5, temp: 244, phase: "Desarrollo",       note: "Cuerpo pesado, baja acidez." },
      { time: 13.5, temp: 246, phase: "Fin / descarga",   note: "Descarga ya, evita el segundo crack.", alert: true }
    ]
  }
];

// ---------- Curva sintética de tueste ----------
// Combina todos los perfiles en una única curva robusta:
// 1. Muestrea cada perfil (interpolación lineal) sobre una malla temporal común.
// 2. En cada instante descarta los valores que caen en los cuartiles extremos
//    (top/bottom) cuando además se desvían más de una desviación típica de la
//    media — así los perfiles atípicos no arrastran la curva, pero si todos
//    van de acuerdo no se descarta nada.
// 3. El punto resultante es la mediana de los valores supervivientes.
// La curva termina cuando quedan activos menos de la mitad de los perfiles,
// para que la cola no la dicte un único perfil largo.

const SYNTHETIC_STEP_MIN = 0.25;

function profileEnd(p) {
  return p.points[p.points.length - 1].time;
}

function profileTempAt(p, t) {
  const pts = p.points;
  if (t <= pts[0].time) return pts[0].temp;
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i].time) {
      const a = pts[i - 1];
      const b = pts[i];
      const f = (t - a.time) / (b.time - a.time);
      return a.temp + f * (b.temp - a.temp);
    }
  }
  return pts[pts.length - 1].temp;
}

function median(sorted) {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function robustCenter(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length < 3) return median(sorted);
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const sd = Math.sqrt(sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / sorted.length);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const kept = sorted.filter(v => (v >= q1 && v <= q3) || Math.abs(v - mean) <= sd);
  return median(kept.length ? kept : sorted);
}

function buildSyntheticCurve(profiles = PROFILES, step = SYNTHETIC_STEP_MIN) {
  const minActive = Math.ceil(profiles.length / 2);
  const maxEnd = Math.max(...profiles.map(profileEnd));
  const curve = [];
  for (let i = 0; i * step <= maxEnd + 1e-9; i++) {
    const t = i * step;
    const temps = profiles
      .filter(p => t <= profileEnd(p) + 1e-9)
      .map(p => profileTempAt(p, t));
    if (temps.length < minActive) break;
    curve.push({
      x: Math.round(t * 100) / 100,
      y: Math.round(robustCenter(temps) * 10) / 10
    });
  }
  return curve;
}

const SYNTHETIC_CURVE = buildSyntheticCurve();
