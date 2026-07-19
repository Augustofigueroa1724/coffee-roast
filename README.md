# Lucy · asistente de tueste para Gene Café

App web ligera para guiar el tueste en tiempo real con perfiles por escalones, alerta visual y sonora en cada cambio, y gráfica del perfil. Sin dependencias salvo Chart.js (CDN) y la fuente Inter (Google Fonts).

## Estructura

```
.
├── index.html
├── style.css
├── app.js
├── profiles.js
├── assets/
│   └── icon.svg
├── .nojekyll
└── README.md
```

## Uso local

Abre `index.html` en un navegador. Para desarrollo con recarga, sirve la carpeta con cualquier servidor estático:

```bash
python3 -m http.server 8000
# luego abre http://localhost:8000
```

## Despliegue en GitHub Pages

```bash
git push origin main
```

En GitHub: **Settings → Pages → Source: Deploy from branch → Branch: main / root**.

## Perfiles

Editables en `profiles.js`. Cada perfil es una lista de puntos `{ time, temp, phase, note, alert? }`:

- `time` en minutos (admite decimales, p. ej. `11.5`)
- `temp` en °C (lectura del Gene Café, **escalones discretos** — la cifra solo cambia al alcanzar un punto)
- `phase` y `note` se muestran en pantalla
- `alert: true` activa el flash rojo continuo de fondo (primer crack y descarga)

La línea del gráfico es escalonada (`stepped: 'before'`) — refleja exactamente que la temperatura sube por saltos, no en rampa.

## Funcionalidades

### Lectura
- **Twin readout** equivalente: tiempo transcurrido (`/ duración total`) y temperatura actual (con la fase debajo)
- **Próximo cambio** prominente: temperatura del siguiente escalón y cuenta atrás MM:SS gigante centrada sobre la barra
- **Barra de cuenta atrás** que se vacía conforme se acerca el cambio
- Nota guía por fase (qué hacer ahora)
- Gráfico del perfil escalonado con un punto amarillo marcando el momento actual
- **Curva sintética de tueste**: línea discontinua verde que combina todos los perfiles en una única curva de referencia

### Curva sintética

Se calcula en `profiles.js` (`buildSyntheticCurve`) y se pinta siempre en la gráfica, sea cual sea el perfil seleccionado:

1. Cada perfil se muestrea con interpolación lineal sobre una malla común de 0,25 min
2. En cada instante se descartan los valores de los cuartiles extremos (top/bottom) que además se desvían más de una desviación típica de la media — con perfiles en acuerdo no se descarta nada; un perfil atípico no arrastra la curva
3. El punto resultante es la **mediana** de los valores supervivientes
4. La curva termina cuando quedan activos menos de la mitad de los perfiles, para que la cola no la dicte un único perfil largo

### Exportar la curva sintética

Bajo la gráfica hay dos botones de exportación:

- **Exportar RoasTime**: descarga `lucy-curva-sintetica-roastime.json`, un tueste en el formato JSON local de RoasTime (Aillio Bullet) — curva muestreada a 2 Hz (`beanTemperature`), RoR en °C/min (`beanDerivative`) y marcadores de amarilleo y primer crack en las medianas de los perfiles
- **Exportar CSV**: descarga `lucy-curva-sintetica.csv` (`tiempo_s,tiempo,temperatura_C`), importable en Artisan, hojas de cálculo, etc.

Para llevarla a Roast World / Aillio Bullet (no hay import directo de ficheros en Roast World):

1. Cierra RoasTime y copia el JSON a su carpeta de tuestes:
   - Linux: `~/.config/roast-time/roasts/`
   - macOS: `~/Library/Application Support/roast-time/roasts/`
   - Windows: `%APPDATA%/roast-time/roasts/`
2. Abre RoasTime: el tueste aparece en la pestaña **Roasts**
3. Desde el tueste, usa **crear receta** para importar sus triggers de tiempo/temperatura; la receta se sincroniza con Roast World y puede reproducirse en el Bullet

> ⚠️ El esquema de los ficheros de RoasTime no es público; el export replica los campos observados en ficheros reales (mejor esfuerzo). Si una versión futura de RoasTime lo rechaza, el CSV siempre sirve como respaldo.

### Alerta de cambio de escalón
En cada transición a un nuevo punto del perfil:
- Los números de temperatura (actual + próximo) **parpadean en naranja** durante 12 s y se apagan solos — sin diálogo ni botón de "OK"
- **Marimba** generada con Web Audio (sine + segundo armónico, arpegio G5-A5-C6, decay exponencial)
- **Voz nativa** en es-ES vía SpeechSynthesis: *"{fase}. {temp} grados"*
- Botón **Sonido / Silencio** persistente en localStorage; al activar el sonido suena un beep de prueba

### Fases críticas
- **Flash rojo** continuo de fondo durante *Primer crack* y *Fin / descarga* (preservado del original)

### Robustez del cronómetro
- El reloj se ancla a `Date.now()` (no acumula segundos por tick), así sobrevive a navegadores que estrangulan `setInterval` en background
- Re-sincroniza al volver a la pestaña vía `visibilitychange`
- **Wake Lock API** mientras se tuesta para evitar que la pantalla se duerma (donde esté soportado)
- La sesión (perfil + tiempo + estado) se guarda en `localStorage` y se reanuda al recargar

### Controles
- **Iniciar / Pausar / Reset** y selector de perfil
- Pausa automática al llegar al final del perfil

## Limitaciones móviles

En iOS Safari y la mayoría de navegadores móviles, cuando bloqueas la pantalla o cambias de app los timers, audio y speech se **suspenden**. El reloj se pone al día cuando vuelves a la pestaña, pero los avisos sonoros que ocurrieron mientras estaba oculta se pierden.

Para tueste sin sustos: deja la pestaña visible con la pantalla encendida (el wake lock se encarga).

## Diseño

- Tipografía **Inter** (200 / 300 / 400 / 500), mayúsculas con tracking amplio en etiquetas, números tabulares en weight 200
- Paleta sobria: fondo `#0a0a0a`, paneles con borde 1 px en `#222`, esquinas pequeñas (4 px), amarillo `#f4c542` solo como acento puntual
- Inspiración: minimalismo Bang & Olufsen — jerarquía clara, hairlines, sin gradientes, sin emojis

## Personalizar

- **Color de acento**: variable `--accent` en `style.css`
- **Color del parpadeo de alerta**: variable `--alert` en `style.css` (por defecto `#ff7a3d`)
- **Duración del parpadeo**: constante `ALERT_DURATION_MS` en `app.js` (12 s por defecto)
- **Sonido de alerta**: función `playMarimbaNote` y array de frecuencias en `playBeepSequence` (`app.js`)
- **Idioma de la voz**: `u.lang` en `speak()` (`app.js`)
- **Icono**: reemplaza `assets/icon.svg`
- **Perfiles**: edita `profiles.js`
