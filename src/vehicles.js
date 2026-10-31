import * as THREE from 'three'
import { clamp, damp, dampAngle, rand, randInt, pick, chance, glowSprite, TAU, boxGeometry, paintGeometry, mergeGeometries } from './utils.js'

const BODY_COLORS = [
  0x9e2f2f, 0x284a72, 0xd9d4c7, 0x22242a, 0x5b6470, 0x2c5b4a,
  0xb07a2a, 0x6e2c55, 0x3b6f8a, 0xc25a2e, 0x8a8f96, 0x18222b
]

const SPECS = {
  sedan: { w: 2.0, l: 4.5, bodyH: 0.56, cabH: 0.5, cabL: 0.44, max: 30, accel: 11, mass: 1 },
  sports: { w: 2.06, l: 4.3, bodyH: 0.5, cabH: 0.42, cabL: 0.36, max: 38, accel: 15, mass: 0.9 },
  suv: { w: 2.16, l: 4.95, bodyH: 0.72, cabH: 0.55, cabL: 0.46, max: 26, accel: 9, mass: 1.35 },
  van: { w: 2.24, l: 5.4, bodyH: 0.85, cabH: 0.7, cabL: 0.52, max: 23, accel: 8, mass: 1.5 },
  police: { w: 2.04, l: 4.6, bodyH: 0.58, cabH: 0.5, cabL: 0.44, max: 34, accel: 13, mass: 1.1 },
  taxi: { w: 2.0, l: 4.5, bodyH: 0.56, cabH: 0.5, cabL: 0.44, max: 29, accel: 10.5, mass: 1 }
}

const BLOB_MAT = new THREE.MeshBasicMaterial({ color: 0x050507, transparent: true, opacity: 0.42, depthWrite: false })

function makeWheel(radius = 0.37, material) {
  const g = new THREE.Group()
  const tire = new THREE.CylinderGeometry(radius, radius, 0.28, 12)
  tire.rotateZ(Math.PI / 2)
  paintGeometry(tire, 0x15161a)
  const rim = new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, 0.3, 8)
  rim.rotateZ(Math.PI / 2)
  paintGeometry(rim, 0x8d9298)
  const spoke = new THREE.BoxGeometry(0.31, radius * 1.05, 0.09)
  paintGeometry(spoke, 0x6d7278)
  g.add(new THREE.Mesh(mergeGeometries([tire, rim, spoke]), material))
  return g
}

function mergedMesh(geos, material) {
  return new THREE.Mesh(mergeGeometries(geos), material)
}

