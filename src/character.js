import * as THREE from 'three'
import { pick, rand, boxGeometry, mergeGeometries } from './utils.js'

const SKIN = [0xf0c8a0, 0xd9a878, 0xa9744c, 0x80573a, 0x5f3d28]
const SHIRTS = [0x2f4858, 0x7a2e3c, 0x3e5c3a, 0x4a3c66, 0x8a6a2f, 0x2c2c30, 0x24606b, 0xc9c3b4, 0x8f3f2a]
const PANTS = [0x252a33, 0x31343a, 0x3d342a, 0x203347, 0x4a4a50, 0x5a4b3a]
const HAIR = [0x1b1a19, 0x30241a, 0x5a3b22, 0x8c6a3f, 0x2a2a2a]

// One shared vertex-colored material for every character part. This keeps the
// whole pedestrian crowd to a handful of draw calls.
const CHAR_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02 })
const GUN_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.55 })

function mesh(geos, material, castShadow) {
  const m = new THREE.Mesh(mergeGeometries(geos), material)
  m.castShadow = castShadow
  return m
}

export function createHumanoid(opts = {}) {
  const skin = opts.skin ?? pick(SKIN)
  const shirt = opts.shirt ?? pick(SHIRTS)
  const pants = opts.pants ?? pick(PANTS)
  const hair = opts.hair ?? pick(HAIR)
  const isCop = opts.cop ?? false
  const castShadow = opts.castShadow ?? false
  const group = new THREE.Group()

  // Torso, hips, head and accessories never move independently, so bake them
  // into a single static mesh.
  const bodyParts = [
    boxGeometry(0.46, 0.62, 0.27, isCop ? 0x232d3d : shirt, 0, 1.24, 0),
    boxGeometry(0.42, 0.2, 0.25, isCop ? 0x1b2230 : pants, 0, 0.96, 0),
    boxGeometry(0.26, 0.28, 0.25, skin, 0, 1.71, 0),
    boxGeometry(0.28, 0.11, 0.27, hair, 0, 1.86, -0.01),
    boxGeometry(0.06, 0.07, 0.06, skin, 0, 1.69, 0.15)
  ]
  if (isCop) {
    bodyParts.push(
      boxGeometry(0.48, 0.4, 0.29, 0x141a24, 0, 1.28, 0),
      boxGeometry(0.09, 0.09, 0.02, 0xd6b45a, -0.15, 1.4, 0.145),
      boxGeometry(0.3, 0.09, 0.3, 0x11151d, 0, 1.9, 0),
      boxGeometry(0.3, 0.03, 0.14, 0x080a0f, 0, 1.87, 0.2)
    )
  }
  const torso = mesh(bodyParts, CHAR_MAT, castShadow)
  group.add(torso)

  const makeLeg = (side) => {
    const g = new THREE.Group()
    g.position.set(side * 0.115, 0.92, 0)
    g.add(mesh([
      boxGeometry(0.17, 0.84, 0.21, isCop ? 0x1b2230 : pants, 0, -0.42, 0),
      boxGeometry(0.19, 0.12, 0.3, 0x17181c, 0, -0.84, 0.04)
    ], CHAR_MAT, castShadow))
    return g
  }

  const makeArm = (side) => {
    const g = new THREE.Group()
    g.position.set(side * 0.3, 1.5, 0)
    g.add(mesh([
      boxGeometry(0.125, 0.58, 0.16, isCop ? 0x232d3d : shirt, 0, -0.29, 0),
      boxGeometry(0.12, 0.12, 0.13, skin, 0, -0.62, 0)
    ], CHAR_MAT, castShadow))
    return g
  }

  const leftLeg = makeLeg(-1)
  const rightLeg = makeLeg(1)
  const leftArm = makeArm(-1)
  const rightArm = makeArm(1)
  group.add(leftLeg, rightLeg, leftArm, rightArm)

  const gun = new THREE.Group()
  gun.add(mesh([
    boxGeometry(0.075, 0.14, 0.3, 0x1b1c20, 0, -0.68, 0.18),
    boxGeometry(0.06, 0.14, 0.08, 0x2a2b30, 0, -0.76, 0.06, 0.3)
  ], GUN_MAT, false))
  rightArm.add(gun)
  gun.visible = false

  return {
    group,
    parts: { leftLeg, rightLeg, leftArm, rightArm, gun },
    phase: rand(0, Math.PI * 2),
    aiming: false,
    walk: 0
  }
}

export function animateHumanoid(rig, dt, moveSpeed = 0, aiming = false, extra = {}) {
  const p = rig.parts
  rig.walk += dt * (2.2 + moveSpeed * 1.5)
  const amp = Math.min(1, moveSpeed / 5) * 0.75
  const s = Math.sin(rig.walk)

  p.leftLeg.rotation.x = s * amp
  p.rightLeg.rotation.x = -s * amp

  if (aiming) {
    p.rightArm.rotation.x = -Math.PI / 2 + 0.05
    p.rightArm.rotation.z = 0.06
    p.leftArm.rotation.x = -Math.PI / 2 + 0.22
    p.leftArm.rotation.z = -0.25
    p.gun.visible = true
  } else {
    p.rightArm.rotation.x = -s * amp * 0.8
    p.leftArm.rotation.x = s * amp * 0.8
    p.rightArm.rotation.z = 0
    p.leftArm.rotation.z = 0
    p.gun.visible = false
  }
  if (extra.fall) {
    rig.group.rotation.x = -Math.PI / 2
    p.leftLeg.rotation.x = 0.2
    p.rightLeg.rotation.x = -0.1
    p.leftArm.rotation.x = 0.5
    p.rightArm.rotation.x = -0.6
  }
}

export function createCop(opts = {}) {
  return createHumanoid({ cop: true, shirt: 0x263247, pants: 0x1a2130, ...opts })
}
