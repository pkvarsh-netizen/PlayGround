import * as THREE from 'three'
import { clamp, damp, dampAngle, lerp, rand } from './utils.js'
import { createHumanoid, animateHumanoid } from './character.js'

const MAG_SIZE = 12
const RESERVE_MAX = 120

export class Player {
  constructor(game, x = 0, z = 150) {
    this.game = game
    this.rig = createHumanoid({ shirt: 0x2c5f68, pants: 0x22252c, skin: 0xc9906a, castShadow: true })
    this.group = this.rig.group
    this.pos = new THREE.Vector3(x, 0.15, z)
    this.group.position.copy(this.pos)
    game.scene.add(this.group)
    this.heading = Math.PI
    this.group.rotation.y = this.heading
    this.velY = 0
    this.onGround = true
    this.camYaw = 0
    this.camPitch = 0.24
    this.camDist = 5.6
    this.camTarget = new THREE.Vector3(x, 1.6, z)
    this.car = null
    this.health = 100
    this.armor = 0
    this.money = 750
    this.ammo = MAG_SIZE
    this.reserve = 84
    this.magSize = MAG_SIZE
    this.reloading = false
    this.reloadTimer = 0
    this.reloadTime = 1.25
    this.fireCooldown = 0
    this.lastDamage = -10
    this.dead = false
    this.moveSpeed = 0
    this.sprint = false
    this.walkPhase = 0
    this.stepTimer = 0
    this.camera = game.camera
    this.recoil = 0
    this.aimBlend = 0
    this.lastShot = -10
    this.time = 0
    this.enterCooldown = 0
  }

  get forwardXZ() {
    return { x: -Math.sin(this.camYaw), z: -Math.cos(this.camYaw) }
  }

  get rightXZ() {
    return { x: Math.cos(this.camYaw), z: -Math.sin(this.camYaw) }
  }

  update(dt, input) {
    this.time += dt
    const g = this.game
    this.enterCooldown = Math.max(0, this.enterCooldown - dt)
    const look = input.consumeLook()
    if (look.x || look.y) {
      const sens = this.car ? 0.0021 : 0.0024
      this.camYaw -= look.x * sens
      this.camPitch = clamp(this.camPitch + look.y * sens * 0.8, -0.18, 1.05)
      this.lookIdle = 0
    } else {
      this.lookIdle = (this.lookIdle || 0) + dt
    }

    if (this.dead) {
      this.updateCamera(dt, input)
      return
    }

    this.fireCooldown = Math.max(0, this.fireCooldown - dt)

    if (this.reloading) {
      this.reloadTimer -= dt
      if (this.reloadTimer <= 0) {
        const need = this.magSize - this.ammo
        const take = Math.min(need, this.reserve)
        this.ammo += take
        this.reserve -= take
        this.reloading = false
      }
    }

    if (input.wasPressed('reload') && !this.car && !this.reloading && this.ammo < this.magSize && this.reserve > 0) {
      this.startReload()
    }

    if (this.car) {
      this.updateDriving(dt, input)
    } else {
      this.updateOnFoot(dt, input)
    }

    // Regen up to 60 after 6 seconds without damage.
    if (this.time - this.lastDamage > 6 && this.health < 60) {
      this.health = Math.min(60, this.health + dt * 5)
    }

    this.updateCamera(dt, input)
  }

