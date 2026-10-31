import * as THREE from 'three'
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js'

// ---------------------------------------------------------------------------
// Low-poly vehicles and people. All geometry is generated and merged so the
// whole city stays light enough to render smoothly in software WebGL too.
// ---------------------------------------------------------------------------

const carGeoCache = new Map()
const matCache = new Map()

function colorAttr(geo, hex) {
  const c = new THREE.Color(hex)
  const n = geo.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return geo
}

function box(w, h, d, color, x, y, z, rot = null) {
  const g = new THREE.BoxGeometry(w, h, d)
  if (rot) g.rotateX(rot)
  g.translate(x, y, z)
  return colorAttr(g, color)
}

function wheel(x, z) {
  const g = new THREE.CylinderGeometry(0.34, 0.34, 0.3, 10)
  g.rotateZ(Math.PI / 2)
  g.translate(x, 0.36, z)
  return colorAttr(g, '#0d0d11')
}

function carGeometry(color, police = false) {
  const key = police ? 'police' : color
  if (carGeoCache.has(key)) return carGeoCache.get(key)
  const body = police ? '#e8e6df' : color
  const trim = '#16161c'
  const glass = '#1c2d3c'
  const parts = []
  // main body
  parts.push(box(1.86, 0.5, 4.2, body, 0, 0.58, 0))
  // hood + trunk
  parts.push(box(1.7, 0.16, 1.3, body, 0, 0.85, 1.32))
  parts.push(box(1.7, 0.16, 0.9, body, 0, 0.83, -1.55))
  // cabin glass and roof
  parts.push(box(1.58, 0.5, 2.05, glass, 0, 1.06, -0.12))
  parts.push(box(1.62, 0.1, 2.1, body, 0, 1.34, -0.12))
  // pillars
  parts.push(box(0.08, 0.5, 0.1, body, -0.78, 1.06, 0.78))
  parts.push(box(0.08, 0.5, 0.1, body, 0.78, 1.06, 0.78))
  parts.push(box(0.08, 0.5, 0.1, body, -0.78, 1.06, -0.98))
  parts.push(box(0.08, 0.5, 0.1, body, 0.78, 1.06, -0.98))
  // bumpers
  parts.push(box(1.92, 0.24, 0.28, trim, 0, 0.36, 2.06))
  parts.push(box(1.92, 0.24, 0.28, trim, 0, 0.36, -2.06))
  // headlights
  parts.push(box(0.4, 0.16, 0.06, '#fff2bc', -0.62, 0.7, 2.11))
  parts.push(box(0.4, 0.16, 0.06, '#fff2bc', 0.62, 0.7, 2.11))
  // tail lights
  parts.push(box(0.38, 0.14, 0.06, '#ff3a24', -0.62, 0.7, -2.11))
  parts.push(box(0.38, 0.14, 0.06, '#ff3a24', 0.62, 0.7, -2.11))
  if (police) {
    parts.push(box(0.04, 0.34, 1.5, '#17171d', -0.94, 0.68, 0.05))
    parts.push(box(0.04, 0.34, 1.5, '#17171d', 0.94, 0.68, 0.05))
    parts.push(box(1.5, 0.06, 0.4, '#17171d', 0, 1.41, -0.12))
  }
  parts.push(wheel(-0.96, 1.3), wheel(0.96, 1.3), wheel(-0.96, -1.32), wheel(0.96, -1.32))
  const geo = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  carGeoCache.set(key, geo)
  return geo
}

let carMat = null
function getCarMaterial() {
  if (!carMat) {
    carMat = new THREE.MeshStandardMaterial({
      vertexColors: true, metalness: 0.35, roughness: 0.42
    })
  }
  return carMat
}

const shadowTex = (() => {
  let tex = null
  return () => {
    if (tex) return tex
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const ctx = c.getContext('2d')
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64)
    g.addColorStop(0, 'rgba(0,0,0,.55)')
    g.addColorStop(0.62, 'rgba(0,0,0,.25)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 128)
    tex = new THREE.CanvasTexture(c)
    return tex
  }
})()

function blobShadow(w, h) {
  const mat = new THREE.MeshBasicMaterial({
    map: shadowTex(), transparent: true, depthWrite: false, opacity: 0.9
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.035
  mesh.renderOrder = 1
  return mesh
}

export function createCarMesh(color, police = false) {
  const group = new THREE.Group()
  const mesh = new THREE.Mesh(carGeometry(color, police), getCarMaterial())
  mesh.position.y = 0
  group.add(mesh)
  group.add(blobShadow(3.4, 5.2))

  const siren = { red: [], blue: [] }
  if (police) {
    const bar = new THREE.Group()
    bar.position.set(0, 1.47, -0.1)
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2233, toneMapped: false })
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2266ff, toneMapped: false })
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.26), redMat)
    red.position.x = -0.36
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.26), blueMat)
    blue.position.x = 0.36
    bar.add(red, blue)
    group.add(bar)
    siren.red.push(redMat)
    siren.blue.push(blueMat)
  }
  return { group, mesh, siren }
}

