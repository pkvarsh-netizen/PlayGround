import * as THREE from 'three'
import { World, GRID, CITY_EDGE } from './world.js'
import { Player } from './player.js'
import { Vehicle } from './vehicles.js'
import { Ped, Cop, spawnInitialPeds } from './agents.js'
import { Effects } from './effects.js'
import { GameAudio } from './audio.js'
import { Input } from './input.js'
import { HUD } from './hud.js'
import { MissionManager, MISSIONS } from './missions.js'
import { clamp, rand, randInt, pick, dist2, glowSprite, formatMoney, TAU } from './utils.js'

const VEHICLE_LABELS = {
  sedan: 'Sedan', sports: 'Sports car', suv: 'SUV', van: 'Van', taxi: 'Taxi', police: 'Police cruiser'
}

class Pickup {
  constructor(game, type, x, z, opts = {}) {
    this.game = game
    this.type = type
    this.value = opts.value ?? (type === 'money' ? 100 : 45)
    this.respawnTime = opts.respawn ?? 45
    this.respawn = 0
    this.taken = false
    this.pos = new THREE.Vector3(x, 0.55, z)
    this.phases = rand(0, TAU)
    const g = new THREE.Group()
    const color = type === 'health' ? 0x58ff86 : type === 'armor' ? 0x58a8ff : 0xffd24a
    if (type === 'health') {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x2fff66, emissiveIntensity: 1.5, toneMapped: false })
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.16), mat)
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), mat)
      g.add(a, b)
    } else if (type === 'armor') {
      const mat = new THREE.MeshStandardMaterial({ color: 0x9fd0ff, emissive: 0x2f7fff, emissiveIntensity: 1.1, metalness: 0.6, roughness: 0.25 })
      const shield = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), mat)
      shield.scale.y = 1.25
      g.add(shield)
    } else {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffd86a, emissive: 0xbf8a12, emissiveIntensity: 0.8, metalness: 0.6, roughness: 0.3 })
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.32), mat)
      g.add(box)
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.1, 0.35), new THREE.MeshStandardMaterial({ color: 0x333333 }))
      g.add(band)
    }
    const glow = glowSprite(color, 2.2, 0.55)
    g.add(glow)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.55, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, toneMapped: false })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = -0.35
    g.add(ring)
    this.ring = ring
    this.group = g
    g.position.copy(this.pos)
    game.scene.add(g)
  }

  update(dt, game) {
    if (this.taken) {
      if (this.respawnTime <= 0) return
      this.respawn -= dt
      if (this.respawn <= 0) {
        this.taken = false
        this.group.visible = true
      }
      return
    }
    const t = performance.now() * 0.002 + this.phases
    this.group.rotation.y = t * 0.7
    this.group.position.y = this.pos.y + Math.sin(t) * 0.12
    this.ring.rotation.z = t * 0.5
    const p = game.player
    if (!p.car && !p.dead) {
      const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z)
      if (d < 1.7) this.collect(game)
    }
  }

  collect(game) {
    const p = game.player
    if (this.type === 'health') {
      if (p.health >= 100) return
      p.health = Math.min(100, p.health + 50)
      game.hud.toast('+50 HEALTH', 'health')
    } else if (this.type === 'armor') {
      if (p.armor >= 100) return
      p.armor = Math.min(100, p.armor + 50)
      game.hud.toast('+50 ARMOR', 'armor')
    } else {
      p.money += this.value
      game.hud.toast(`+${formatMoney(this.value)}`, 'money')
    }
    this.taken = true
    this.group.visible = false
    this.respawn = this.respawnTime
    game.audio.pickup()
    if (this.respawnTime <= 0) {
      game.scene.remove(this.group)
      game.pickups = game.pickups.filter((x) => x !== this)
    }
  }
}