  updateOnFoot(dt, input) {
    const g = this.game
    const mv = input.moveVector()
    const f = this.forwardXZ
    const r = this.rightXZ
    let dx = f.x * mv.y + r.x * mv.x
    let dz = f.z * mv.y + r.z * mv.x
    const len = Math.hypot(dx, dz)
    this.sprint = input.sprinting()
    const maxSpeed = this.sprint ? 8.4 : 4.9
    const targetSpeed = len > 0.05 ? maxSpeed : 0
    this.moveSpeed = damp(this.moveSpeed, targetSpeed, 10, dt)
    if (len > 0.05) {
      dx /= len
      dz /= len
      const desired = Math.atan2(dx, dz)
      this.heading = dampAngle(this.heading, desired, 12, dt)
      this.pos.x += dx * this.moveSpeed * dt
      this.pos.z += dz * this.moveSpeed * dt
    }
    if (input.aiming) {
      const target = Math.atan2(f.x, f.z)
      this.heading = dampAngle(this.heading, target, 16, dt)
    }

    // Jump
    if (input.wasPressed('jump') && this.onGround) {
      this.velY = 5.2
      this.onGround = false
    }
    this.velY -= 18 * dt
    this.pos.y += this.velY * dt
    if (this.pos.y <= 0.15) {
      this.pos.y = 0.15
      this.velY = 0
      this.onGround = true
    }

    g.world.resolveCircle(this.pos, 0.42)
    this.group.visible = true
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z)
    this.group.rotation.y = this.heading
    const aiming = input.aiming && !this.sprint
    this.aimBlend = damp(this.aimBlend, aiming ? 1 : 0, 12, dt)
    animateHumanoid(this.rig, dt, this.moveSpeed, aiming, { fall: false })

