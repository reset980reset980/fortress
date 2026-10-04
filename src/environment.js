import { WebGLRenderer, Scene, PerspectiveCamera, Color, Fog, HemisphereLight,
  DirectionalLight, CanvasTexture, SRGBColorSpace, ACESFilmicToneMapping,
  PCFSoftShadowMap, Vector3, TextureLoader, GLTFLoader } from '../assets/vendor/environment-engine.js';

export const ENVIRONMENT_VERSION = 'v1';
const THEMES = {
  coast: { sky: ['#376986', '#89b7c6', '#d4ded3'], fog: '#a8c7cb', sun: '#ffe2ae', ambient: '#b2daee', exposure: 1.15 },
  desert: { sky: ['#645c78', '#c59a89', '#f0ceb0'], fog: '#d3ad91', sun: '#ffd295', ambient: '#d6c3dc', exposure: 1.22 },
  frost: { sky: ['#385979', '#8ab1cf', '#d7e8eb'], fog: '#b5d3e0', sun: '#e9f6ff', ambient: '#c8e7ff', exposure: 1.18 },
};

function makeSky(palette) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 576;
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  palette.sky.forEach((color, i) => sky.addColorStop(i / 2, color));
  ctx.fillStyle = sky; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const sun = ctx.createRadialGradient(790, 128, 2, 790, 128, 150);
  sun.addColorStop(0, palette.sun + 'bb'); sun.addColorStop(.12, palette.sun + '70'); sun.addColorStop(1, palette.sun + '00');
  ctx.fillStyle = sun; ctx.fillRect(630, 0, 320, 300);
  ctx.fillStyle = palette.sun; ctx.beginPath(); ctx.arc(790, 128, 17, 0, Math.PI * 2); ctx.fill();
  // Broad, softly layered cirrus keeps the sky calm behind the firing trajectory.
  for (let i = 0; i < 7; i++) {
    const x = (i * 183 + 90) % 1100, y = 55 + (i * 37) % 170;
    const haze = ctx.createRadialGradient(x, y, 0, x, y, 170);
    haze.addColorStop(0, '#edf5ef18'); haze.addColorStop(1, '#edf5ef00');
    ctx.fillStyle = haze; ctx.save(); ctx.translate(0, y * .7); ctx.scale(1, .3);
    ctx.fillRect(x - 170, y - 170, 340, 340); ctx.restore();
  }
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** The Blender geometry is rendered in real 3D; combat stays in its stable 2D plane.
 * A retained canvas avoids DOM layering/alignment differences on mobile. At most
 * 24 background frames/sec are rendered, independently of the ballistic loop.
 */
