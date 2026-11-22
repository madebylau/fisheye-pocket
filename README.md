# FISHEYE · Pocket Optical Lab

Una pequeña web app para editar fotos con estética **fisheye / ojo de pez** desde el móvil, inspirada en el grano analógico, los verdes de visión nocturna, los tonos rojos de neón y las mirillas de puerta. Una interfaz sencilla sin registro y sin dependencias externas.

## Qué puedes hacer

- Importar fotos de tu galería o hacer una foto desde el selector del móvil.
- Elegir tres lentes: **FULL FRAME**, **180° CIRCLE** y **PEEPHOLE**.
- Ajustar la distorsión de la lente y elegir formatos **Original**, **1:1**, **4:5** o **9:16**.
- Aplicar seis looks: **RAW**, **NIGHT VISION**, **RED LIGHT**, **AMBER 35**, **COLD TONE**, **MONOCHROME**.
- Ajustar intensidad, grano, viñeta, temperatura y aberración cromática.
- Comparar con la imagen original **manteniendo pulsado** el icono de comparar.
- Exportar **JPG o PNG**. En móviles compatibles se abre el menú nativo para compartir/guardar.
- Añadir la web a la pantalla de inicio del iPhone o Android y usarla como app. Tras la primera visita puede abrirse sin conexión, siempre que el navegador conserve los datos del sitio.

### Importante: qué hace el ojo de pez

El efecto se **simula por software** sobre una foto ya hecha. Dobla la perspectiva y crea un marco circular o de mirilla; **no puede recuperar el campo de visión real de 180°** que captaría una lente ojo de pez. Para lograr resultados más espectaculares, parte de imágenes tomadas con un angular amplio y objetos cercanos al centro o en los bordes.

## Subir a GitHub Pages (gratis)

1. En [github.com](https://github.com) entra con tu cuenta y selecciona **New repository**.
2. Ponle de nombre, por ejemplo, `fisheye-pocket`, y elige **Public** si usas GitHub Free para publicarlo gratis con GitHub Pages.
3. Pulsa **Create repository**.
4. Descarga el ZIP facilitado, **descomprímelo**, entra en la carpeta `fisheye-pocket` y sube los **archivos y la carpeta `assets`**, no el ZIP. Deben quedar en la raíz del repositorio: `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, `sw.js`, `assets/` y, si aparece, `.nojekyll`. Puedes arrastrarlos a **Add file → Upload files**.
5. Pulsa **Commit changes**.
6. Ve a **Settings → Pages**, en **Build and deployment → Source** selecciona **Deploy from a branch**. Elige rama **main** y carpeta **/(root)**; pulsa **Save**.
7. Cuando GitHub indique que está publicada, entra en `https://TU-USUARIO.github.io/fisheye-pocket/` (reemplaza `TU-USUARIO` por tu nombre de GitHub).

Si aparece un **404**, revisa que `index.html` esté directamente en la raíz del repositorio (no dentro de otra carpeta), que Pages apunte a `main / (root)`, y abre la URL indicada por GitHub en la pantalla Pages.

## Instalar en iPhone

1. Abre **la URL publicada** en **Safari**.
2. Toca **Compartir** (cuadrado con flecha).
3. Elige **Añadir a pantalla de inicio** y confirma.
4. Entra a Fisheye desde el icono nuevo. Selecciona **Subir foto** para trabajar con tus imágenes.
5. Pulsa **Guardar imagen**: si aparece el menú de compartir, elige **Guardar imagen** para Fotos o **Guardar en Archivos**. Si el navegador la descarga directamente, abre el archivo descargado y compártelo con Fotos.

En Android: abre la URL en Chrome → menú → **Instalar aplicación** / **Añadir a pantalla de inicio**.

## Seguridad y privacidad

- Las fotos **se procesan directamente en el navegador con WebGL**, no se suben a una API ni a ningún servidor.
- No hay cuentas, cookies de seguimiento, analytics ni almacenamiento de tus fotos en la aplicación.
- Los archivos estáticos de la app se sirven desde GitHub Pages. El `service worker` solo guarda temporalmente esos archivos para poder cargar la app sin conexión: **no guarda tus fotografías**.
- **GitHub Pages no protege la web con contraseña.** Aunque solo tú guardes el icono o conozcas el enlace, quien tenga la URL podrá abrir el editor. Eso **no** significa que pueda ver las fotos que tú editas (esas permanecen en tu dispositivo). Si necesitas acceso restringido real, hace falta otro tipo de hosting con autenticación.

## Tecnología

HTML, CSS y JavaScript, **sin frameworks ni instalaciones**. WebGL procesa la distorsión y los filtros en el dispositivo. Diseñada mobile-first. Código preparado para funcionar en una ruta de proyecto de GitHub Pages como `/fisheye-pocket/`.

### Archivos

- `index.html` — interfaz y controles.
- `styles.css` — estilos responsive.
- `app.js` — procesado de imagen, filtros y exportación.
- `manifest.webmanifest` — ajustes de instalación como PWA.
- `sw.js` — caché offline de la aplicación.
- `assets/` — iconos y **demo ilustrada original**.

Nota: en iPhone los formatos HEIC/HEIF dependen de que Safari pueda decodificarlos; si una imagen falla, guárdala primero como JPG o PNG. La exportación se limita a 3200 píxeles en su lado mayor, o menos si el dispositivo tiene un límite gráfico inferior.