// ---------------------------------------------------------------------------
// Humans
// ---------------------------------------------------------------------------

const humanGeo = {
  torso: new THREE.BoxGeometry(0.6, 0.66, 0.34),
  hips: new THREE.BoxGeometry(0.54, 0.2, 0.32),
  head: new THREE.SphereGeometry(0.175, 10, 8),
  hair: new THREE.BoxGeometry(0.34, 0.14, 0.34),
  leg: new THREE.BoxGeometry(0.22, 0.74, 0.24),
  arm: new THREE.BoxGeometry(0.17, 0.6, 0.2),
  shoe: new THREE.BoxGeometry(0.24, 0.12, 0.34),
  gun: new THREE.BoxGeometry(0.08, 0.12, 0.42),
  cap: new THREE.CylinderGeometry(0.19, 0.19, 0.12, 8),
  brim: new THREE.BoxGeometry(0.36, 0.04, 0.22),
  tie: new THREE.BoxGeometry(0.06, 0.3, 0.02)
}

function mat(hex) {
  if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.78, metalness: 0.04 }))
  return matCache.get(hex)
}

export function createHumanoid(opts = {}) {
  const {
    shirt = '#1e4b56', pants = '#26324a', skin = '#c98d64', hair = '#1b1411',
    shoes = '#17171c', cop = false, armed = false, player = false
  } = opts
  const group = new THREE.Group()
  const body = new THREE.Group()
  group.add(body)

  const skinMat = mat(skin)
  const shirtMat = mat(cop ? '#1c2a4d' : shirt)
  const pantsMat = mat(cop ? '#141c30' : pants)
  const shoeMat = mat(shoes)

  const hips = new THREE.Mesh(humanGeo.hips, pantsMat)
  hips.position.y = 0.92
  body.add(hips)

  const torso = new THREE.Mesh(humanGeo.torso, shirtMat)
  torso.position.y = 1.28
  body.add(torso)

  const headGroup = new THREE.Group()
  headGroup.position.y = 1.68
  const head = new THREE.Mesh(humanGeo.head, skinMat)
  head.position.y = 0.09
  const hairMesh = new THREE.Mesh(humanGeo.hair, mat(hair))
  hairMesh.position.y = 0.22
  headGroup.add(head, hairMesh)
  if (cop) {
    const cap = new THREE.Mesh(humanGeo.cap, mat('#121a30'))
    cap.position.y = 0.23
    const brim = new THREE.Mesh(humanGeo.brim, mat('#0c1222'))
    brim.position.set(0, 0.2, 0.13)
    headGroup.add(cap, brim)
  }
  if (player && !cop) {
    const shades = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.04), mat('#0a0a0c'))
    shades.position.set(0, 0.11, 0.16)
    headGroup.add(shades)
  }
  body.add(headGroup)

  const makeArm = (side) => {
    const pivot = new THREE.Group()
    pivot.position.set(side * 0.38, 1.5, 0)
    const arm = new THREE.Mesh(humanGeo.arm, shirtMat)
    arm.position.y = -0.28
    pivot.add(arm)
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), skinMat)
    hand.position.y = -0.6
    pivot.add(hand)
    body.add(pivot)
    return pivot
  }
  const leftArm = makeArm(-1)
  const rightArm = makeArm(1)

  const gun = new THREE.Mesh(humanGeo.gun, mat('#111116'))
  gun.position.set(0.02, -0.62, 0.22)
  gun.visible = armed
  rightArm.add(gun)

  if (player && !cop) {
    const shirtPanel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.02), mat('#c4d7dd'))
    shirtPanel.position.set(0, 1.3, 0.18)
    body.add(shirtPanel)
  }
  if (cop) {
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.02), mat('#e7c15b'))
    badge.position.set(-0.16, 1.4, 0.18)
    body.add(badge)
  }

  const makeLeg = (side) => {
    const pivot = new THREE.Group()
    pivot.position.set(side * 0.14, 0.9, 0)
    const leg = new THREE.Mesh(humanGeo.leg, pantsMat)
    leg.position.y = -0.34
    const shoe = new THREE.Mesh(humanGeo.shoe, shoeMat)
    shoe.position.set(0, -0.72, 0.06)
    pivot.add(leg, shoe)
    body.add(pivot)
    return pivot
  }
  const leftLeg = makeLeg(-1)
  const rightLeg = makeLeg(1)

  group.add(blobShadow(1.35, 1.1))

  const human = {
    group, body, torso, headGroup, leftArm, rightArm, leftLeg, rightLeg, gun,
    phase: Math.random() * 10,
    setWalk(amount = 1) {
      const p = this.phase
      const swing = Math.sin(p) * 0.78 * amount
      this.leftLeg.rotation.x = swing
      this.rightLeg.rotation.x = -swing
      this.leftArm.rotation.x = -swing * 0.8
      this.rightArm.rotation.x = swing * 0.8
      this.body.position.y = -0.05 + Math.abs(Math.sin(p)) * 0.035 * amount
      this.torso.rotation.z = Math.sin(p) * 0.03 * amount
    },
    setIdle(time) {
      const s = Math.sin(time * 1.8) * 0.02
      this.leftArm.rotation.x = s
      this.rightArm.rotation.x = -s
      this.leftLeg.rotation.x = 0
      this.rightLeg.rotation.x = 0
      this.body.position.y = -0.05 + Math.sin(time * 1.8) * 0.008
    },
    aim() {
      this.leftArm.rotation.x = -1.5
      this.rightArm.rotation.x = -1.5
      this.rightArm.rotation.z = 0
      this.rightArm.rotation.x = -1.45
      this.leftLeg.rotation.x = 0
      this.rightLeg.rotation.x = 0
    },
    die(t) {
      this.group.rotation.z = Math.min(Math.PI / 2, t * 6)
      this.group.position.y = -Math.min(0.25, t * 0.5)
    }
  }
  return human
}