export class BattlefieldEnvironment {
  constructor(theme = 'coast', width = 960, map = theme) {
    this.theme = THEMES[theme] ? theme : 'coast';
    this.map = ['coast','desert','frost','shore-02','shore-03','dune-02','dune-03','frost-02','frost-03'].includes(map) ? map : this.theme;
    this.ready = false; this.destroyed = false; this.contextLost = false; this.error = null; this.frameCount = 0;
    this.lastTime = -Infinity; this.lowQuality = false;
    this.drawCosts = []; this.frameGaps = []; this.drawSamples = 0; this.fallbackReason = null;
    this.canvas = document.createElement('canvas');
    const context = this.canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true });
    if (!context) throw new Error('WebGL2 unavailable; use the Blender preview.');
    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true,
      context, alpha: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(1);
    this.resize(width);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    const p = THEMES[this.theme]; this.renderer.toneMappingExposure = p.exposure;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.scene = new Scene(); this.scene.background = makeSky(p); this.scene.fog = new Fog(p.fog, 100, 195);
    this.camera = new PerspectiveCamera(39.2, 1.8, .2, 400);
    this.camera.position.set(0, 36, 82); this.target = new Vector3(0, 12, -22); this.camera.lookAt(this.target);
    this.scene.add(new HemisphereLight(p.ambient, '#394b47', 2.1));
    const sun = new DirectionalLight(p.sun, 3.1); sun.position.set(35, 50, 28);
    sun.target.position.set(0, 0, -15); this.scene.add(sun.target);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 70, bottom: -50, near: 1, far: 180 });
    sun.shadow.bias = -.001; sun.shadow.normalBias = .45;
    this.scene.add(sun); this.sun = sun;
    this._lost = event => { event.preventDefault(); this.contextLost = true; this.ready = false; this.error = 'WebGL context lost'; };
    this._restored = () => { this.contextLost = false; this.ready = !!this.model && !this.destroyed; this.error = null; this.lastTime = -Infinity; this.renderer.shadowMap.needsUpdate = true; };
    this.canvas.addEventListener('webglcontextlost', this._lost);
    this.canvas.addEventListener('webglcontextrestored', this._restored);
    const loader = new GLTFLoader();
    // The existing proxy permits blob: images but forbids blob: fetch requests.
    // ImageBitmapLoader fetches embedded GLB images; TextureLoader decodes them
    // through <img>, preserving the production CSP without changing the proxy.
    loader.register(parser => {
      parser.textureLoader = new TextureLoader(parser.options.manager)
        .setCrossOrigin(parser.options.crossOrigin).setRequestHeader(parser.options.requestHeader);
      return { name: 'FORTRESS_CSP_IMAGE_LOADER' };
    });
    this.loading = loader.loadAsync(new URL(`../assets/environments/${this.map}-${ENVIRONMENT_VERSION}.glb`, import.meta.url).href)
      .then(gltf => {
        if (this.destroyed) { this.disposeModel(gltf.scene); return false; }
        this.model = gltf.scene;
        this.model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        this.scene.add(this.model); this.ready = !this.contextLost; this.render(0, 205, true); return this.ready;
      }).catch(error => { this.error = error.message; return false; });
  }

  setQuality(low) {
    if (this.destroyed) return;
    if (this.lowQuality === !!low) return;
    this.lowQuality = !!low; this.renderer.shadowMap.enabled = !low;
    this.renderer.shadowMap.needsUpdate = true;
    this.lastTime = -Infinity;
  }

  resize(width) {
    if (this.destroyed) return;
    const size = Math.min(1280, Math.max(640, Math.round(width)));
    this.smallScreen = width < 1000;
    if (this.canvas.width === size) return;
    this.renderer.setSize(size, Math.round(size / 1.8), false);
    this.lastTime = -Infinity;
  }

  render(elapsed, playerX = 205, reducedMotion = false) {
    if (!this.ready || this.destroyed) return null;
    if (elapsed - this.lastTime < (this.lowQuality || this.smallScreen ? 1 / 12 : 1 / 24)) return this.canvas;
    this.lastTime = elapsed;
    // Only the distant environment moves. Tanks, terrain and trajectory stay aligned.
    const pan = reducedMotion ? 0 : (playerX - 205) / 1440 * 1.6;
    this.camera.position.x = pan + (reducedMotion ? 0 : Math.sin(elapsed * .08) * .25);
    this.camera.lookAt(this.target);
    this.renderer.render(this.scene, this.camera); this.frameCount++;
    return this.canvas;
  }

  recordDrawCost(milliseconds) {
    if (!this.ready || this.destroyed || ++this.drawSamples <= 2) return;
    this.drawCosts.push(milliseconds);
    if (this.drawCosts.length > 6) this.drawCosts.shift();
    // Include the 3D-to-2D GPU readback, not just asynchronous GL submission.
    // Sustained frames below ~12fps should not slow the ballistic simulation.
    if (this.drawCosts.length === 6 && this.drawCosts.reduce((a, b) => a + b, 0) / 6 > 85) {
      this.fallbackReason = 'slow-renderer'; this.destroy();
    }
  }

  recordFrameGap(milliseconds) {
    if (!this.ready || this.destroyed || milliseconds <= 0) return;
    this.frameGaps.push(milliseconds);
    if (this.frameGaps.length > 6) this.frameGaps.shift();
    // Some drivers defer GPU/compositor work beyond the JS render call. A
    // sustained median below 8fps also selects the inexpensive Blender render.
    if (this.frameGaps.length === 6 && [...this.frameGaps].sort((a, b) => a - b)[3] > 125) {
      this.fallbackReason = 'slow-renderer'; this.destroy();
    }
  }

  get stats() {
    const textures = new Set();
    this.model?.traverse(o => { for (const material of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    } });
    return { ready: this.ready, theme: this.theme, map: this.map, frames: this.frameCount,
      triangles: this.renderer.info.render.triangles, drawCalls: this.renderer.info.render.calls,
      textures: textures.size, width: this.canvas.width, height: this.canvas.height, fallbackReason: this.fallbackReason, error: this.error };
  }

  disposeModel(model) {
    const textures = new Set();
    model.traverse(o => {
      o.geometry?.dispose();
      for (const material of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        material.dispose();
      }
    });
    for (const texture of textures) { texture.dispose(); texture.image?.close?.(); }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true; this.ready = false;
    this.canvas.removeEventListener('webglcontextlost', this._lost);
    this.canvas.removeEventListener('webglcontextrestored', this._restored);
    if (this.model) this.disposeModel(this.model);
    this.scene.background.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss();
  }
}
