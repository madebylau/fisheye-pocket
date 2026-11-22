/* FISHEYE / Pocket Optical Lab — completely local image processing, no dependencies. */
(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const canvas = $('#photoCanvas');
  const stage = $('#stage');
  const previewViewport = $('#previewViewport');
  const input = $('#photoInput');
  const toastElement = $('#toast');
  const defaults = { mode: 1, ratio: '1:1', preset: 1, distortion: 78, filterPower: 88, grain: 30, vignette: 40, temperature: 0, aberration: 34, blur: 0, edgeBlur: 0, edgeFeather: 8, compare: false };
  const state = {...defaults};
  const controls = {
    distortion: {label: 'DISTORSIÓN', min: 0, max: 100, suffix: '%'},
    filterPower: {label: 'INTENSIDAD DEL FILTRO', min: 0, max: 100, suffix: '%'},
    grain: {label: 'GRANO ANALÓGICO', min: 0, max: 100, suffix: '%'},
    vignette: {label: 'VIÑETA', min: 0, max: 100, suffix: '%'},
    temperature: {label: 'TEMPERATURA', min: -100, max: 100, suffix: ''},
    aberration: {label: 'ABERRACIÓN CROMÁTICA', min: 0, max: 100, suffix: '%'},
    blur: {label: 'DESENFOQUE GENERAL', min: 0, max: 100, suffix: '%'},
    edgeBlur: {label: 'DESENFOQUE DE BORDES', min: 0, max: 100, suffix: '%'},
    edgeFeather: {label: 'SUAVIDAD DEL ARO', min: 0, max: 100, suffix: '%'}
  };
  let currentTab = 'lens';
  let activeControl = 'distortion';
  let previousAdjust = 'grain';
  let textureWidth = 1200;
  let textureHeight = 1200;
  let imageWidth = 1200;
  let imageHeight = 1200;
  let imageName = 'demo';
  let loadedImage = null;
  let busy = false;
  let toastTimer = null;
  let animationPending = false;
  let fileObjectUrl = null;
  let renderReady = false;
  let cachedTexture = null;

  const vertexShaderSource = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      v_uv = a_position * 0.5 + 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentShaderSource = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform vec2 u_size;
    uniform vec2 u_imgSize;
    uniform vec2 u_texSize;
    uniform float u_mode;
    uniform float u_distortion;
    uniform float u_preset;
    uniform float u_filterPower;
    uniform float u_grain;
    uniform float u_vignette;
    uniform float u_temperature;
    uniform float u_aberration;
    uniform float u_blur;
    uniform float u_edgeBlur;
    uniform float u_edgeFeather;
    uniform float u_compare;

    float rand(vec2 n) {return fract(sin(dot(n, vec2(12.9898, 78.233))) * 43758.5453123);}
    void main() {
      vec2 uv = v_uv;
      float imageAspect = u_imgSize.x / max(u_imgSize.y, 1.0);
      float aspect = u_size.x / max(u_size.y, 1.0);
      vec2 crop = imageAspect > aspect ? vec2(aspect / imageAspect, 1.0) : vec2(1.0, imageAspect / aspect);
      vec2 sourceUV = (uv - 0.5) * crop + 0.5;
      float rn = 0.0;
      float mask = 1.0;
      vec2 radial = vec2(0.0);

      if(u_compare < 0.5) {
        vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
        float r = length(p);
        float maxRadius = length(vec2(aspect, 1.0) * 0.5);
        if(u_mode > 0.5) {
          maxRadius = min(aspect, 1.0) * (u_mode > 1.5 ? 0.374 : 0.488);
        }
        rn = r / max(maxRadius, 0.001);
        float fisheye = 0.015 + pow(u_distortion, 1.55) * 5.4;
        float mapR = tan(min(rn, 0.9999) * atan(fisheye)) / fisheye;
        float relative = rn > 0.00001 ? mapR / rn : atan(fisheye) / fisheye;
        if(u_mode < 0.5) {
          sourceUV = ((uv - 0.5) * relative) * crop + 0.5;
        } else {
          sourceUV = ((p / maxRadius) * 0.5 * relative / vec2(aspect, 1.0)) * crop + 0.5;
          float edge = mix(0.006, 0.22, u_edgeFeather);
          mask = 1.0 - smoothstep(1.0 - edge, 1.0, rn);
        }
        radial = (r > 0.00001 ? p / r : vec2(0.0)) / vec2(aspect, 1.0);
      }

      vec2 aberration = radial * (u_aberration * 0.012 * pow(min(rn, 1.0), 2.0));
      vec3 col = texture2D(u_texture, clamp(sourceUV, 0.0, 1.0)).rgb;
      if(u_compare < 0.5) {
        float peripheral = smoothstep(0.34, 0.99, rn);
        float blurStrength = clamp(u_blur + u_edgeBlur * peripheral, 0.0, 1.0);
        if(blurStrength > 0.005) {
          vec2 radius = vec2(1.0) / max(u_texSize, vec2(1.0)) * (pow(blurStrength, 1.12) * 22.0);
          vec3 soft = col * 0.20;
          soft += texture2D(u_texture, clamp(sourceUV + vec2( radius.x, 0.0), 0.0, 1.0)).rgb * 0.10;
          soft += texture2D(u_texture, clamp(sourceUV + vec2(-radius.x, 0.0), 0.0, 1.0)).rgb * 0.10;
          soft += texture2D(u_texture, clamp(sourceUV + vec2(0.0,  radius.y), 0.0, 1.0)).rgb * 0.10;
          soft += texture2D(u_texture, clamp(sourceUV + vec2(0.0, -radius.y), 0.0, 1.0)).rgb * 0.10;
          soft += texture2D(u_texture, clamp(sourceUV + vec2( radius.x,  radius.y), 0.0, 1.0)).rgb * 0.10;
          soft += texture2D(u_texture, clamp(sourceUV + vec2(-radius.x,  radius.y), 0.0, 1.0)).rgb * 0.10;
          soft += texture2D(u_texture, clamp(sourceUV + vec2( radius.x, -radius.y), 0.0, 1.0)).rgb * 0.10;
          soft += texture2D(u_texture, clamp(sourceUV + vec2(-radius.x, -radius.y), 0.0, 1.0)).rgb * 0.10;
          col = mix(col, soft, smoothstep(0.0, 0.045, blurStrength));
        }
        if(u_aberration > 0.001) {
          col.r = mix(col.r, texture2D(u_texture, clamp(sourceUV + aberration, 0.0, 1.0)).r, 0.8);
          col.b = mix(col.b, texture2D(u_texture, clamp(sourceUV - aberration, 0.0, 1.0)).b, 0.8);
        }
      }

      if(u_compare < 0.5) {
        float lum = dot(col, vec3(0.299,0.587,0.114));
        vec3 graded = col;
        if(u_preset > 0.5 && u_preset < 1.5) { // Night-vision green
          graded = vec3(pow(lum, 0.9) * 0.30 + 0.006, pow(lum, 0.89) * 1.22 + 0.017, pow(lum, 0.9) * 0.56 + 0.006);
          graded *= vec3(0.91,1.08,0.84);
        } else if(u_preset > 1.5 && u_preset < 2.5) { // Red-light footage
          graded = vec3(lum*1.27+0.075,lum*0.32+0.012,lum*0.18+0.003);
        } else if(u_preset > 2.5 && u_preset < 3.5) { // Warm film stock
          graded = vec3(col.r*1.21+0.035,col.g*0.94+0.014,col.b*0.68);
        } else if(u_preset > 3.5 && u_preset < 4.5) { // Cold fluorescent
          graded = vec3(col.r*0.69,col.g*1.08+0.018,col.b*1.13+0.022);
        } else if(u_preset > 4.5 && u_preset < 5.5) { // Monochrome
          graded = vec3(lum*1.03,lum*1.02,lum);
        } else if(u_preset > 5.5 && u_preset < 6.5) { // Acid green
          graded = vec3(lum*0.65+0.025, lum*1.19+0.06, lum*0.18+0.005);
        } else if(u_preset > 6.5 && u_preset < 7.5) { // Purple haze
          graded = vec3(col.r*1.06+0.13*lum, col.g*0.57+0.03, col.b*1.25+0.13*lum);
        } else if(u_preset > 7.5 && u_preset < 8.5) { // Lo-fi 2003
          graded = vec3(col.r*0.84+0.13, col.g*0.82+0.11, col.b*0.74+0.12);
          graded = mix(graded, vec3(dot(graded,vec3(0.3,0.6,0.1))), 0.20);
        } else if(u_preset > 8.5 && u_preset < 9.5) { // Sodium streetlights
          graded = vec3(lum*1.32+0.09, lum*0.64+0.017, lum*0.13);
        } else if(u_preset > 9.5) { // Blue hour
          graded = vec3(col.r*0.59, col.g*0.83+0.018, col.b*1.28+0.025);
        }
        col = mix(col, graded, u_filterPower);
        col += u_temperature * vec3(0.12, 0.01, -0.14);
        col = (col-0.5)*1.07+0.5;
        float fade = smoothstep(0.19, 1.02, rn);
        col *= 1.0 - fade * u_vignette * 0.73;
        if(u_mode > 1.5) col *= 1.0 - smoothstep(0.53,1.0,rn) * 0.30;
        float noise = rand(floor(v_uv * u_size * 0.9) + vec2(24.3,91.8));
        col += (noise - 0.5) * u_grain * 0.24;
        col *= mask;
      }
      gl_FragColor = vec4(clamp(col, 0.0, 1.0),1.0);
    }
  `;

  function showToast(message, duration = 3300) {
    toastElement.textContent = message;
    toastElement.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastElement.classList.remove('show'), duration);
  }

  let gl;
  let program;
  let uniforms;
  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  function initWebGL() {
    try {
      gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: false, powerPreference: 'high-performance' }) ||
           canvas.getContext('experimental-webgl', { alpha: false, preserveDrawingBuffer: true });
      if(!gl) throw new Error('WebGL no disponible');
      const vs = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
      const fs = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if(!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      const coords = new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, coords, gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      uniforms = {};
      ['u_texture','u_size','u_imgSize','u_texSize','u_mode','u_distortion','u_preset','u_filterPower','u_grain','u_vignette','u_temperature','u_aberration','u_blur','u_edgeBlur','u_edgeFeather','u_compare'].forEach(name => uniforms[name] = gl.getUniformLocation(program,name));
      cachedTexture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D,cachedTexture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.uniform1i(uniforms.u_texture, 0);
      renderReady = true;
    } catch(err) {
      console.error('WebGL init error:',err);
      $('#canvasError').classList.remove('hidden');
      showToast('No se pudo iniciar el editor gráfico en este navegador.');
      return false;
    }
    return true;
  }

  function setSource(img, label, name) {
    if(!renderReady) return;
    try {
      // Downscale huge original photos before uploading to GPU: avoids iOS memory crashes.
      const gpuMax = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 4096);
      imageWidth = img.naturalWidth || img.width;
      imageHeight = img.naturalHeight || img.height;
      if(imageWidth < 1 || imageHeight < 1) throw new Error('La imagen está vacía');
      let upload = img;
      if(Math.max(imageWidth,imageHeight) > gpuMax) {
        const scale = gpuMax / Math.max(imageWidth,imageHeight);
        const shrunk = document.createElement('canvas');
        shrunk.width = Math.max(1, Math.round(imageWidth*scale));
        shrunk.height = Math.max(1, Math.round(imageHeight*scale));
        const ctx = shrunk.getContext('2d', { alpha: false });
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img,0,0,shrunk.width,shrunk.height);
        upload = shrunk;
      }
      textureWidth = upload.width || upload.naturalWidth;
      textureHeight = upload.height || upload.naturalHeight;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D,cachedTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,upload);
      loadedImage = img;
      imageName = name;
      $('#sourceLabel').textContent = label;
      $('#demoBadge').classList.toggle('hidden', label !== 'DEMO / 01');
      $('#imageDimensions').textContent = `${imageWidth} × ${imageHeight} PX`;
      updatePreviewRatio();
      queueRender();
    } catch(err) {
      console.error('Image upload error:', err);
      showToast('No se pudo procesar esta imagen. Prueba con JPG o PNG.');
    }
  }

  function loadPhotoFromUrl(url, label, name) {
    return new Promise((resolve,reject) => {
      const img = new Image();
      img.onload = () => {setSource(img,label,name);resolve();};
      img.onerror = () => reject(new Error('Imagen no compatible'));
      img.src = url;
    });
  }

  function getRatio() {
    switch(state.ratio) {
      case '1:1': return 1;
      case '4:5': return 4/5;
      case '9:16': return 9/16;
      default: return imageWidth / Math.max(imageHeight,1);
    }
  }
  function updatePreviewRatio() {
    fitStage();
    $('#lensLabel').textContent = ['FULL FRAME','180° FISHEYE','PEEPHOLE'][state.mode];
    queueRender();
  }
  function fitStage() {
    const availableWidth = previewViewport.clientWidth;
    const availableHeight = previewViewport.clientHeight;
    if(!availableWidth || !availableHeight) return;
    const ratio = getRatio();
    const width = Math.max(1, Math.min(availableWidth, availableHeight * ratio));
    const height = width / ratio;
    const cssWidth = `${width}px`;
    const cssHeight = `${height}px`;
    if(stage.style.width !== cssWidth) stage.style.width = cssWidth;
    if(stage.style.height !== cssHeight) stage.style.height = cssHeight;
  }
  function resizePreview() {
    if(!renderReady || !loadedImage) return;
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1,Math.round(rect.width*dpr));
    const h = Math.max(1,Math.round(rect.height*dpr));
    if(canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  function renderFrame() {
    if(!renderReady || !loadedImage) return;
    gl.useProgram(program);
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,cachedTexture);
    gl.uniform2f(uniforms.u_size,canvas.width,canvas.height);
    gl.uniform2f(uniforms.u_imgSize,imageWidth,imageHeight);
    gl.uniform2f(uniforms.u_texSize,textureWidth,textureHeight);
    gl.uniform1f(uniforms.u_mode,state.mode);
    gl.uniform1f(uniforms.u_distortion,state.distortion/100);
    gl.uniform1f(uniforms.u_preset,state.preset);
    gl.uniform1f(uniforms.u_filterPower,state.filterPower/100);
    gl.uniform1f(uniforms.u_grain,state.grain/100);
    gl.uniform1f(uniforms.u_vignette,state.vignette/100);
    gl.uniform1f(uniforms.u_temperature,state.temperature/100);
    gl.uniform1f(uniforms.u_aberration,state.aberration/100);
    gl.uniform1f(uniforms.u_blur,state.blur/100);
    gl.uniform1f(uniforms.u_edgeBlur,state.edgeBlur/100);
    gl.uniform1f(uniforms.u_edgeFeather,state.edgeFeather/100);
    gl.uniform1f(uniforms.u_compare,state.compare?1:0);
    gl.drawArrays(gl.TRIANGLES,0,6);
  }
  function queueRender() {
    if(animationPending) return;
    animationPending = true;
    requestAnimationFrame(() => {
      animationPending = false;
      fitStage();
      resizePreview();
      renderFrame();
    });
  }

  function selectTab(tab) {
    currentTab = tab;
    $$('.tab').forEach(button => {
      const selected = button.dataset.tab === tab;
      button.classList.toggle('active',selected);
      button.setAttribute('aria-selected',String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    $$('.panel').forEach(panel => {
      const selected = panel.id === `panel-${tab}`;
      panel.hidden = !selected;
      panel.classList.toggle('active',selected);
    });
    selectControl(tab === 'lens' ? 'distortion' : tab === 'looks' ? 'filterPower' : previousAdjust);
  }

  function updateSelections() {
    $$('.lens-option').forEach(button => {
      const selected = +button.dataset.mode === state.mode;
      button.classList.toggle('selected',selected);
      button.setAttribute('aria-pressed',String(selected));
    });
    $$('.ratio').forEach(button => {
      const selected = button.dataset.ratio === state.ratio;
      button.classList.toggle('selected',selected);
      button.setAttribute('aria-pressed',String(selected));
    });
    $$('.look').forEach(button => {
      const selected = +button.dataset.preset === state.preset;
      button.classList.toggle('selected',selected);
      button.setAttribute('aria-pressed',String(selected));
    });
    $$('.adjust-option').forEach(button => {
      const selected = button.dataset.control === previousAdjust;
      button.classList.toggle('selected',selected);
      button.setAttribute('aria-pressed',String(selected));
    });
  }

  function selectControl(key) {
    const config = controls[key];
    if(!config) return;
    activeControl = key;
    if(currentTab === 'adjust') previousAdjust = key;
    const slider = $('#activeSlider');
    slider.min = config.min;
    slider.max = config.max;
    $('#activeSliderLabel').textContent = config.label;
    updateActiveSlider();
    updateSelections();
  }
  function updateActiveSlider() {
    const config = controls[activeControl];
    const value = state[activeControl];
    const slider = $('#activeSlider');
    slider.value = String(value);
    slider.style.setProperty('--pct', `${(value - config.min) / (config.max - config.min) * 100}%`);
    const sign = activeControl === 'temperature' && value > 0 ? '+' : '';
    $('#activeSliderValue').textContent = `${sign}${value}${config.suffix}`;
  }
  function reset() {
    Object.assign(state, defaults);
    previousAdjust = 'grain';
    $('#beforeChip').classList.add('hidden');
    updateSelections();
    updatePreviewRatio();
    selectControl(currentTab === 'lens' ? 'distortion' : currentTab === 'looks' ? 'filterPower' : previousAdjust);
    showToast('Ajustes restablecidos.');
  }
  function exportSize() {
    const ratio = getRatio();
    const maxGPU = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), gl.getParameter(gl.MAX_VIEWPORT_DIMS)[0], gl.getParameter(gl.MAX_VIEWPORT_DIMS)[1], 3200);
    const mainSide = Math.min(Math.max(imageWidth,imageHeight), maxGPU);
    if(ratio >= 1) return [Math.round(mainSide),Math.max(1,Math.round(mainSide/ratio))];
    return [Math.max(1,Math.round(mainSide*ratio)),Math.round(mainSide)];
  }
  async function exportPhoto() {
    if(busy || !loadedImage || !renderReady) return;
    busy = true;
    const button = $('#exportButton');
    button.disabled = true;
    $('#exportLabel').textContent = 'PROCESANDO...';
    $('#stageSpinner').classList.remove('hidden');
    const format = $('#fileFormat').value;
    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    let blob;
    try {
      // Give the UI one frame to display the processing label before GPU export.
      await new Promise(resolve => requestAnimationFrame(resolve));
      const [width,height] = exportSize();
      canvas.width = width;
      canvas.height = height;
      const compareState = state.compare;
      state.compare = false;
      renderFrame();
      state.compare = compareState;
      blob = await new Promise((resolve,reject) => canvas.toBlob(data => data ? resolve(data) : reject(new Error('No se pudo crear el archivo')),mime,0.94));
      // Restore small preview immediately, before triggering a native share sheet.
      resizePreview();
      renderFrame();
      const title = `${(imageName || 'foto').replace(/\.[^/.]+$/,'').replace(/[^a-z0-9áéíóúüñ_-]/gi,'-').slice(0,48)}-fisheye.${format === 'png' ? 'png' : 'jpg'}`;
      const file = new File([blob],title,{type:mime});
      if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})) {
        try {
          await navigator.share({files:[file],title:'Fisheye · tu fotografía editada'});
          showToast('Imagen lista para guardar en Fotos o Archivos.');
        } catch(err) {
          if(err.name === 'AbortError') return;
          downloadBlob(blob,title);
          showToast('Descarga creada. Puedes guardarla desde Archivos.');
        }
      } else {
        downloadBlob(blob,title);
        showToast('Imagen exportada.');
      }
    } catch(err) {
      console.error('Export error:',err);
      showToast('No se pudo exportar. Prueba con JPG o una foto más pequeña.',5500);
    } finally {
      // Recovery also works if the GPU render or conversion throws.
      resizePreview();
      renderFrame();
      busy = false;
      button.disabled = false;
      $('#stageSpinner').classList.add('hidden');
      $('#exportLabel').textContent = 'GUARDAR IMAGEN';
    }
  }
  function downloadBlob(blob,filename) {
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href),45000);
  }

  function setCompare(value) {
    if(busy) return;
    state.compare = value;
    $('#beforeChip').classList.toggle('hidden',!value);
    queueRender();
  }

  function attachEvents() {
    $('#uploadButton').addEventListener('click',()=>input.click());
    input.addEventListener('change',async event => {
      const file = event.target.files?.[0];
      if(!file) return;
      if(!file.type.startsWith('image/') && !/\.(heic|heif|jpg|jpeg|png|webp|avif)$/i.test(file.name)) {
        showToast('Selecciona una foto, por favor.');
        return;
      }
      const url = URL.createObjectURL(file);
      try {
        await loadPhotoFromUrl(url,'TU FOTO',file.name);
        if(fileObjectUrl) URL.revokeObjectURL(fileObjectUrl);
        fileObjectUrl = url;
        showToast('Foto cargada. ¡Juega con la lente!');
      } catch(err) {
        URL.revokeObjectURL(url);
        showToast('Este formato no se puede abrir. Usa JPG, PNG o una foto compatible de tu galería.',4800);
      }
      input.value = '';
    });
    $$('.tab').forEach((button,index) => {
      button.addEventListener('click',()=>selectTab(button.dataset.tab));
      button.addEventListener('keydown',event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const tabs = $$('.tab');
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length-1 : (index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
        tabs[target].focus();
        selectTab(tabs[target].dataset.tab);
      });
    });
    $$('.lens-option').forEach(button => button.addEventListener('click',()=>{state.mode=+button.dataset.mode;updateSelections();updatePreviewRatio();}));
    $$('.ratio').forEach(button => button.addEventListener('click',()=>{state.ratio=button.dataset.ratio;updateSelections();updatePreviewRatio();}));
    $$('.look').forEach(button => button.addEventListener('click',()=>{state.preset=+button.dataset.preset;updateSelections();queueRender();}));
    $$('.adjust-option').forEach(button => button.addEventListener('click', () => selectControl(button.dataset.control)));
    $('#activeSlider').addEventListener('input',event => {
      state[activeControl] = +event.currentTarget.value;
      updateActiveSlider();
      queueRender();
    });
    $('#resetSingle').addEventListener('click', () => {
      state[activeControl] = defaults[activeControl];
      updateActiveSlider();
      queueRender();
    });
    const compare = $('#compareButton');
    compare.addEventListener('pointerdown',event=>{event.preventDefault();compare.setPointerCapture?.(event.pointerId);setCompare(true);});
    ['pointerup','pointercancel','lostpointercapture','pointerleave','blur'].forEach(type=>compare.addEventListener(type,()=>setCompare(false)));
    compare.addEventListener('contextmenu',e=>e.preventDefault());
    compare.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();setCompare(true);}});
    compare.addEventListener('keyup',()=>setCompare(false));
    $('#resetButton').addEventListener('click',reset);
    $('#exportButton').addEventListener('click',exportPhoto);
    $('#helpButton').addEventListener('click',()=>$('#helpDialog').showModal());
    $('#closeHelp').addEventListener('click',()=>$('#helpDialog').close());
    $('#helpDialog').addEventListener('click',event=>{if(event.target===event.currentTarget)event.currentTarget.close();});
    if('ResizeObserver' in window) new ResizeObserver(() => queueRender()).observe(previewViewport);
    window.addEventListener('resize', queueRender);
    window.addEventListener('orientationchange', () => setTimeout(queueRender, 300));
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();renderReady=false;showToast('El navegador pausó el procesado. Recarga la página para continuar.',6500);});
  }

  async function main() {
    if(!initWebGL()) return;
    // Use a locally bundled, original illustration as the demo, never a user's reference image.
    attachEvents();
    updateSelections();
    selectTab('lens');
    try {
      await loadPhotoFromUrl('assets/demo.jpg','DEMO / 01','demo');
    } catch(err) {
      showToast('Toca Subir foto para empezar.');
    }
    if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Offline cache unavailable:',err));
    }
  }
  main();
})();
