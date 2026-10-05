/**
 * Dependency-free 3D combat overlay.
 * Coordinates are logical canvas pixels; +Y points down, +Z points away.
 * Emit from confirmed combat events, then update(dt seconds) and render().
 * The 3D prism debris has real surface normals, depth testing and rotation.
 */
const POINT_CAPACITY = 384;
const DEBRIS_CAPACITY = 64;
const WAVE_CAPACITY = 8;
const POINT_STRIDE = 20;
const DEBRIS_STRIDE = 21;
const WAVE_STRIDE = 15;
const POINT_GPU_STRIDE = 12;
const MESH_GPU_STRIDE = 12;
const PRISM_VERTICES = 24;
const WAVE_SEGMENTS = 36;
const WAVE_VERTICES = WAVE_SEGMENTS * 6;
const WAVE_VERTEX_OFFSET = DEBRIS_CAPACITY * PRISM_VERTICES;
const MESH_VERTICES = WAVE_VERTEX_OFFSET + WAVE_CAPACITY * WAVE_VERTICES;
const TAU = Math.PI * 2;
const DEFAULT_COLOR = [1, 0.62, 0.23];

const projection = `
uniform vec2 u_resolution;
uniform float u_focal;
vec4 project3D(vec3 p) {
  float d = max(36.0, u_focal + p.z);
  float nearPlane = 30.0;
  float farPlane = 5000.0;
  float clipZ = ((farPlane + nearPlane) / (farPlane - nearPlane)) * d
    - (2.0 * farPlane * nearPlane) / (farPlane - nearPlane);
  vec2 clipXY = (p.xy - u_resolution * 0.5) * vec2(2.0, -2.0)
    * u_focal / u_resolution;
  return vec4(clipXY, clipZ, d);
}
`;

const pointVertex = `
precision highp float;
attribute vec3 a_position;
attribute float a_size;
attribute vec4 a_color;
attribute vec4 a_misc;
uniform float u_dpr;
uniform float u_maxPoint;
varying vec4 v_color;
varying vec4 v_misc;
${projection}
void main() {
  gl_Position = project3D(a_position);
  gl_PointSize = clamp(a_size * u_dpr * u_focal / gl_Position.w, 1.0, u_maxPoint);
  v_color = a_color;
  v_misc = a_misc;
}
`;

const pointFragment = `
precision mediump float;
varying vec4 v_color;
varying vec4 v_misc;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float c = cos(v_misc.x);
  float s = sin(v_misc.x);
  vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  float kind = v_misc.z;
  float radius = length(p);
  float alpha;
  vec3 color = v_color.rgb;
  if (kind < 0.5) {
    float core = exp(-radius * radius * 14.0);
    float halo = exp(-radius * radius * 4.2) * (1.0 - smoothstep(0.65, 1.0, radius));
    alpha = (core + halo * 0.38) * v_color.a;
    color += vec3(core * 0.38);
  } else if (kind < 1.5) {
    float streak = length(vec2(q.x * v_misc.y, q.y));
    alpha = exp(-streak * streak * 7.0) * (1.0 - smoothstep(0.75, 1.0, radius)) * v_color.a;
    color += vec3(exp(-streak * streak * 25.0) * 0.45);
  } else if (kind < 2.5) {
    float lobes = 0.93 + 0.07 * sin(atan(p.y, p.x) * 5.0 + v_misc.w);
    float soft = 1.0 - smoothstep(0.3, lobes, radius);
    float light = 0.58 + 0.42 * clamp(0.65 - p.x * 0.25 - p.y * 0.4, 0.0, 1.0);
    alpha = soft * soft * v_color.a;
    color *= light;
  } else {
    float core = exp(-radius * radius * 18.0);
    float ring = exp(-pow((radius - 0.46) * 12.0, 2.0));
    float filaments = 0.78 + 0.22 * sin(atan(p.y, p.x) * 6.0 + v_misc.w);
    alpha = (core + ring * filaments * 0.7 + exp(-radius * radius * 4.0) * 0.25)
      * (1.0 - smoothstep(0.85, 1.0, radius)) * v_color.a;
    color += vec3(core * 0.62);
  }
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(color, alpha);
}
`;

