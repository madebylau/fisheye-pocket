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


### Ajuste 4.1.1 — previsualización grande
La vista de vídeo muestra solo la barra de reproducción; abre «Más ajustes» para recorte y opciones de exportación. Los controles reducen su altura en pantallas de iPhone para dar prioridad a la imagen.


## 4.1.2 — Formatos de imagen
Se recupera la barra de formatos accesible desde LENTE, sin ocultarse detrás del panel: Original, 1:1, 4:5, 3:4, 9:16, 4:3 y 16:9. Desliza horizontalmente para verlos todos.


## v4.1.3 · Cámara en directo
- En **CÁMARA** elige FOTO o VÍDEO; cambia look, lente y proporción sin salir de la cámara.
- FOTO: dispara, vuelve al editor y pulsa GUARDAR IMAGEN → en iPhone elige **Guardar imagen** desde Compartir.
- VÍDEO: REC, STOP, GUARDAR EN FOTOS. Se intentará crear MP4 si Safari lo soporta; WebM si no. Micrófono requiere permiso independiente.
- **Limitación iOS:** la grabación de un canvas WebGL con audio usando MediaRecorder no funciona en todos los Safari; si no está soportada, se informa en pantalla. El menú de compartir solo mostrará Guardar vídeo si iOS reconoce el formato. No es una exportación MP4 garantizada.
- La grabación se limita a 60 s, a 720p para reducir el uso de memoria. Prueba primero un clip corto con audio en el iPhone.
