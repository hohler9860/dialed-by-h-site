/**
 * dbh-scene.js — faithful port of the BWC homepage scene (haoqi-adrive-rebuild
 * src/scene.js), reduced to the two features this page uses:
 *   1. sticker field — 121 die-cut watch stickers drifting with wind physics,
 *      tap-anywhere burst included
 *   2. dots overlay — scroll-driven halftone dissolve, clear → white
 *      (dim = 0 at hero and footer, 1 mid-page; exact formula + shader)
 * Constants are copied verbatim from the source. Glass/hello model, DOM image
 * layers, vignette, and dark theme are intentionally not ported.
 */
import * as THREE from './three-slim.js'

// artificial sky config — observed from the live bundle (verbatim)
const BG = {
  resolutionScale: 0.3,
  vignette: { radius: 0.354, falloff: 1, mix: 1, displace: 0, skew: 0.54, angle: 0 },
  swirl: { radius: 0.25, angle: 0.1, phase: 0, mix: 0.5 },
  sine: { mixRadius: 1, frequency: 0.35, amplitude: 1.18, rotation: 0 },
  shatter: { amount: 1, spread: 0.9, angleDeg: -45, skew: 0.9, mixRadius: 1, mixRadiusInvert: 0 },
  bokeh: { radius: 0.754, tilt: 0.5, trackMouse: 0 },
  smoothing: 0.1,
  leaveSmoothing: 0.05,
  colors: {
    light: { bg: '#ffead6', vignette: '#6196ff', output: '#acffb9', outputMix: 0.65, edgeIntensity: -0.16 },
    dark: { bg: '#2c4bd5', vignette: '#00000d', output: '#00344C', outputMix: 0.95, edgeIntensity: -0.82 },
  },
  restPos: new THREE.Vector2(0.5, -0.1),
}

const PARALLAX = { strength: 1.4, lag: 0.18, rotate: 0.12, leaveLag: 0.05 }
const CAM = { min: 24, max: 32, fovDesktop: 60, fovMobile: 38 }
const OVERLAY = { colors: ['#0F1111', '#FBFAF4'], pixelSize: 4, radiusScale: 0.9 }
const STICKERS = {
  poolCount: 119,
  urls: Array.from({ length: 121 }, (_, i) => `/assets/dbh/sticker_img/w_${String(i + 1).padStart(2, '0')}.webp`),
  fieldCount: 26,
  spawnWidth: 32,
  spawnHeight: 24,
  positionY: 24,
  fallDistance: 48,
  zDepth: 4,
  zOffset: -6,
  windStrength: 1.8,
  windFrequency: 0.3,
  scale: 3,
  rotationSpeed: 0.8,
  fallSpeed: 1.8,
}

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`

const DOTS_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;
uniform float uOpacity, uPixelSize, uRadiusScale;
uniform vec2 uResolution;
void main() {
  float a = clamp(uOpacity, 0.0, 1.0);
  vec2 px = vec2(uPixelSize / max(uResolution.x, 1.0), uPixelSize / max(uResolution.y, 1.0));
  vec2 cellUV = fract(vUv / max(px, vec2(1e-6)));
  float radius = uRadiusScale * a;
  float d = distance(cellUV, vec2(0.5));
  float aa = fwidth(d) * 1.5;
  float mask = smoothstep(radius, radius - aa, d);
  gl_FragColor = vec4(uColor, mask);
  #include <colorspace_fragment>
}
`