const meshVertex = `
precision highp float;
attribute vec3 a_vertex;
attribute vec3 a_normal;
attribute vec3 a_position;
attribute vec3 a_rotation;
attribute float a_size;
attribute vec4 a_color;
attribute float a_emissive;
varying vec4 v_color;
varying vec3 v_normal;
varying float v_emissive;
${projection}
vec3 rotate3D(vec3 p, vec3 a) {
  vec3 c = cos(a);
  vec3 s = sin(a);
  p = vec3(p.x, c.x * p.y - s.x * p.z, s.x * p.y + c.x * p.z);
  p = vec3(c.y * p.x + s.y * p.z, p.y, -s.y * p.x + c.y * p.z);
  return vec3(c.z * p.x - s.z * p.y, s.z * p.x + c.z * p.y, p.z);
}
void main() {
  vec3 p = a_position + rotate3D(a_vertex * a_size, a_rotation);
  gl_Position = project3D(p);
  v_normal = rotate3D(a_normal, a_rotation);
  v_color = a_color;
  v_emissive = a_emissive;
}
`;

const meshFragment = `
precision mediump float;
varying vec4 v_color;
varying vec3 v_normal;
varying float v_emissive;
void main() {
  vec3 n = normalize(v_normal);
  float light = 0.24 + 0.76 * max(dot(n, normalize(vec3(-0.35, -0.65, 1.2))), 0.0);
  float rim = pow(1.0 - abs(n.z), 3.0) * 0.16;
  vec3 lit = v_color.rgb * (light + rim);
  gl_FragColor = vec4(mix(lit, v_color.rgb * 1.18, v_emissive), v_color.a);
}
`;

function shader(gl, type, source) {
  const value = gl.createShader(type);
  gl.shaderSource(value, source);
  gl.compileShader(value);
  if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(value);
    gl.deleteShader(value);
    throw new Error(`VFX shader: ${message}`);
  }
  return value;
}

function program(gl, vertex, fragment, attributes) {
  const v = shader(gl, gl.VERTEX_SHADER, vertex);
  let f;
  let value;
  try {
    f = shader(gl, gl.FRAGMENT_SHADER, fragment);
    value = gl.createProgram();
    gl.attachShader(value, v);
    gl.attachShader(value, f);
    gl.linkProgram(value);
    if (!gl.getProgramParameter(value, gl.LINK_STATUS)) {
      throw new Error(`VFX program: ${gl.getProgramInfoLog(value)}`);
    }
    const result = { value, attrs: {}, uniforms: {} };
    for (const name of attributes) result.attrs[name] = gl.getAttribLocation(value, name);
    for (const name of ['u_resolution', 'u_focal', 'u_dpr', 'u_maxPoint']) {
      result.uniforms[name] = gl.getUniformLocation(value, name);
    }
    return result;
  } catch (error) {
    if (value) gl.deleteProgram(value);
    throw error;
  } finally {
    gl.deleteShader(v);
    if (f) gl.deleteShader(f);
  }
}

