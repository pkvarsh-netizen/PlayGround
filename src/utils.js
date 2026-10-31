import * as THREE from 'three'

export const TAU = Math.PI * 2
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
export const lerp = (a, b, t) => a + (b - a) * t
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt))
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a)
export const randInt = (a, b) => Math.floor(rand(a, b + 1))
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
export const chance = (p) => Math.random() < p
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz)

export function wrapAngle(a) {
  return ((a + Math.PI) % TAU + TAU) % TAU - Math.PI
}

export function dampAngle(a, b, lambda, dt) {
  const d = wrapAngle(b - a)
  return a + d * (1 - Math.exp(-lambda * dt))
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function finishTexture(canvas, repeat = 1) {
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.anisotropy = 4
  return t
}

export function asphaltTexture() {
  const c = makeCanvas(512, 512)
  const x = c.getContext('2d')
  x.fillStyle = '#2b2c30'
  x.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 22000; i++) {
    const g = 20 + Math.random() * 45
    x.fillStyle = `rgba(${g},${g},${g + 3},${Math.random() * 0.5})`
    x.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 2)
  }
  for (let i = 0; i < 12; i++) {
    x.strokeStyle = `rgba(15,15,17,${0.25 + Math.random() * 0.3})`
    x.lineWidth = 0.6 + Math.random()
    x.beginPath()
    let px = Math.random() * 512
    let py = Math.random() * 512
    x.moveTo(px, py)
    for (let s = 0; s < 6; s++) {
      px += (Math.random() - 0.5) * 60
      py += Math.random() * 30
      x.lineTo(px, py)
    }
    x.stroke()
  }
  return finishTexture(c, 90)
}

export function concreteTexture() {
  const c = makeCanvas(256, 256)
  const x = c.getContext('2d')
  x.fillStyle = '#8b8b8f'
  x.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 7000; i++) {
    const g = 110 + Math.random() * 50
    x.fillStyle = `rgba(${g},${g},${g},${Math.random() * 0.4})`
    x.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5)
  }
  x.strokeStyle = 'rgba(60,60,64,0.55)'
  x.lineWidth = 1.5
  for (let i = 0; i <= 4; i++) {
    x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, 256); x.stroke()
    x.beginPath(); x.moveTo(0, i * 64); x.lineTo(256, i * 64); x.stroke()
  }
  return finishTexture(c, 1)
}

export function sandTexture() {
  const c = makeCanvas(256, 256)
  const x = c.getContext('2d')
  x.fillStyle = '#c9aa78'
  x.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 14000; i++) {
    const g = Math.random()
    x.fillStyle = g > 0.5 ? 'rgba(235,214,170,0.35)' : 'rgba(130,104,68,0.28)'
    x.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5)
  }
  for (let i = 0; i < 10; i++) {
    x.strokeStyle = 'rgba(150,124,86,0.25)'
    x.beginPath()
    x.moveTo(0, Math.random() * 256)
    x.bezierCurveTo(80, Math.random() * 256, 160, Math.random() * 256, 256, Math.random() * 256)
    x.stroke()
  }
  return finishTexture(c, 20)
}

export function grassTexture() {
  const c = makeCanvas(256, 256)
  const x = c.getContext('2d')
  x.fillStyle = '#3e6534'
  x.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 16000; i++) {
    const g = Math.random()
    x.fillStyle = g > 0.5 ? 'rgba(100,140,70,0.5)' : 'rgba(30,55,28,0.5)'
    x.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 2.5)
  }
  return finishTexture(c, 30)
}