const VIGNETTE_FRAG = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform float uRadius, uFalloff, uEdgeIntensity;
uniform float uSkew, uAngle;
uniform vec2 uPos, uResolution;
uniform vec3 uVignetteColor, uClearColor;
mat2 rot(float a){ return mat2(cos(a),-sin(a),sin(a),cos(a)); }
void main() {
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 skew = vec2(uSkew, 1.0 - uSkew);
  float halfR = uRadius * 0.5;
  float inner = halfR - uFalloff * halfR * 0.5;
  float outer = halfR + uFalloff * halfR * 0.5;
  vec2 sUV = vUv * aspect * rot(uAngle * 6.28318530718) * skew;
  vec2 sPos = uPos * aspect * rot(uAngle * 6.28318530718) * skew;
  float falloff = smoothstep(inner, outer, distance(sUV, sPos));
  falloff = mix(falloff, 0.0, max(uEdgeIntensity, 0.0));
  falloff = mix(falloff, 1.0, max(-uEdgeIntensity, 0.0));
  gl_FragColor = vec4(mix(uClearColor, uVignetteColor, falloff), falloff);
}
`

const SWIRL_FRAG = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform sampler2D tInput;
uniform vec2 uResolution, uPos;
uniform float uRadius, uAngle, uPhase, uTime, uMix;
void main() {
  vec2 uv = vUv;
  float angle = uAngle * 10.0;
  vec2 orig = uv;
  uv -= uPos;
  vec2 R = vec2(uv.x * uResolution.x / uResolution.y, uv.y);
  float d = length(R);
  if (d <= uRadius) {
    float r = atan(R.y, R.x) + angle * smoothstep(uRadius, 0.0, d);
    uv = vec2(cos(r + uTime / 20.0 + uPhase * 6.28318530718), sin(r + uTime / 20.0 + uPhase * 6.28318530718));
    uv = d * uv + uPos;
  }
  float t = smoothstep(0.0, uRadius, d);
  gl_FragColor = texture2D(tInput, mix(vUv, mix(uv, orig, t), uMix));
}
`

const SINE_FRAG = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform sampler2D tInput;
uniform vec2 uResolution, uPos, uMousePos;
uniform float uMixRadius, uFrequency, uAmplitude, uRotation, uTime, uTrackMouse;
void main() {
  vec2 uv = vUv;
  vec2 w = vUv * 2.0 - 1.0;
  float time = uTime * 0.25;
  float freq = 20.0 * uFrequency;
  float amp = uAmplitude * 0.2;
  float wx = sin((w.y + uPos.y) * freq + time) * amp;
  float wy = sin((w.x - uPos.x) * freq + time) * amp;
  w += vec2(mix(wx, 0.0, uRotation), mix(0.0, wy, uRotation));
  vec2 fUV = w * 0.5 + 0.5;
  float aspect = uResolution.x / uResolution.y;
  vec2 mPos = uPos + mix(vec2(0.0), uMousePos - 0.5, uTrackMouse);
  float dist = max(0.0, 1.0 - distance(uv * vec2(aspect, 1.0), mPos * vec2(aspect, 1.0)) * 4.0 * (1.0 - uMixRadius));
  gl_FragColor = texture2D(tInput, mix(uv, fUV, dist));
}
`

const SHATTER_FRAG = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform sampler2D tInput;
uniform vec2 uResolution, uPos, uMousePos;
uniform float uAmount, uSpread, uAngle, uTime, uSkew, uCellScale, uMixRadius, uRoundness, uTrackMouse;
uniform int uMixRadiusInvert, uEasing;
vec2 random2(vec2 p){ return fract(sin(vec2(dot(p, vec2(127.1,311.7)), dot(p, vec2(269.5,183.3)))) * 43758.5453); }
mat2 rot(float a){ return mat2(cos(a),-sin(a),sin(a),cos(a)); }
float ease(int mode, float t){
  if (mode == 1) return 1.0 - (1.0 - t) * (1.0 - t);
  if (mode == 2) return t < 0.5 ? 4.0*t*t*t : 1.0 - pow(-2.0*t + 2.0, 3.0) / 2.0;
  return t;
}
void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / uResolution.y;
  vec2 skew = mix(vec2(1.0), vec2(1.0, 0.0), uSkew);
  vec2 st = (uv - uPos) * vec2(aspect, 1.0) * uCellScale * uAmount;
  st = st * rot(uAngle * 6.28318530718) * skew;
  vec2 i_st = floor(st);
  vec2 f_st = fract(st);
  float m1 = 15.0, m2 = 15.0;
  vec2 mPoint = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 nb = vec2(float(i), float(j));
      vec2 p = random2(i_st + nb);
      p = 0.5 + 0.5 * sin(5.0 + uTime * 0.2 + 6.2831 * p);
      float d = length(nb + p - f_st);
      if (d < m1) { m2 = m1; m1 = d; mPoint = p; }
      else if (d < m2) { m2 = d; }
    }
  }
  vec2 offset = (mPoint * 0.2 * uSpread * 2.0) - (uSpread * 0.2);
  float cornerSoft = smoothstep(0.0, max(0.0001, uRoundness) * 2.0, m2 - m1);
  offset *= smoothstep(0.0, max(0.0001, uRoundness), m1) * cornerSoft;
  vec2 mPos = uPos + mix(vec2(0.0), uMousePos - 0.5, uTrackMouse);
  float raw = max(0.0, 1.0 - distance(uv * vec2(aspect,1.0), mPos * vec2(aspect,1.0)) * 4.0 * (1.0 - uMixRadius));
  if (uMixRadiusInvert == 1) raw = 1.0 - raw;
  gl_FragColor = texture2D(tInput, uv + offset * ease(uEasing, raw));
}
`

