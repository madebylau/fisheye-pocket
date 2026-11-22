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
  const defaults = { mode: 1, ratio: '1:1', preset: 1, distortion: 78, filterPower: 88, grain: 30, vignette: 40, temperature: 0, aberration: 34, blur: 0, edgeBlur: 0, edgeFeather: 8, lensSize: 98, zoom: 100, offsetX: 0, offsetY: 0, compare: false, halation: 0, bloom: 0, leaks: 0, dust: 0, timestamp: false };
  const state = {...defaults};
  const controls = {
    lensSize: {label: 'TAMAÑO DEL OJO DE PEZ', min: 45, max: 145, suffix: '%'},
    zoom: {label: 'ZOOM DE FOTO', min: 100, max: 300, suffix: '%'},
    distortion: {label: 'DISTORSIÓN', min: 0, max: 100, suffix: '%'},
    filterPower: {label: 'INTENSIDAD DEL FILTRO', min: 0, max: 100, suffix: '%'},
    grain: {label: 'GRANO ANALÓGICO', min: 0, max: 100, suffix: '%'},
    vignette: {label: 'VIÑETA', min: 0, max: 100, suffix: '%'},
    temperature: {label: 'TEMPERATURA', min: -100, max: 100, suffix: ''},
    aberration: {label: 'ABERRACIÓN CROMÁTICA', min: 0, max: 100, suffix: '%'},
    blur: {label: 'DESENFOQUE GENERAL', min: 0, max: 100, suffix: '%'},
    edgeBlur: {label: 'DESENFOQUE DE BORDES', min: 0, max: 100, suffix: '%'},
    edgeFeather: {label: 'SUAVIDAD DEL ARO', min: 0, max: 100, suffix: '%'},
    halation: {label:'HALATION ROJIZO',min:0,max:100,suffix:'%'},
    bloom: {label:'BLOOM DE LUCES',min:0,max:100,suffix:'%'},
    leaks: {label:'FUGAS DE LUZ',min:0,max:100,suffix:'%'},
    dust: {label:'POLVO ANALÓGICO',min:0,max:100,suffix:'%'}
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
  let history = [], future = [], lastSnapshot = '', cameraLoop = false, cameraCanvasParent = null;
  let mediaMode = 'image', sourceVideo = null, cameraStream = null, cameraFacing = 'environment', mediaTimer = null;

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
    uniform float u_halation; uniform float u_bloom; uniform float u_leaks; uniform float u_dust;
    uniform float u_lensSize;
    uniform float u_zoom;
    uniform vec2 u_offset;

    float rand(vec2 n) {return fract(sin(dot(n, vec2(12.9898, 78.233))) * 43758.5453123);}
    void main() {
      vec2 uv = v_uv;
      float imageAspect = u_imgSize.x / max(u_imgSize.y, 1.0);
      float aspect = u_size.x / max(u_size.y, 1.0);
      vec2 crop = imageAspect > aspect ? vec2(aspect / imageAspect, 1.0) : vec2(1.0, imageAspect / aspect);
      vec2 sourceUV = (uv - 0.5) * crop / u_zoom + 0.5 + u_offset;
      float rn = 0.0;
      float mask = 1.0;
      vec2 radial = vec2(0.0);

      if(u_compare < 0.5) {
        vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
        float r = length(p);
        float maxRadius = length(vec2(aspect, 1.0) * 0.5);
        if(u_mode > 0.5) {
          maxRadius = min(aspect, 1.0) * (u_mode > 1.5 ? 0.374 : 0.488) * u_lensSize;
        }
        rn = r / max(maxRadius, 0.001);
        float fisheye = 0.015 + pow(u_distortion, 1.55) * 5.4;
        float mapR = tan(min(rn, 0.9999) * atan(fisheye)) / fisheye;
        float relative = rn > 0.00001 ? mapR / rn : atan(fisheye) / fisheye;
        if(u_mode < 0.5) {
          sourceUV = ((uv - 0.5) * relative) * crop / u_zoom + 0.5 + u_offset;
        } else {
          sourceUV = ((p / maxRadius) * 0.5 * relative / vec2(aspect, 1.0)) * crop / u_zoom + 0.5 + u_offset;
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
        } else if(u_preset > 9.5 && u_preset < 10.5) { // Blue hour
          graded = vec3(col.r*0.59, col.g*0.83+0.018, col.b*1.28+0.025);
        } else if(u_preset > 10.5 && u_preset < 11.5) { // teal cinema
          graded = vec3(col.r*0.80+lum*0.08, col.g*1.05+0.025, col.b*1.10+0.035);
        } else if(u_preset > 11.5 && u_preset < 12.5) { // golden
          graded = vec3(col.r*1.20+0.04,col.g*1.04+0.012,col.b*0.72);
        } else if(u_preset > 12.5 && u_preset < 13.5) { // editorial cool
          graded = mix(vec3(lum),vec3(col.r*0.80,col.g*0.95,col.b*1.08),0.55)+0.03;
        } else if(u_preset > 13.5 && u_preset < 14.5) { // red noir
          graded = vec3(col.r*1.16+0.05,col.g*0.63,col.b*0.66);
        } else if(u_preset > 14.5 && u_preset < 15.5) { // matte
          graded = vec3(col.r*0.83+0.11,col.g*0.81+0.10,col.b*0.73+0.10);
        } else if(u_preset > 15.5) { // urban night
          graded = vec3(col.r*0.70,col.g*0.91+0.012,col.b*0.90+0.014);
        }
        col = mix(col, graded, u_filterPower);
        float bright = smoothstep(0.60, 0.95, lum);
        vec2 spread = vec2(7.0) / max(u_texSize,vec2(1.0));
        vec3 glow = (texture2D(u_texture,clamp(sourceUV+vec2(spread.x,0.0),0.0,1.0)).rgb + texture2D(u_texture,clamp(sourceUV-vec2(spread.x,0.0),0.0,1.0)).rgb + texture2D(u_texture,clamp(sourceUV+vec2(0.0,spread.y),0.0,1.0)).rgb + texture2D(u_texture,clamp(sourceUV-vec2(0.0,spread.y),0.0,1.0)).rgb)*0.25;
        float glowLum = dot(glow,vec3(0.299,0.587,0.114));
        col += vec3(1.0,0.24,0.11)*u_halation*0.45*smoothstep(0.42,0.87,glowLum);
        col += glow*u_bloom*0.55*bright;
        float leak = pow(max(0.0,1.0-length((v_uv-vec2(0.02,0.87))*vec2(1.6,1.1))),3.0);
        leak += pow(max(0.0,1.0-length((v_uv-vec2(1.1,0.12))*vec2(1.3,1.7))),4.0);
        col += vec3(1.0,0.25,0.045)*leak*u_leaks*0.65;
        float fleck = step(0.9975,rand(floor(v_uv*u_size/3.0)+vec2(67.2,19.4)));
        col += fleck*u_dust*vec3(0.8,0.73,0.57);
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
      ['u_texture','u_size','u_imgSize','u_texSize','u_mode','u_distortion','u_preset','u_filterPower','u_grain','u_vignette','u_temperature','u_aberration','u_blur','u_edgeBlur','u_edgeFeather','u_compare','u_lensSize','u_zoom','u_offset','u_halation','u_bloom','u_leaks','u_dust'].forEach(name => uniforms[name] = gl.getUniformLocation(program,name));
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
      mediaMode = 'image';
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
    if(!renderReady || !loadedImage || (busy && mediaMode==='video')) return;
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
    ['halation','bloom','leaks','dust'].forEach(k=>gl.uniform1f(uniforms['u_'+k],state[k]/100));
    gl.uniform1f(uniforms.u_lensSize,state.lensSize/100);
    gl.uniform1f(uniforms.u_zoom,state.zoom/100);
    gl.uniform2f(uniforms.u_offset,state.offsetX,state.offsetY);
    if(mediaMode === 'camera' && $('#cameraFeed').readyState >= 2) {
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,$('#cameraFeed'));
    }
    if(mediaMode === 'video' && sourceVideo && sourceVideo.readyState >= 2) {
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,sourceVideo);
    }
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
      if((mediaMode === 'video' && sourceVideo && !sourceVideo.paused) || (mediaMode === 'camera' && cameraStream)) queueRender();
    });
  }

  let videoAudioContext=null, videoAudioNode=null, videoAudioDestination=null;
  let videoTrimStart=0, videoTrimEnd=0, videoExportCancelled=false;
  const videoUi=()=>document.querySelector('#videoStudio');
  const videoTime=t=>Number.isFinite(t)?`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`:'0:00';
  function syncVideoUi(){
    if(!sourceVideo || !Number.isFinite(sourceVideo.duration))return;
    const duration=sourceVideo.duration;
    const start=$('#trimStart'),end=$('#trimEnd'),seek=$('#videoSeek');
    for(const el of [start,end,seek])el.max=duration;
    start.value=videoTrimStart;end.value=videoTrimEnd;
    seek.min=videoTrimStart;seek.max=videoTrimEnd;
    seek.value=Math.min(videoTrimEnd,Math.max(videoTrimStart,sourceVideo.currentTime));
    $('#trimReadout').textContent=`${videoTime(videoTrimStart)} — ${videoTime(videoTrimEnd)} · ${videoTime(videoTrimEnd-videoTrimStart)}`;
    $('#videoClock').textContent=videoTime(sourceVideo.currentTime);
  }
  async function seekVideo(time){
    if(!sourceVideo)return;
    sourceVideo.currentTime=Math.max(videoTrimStart,Math.min(videoTrimEnd,time));
    if(sourceVideo.seeking)await new Promise(resolve=>{sourceVideo.addEventListener('seeked',resolve,{once:true});setTimeout(resolve,1500)});
    queueRender();syncVideoUi();
  }
  async function ensureVideoAudio(){
    if(!window.AudioContext && !window.webkitAudioContext)return null;
    if(!videoAudioContext){
      videoAudioContext=new (window.AudioContext||window.webkitAudioContext)();
      videoAudioNode=videoAudioContext.createMediaElementSource($('#mediaSource'));
      videoAudioDestination=videoAudioContext.createMediaStreamDestination();
      videoAudioNode.connect(videoAudioDestination);
      videoAudioNode.connect(videoAudioContext.destination);
    }
    await videoAudioContext.resume();
    return videoAudioDestination.stream.getAudioTracks()[0]||null;
  }
  function loadVideo(file) {
    stopCamera();
    if(sourceVideo) {sourceVideo.pause();sourceVideo.removeAttribute('src');sourceVideo.load();}
    const url = URL.createObjectURL(file);
    if(fileObjectUrl) URL.revokeObjectURL(fileObjectUrl);
    fileObjectUrl = url;
    sourceVideo = $('#mediaSource');
    sourceVideo.src = url;sourceVideo.loop=false;
    sourceVideo.onloadedmetadata = () => {
      imageWidth = sourceVideo.videoWidth; imageHeight = sourceVideo.videoHeight;
      textureWidth = imageWidth; textureHeight = imageHeight;
      if(!imageWidth || !imageHeight) return showToast('No se pudo leer el vídeo.');
      gl.bindTexture(gl.TEXTURE_2D,cachedTexture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,sourceVideo);
      mediaMode = 'video'; loadedImage = sourceVideo; imageName = file.name;
      videoTrimStart=0;videoTrimEnd=Number.isFinite(sourceVideo.duration)?sourceVideo.duration:0;videoUi().classList.remove('hidden');syncVideoUi();
      $('#sourceLabel').textContent = 'TU VÍDEO'; $('#demoBadge').classList.add('hidden');
      $('#imageDimensions').textContent = `${imageWidth} × ${imageHeight} PX`;
      $('#exportLabel').textContent = 'GUARDAR VÍDEO';
      updatePreviewRatio();
      sourceVideo.play().then(queueRender).catch(()=>showToast('Toca la pantalla para reproducir el vídeo.'));
    };
    sourceVideo.onerror = () => showToast('Formato de vídeo no compatible con este navegador.');
    sourceVideo.ontimeupdate=()=>{if(!busy && sourceVideo.currentTime>=videoTrimEnd-.08){sourceVideo.pause();sourceVideo.currentTime=videoTrimStart;}syncVideoUi();};
  }

  function stopCamera() {
    if(cameraStream) cameraStream.getTracks().forEach(t=>t.stop());
    cameraStream = null;
    $('#cameraFeed').srcObject = null;
    if(cameraCanvasParent) {cameraCanvasParent.appendChild(canvas);cameraCanvasParent=null;}
    $('#cameraOverlay').classList.add('hidden');
    if(mediaMode === 'camera') {mediaMode='image'; if(loadedImage && loadedImage !== $('#cameraFeed')) setSource(loadedImage,'TU FOTO',imageName);}
    queueRender();
  }
  async function openCamera() {
    if(!navigator.mediaDevices?.getUserMedia) return showToast('La cámara necesita HTTPS y permiso de Safari.');
    stopCamera();
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:cameraFacing}}});
      const feed=$('#cameraFeed');feed.srcObject=cameraStream;
      $('#cameraOverlay').classList.remove('hidden');
      await feed.play();
      imageWidth=textureWidth=feed.videoWidth;imageHeight=textureHeight=feed.videoHeight;
      cameraCanvasParent=canvas.parentNode;
      $('#cameraPreview').appendChild(canvas);
      mediaMode='camera';
      queueRender();
    } catch(e) {console.error(e);stopCamera();showToast('No se pudo abrir la cámara. Revisa los permisos.');}
  }
  function takePhoto() {
    const feed=$('#cameraFeed');
    if(!feed.videoWidth) return;
    const capture=document.createElement('canvas');
    capture.width=feed.videoWidth;capture.height=feed.videoHeight;
    capture.getContext('2d').drawImage(feed,0,0);
    stopCamera();
    setSource(capture,'CÁMARA','captura');
    $('#exportLabel').textContent='GUARDAR IMAGEN';
    showToast('Captura lista con los mismos ajustes que veías en directo.');
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
  function snapshot() {const v=JSON.stringify(Object.fromEntries(Object.keys(defaults).filter(k=>k!=='compare').map(k=>[k,state[k]])));if(history.at(-1)!==v){history.push(v);if(history.length>45)history.shift();future=[];}lastSnapshot=v;updateHistory();}
  function updateHistory(){ $('#undoButton').disabled=!history.length;$('#redoButton').disabled=!future.length; }
  function restoreSnapshot(v){Object.assign(state,JSON.parse(v));lastSnapshot=v;updateSelections();updatePreviewRatio();updateActiveSlider();$('#timestampToggle').checked=!!state.timestamp;queueRender();updateHistory();}
  function undo(){if(!history.length)return;future.push(JSON.stringify(state));restoreSnapshot(history.pop());}
  function redo(){if(!future.length)return;history.push(JSON.stringify(state));restoreSnapshot(future.pop());}
  function savePreset(){const name=prompt('Nombre de tu preset:','MY LOOK');if(!name?.trim())return;const presets=JSON.parse(localStorage.getItem('fisheye-presets-v4')||'[]');presets.push({name:name.trim().slice(0,24),values:Object.fromEntries(Object.keys(defaults).filter(k=>k!=='compare').map(k=>[k,state[k]]))});localStorage.setItem('fisheye-presets-v4',JSON.stringify(presets.slice(-24)));renderPresets();showToast('Preset guardado en este dispositivo.');}
  function renderPresets(){const list=$('#customPresets');list.replaceChildren();const presets=JSON.parse(localStorage.getItem('fisheye-presets-v4')||'[]');presets.forEach((preset,i)=>{const item=document.createElement('div');item.className='saved-preset';const apply=document.createElement('button');apply.textContent=preset.name;apply.onclick=()=>{snapshot();Object.assign(state,preset.values);updateSelections();updatePreviewRatio();updateActiveSlider();queueRender();};const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label','Eliminar preset '+preset.name);remove.onclick=()=>{presets.splice(i,1);localStorage.setItem('fisheye-presets-v4',JSON.stringify(presets));renderPresets();};item.append(apply,remove);list.append(item);});}
  function reset() {
    snapshot();Object.assign(state, defaults);
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
  function stampedCanvas(source){const out=document.createElement('canvas');out.width=source.width;out.height=source.height;const ctx=out.getContext('2d');ctx.drawImage(source,0,0);if(state.timestamp){const font=Math.max(14,Math.round(out.width*0.035));ctx.font=`bold ${font}px monospace`;ctx.textAlign='right';ctx.fillStyle='#ffab57';ctx.shadowColor='#d85d18';ctx.shadowBlur=font*.4;ctx.fillText(new Date().toLocaleDateString('en-GB').replaceAll('/','.'),out.width-font,out.height-font);}return out;}
  async function exportVideo() {
    if(busy||!sourceVideo)return;
    if(!canvas.captureStream||!window.MediaRecorder)return showToast('Safari no permite grabar este vídeo. Prueba en un navegador compatible.',5000);
    const mp4=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1.42E01E','video/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
    const webm=['video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    const mime=$('#videoFormat').value==='webm'?(webm||mp4):(mp4||webm);
    if(!mime)return showToast('Este navegador no ofrece codificador de vídeo.',5000);
    if(!mp4 && $('#videoFormat').value==='mp4')return showToast('MP4 no está disponible en este navegador. Selecciona WebM o usa otro navegador.',5500);
    const duration=videoTrimEnd-videoTrimStart;
    if(duration<=0||duration>90)return showToast('Selecciona un fragmento de entre 1 y 90 segundos.');
    const fps=Number($('#videoFps').value),target=Number($('#videoResolution').value);
    busy=true;videoExportCancelled=false;$('#exportButton').disabled=true;$('#exportLabel').textContent='EXPORTANDO VÍDEO...';
    let stream=null,raf=0,recorder=null,audioTrack=null,ended=false;
    const oldMuted=sourceVideo.muted;
    try{
      sourceVideo.pause();await seekVideo(videoTrimStart);
      const ratio=getRatio();let w,h;
      if(ratio>=1){w=Math.round(target);h=Math.round(target/ratio);}else{w=Math.round(target*ratio);h=Math.round(target);}
      const maxDim=Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),gl.getParameter(gl.MAX_TEXTURE_SIZE));
      const scale=Math.min(1,maxDim/Math.max(w,h));w=Math.max(2,Math.round(w*scale/2)*2);h=Math.max(2,Math.round(h*scale/2)*2);
      canvas.width=w;canvas.height=h;
      const output=document.createElement('canvas');output.width=w;output.height=h;
      const ctx=output.getContext('2d',{alpha:false});
      stream=output.captureStream(fps);
      try{audioTrack=await ensureVideoAudio();if(audioTrack)stream.addTrack(audioTrack);}catch(err){console.warn('Audio capture unavailable',err);}
      sourceVideo.muted=false;
      const chunks=[];
      recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:Math.round(5000000*(target/1080))});
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      const finished=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=()=>reject(new Error('Error del codificador'));});
      const paint=()=>{
        if(!busy||videoExportCancelled)return;
        queueRender();
        ctx.drawImage(canvas,0,0,w,h);
        if(state.timestamp){const f=Math.max(14,Math.round(w*.035));ctx.font=`bold ${f}px monospace`;ctx.textAlign='right';ctx.fillStyle='#ffab57';ctx.fillText(new Date().toLocaleDateString('en-GB').replaceAll('/','.'),w-f,h-f);}
        const progress=Math.min(100,Math.round(100*(sourceVideo.currentTime-videoTrimStart)/duration));
        $('#videoProgress').textContent=`${progress}%`;
        raf=requestAnimationFrame(paint);
      };
      recorder.start(250);paint();
      await sourceVideo.play();
      await new Promise(resolve=>{
        const watch=()=>{
          if(videoExportCancelled||sourceVideo.ended||sourceVideo.currentTime>=videoTrimEnd-.04){ended=true;resolve();}
          else setTimeout(watch,40);
        };watch();
      });
      sourceVideo.pause();cancelAnimationFrame(raf);
      if(recorder.state!=='inactive')recorder.stop();await finished;
      if(videoExportCancelled)return;
      const blob=new Blob(chunks,{type:mime});
      if(!blob.size)throw new Error('Empty recording');
      const ext=mime.includes('mp4')?'mp4':'webm';
      const file=new File([blob],`fisheye-video.${ext}`,{type:mime});
      if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file]}).catch(()=>downloadBlob(blob,file.name));
      else downloadBlob(blob,file.name);
      showToast(audioTrack?`Vídeo ${ext.toUpperCase()} exportado con pista de audio.`:`Vídeo ${ext.toUpperCase()} exportado. Comprueba el audio: no se pudo capturar.`,6000);
    }catch(err){console.error(err);showToast('No se pudo exportar. Prueba un clip corto o una resolución menor.',6000);}
    finally{cancelAnimationFrame(raf);stream?.getVideoTracks().forEach(t=>t.stop());sourceVideo.muted=oldMuted;busy=false;$('#exportButton').disabled=false;$('#exportLabel').textContent='GUARDAR VÍDEO';$('#videoProgress').textContent='';resizePreview();await seekVideo(videoTrimStart);queueRender();}
  }
  async function exportPhoto() {
    if(mediaMode === 'video') return exportVideo();
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
      const output = state.timestamp ? stampedCanvas(canvas) : canvas;
      blob = await new Promise((resolve,reject) => output.toBlob(data => data ? resolve(data) : reject(new Error('No se pudo crear el archivo')),mime,0.94));
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
    $('#undoButton').addEventListener('click',undo);$('#redoButton').addEventListener('click',redo);$('#savePreset').addEventListener('click',savePreset);
    $('#timestampToggle').addEventListener('change',e=>{snapshot();state.timestamp=e.target.checked;queueRender();});
    $('#videoButton').addEventListener('click',()=>$('#videoInput').click());
    $('#trimStart').addEventListener('input',e=>{videoTrimStart=Math.min(Number(e.target.value),videoTrimEnd-.1);syncVideoUi();seekVideo(videoTrimStart);});
    $('#trimEnd').addEventListener('input',e=>{videoTrimEnd=Math.max(Number(e.target.value),videoTrimStart+.1);syncVideoUi();seekVideo(Math.min(sourceVideo.currentTime,videoTrimEnd));});
    $('#videoSeek').addEventListener('input',e=>{sourceVideo.pause();seekVideo(Number(e.target.value));});
    $('#videoPlay').addEventListener('click',async()=>{if(!sourceVideo)return;if(sourceVideo.paused){if(sourceVideo.currentTime>=videoTrimEnd-.1)await seekVideo(videoTrimStart);try{await ensureVideoAudio();}catch{}sourceVideo.muted=false;sourceVideo.play().then(queueRender).catch(()=>{});}else sourceVideo.pause();});
    $('#videoInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)loadVideo(f);e.target.value='';});
    $('#cameraButton').addEventListener('click',openCamera);
    $('#closeCamera').addEventListener('click',stopCamera);
    $('#flipCamera').addEventListener('click',()=>{cameraFacing=cameraFacing==='environment'?'user':'environment';openCamera();});
    $('#takePhoto').addEventListener('click',takePhoto);
    let pointer=null, pinchStart=null;
    const touches=new Map();
    stage.addEventListener('pointerdown',e=>{if(e.target!==canvas && e.target!==stage)return;stage.setPointerCapture(e.pointerId);touches.set(e.pointerId,{x:e.clientX,y:e.clientY});pointer={x:e.clientX,y:e.clientY};if(touches.size===2){const a=[...touches.values()];pinchStart={distance:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),zoom:state.zoom};}});
    stage.addEventListener('pointermove',e=>{if(!touches.has(e.pointerId))return;const old=touches.get(e.pointerId);touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(touches.size===2 && pinchStart){const a=[...touches.values()];state.zoom=Math.min(300,Math.max(100,Math.round(pinchStart.zoom*Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)/Math.max(pinchStart.distance,1))));if(activeControl==='zoom')updateActiveSlider();}else{const rect=stage.getBoundingClientRect();state.offsetX=Math.max(-0.5,Math.min(0.5,state.offsetX-(e.clientX-old.x)/Math.max(rect.width,1)/state.zoom*100));state.offsetY=Math.max(-0.5,Math.min(0.5,state.offsetY+(e.clientY-old.y)/Math.max(rect.height,1)/state.zoom*100));}queueRender();});
    ['pointerup','pointercancel','lostpointercapture'].forEach(type=>stage.addEventListener(type,e=>{touches.delete(e.pointerId);if(touches.size<2)pinchStart=null;}));
    stage.addEventListener('click',()=>{if(mediaMode==='video'&&sourceVideo?.paused)sourceVideo.play().then(queueRender).catch(()=>{});});
    input.addEventListener('change',async event => {
      const file = event.target.files?.[0];
      if(!file) return;
      if(!file.type.startsWith('image/') && !/\.(heic|heif|jpg|jpeg|png|webp|avif)$/i.test(file.name)) {
        showToast('Selecciona una foto, por favor.');
        return;
      }
      if(sourceVideo) sourceVideo.pause();
      const url = URL.createObjectURL(file);
      try {
        await loadPhotoFromUrl(url,'TU FOTO',file.name);
        if(fileObjectUrl) URL.revokeObjectURL(fileObjectUrl);
        fileObjectUrl = url;
        $('#exportLabel').textContent = 'GUARDAR IMAGEN';
        showToast('Foto cargada. Arrástrala para encuadrar.');
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
    $$('.lens-option').forEach(button => button.addEventListener('click',()=>{snapshot();state.mode=+button.dataset.mode;updateSelections();updatePreviewRatio();}));
    $$('.ratio').forEach(button => button.addEventListener('click',()=>{snapshot();state.ratio=button.dataset.ratio;updateSelections();updatePreviewRatio();}));
    $$('.look').forEach(button => button.addEventListener('click',()=>{snapshot();state.preset=+button.dataset.preset;updateSelections();queueRender();}));
    $$('.adjust-option').forEach(button => button.addEventListener('click', () => selectControl(button.dataset.control)));
    $('#activeSlider').addEventListener('pointerdown',snapshot);$('#activeSlider').addEventListener('keydown',snapshot);
    $('#activeSlider').addEventListener('input',event => {
      state[activeControl] = +event.currentTarget.value;
      updateActiveSlider();
      queueRender();
    });
    $('#resetSingle').addEventListener('click', () => {
      snapshot();state[activeControl] = defaults[activeControl];
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
    lastSnapshot=JSON.stringify(state);renderPresets();updateHistory();
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

  // Keep video trimming/export settings out of the way until needed.
  const toggleVideoTools = document.getElementById('toggleVideoTools');
  const videoAdvanced = document.getElementById('videoAdvanced');
  if(toggleVideoTools && videoAdvanced){
    toggleVideoTools.addEventListener('click', () => {
      const opening = videoAdvanced.classList.contains('hidden');
      videoAdvanced.classList.toggle('hidden', !opening);
      toggleVideoTools.setAttribute('aria-expanded', String(opening));
      toggleVideoTools.textContent = opening ? 'MENOS AJUSTES −' : 'MÁS AJUSTES ＋';
      requestAnimationFrame(() => { fitStage(); queueRender(); });
    });
  }
})();
