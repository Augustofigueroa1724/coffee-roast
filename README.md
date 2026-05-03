# Lucy · asistente de tueste para Gene Café

App web ligera para guiar el tueste en tiempo real. Cronómetro, fase actual, temperatura objetivo interpolada y gráfica con el punto de tueste moviéndose sobre el perfil. Sin dependencias salvo Chart.js por CDN.

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

Abre `index.html` en un navegador. Para desarrollo con recarga, puedes servirlo con cualquier servidor estático:

```bash
python3 -m http.server 8000
# luego abre http://localhost:8000
```

## Despliegue en GitHub Pages

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/USUARIO/lucy-coffee-app.git
git push -u origin main
```

En GitHub: **Settings → Pages → Source: Deploy from branch → Branch: main / root**.

URL final: `https://USUARIO.github.io/lucy-coffee-app/`

## Perfiles

Editables en `profiles.js`. Cada perfil es una lista de puntos `{ time, temp, phase, note, alert? }`:

- `time` en minutos (admite decimales, p. ej. `11.5`)
- `temp` en °C (lectura del Gene Café)
- `phase` y `note` se muestran en pantalla
- `alert: true` activa el flash rojo (primer crack y descarga)

Los puntos definen la línea roja del gráfico; entre puntos la temperatura objetivo se interpola linealmente.

## Funcionalidades

- Cronómetro con Iniciar / Pausar / Reset
- Selector de perfil (Claro, Medio, Oscuro)
- Fase actual + temperatura objetivo en grande
- Nota guía por fase (qué hacer ahora)
- Barra de progreso dentro de la fase actual
- Gráfico de perfil con punto en tiempo real
- Flash rojo durante primer crack y descarga
- La sesión se guarda en `localStorage` y se reanuda si recargas a mitad de tueste
- Pausa automática al llegar al final del perfil

## Personalizar

- **Branding**: cambia el color amarillo en `style.css` (`--accent`)
- **Icono**: reemplaza `assets/icon.svg` por tu propio archivo (también vale `.png`, ajusta el `<link rel="icon">` en `index.html`)
- **Idioma**: textos en `index.html` y notas en `profiles.js`
