# FISHEYE 4.1 — Video Studio (beta)

Editor de imagen y vídeo que funciona en el navegador. Sin backend ni cuentas.

## Novedades
- Importación de vídeo, previsualización de filtros y ojo de pez.
- Recorte por puntos de entrada/salida, control de reproducción y scrubbing.
- Exportación en tiempo real a 720p/1080p, 24/30 fps.
- MP4 cuando el navegador permite `MediaRecorder` MP4; WebM cuando está disponible.
- Captura de audio mediante Web Audio, cuando Safari lo permita.

## Limitaciones importantes
- La exportación MP4 con audio en iPhone **no está garantizada**: depende del soporte de `MediaRecorder`, `captureStream`, códecs y memoria del dispositivo.
- El proceso ocurre en tiempo real, puede tardar tanto como el clip y está limitado a 90 segundos.
- La exportación conserva una pista de audio cuando se puede capturar, pero no ofrece edición de sonido.
- No se ha probado en un iPhone físico. Es una beta, no un editor profesional de vídeo.
- El proyecto no envía fotos o vídeos a servidores.

## Publicar en GitHub Pages
1. Descomprime el ZIP.
2. Sube **los archivos del interior** de `fisheye-pocket` a la raíz de tu repositorio GitHub (reemplaza los antiguos).
3. En Settings > Pages configura `Deploy from a branch`, `main`, `/(root)`.
4. Abre la URL en Safari y selecciona Compartir > Añadir a pantalla de inicio.
5. Si ves una versión anterior, cierra la pestaña y recarga para actualizar la caché.

**Prueba recomendada:** importa un clip de 5 s con audio, aplica un filtro y exporta primero a 720p.