// ---------------------------------------------------------------------------
// World markers and pickups
// ---------------------------------------------------------------------------

function beam(colorHex) {
  const group = new THREE.Group()
  const color = new THREE.Color(colorHex)
  const ringMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, toneMapped: false
  })
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.62, 40), ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.08
  const discMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
  })
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), discMat)
  disc.rotation.x = -Math.PI / 2
  disc.position.y = 0.06
  const beamMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
  })
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 18, 24, 1, true), beamMat)
  pillar.position.y = 9
  const gemMat = new THREE.MeshBasicMaterial({ color, toneMapped: false })
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), gemMat)
  gem.position.y = 2.6
  group.add(ring, disc, pillar, gem)
  group.userData = { ring, disc, pillar, gem, ringMat, discMat, beamMat }
  group.visible = false
  return group
}

export function updateBeacon(group, t) {
  if (!group.visible) return
  const u = group.userData
  u.gem.rotation.y = t * 1.6
  u.gem.position.y = 2.6 + Math.sin(t * 2.2) * 0.22
  const pulse = 1 + Math.sin(t * 3) * 0.08
  u.ring.scale.setScalar(pulse)
  u.ringMat.opacity = 0.55 + Math.sin(t * 3) * 0.25
  u.discMat.opacity = 0.08 + Math.sin(t * 3) * 0.04
}

export function createBeacon(color) {
  return beam(color)
}

export function createCashPickup() {
  const group = new THREE.Group()
  const green = mat('#4bbf6b')
  const light = mat('#9bffb4')
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.12, 0.4), i === 2 ? light : green)
    b.position.y = 0.5 + i * 0.14
    b.rotation.y = (i - 1) * 0.18
    group.add(b)
  }
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 24),
    new THREE.MeshBasicMaterial({ color: 0x4bbf6b, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending })
  )
  glow.rotation.x = -Math.PI / 2
  glow.position.y = 0.05
  group.add(glow)
  group.userData.spin = group
  return group
}

export function createHealthPickup() {
  const group = new THREE.Group()
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), mat('#e9eef0'))
  box.position.y = 0.6
  const a = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xff3355, toneMapped: false }))
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.36, 0.1), new THREE.MeshBasicMaterial({ color: 0xff3355, toneMapped: false }))
  a.position.set(0, 0.6, 0.29)
  b.position.set(0, 0.6, 0.29)
  group.add(box, a, b)
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.9, 20),
    new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending })
  )
  glow.rotation.x = -Math.PI / 2
  glow.position.y = 0.05
  group.add(glow)
  return group
}

export function createArmorPickup() {
  const group = new THREE.Group()
  const box = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), new THREE.MeshStandardMaterial({ color: 0x3fa9ff, metalness: 0.5, roughness: 0.25, emissive: 0x0b2f5a, emissiveIntensity: 0.7 }))
  box.position.y = 0.7
  group.add(box)
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.85, 20),
    new THREE.MeshBasicMaterial({ color: 0x3fa9ff, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending })
  )
  glow.rotation.x = -Math.PI / 2
  glow.position.y = 0.05
  group.add(glow)
  return group
}

// simple muzzle flash / tracer pool helpers
export function makeTracer(color = 0xffd48a) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)])
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false })
  return new THREE.Line(geo, mat)
}