function makeGeometry() {
  const result = new Float32Array(MESH_VERTICES * 6);
  const prism = new Float32Array(PRISM_VERTICES * 6);
  const vertices = [[0, -0.9, 0.3], [-0.7, 0.5, 0.3], [0.7, 0.5, 0.3],
    [0, -0.9, -0.3], [-0.7, 0.5, -0.3], [0.7, 0.5, -0.3]];
  const faces = [[0, 2, 1], [3, 4, 5], [0, 1, 4], [0, 4, 3],
    [1, 2, 5], [1, 5, 4], [2, 0, 3], [2, 3, 5]];
  let cursor = 0;
  for (const face of faces) {
    const a = vertices[face[0]], b = vertices[face[1]], c = vertices[face[2]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    nx /= length; ny /= length; nz /= length;
    for (const index of face) {
      const vertex = vertices[index];
      prism[cursor++] = vertex[0]; prism[cursor++] = vertex[1]; prism[cursor++] = vertex[2];
      prism[cursor++] = nx; prism[cursor++] = ny; prism[cursor++] = nz;
    }
  }
  for (let i = 0; i < DEBRIS_CAPACITY; i++) result.set(prism, i * prism.length);
  cursor = WAVE_VERTEX_OFFSET * 6;
  // A narrow annulus, tilted in 3D by the vertex shader.
  for (let wave = 0; wave < WAVE_CAPACITY; wave++) {
    for (let segment = 0; segment < WAVE_SEGMENTS; segment++) {
      const a = segment / WAVE_SEGMENTS * TAU, b = (segment + 1) / WAVE_SEGMENTS * TAU;
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      const ring = [ca * 0.94, sa * 0.94, ca, sa, cb, sb,
        ca * 0.94, sa * 0.94, cb, sb, cb * 0.94, sb * 0.94];
      for (let i = 0; i < ring.length; i += 2) {
        result[cursor++] = ring[i]; result[cursor++] = ring[i + 1]; result[cursor++] = 0;
        result[cursor++] = 0; result[cursor++] = 0; result[cursor++] = 1;
      }
    }
  }
  return result;
}

export class EffectDirector {
  constructor(canvas) {
    this.canvas = canvas;
    this.supported = false;
    this.points = new Float32Array(POINT_CAPACITY * POINT_STRIDE);
    this.debris = new Float32Array(DEBRIS_CAPACITY * DEBRIS_STRIDE);
    this.waves = new Float32Array(WAVE_CAPACITY * WAVE_STRIDE);
    this.pointGPU = new Float32Array(POINT_CAPACITY * POINT_GPU_STRIDE);
    this.meshGPU = new Float32Array(MESH_VERTICES * MESH_GPU_STRIDE);
    this._color = new Float32Array(3);
    this._pointCount = 0;
    this._debrisCount = 0;
    this._waveCount = 0;
    this._pointCursor = 0;
    this._debrisCursor = 0;
    this._waveCursor = 0;
    this._width = 1;
    this._height = 1;
    this._requestedDpr = 1;
    this._quality = 'high';
    this._destroyed = false;
    this._lost = false;
    this._resources = [];
    this._motionMedia = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this._reducedMotion = Boolean(this._motionMedia?.matches);
    this._motionChanged = (event) => { this._reducedMotion = event.matches; this.setQuality(this._quality); };
    this._motionMedia?.addEventListener?.('change', this._motionChanged);
    this._contextLost = (event) => {
      event.preventDefault();
      this._lost = true;
      this.supported = false;
      this.clear();
    };
    this._contextRestored = () => {
      if (this._destroyed) return;
      this._lost = false;
      this._resources.length = 0;
      this._setupGL();
      this.resize(this._width, this._height, this._requestedDpr);
    };
    canvas?.addEventListener?.('webglcontextlost', this._contextLost, false);
    canvas?.addEventListener?.('webglcontextrestored', this._contextRestored, false);
    this.setQuality('high');
    if (!canvas?.getContext) return;
    try {
      this.gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false,
        antialias: false, depth: true, stencil: false, preserveDrawingBuffer: false,
        powerPreference: 'low-power' });
      if (this.gl) this._setupGL();
    } catch {
      this.supported = false;
    }
  }

  _setupGL() {
    const gl = this.gl;
    if (!gl) return;
    try {
      this._pointProgram = program(gl, pointVertex, pointFragment,
        ['a_position', 'a_size', 'a_color', 'a_misc']);
      this._resources.push({ type: 'program', value: this._pointProgram.value });
      this._meshProgram = program(gl, meshVertex, meshFragment,
        ['a_vertex', 'a_normal', 'a_position', 'a_rotation', 'a_size', 'a_color', 'a_emissive']);
      this._resources.push({ type: 'program', value: this._meshProgram.value });
      this._pointBuffer = gl.createBuffer();
      this._resources.push({ type: 'buffer', value: this._pointBuffer });
      gl.bindBuffer(gl.ARRAY_BUFFER, this._pointBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.pointGPU.byteLength, gl.DYNAMIC_DRAW);
      this._meshBuffer = gl.createBuffer();
      this._resources.push({ type: 'buffer', value: this._meshBuffer });
      gl.bindBuffer(gl.ARRAY_BUFFER, this._meshBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.meshGPU.byteLength, gl.DYNAMIC_DRAW);
      this._geometryBuffer = gl.createBuffer();
      this._resources.push({ type: 'buffer', value: this._geometryBuffer });
      gl.bindBuffer(gl.ARRAY_BUFFER, this._geometryBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, makeGeometry(), gl.STATIC_DRAW);
      const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
      this._maxPointSize = Math.min(256, range[1]);
      gl.enable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(1);
      gl.depthFunc(gl.LEQUAL);
      this.supported = true;
    } catch (error) {
      this.error = error.message;
      this._releaseGL();
      this.supported = false;
    }
  }

  _releaseGL() {
    if (!this.gl || this._lost) { this._resources.length = 0; return; }
    for (const resource of this._resources) {
      if (resource.type === 'program') this.gl.deleteProgram(resource.value);
      else this.gl.deleteBuffer(resource.value);
    }
    this._resources.length = 0;
  }

  resize(width, height, dpr = 1) {
    this._width = Math.max(1, Number(width) || 1);
    this._height = Math.max(1, Number(height) || 1);
    this._requestedDpr = Math.max(0.5, Number(dpr) || 1);
    this._dpr = Math.min(this._requestedDpr, this._quality === 'low' || this._reducedMotion ? 1.25 : 2);
    this._focal = Math.max(480, Math.min(this._width, this._height) * 1.3);
    if (this.canvas) {
      this.canvas.width = Math.round(this._width * this._dpr);
      this.canvas.height = Math.round(this._height * this._dpr);
    }
    if (this.supported) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  setQuality(quality = 'high') {
    this._quality = quality === 'low' ? 'low' : 'high';
    const low = this._quality === 'low' || this._reducedMotion;
    this._pointLimit = low ? 120 : POINT_CAPACITY;
    this._debrisLimit = this._reducedMotion ? 8 : low ? 24 : DEBRIS_CAPACITY;
    this._waveLimit = low ? 4 : WAVE_CAPACITY;
    this._pointCount = Math.min(this._pointCount, this._pointLimit);
    this._debrisCount = Math.min(this._debrisCount, this._debrisLimit);
    this._waveCount = Math.min(this._waveCount, this._waveLimit);
    this.resize(this._width, this._height, this._requestedDpr);
  }

  get activeCount() { return this._pointCount + this._debrisCount + this._waveCount; }

  _readColor(value, fallback = DEFAULT_COLOR) {
    let r = fallback[0], g = fallback[1], b = fallback[2];
    if (Array.isArray(value) || ArrayBuffer.isView(value)) {
      const scale = Math.max(value[0], value[1], value[2]) > 1 ? 1 / 255 : 1;
      r = value[0] * scale; g = value[1] * scale; b = value[2] * scale;
    } else if (typeof value === 'string' && /^#[\da-f]{3,8}$/i.test(value)) {
      let hex = value.slice(1);
      if (hex.length === 3 || hex.length === 4) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      if (hex.length === 8) hex = hex.slice(0, 6);
      if (hex.length === 6) {
        const n = Number.parseInt(hex, 16);
        r = ((n >> 16) & 255) / 255; g = ((n >> 8) & 255) / 255; b = (n & 255) / 255;
      }
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      r = ((value >> 16) & 255) / 255; g = ((value >> 8) & 255) / 255; b = (value & 255) / 255;
    }
    this._color[0] = Math.max(0, Math.min(1, r));
    this._color[1] = Math.max(0, Math.min(1, g));
    this._color[2] = Math.max(0, Math.min(1, b));
    return this._color;
  }

  _point(x, y, z, vx, vy, vz, life, size, r, g, b, alpha, kind, gravity, drag, stretch = 1) {
    const index = this._pointCount < this._pointLimit ? this._pointCount++ : this._pointCursor++ % this._pointLimit;
    const p = this.points, o = index * POINT_STRIDE;
    p[o] = x; p[o + 1] = y; p[o + 2] = z;
    p[o + 3] = vx; p[o + 4] = vy; p[o + 5] = vz;
    p[o + 6] = 0; p[o + 7] = life; p[o + 8] = size;
    p[o + 9] = r; p[o + 10] = g; p[o + 11] = b; p[o + 12] = alpha;
    p[o + 13] = kind; p[o + 14] = Math.atan2(vx, vy);
    p[o + 15] = (Math.random() - 0.5) * 3;
    p[o + 16] = gravity; p[o + 17] = drag; p[o + 18] = stretch;
    p[o + 19] = Math.random() * TAU;
  }

  _shard(x, y, vx, vy, vz, life, size, r, g, b) {
    const index = this._debrisCount < this._debrisLimit ? this._debrisCount++ : this._debrisCursor++ % this._debrisLimit;
    const p = this.debris, o = index * DEBRIS_STRIDE;
    p[o] = x; p[o + 1] = y; p[o + 2] = (Math.random() - 0.5) * 12;
    p[o + 3] = vx; p[o + 4] = vy; p[o + 5] = vz;
    p[o + 6] = 0; p[o + 7] = life; p[o + 8] = size;
    p[o + 9] = r; p[o + 10] = g; p[o + 11] = b; p[o + 12] = 1;
    p[o + 13] = Math.random() * TAU; p[o + 14] = Math.random() * TAU; p[o + 15] = Math.random() * TAU;
    p[o + 16] = (Math.random() - 0.5) * 12;
    p[o + 17] = (Math.random() - 0.5) * 12;
    p[o + 18] = (Math.random() - 0.5) * 9;
    p[o + 19] = 230; p[o + 20] = 1.2;
  }

  _wave(x, y, radius, life, r, g, b, tilt = 0.2) {
    const index = this._waveCount < this._waveLimit ? this._waveCount++ : this._waveCursor++ % this._waveLimit;
    const p = this.waves, o = index * WAVE_STRIDE;
    p[o] = x; p[o + 1] = y; p[o + 2] = 2;
    p[o + 3] = 0; p[o + 4] = life; p[o + 5] = radius;
    p[o + 6] = r; p[o + 7] = g; p[o + 8] = b; p[o + 9] = 0.65;
    p[o + 10] = tilt; p[o + 11] = tilt * 0.4; p[o + 12] = Math.random() * TAU;
    p[o + 13] = 4; p[o + 14] = 0;
  }

  /** Types: explosion/impact, muzzle/fire, trail, plasma, shield, heal, smoke/dust, victory. */
  emit(type, x, y, options = {}) {
    if (!this.supported || this._destroyed || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    const intensity = Math.max(0.15, Math.min(2.5, Number(options.intensity) || 1));
    const reduced = this._reducedMotion;
    const scale = (this._quality === 'low' ? 0.48 : 1) * (reduced ? 0.3 : 1);
    const cool = type === 'plasma' || type === 'shield' || options.element === 'plasma';
    const color = this._readColor(options.color, cool ? [0.24, 0.85, 1] : type === 'heal' ? [0.3, 1, 0.65] : DEFAULT_COLOR);
    const r = color[0], g = color[1], b = color[2];
    const angle = Number.isFinite(options.angle) ? options.angle : -Math.PI / 4;
    const dirX = Math.cos(angle), dirY = Math.sin(angle);
    const power = Math.sqrt(intensity);
    if (type === 'trail') {
      this._point(x, y, Number(options.z) || 0, -dirX * 18, -dirY * 18, 0, 0.20 + Math.random() * 0.1,
        (cool ? 32 : 20) * power, r, g, b, 0.72, cool ? 3 : 0, 0, 5);
      return true;
    }
    if (type === 'muzzle' || type === 'fire') {
      this._wave(x,y,36*power,.22,r,g,b,.5);
      if(!reduced)this._point(x,y,10,-dirX*25,-dirY*25,0,.55,42,r*.35,g*.35,b*.35,.28,2,-12,1);
      this._point(x, y, 0, dirX * 22, dirY * 22, -8, 0.16, 78 * power, r, g, b, 0.9, 0, 0, 1);
      for (let i = 0, n = Math.max(3, Math.round(22 * scale * power)); i < n; i++) {
        const a = angle + (Math.random() - 0.5) * 0.75;
        const speed = (95 + Math.random() * 130) * power;
        this._point(x, y, 0, Math.cos(a) * speed, Math.sin(a) * speed, (Math.random() - 0.5) * 65,
          0.18 + Math.random() * 0.17, 9 + Math.random() * 10, r, g, b, 1, 1, 70, 3, 3.5);
      }
      return true;
    }
    if (type === 'heal') {
      for (let i = 0, n = Math.max(4, Math.round(20 * scale * power)); i < n; i++) {
        const a = Math.random() * TAU;
        this._point(x + Math.cos(a) * 24, y + Math.sin(a) * 14, 0,
          Math.cos(a) * 10, -30 - Math.random() * 36, Math.sin(a) * 18, 0.7 + Math.random() * 0.4,
          7 + Math.random() * 9, r, g, b, 0.72, 0, -10, 0.4);
      }
      this._wave(x, y, 48 * power, 0.6, r, g, b, 0.85);
      return true;
    }
    if (type === 'shield') {
      this._wave(x, y, (Number(options.radius) || 58) * power, 0.45, r, g, b, 0.15);
      this._point(x, y, 0, 0, 0, 0, 0.2, 74 * power, r, g, b, 0.45, 3, 0, 0);
      return true;
    }
    if (type === 'smoke' || type === 'dust') {
      for (let i = 0, n = Math.max(2, Math.round(7 * scale * power)); i < n; i++) {
        this._point(x + (Math.random() - 0.5) * 12, y, 16, (Math.random() - 0.5) * 35,
          -12 - Math.random() * 28, 10, 0.7 + Math.random() * 0.45, 24 + Math.random() * 28,
          r * 0.38, g * 0.4, b * 0.44, 0.28, 2, -5, 1);
      }
      return true;
    }
    if (type === 'victory') {
      for (let i = 0, n = Math.max(5, Math.round(42 * scale)); i < n; i++) {
        const a = Math.random() * TAU;
        const speed = 80 + Math.random() * 210;
        this._shard(x, y, Math.cos(a) * speed, -Math.abs(Math.sin(a) * speed) - 90,
          (Math.random() - 0.5) * 160, 1.5 + Math.random() * 0.5,
          5 + Math.random() * 5, r, g * (0.65 + Math.random() * 0.35), b);
      }
      return true;
    }
    if (type !== 'explosion' && type !== 'impact' && type !== 'plasma') return false;
    const radius = (Number(options.radius) || 65) * power;
    this._wave(x, y, radius * 1.65, reduced ? 0.2 : 0.46, r, g, b);
    if(!reduced){this._wave(x,y,radius*.85,.65,1,.86,.55,.8);this._point(x,y,-10,0,0,0,.11,radius*.9,1,.94,.78,.8,0,0,0);}
    this._point(x, y, -6, 0, -8, 0, 0.2, radius * 1.15, r, g, b, 0.78, cool ? 3 : 0, 0, 0);
    for (let i = 0, n = Math.max(5, Math.round((cool ? 52 : 66) * scale * power)); i < n; i++) {
      const a = Math.random() * TAU;
      const speed = (60 + Math.random() * 220) * power * (reduced ? 0.5 : 1);
      this._point(x, y, 0, Math.cos(a) * speed, Math.sin(a) * speed - 38,
        (Math.random() - 0.38) * 220, 0.25 + Math.random() * 0.55,
        7 + Math.random() * 13, r, g, b, 0.85, 1, 160, 1.7, 3 + Math.random() * 2);
    }
    for (let i = 0, n = Math.max(1, Math.round(13 * scale * power)); i < n; i++) {
      const a = Math.random() * TAU;
      const speed = (80 + Math.random() * 160) * power;
      this._shard(x, y, Math.cos(a) * speed, Math.sin(a) * speed - 70,
        (Math.random() - 0.45) * 140, 0.6 + Math.random() * 0.65,
        3 + Math.random() * 7, r * 0.74 + 0.12, g * 0.66 + 0.08, b * 0.62 + 0.06);
    }
    for (let i = 0, n = Math.max(1, Math.round(6 * scale)); i < n; i++) {
      const a = Math.random() * TAU;
      this._point(x, y, 20, Math.cos(a) * 36, Math.sin(a) * 20 - 23, 12,
        0.65 + Math.random() * 0.5, 26 + Math.random() * 33,
        cool ? 0.14 : 0.25, cool ? 0.29 : 0.21, cool ? 0.35 : 0.17, 0.25, 2, -8, 1.3);
    }
    return true;
  }

  update(dt) {
    if (this._destroyed) return;
    dt = Math.max(0, Math.min(0.05, Number(dt) || 0));
    const p = this.points;
    for (let i = this._pointCount - 1; i >= 0; i--) {
      const o = i * POINT_STRIDE;
      p[o + 6] += dt;
      if (p[o + 6] >= p[o + 7]) {
        this._pointCount--;
        if (i < this._pointCount) p.copyWithin(o, this._pointCount * POINT_STRIDE, (this._pointCount + 1) * POINT_STRIDE);
        continue;
      }
      const drag = Math.exp(-p[o + 17] * dt);
      p[o + 3] *= drag; p[o + 4] = p[o + 4] * drag + p[o + 16] * dt; p[o + 5] *= drag;
      p[o] += p[o + 3] * dt; p[o + 1] += p[o + 4] * dt;
      p[o + 2] = Math.max(-this._focal * 0.7, p[o + 2] + p[o + 5] * dt);
      p[o + 14] += p[o + 15] * dt;
    }
    const d = this.debris;
    for (let i = this._debrisCount - 1; i >= 0; i--) {
      const o = i * DEBRIS_STRIDE;
      d[o + 6] += dt;
      if (d[o + 6] >= d[o + 7]) {
        this._debrisCount--;
        if (i < this._debrisCount) d.copyWithin(o, this._debrisCount * DEBRIS_STRIDE, (this._debrisCount + 1) * DEBRIS_STRIDE);
        continue;
      }
      const drag = Math.exp(-d[o + 20] * dt);
      d[o + 3] *= drag; d[o + 4] = d[o + 4] * drag + d[o + 19] * dt; d[o + 5] *= drag;
      d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt;
      d[o + 2] = Math.max(-this._focal * 0.7, d[o + 2] + d[o + 5] * dt);
      d[o + 13] += d[o + 16] * dt; d[o + 14] += d[o + 17] * dt; d[o + 15] += d[o + 18] * dt;
    }
    const w = this.waves;
    for (let i = this._waveCount - 1; i >= 0; i--) {
      const o = i * WAVE_STRIDE;
      w[o + 3] += dt;
      if (w[o + 3] >= w[o + 4]) {
        this._waveCount--;
        if (i < this._waveCount) w.copyWithin(o, this._waveCount * WAVE_STRIDE, (this._waveCount + 1) * WAVE_STRIDE);
      }
    }
  }

  _use(value) {
    const gl = this.gl;
    gl.useProgram(value.value);
    gl.uniform2f(value.uniforms.u_resolution, this._width, this._height);
    gl.uniform1f(value.uniforms.u_focal, this._focal);
  }

  _attribute(location, size, stride, offset) {
    if (location < 0) return;
    this.gl.enableVertexAttribArray(location);
    this.gl.vertexAttribPointer(location, size, this.gl.FLOAT, false, stride * 4, offset * 4);
  }

  _pointsPass(smoke) {
    const p = this.points, output = this.pointGPU;
    let count = 0;
    for (let i = 0; i < this._pointCount; i++) {
      const o = i * POINT_STRIDE;
      if ((p[o + 13] === 2) !== smoke) continue;
      const t = p[o + 6] / p[o + 7], g = count++ * POINT_GPU_STRIDE;
      output[g] = p[o]; output[g + 1] = p[o + 1]; output[g + 2] = p[o + 2];
      output[g + 3] = p[o + 8] * (smoke ? 0.8 + t * 1.6 : 1 - t * 0.35);
      output[g + 4] = p[o + 9]; output[g + 5] = p[o + 10]; output[g + 6] = p[o + 11];
      output[g + 7] = p[o + 12] * (smoke ? Math.sin(t * Math.PI) : (1 - t) * (1 - t));
      output[g + 8] = p[o + 14]; output[g + 9] = p[o + 18];
      output[g + 10] = p[o + 13]; output[g + 11] = p[o + 19] + t * 5;
    }
    if (!count) return;
    const gl = this.gl, attrs = this._pointProgram.attrs;
    this._use(this._pointProgram);
    gl.uniform1f(this._pointProgram.uniforms.u_dpr, this._dpr);
    gl.uniform1f(this._pointProgram.uniforms.u_maxPoint, this._maxPointSize);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._pointBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, output);
    this._attribute(attrs.a_position, 3, POINT_GPU_STRIDE, 0);
    this._attribute(attrs.a_size, 1, POINT_GPU_STRIDE, 3);
    this._attribute(attrs.a_color, 4, POINT_GPU_STRIDE, 4);
    this._attribute(attrs.a_misc, 4, POINT_GPU_STRIDE, 8);
    gl.depthMask(false);
    gl.blendFunc(gl.SRC_ALPHA, smoke ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);
    gl.drawArrays(gl.POINTS, 0, count);
  }

  _meshPass() {
    const output = this.meshGPU, d = this.debris, w = this.waves;
    let cursor = 0;
    for (let i = 0; i < this._debrisCount; i++) {
      const o = i * DEBRIS_STRIDE, t = d[o + 6] / d[o + 7];
      const alpha = Math.min(1, (1 - t) * 4);
      for (let vertex = 0; vertex < PRISM_VERTICES; vertex++) {
        output[cursor++] = d[o]; output[cursor++] = d[o + 1]; output[cursor++] = d[o + 2];
        output[cursor++] = d[o + 13]; output[cursor++] = d[o + 14]; output[cursor++] = d[o + 15];
        output[cursor++] = d[o + 8] * (1 - t * 0.18);
        output[cursor++] = d[o + 9]; output[cursor++] = d[o + 10]; output[cursor++] = d[o + 11];
        output[cursor++] = alpha; output[cursor++] = 0;
      }
    }
    cursor = WAVE_VERTEX_OFFSET * MESH_GPU_STRIDE;
    for (let i = 0; i < this._waveCount; i++) {
      const o = i * WAVE_STRIDE, t = w[o + 3] / w[o + 4];
      const radius = w[o + 13] + w[o + 5] * (1 - (1 - t) * (1 - t));
      const alpha = w[o + 9] * (1 - t) * (1 - t);
      for (let vertex = 0; vertex < WAVE_VERTICES; vertex++) {
        output[cursor++] = w[o]; output[cursor++] = w[o + 1]; output[cursor++] = w[o + 2];
        output[cursor++] = w[o + 10]; output[cursor++] = w[o + 11]; output[cursor++] = w[o + 12];
        output[cursor++] = radius;
        output[cursor++] = w[o + 6]; output[cursor++] = w[o + 7]; output[cursor++] = w[o + 8];
        output[cursor++] = alpha; output[cursor++] = 1;
      }
    }
    const gl = this.gl, attrs = this._meshProgram.attrs;
    this._use(this._meshProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._geometryBuffer);
    this._attribute(attrs.a_vertex, 3, 6, 0);
    this._attribute(attrs.a_normal, 3, 6, 3);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._meshBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, output);
    this._attribute(attrs.a_position, 3, MESH_GPU_STRIDE, 0);
    this._attribute(attrs.a_rotation, 3, MESH_GPU_STRIDE, 3);
    this._attribute(attrs.a_size, 1, MESH_GPU_STRIDE, 6);
    this._attribute(attrs.a_color, 4, MESH_GPU_STRIDE, 7);
    this._attribute(attrs.a_emissive, 1, MESH_GPU_STRIDE, 11);
    if (this._debrisCount) {
      gl.depthMask(true);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, this._debrisCount * PRISM_VERTICES);
    }
    if (this._waveCount) {
      gl.depthMask(false);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.drawArrays(gl.TRIANGLES, WAVE_VERTEX_OFFSET, this._waveCount * WAVE_VERTICES);
    }
  }

  render() {
    if (!this.supported || this._destroyed || this._lost) return;
    const gl = this.gl;
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this.activeCount) return;
    // Each program binds its own attributes; clear stale enables between draws.
    const maxAttributes = 8; // WebGL guarantees at least eight vertex attributes.
    for (let i = 0; i < maxAttributes; i++) gl.disableVertexAttribArray(i);
    gl.disable(gl.DEPTH_TEST);
    this._pointsPass(true);
    for (let i = 0; i < maxAttributes; i++) gl.disableVertexAttribArray(i);
    gl.enable(gl.DEPTH_TEST);
    if (this._debrisCount || this._waveCount) this._meshPass();
    for (let i = 0; i < maxAttributes; i++) gl.disableVertexAttribArray(i);
    this._pointsPass(false);
    gl.depthMask(true);
  }

  clear() {
    this._pointCount = 0; this._debrisCount = 0; this._waveCount = 0;
    this._pointCursor = 0; this._debrisCursor = 0; this._waveCursor = 0;
    if (this.supported && !this._lost) {
      this.gl.depthMask(true);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    }
  }

  destroy() {
    if (this._destroyed) return;
    this.clear();
    this._releaseGL();
    this.canvas?.removeEventListener?.('webglcontextlost', this._contextLost);
    this.canvas?.removeEventListener?.('webglcontextrestored', this._contextRestored);
    this._motionMedia?.removeEventListener?.('change', this._motionChanged);
    this._destroyed = true;
    this.supported = false;
  }
}

export default EffectDirector;
