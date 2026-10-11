import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

/* The BimaSetu emblem rebuilt in 3D: two people joined by a bridge, a health shield at the centre, sun rays above.
   Coordinates follow the flat artwork (1 unit = 100px of public/bimasetu-mark.png, origin at the shield). */

const TAU = Math.PI * 2

type Stop = readonly [number, string]
type Hit = 'shield' | 'headL' | 'headR' | null

type Enter = {
  at: number
  dur: number
  /** Offset the part starts from. */
  d?: [number, number, number]
  /** Rotation the part starts from. */
  r?: [number, number, number]
  /** Scale the part starts from. */
  s0?: number
  /** easeOutBack overshoot; omit for a plain ease-out. */
  back?: number
}

type Part = {
  obj: THREE.Object3D
  base: { p: THREE.Vector3; r: THREE.Euler }
  enter: Enter
  /** Per-frame extras from idle motion and interaction, reset every frame. */
  off: { p: THREE.Vector3; r: THREE.Vector3; s: number }
}

export type LogoSceneOptions = {
  onReady?: () => void
}

const clamp = THREE.MathUtils.clamp
const easeOutCubic = (q: number) => 1 - (1 - q) ** 3
const easeInOutCubic = (q: number) => (q < 0.5 ? 4 * q ** 3 : 1 - (-2 * q + 2) ** 3 / 2)
const easeOutBack = (q: number, c1: number) => 1 + (c1 + 1) * (q - 1) ** 3 + c1 * (q - 1) ** 2

/** Bake a linear gradient into vertex colours, measured along `dir` in the XY plane. */
function paint<G extends THREE.BufferGeometry>(geo: G, stops: Stop[], dir: [number, number] = [1, 0]): G {
  const pos = geo.getAttribute('position')
  const proj = new Float32Array(pos.count)
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < pos.count; i++) {
    const v = pos.getX(i) * dir[0] + pos.getY(i) * dir[1]
    proj[i] = v
    lo = Math.min(lo, v)
    hi = Math.max(hi, v)
  }
  const cols = stops.map(([at, hex]) => [at, new THREE.Color(hex)] as const)
  const out = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const t = (proj[i] - lo) / (hi - lo || 1)
    let k = 0
    while (k < cols.length - 2 && t > cols[k + 1][0]) k++
    const [a, ca] = cols[k]
    const [b, cb] = cols[k + 1]
    c.copy(ca).lerp(cb, clamp((t - a) / (b - a), 0, 1))
    out[i * 3] = c.r
    out[i * 3 + 1] = c.g
    out[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(out, 3))
  return geo
}

function extrude(shape: THREE.Shape, depth: number, bevel: number) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.7,
    bevelSegments: 5,
    curveSegments: 40,
  })
  geo.translate(0, 0, -depth / 2)
  return geo
}

/* A diagonal band of light that sweeps across the whole emblem in screen space. One shared uniform drives every
   material, so the sweep reads as a single highlight passing over the logo. */
