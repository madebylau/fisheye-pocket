# FISHEYE · Pocket Optical Lab 2.0

Una web app gratuita para editar fotografías desde el móvil, con efecto **ojo de pez / fisheye**, filtros analógicos y desenfoque. Se ejecuta directamente en el navegador, sin cuenta ni subir tus fotos a servidores. Sin frameworks ni dependencias externas.

## Novedades de la versión 2.0

- **Foto siempre visible** en la parte superior de la pantalla mientras editas. No hace falta desplazarse verticalmente para ver los cambios.
- **Un solo deslizador** en la parte inferior de las herramientas: seleccionas qué retocar y mueves el deslizador mientras observas la imagen en tiempo real.
- **Herramientas y filtros en carruseles horizontales** que se recorren con el dedo.
- **Desenfoque general:** suaviza toda la foto.
- **Desenfoque de bordes:** mantiene el centro más nítido y difumina progresivamente la periferia del ojo de pez (también en Full Frame).
- **Aro suave:** difumina la transición entre la foto y el borde negro de la lente circular o mirilla. No se aprecia en Full Frame, donde no hay aro negro.
- **Cinco filtros nuevos:** Acid Green, Purple Haze, Lo-Fi 2003, Sodium y Blue Hour. Ahora hay **11 filtros en total**.

## Cómo usarlo en tu móvil

1. Pulsa **Subir foto** y elige una imagen de tu galería.
2. En **Lente**, elige Full Frame, 180° Circle o Peephole. Usa el deslizador para la distorsión y los botones pequeños para el formato.
3. En **Filtros**, desliza las miniaturas hacia los lados y toca un look. El deslizador inferior cambia su intensidad.
4. En **Ajustes**, desliza los botones horizontalmente y toca Grano, Viñeta, Temperatura, Aberración, Desenfoque, Blur Bordes o Aro Suave. El deslizador controla el ajuste seleccionado.
5. Mantén pulsado el icono de **Comparar** (arriba a la derecha de la foto) para ver el original. El icono circular de **Restablecer** devuelve los valores de fábrica; el icono ↺ junto al deslizador solo restablece el ajuste activo.
6. Selecciona **JPG** o **PNG** y pulsa **Guardar imagen**. En un iPhone compatible aparece el menú de compartir para guardar en Fotos o Archivos.

La imagen se encaja dentro del espacio disponible cuando cambias el formato y el editor mantiene todos los controles al alcance. En móviles con pantalla muy pequeña o en horizontal puede ser necesario girar el dispositivo a vertical.

**Nota óptica:** el ojo de pez es una simulación digital de la perspectiva, no genera contenido que esté fuera de la fotografía original. El desenfoque y los filtros se aplican tanto a la vista previa como a la exportación.

## Actualizar tu repositorio de GitHub existente

**No necesitas crear otro repositorio** si ya subiste la primera versión.

1. Descarga el ZIP nuevo y descomprímelo.
2. Entra en tu repositorio de GitHub, por ejemplo `fisheye-pocket`.
3. Actualiza estos archivos en la raíz: `index.html`, `styles.css`, `app.js`, `sw.js`, `README.md`. Mantén la carpeta `assets/`, `manifest.webmanifest` y `.nojekyll` (el ZIP también los incluye).
4. Una forma sencilla de reemplazar archivos por navegador es abrir cada archivo en GitHub, pulsar el lápiz **Edit this file**, pegar su contenido nuevo y hacer **Commit changes**. Otra opción es actualizar todos con GitHub Desktop o desde Git local. `Add file → Upload files` también puede sustituir archivos del mismo nombre al confirmar el cambio.
5. Deja GitHub Pages configurado en **Settings → Pages → Deploy from a branch → main → /(root)**.
6. Abre la dirección habitual de tu app `https://TU-USUARIO.github.io/fisheye-pocket/`. Si ves la versión antigua, cierra completamente la app instalada y vuelve a abrirla desde Safari; también puedes borrar los datos de ese sitio si persistiese la caché.

### Subirlo por primera vez

1. Accede a [github.com/new](https://github.com/new), crea un repositorio público llamado `fisheye-pocket` y confírmalo.
2. Descomprime el ZIP y sube **el contenido de la carpeta**, no el ZIP, a la raíz del repositorio. `index.html` debe quedar en la raíz.
3. Haz Commit changes.
4. Ve a **Settings → Pages → Deploy from a branch → main → /(root)** y guarda.
5. Abre `https://TU-USUARIO.github.io/fisheye-pocket/`, sustituyendo `TU-USUARIO` por tu usuario real.

GitHub Pages es gratuito para repositorios públicos compatibles. La web publicada **no es privada ni está protegida por contraseña**; cualquiera que tenga el enlace puede abrir la herramienta, pero no ver tus fotos. Para restringir el acceso al editor hace falta autenticación en otro alojamiento.

## Instalar en iPhone

Abre la URL de GitHub Pages en **Safari → Compartir → Añadir a pantalla de inicio**. Aparecerá como icono independiente. En Android, abre la URL en Chrome y selecciona **Instalar aplicación** o **Añadir a pantalla de inicio**.

La aplicación incluye caché offline para los archivos de la app. Tras visitarla online, puede abrirse sin conexión siempre que Safari/Chrome conserven esa caché. La edición en sí no requiere conexión. Las imágenes nunca se guardan en la caché de la aplicación.

## Compatibilidad y rendimiento

- Requiere un navegador actualizado con WebGL 1 (habitual en iPhone/Android recientes).
- Importa JPG, PNG, WebP, AVIF y otros formatos que decodifique el navegador. HEIC/HEIF en iPhone depende de Safari.
- Para evitar problemas de memoria, el tamaño máximo del lado largo de exportación es de **3200 px**, o el límite menor del dispositivo. Las fotos muy grandes se reducen antes de cargarse en la GPU.
- El desenfoque se realiza en WebGL para responder de forma interactiva mientras arrastras el deslizador. En móviles antiguos el rendimiento puede variar.
- No usa análisis de uso, cookies de tracking, APIs de imágenes ni servicios de pago.

## Archivos

- `index.html` — interfaz, pestañas, carruseles y deslizador contextual.
- `styles.css` — diseño mobile-first, foto fija visible y soporte de pantallas pequeñas.
- `app.js` — motor WebGL, once looks, desenfoques, controles y exportación.
- `manifest.webmanifest` — datos de instalación PWA.
- `sw.js` — caché offline versión 2.0.
- `assets/` — iconos y demo original incluida.
- `.nojekyll` — compatibilidad con GitHub Pages.
