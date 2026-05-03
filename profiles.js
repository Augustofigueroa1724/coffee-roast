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