class Game {
  constructor() {
    this.canvas = document.getElementById('game')
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance', alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.3
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(63, window.innerWidth / window.innerHeight, 0.1, 1800)
    this.camera.position.set(0, 12, 170)

    this.mode = 'start'
    this.time = 0
    this.startTime = 0
    this.wanted = 0
    this.forcedWanted = 0
    this.lastCrime = -20
    this.decayTimer = 0
    this.policeSpawnTimer = 0
    this.copSpawnTimer = 0
    this.stats = { missions: 0, kills: 0, wrecks: 0 }
    this.respawnTimer = 0
    this.started = false
    this.playerCar = null
    this.peds = []
    this.cops = []
    this.vehicles = []
    this.pickups = []

    this.world = new World(this.scene, this.renderer)
    this.effects = new Effects(this.scene)
    this.audio = new GameAudio()
    this.input = new Input(this.canvas, document.getElementById('mobile-controls'))
    this.input.setTouchMode(this.input.isTouch)
    this.player = new Player(this, 0, 152)
    this.hud = new HUD(this)
    this.missions = new MissionManager(this)

    this.spawnWorld()
    this.bindUI()
    this.setupDebug()
    this.clock = new THREE.Clock()
    window.addEventListener('resize', () => this.resize())
    this.canvas.addEventListener('click', () => {
      if (this.mode === 'playing' && !this.input.pointerLocked && !this.input.isTouch) {
        try { this.canvas.requestPointerLock?.() } catch { /* noop */ }
      }
    })
    document.addEventListener('pointerlockchange', () => {
      if (this.mode === 'playing' && this.input.pointerLocked === false && this._hadLock) {
        this.pause()
      }
      this._hadLock = this.input.pointerLocked
    })
    this.hud.showStart()
    this.animate = this.animate.bind(this)
    requestAnimationFrame(this.animate)
  }

  spawnWorld() {
    // Parked cars near the spawn make the opening shot feel alive.
    const parked = [
      { type: 'sports', x: 5.5, z: 146, heading: Math.PI, color: 0xc8402f },
      { type: 'sedan', x: -5.5, z: 128, heading: 0, color: 0x2f4e78 },
      { type: 'taxi', x: 5.5, z: 96, heading: Math.PI, color: 0xe6b52e },
      { type: 'suv', x: -6, z: 186, heading: 0, color: 0x30363e },
      { type: 'van', x: 6, z: 214, heading: Math.PI, color: 0x9a9a92 }
    ]
    for (const p of parked) {
      const v = new Vehicle(this, p)
      this.vehicles.push(v)
    }
    const trafficTypes = ['sedan', 'sedan', 'taxi', 'suv', 'van', 'sports']
    for (let i = 0; i < 14; i++) {
      const v = new Vehicle(this, { type: pick(trafficTypes), traffic: true })
      this.vehicles.push(v)
    }

    spawnInitialPeds(this, 30)

    this.pickups.push(new Pickup(this, 'health', 13, 143))
    this.pickups.push(new Pickup(this, 'armor', -7, 112))
    this.pickups.push(new Pickup(this, 'health', 41, 52, { respawn: 55 }))
    this.pickups.push(new Pickup(this, 'armor', -105, 152, { respawn: 55 }))
    this.pickups.push(new Pickup(this, 'health', -160, 380, { respawn: 60 }))
    this.pickups.push(new Pickup(this, 'money', 0, 404, { value: 250, respawn: 90 }))
    this.pickups.push(new Pickup(this, 'money', 120, 240, { value: 180, respawn: 90 }))

    this.player.group.visible = false
  }