export function createCarMesh(type = 'sedan', color = 0x9e2f2f) {
  const spec = SPECS[type] || SPECS.sedan
  const { w, l, bodyH, cabH, cabL } = spec
  const group = new THREE.Group()
  const car = { group, wheels: [], frontWheels: [], headMats: [], tailMats: [], type, spec }

  const paintMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.36, metalness: 0.5 })
  const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.68, metalness: 0.28 })
  const glass = new THREE.MeshStandardMaterial({ color: 0x0e1a24, roughness: 0.08, metalness: 0.75, transparent: true, opacity: 0.92 })

  const bodyY = 0.42 + bodyH / 2
  const bodyParts = [
    boxGeometry(w, bodyH, l, color, 0, bodyY, 0),
    // Slight nose and tail shaping.
    boxGeometry(w * 0.94, bodyH * 0.6, 0.35, color, 0, bodyY - 0.08, l / 2 - 0.05),
    boxGeometry(w * 0.94, bodyH * 0.6, 0.3, color, 0, bodyY - 0.06, -l / 2 + 0.02),
    boxGeometry(w * 0.8, 0.08, l * cabL * 0.82, color, 0, bodyY + bodyH / 2 + cabH - 0.01, -l * 0.04),
    boxGeometry(0.07, cabH, 0.1, color, -w * 0.41, bodyY + bodyH / 2 + cabH / 2, -l * cabL * 0.5),
    boxGeometry(0.07, cabH, 0.1, color, w * 0.41, bodyY + bodyH / 2 + cabH / 2, -l * cabL * 0.5),
    boxGeometry(w * 0.98, 0.16, 0.18, 0x0d0e11, 0, 0.4, l / 2 + 0.04),
    boxGeometry(w * 0.98, 0.16, 0.18, 0x0d0e11, 0, 0.4, -l / 2 - 0.03)
  ]

  if (type === 'sports') {
    bodyParts.push(
      boxGeometry(w * 0.9, 0.06, 0.32, 0x0d0e11, 0, bodyY + bodyH / 2 + 0.3, -l / 2 + 0.34),
      boxGeometry(0.06, 0.24, 0.12, 0x0d0e11, -0.36 * w, bodyY + bodyH / 2 + 0.16, -l / 2 + 0.34),
      boxGeometry(0.06, 0.24, 0.12, 0x0d0e11, 0.36 * w, bodyY + bodyH / 2 + 0.16, -l / 2 + 0.34)
    )
  }
  if (type === 'taxi') {
    bodyParts.push(boxGeometry(w * 1.005, 0.12, l * 0.6, 0x1c1c1c, 0, bodyY - 0.02, 0))
  }
  if (type === 'police') {
    bodyParts.push(
      boxGeometry(0.05, bodyH * 0.78, l * 0.42, 0xe8e9ea, -(w / 2 + 0.01), bodyY, 0.1),
      boxGeometry(0.05, bodyH * 0.78, l * 0.42, 0xe8e9ea, w / 2 + 0.01, bodyY, 0.1),
      boxGeometry(1.0, 0.08, 0.28, 0x1a1c20, 0, bodyY + bodyH / 2 + cabH + 0.06, -0.2)
    )
  }

  const body = mergedMesh(bodyParts, paintMat)
  group.add(body)
  car.body = body

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(w * 0.84, cabH, l * cabL), glass)
  cabin.position.set(0, bodyY + bodyH / 2 + cabH / 2 - 0.02, -l * 0.04)
  group.add(cabin)

  // Lights: two headlight boxes become one draw call, same for taillights.
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff2cf, emissive: 0xffe2a8, emissiveIntensity: 1.2, toneMapped: false })
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff3524, emissive: 0xff1a0a, emissiveIntensity: 1.6, toneMapped: false })
  const heads = []
  const tails = []
  for (const sx of [-0.32, 0.32]) {
    const h = new THREE.BoxGeometry(w * 0.24, 0.13, 0.06)
    h.translate(sx * w, bodyY + 0.06, l / 2 + 0.1)
    heads.push(h)
    const t = new THREE.BoxGeometry(w * 0.26, 0.12, 0.06)
    t.translate(sx * w, bodyY + 0.06, -l / 2 - 0.07)
    tails.push(t)
  }
  group.add(mergedMesh(heads, headMat), mergedMesh(tails, tailMat))
  car.headMats.push(headMat)
  car.tailMats.push(tailMat)

  // Headlight cones for atmosphere at night.
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false })
  const coneParts = []
  for (const sx of [-0.34, 0.34]) {
    const cone = new THREE.ConeGeometry(2.0, 10, 12, 1, true)
    cone.rotateX(Math.PI / 2)
    cone.translate(sx * w, 0.55, l / 2 + 5)
    coneParts.push(cone)
  }
  group.add(mergedMesh(coneParts, coneMat))
  car.coneMat = coneMat

  // Wheels (one merged mesh per wheel).
  const wheelGeoRadius = type === 'suv' || type === 'van' ? 0.43 : 0.37
  const wx = w / 2 - 0.08
  const wz = l * 0.31
  const wheelPositions = [
    [-wx, wheelGeoRadius, wz, true],
    [wx, wheelGeoRadius, wz, true],
    [-wx, wheelGeoRadius, -wz, false],
    [wx, wheelGeoRadius, -wz, false]
  ]
  for (const [x, y, z, front] of wheelPositions) {
    const wg = makeWheel(wheelGeoRadius, wheelMat)
    wg.position.set(x, y, z)
    group.add(wg)
    car.wheels.push(wg)
    if (front) car.frontWheels.push(wg)
  }

  if (type === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.24, 0.32),
      new THREE.MeshStandardMaterial({ color: 0xffe28a, emissive: 0xffb300, emissiveIntensity: 1.4, toneMapped: false })
    )
    sign.position.set(0, bodyY + bodyH / 2 + cabH + 0.14, -l * 0.04)
    group.add(sign)
  }

  if (type === 'police') {
    car.redMat = new THREE.MeshStandardMaterial({ color: 0xff2b2b, emissive: 0xff1010, emissiveIntensity: 2, toneMapped: false })
    car.blueMat = new THREE.MeshStandardMaterial({ color: 0x2b6bff, emissive: 0x1040ff, emissiveIntensity: 2, toneMapped: false })
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.24), car.redMat)
    red.position.set(-0.26, bodyY + bodyH / 2 + cabH + 0.15, -0.2)
    group.add(red)
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.24), car.blueMat)
    blue.position.set(0.26, bodyY + bodyH / 2 + cabH + 0.15, -0.2)
    group.add(blue)
    car.redGlow = glowSprite(0xff2020, 3.2, 0.0)
    car.redGlow.position.set(-0.26, bodyY + bodyH / 2 + cabH + 0.3, -0.2)
    group.add(car.redGlow)
    car.blueGlow = glowSprite(0x3060ff, 3.2, 0.0)
    car.blueGlow.position.set(0.26, bodyY + bodyH / 2 + cabH + 0.3, -0.2)
    group.add(car.blueGlow)
  }

  // Cheap baked contact shadow instead of a shadow-map pass per car part.
  const blob = new THREE.Mesh(new THREE.CircleGeometry(1, 20), BLOB_MAT)
  blob.rotation.x = -Math.PI / 2
  blob.position.y = 0.045
  blob.scale.set(w * 0.7, 1, l * 0.56)
  group.add(blob)

  return car
}