const BOKEH_FRAG = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform sampler2D tInput, tBlueNoise;
uniform vec2 uResolution, uBlueNoiseResolution, uPos, uMousePos;
uniform float uAmount, uTilt, uTrackMouse;
#define PI2 6.28318530718
#define ITERATIONS 32.0
#define GOLDEN_ANGLE 2.39996323
vec2 samplePoint(in float theta, inout float r) {
  r += 1.0 / r;
  return (r - 1.0) * vec2(cos(theta), sin(theta));
}
float blueNoiseOffset(vec2 st) {
  vec2 ts = uBlueNoiseResolution;
  vec2 uv = fract(st * (uResolution / ts) * vec2(ts.x / ts.y, 1.0));
  return mod((texture2D(tBlueNoise, uv).r - 0.5) * PI2, PI2);
}
vec4 bokeh(sampler2D tex, vec2 uv, float radius) {
  vec3 acc = vec3(0.0);
  vec3 accW = vec3(0.0);
  float accA = 0.0;
  float aspect = uResolution.x / uResolution.y;
  vec2 base = vec2(1.0 / aspect, 1.0) * 0.04 * 0.075;
  float r = 1.0;
  float noise = (blueNoiseOffset(uv) - 0.5) * 0.01;
  float na = noise * PI2;
  mat2 rm = mat2(cos(na), -sin(na), sin(na), cos(na));
  for (float j = 0.0; j < GOLDEN_ANGLE * ITERATIONS; j += GOLDEN_ANGLE) {
    vec2 off = samplePoint(j, r) * base * radius;
    off *= 1.0 + 0.05 * (sin(j * 0.1) * 0.5 + 0.5) * sin(j * 0.7 + noise);
    vec4 c = texture2D(tex, uv + rm * off);
    vec3 w = vec3(5.0) + pow(c.rgb, vec3(9.0)) * 150.0;
    accA += c.a;
    acc += c.rgb * w;
    accW += w;
  }
  return vec4(acc / accW, accA / ITERATIONS);
}
void main() {
  if (uAmount == 0.0) { gl_FragColor = vec4(0.0); return; }
  vec2 pos = uPos + mix(vec2(0.0), uMousePos - 0.5, uTrackMouse);
  float dis = distance(vUv, pos) * 1000.0;
  float tilt = mix(1.0 - dis * 0.001, dis * 0.001, uTilt);
  gl_FragColor = bokeh(tInput, vUv, uAmount * tilt);
}
`

const OUTPUT_FRAG = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform sampler2D tInput;
uniform vec3 uBgColor, uOutputColor;
uniform float uOutputMix;
uniform float uOpacity;
vec3 overlayBlend(vec3 base, vec3 blend) {
  return mix(2.0 * base * blend, 1.0 - 2.0 * (1.0 - base) * (1.0 - blend), step(0.5, base));
}
void main() {
  vec3 base = mix(uBgColor, overlayBlend(uBgColor, vec3(1.0)), 0.61);
  vec4 inTex = texture2D(tInput, vUv);
  vec3 blend = clamp(inTex.rgb + uOutputColor * 0.35, 0.0, 1.0);
  gl_FragColor = vec4(base * mix(vec3(1.0), blend, clamp(uOutputMix, 0.0, 1.0)), uOpacity);
  #include <colorspace_fragment>
}
`

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const deg = (d) => (d * Math.PI) / 180
const cubic66 = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const isMobile = () => window.innerWidth < 1024