  bindUI() {
    document.getElementById('play-btn').addEventListener('click', () => this.startGame())
    document.getElementById('resume-btn').addEventListener('click', () => this.resume())
    document.getElementById('restart-btn').addEventListener('click', () => location.reload())
    document.getElementById('pause-btn').addEventListener('click', () => {
      if (this.mode === 'playing') this.pause()
      else if (this.mode === 'paused') this.resume()
    })
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && this.mode === 'start') this.startGame()
      if (e.code === 'Escape' && this.mode === 'paused') this.resume()
    })
  }

  setupDebug() {
    const self = this
    window.__SUNSET = {
      game: self,
      start: () => self.startGame(),
      teleport: (x, z) => { self.player.pos.set(x, 0.15, z); self.player.camTarget.set(x, 1.5, z); },
      giveWanted: (n) => self.setWanted(n),
      time: (h) => { self.world.timeOfDay = h },
      money: (n) => { self.player.money = n },
      missions: MISSIONS,
      mission: () => self.missions.getHudState(),
      state: () => ({
        mode: self.mode,
        wanted: self.wanted,
        health: self.player.health,
        money: self.player.money,
        car: self.player.car?.type || null,
        pedCount: self.peds.filter((p) => !p.dead).length,
        cops: self.cops.filter((c) => !c.dead).length,
        mission: self.missions.getHudState()
      })
    }
  }

  startGame() {
    if (this.started) return
    this.started = true
    this.audio.init()
    this.hud.hideStart()
    this.mode = 'playing'
    this.world.timeOfDay = 17.35
    for (const v of this.vehicles) {
      if (!v.traffic) continue
      if (Math.hypot(v.pos.x, v.pos.z - 152) < 28) {
        const p = this.world.randomRoadPoint(70, { x: 0, z: 152 })
        v.pos.set(p.x, 0, p.z)
        v.mesh.position.copy(v.pos)
        v.speed = 0
      }
    }
    this.player.group.visible = true
    this.player.reset(0, 152)
    this.camera.position.set(0, 5.2, 159)
    this.camera.lookAt(0, 1.5, 145)
    this.hud.toast('WELCOME TO SUNSET CITY', 'gold')
    setTimeout(() => this.hud.toast('WASD move  ·  E enter vehicle  ·  CLICK fire', 'gold'), 1400)
    try { this.canvas.requestPointerLock?.() } catch { /* noop */ }
    this.audio.ui()
  }

  pause() {
    if (this.mode !== 'playing') return
    this.mode = 'paused'
    this.hud.showPause()
    this.audio.setEngine(0, 0)
    this.audio.updateSiren(0, false)
    if (document.pointerLockElement) document.exitPointerLock()
  }

  resume() {
    if (this.mode !== 'paused') return
    this.mode = 'playing'
    this.hud.hidePause()
    this.audio.init()
    try { this.canvas.requestPointerLock?.() } catch { /* noop */ }
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  updateStart(dt) {
    this.startTime += dt
    const a = this.startTime * 0.055 + 0.7
    const r = 265
    this.camera.position.set(Math.cos(a) * r, 78 + Math.sin(this.startTime * 0.2) * 6, Math.sin(a) * r)
    this.camera.lookAt(0, 26, 0)
    this.camera.fov = 55
    this.camera.updateProjectionMatrix()
    this.world.timeOfDay = 17.34 + Math.sin(this.startTime * 0.02) * 0.05
    this.world.updateLighting(dt, this.camera, new THREE.Vector3(0, 0, 0))
    this.playerCar = null
    for (const v of this.vehicles) {
      if (v.destroyed) continue
      if (v.traffic) v.updateTraffic(dt, this)
      else v.updateCoast(dt, this)
      v.coneMat.opacity = this.world.nightFactor * 0.045
    }
    for (const p of this.peds) p.update(dt, this)
    for (const p of this.pickups) p.update(dt, this)
    this.effects.update(dt)
    this.world.pond.material.opacity = 1
  }

  updatePlaying(dt) {
    this.time += dt
    this.playerCar = this.player.car
    const input = this.input

    if (input.wasPressed('pause')) { input.endFrame(); this.pause(); return }
    if (input.wasPressed('mute')) {
      this.audio.setMuted(!this.audio.muted)
      this.hud.toast(this.audio.muted ? 'AUDIO MUTED' : 'AUDIO ON', '')
    }

    this.player.update(dt, input)
    if (!this.player.dead && !this.player.car && input.firing) this.player.shoot()
    if (input.wasPressed('enter')) this.toggleVehicle()

    this.updateVehicles(dt)
    for (const p of this.peds) p.update(dt, this)
    for (const c of this.cops) c.update(dt, this)
    for (const p of this.pickups) p.update(dt, this)
    this.peds = this.peds.filter((p) => !p.removed)
    this.cops = this.cops.filter((c) => !c.removed)
    this.updatePickupPrompt()
    this.collideVehicles()
    this.missions.update(dt)
    this.updateWanted(dt)
    this.effects.update(dt)
    this.world.updateLighting(dt, this.camera, this.player.pos)

    const night = this.world.nightFactor
    for (const v of this.vehicles) {
      if (v.destroyed) continue
      v.coneMat.opacity = night * 0.05
    }
    this.audio.setEngine(
      this.player.car ? clamp(Math.abs(this.player.car.speed) / this.player.car.spec.max, 0, 1) : 0,
      this.player.car && input.down('KeyW') ? 1 : 0
    )
    this.audio.updateSiren(dt, this.wanted > 0 && this.nearestPoliceDist() < 140)
    this.hud.update(dt, this)

    if (this.player.dead && this.respawnTimer > 0) {
      this.respawnTimer -= dt
      if (this.respawnTimer <= 0) this.respawn()
    }
    input.endFrame()
  }

  toggleVehicle() {
    if (this.player.dead) return
    if (this.player.car) {
      this.player.exitCar()
      return
    }
    let nearest = null
    let best = 4.0
    for (const v of this.vehicles) {
      if (v.destroyed || v.occupiedByPlayer) continue
      const d = Math.hypot(v.pos.x - this.player.pos.x, v.pos.z - this.player.pos.z)
      if (d < best) { best = d; nearest = v }
    }
    if (!nearest) return
    if (nearest.traffic) {
      this.raiseWanted(1, 'Grand theft auto')
      nearest.traffic = false
      this.scareNearby(nearest.pos, 22)
      this.hud.toast('GRAND THEFT AUTO', 'red')
    } else if (nearest.police) {
      this.raiseWanted(2, 'Police cruiser stolen')
    }
    nearest.speed = 0
    nearest.vel.set(0, 0)
    this.player.enterCar(nearest)
  }

  updatePickupPrompt() {
    if (this.player.dead) { this.hud.setPrompt(''); return }
    if (this.player.car) {
      this.hud.setPrompt(this.player.car.speedKmh < 18 ? 'E  ·  Exit vehicle' : '')
      return
    }
    let best = null
    let bestD = 3.8
    for (const v of this.vehicles) {
      if (v.destroyed) continue
      const d = Math.hypot(v.pos.x - this.player.pos.x, v.pos.z - this.player.pos.z)
      if (d < bestD) { bestD = d; best = v }
    }
    if (best) {
      this.hud.setPrompt(`E  ·  ${best.occupiedByPlayer ? 'Exit' : 'Enter'} ${VEHICLE_LABELS[best.type] || 'vehicle'}`)
      return
    }
    const obj = this.missions.getHudState()
    if (obj && obj.distance != null && obj.distance < 9) {
      this.hud.setPrompt('Gold marker  ·  walk in to begin')
      return
    }
    this.hud.setPrompt('')
  }

  updateVehicles(dt) {
    for (const v of this.vehicles) {
      if (v.occupiedByPlayer) continue
      const playerDist = Math.hypot(v.pos.x - this.player.pos.x, v.pos.z - this.player.pos.z)
      if (!v.destroyed) v.mesh.visible = playerDist < 150
      if (v.destroyed) {
        v.wreckTimer = (v.wreckTimer ?? 32) - dt
        v.burnTimer = (v.burnTimer || 0) - dt
        if (v.burnTimer <= 0 && v.wreckTimer > 0) {
          v.burnTimer = 0.3
          this.effects.fire(v.pos.x + rand(-0.6, 0.6), 0.9, v.pos.z + rand(-0.6, 0.6), 1)
          this.effects.smoke(v.pos.x, 1.4, v.pos.z, 1.4)
        }
        continue
      }
      if (v.police) v.updatePolice(dt, this)
      else if (v.traffic) v.updateTraffic(dt, this)
      else v.updateCoast(dt, this)

      if (!this.player.car && !this.player.dead) {
        const d = Math.hypot(v.pos.x - this.player.pos.x, v.pos.z - this.player.pos.z)
        if (d < 1.6 && Math.abs(v.speed) > 3.5) {
          this.player.hurt(clamp(Math.abs(v.speed) * 1.4, 6, 26), v)
          this.player.pos.x += (this.player.pos.x - v.pos.x) / (d || 1) * 1.2
          this.player.pos.z += (this.player.pos.z - v.pos.z) / (d || 1) * 1.2
          this.effects.sparks(this.player.pos.x, 1, this.player.pos.z, 5)
          this.effects.addShake(0.4)
        }
      }
    }
    this.vehicles = this.vehicles.filter((v) => !(v.destroyed && (v.wreckTimer ?? 0) <= 0))
  }

  collideVehicles() {
    const vs = this.vehicles
    for (let i = 0; i < vs.length; i++) {
      const a = vs[i]
      if (a.destroyed) continue
      for (let j = i + 1; j < vs.length; j++) {
        const b = vs[j]
        if (b.destroyed) continue
        const dx = b.pos.x - a.pos.x
        const dz = b.pos.z - a.pos.z
        const min = 3.2
        const d2 = dx * dx + dz * dz
        if (d2 > min * min || d2 < 1e-6) continue
        const d = Math.sqrt(d2)
        const nx = dx / d
        const nz = dz / d
        const push = (min - d) / 2
        a.pos.x -= nx * push
        a.pos.z -= nz * push
        b.pos.x += nx * push
        b.pos.z += nz * push
        const rel = Math.abs(a.speed) + Math.abs(b.speed)
        if (rel > 7) {
          if (!a.occupiedByPlayer) a.health -= rel * 0.25
          if (!b.occupiedByPlayer) b.health -= rel * 0.25
          if (a.occupiedByPlayer || b.occupiedByPlayer) {
            this.effects.sparks((a.pos.x + b.pos.x) / 2, 0.7, (a.pos.z + b.pos.z) / 2, 9)
            this.effects.addShake(0.28)
          }
        }
      }
    }
  }

  nearestPoliceDist() {
    let min = 999
    for (const v of this.vehicles) if (v.police && !v.destroyed) min = Math.min(min, Math.hypot(v.pos.x - this.player.pos.x, v.pos.z - this.player.pos.z))
    for (const c of this.cops) if (!c.dead) min = Math.min(min, Math.hypot(c.pos.x - this.player.pos.x, c.pos.z - this.player.pos.z))
    return min
  }

  updateWanted(dt) {
    this.policeSpawnTimer -= dt
    this.copSpawnTimer -= dt
    if (this.wanted > 0) {
      if (!this.forcedWanted && this.time - this.lastCrime > 7) {
        if (this.nearestPoliceDist() > 62) {
          this.decayTimer += dt
          if (this.decayTimer > 5.5) {
            this.decayTimer = 0
            this.setWanted(this.wanted - 1)
            if (this.wanted === 0) {
              this.hud.toast('YOU LOST THE COPS', 'gold')
              this.audio.notify(true)
            }
          }
        } else {
          this.decayTimer = 0
        }
      } else {
        this.decayTimer = 0
      }

      const policeCars = this.vehicles.filter((v) => v.police && !v.destroyed && !v.occupiedByPlayer)
      if (this.policeSpawnTimer <= 0 && policeCars.length < Math.min(6, this.wanted + 1)) {
        this.policeSpawnTimer = Math.max(2.5, 7 - this.wanted)
        const p = this.world.randomRoadPoint(85, this.player.pos)
        const car = new Vehicle(this, { type: 'police', police: true, x: p.x, z: p.z, heading: rand(0, TAU) })
        this.vehicles.push(car)
      }
      const footCops = this.cops.filter((c) => !c.dead && !c.isThug)
      if (this.wanted >= 2 && this.copSpawnTimer <= 0 && footCops.length < Math.min(5, this.wanted)) {
        this.copSpawnTimer = Math.max(2.5, 7 - this.wanted)
        const p = this.world.randomRoadPoint(28, this.player.pos)
        this.cops.push(new Cop(this, p.x, p.z))
      }
    } else {
      this.decayTimer = 0
      if (this.time % 1 < dt) {
        for (const c of this.cops) {
          if (c.dead || c.isThug) continue
          if (Math.hypot(c.pos.x - this.player.pos.x, c.pos.z - this.player.pos.z) > 80) { c.removed = true; this.scene.remove(c.group) }
        }
        for (const v of this.vehicles) {
          if (!v.police || v.destroyed || v.occupiedByPlayer) continue
          if (Math.hypot(v.pos.x - this.player.pos.x, v.pos.z - this.player.pos.z) > 110) { v.destroyed = true; v.wreckTimer = 0 }
        }
      }
    }
  }

  setWanted(n, silent = false) {
    const prev = this.wanted
    this.wanted = clamp(Math.round(n), 0, 5)
    if (this.wanted > prev && !silent) {
      this.hud.toast(`WANTED LEVEL ${this.wanted}`, 'red')
      this.audio.notify(true)
      this.policeSpawnTimer = Math.min(this.policeSpawnTimer, 1.2)
      this.decayTimer = 0
    }
    if (this.wanted === 0) {
      this.forcedWanted = 0
    }
  }

  raiseWanted(level, label = '') {
    if (this.mode !== 'playing') return
    this.lastCrime = this.time
    const target = Math.max(this.wanted, Math.min(5, level + (this.wanted >= 1 ? 0 : 0)))
    const next = Math.max(this.wanted, Math.min(5, target))
    if (next > this.wanted) {
      this.setWanted(next)
      if (label) this.hud.toast(label.toUpperCase(), 'red')
    }
  }

  addCrime(stars, label) {
    this.lastCrime = this.time
    if (this.wanted < stars) this.setWanted(stars, true)
    if (label) this.hud.toast(label.toUpperCase(), 'red')
  }

  fireBullet(origin, dir, muzzle, byPlayer) {
    const raycaster = new THREE.Raycaster(origin, dir, 0.2, 150)
    const targets = [this.world.ground, ...this.world.buildingMeshes]
    for (const v of this.vehicles) if (!v.destroyed) targets.push(v.mesh)
    for (const p of this.peds) if (!p.dead) targets.push(p.group)
    for (const c of this.cops) if (!c.dead) targets.push(c.group)
    const hits = raycaster.intersectObjects(targets, true)
    let point = origin.clone().addScaledVector(dir, 120)
    let hitObj = null
    if (hits.length) {
      point.copy(hits[0].point)
      hitObj = hits[0].object
    }
    this.effects.tracer(muzzle, point)

    let owner = hitObj
    while (owner && !owner.userData.ped && !owner.userData.cop && !owner.userData.vehicle) owner = owner.parent
    let killed = false
    if (owner?.userData.ped) {
      const ped = owner.userData.ped
      const head = point.y - ped.pos.y > 1.48
      const dmg = head ? 120 : 34
      const wasDead = ped.dead
      ped.hit(dmg, origin, this, { byPlayer })
      this.effects.blood(point.x, point.y, point.z, dir)
      this.hud.hitmarker(!wasDead && ped.dead)
      killed = !wasDead && ped.dead
    } else if (owner?.userData.cop) {
      const cop = owner.userData.cop
      const head = point.y - cop.pos.y > 1.48
      const dmg = head ? 140 : 34
      const wasDead = cop.dead
      cop.hit(dmg, origin, this, { byPlayer })
      this.effects.blood(point.x, point.y, point.z, dir)
      this.hud.hitmarker(!wasDead && cop.dead)
      killed = !wasDead && cop.dead
    } else if (owner?.userData.vehicle) {
      const v = owner.userData.vehicle
      v.applyDamage(13, this)
      this.effects.sparks(point.x, point.y, point.z, 6, 0xffc76a)
      this.hud.hitmarker(false)
    } else if (hitObj) {
      this.effects.sparks(point.x, point.y, point.z, 4, 0xd8d0b8)
    }

    if (byPlayer) {
      this.scareNearby(point, 12)
      if (this.time - (this._lastGunCrime || 0) > 1.4) {
        let noisy = this.wanted > 0
        if (!noisy) {
          for (const p of this.peds) {
            if (!p.dead && dist2(p.pos.x, p.pos.z, this.player.pos.x, this.player.pos.z) < 30) { noisy = true; break }
          }
        }
        if (!noisy) {
          for (const c of this.cops) {
            if (!c.dead && dist2(c.pos.x, c.pos.z, this.player.pos.x, this.player.pos.z) < 45) { noisy = true; break }
          }
        }
        if (noisy) {
          this._lastGunCrime = this.time
          this.addCrime(this.wanted + 1, 'Discharging a firearm')
        }
      }
      this.stats.kills += killed ? 1 : 0
    }
  }

  copShoot(cop) {
    if (cop.dead || this.player.dead) return
    const target = this.player.car ? this.player.car.pos : this.player.pos
    const from = new THREE.Vector3(cop.pos.x, 1.35, cop.pos.z)
    const to = new THREE.Vector3(target.x + rand(-0.7, 0.7), 1.15, target.z + rand(-0.7, 0.7))
    const origin = new THREE.Vector3(cop.pos.x, 1.35, cop.pos.z)
    this.effects.tracer(from, to, 0xffb25a)
    this.effects.muzzle(from.x, from.y, from.z)
    this.audio.gunshot()
    if (Math.random() < 0.62) {
      if (this.player.car) {
        this.player.car.applyDamage(rand(5, 11), this)
        if (Math.random() < 0.25) this.player.hurt(rand(2, 5))
        this.effects.sparks(to.x, to.y, to.z, 3, 0xffd080)
      } else {
        this.player.hurt(rand(5, 9), cop)
        this.effects.blood(target.x, 1.2, target.z, null)
      }
    } else {
      this.effects.sparks(to.x, to.y, to.z, 3, 0xffd080)
    }
  }

  scareNearby(pos, radius) {
    for (const p of this.peds) p.scare(pos, radius)
  }

  runOver(vehicle, agent) {
    if (agent.dead) return
    const isCop = agent instanceof Cop
    const byPlayer = !!vehicle.occupiedByPlayer
    if (isCop) {
      agent.dead = true
      agent.deadTimer = 0
      agent.group.rotation.z = Math.PI / 2
      agent.group.position.y = 0.32
      this.onCopKilled(agent)
    } else {
      agent.kill(this, { byPlayer })
    }
    this.effects.blood(agent.pos.x, 0.5, agent.pos.z, null)
    this.effects.addShake(0.35)
    this.audio.thud()
    vehicle.health -= 6
    if (byPlayer) {
      this.addCrime(isCop ? 3 : 2, isCop ? 'Cop killer' : 'Vehicular manslaughter')
      this.stats.kills++
    }
  }

  onPedKilled(ped, opts = {}) {
    if (opts.byPlayer) {
      this.addCrime(2, 'Murder')
      this.stats.kills++
      this.spawnMoneyDrop(ped.pos, randInt(20, 75))
    }
    this.scareNearby(ped.pos, 24)
  }

  onCopKilled(cop) {
    if (cop.isThug) {
      this.missions.registerKill(cop)
      this.spawnMoneyDrop(cop.pos, randInt(60, 140))
      this.stats.kills++
      return
    }
    this.addCrime(3, 'Cop killer')
    this.stats.kills++
    this.spawnMoneyDrop(cop.pos, randInt(30, 90))
  }

  spawnThug(x, z) {
    const t = new Cop(this, x, z, { thug: true })
    this.cops.push(t)
    return t
  }

  spawnMoneyDrop(pos, value) {
    this.pickups.push(new Pickup(this, 'money', pos.x, pos.z, { value, respawn: 0 }))
    const p = this.pickups[this.pickups.length - 1]
    p.pos.y = 0.35
    p.group.position.y = 0.35
  }

  explodeVehicle(v) {
    if (v.destroyed) return
    v.destroyed = true
    v.health = 0
    v.wreckTimer = 34
    v.burnTimer = 0
    v.vel.set(0, 0)
    v.speed = 0
    this.stats.wrecks++
    this.effects.explosion(v.pos.x, 0.8, v.pos.z)
    this.audio.explosion()
    for (const o of [v.mesh]) {
      o.traverse((child) => {
        if (!child.isMesh) return
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        for (const m of mats) {
          if (m.color) m.color.setHex(0x101012)
          if ('emissiveIntensity' in m) m.emissiveIntensity = 0
        }
      })
    }
    if (v.meshData.redGlow) v.meshData.redGlow.material.opacity = 0
    if (v.meshData.blueGlow) v.meshData.blueGlow.material.opacity = 0

    const scorch = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 20),
      new THREE.MeshBasicMaterial({ color: 0x0b0b0c, transparent: true, opacity: 0.75, depthWrite: false })
    )
    scorch.rotation.x = -Math.PI / 2
    scorch.position.set(v.pos.x, 0.03, v.pos.z)
    this.scene.add(scorch)

    const playerDist = Math.hypot(v.pos.x - this.player.pos.x, v.pos.z - this.player.pos.z)
    if (this.player.car === v) {
      this.player.car = null
      v.occupiedByPlayer = false
      this.player.group.visible = true
      this.player.pos.set(v.pos.x + rand(-2.5, 2.5), 0.15, v.pos.z + rand(-2.5, 2.5))
      this.player.hurt(55, v)
      this.hud.toast('YOUR RIDE IS TOAST', 'red')
    } else if (playerDist < 9) {
      this.player.hurt(clamp(50 - playerDist * 4, 5, 50), v)
    }
    for (const p of this.peds) {
      if (p.dead) continue
      const d = Math.hypot(p.pos.x - v.pos.x, p.pos.z - v.pos.z)
      if (d < 7) p.kill(this, { silent: true })
      else p.scare(v.pos, 40)
    }
    for (const c of this.cops) {
      if (c.dead) continue
      const d = Math.hypot(c.pos.x - v.pos.x, c.pos.z - v.pos.z)
      if (d < 7) {
        c.dead = true
        c.group.rotation.z = Math.PI / 2
        c.group.position.y = 0.32
      }
    }
    for (const other of this.vehicles) {
      if (other === v || other.destroyed) continue
      const d = Math.hypot(other.pos.x - v.pos.x, other.pos.z - v.pos.z)
      if (d < 7) other.applyDamage(55, this)
    }
    if (v.police) this.addCrime(2, 'Police vehicle destroyed')
    else if (v.traffic) this.addCrime(1, 'Vehicle destroyed')
  }

  onPlayerDeath(source) {
    if (this.player.dead && this.respawnTimer > 0) return
    this.player.dead = true
    this.player.money = Math.max(0, this.player.money - 200)
    this.respawnTimer = 4.2
    this.hud.showWasted('WASTED', 'Medical bills  ·  -$200')
    this.audio.setEngine(0, 0)
    if (this.player.car) {
      this.player.car.occupiedByPlayer = false
      this.player.car = null
    }
    this.missions.fail('You were wasted')
    this.effects.addShake(1)
  }

  respawn() {
    this.player.reset(0, 152)
    this.setWanted(0, true)
    this.forcedWanted = 0
    this.camera.position.set(0, 5.5, 160)
    this.camera.lookAt(0, 1.5, 150)
    this.respawnTimer = 0
    this.hud.toast('RELEASED FROM HOSPITAL', 'health')
    this.decayTimer = 0
  }

  animate() {
    requestAnimationFrame(this.animate)
    const dt = Math.min(this.clock.getDelta(), 0.05)
    if (this.mode === 'start') {
      this.updateStart(dt)
    } else if (this.mode === 'playing') {
      this.updatePlaying(dt)
    }
    this.renderer.render(this.scene, this.camera)
  }
}

function boot() {
  if (window.__sunsetBooted) return
  window.__sunsetBooted = true
  try {
    window.game = new Game()
    window.__gameReady = true
  } catch (err) {
    console.error(err)
    const el = document.getElementById('fatal')
    if (el) {
      el.textContent = 'Failed to start: ' + err.message
      el.style.display = 'block'
    }
  }
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot)
else boot()