export class Vehicle {
  constructor(game, { type = 'sedan', x = 0, z = 0, heading = 0, color = pick(BODY_COLORS), police = false, traffic = false } = {}) {
    this.game = game
    this.type = police ? 'police' : type
    this.meshData = createCarMesh(this.type, police ? 0x22252b : color)
    this.mesh = this.meshData.group
    this.mesh.position.set(x, 0, z)
    this.heading = heading
    this.mesh.rotation.y = heading
    this.pos = new THREE.Vector3(x, 0, z)
    this.vel = new THREE.Vector2(0, 0)
    this.speed = 0
    this.steer = 0
    this.health = 100
    this.maxHealth = 100
    this.spec = this.meshData.spec
    this.police = police
    this.traffic = traffic
    this.driver = null
    this.occupiedByPlayer = false
    this.destroyed = false
    this.burnTimer = 0
    this.lightPhase = rand(0, TAU)
    this.coneMat = this.meshData.coneMat
    this.wheels = this.meshData.wheels
    this.frontWheels = this.meshData.frontWheels
    this.headMats = this.meshData.headMats
    this.tailMats = this.meshData.tailMats
    this.radius = 1.9
    this.mesh.userData.vehicle = this
    this.mesh.traverse((o) => { o.userData.vehicle = this })

    this.trafficPath = null
    if (traffic) this._initTrafficPath()

    game.scene.add(this.mesh)
  }

  get forward() {
    return new THREE.Vector2(Math.sin(this.heading), Math.cos(this.heading))
  }

  get speedKmh() {
    return Math.abs(this.speed) * 3.6
  }