const shine = { uShine: { value: -10 } }
function withShine<M extends THREE.Material>(mat: M): M {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uShine = shine.uShine
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vShineXY;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvShineXY = (modelMatrix * vec4(transformed, 1.0)).xy;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vShineXY;\nuniform float uShine;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float shineD = dot(vShineXY, vec2(0.91, 0.42)) - uShine;
        totalEmissiveRadiance += vec3(0.9, 0.96, 1.0) * (0.7 * exp(-shineD * shineD * 45.0) + 0.12 * exp(-shineD * shineD * 3.0));`,
      )
  }
  return mat
}

function gloss(extra: THREE.MeshPhysicalMaterialParameters = {}) {
  return withShine(
    new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.26,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      ...extra,
    }),
  )
}

/** Wrap `obj` (built in emblem coordinates) in a group whose origin is (x, y, z), so it scales and turns about that point. */
function pivot(obj: THREE.Object3D, x: number, y: number, z = 0) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  obj.position.sub(g.position)
  g.add(obj)
  return g
}

/** Shield outline, scaled by `s` about its visual centre. */
function shieldShape(s: number) {
  const cy = 0.08
  const P = (x: number, y: number): [number, number] => [x * s, cy + (y - cy) * s]
  const sh = new THREE.Shape()
  sh.moveTo(...P(0, 0.9))
  sh.bezierCurveTo(...P(0.28, 0.74), ...P(0.58, 0.7), ...P(0.86, 0.74))
  sh.bezierCurveTo(...P(0.9, 0.05), ...P(0.62, -0.6), ...P(0, -0.92))
  sh.bezierCurveTo(...P(-0.62, -0.6), ...P(-0.9, 0.05), ...P(-0.86, 0.74))
  sh.bezierCurveTo(...P(-0.58, 0.7), ...P(-0.28, 0.74), ...P(0, 0.9))
  return sh
}

function crossShape(a = 0.3, w = 0.105) {
  const sh = new THREE.Shape()
  const pts: [number, number][] = [
    [-w, a], [w, a], [w, w], [a, w], [a, -w], [w, -w],
    [w, -a], [-w, -a], [-w, -w], [-a, -w], [-a, w], [-w, w],
  ]
  sh.moveTo(...pts[0])
  for (const p of pts.slice(1)) sh.lineTo(...p)
  sh.closePath()
  return sh
}

/** A person's body sweeping from the bridge foot up to the shield. m = 1 is the left figure, -1 mirrors it. */
function swooshShape(m: 1 | -1) {
  const P = (x: number, y: number): [number, number] => [x * m, y]
  const sh = new THREE.Shape()
  sh.moveTo(...P(-2.62, -1.63))
  sh.bezierCurveTo(...P(-2.66, -0.78), ...P(-2.15, -0.3), ...P(-1.55, -0.1))
  sh.bezierCurveTo(...P(-1.2, 0.0), ...P(-0.98, 0.18), ...P(-0.76, 0.36))
  sh.quadraticCurveTo(...P(-0.66, 0.2), ...P(-0.74, 0.02))
  sh.bezierCurveTo(...P(-1.0, -0.2), ...P(-1.32, -0.36), ...P(-1.62, -0.5))
  sh.bezierCurveTo(...P(-1.98, -0.68), ...P(-2.16, -1.05), ...P(-2.16, -1.63))
  sh.closePath()
  return sh
}

function leafShape(len: number) {
  const w = len * 0.46
  const sh = new THREE.Shape()
  sh.moveTo(0, 0)
  sh.bezierCurveTo(w, len * 0.15, w * 0.9, len * 0.7, 0, len)
  sh.bezierCurveTo(-w * 0.9, len * 0.7, -w, len * 0.15, 0, 0)
  return sh
}

/** Top edge of the bridge deck at x (the deck's upper curve is a symmetric quadratic). */
function deckTop(x: number) {
  const t = (x + 2.62) / 5.24
  return (1 - t) ** 2 * -1.63 + 2 * t * (1 - t) * -0.2 + t * t * -1.63
}

function dotTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function mountLogoScene(canvas: HTMLCanvasElement, stage: HTMLElement, opts: LogoSceneOptions = {}) {
  // Throws when WebGL is unavailable; the caller falls back to the flat mark.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.05

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const motion = reduced ? 0 : 1

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const envTex = pmrem.fromScene(room, 0.04).texture
  room.dispose()
  scene.environment = envTex
  scene.environmentIntensity = 0.55

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100)

  scene.add(new THREE.HemisphereLight('#ffffff', '#1d3557', 0.7))
  const key = new THREE.DirectionalLight('#ffffff', 1.5)
  key.position.set(2.5, 4, 6)
  scene.add(key)
  const rim = new THREE.DirectionalLight('#9fe8ff', 1.2)
  rim.position.set(-4, 2, -3)
  scene.add(rim)
  // A soft highlight that tracks the pointer, so the gloss moves as you look around.
  const glint = new THREE.PointLight('#ffffff', 1.3, 0, 0)
  glint.position.set(0, 1, 4)
  scene.add(glint)

  const root = new THREE.Group()
  scene.add(root)
  const parts: Part[] = []
  const add = (obj: THREE.Object3D, enter: Enter, parent: THREE.Object3D = root) => {
    parent.add(obj)
    const part: Part = {
      obj,
      base: { p: obj.position.clone(), r: obj.rotation.clone() },
      enter,
      off: { p: new THREE.Vector3(), r: new THREE.Vector3(), s: 1 },
    }
    parts.push(part)
    return part
  }

  /* ── bridge deck ── */
  const deckShape = new THREE.Shape()
  deckShape.moveTo(-2.62, -1.63)
  deckShape.quadraticCurveTo(0, -0.2, 2.62, -1.63)
  deckShape.lineTo(2.1, -1.63)
  deckShape.quadraticCurveTo(0, -0.72, -2.1, -1.63)
  deckShape.closePath()
  const deckG = new THREE.Group()
  deckG.add(
    new THREE.Mesh(
      paint(extrude(deckShape, 0.42, 0.06), [
        [0, '#0b4fc4'],
        [0.5, '#22c8e8'],
        [1, '#10a99a'],
      ]),
      gloss(),
    ),
  )
  const railPts = Array.from({ length: 24 }, (_, i) => {
    const x = -2.3 + (4.6 * i) / 23
    return new THREE.Vector3(x, deckTop(x) - 0.03, 0.27)
  })
  deckG.add(
    new THREE.Mesh(
      paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 96, 0.03, 10), [
        [0, '#5fb6ff'],
        [0.5, '#9ff3ff'],
        [1, '#6fe6c8'],
      ]),
      gloss({ roughness: 0.2 }),
    ),
  )
  add(pivot(deckG, 0, -1.4), { at: 0, dur: 0.9, d: [0, -0.8, 0], s0: 0.6, back: 1.4 })

  /* ── towers and suspension cables ── */
  const rigging = (m: 1 | -1) => {
    const g = new THREE.Group()
    const stops: Stop[] = m > 0 ? [[0, '#1660d8'], [1, '#3aa6f5']] : [[0, '#12a58e'], [1, '#45cf7f']]
    const mat = gloss({ roughness: 0.34 })
    for (const [x, top] of [
      [-1.66, -0.7],
      [-1.18, -0.32],
    ]) {
      const bottom = deckTop(x) - 0.06
      const tower = new THREE.Mesh(paint(new RoundedBoxGeometry(0.12, top - bottom, 0.16, 2, 0.035), stops, [0, 1]), mat)
      tower.position.set(x * m, (top + bottom) / 2, -0.04)
      g.add(tower)
    }
    const cable = new THREE.CatmullRomCurve3(
      [
        [-2.12, -1.02],
        [-1.89, -0.9],
        [-1.66, -0.7],
        [-1.42, -0.6],
        [-1.18, -0.32],
        [-0.99, -0.26],
        [-0.78, -0.12],
      ].map(([x, y]) => new THREE.Vector3(x * m, y, 0.03)),
      false,
      'centripetal',
    )
    g.add(new THREE.Mesh(paint(new THREE.TubeGeometry(cable, 120, 0.022, 8), stops, [m * -1, 0]), mat))
    const samples = cable.getPoints(240)
    for (const x of [-1.89, -1.42, -0.99]) {
      const top = samples.reduce((best, p) => (Math.abs(p.x - x * m) < Math.abs(best.x - x * m) ? p : best)).y
      const bottom = deckTop(x)
      const hanger = new THREE.Mesh(paint(new THREE.CylinderGeometry(0.014, 0.014, top - bottom, 8), stops, [0, 1]), mat)
      hanger.position.set(x * m, (top + bottom) / 2, 0.03)
      g.add(hanger)
    }
    return g
  }
  add(pivot(rigging(1), -1.4, -1.15), { at: 0.35, dur: 0.7, s0: 0, back: 1.2 })
  add(pivot(rigging(-1), 1.4, -1.15), { at: 0.42, dur: 0.7, s0: 0, back: 1.2 })

  /* ── the two people ── */
  const body = (m: 1 | -1, stops: Stop[]) =>
    new THREE.Mesh(paint(extrude(swooshShape(m), 0.36, 0.07), stops, [0.45 * m, 1]), gloss())
  const swooshL = body(1, [
    [0, '#0b4fc4'],
    [1, '#3a9dff'],
  ])
  swooshL.position.z = 0.04
  const swooshR = body(-1, [
    [0, '#0e9e8f'],
    [0.55, '#3cc46a'],
    [1, '#a3e04c'],
  ])
  swooshR.position.z = 0.04
  add(pivot(swooshL, -2.4, -1.63), { at: 0.2, dur: 1.0, r: [0, 0, 0.9], s0: 0.4, back: 1.3 })
  add(pivot(swooshR, 2.4, -1.63), { at: 0.28, dur: 1.0, r: [0, 0, -0.9], s0: 0.4, back: 1.3 })

  const head = (x: number, stops: Stop[]) => {
    const mesh = new THREE.Mesh(paint(new THREE.SphereGeometry(0.27, 48, 32), stops, [0, 1]), gloss())
    mesh.position.set(x, 0.1, 0.08)
    return mesh
  }
  const headL = head(-1.86, [
    [0, '#0e5bd6'],
    [1, '#4fabff'],
  ])
  const headR = head(1.86, [
    [0, '#2fb35a'],
    [1, '#a8e45e'],
  ])
  const headLP = add(headL, { at: 0.8, dur: 0.65, d: [0, 1.1, 0], s0: 0, back: 2 })
  const headRP = add(headR, { at: 0.9, dur: 0.65, d: [0, 1.1, 0], s0: 0, back: 2 })

  /* ── shield with cross ── */
  const shieldG = new THREE.Group()
  shieldG.position.set(0, 0.02, 0.5)
  const shieldMat = gloss({ emissive: '#2f7dff', emissiveIntensity: 0 })
  shieldG.add(
    new THREE.Mesh(
      paint(extrude(shieldShape(1), 0.3, 0.07), [
        [0, '#1268e0'],
        [0.5, '#17a9e0'],
        [1, '#4fd27a'],
      ]),
      shieldMat,
    ),
  )
  const inner = new THREE.Mesh(
    paint(
      extrude(shieldShape(0.8), 0.04, 0.03),
      [
        [0, '#d9effc'],
        [1, '#ffffff'],
      ],
      [0, 1],
    ),
    gloss({ roughness: 0.22 }),
  )
  inner.position.z = 0.22
  shieldG.add(inner)
  const crossMat = gloss({ emissive: '#14b8a6', emissiveIntensity: 0 })
  const cross = new THREE.Mesh(
    paint(
      extrude(crossShape(), 0.1, 0.035),
      [
        [0, '#0f8fd0'],
        [1, '#13b59a'],
      ],
      [1, -1],
    ),
    crossMat,
  )
  cross.position.set(0, 0.06, 0.31)
  const ringMat = new THREE.MeshBasicMaterial({
    color: '#8fe9ff',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.02, 96), ringMat)
  ring.position.set(0, 0.06, 0.1)
  ring.visible = false
  shieldG.add(ring)
  const shieldP = add(shieldG, { at: 0.7, dur: 1.0, d: [0, 2.2, 0.6], r: [0, -Math.PI, 0], s0: 0.3, back: 1.5 })
  const crossP = add(cross, { at: 1.25, dur: 0.6, r: [0, 0, -Math.PI / 2], s0: 0, back: 2.2 }, shieldG)

  /* ── sun rays ── */
  const rayMat = withShine(
    new THREE.MeshPhysicalMaterial({
      color: '#f7a93a',
      emissive: '#ff8a00',
      emissiveIntensity: 0.35,
      roughness: 0.35,
      clearcoat: 1,
    }),
  )
  const rayGeo = new THREE.CapsuleGeometry(0.05, 0.22, 6, 16)
  const rays = (
    [
      [-0.8, 1.2, 0.73],
      [0, 1.5, 0],
      [0.8, 1.2, -0.73],
    ] as const
  ).map(([x, y, rz], i) => {
    const ray = new THREE.Mesh(rayGeo, rayMat)
    ray.position.set(x, y, 0.1)
    ray.rotation.z = rz
    return add(ray, { at: 1.45 + i * 0.08, dur: 0.45, s0: 0, back: 2.4 })
  })

  /* ── leaves ── */
  const leaves = (
    [
      [-2.66, -1.22, 0.69, 0.52, [[0, '#3cbf6a'], [1, '#9be05a']]],
      [-2.7, -1.55, 1.02, 0.56, [[0, '#0fa3b8'], [1, '#5fe0d8']]],
      [2.66, -1.22, -0.69, 0.52, [[0, '#5cc63f'], [1, '#b4e84a']]],
      [2.7, -1.55, -1.02, 0.56, [[0, '#14b07a'], [1, '#58d68d']]],
    ] as const
  ).map(([x, y, rz, len, stops], i) => {
    const g = new THREE.Group()
    g.position.set(x, y, 0)
    g.rotation.z = rz
    g.add(new THREE.Mesh(paint(extrude(leafShape(len), 0.04, 0.025), stops as unknown as Stop[], [0, 1]), gloss()))
    return add(g, { at: 1.0 + i * 0.08, dur: 0.7, r: [0, 0, Math.sign(rz) * 0.6], s0: 0, back: 1.8 })
  })

  /* ── drifting sparkles (outside the spinning group) ── */
  const N = 42
  const pPos = new Float32Array(N * 3)
  const pCol = new Float32Array(N * 3)
  const pSpeed = new Float32Array(N)
  const palette = ['#f7a93a', '#7fe3ff', '#9be05a'].map((h) => new THREE.Color(h))
  for (let i = 0; i < N; i++) {
    pPos.set([THREE.MathUtils.randFloat(-3.4, 3.4), THREE.MathUtils.randFloat(-1.7, 2), THREE.MathUtils.randFloat(-1.2, 0.2)], i * 3)
    const c = palette[i % palette.length]
    pCol.set([c.r, c.g, c.b], i * 3)
    pSpeed[i] = THREE.MathUtils.randFloat(0.08, 0.24)
  }
  const pGeo = new THREE.BufferGeometry()
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3))
  const dotTex = dotTexture()
  const pMat = new THREE.PointsMaterial({
    size: 0.09,
    map: dotTex,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
  const sparkles = new THREE.Points(pGeo, pMat)
  sparkles.visible = !reduced
  scene.add(sparkles)

  /* ── sizing ── */
  const FIT_W = 7.0
  const FIT_H = 3.95
  const resize = () => {
    const w = stage.clientWidth
    const h = stage.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const dist = Math.max(FIT_H / 2 / tanV, FIT_W / 2 / (tanV * camera.aspect))
    camera.position.set(0, 0, dist + 0.7)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }
  resize()

  /* ── state ── */
  let t = reduced ? 10 : 0 // timeline seconds; reduced motion starts fully assembled
  let aimX = 0
  let aimY = 0
  let lastAim = -10
  let tiltX = 0
  let tiltY = 0
  let spin = 0
  let spinV = 0
  let dragging = false
  let moved = false
  let downX = 0
  let downY = 0
  let lastX = 0
  let lastMoveT = 0
  let downHit: Hit = null
  let hover: Hit = null
  const hoverAmt = { shield: 0, headL: 0, headR: 0 }
  let shieldHit = -10
  const hop = { headL: -10, headR: -10 }
  let readySent = false
  let nextShine = 2.2 // first sweep lands just after the emblem assembles
  let shineAt = -10

  const tmp = new THREE.Vector3()
  const apply = (p: Part) => {
    const e = p.enter
    const q = clamp((t - e.at) / e.dur, 0, 1)
    const k = e.back ? easeOutBack(q, e.back) : easeOutCubic(q)
    const inv = 1 - k
    p.obj.position.copy(p.base.p).add(p.off.p)
    if (e.d) p.obj.position.add(tmp.set(e.d[0], e.d[1], e.d[2]).multiplyScalar(inv))
    const r = e.r ?? [0, 0, 0]
    p.obj.rotation.set(
      p.base.r.x + p.off.r.x + r[0] * inv,
      p.base.r.y + p.off.r.y + r[1] * inv,
      p.base.r.z + p.off.r.z + r[2] * inv,
    )
    const s0 = e.s0 ?? 1
    p.obj.scale.setScalar(Math.max(1e-4, (s0 + (1 - s0) * k) * p.off.s))
  }

  let raf = 0
  let last = 0
  const frame = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    t += dt
    const ease = (rate: number) => 1 - Math.exp(-dt * rate)

    // Look toward the pointer; after a few quiet seconds, drift on its own.
    const autoLook = t - lastAim > 3
    const wantY = autoLook ? motion * 0.22 * Math.sin(t * 0.5) : aimX * 0.42
    const wantX = autoLook ? motion * 0.06 * Math.sin(t * 0.7) : -aimY * 0.22
    tiltY += (wantY - tiltY) * ease(5)
    tiltX += (wantX - tiltX) * ease(5)

    // Flick to spin; a spring settles it back to face front.
    if (!dragging) {
      spinV += (Math.round(spin / TAU) * TAU - spin) * 28 * dt
      spinV *= Math.exp(-dt * 4.2)
      spin += spinV * dt
    }
    root.rotation.set(tiltX, tiltY + spin, 0)
    root.position.y = motion * 0.05 * Math.sin(t * 1.3)

    for (const p of parts) {
      p.off.p.set(0, 0, 0)
      p.off.r.set(0, 0, 0)
      p.off.s = 1
    }

    // idle life
    leaves.forEach((p, i) => (p.off.r.z += motion * 0.09 * Math.sin(t * 1.7 + i * 1.3)))
    rays.forEach((p, i) => (p.off.s *= 1 + motion * 0.12 * Math.sin(t * 2.4 - i * 0.8)))
    headLP.off.p.y += motion * 0.03 * Math.sin(t * 1.6)
    headRP.off.p.y += motion * 0.03 * Math.sin(t * 1.6 + Math.PI)

    // hover
    for (const k of ['shield', 'headL', 'headR'] as const) hoverAmt[k] += ((hover === k ? 1 : 0) - hoverAmt[k]) * ease(10)
    shieldP.off.s *= 1 + 0.05 * hoverAmt.shield
    shieldMat.emissiveIntensity = 0.35 * hoverAmt.shield
    headLP.off.s *= 1 + 0.12 * hoverAmt.headL
    headRP.off.s *= 1 + 0.12 * hoverAmt.headR

    // shield tap: bounce, spin the cross, send out a ring, flare the sun
    const ks = t - shieldHit
    if (ks < 2) {
      shieldP.off.s *= 1 + 0.16 * Math.exp(-5 * ks) * Math.sin(14 * ks)
      crossP.off.r.y += TAU * easeInOutCubic(Math.min(ks / 0.9, 1))
      crossMat.emissiveIntensity = 0.6 * Math.exp(-3 * ks)
      rays.forEach((p) => (p.off.s *= 1 + 0.7 * Math.exp(-4 * ks) * Math.min(ks * 12, 1)))
      const q = Math.min(ks / 1.1, 1)
      ring.visible = q < 1
      ring.scale.setScalar(1 + 1.4 * easeOutCubic(q))
      ringMat.opacity = 0.6 * (1 - q) ** 1.5
    }

    // head tap: a little hop
    for (const [k, p] of [
      ['headL', headLP],
      ['headR', headRP],
    ] as const) {
      const kh = t - hop[k]
      if (kh < 0.7) {
        const q = kh / 0.7
        p.off.p.y += 0.42 * Math.sin(Math.PI * q)
        p.off.s *= 1 + 0.08 * Math.sin(TAU * q)
      }
    }

    for (const p of parts) apply(p)

    // shine sweep: every few seconds, and on every shield tap
    if (motion && t >= nextShine) {
      shineAt = t
      nextShine = t + 4.5
    }
    const sweep = (t - shineAt) / 1.3
    shine.uShine.value = sweep < 1 ? -4.2 + 8.4 * easeInOutCubic(sweep) : -10

    glint.position.set(autoLook ? 4 * Math.sin(t * 0.6) : aimX * 4, autoLook ? 1.5 : 1 + aimY * 2.5, 4)

    if (sparkles.visible) {
      pMat.opacity = 0.8 * clamp((t - 1.6) / 1.2, 0, 1)
      for (let i = 0; i < N; i++) {
        let y = pPos[i * 3 + 1] + pSpeed[i] * dt
        if (y > 2.1) y = -1.7
        pPos[i * 3 + 1] = y
        pPos[i * 3] += Math.sin(t * 0.8 + i) * 0.002
      }
      pGeo.attributes.position.needsUpdate = true
    }

    stage.style.setProperty('--hx', tiltY.toFixed(3))
    stage.style.setProperty('--hy', tiltX.toFixed(3))

    renderer.render(scene, camera)
    if (!readySent) {
      readySent = true
      opts.onReady?.()
    }
    raf = requestAnimationFrame(frame)
  }

  /* ── input ── */
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const targets: [Exclude<Hit, null>, THREE.Object3D][] = [
    ['shield', shieldG],
    ['headL', headL],
    ['headR', headR],
  ]
  const pick = (e: PointerEvent): Hit => {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const hits = ray.intersectObjects(
      targets.map(([, o]) => o),
      true,
    )
    for (let o: THREE.Object3D | null = hits[0]?.object ?? null; o; o = o.parent) {
      const match = targets.find(([, obj]) => obj === o)
      if (match) return match[0]
    }
    return null
  }
  const setHover = (h: Hit) => {
    hover = h
    canvas.style.cursor = dragging ? 'grabbing' : h ? 'pointer' : 'grab'
  }

  const ac = new AbortController()
  const { signal } = ac
  window.addEventListener(
    'pointermove',
    (e) => {
      const r = stage.getBoundingClientRect()
      aimX = clamp((e.clientX - (r.left + r.width / 2)) / (r.width * 0.75), -1, 1)
      aimY = clamp(-(e.clientY - (r.top + r.height / 2)) / (r.height * 1.6), -1, 1)
      lastAim = t
      if (!dragging) return
      const now = performance.now()
      const d = (e.clientX - lastX) * 0.011
      spin += d
      spinV = clamp(d / Math.max((now - lastMoveT) / 1000, 1 / 120), -30, 30)
      lastX = e.clientX
      lastMoveT = now
      if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 6) moved = true
    },
    { signal },
  )
  canvas.addEventListener('pointermove', (e) => !dragging && setHover(pick(e)), { signal })
  canvas.addEventListener('pointerleave', () => !dragging && setHover(null), { signal })
  canvas.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return
      dragging = true
      moved = false
      downX = lastX = e.clientX
      downY = e.clientY
      lastMoveT = performance.now()
      downHit = pick(e)
      spinV = 0
      canvas.setPointerCapture(e.pointerId)
      setHover(downHit)
    },
    { signal },
  )
  const release = (e: PointerEvent) => {
    if (!dragging) return
    dragging = false
    if (performance.now() - lastMoveT > 70) spinV = 0
    if (!moved) {
      if (downHit === 'shield') {
        shieldHit = shineAt = t
        nextShine = t + 4.5
      } else if (downHit) hop[downHit] = t
      else spinV = 9 // a tap on empty space gives it a playful wobble
    }
    setHover(e.type === 'pointercancel' ? null : pick(e))
  }
  canvas.addEventListener('pointerup', release, { signal })
  canvas.addEventListener('pointercancel', release, { signal })
  canvas.style.cursor = 'grab'

  /* ── run only while on screen ── */
  let visible = false
  const sync = () => {
    const run = visible && !document.hidden
    if (run && !raf) {
      last = performance.now()
      raf = requestAnimationFrame(frame)
    } else if (!run && raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    sync()
  })
  io.observe(stage)
  const ro = new ResizeObserver(resize)
  ro.observe(stage)
  document.addEventListener('visibilitychange', sync, { signal })

  return () => {
    cancelAnimationFrame(raf)
    raf = 0
    ac.abort()
    io.disconnect()
    ro.disconnect()
    const mats = new Set<THREE.Material>()
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose()
        ;(Array.isArray(o.material) ? o.material : [o.material]).forEach((m: THREE.Material) => mats.add(m))
      }
    })
    mats.forEach((m) => m.dispose())
    dotTex.dispose()
    envTex.dispose()
    pmrem.dispose()
    renderer.dispose()
  }
}