export function createScene({ host, bannerEl, footerEl }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  host.appendChild(renderer.domElement)
  renderer.domElement.style.display = 'block'

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200)
  const vh = () => Math.max(1, window.innerHeight)

  // scroll dim factor: 0 at hero/footer, 1 mid-page (exact source formula)
  let dim = 0
  function updateDim() {
    const v = vh()
    const b = bannerEl.getBoundingClientRect()
    const f = footerEl.getBoundingClientRect()
    const bannerBottom = b.top + b.height
    const t1 = clamp01((v - bannerBottom) / Math.max(1, v - 0.25 * v))
    const t2 = clamp01(f.top / v)
    dim = clamp01(t1 * t2)
  }

  // asset loading -----------------------------------------------------------
  const loadTotal = { count: 0, done: 0 }
  function track(promise) {
    loadTotal.count += 1
    promise.then(() => {
      loadTotal.done += 1
    })
    return promise
  }
  const texLoader = new THREE.TextureLoader()
  const loadTex = (url) =>
    new Promise((res) => {
      texLoader.load(
        url,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace
          res(t)
        },
        undefined,
        () => res(null),
      )
    })

  // artificial sky: background pipeline (vignette→swirl→sine→shatter→bokeh) --
  const bgScene = new THREE.Scene()
  const bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
  bgScene.add(bgQuad)

  const sharedPos = new THREE.Vector2().copy(BG.restPos) // lerped pointer for vignette/swirl/sine
  const sharedMouse = new THREE.Vector2().copy(BG.restPos)
  const timeU = { value: 0 }
  const bgRes = new THREE.Vector2(1, 1)

  const noiseSize = 128
  const noiseData = new Uint8ClampedArray(noiseSize * noiseSize * 4)
  for (let i = 0; i < noiseData.length; i += 4) {
    const v = Math.floor(255 * Math.random())
    noiseData[i] = noiseData[i + 1] = noiseData[i + 2] = v
    noiseData[i + 3] = 255
  }
  const blueNoise = new THREE.DataTexture(noiseData, noiseSize, noiseSize, THREE.RGBAFormat)
  blueNoise.needsUpdate = true
  blueNoise.wrapS = blueNoise.wrapT = THREE.RepeatWrapping

  const mkPass = (frag, uniforms) =>
    new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: frag,
      uniforms: {
        tInput: { value: null },
        uResolution: { value: bgRes },
        uTime: timeU,
        uPos: { value: sharedPos },
        uMousePos: { value: sharedMouse },
        uTrackMouse: { value: 1 },
        ...uniforms,
      },
      transparent: false,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })

  const themeBg = () => BG.colors.light
  const vignetteMat = mkPass(VIGNETTE_FRAG, {
    uRadius: { value: BG.vignette.radius },
    uFalloff: { value: BG.vignette.falloff },
    uSkew: { value: BG.vignette.skew },
    uAngle: { value: BG.vignette.angle },
    uEdgeIntensity: { value: themeBg().edgeIntensity },
    uVignetteColor: { value: new THREE.Color(themeBg().vignette) },
    uClearColor: { value: new THREE.Color(themeBg().bg) },
  })
  const swirlMat = mkPass(SWIRL_FRAG, {
    uRadius: { value: BG.swirl.radius },
    uAngle: { value: BG.swirl.angle },
    uPhase: { value: BG.swirl.phase },
    uMix: { value: BG.swirl.mix },
  })
  const sineMat = mkPass(SINE_FRAG, {
    uMixRadius: { value: BG.sine.mixRadius },
    uFrequency: { value: BG.sine.frequency },
    uAmplitude: { value: BG.sine.amplitude },
    uRotation: { value: BG.sine.rotation },
  })
  const shatterMat = mkPass(SHATTER_FRAG, {
    uAmount: { value: BG.shatter.amount },
    uSpread: { value: BG.shatter.spread },
    uAngle: { value: BG.shatter.angleDeg / 360 },
    uSkew: { value: BG.shatter.skew },
    uCellScale: { value: 16 },
    uMixRadius: { value: BG.shatter.mixRadius },
    uMixRadiusInvert: { value: BG.shatter.mixRadiusInvert },
    uEasing: { value: 1 },
    uRoundness: { value: 0.02 },
    uTrackMouse: { value: 0 },
    uPos: { value: new THREE.Vector2(0.5, 0.5) },
  })
  const bokehMat = mkPass(BOKEH_FRAG, {
    tBlueNoise: { value: blueNoise },
    uBlueNoiseResolution: { value: new THREE.Vector2(noiseSize, noiseSize) },
    uAmount: { value: 3.125 * BG.bokeh.radius },
    uTilt: { value: BG.bokeh.tilt },
    uTrackMouse: { value: BG.bokeh.trackMouse },
    uPos: { value: new THREE.Vector2().copy(BG.restPos) },
  })
  const bgPasses = [vignetteMat, swirlMat, sineMat, shatterMat, bokehMat]

  const outputMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: OUTPUT_FRAG,
    uniforms: {
      tInput: { value: null },
      uBgColor: { value: new THREE.Color(themeBg().bg) },
      uOutputColor: { value: new THREE.Color(themeBg().output) },
      uOutputMix: { value: themeBg().outputMix },
      uOpacity: { value: 0.55 },
    },
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    transparent: true,
  })
  const bgPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), outputMat)
  bgPlane.renderOrder = -10
  bgPlane.frustumCulled = false
  scene.add(bgPlane)
  bgPlane.visible = false // white homepage: sticker field only

  let bgRT = { read: null, write: null }
  function makeBgTargets() {
    bgRT.read?.dispose()
    bgRT.write?.dispose()
    const w = Math.max(1, Math.floor(window.innerWidth * BG.resolutionScale))
    const h = Math.max(1, Math.floor(window.innerHeight * BG.resolutionScale))
    bgRes.set(w, h)
    bgRT = {
      read: new THREE.WebGLRenderTarget(w, h, { depthBuffer: false }),
      write: new THREE.WebGLRenderTarget(w, h, { depthBuffer: false }),
    }
    renderer.setRenderTarget(bgRT.read)
    renderer.setClearColor(new THREE.Color(themeBg().bg), 1)
    renderer.clear()
    renderer.setRenderTarget(null)
    renderer.setClearColor(0x000000, 0)
  }

  const curBg = new THREE.Color(themeBg().bg)
  const curVig = new THREE.Color(themeBg().vignette)
  const curOut = new THREE.Color(themeBg().output)

  let bgFrame = 0
  function runBackground() {
    const t = themeBg()
    curBg.lerp(new THREE.Color(t.bg), BG.smoothing)
    curVig.lerp(new THREE.Color(t.vignette), BG.smoothing)
    curOut.lerp(new THREE.Color(t.output), BG.smoothing)
    vignetteMat.uniforms.uVignetteColor.value.copy(curVig)
    vignetteMat.uniforms.uClearColor.value.copy(curBg)
    vignetteMat.uniforms.uEdgeIntensity.value = t.edgeIntensity
    outputMat.uniforms.uBgColor.value.copy(curBg)
    outputMat.uniforms.uOutputColor.value.copy(curOut)
    outputMat.uniforms.uOutputMix.value = t.outputMix

    // pointer lerp
    const target = pointer.inside && !isMobile() ? pointer.uv : BG.restPos
    const k = pointer.inside ? BG.smoothing : BG.leaveSmoothing
    sharedPos.lerp(target, k)
    sharedMouse.copy(sharedPos)

    if (dim >= 0.98) return
    const cadence = Math.max(dim > 0.75 ? 4 : dim > 0.5 ? 2 : 1, 2)
    if (bgFrame++ % cadence !== 0) return
    for (const mat of bgPasses) {
      if (mat.uniforms.tInput) mat.uniforms.tInput.value = bgRT.read.texture
      bgQuad.material = mat
      renderer.setRenderTarget(bgRT.write)
      renderer.render(bgScene, bgCam)
      renderer.setRenderTarget(null)
      const tmp = bgRT.read
      bgRT.read = bgRT.write
      bgRT.write = tmp
    }
    outputMat.uniforms.tInput.value = bgRT.read.texture
  }

  // pointer (camera parallax + tap bursts) -----------------------------------
  const pointer = { uv: new THREE.Vector2(0.5, 0.5), inside: false }
  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.uv.set(e.clientX / Math.max(1, window.innerWidth), 1 - e.clientY / vh())
      pointer.inside = true
    },
    { passive: true },
  )
  document.documentElement.addEventListener('pointerleave', () => (pointer.inside = false))

  // stickers ------------------------------------------------------------------
  const stickerGroup = new THREE.Group()
  scene.add(stickerGroup)
  const stickerParticles = []
  const stickerMats = [] // { material, aspect }
  const stickerPlane = new THREE.PlaneGeometry(1, 1)
  // first handful gates readiness so the field has watches on frame one;
  // the other ~110 wait for full page load, then trickle in
  const addStickerTex = (url) =>
    loadTex(url).then((tex) => {
      if (!tex) return
      const img = tex.image
      stickerMats.push({
        material: new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.01, toneMapped: false }),
        aspect: img && img.height ? img.width / img.height : 1,
      })
      if (stickerParticles.length < STICKERS.fieldCount) spawnFieldSticker(true)
    })
  STICKERS.urls.slice(0, 8).forEach((url) => track(addStickerTex(url)))
  const loadRest = () => {
    STICKERS.urls.slice(8).forEach((url, i) => window.setTimeout(() => addStickerTex(url), i * 60))
  }
  if (document.readyState === 'complete') loadRest()
  else window.addEventListener('load', () => window.setTimeout(loadRest, 400), { once: true })

  function dealSticker(p) {
    if (!stickerMats.length) return
    const pick = stickerMats[Math.floor(Math.random() * stickerMats.length)]
    p.mesh.material = pick.material
    p.mesh.scale.set(pick.aspect * STICKERS.scale, STICKERS.scale, 1)
  }
  function spawnFieldSticker(initial = false) {
    const mesh = new THREE.Mesh(stickerPlane)
    const p = {
      mesh,
      fallSpeed: STICKERS.fallSpeed * (0.6 + 0.8 * Math.random()),
      rotationSpeed: (Math.random() - 0.5) * STICKERS.rotationSpeed * 2,
      windPhase: Math.random() * Math.PI * 2,
      windAmplitude: 0.3 + Math.random() * STICKERS.windStrength,
      baseX: 0,
    }
    dealSticker(p)
    respawnSticker(p, initial)
    stickerGroup.add(mesh)
    stickerParticles.push(p)
  }
  function respawnSticker(p, initial = false) {
    p.baseX = (Math.random() - 0.5) * STICKERS.spawnWidth
    const y = initial
      ? (Math.random() - 0.5) * (STICKERS.positionY + STICKERS.fallDistance)
      : STICKERS.positionY + Math.random() * STICKERS.spawnHeight
    p.mesh.position.set(p.baseX, y, (Math.random() - 0.5) * STICKERS.zDepth + STICKERS.zOffset)
    p.mesh.rotation.z = Math.random() * Math.PI * 2
    if (!initial) dealSticker(p) // new watch from the deck each cycle
  }

  const viewportWorldHeightAt = (z) => 2 * Math.tan(deg(camera.fov) / 2) * Math.abs(camera.position.z - z)

  const burstParticles = []
  const MAX_BURST = 90
  function spawnBurst(clientX, clientY) {
    if (!stickerMats.length) return
    const v = vh()
    const wH = viewportWorldHeightAt(STICKERS.zOffset)
    const wW = wH * (window.innerWidth / v)
    const wx = (clientX / window.innerWidth - 0.5) * wW
    const wy = (0.5 - clientY / v) * wH
    for (let i = 0; i < 3; i++) {
      const pick = stickerMats[Math.floor(Math.random() * stickerMats.length)]
      const mesh = new THREE.Mesh(stickerPlane, pick.material)
      mesh.scale.set(pick.aspect * STICKERS.scale, STICKERS.scale, 1)
      mesh.position.set(wx + (Math.random() - 0.5) * 3, wy + Math.random() * 1.5, STICKERS.zOffset + (Math.random() - 0.5) * 2)
      mesh.rotation.z = Math.random() * Math.PI * 2
      const p = {
        mesh,
        fallSpeed: STICKERS.fallSpeed * (0.6 + 0.8 * Math.random()),
        rotationSpeed: (Math.random() - 0.5) * STICKERS.rotationSpeed * 2,
        windPhase: Math.random() * Math.PI * 2,
        windAmplitude: 0.3 + Math.random() * STICKERS.windStrength,
        baseX: mesh.position.x,
        vy: 2.5 + Math.random() * 2,
      }
      stickerGroup.add(mesh)
      burstParticles.push(p)
    }
    while (burstParticles.length > MAX_BURST) {
      const old = burstParticles.shift()
      stickerGroup.remove(old.mesh)
    }
  }
  // tap/click anywhere spawns a burst (pointer events: iOS click is unreliable)
  window.addEventListener('mousedown', (e) => {
    if (e.detail > 1 && !e.target.closest('input,textarea,select,[contenteditable]')) e.preventDefault()
  })
  let tapStart = null
  window.addEventListener(
    'pointerdown',
    (e) => {
      tapStart = { x: e.clientX, y: e.clientY, t: performance.now() }
    },
    { passive: true },
  )
  window.addEventListener(
    'pointerup',
    (e) => {
      if (!tapStart) return
      const moved = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y)
      const held = performance.now() - tapStart.t
      tapStart = null
      if (moved > 12 || held > 450) return // scroll or hold, not a tap
      if (e.target.closest('a,button,input,textarea,select,summary,iframe,[role="button"],.pt-modal,.nav-icon,.header')) return
      spawnBurst(e.clientX, e.clientY)
    },
    { passive: true },
  )

  function updateStickers(time, dt) {
    const active = dim < 0.98
    stickerGroup.visible = active
    if (!active) return
    for (const p of stickerParticles) {
      p.mesh.position.y -= p.fallSpeed * dt
      p.mesh.position.x = p.baseX + Math.sin(time * STICKERS.windFrequency * Math.PI * 2 + p.windPhase) * p.windAmplitude
      p.mesh.rotation.z += p.rotationSpeed * dt
      if (p.mesh.position.y < -STICKERS.positionY) respawnSticker(p)
    }
    for (let i = burstParticles.length - 1; i >= 0; i--) {
      const p = burstParticles[i]
      p.vy = (p.vy ?? 0) - 6 * dt // gravity eases the pop into a fall
      p.mesh.position.y += Math.max(p.vy, -p.fallSpeed * 2.2) * dt
      p.mesh.position.x = p.baseX + Math.sin(time * STICKERS.windFrequency * Math.PI * 2 + p.windPhase) * p.windAmplitude
      p.mesh.rotation.z += p.rotationSpeed * dt
      if (p.mesh.position.y < -STICKERS.positionY - 4) {
        stickerGroup.remove(p.mesh)
        burstParticles.splice(i, 1)
      }
    }
  }

  // dots overlay ---------------------------------------------------------------
  const dotsMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: DOTS_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(OVERLAY.colors[1]) },
      uOpacity: { value: 0 },
      uPixelSize: { value: OVERLAY.pixelSize },
      uRadiusScale: { value: OVERLAY.radiusScale },
      uResolution: { value: new THREE.Vector2(1, 1) },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  const dotsPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), dotsMat)
  dotsPlane.renderOrder = 10
  dotsPlane.frustumCulled = false
  scene.add(dotsPlane)
  dotsPlane.visible = false // white homepage: sticker field only

  // camera rig -------------------------------------------------------------------
  let readyAt = null
  let dollyT = 0
  const parallaxCur = new THREE.Vector2()
  const lookCur = new THREE.Vector2()
  function updateCamera(dt) {
    const aspect = window.innerWidth / window.innerHeight
    const fovX = window.innerWidth >= 1024 ? CAM.fovDesktop : CAM.fovMobile
    const fovY = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(deg(fovX) / 2) / aspect))
    if (Math.abs(camera.fov - fovY) > 1e-4 || Math.abs(camera.aspect - aspect) > 1e-6) {
      camera.fov = fovY
      camera.aspect = aspect
      camera.updateProjectionMatrix()
    }
    const baseZ = THREE.MathUtils.lerp(CAM.min, CAM.max, dim)
    dollyT = readyAt !== null ? Math.min(dollyT + dt / 1.2, 1) : 0
    camera.position.z = THREE.MathUtils.lerp(baseZ + 8, baseZ, cubic66(dollyT))

    if (!isMobile()) {
      const ex = (0.5 - pointer.uv.x) * 2
      const ey = (pointer.uv.y - 0.5) * 2
      const tx = ex * PARALLAX.strength
      const ty = -ey * PARALLAX.strength * 0.6
      const lag = pointer.inside ? PARALLAX.lag : PARALLAX.leaveLag
      parallaxCur.lerp(new THREE.Vector2(tx, ty), lag)
      lookCur.lerp(new THREE.Vector2(-tx * PARALLAX.rotate, -ty * PARALLAX.rotate), lag)
      camera.position.x = parallaxCur.x
      camera.position.y = parallaxCur.y
      camera.lookAt(lookCur.x, lookCur.y, 0)
    } else {
      camera.position.x = 0
      camera.position.y = 0
      camera.lookAt(0, 0, 0)
    }
  }

  // resize -------------------------------------------------------------------
  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight)
    dotsMat.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight)
    makeBgTargets()
  }
  window.addEventListener('resize', resize)
  resize()

  // animate --------------------------------------------------------------------
  let announcedReady = false
  const clock = new THREE.Clock()
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1)
    const time = clock.elapsedTime
    if (!announcedReady && loadTotal.count > 0 && loadTotal.done >= loadTotal.count) {
      announcedReady = true
      readyAt = time
    }
    timeU.value = time
    updateDim()
    dotsMat.uniforms.uOpacity.value = dim
    runBackground()
    updateCamera(dt)
    updateStickers(time, dt)
    renderer.render(scene, camera)
  })

  return {
    renderer,
    get dim() {
      return dim
    },
  }
}

// boot ----------------------------------------------------------------------
const host = document.querySelector('.js-dbh-scene')
const bannerEl = document.querySelector('.dbh-hero')
const footerEl = document.querySelector('.js-footer')
if (host && bannerEl && footerEl) createScene({ host, bannerEl, footerEl })