  _initTrafficPath() {
    let si = randInt(-4, 4)
    let sj = randInt(-4, 4)
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]]
    const dir = pick(dirs)
    this.trafficPath = { si, sj, ei: si + dir[0], ej: sj + dir[1], dir }
    if (Math.abs(this.trafficPath.ei) > 5 || Math.abs(this.trafficPath.ej) > 5) {
      this.trafficPath.ei = si
      this.trafficPath.ej = sj
      this.trafficPath.dir = [0, 0]
    }
    const right = new THREE.Vector2(-this.trafficPath.dir[1], this.trafficPath.dir[0]).multiplyScalar(3.5)
    const sx = this.trafficPath.si * 70
    const sz = this.trafficPath.sj * 70
    this.pos.set(sx + right.x, 0, sz + right.y)
    this.heading = Math.atan2(this.trafficPath.dir[0], this.trafficPath.dir[1])
    this.mesh.position.copy(this.pos)
    this.mesh.rotation.y = this.heading
    this._nextTrafficTarget()
  }

  _nextTrafficTarget() {
    const p = this.trafficPath
    const ex = p.ei * 70
    const ez = p.ej * 70
    const right = new THREE.Vector2(-p.dir[1], p.dir[0]).multiplyScalar(3.5)
    this.trafficTarget = new THREE.Vector2(ex + right.x, ez + right.y)
    this.trafficNode = { i: p.ei, j: p.ej }
    this.cruise = rand(9, 14)
  }

  _advanceTrafficPath() {
    const p = this.trafficPath
    const opts = []
    const straight = [p.dir[0], p.dir[1]]
    const left = [-p.dir[1], p.dir[0]]
    const rightTurn = [p.dir[1], -p.dir[0]]
    const add = (d, w) => {
      const ni = p.ei + d[0]
      const nj = p.ej + d[1]
      if (ni < -5 || ni > 5 || nj < -5 || nj > 5) return
      opts.push({ d, w })
    }
    add(straight, 0.56)
    add(left, 0.19)
    add(rightTurn, 0.19)
    if (opts.length === 0) {
      add([-p.dir[0], -p.dir[1]], 1)
      opts.push({ d: [-p.dir[0], -p.dir[1]], w: 0.1 })
    }
    let total = 0
    for (const o of opts) total += o.w
    let r = Math.random() * total
    let chosen = opts[0].d
    for (const o of opts) { r -= o.w; if (r <= 0) { chosen = o.d; break } }
    this.trafficPath = { si: p.ei, sj: p.ej, ei: p.ei + chosen[0], ej: p.ej + chosen[1], dir: chosen }
    this._nextTrafficTarget()
  }

  updateTraffic(dt, game) {
    if (this.destroyed) { this._integrate(dt, game); return }
    if (!this.trafficTarget) return
    const to = new THREE.Vector2(this.trafficTarget.x - this.pos.x, this.trafficTarget.y - this.pos.z)
    const dist = to.length()
    if (dist < 2.2) {
      this.trafficPath.si = this.trafficPath.ei
      this.trafficPath.sj = this.trafficPath.ej
      this._advanceTrafficPath()
      const t2 = new THREE.Vector2(this.trafficTarget.x - this.pos.x, this.trafficTarget.y - this.pos.z)
      if (t2.length() < 1) return
      this.heading = dampAngle(this.heading, Math.atan2(t2.x, t2.y), 3, dt)
    } else {
      const desired = Math.atan2(to.x, to.y)
      this.heading = dampAngle(this.heading, desired, 3.5, dt)
    }

    // Brake for whatever is ahead.
    let targetSpeed = this.cruise
    const fwd = this.forward
    const ahead = 11
    const ax = this.pos.x + fwd.x * ahead
    const az = this.pos.z + fwd.y * ahead
    if (game.playerCar && game.playerCar !== this) {
      const d = Math.hypot(game.playerCar.pos.x - ax, game.playerCar.pos.z - az)
      if (d < 5) targetSpeed = 0
    }
    for (const v of game.vehicles) {
      if (v === this) continue
      const dx = v.pos.x - this.pos.x
      const dz = v.pos.z - this.pos.z
      const dd = Math.hypot(dx, dz)
      if (dd > 13) continue
      if (dx * fwd.x + dz * fwd.y > 3) targetSpeed = Math.min(targetSpeed, Math.max(0, (dd - 4) * 2.2))
    }
    if (game.player && !game.player.car) {
      const dx = game.player.pos.x - this.pos.x
      const dz = game.player.pos.z - this.pos.z
      if (Math.hypot(dx, dz) < 9 && dx * fwd.x + dz * fwd.y > 0) targetSpeed = Math.min(targetSpeed, 2)
    }

    this.speed = damp(this.speed, targetSpeed, 2.6, dt)
    this.vel.set(fwd.x * this.speed, fwd.y * this.speed)
    this._integrate(dt, game)
  }

  updatePolice(dt, game) {
    if (this.destroyed) { this._integrate(dt, game); return }
    if (game.wanted === 0) {
      this.speed *= Math.exp(-1.5 * dt)
      const f0 = this.forward
      this.vel.set(f0.x * this.speed, f0.y * this.speed)
      this._integrate(dt, game)
      return
    }
    const target = game.player.car ? game.player.car.pos : game.player.pos
    const dx = target.x - this.pos.x
    const dz = target.z - this.pos.z
    const dist = Math.hypot(dx, dz)
    const desired = Math.atan2(dx, dz)
    this.heading = dampAngle(this.heading, desired, dist < 30 ? 2.2 : 1.5, dt)
    let targetSpeed = dist > 12 ? this.spec.max * (dist > 90 ? 0.8 : 0.62) : 8
    // Back off a little so they circle instead of grinding.
    if (dist < 6) targetSpeed = 4
    this.speed = damp(this.speed, targetSpeed, 1.5, dt)
    const fwd = this.forward
    this.vel.set(fwd.x * this.speed, fwd.y * this.speed)
    this._integrate(dt, game)

    this.lightPhase += dt * 7
    if (this.meshData.redMat) {
      const on = Math.sin(this.lightPhase) > 0
      this.meshData.redMat.emissiveIntensity = on ? 3.4 : 0.35
      this.meshData.blueMat.emissiveIntensity = on ? 0.35 : 3.4
      if (this.meshData.redGlow) this.meshData.redGlow.material.opacity = on ? 0.8 : 0.04
      if (this.meshData.blueGlow) this.meshData.blueGlow.material.opacity = on ? 0.04 : 0.8
    }
  }

  updatePlayerDriven(dt, input) {
    if (this.destroyed) return
    const throttle = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) + (input.down('KeyS') || input.down('ArrowDown') ? -1 : 0)
    const steerIn = (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0) - (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0)
    const handbrake = input.down('Space')
    const fwd = this.forward
    let forwardSpeed = this.vel.x * fwd.x + this.vel.y * fwd.y
    const lateral = new THREE.Vector2(this.vel.x - fwd.x * forwardSpeed, this.vel.y - fwd.y * forwardSpeed)

    const max = this.spec.max
    const accel = this.spec.accel
    if (throttle > 0) {
      if (forwardSpeed < -0.5) forwardSpeed += 18 * dt
      else forwardSpeed += accel * dt
    } else if (throttle < 0) {
      if (forwardSpeed > 0.5) forwardSpeed -= 20 * dt
      else forwardSpeed -= accel * 0.65 * dt
    } else {
      forwardSpeed *= Math.exp(-0.7 * dt)
    }
    if (handbrake) forwardSpeed *= Math.exp(-1.6 * dt)
    forwardSpeed = clamp(forwardSpeed, -9, max)

    const speedT = clamp(Math.abs(forwardSpeed) / 8, 0, 1)
    const turn = (1.9 - clamp(Math.abs(forwardSpeed) / max, 0, 1) * 0.9) * speedT
    this.heading += steerIn * turn * dt * (forwardSpeed >= -0.2 ? 1 : -1)
    this.steer = damp(this.steer, steerIn, 8, dt)

    const newFwd = this.forward
    const grip = handbrake ? 0.9 : 7.5
    lateral.multiplyScalar(Math.exp(-grip * dt))
    this.vel.set(newFwd.x * forwardSpeed + lateral.x, newFwd.y * forwardSpeed + lateral.y)
    this.speed = forwardSpeed
    this._integrate(dt, this.game)
    if (handbrake && Math.abs(forwardSpeed) > 8) {
      if (Math.random() < 0.35) this.game.effects.smoke(this.pos.x + newFwd.x * -2, 0.15, this.pos.z + newFwd.y * -2, 0.5)
    }
  }

  updateCoast(dt, game) {
    if (this.destroyed) { this._integrate(dt, game); return }
    this.speed *= Math.exp(-1.3 * dt)
    const f = this.forward
    this.vel.set(f.x * this.speed, f.y * this.speed)
    this._integrate(dt, game)
  }

  _integrate(dt, game) {
    const oldX = this.pos.x
    const oldZ = this.pos.z
    this.pos.x += this.vel.x * dt
    this.pos.z += this.vel.y * dt

    // Buildings: two collision discs along the chassis.
    const f = this.forward
    const offsets = [1.35, -1.35]
    const before = { x: this.pos.x, z: this.pos.z }
    for (const off of offsets) {
      const p = { x: this.pos.x + f.x * off, z: this.pos.z + f.y * off }
      game.world.resolveCircle(p, 1.15)
      const dx = p.x - (this.pos.x + f.x * off)
      const dz = p.z - (this.pos.z + f.y * off)
      this.pos.x += dx * 0.8
      this.pos.z += dz * 0.8
    }
    const hitDx = this.pos.x - before.x
    const hitDz = this.pos.z - before.z
    if (hitDx * hitDx + hitDz * hitDz > 0.0004) {
      const n = new THREE.Vector2(hitDx, hitDz).normalize()
      const vn = this.vel.dot(n)
      if (vn < 0) {
        this.vel.addScaledVector(n, -vn * 1.4)
        const impact = Math.abs(vn)
        if (impact > 3.5) {
          this.health -= impact * 1.7
          this.game.effects.sparks(this.pos.x, 0.7, this.pos.z, 8)
          if (impact > 7) this.game.audio.thud()
        }
      }
      this.speed *= 0.72
    }

    this.mesh.position.set(this.pos.x, 0, this.pos.z)
    this.mesh.rotation.y = this.heading
    for (const w of this.frontWheels) w.rotation.y = this.steer * 0.5
    const spin = this.speed * dt / 0.37
    for (const w of this.wheels) {
      for (const child of w.children) child.rotation.x += spin
    }

    if (this.health < 38 && !this.destroyed) {
      this.burnTimer -= dt
      if (this.burnTimer <= 0) {
        this.burnTimer = 0.08
        game.effects.smoke(this.pos.x, 0.8, this.pos.z, this.health < 18 ? 1.5 : 0.7)
        if (this.health < 18 && Math.random() < 0.3) game.effects.fire(this.pos.x, 0.9, this.pos.z, 0.8)
      }
    }
    if (this.health <= 0 && !this.destroyed) game.explodeVehicle(this)

    const distMoved = Math.hypot(this.pos.x - oldX, this.pos.z - oldZ)
    if (distMoved > 0.001) {
      // Run over pedestrians.
      const checkR = this.radius + 0.4
      for (const ped of game.peds) {
        if (ped.dead) continue
        const dx = ped.pos.x - this.pos.x
        const dz = ped.pos.z - this.pos.z
        if (dx * dx + dz * dz < checkR * checkR && Math.abs(this.speed) > 5 && ped.vehicleCooldown <= 0) {
          ped.vehicleCooldown = 2
          game.runOver(this, ped)
        }
      }
      for (const cop of game.cops) {
        if (cop.dead) continue
        const dx = cop.pos.x - this.pos.x
        const dz = cop.pos.z - this.pos.z
        if (dx * dx + dz * dz < checkR * checkR && Math.abs(this.speed) > 5 && cop.vehicleCooldown <= 0) {
          cop.vehicleCooldown = 2
          game.runOver(this, cop)
        }
      }
    }
  }

  applyDamage(amount, game) {
    if (this.destroyed) return
    this.health -= amount
    if (this.health <= 0 && !this.destroyed) game.explodeVehicle(this)
  }

  addDriverVisual(driver) {
    this.driver = driver
  }

  dispose() {
    this.game.scene.remove(this.mesh)
  }
}