// Architectural facade: 3 window bays by 2 floors per texture tile.
export function facadeTextures(style) {
  const size = 256
  const base = makeCanvas(size, size)
  const emit = makeCanvas(size, size)
  const b = base.getContext('2d')
  const e = emit.getContext('2d')
  b.fillStyle = '#ffffff'
  b.fillRect(0, 0, size, size)
  e.fillStyle = '#000000'
  e.fillRect(0, 0, size, size)

  const palettes = [
    { wall: '#9aa2ac', mullion: '#5d6670', glass: '#33404d', light: '#ffd9a0' },
    { wall: '#c0ab92', mullion: '#7e6d5a', glass: '#3a3d42', light: '#ffe0a8' },
    { wall: '#8f6a5c', mullion: '#5f443c', glass: '#332f33', light: '#ffc987' },
    { wall: '#a8b3b5', mullion: '#606e72', glass: '#2f4148', light: '#bfe8ff' }
  ]
  const p = palettes[style % palettes.length]
  b.fillStyle = p.wall
  b.fillRect(0, 0, size, size)
  // subtle facade grain
  for (let i = 0; i < 1800; i++) {
    b.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`
    b.fillRect(Math.random() * size, Math.random() * size, 2, 2)
  }
  const cols = 3
  const rows = 2
  for (let r = 0; r < rows; r++) {
    for (let cIdx = 0; cIdx < cols; cIdx++) {
      const w = size / cols
      const h = size / rows
      const x0 = cIdx * w + w * 0.16
      const y0 = r * h + h * 0.18
      const ww = w * 0.68
      const hh = h * 0.58
      b.fillStyle = p.mullion
      b.fillRect(x0 - 3, y0 - 3, ww + 6, hh + 6)
      b.fillStyle = p.glass
      b.fillRect(x0, y0, ww, hh)
      b.fillStyle = 'rgba(255,255,255,0.09)'
      b.fillRect(x0, y0, ww, hh * 0.22)
      if (Math.random() < 0.48) {
        const lit = p.light
        e.fillStyle = lit
        e.fillRect(x0, y0, ww, hh)
        e.fillStyle = 'rgba(0,0,0,0.35)'
        e.fillRect(x0 + ww * 0.46, y0, ww * 0.08, hh)
      }
      if (style === 1) {
        // balconies
        b.fillStyle = 'rgba(45,40,36,0.55)'
        b.fillRect(x0 - 8, y0 + hh + 4, ww + 16, 7)
      }
    }
    // floor slab
    b.fillStyle = 'rgba(40,42,45,0.32)'
    b.fillRect(0, r * (size / rows) + size / rows - 7, size, 6)
  }
  return { map: finishTexture(base), emissive: finishTexture(emit) }
}

export function neonTexture(text, color = '#ff4fa3') {
  const c = makeCanvas(512, 128)
  const x = c.getContext('2d')
  x.clearRect(0, 0, 512, 128)
  x.font = 'bold 64px Arial Black, Arial, sans-serif'
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.shadowColor = color
  x.shadowBlur = 26
  x.fillStyle = color
  x.fillText(text, 256, 66)
  x.shadowBlur = 10
  x.fillStyle = '#ffffff'
  x.globalAlpha = 0.85
  x.fillText(text, 256, 66)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}


export function shopTexture(kind = 0) {
  const c = makeCanvas(256, 128)
  const x = c.getContext('2d')
  const schemes = [
    { wall: '#241a17', glass: ['#ffd59a', '#e8873f'], label: 'OPEN', sign: '#ff4f7d' },
    { wall: '#141d22', glass: ['#b9f0ff', '#3a8ea8'], label: 'BAR', sign: '#5ce5ff' },
    { wall: '#1d1a14', glass: ['#ffe6a8', '#c9a24b'], label: '24/7', sign: '#ffd24a' },
    { wall: '#20161c', glass: ['#ffc0e0', '#a34577'], label: 'NOODLES', sign: '#ff77b8' }
  ]
  const s = schemes[kind % schemes.length]
  x.fillStyle = s.wall
  x.fillRect(0, 0, 256, 128)
  const g = x.createLinearGradient(0, 10, 0, 118)
  g.addColorStop(0, s.glass[0])
  g.addColorStop(1, s.glass[1])
  x.fillStyle = g
  x.fillRect(10, 24, 236, 96)
  // interior silhouettes
  x.fillStyle = 'rgba(40,20,10,0.4)'
  for (let i = 0; i < 4; i++) x.fillRect(26 + i * 56, 84, 30, 26)
  x.fillStyle = 'rgba(255,255,255,0.18)'
  for (let i = 0; i < 6; i++) x.fillRect(18 + i * 42, 32, 3, 66)
  // door
  x.fillStyle = 'rgba(20,12,8,0.65)'
  x.fillRect(196, 52, 34, 68)
  x.strokeStyle = 'rgba(255,255,255,0.35)'
  x.lineWidth = 2
  x.strokeRect(10, 24, 236, 96)
  // sign strip
  x.fillStyle = 'rgba(10,6,10,0.9)'
  x.fillRect(10, 4, 236, 22)
  x.font = 'bold 15px Arial Black, Arial, sans-serif'
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.fillStyle = s.sign
  x.shadowColor = s.sign
  x.shadowBlur = 10
  x.fillText(s.label, 128, 15)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

let glowTex = null
export function glowTexture() {
  if (glowTex) return glowTex
  const c = makeCanvas(128, 128)
  const x = c.getContext('2d')
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.22, 'rgba(255,255,255,0.65)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.16)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = g
  x.fillRect(0, 0, 128, 128)
  glowTex = new THREE.CanvasTexture(c)
  glowTex.colorSpace = THREE.SRGBColorSpace
  return glowTex
}

export function glowSprite(color = 0xffffff, size = 4, opacity = 0.8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  }))
  s.scale.set(size, size, 1)
  return s
}

export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose?.()
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        if (m.map) m.map.dispose?.()
        m.dispose?.()
      }
    }
  })
}

export function formatMoney(n) {
  return '$' + Math.floor(n).toLocaleString('en-US')
}

// Bake a solid color into a geometry so many small parts can share one
// vertex-colored material and one draw call.
export function paintGeometry(geo, color) {
  const c = color instanceof THREE.Color ? color : new THREE.Color(color)
  const count = geo.attributes.position.count
  const arr = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return geo
}

export function boxGeometry(w, h, d, color, x = 0, y = 0, z = 0, rx = 0) {
  const geo = new THREE.BoxGeometry(w, h, d)
  if (rx) geo.rotateX(rx)
  geo.translate(x, y, z)
  return paintGeometry(geo, color)
}

// Merge geometries that all carry position/normal/uv/color attributes. Used
// for characters and cars, where dozens of little boxes become one mesh.
export function mergeGeometries(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g))
  const names = ['position', 'normal', 'uv', 'color'].filter((name) => parts.every((g) => g.attributes[name]))
  let total = 0
  for (const g of parts) total += g.attributes.position.count
  const out = new THREE.BufferGeometry()
  for (const name of names) {
    const itemSize = parts[0].attributes[name].itemSize
    const arr = new Float32Array(total * itemSize)
    let offset = 0
    for (const g of parts) {
      arr.set(g.attributes[name].array, offset)
      offset += g.attributes[name].array.length
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, itemSize))
  }
  for (const g of parts) if (!geos.includes(g)) g.dispose()
  for (const g of geos) g.dispose()
  out.computeBoundingSphere()
  return out
}
