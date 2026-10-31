import * as THREE from 'three'
import { clamp, damp, dampAngle, rand, randInt, pick, chance, TAU, dist2 } from './utils.js'
import { createHumanoid, animateHumanoid, createCop } from './character.js'
import { GRID } from './world.js'

const PED_SHIRTS = [0xc94f4f, 0x4f7ac9, 0x4fc97a, 0xc9a94f, 0x8a4fc9, 0x4fc9c9, 0xd8d2c4, 0x32343a, 0xd77a3a, 0x5a6b45]
const PED_PANTS = [0x2c2f36, 0x3b342c, 0x23303f, 0x4a4a50, 0x6b5a41, 0x1e1f23]

export class Ped {
  constructor(game, x, z, opts = {}) {
    this.game = game
    this.rig = createHumanoid({
      shirt: pick(PED_SHIRTS),
      pants: pick(PED_PANTS),
      ...opts.look
    })
    this.group = this.rig.group
    this.pos = new THREE.Vector3(x, 0.15, z)
    this.group.position.copy(this.pos)
    this.heading = rand(0, TAU)
    this.group.rotation.y = this.heading
    this.group.traverse((o) => { o.userData.ped = this })
    this.state = 'walk'
    this.health = 30
    this.dead = false
    this.deadTimer = 0
    this.speed = rand(1.1, 1.8)
    this.waitTimer = rand(0, 2)
    this.fleeTimer = 0
    this.threat = new THREE.Vector3()
    this.target = new THREE.Vector2()
    this.targetTimer = 0
    this.vehicleCooldown = 0
    this.blood = null
    this.block = opts.block || { i: randInt(-5, 4), j: randInt(-5, 4) }
    this._pickTarget()
    this.group.position.y = 0.15
    game.scene.add(this.group)
  }

  _pickTarget() {
    const c = this.block
    const cx = GRID * c.i + GRID / 2
    const cz = GRID * c.j + GRID / 2
    const off = 24.6
    const side = randInt(0, 3)
    const t = rand(-23, 23)
    if (side === 0) this.target.set(cx + t, cz - off)
    else if (side === 1) this.target.set(cx + t, cz + off)
    else if (side === 2) this.target.set(cx - off, cz + t)
    else this.target.set(cx + off, cz + t)
    // Don't route into the sea.
    if (this.target.y > 348) this.target.y = 348
    this.targetTimer = 0
  }

  scare(source, radius = 18) {
    if (this.dead) return
    const d = Math.hypot(this.pos.x - source.x, this.pos.z - source.z)
    if (d > radius) return
    this.state = 'flee'
    this.fleeTimer = rand(4, 7)
    this.threat.set(source.x, 0, source.z)
    const dx = this.pos.x - source.x
    const dz = this.pos.z - source.z
    const len = Math.hypot(dx, dz) || 1
    this.target.set(this.pos.x + (dx / len) * 18 + rand(-5, 5), this.pos.z + (dz / len) * 18 + rand(-5, 5))
  }

  update(dt, game) {
    this.vehicleCooldown = Math.max(0, this.vehicleCooldown - dt)
    if (this.dead) {
      this.deadTimer += dt
      if (this.deadTimer > 22) {
        this.game.scene.remove(this.group)
        if (this.blood) this.game.scene.remove(this.blood)
        this.removed = true
      }
      return
    }
    const playerDist = Math.hypot(this.pos.x - game.player.pos.x, this.pos.z - game.player.pos.z)
    this.group.visible = game.mode !== 'playing' || playerDist < 72
    if (this.state === 'flee') {
      this.fleeTimer -= dt
      if (this.fleeTimer <= 0) {
        this.state = 'walk'
        this._pickTarget()
      } else {
        // keep running away in a straight-ish line, with small jitter
        this.speed = 5.2
        const tx = this.target.x
        const tz = this.target.y
        const dx = tx - this.pos.x
        const dz = tz - this.pos.z
        if (Math.hypot(dx, dz) < 2) {
          const ax = this.pos.x - this.threat.x
          const az = this.pos.z - this.threat.z
          const len = Math.hypot(ax, az) || 1
          this.target.set(this.pos.x + (ax / len) * 20 + rand(-6, 6), this.pos.z + (az / len) * 20 + rand(-6, 6))
        }
      }
    } else {
      this.speed = damp(this.speed, this.waitTimer > 0 ? 0 : rand(1.2, 1.7), 3, dt)
      if (this.waitTimer > 0) {
        this.waitTimer -= dt
      } else {
        const d = Math.hypot(this.target.x - this.pos.x, this.target.y - this.pos.z)
        if (d < 1.2) {
          this.waitTimer = rand(0, 2.2)
          this._pickTarget()
        }
      }
    }

    const dx = this.target.x - this.pos.x
    const dz = this.target.y - this.pos.z
    const dist = Math.hypot(dx, dz)
    if (dist > 0.6) {
      const desired = Math.atan2(dx, dz)
      this.heading = dampAngle(this.heading, desired, 8, dt)
      this.pos.x += (dx / dist) * this.speed * dt
      this.pos.z += (dz / dist) * this.speed * dt
      this.group.rotation.y = this.heading
    }

    // Avoid the player's body.
    if (playerDist < 0.9 && !game.player.car) {
      const ax = this.pos.x - game.player.pos.x
      const az = this.pos.z - game.player.pos.z
      const l = Math.hypot(ax, az) || 1
      this.pos.x += (ax / l) * 1.2 * dt
      this.pos.z += (az / l) * 1.2 * dt
    }
    if (game.player.car && this.state !== 'flee') {
      const c = game.player.car
      const d = Math.hypot(this.pos.x - c.pos.x, this.pos.z - c.pos.z)
      if (d < 14 && Math.abs(c.speed) > 6) this.scare(c.pos, 14)
    }

    game.world.resolveCircle(this.pos, 0.36)
    this.group.position.set(this.pos.x, 0.15, this.pos.z)
    animateHumanoid(this.rig, dt, this.speed, false, { fall: false })
  }