    // Footstep dust on sprint
    if (this.sprint && this.moveSpeed > 6.5) {
      this.stepTimer -= dt
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.22
        g.effects.smoke(this.pos.x, 0.1, this.pos.z, 0.25)
      }
    }
  }

  updateDriving(dt, input) {
    const car = this.car
    if (!car || car.destroyed) { this.exitCar(); return }
    car.updatePlayerDriven(dt, input)
    this.pos.copy(car.pos)
    this.group.visible = false
    this.camDist = damp(this.camDist, 8.2, 3, dt)
    // Auto-align the chase camera behind the car when the player isn't looking around.
    if ((this.lookIdle || 0) > 1.1 && Math.abs(car.speed) > 1.5) {
      this.camYaw = dampAngle(this.camYaw, car.heading + Math.PI, 1.6, dt)
    }
  }

  startReload() {
    this.reloading = true
    this.reloadTimer = this.reloadTime
    this.game.audio.reload()
  }

  shoot() {
    if (this.dead || this.car || this.reloading || this.fireCooldown > 0) return
    if (this.ammo <= 0) {
      if (this.reserve > 0) this.startReload()
      return
    }
    this.ammo--
    this.fireCooldown = 0.135
    this.lastShot = this.time
    this.recoil = Math.min(0.05, this.recoil + 0.022)
    const g = this.game
    const cam = g.camera
    const dir = new THREE.Vector3()
    cam.getWorldDirection(dir)
    const origin = cam.position.clone()
    const spread = g.input.aiming ? 0.003 : 0.014
    dir.x += rand(-spread, spread)
    dir.y += rand(-spread, spread)
    dir.z += rand(-spread, spread)
    dir.normalize()
    const muzzle = new THREE.Vector3(this.pos.x, 1.35, this.pos.z)
    muzzle.x += Math.sin(this.heading) * 0.55 + Math.cos(this.heading) * 0.22
    muzzle.z += Math.cos(this.heading) * 0.55 - Math.sin(this.heading) * 0.22
    g.fireBullet(origin, dir, muzzle, true)
    g.effects.muzzle(muzzle.x, muzzle.y, muzzle.z)
    g.effects.addShake(0.08)
    g.audio.gunshot()
    g.scareNearby(this.pos, 22)
    if (this.ammo === 0 && this.reserve > 0) setTimeout(() => this.startReload(), 220)
  }

  hurt(amount, source = null) {
    if (this.dead) return
    this.lastDamage = this.time
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, amount * 0.72)
      this.armor -= absorbed
      amount -= absorbed
    }
    this.health -= amount
    this.game.hud.flashDamage(clamp(0.35 + amount / 40, 0.2, 0.9))
    this.game.audio.hurt()
    this.game.effects.addShake(0.22)
    if (this.health <= 0) {
      this.health = 0
      this.dead = true
      this.game.onPlayerDeath(source)
    }
  }

  enterCar(car) {
    if (this.car || this.dead || this.enterCooldown > 0) return false
    if (car.destroyed) return false
    this.car = car
    car.occupiedByPlayer = true
    car.traffic = false
    car.speed = car.vel.length()
    this.enterCooldown = 0.6
    this.group.visible = false
    this.game.hud.toast('VEHICLE ACQUIRED', 'gold')
    this.game.audio.ui()
    return true
  }

  exitCar() {
    if (!this.car) return
    const car = this.car
    car.occupiedByPlayer = false
    const right = { x: Math.cos(car.heading), z: -Math.sin(car.heading) }
    this.pos.set(car.pos.x + right.x * 2.2, 0.15, car.pos.z + right.z * 2.2)
    this.game.world.resolveCircle(this.pos, 0.5)
    this.car = null
    this.group.visible = true
    this.group.position.copy(this.pos)
    this.enterCooldown = 0.7
    this.velY = 0
    this.camDist = 5.6
    this.game.audio.ui()
  }

  reset(x, z) {
    this.pos.set(x, 0.15, z)
    this.group.position.copy(this.pos)
    this.group.visible = true
    this.car = null
    this.dead = false
    this.health = 100
    this.armor = 0
    this.ammo = MAG_SIZE
    this.reserve = 84
    this.reloading = false
    this.velY = 0
    this.camYaw = 0
    this.camPitch = 0.24
    this.moveSpeed = 0
    this.heading = Math.PI
    this.camTarget.set(x, 1.6, z)
  }

  updateCamera(dt, input) {
    const cam = this.camera
    const aiming = !this.car && input.aiming && !this.dead
    this.aimBlend = damp(this.aimBlend, aiming ? 1 : 0, 10, dt)
    const targetDist = this.car ? 8.2 : lerp(5.6, 3.1, this.aimBlend)
    this.camDist = damp(this.camDist, targetDist, 6, dt)
    this.recoil = damp(this.recoil, 0, 8, dt)

    const pivotX = this.pos.x
    const pivotY = this.car ? 1.5 : 1.52
    const pivotZ = this.pos.z
    this.camTarget.x = damp(this.camTarget.x, pivotX, 14, dt)
    this.camTarget.y = damp(this.camTarget.y, pivotY, 10, dt)
    this.camTarget.z = damp(this.camTarget.z, pivotZ, 14, dt)

    const yaw = this.camYaw
    const pitch = this.camPitch + this.recoil
    const cosP = Math.cos(pitch)
    const offX = Math.sin(yaw) * cosP * this.camDist
    const offY = Math.sin(pitch) * this.camDist + 0.55
    const offZ = Math.cos(yaw) * cosP * this.camDist
    const desired = new THREE.Vector3(this.camTarget.x + offX, this.camTarget.y + offY, this.camTarget.z + offZ)
    if (desired.y < 0.8) desired.y = 0.8
    const safe = this.game.world.collideCamera(this.camTarget, desired)
    const shake = this.game.effects.shake
    const t = performance.now() * 0.01
    safe.x += Math.sin(t * 4.1) * shake * 0.22
    safe.y += Math.sin(t * 5.3) * shake * 0.18
    safe.z += Math.cos(t * 4.7) * shake * 0.22

    cam.position.lerp(safe, 1 - Math.exp(-18 * dt))
    const f = this.forwardXZ
    const r = this.rightXZ
    const shoulder = this.aimBlend * 0.55
    const look = new THREE.Vector3(
      this.camTarget.x + f.x * (this.car ? 5 : 3) + r.x * shoulder,
      this.camTarget.y + (this.aimBlend ? 0.05 : 0.1) - Math.sin(pitch) * 0.4 + (this.car ? 0.4 : 0),
      this.camTarget.z + f.z * (this.car ? 5 : 3) + r.z * shoulder
    )
    cam.lookAt(look)
    cam.rotation.z = 0

    const speedFov = this.car ? clamp(Math.abs(this.car.speed) / this.car.spec.max, 0, 1) * 9 : 0
    const fov = lerp(63, 50, this.aimBlend) + speedFov
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov = damp(cam.fov, fov, 8, dt)
      cam.updateProjectionMatrix()
    }
  }
}