  hit(damage, from, game, opts = {}) {
    if (this.dead) return
    this.health -= damage
    if (Math.random() < 0.6) this.scare(from, 60)
    if (this.health <= 0) this.kill(game, opts)
  }

  kill(game, opts = {}) {
    if (this.dead) return
    this.dead = true
    this.state = 'dead'
    this.deadTimer = 0
    this.group.rotation.z = Math.PI / 2
    this.group.rotation.x = rand(-0.3, 0.3)
    this.group.position.y = 0.32
    this.group.rotation.y = this.heading + rand(-0.4, 0.4)
    const blood = new THREE.Mesh(
      new THREE.CircleGeometry(rand(0.5, 0.9), 12),
      new THREE.MeshBasicMaterial({ color: 0x521111, transparent: true, opacity: 0.75, depthWrite: false })
    )
    blood.rotation.x = -Math.PI / 2
    blood.position.set(this.pos.x, 0.02, this.pos.z)
    game.scene.add(blood)
    this.blood = blood
    if (!opts.silent) game.onPedKilled(this, opts)
  }
}

export class Cop {
  constructor(game, x, z, opts = {}) {
    this.game = game
    this.isThug = !!opts.thug
    this.rig = this.isThug
      ? createHumanoid({ shirt: opts.shirt ?? 0x8e2424, pants: 0x1f1f24, skin: opts.skin })
      : createCop()
    this.group = this.rig.group
    this.pos = new THREE.Vector3(x, 0.15, z)
    this.group.position.copy(this.pos)
    this.heading = rand(0, TAU)
    this.health = this.isThug ? 55 : 75
    this.dead = false
    this.deadTimer = 0
    this.speed = 0
    this.fireTimer = rand(0.8, 2)
    this.vehicleCooldown = 0
    this.rush = false
    this.group.traverse((o) => { o.userData.cop = this })
    game.scene.add(this.group)
  }

  update(dt, game) {
    this.vehicleCooldown = Math.max(0, this.vehicleCooldown - dt)
    if (this.dead) {
      this.deadTimer += dt
      if (this.deadTimer > 22) {
        game.scene.remove(this.group)
        this.removed = true
      }
      return
    }
    if (!this.isThug && game.wanted === 0) {
      this.speed = damp(this.speed, 0, 4, dt)
      animateHumanoid(this.rig, dt, 0, false, {})
      this.rig.parts.gun.visible = false
      return
    }
    const target = game.player.car ? game.player.car.pos : game.player.pos
    const dx = target.x - this.pos.x
    const dz = target.z - this.pos.z
    const dist = Math.hypot(dx, dz)
    this.group.visible = game.mode !== 'playing' || dist < 110
    const desired = Math.atan2(dx, dz)
    this.heading = dampAngle(this.heading, desired, 7, dt)
    const want = dist > 16 ? 5.6 : dist > 9 ? 2.2 : 0.5
    this.speed = damp(this.speed, want, 5, dt)
    if (dist > 1.2) {
      this.pos.x += Math.sin(this.heading) * this.speed * dt
      this.pos.z += Math.cos(this.heading) * this.speed * dt
    }
    game.world.resolveCircle(this.pos, 0.38)
    this.group.position.set(this.pos.x, 0.15, this.pos.z)
    this.group.rotation.y = this.heading
    animateHumanoid(this.rig, dt, this.speed, true, {})
    this.rig.parts.gun.visible = true

    this.fireTimer -= dt
    if (this.fireTimer <= 0 && dist < 34 && !game.world.lineBlocked(this.pos.x, this.pos.z, target.x, target.z)) {
      this.fireTimer = rand(1.1, 2.0)
      game.copShoot(this)
    }
  }

  hit(damage, from, game, opts = {}) {
    if (this.dead) return
    this.health -= damage
    if (this.health <= 0) this.kill(game, opts)
  }

  kill(game) {
    if (this.dead) return
    this.dead = true
    this.deadTimer = 0
    this.group.rotation.z = Math.PI / 2
    this.group.rotation.x = rand(-0.3, 0.3)
    this.group.position.y = 0.32
    game.onCopKilled(this)
  }
}

export function spawnInitialPeds(game, count = 34) {
  for (let i = 0; i < count; i++) {
    // Keep the initial spawn near the player so the city feels alive immediately.
    const block = i < 16
      ? { i: randInt(-2, 2), j: randInt(-1, 2) }
      : { i: randInt(-5, 4), j: randInt(-4, 4) }
    const c = { x: GRID * block.i + GRID / 2, z: GRID * block.j + GRID / 2 }
    const off = 24.6
    const side = randInt(0, 3)
    const t = rand(-23, 23)
    let x
    let z
    if (side === 0) { x = c.x + t; z = c.z - off }
    else if (side === 1) { x = c.x + t; z = c.z + off }
    else if (side === 2) { x = c.x - off; z = c.z + t }
    else { x = c.x + off; z = c.z + t }
    game.peds.push(new Ped(game, x, z, { block }))
  }
}
