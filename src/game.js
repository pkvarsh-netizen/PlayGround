import * as THREE from 'three'
import { buildCity, CITY } from './world.js'
import {
  createCarMesh, createHumanoid, createBeacon, createCashPickup, createHealthPickup,
  createArmorPickup, updateBeacon, makeTracer
} from './entities.js'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, t) => a + (b - a) * t
const rand = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[(Math.random() * arr.length) | 0]
const TAU = Math.PI * 2
function angleDelta(a, b) {
  let d = (a - b + Math.PI) % TAU
  if (d < 0) d += TAU
  return d - Math.PI
}
function lerpAngle(a, b, t) { return a + angleDelta(b, a) * t }

const CAR_COLORS = ['#b23a3a', '#2f5d8a', '#c9a53f', '#e4e0d6', '#232327', '#3f7a58', '#d06a2f', '#6d4d86', '#7d858c']
const CAR_NAMES = ['Sabre Turbo', 'Banshee', 'Sultan RS', 'Comet', 'Buffalo', 'Phoenix', 'Dominator', 'Futo GT', 'Penumbra']
const CIV_SHIRTS = ['#b74b4b', '#3f7a9a', '#d8b25a', '#4f7a4a', '#a05a8a', '#d7d2c6', '#2d3b54', '#c47a3d', '#696a72']
const CIV_PANTS = ['#2a3550', '#3c3a37', '#1e2633', '#55524b', '#3e4a5c']
const SKINS = ['#c98d64', '#9b6647', '#e0b08a', '#7a4a32', '#d6a077', '#b07a52']

class Car {
  constructor(game, opts) {
    const { x, z, heading = 0, color = pick(CAR_COLORS), police = false, mode = 'parked', name = 'Sabre Turbo' } = opts
    const built = createCarMesh(color, police)
    this.game = game
    this.group = built.group
    this.mesh = built.mesh
    this.siren = built.siren
    this.pos = new THREE.Vector3(x, 0, z)
    this.heading = heading
    this.speed = 0
    this.steer = 0
    this.health = 100
    this.mode = mode
    this.name = police ? 'Police Cruiser' : name
    this.police = police
    this.color = color
    this.path = null
    this.wp = 0
    this.sirenPhase = Math.random() * 10
    this.shootTimer = rand(1, 3)
    this.dead = false
    this.group.position.copy(this.pos)
    this.group.rotation.y = heading
    this.group.userData.type = 'car'
    this.group.userData.car = this
    this.game.scene.add(this.group)
  }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading))
  }

  sync(dt) {
    this.group.position.copy(this.pos)
    this.group.rotation.y = this.heading
    this.mesh.rotation.z = lerp(this.mesh.rotation.z, -this.steer * 0.035 * clamp(Math.abs(this.speed) / 12, 0, 1), Math.min(1, dt * 8))
    if (this.police) {
      this.sirenPhase += dt * 8
      const on = Math.sin(this.sirenPhase) > 0
      for (const m of this.siren.red) m.color.setHex(on ? 0xff2233 : 0x3a0a10)
      for (const m of this.siren.blue) m.color.setHex(on ? 0x0a1a4a : 0x2266ff)
    }
  }
}

class Walker {
  constructor(game, opts) {
    this.game = game
    this.pos = new THREE.Vector3(opts.x, opts.y ?? 0.24, opts.z)
    this.heading = rand(-Math.PI, Math.PI)
    this.speed = opts.cop ? 3.2 : rand(1.1, 1.7)
    this.path = opts.path || null
    this.wp = opts.wp || 0
    this.hp = opts.cop ? 80 : 60
    this.dead = false
    this.deadTime = 0
    this.cop = !!opts.cop
    this.phase = Math.random() * 10
    this.shootTimer = rand(1.2, 2.6)
    this.panic = 0
    this.hitTimer = 0
    this.human = createHumanoid({
      shirt: opts.cop ? '#1c2a4d' : pick(CIV_SHIRTS),
      pants: opts.cop ? '#141c30' : pick(CIV_PANTS),
      skin: pick(SKINS),
      cop: !!opts.cop,
      armed: !!opts.cop
    })
    this.human.group.position.copy(this.pos)
    this.human.group.rotation.y = this.heading
    this.human.group.userData.type = opts.cop ? 'cop' : 'ped'
    this.human.group.userData.walker = this
    game.scene.add(this.human.group)
  }

  animate(dt, moving) {
    this.phase += dt * (moving ? this.speed * 3.4 : 0)
    if (moving) this.human.setWalk(clamp(this.speed / 3.4, 0.5, 1.4))
    else this.human.setIdle(this.phase)
  }

  die() {
    if (this.dead) return
    this.dead = true
    this.deadTime = 0
    this.deadPath = this.path
  }

  updateDeath(dt) {
    this.deadTime += dt
    this.human.die(this.deadTime)
    if (this.deadTime > 5) {
      this.game.scene.remove(this.human.group)
      this.removed = true
    }
  }

  update(dt) {
    if (this.dead) { this.updateDeath(dt); return }
    if (this.cop) { this.updateCop(dt); return }
    let dir = null
    if (this.game.panic > 0) {
      const away = new THREE.Vector3(this.pos.x - this.game.player.pos.x, 0, this.pos.z - this.game.player.pos.z)
      if (away.lengthSq() < 1) away.set(1, 0, 0)
      away.normalize()
      this.heading = lerpAngle(this.heading, Math.atan2(away.x, away.z), Math.min(1, dt * 5))
      this.speed = lerp(this.speed, 3.4, dt * 3)
      dir = away
    } else if (this.path) {
      const target = this.path[this.wp]
      const dx = target.x - this.pos.x
      const dz = target.z - this.pos.z
      const dist = Math.hypot(dx, dz)
      if (dist < 2) this.wp = (this.wp + 1) % this.path.length
      this.heading = lerpAngle(this.heading, Math.atan2(dx, dz), Math.min(1, dt * 4))
      this.speed = lerp(this.speed, 1.35, dt * 2)
    }
    if (!dir) dir = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading))
    this.pos.x += dir.x * this.speed * dt
    this.pos.z += dir.z * this.speed * dt
    // stay out of buildings
    this.game.resolveCircle(this.pos, 0.42)
    this.human.group.position.copy(this.pos)
    this.human.group.rotation.y = this.heading
    this.animate(dt, true)
  }

  updateCop(dt) {
    const p = this.game.player
    const dx = p.pos.x - this.pos.x
    const dz = p.pos.z - this.pos.z
    const dist = Math.hypot(dx, dz) || 1
    this.shootTimer -= dt
    if (dist > 9) {
      this.heading = lerpAngle(this.heading, Math.atan2(dx, dz), Math.min(1, dt * 5))
      this.speed = lerp(this.speed, 3.5, dt * 3)
      this.pos.x += Math.sin(this.heading) * this.speed * dt
      this.pos.z += Math.cos(this.heading) * this.speed * dt
      this.animate(dt, true)
    } else {
      this.heading = lerpAngle(this.heading, Math.atan2(dx, dz), Math.min(1, dt * 8))
      this.speed = 0
      this.human.aim()
    }
    this.game.resolveCircle(this.pos, 0.42)
    this.human.group.position.copy(this.pos)
    this.human.group.rotation.y = this.heading
    if (dist < 30 && this.shootTimer <= 0) {
      this.shootTimer = rand(1.1, 2.1)
      const miss = Math.random() < 0.34
      const target = new THREE.Vector3(p.pos.x, p.pos.y + 1.35, p.pos.z)
      if (miss) target.x += rand(-2.4, 2.4), target.z += rand(-2.4, 2.4)
      const origin = new THREE.Vector3(this.pos.x, this.pos.y + 1.45, this.pos.z)
      this.game.addTracer(origin, target, 0xffc98a)
      this.game.audio.playGunshot(0.45)
      if (!miss) this.game.damagePlayer(rand(4, 8), 'cop')
      this.hitTimer = 0.1
    }
  }
}

export class Game {
  constructor(canvas, input) {
    this.canvas = canvas
    this.input = input
    this.time = 0
    this.started = false
    this.paused = false
    this.mapOpen = false
    this.dead = false
    this.deadTimer = 0
    this.money = 750
    this.health = 100
    this.armor = 0
    this.wanted = 0
    this.crimeCooldown = 0
    this.evadeTimer = 0
    this.policeTimer = 0
    this.carSpawnTimer = 0.6
    this.footSpawnTimer = 1.8
    this.policeWindDown = 0
    this.panic = 0
    this.hurt = 0
    this.shake = 0
    this.dayTime = 0.716
    this.fireCooldown = 0
    this.aimTimer = 0
    this.toastKinds = []
    this.effects = []
    this._hudCache = {}
    this._clockCache = ''

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.pixelBase = Math.min(window.devicePixelRatio || 1, 1.5)
    this.renderScale = 1
    this._perfLast = 0
    this._perfAcc = 0
    this._perfFrames = 0
    this.renderer.setPixelRatio(this.pixelBase)
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.26

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900)

    this.world = buildCity(this.scene)

    // ------------------------------------------------------------- player ---
    this.spawn = new THREE.Vector3(28, 0, 170)
    this.player = {
      pos: this.spawn.clone(),
      heading: Math.PI,
      vx: 0, vz: 0, vy: 0,
      onGround: true,
      speed: 0,
      car: null,
      phase: 0,
      groundY: 0
    }
    this.humanoid = createHumanoid({ player: true, armed: true, shirt: '#3f7080', pants: '#3b4a6a', skin: '#d29a70', hair: '#1a1310' })
    this.humanoid.group.position.copy(this.player.pos)
    this.humanoid.group.rotation.y = this.player.heading
    this.scene.add(this.humanoid.group)

    this.camYaw = 0
    this.camPitch = 0.24
    this.camOrbit = 0
    this.camPos = new THREE.Vector3(28, 7, 190)
    this.intro = 0
    this.attractTime = 0

    this.cars = []
    this.peds = []
    this.police = []
    this.pickups = []
    this.beacons = {}

    this.setupTraffic()
    this.setupPeds()
    this.setupPickups()
    this.setupBeacons()
    this.setupMission()
    this.audio = { playGunshot() {}, playCash() {}, playHurt() {}, setDriving() {}, setSiren() {}, update() {}, cycleStation: () => 'SUNSET FM 89.1', init() {}, resume() {} }
    this.audioReady = false

    window.addEventListener('resize', () => this.resize())
    this.resize()
    this.updateCamera(0.016, true)
  }

  setAudio(audio) {
    this.audio = audio
  }

  start() {
    if (this.started) return
    this.started = true
    this.intro = 1.6
    this.audio.init()
    this.audio.resume()
    this.audio.setDriving(false)
    document.body.classList.add('playing')
    this.canvas.requestPointerLock?.()
    this.toast('WELCOME TO SUNSET CITY', 'gold')
    setTimeout(() => this.toast('MISSION: COURIER — collect the packages', 'info'), 900)
    setTimeout(() => {
      if (!this.player.car) {
        const touch = this.input.isTouch || document.body.classList.contains('touch')
        this.toast(touch ? 'LEFT STICK TO MOVE · DRAG TO LOOK · TAP ENTER' : 'WASD to move · F to steal a car · click to aim', 'soft')
      }
    }, 2200)
  }

  resize() {
    this.applyRenderScale()
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
  }

  applyRenderScale() {
    this.renderer.setPixelRatio(this.pixelBase * this.renderScale)
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  updateAdaptiveResolution() {
    const now = performance.now()
    if (this._perfLast) {
      this._perfAcc += now - this._perfLast
      this._perfFrames++
      if (this._perfAcc > 2200) {
        const fps = (this._perfFrames * 1000) / this._perfAcc
        let next = this.renderScale
        if (fps < 40 && this.renderScale > 0.7) next = Math.max(0.7, this.renderScale - 0.1)
        else if (fps > 56 && this.renderScale < 1) next = Math.min(1, this.renderScale + 0.05)
        this._perfAcc = 0
        this._perfFrames = 0
        if (next !== this.renderScale) {
          this.renderScale = next
          this.applyRenderScale()
        }
      }
    }
    this._perfLast = now
  }

  // ------------------------------------------------------------- world gen ---
  setupTraffic() {
    const blocks = this.world.blockCenters
    for (let i = 0; i < 16; i++) {
      let b = pick(blocks)
      let tries = 0
      while (Math.hypot(b.x - 28, b.z - 170) < 45 && tries++ < 24) b = pick(blocks)
      const radius = 26
      const dir = Math.random() < 0.5 ? 1 : -1
      let path = [
        { x: b.x + radius, z: b.z - radius },
        { x: b.x + radius, z: b.z + radius },
        { x: b.x - radius, z: b.z + radius },
        { x: b.x - radius, z: b.z - radius }
      ]
      if (dir < 0) path = path.slice().reverse()
      const start = path[0]
      const car = new Car(this, {
        x: start.x, z: start.z, heading: Math.atan2(path[1].x - start.x, path[1].z - start.z),
        color: pick(CAR_COLORS), mode: 'traffic', name: pick(CAR_NAMES)
      })
      car.path = path
      car.wp = 1
      car.speed = rand(6, 10)
      this.cars.push(car)
    }

    // parked cars
    const spots = this.world.parkingSpots.filter((s) => Math.hypot(s.x - 28, s.z - 170) > 22).sort(() => Math.random() - 0.5).slice(0, 14)
    for (const s of spots) {
      const car = new Car(this, {
        x: s.x, z: s.z, heading: s.heading, color: pick(CAR_COLORS), mode: 'parked', name: pick(CAR_NAMES)
      })
      this.cars.push(car)
    }
    // guaranteed ride right next to the player
    this.starterCar = new Car(this, {
      x: 30.8, z: 166.5, heading: Math.PI, color: '#b23a3a', mode: 'parked', name: 'Sabre Turbo'
    })
    this.cars.push(this.starterCar)
  }

  setupPeds() {
    const blocks = this.world.blockCenters
    for (let i = 0; i < 18; i++) {
      const b = pick(blocks)
      const r = 18.6
      const path = [
        { x: b.x + r, z: b.z - r }, { x: b.x + r, z: b.z + r },
        { x: b.x - r, z: b.z + r }, { x: b.x - r, z: b.z - r }
      ]
      const start = path[(Math.random() * 4) | 0]
      this.peds.push(new Walker(this, { x: start.x, z: start.z, path, wp: (path.indexOf(start) + 1) % 4, y: 0.24 }))
    }
  }

  setupPickups() {
    const spots = this.world.missionSpots.slice().sort(() => Math.random() - 0.5)
    const make = (type, n) => {
      for (let i = 0; i < n; i++) {
        const s = spots.pop()
        if (!s) break
        const group = type === 'cash' ? createCashPickup() : type === 'health' ? createHealthPickup() : createArmorPickup()
        group.position.set(s.x, 0.24, s.z)
        this.scene.add(group)
        this.pickups.push({ type, group, baseY: 0.24, taken: false, timer: 0, pos: new THREE.Vector3(s.x, 0.24, s.z) })
      }
    }
    make('cash', 14)
    make('health', 5)
    make('armor', 4)
  }

  addBeacon(name, color) {
    const beacon = createBeacon(color)
    this.scene.add(beacon)
    this.beacons[name] = beacon
    return beacon
  }

  setupBeacons() {
    this.addBeacon('mission', 0xffd25e)
    this.addBeacon('offer', 0x7dffb0)
  }

  setBeacon(beacon, x, z, color) {
    beacon.visible = true
    beacon.position.set(x, 0.24, z)
    if (color !== undefined) {
      const c = new THREE.Color(color)
      const u = beacon.userData
      u.ringMat.color.copy(c)
      u.discMat.color.copy(c)
      u.beamMat.color.copy(c)
      u.gem.material.color.copy(c)
    }
  }

  hideBeacon(beacon) {
    if (beacon) beacon.visible = false
  }

  // --------------------------------------------------------------- mission ---
  setupMission() {
    this.mission = null
    this.offer = null
    this.missionTimer = 0
    this.dropoff = null
    this.targetCar = null
    this.objectivePos = new THREE.Vector3()
    this.startMission('courier')
  }

  chooseSpot(minDist = 55, away = null) {
    const from = away || this.player.pos
    const candidates = this.world.missionSpots.filter((s) => Math.hypot(s.x - from.x, s.z - from.z) > minDist)
    return pick(candidates.length ? candidates : this.world.missionSpots)
  }

  startMission(type) {
    this.hideBeacon(this.beacons.offer)
    this.offer = null
    this.targetCar = null
    this.dropoff = null
    if (type === 'repo') {
      const candidates = this.cars.filter((c) => c.mode === 'parked' && !c.police && !c.dead)
      if (!candidates.length) type = 'courier'
      else {
        const car = pick(candidates)
        this.targetCar = car
        car.missionCar = true
        this.mission = { type: 'repo', phase: 'steal', time: 210 }
        this.missionTimer = 210
        this.objectivePos.copy(car.pos)
        this.setBeacon(this.beacons.mission, car.pos.x, car.pos.z, 0xffd25e)
        this.toast(`REPO JOB — steal the ${car.name}`, 'gold')
      }
    }
    if (type === 'courier') {
      this.mission = { type: 'courier', step: 1, total: 3, time: 190 }
      this.missionTimer = 190
      const spot = this.chooseSpot(70)
      this.mission.target = spot
      this.objectivePos.set(spot.x, 0.24, spot.z)
      this.setBeacon(this.beacons.mission, spot.x, spot.z, 0xffd25e)
      this.toast('COURIER — package 1 of 3 is on the radar', 'gold')
    }
    this.updateMissionHUD()
  }

  completeMission(reward) {
    if (!this.mission) return
    this.money += reward
    this.audio.playCash()
    this.toast(`MISSION COMPLETE +$${reward.toLocaleString()}`, 'gold')
    if (this.targetCar) this.targetCar.missionCar = false
    this.targetCar = null
    this.mission = null
    this.dropoff = null
    this.hideBeacon(this.beacons.mission)
    this.missionTimer = 0
    this.updateMissionHUD()
    setTimeout(() => {
      if (this.dead) return
      const spot = this.chooseSpot(50)
      this.offer = { x: spot.x, z: spot.z }
      this.setBeacon(this.beacons.offer, spot.x, spot.z, 0x7dffb0)
      this.toast('NEW JOB AVAILABLE — follow the green marker', 'info')
    }, 6500)
  }

  failMission(reason = 'MISSION FAILED') {
    if (!this.mission) return
    this.toast(reason, 'bad')
    if (this.targetCar) this.targetCar.missionCar = false
    this.targetCar = null
    this.dropoff = null
    this.mission = null
    this.missionTimer = 0
    this.hideBeacon(this.beacons.mission)
    this.updateMissionHUD()
    setTimeout(() => {
      if (this.dead) return
      const spot = this.chooseSpot(40)
      this.offer = { x: spot.x, z: spot.z }
      this.setBeacon(this.beacons.offer, spot.x, spot.z, 0x7dffb0)
    }, 3000)
  }

  updateMission(dt) {
    if (this.offer) {
      const d = Math.hypot(this.player.pos.x - this.offer.x, this.player.pos.z - this.offer.z)
      if (d < 3.4 && !this.player.car) {
        this.hideBeacon(this.beacons.offer)
        this.offer = null
        this.startMission(Math.random() < 0.5 ? 'repo' : 'courier')
      }
    }
    if (!this.mission) {
      this.updateMissionHUD()
      return
    }
    this.missionTimer -= dt
    if (this.missionTimer <= 0) {
      this.failMission('TIME UP — MISSION FAILED')
      return
    }
    const m = this.mission
    if (m.type === 'courier') {
      const dist = Math.hypot(this.player.pos.x - m.target.x, this.player.pos.z - m.target.z)
      if (dist < 3.6) {
        this.money += 300
        this.audio.playCash()
        if (m.step >= m.total) {
          this.completeMission(1800)
          return
        }
        m.step++
        const spot = this.chooseSpot(55, m.target)
        m.target = spot
        this.objectivePos.set(spot.x, 0.24, spot.z)
        this.setBeacon(this.beacons.mission, spot.x, spot.z, 0xffd25e)
        this.toast(`PACKAGE DELIVERED ${m.step - 1}/${m.total}  +$300`, 'gold')
      } else {
        this.objectivePos.set(m.target.x, 0.24, m.target.z)
        this.setBeacon(this.beacons.mission, m.target.x, m.target.z)
      }
    } else if (m.type === 'repo') {
      if (m.phase === 'steal') {
        if (this.targetCar) {
          this.objectivePos.copy(this.targetCar.pos)
          this.setBeacon(this.beacons.mission, this.targetCar.pos.x, this.targetCar.pos.z)
          if (this.player.car === this.targetCar) {
            m.phase = 'deliver'
            const spot = this.chooseSpot(60, this.targetCar.pos)
            this.dropoff = spot
            this.toast('RIDE SECURED — deliver it to the drop-off', 'gold')
          }
        } else {
          this.failMission('REPO FAILED — vehicle lost')
        }
      } else if (this.dropoff) {
        this.objectivePos.set(this.dropoff.x, 0.24, this.dropoff.z)
        this.setBeacon(this.beacons.mission, this.dropoff.x, this.dropoff.z, 0x63f0ff)
        const d = Math.hypot(this.player.pos.x - this.dropoff.x, this.player.pos.z - this.dropoff.z)
        if (this.player.car && this.player.car.speed < 4 && d < 5.5) {
          this.completeMission(2400)
        }
      }
    }
    this.updateMissionHUD()
  }

  openMissionInfo() {
    if (this.mission) {
      if (this.mission.type === 'courier') {
        return {
          title: 'COURIER',
          desc: `Deliver the package · ${this.mission.step}/${this.mission.total}`,
          target: this.mission.target,
          timer: this.missionTimer
        }
      }
      return {
        title: 'REPO',
        desc: this.mission.phase === 'steal' ? `Steal the ${this.targetCar?.name || 'vehicle'}` : 'Deliver the ride to the drop-off',
        target: this.mission.phase === 'steal' ? this.targetCar?.pos : this.dropoff,
        timer: this.missionTimer
      }
    }
    if (this.offer) {
      return { title: 'JOB OFFER', desc: 'A new job is waiting', target: this.offer, timer: null, offer: true }
    }
    return { title: 'NO ACTIVE JOB', desc: 'Explore the city', target: null, timer: null }
  }

  updateMissionHUD() {
    const info = this.openMissionInfo()
    const titleEl = this.$('mission-title')
    const descEl = this.$('mission-desc')
    const distEl = this.$('mission-dist')
    const timerEl = this.$('mission-timer')
    if (!titleEl) return
    if (info.title !== this._hudCache.mTitle) { titleEl.textContent = info.title; this._hudCache.mTitle = info.title }
    if (info.desc !== this._hudCache.mDesc) { descEl.textContent = info.desc; this._hudCache.mDesc = info.desc }
    let dist = ''
    if (info.target) {
      const dx = (info.target.x ?? info.target.pos?.x ?? this.player.pos.x) - this.player.pos.x
      const dz = (info.target.z ?? info.target.pos?.z ?? this.player.pos.z) - this.player.pos.z
      const d = Math.hypot(dx, dz)
      dist = d > 1000 ? (d / 1000).toFixed(1) + ' KM' : Math.round(d) + ' M'
    }
    if (dist !== this._hudCache.mDist) { distEl.textContent = dist; this._hudCache.mDist = dist }
    const timer = info.timer == null ? '' : this.formatTime(Math.max(0, info.timer))
    if (timer !== this._hudCache.mTimer) { timerEl.textContent = timer; this._hudCache.mTimer = timer }
  }

  // ---------------------------------------------------------------- firing ---
  shoot() {
    if (this.player.car || this.dead) return
    if (this.fireCooldown > 0) return
    this.fireCooldown = 0.17
    this.aimTimer = 0.45
    this.audio.playGunshot(1)
    const dir = new THREE.Vector3()
    this.camera.getWorldDirection(dir)
    const origin = new THREE.Vector3(this.player.pos.x, this.player.pos.y + 1.35, this.player.pos.z).addScaledVector(dir, 0.55)
    const targets = []
    for (const p of this.peds) if (!p.dead && p.human.group.visible) targets.push(p.human.group)
    for (const c of this.police) if (!c.dead && c.human.group.visible) targets.push(c.human.group)
    for (const c of this.cars) if (!c.dead && c.group.visible) targets.push(c.group)
    // find what sits under the crosshair, then converge the shot from the player
    const camRay = new THREE.Raycaster(this.camera.position.clone(), dir.clone(), 0, 140)
    const underCrosshair = camRay.intersectObjects(targets, true)
    let aimPoint
    if (underCrosshair.length) {
      aimPoint = underCrosshair[0].point.clone()
    } else {
      let aimDist = 90
      if (dir.y < -0.001) aimDist = Math.min(aimDist, this.camera.position.y / -dir.y)
      aimPoint = this.camera.position.clone().addScaledVector(dir, aimDist)
      aimPoint.y = Math.max(0.03, aimPoint.y)
    }
    dir.copy(aimPoint.sub(origin).normalize())
    const raycaster = new THREE.Raycaster(origin, dir, 0, 100)
    const hits = raycaster.intersectObjects(targets, true)
    let end = origin.clone().addScaledVector(dir, 70)
    if (dir.y < 0) {
      const groundT = origin.y / -dir.y
      if (groundT < 70) end = origin.clone().addScaledVector(dir, groundT)
    }
    end.y = Math.max(0.05, end.y)
    if (hits.length) {
      const hit = hits[0]
      end.copy(hit.point)
      let node = hit.object
      while (node && !node.userData.type) node = node.parent
      if (node?.userData.type === 'ped' || node?.userData.type === 'cop') {
        const w = node.userData.walker
        if (w && !w.dead) {
          w.hp -= node.userData.type === 'cop' ? 34 : 50
          this.addBurst(end, node.userData.type === 'cop' ? 0x9fc4ff : 0xff5a5a, 0.35, 0.2)
          if (w.hp <= 0) {
            w.die()
            if (node.userData.type === 'cop') {
              this.toast('OFFICER DOWN', 'bad')
              this.commitCrime(2)
              if (Math.random() < 0.5) this.dropCash(w.pos.x, w.pos.z, 80)
            } else {
              this.toast('CIVILIAN DOWN', 'bad')
              this.commitCrime(1)
              this.panic = 8
            }
          } else {
            this.commitCrime(1)
            if (node.userData.type === 'cop') this.damagePoliceAwareness()
          }
        }
      } else if (node?.userData.type === 'car') {
        const car = node.userData.car
        if (car && !car.police) car.health -= 18
        this.addBurst(end, 0xffd9a0, 0.3, 0.15)
        if (car?.police && car.health <= 0) this.explodeCar(car)
      }
    }
    this.addTracer(origin, end, 0xffe0a0, 0.06)
    const muzzle = origin.clone().addScaledVector(dir, 0.15)
    muzzle.y += 0.28
    this.addBurst(muzzle, 0xffe6b0, 0.13, 0.06)
    // little world impact flash
    if (!hits.length) this.addBurst(end, 0xffcf8a, 0.3, 0.12)
  }

  damagePoliceAwareness() {
    this.evadeTimer = 0
  }

  addTracer(from, to, color = 0xffd9a0, life = 0.07) {
    const line = makeTracer(color)
    const posAttr = line.geometry.attributes.position
    posAttr.setXYZ(0, from.x, from.y, from.z)
    posAttr.setXYZ(1, to.x, to.y, to.z)
    posAttr.needsUpdate = true
    line.geometry.computeBoundingSphere()
    this.scene.add(line)
    this.effects.push({ obj: line, life, max: life, type: 'line' })
  }

  addBurst(pos, color, size = 0.5, life = 0.2) {
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(size, 0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
    )
    mesh.position.copy(pos)
    this.scene.add(mesh)
    this.effects.push({ obj: mesh, life, max: life, type: 'burst' })
  }

  explodeCar(car) {
    if (car.dead) return
    car.dead = true
    const p = car.pos.clone()
    p.y = 1
    this.addBurst(p, 0xff8a2a, 3.2, 0.6)
    this.addBurst(p, 0xffe4a0, 1.8, 0.4)
    this.shake = Math.max(this.shake, 0.7)
    car.group.visible = false
    if (this.player.car === car) {
      this.player.car = null
      this.player.pos.copy(car.pos)
      this.humanoid.group.visible = true
      this.damagePlayer(35, 'explosion')
      this.audio.setDriving(false)
    }
    this.audio.playGunshot(1.2)
  }

  damagePlayer(amount, source) {
    if (this.dead) return
    this.hurt = Math.min(1, this.hurt + 0.55)
    this.shake = Math.max(this.shake, 0.25)
    this.audio.playHurt()
    let dmg = amount
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * 0.7)
      this.armor -= absorbed
      dmg -= absorbed
    }
    this.health -= dmg
    this.lastDamage = 0
    if (this.health <= 0) {
      this.health = 0
      this.die()
    }
  }

  die() {
    if (this.dead) return
    this.dead = true
    this.deadTimer = 0
    this.input.releasePointer()
    if (this.player.car) {
      const car = this.player.car
      car.mode = 'parked'
      car.speed = 0
      this.player.car = null
      this.humanoid.group.visible = true
      this.humanoid.group.position.copy(car.pos)
      this.player.pos.copy(car.pos)
    }
    this.humanoid.die(0.01)
    this.humanoid.group.rotation.z = 0
    this.wanted = 0
    this.clearPolice()
    this.failMission('WASTED — JOB LOST')
    const wasted = this.$('wasted')
    if (wasted) wasted.classList.add('show')
    document.body.classList.add('dead')
  }

  respawn() {
    this.dead = false
    this.deadTimer = 0
    this.health = 100
    this.armor = 0
    this.hurt = 0
    this.player.pos.copy(this.spawn)
    this.player.heading = Math.PI
    this.player.vx = this.player.vz = this.player.vy = 0
    this.player.car = null
    this.humanoid.group.visible = true
    this.humanoid.group.rotation.set(0, Math.PI, 0)
    this.camYaw = 0
    this.camPitch = 0.24
    this.money = Math.max(0, this.money - 250)
    this.toast('HOSPITAL BILL  -$250', 'bad')
    const wasted = this.$('wasted')
    if (wasted) wasted.classList.remove('show')
    document.body.classList.remove('dead')
    this.intro = 1.2
    this.updateCamera(0.016, true)
    if (!this.mission && !this.offer) {
      setTimeout(() => {
        if (!this.dead && !this.mission && !this.offer) {
          const spot = this.chooseSpot(45)
          this.offer = { x: spot.x, z: spot.z }
          this.setBeacon(this.beacons.offer, spot.x, spot.z, 0x7dffb0)
        }
      }, 2500)
    }
  }

  clearPolice() {
    for (const cop of this.police) this.scene.remove(cop.human.group)
    this.police = []
    for (const car of this.cars) if (car.police && !car.dead) {
      car.dead = true
      car.group.visible = false
    }
    this.cars = this.cars.filter((c) => !c.dead)
    this.audio.setSiren(0)
  }

  // ---------------------------------------------------------------- police ---
  updatePolice(dt) {
    this.crimeCooldown = Math.max(0, this.crimeCooldown - dt)
    const carCops = this.cars.filter((c) => c.police && !c.dead)
    const footCops = this.police
    if (this.wanted === 0) {
      if (carCops.length || footCops.length) {
        this.policeWindDown -= dt
        if (this.policeWindDown <= 0) {
          for (const c of carCops) { c.dead = true; c.group.visible = false }
          this.cars = this.cars.filter((c) => !c.dead)
          for (const c of footCops) this.scene.remove(c.human.group)
          this.police = []
          this.audio.setSiren(0)
        }
      } else this.policeWindDown = 7
      this.evadeTimer = 0
      return
    }
    this.policeWindDown = 7
    const wantCars = Math.min(3, Math.ceil(this.wanted / 1.5) + (this.wanted >= 5 ? 1 : 0))
    const wantFoot = this.wanted >= 2 ? Math.min(4, this.wanted - 1) : 0
    this.policeTimer -= dt
    this.carSpawnTimer -= dt
    this.footSpawnTimer -= dt
    if (carCops.length < wantCars && this.carSpawnTimer <= 0) {
      this.carSpawnTimer = this.spawnPoliceCar() ? rand(1.2, 2.2) : 0.45
    }
    if (footCops.length < wantFoot && this.footSpawnTimer <= 0) {
      this.footSpawnTimer = this.spawnFootCop() ? rand(1.1, 2.0) : 0.45
    }

    // evade logic
    let nearest = 1e9
    for (const c of [...carCops, ...footCops]) {
      const d = Math.hypot(c.pos.x - this.player.pos.x, c.pos.z - this.player.pos.z)
      nearest = Math.min(nearest, d)
    }
    if (nearest > 55) {
      this.evadeTimer += dt
      if (this.evadeTimer > 9 + this.wanted * 3) {
        this.wanted = Math.max(0, this.wanted - 1)
        this.evadeTimer = 0
        this.audio.playCash()
        this.toast(this.wanted === 0 ? 'YOU LOST THE COPS' : 'WANTED LEVEL DECREASED', 'good')
      }
    } else this.evadeTimer = 0
    this.audio.setSiren(clamp(1 - nearest / 90, 0, 1))

    // car AI
    for (const car of carCops) {
      const dx = this.player.pos.x - car.pos.x
      const dz = this.player.pos.z - car.pos.z
      const dist = Math.hypot(dx, dz) || 1
      const desired = Math.atan2(dx, dz)
      const diff = angleDelta(desired, car.heading)
      const turn = clamp(diff, -2.5 * dt, 2.5 * dt) * (0.5 + Math.min(1.5, car.speed / 16))
      car.heading += turn
      car.steer = clamp(diff, -1, 1)
      const throttle = dist > 14 ? 1 : dist > 8 ? 0.25 : -0.6
      car.speed = clamp(car.speed + (throttle * 15 - car.speed * 0.22) * dt, -4, 31)
      const fwd = car.forward()
      car.pos.x += fwd.x * car.speed * dt
      car.pos.z += fwd.z * car.speed * dt
      if (this.resolveCircle(car.pos, 1.5)) {
        car.speed *= 0.25
        car.heading += rand(-1.8, 1.8) * dt
      }
      car.sync(dt)
      // ram / shoot
      if (dist < 5.5 && Math.abs(car.speed) > 4) {
        if (this.player.car) {
          this.player.car.speed *= 0.82
          this.shake = Math.max(this.shake, 0.22)
          if (this.wanted >= 3) this.damagePlayer(rand(2, 5), 'ram')
        } else {
          this.damagePlayer(rand(6, 12), 'ram')
          const push = new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(2)
          this.player.pos.x -= push.x
          this.player.pos.z -= push.z
          car.speed *= 0.4
        }
      }
      car.shootTimer -= dt
      if (car.shootTimer <= 0 && dist < 38) {
        car.shootTimer = rand(2.4, 4)
        const origin = new THREE.Vector3(car.pos.x, 1.4, car.pos.z).addScaledVector(fwd, 1.8)
        const tgt = new THREE.Vector3(this.player.pos.x, this.player.pos.y + 1.2, this.player.pos.z)
        if (Math.random() < 0.3) tgt.x += rand(-3, 3)
        this.addTracer(origin, tgt, 0xffb070, 0.08)
        this.audio.playGunshot(0.35)
        if (Math.hypot(tgt.x - this.player.pos.x, tgt.z - this.player.pos.z) < 1.6) {
          if (this.player.car) {
            this.player.car.health -= 4
            if (this.player.car.health <= 0) this.explodeCar(this.player.car)
          } else this.damagePlayer(rand(3, 6), 'bullet')
        }
      }
    }
    for (const cop of footCops) {
      cop.update(dt)
      const d = Math.hypot(cop.pos.x - this.player.pos.x, cop.pos.z - this.player.pos.z)
      cop.human.group.visible = d < 110
      if (d > 120) { this.scene.remove(cop.human.group); cop.removed = true }
    }
    this.police = this.police.filter((c) => !c.removed)
  }

  spawnPoliceCar() {
    for (let attempt = 0; attempt < 30; attempt++) {
      const ix = pick(this.world.intersections)
      const angle = rand(0, TAU)
      const x = ix.x + Math.cos(angle) * 26
      const z = ix.z + Math.sin(angle) * 26
      const d = Math.hypot(x - this.player.pos.x, z - this.player.pos.z)
      if (d < 30 || d > 95) continue
      if (this.insideBuilding(x, z, 3)) continue
      const car = new Car(this, { x, z, heading: rand(0, TAU), police: true, mode: 'police', color: '#e8e6df' })
      car.speed = 14
      car.health = 140
      this.cars.push(car)
      return true
    }
    return false
  }

  spawnFootCop() {
    for (let i = 0; i < 24; i++) {
      const a = rand(0, TAU)
      const r = rand(24, 50)
      const x = this.player.pos.x + Math.cos(a) * r
      const z = this.player.pos.z + Math.sin(a) * r
      if (Math.abs(x) > 185 || Math.abs(z) > 185) continue
      if (this.insideBuilding(x, z, 1)) continue
      const cop = new Walker(this, { x, z, cop: true, y: 0.24 })
      this.police.push(cop)
      return true
    }
    return false
  }

  commitCrime(level = 1) {
    if (this.crimeCooldown > 0 || this.dead) return
    this.crimeCooldown = 1.4
    this.wanted = Math.min(5, this.wanted + level)
    this.evadeTimer = 0
    this.policeWindDown = 7
    this.policeTimer = 0
    this.carSpawnTimer = Math.min(this.carSpawnTimer, 0.1)
    this.footSpawnTimer = Math.min(this.footSpawnTimer, 0.2)
    const el = this.$('wanted')
    if (el) {
      el.classList.remove('flash')
      void el.offsetWidth
      el.classList.add('flash')
    }
    if (this.wanted === 1) this.toast('WANTED — police are responding', 'bad')
    else if (this.wanted >= 3) this.toast('HEAVY POLICE RESPONSE', 'bad')
  }

  // -------------------------------------------------------------- collisions ---
  insideBuilding(x, z, margin = 0) {
    for (const c of this.world.colliders) {
      if (x > c.minX - margin && x < c.maxX + margin && z > c.minZ - margin && z < c.maxZ + margin) return true
    }
    return false
  }

  resolveCircle(pos, radius) {
    let hit = false
    for (const c of this.world.colliders) {
      const cx = clamp(pos.x, c.minX, c.maxX)
      const cz = clamp(pos.z, c.minZ, c.maxZ)
      const dx = pos.x - cx
      const dz = pos.z - cz
      const d2 = dx * dx + dz * dz
      if (d2 < radius * radius) {
        hit = true
        if (d2 > 1e-5) {
          const d = Math.sqrt(d2)
          const push = (radius - d) / d
          pos.x += dx * push
          pos.z += dz * push
        } else {
          const dl = pos.x - c.minX, dr = c.maxX - pos.x
          const dt = pos.z - c.minZ, db = c.maxZ - pos.z
          const m = Math.min(dl, dr, dt, db)
          if (m === dl) pos.x = c.minX - radius
          else if (m === dr) pos.x = c.maxX + radius
          else if (m === dt) pos.z = c.minZ - radius
          else pos.z = c.maxZ + radius
        }
      }
    }
    const lim = 235
    if (pos.x > lim) { pos.x = lim; hit = true }
    if (pos.x < -lim) { pos.x = -lim; hit = true }
    if (pos.z > lim) { pos.z = lim; hit = true }
    if (pos.z < -lim) { pos.z = -lim; hit = true }
    return hit
  }

  groundHeight(x, z) {
    for (const bx of CITY.CENTERS) {
      if (Math.abs(x - bx) < CITY.BLOCK / 2 && z > -CITY.HALF && z < CITY.HALF) {
        for (const bz of CITY.CENTERS) {
          if (Math.abs(z - bz) < CITY.BLOCK / 2) return this.world.parkSpots.some((p) => Math.abs(p.x - x) < 17 && Math.abs(p.z - z) < 17) ? 0.252 : 0.24
        }
      }
    }
    return 0
  }

  // ----------------------------------------------------------------- update ---
  update(dt) {
    this.time += dt
    this.updateAdaptiveResolution()
    if (!this.started) {
      this.updateAttract(dt)
      this.updateAmbient(dt)
      return
    }
    this.updateHUDTimers(dt)
    if (this.input.consume('pause')) {
      if (this.mapOpen) this.toggleMap()
      else this.togglePause()
    }
    if (this.input.consume('map')) this.toggleMap()
    if (this.paused || this.mapOpen) {
      this.updateAmbient(dt)
      return
    }
    if (this.dead) {
      this.deadTimer += dt
      if (this.deadTimer > 3.2) this.respawn()
      this.updateEffects(dt)
      this.updateCamera(dt)
      this.updateDayNight(dt)
      return
    }

    this.updateLook()
    this.inputActions()
    this.updateWorldTime(dt)
    this.updateEffects(dt)
    this.updateIndicators(dt)

    if (this.player.car) this.updateDriving(dt)
    else this.updateOnFoot(dt)

    this.player.pos.y = this.player.car ? 0 : this.player.pos.y
    if (this.hurt > 0) this.hurt = Math.max(0, this.hurt - dt * 1.8)
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2)

    // traffic + ambient walkers
    this.updateTraffic(dt)
    this.updatePeds(dt)
    this.updatePolice(dt)
    this.updateMission(dt)
    this.updatePickups(dt)

    // health regen
    this.lastDamage = (this.lastDamage || 0) + dt
    if (this.lastDamage > 7 && this.health < 100) this.health = Math.min(100, this.health + dt * 2.5)

    this.updateCamera(dt)
    this.updateDayNight(dt)
    this.updateHUD()
    this.updateMinimap(dt)
    this.updateBeaconVisuals()

    // audio
    if (this.player.car) {
      this.audio.setDriving(true, this.player.car.speed)
    } else this.audio.setDriving(false)
    this.audio.update()
  }

  updateLook() {
    const look = this.input.takeLook()
    if (!look.x && !look.y) return
    if (this.player.car) {
      this.camOrbit = clamp(this.camOrbit - look.x * 0.004, -2.2, 2.2)
    } else {
      this.camYaw -= look.x * 0.0028
    }
    this.camPitch = clamp(this.camPitch + look.y * 0.0016, 0.02, 0.95)
  }

  inputActions() {
    if (this.input.consume('radio')) this.cycleRadio()
    if (this.input.consume('interact')) {
      if (this.player.car) this.exitCar()
      else this.tryEnterCar()
    }
    if (this.input.consume('jump') && !this.player.car) this.jump()
    if (this.input.consume('horn')) this.audio.playGunshot(0.15)
    if (this.input.firing) this.shoot()
  }

  tryEnterCar() {
    let best = null
    let bestD = 5.4
    for (const car of this.cars) {
      if (car.dead) continue
      const d = Math.hypot(car.pos.x - this.player.pos.x, car.pos.z - this.player.pos.z)
      if (d < bestD) { bestD = d; best = car }
    }
    if (best) this.enterCar(best)
  }

  enterCar(car) {
    if (car.dead) return
    this.player.car = car
    car.prevMode = car.mode
    car.mode = 'player'
    car.speed = Math.min(car.speed, 6)
    this.humanoid.group.visible = false
    this.camOrbit = 0
    this.camYaw = car.heading + Math.PI
    this.audio.setDriving(true, car.speed)
    this.toast(`${car.name}`, 'info')
    if (car.police) this.commitCrime(1)
    this.updateHUD()
  }

  exitCar() {
    const car = this.player.car
    if (!car) return
    car.mode = 'parked'
    car.speed = 0
    this.player.car = null
    const offsets = [2.5, -2.5, 3.6, -3.6, 0]
    let placed = false
    for (const o of offsets) {
      const side = car.heading + Math.PI / 2
      const x = car.pos.x + Math.sin(side) * o + Math.sin(car.heading) * (o === 0 ? 4 : 0)
      const z = car.pos.z + Math.cos(side) * o + Math.cos(car.heading) * (o === 0 ? 4 : 0)
      if (!this.insideBuilding(x, z, 0.6)) {
        this.player.pos.set(x, this.groundHeight(x, z), z)
        placed = true
        break
      }
    }
    if (!placed) this.player.pos.set(car.pos.x, 0, car.pos.z + 3)
    this.player.heading = car.heading + Math.PI / 2
    this.humanoid.group.visible = true
    this.humanoid.group.rotation.set(0, this.player.heading, 0)
    this.humanoid.group.position.copy(this.player.pos)
    this.audio.setDriving(false)
  }

  jump() {
    if (this.player.onGround && !this.player.car) {
      this.player.vy = 6.4
      this.player.onGround = false
    }
  }

  updateOnFoot(dt) {
    const p = this.player
    const mx = this.input.moveX
    const my = this.input.moveY
    const mag = Math.hypot(mx, my)
    const sprint = this.input.sprint
    const speed = sprint ? 8.4 : 4.9
    const fwd = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw))
    const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw))
    const dir = new THREE.Vector3()
    if (mag > 0.06) {
      dir.addScaledVector(fwd, my).addScaledVector(right, mx).normalize()
      p.vx = lerp(p.vx, dir.x * speed, Math.min(1, dt * 12))
      p.vz = lerp(p.vz, dir.z * speed, Math.min(1, dt * 12))
      p.heading = lerpAngle(p.heading, Math.atan2(dir.x, dir.z), Math.min(1, dt * 14))
    } else {
      p.vx = lerp(p.vx, 0, Math.min(1, dt * 14))
      p.vz = lerp(p.vz, 0, Math.min(1, dt * 14))
    }
    p.pos.x += p.vx * dt
    p.pos.z += p.vz * dt
    this.resolveCircle(p.pos, 0.38)
    p.speed = Math.hypot(p.vx, p.vz)

    const gy = this.groundHeight(p.pos.x, p.pos.z)
    p.groundY = gy
    if (p.pos.y < gy) p.pos.y = gy
    if (!p.onGround || p.vy > 0) {
      p.vy -= 19 * dt
      p.pos.y += p.vy * dt
      if (p.pos.y <= gy) { p.pos.y = gy; p.vy = 0; p.onGround = true }
    } else p.pos.y = lerp(p.pos.y, gy, Math.min(1, dt * 12))

    // aim while firing
    if (this.aimTimer > 0) {
      this.aimTimer -= dt
      this.humanoid.aim()
      if (p.speed < 1) p.heading = lerpAngle(p.heading, this.camYaw + Math.PI, Math.min(1, dt * 18))
    }

    this.humanoid.group.position.copy(p.pos)
    this.humanoid.group.rotation.y = p.heading
    if (this.aimTimer <= 0) {
      const moving = p.speed > 0.4
      this.humanoid.phase += dt * (moving ? p.speed * 2.2 : 0)
      if (moving) this.humanoid.setWalk(clamp(p.speed / 6, 0.4, 1.2))
      else this.humanoid.setIdle(this.time)
    }
    // pickup hint handled in HUD
  }

  updateDriving(dt) {
    const car = this.player.car
    if (!car || car.dead) { this.player.car = null; this.humanoid.group.visible = true; return }
    const throttle = this.input.moveY
    const steerIn = -this.input.moveX
    const handbrake = this.input.brake
    let accel = 0
    if (throttle > 0.05) accel = 20 * throttle
    else if (throttle < -0.05) {
      if (car.speed > 1.5) accel = -34 * Math.abs(throttle)
      else accel = -10 * Math.abs(throttle)
    }
    car.speed += accel * dt
    car.speed *= Math.exp(-0.55 * dt)
    if (handbrake) car.speed *= Math.exp(-2.8 * dt)
    car.speed = clamp(car.speed, -10, 34)
    car.steer = lerp(car.steer, steerIn, Math.min(1, dt * 8))
    if (Math.abs(car.speed) > 0.3) {
      car.heading += car.steer * 1.9 * dt * Math.min(1, Math.abs(car.speed) / 7) * (car.speed < 0 ? -1 : 1)
    }
    const fwd = car.forward()
    car.pos.x += fwd.x * car.speed * dt
    car.pos.z += fwd.z * car.speed * dt
    if (this.resolveCircle(car.pos, 1.55)) {
      if (Math.abs(car.speed) > 6) {
        this.shake = Math.max(this.shake, Math.min(0.5, Math.abs(car.speed) * 0.02))
        car.health -= Math.abs(car.speed) * 0.55
        this.addBurst(new THREE.Vector3(car.pos.x, 0.9, car.pos.z), 0xffc07a, 0.35, 0.15)
        if (car.health <= 0) this.explodeCar(car)
      }
      car.speed *= -0.14
    }
    car.sync(dt)
    this.player.pos.set(car.pos.x, 0, car.pos.z)
    this.player.heading = car.heading

    // steal / traffic collision
    for (const other of this.cars) {
      if (other === car || other.dead) continue
      const d = Math.hypot(other.pos.x - car.pos.x, other.pos.z - car.pos.z)
      if (d < 2.8) {
        const push = new THREE.Vector3(car.pos.x - other.pos.x, 0, car.pos.z - other.pos.z)
        if (push.lengthSq() < 0.01) push.set(1, 0, 0)
        push.normalize()
        other.pos.addScaledVector(push, (2.8 - d) * 0.5)
        car.pos.addScaledVector(push, -(2.8 - d) * 0.5)
        if (other.police && Math.abs(car.speed) > 5) {
          other.health -= Math.abs(car.speed) * 1.2
          if (other.health <= 0) this.explodeCar(other)
        }
        if (Math.abs(car.speed) > 13) this.damagePlayer(rand(1, 2), 'crash')
        car.speed *= 0.88
        other.sync(dt)
      }
    }
    // run over pedestrians
    for (const ped of this.peds) {
      if (ped.dead || ped.cop) continue
      const d = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z)
      if (d < 1.9 && Math.abs(car.speed) > 3.5) {
        ped.die()
        this.commitCrime(1)
        this.panic = 8
        this.toast('HIT AND RUN', 'bad')
        car.speed *= 0.82
      }
    }
    for (const cop of this.police) {
      const d = Math.hypot(cop.pos.x - car.pos.x, cop.pos.z - car.pos.z)
      if (d < 1.9 && Math.abs(car.speed) > 3) {
        cop.die()
        this.commitCrime(2)
        car.speed *= 0.85
      }
    }
  }

  updateTraffic(dt) {
    for (const car of this.cars) {
      if (car === this.player.car || car.dead) continue
      const playerDist = Math.hypot(car.pos.x - this.player.pos.x, car.pos.z - this.player.pos.z)
      car.group.visible = playerDist < 165
      if (car.mode === 'traffic') {
        if (!car.path) continue
        let target = car.path[car.wp]
        let dx = target.x - car.pos.x
        let dz = target.z - car.pos.z
        let dist = Math.hypot(dx, dz)
        if (dist < 3.5) {
          car.wp = (car.wp + 1) % car.path.length
          target = car.path[car.wp]
          dx = target.x - car.pos.x
          dz = target.z - car.pos.z
          dist = Math.hypot(dx, dz)
        }
        car.heading = lerpAngle(car.heading, Math.atan2(dx, dz), Math.min(1, dt * 5))
        car.steer = lerp(car.steer, clamp(angleDelta(Math.atan2(dx, dz), car.heading), -1, 1), Math.min(1, dt * 4))
        car.pos.x += Math.sin(car.heading) * car.speed * dt
        car.pos.z += Math.cos(car.heading) * car.speed * dt
        car.sync(dt)
      } else if (car.mode === 'police') {
        // police cars handled in updatePolice
      } else {
        car.sync(dt)
      }
    }
  }

  updatePeds(dt) {
    if (this.panic > 0) this.panic = Math.max(0, this.panic - dt)
    for (const ped of this.peds) {
      ped.update(dt)
      const d = Math.hypot(ped.pos.x - this.player.pos.x, ped.pos.z - this.player.pos.z)
      ped.human.group.visible = d < 85
      if (!ped.dead && this.player.car && this.player.car.speed) continue
    }
    this.peds = this.peds.filter((p) => !p.removed)
  }

  updatePickups(dt) {
    for (const p of this.pickups) {
      if (p.taken) {
        p.timer -= dt
        if (p.timer <= 0) this.respawnPickup(p)
        continue
      }
      p.group.rotation.y += dt * 1.8
      p.group.position.y = p.baseY + Math.sin(this.time * 2 + p.pos.x) * 0.08
      const d = Math.hypot(p.pos.x - this.player.pos.x, p.pos.z - this.player.pos.z)
      if (d < 2.3 && Math.abs(this.player.pos.y - p.baseY) < 2) {
        p.taken = true
        p.group.visible = false
        p.timer = rand(26, 45)
        if (p.type === 'cash') {
          const amount = [50, 100, 150, 250][(Math.random() * 4) | 0]
          this.money += amount
          this.audio.playCash()
          this.toast(`+$${amount}`, 'good')
        } else if (p.type === 'health') {
          this.health = Math.min(100, this.health + 40)
          this.toast('HEALTH RESTORED', 'good')
          this.audio.playCash()
        } else {
          this.armor = Math.min(100, this.armor + 50)
          this.toast('ARMOR ACQUIRED', 'good')
          this.audio.playCash()
        }
      }
    }
  }

  respawnPickup(p) {
    const spot = pick(this.world.missionSpots)
    p.pos.set(spot.x, 0.24, spot.z)
    p.group.position.set(spot.x, 0.24, spot.z)
    p.group.visible = true
    p.taken = false
  }

  updateEffects(dt) {
    for (const e of this.effects) {
      e.life -= dt
      const k = Math.max(0, e.life / e.max)
      if (e.type === 'line') {
        e.obj.material.opacity = k * 0.9
      } else {
        e.obj.material.opacity = k
        e.obj.scale.setScalar(1 + (1 - k) * (e.type === 'burst' ? 2.2 : 1))
      }
    }
    this.effects = this.effects.filter((e) => {
      if (e.life > 0) return true
      this.scene.remove(e.obj)
      e.obj.geometry?.dispose()
      e.obj.material?.dispose()
      return false
    })
  }

  updateIndicators(dt) {
    const prompt = this.$('prompt')
    if (!prompt) return
    let text = ''
    const touch = this.input.isTouch || document.body.classList.contains('touch')
    if (this.player.car) {
      text = touch ? 'TAP EXIT TO LEAVE VEHICLE' : 'F  ·  EXIT VEHICLE'
      prompt.classList.add('show')
      document.body.classList.add('driving')
    } else {
      let near = null
      let best = 5.4
      for (const car of this.cars) {
        if (car.dead) continue
        const d = Math.hypot(car.pos.x - this.player.pos.x, car.pos.z - this.player.pos.z)
        if (d < best) { best = d; near = car }
      }
      if (near) {
        text = touch ? 'TAP ENTER TO STEAL VEHICLE' : `F  ·  ENTER ${near.name.toUpperCase()}`
        prompt.classList.add('show')
      } else {
        prompt.classList.remove('show')
      }
      document.body.classList.remove('driving')
    }
    if (text && text !== this._promptCache) { prompt.textContent = text; this._promptCache = text }
  }

  updateCamera(dt, snap = false) {
    if (!this.started) return
    const target = new THREE.Vector3()
    const portrait = this.camera.aspect < 0.85
    let dist = 5.8 + (portrait ? 1.6 : 0)
    let height = 1.45 + (portrait ? 0.1 : 0)
    if (this.player.car) {
      const car = this.player.car
      target.set(car.pos.x, 1.35, car.pos.z)
      dist = 7.4 + (portrait ? 0.9 : 0) + Math.min(3, Math.abs(car.speed) * 0.07)
      height = 1.15
      const desired = car.heading + Math.PI + this.camOrbit
      this.camYaw = lerpAngle(this.camYaw, desired, Math.min(1, dt * (this.intro > 0 ? 2 : 4.5)))
      this.camOrbit *= Math.exp(-dt * 0.8)
      // look slightly ahead
      target.x += Math.sin(car.heading) * Math.min(3, Math.abs(car.speed) * 0.16)
      target.z += Math.cos(car.heading) * Math.min(3, Math.abs(car.speed) * 0.16)
    } else {
      target.set(this.player.pos.x, this.player.pos.y + 1.5, this.player.pos.z)
      if (this.intro > 0) {
        this.camYaw = lerpAngle(this.camYaw, this.player.heading + Math.PI, dt * 2)
      }
    }
    const cp = Math.cos(this.camPitch)
    const offset = new THREE.Vector3(Math.sin(this.camYaw) * dist * cp, Math.sin(this.camPitch) * dist + height, Math.cos(this.camYaw) * dist * cp)
    const shoulder = portrait ? 0.85 : 0
    if (shoulder && !this.player.car) {
      offset.x += Math.cos(this.camYaw) * shoulder
      offset.z -= Math.sin(this.camYaw) * shoulder
    }
    let desiredPos = target.clone().add(offset)
    // keep the camera out of buildings
    let bestT = 1
    for (let s = 1; s >= 0.3; s -= 0.08) {
      const px = target.x + offset.x * s
      const py = target.y + offset.y * s
      const pz = target.z + offset.z * s
      if (!this.cameraBlocked(px, py, pz)) { bestT = s; break }
    }
    desiredPos = target.clone().addScaledVector(offset, bestT)
    if (desiredPos.y < 0.8) desiredPos.y = 0.8
    if (this.shake > 0) {
      desiredPos.x += rand(-1, 1) * this.shake * 0.35
      desiredPos.y += rand(-1, 1) * this.shake * 0.25
      desiredPos.z += rand(-1, 1) * this.shake * 0.35
    }
    if (snap || this.intro > 1.2) {
      this.camPos.copy(desiredPos)
    } else {
      const k = 1 - Math.exp(-dt * (this.intro > 0 ? 4 : 13))
      this.camPos.lerp(desiredPos, k)
    }
    this.camera.position.copy(this.camPos)
    if (this.player.car) {
      this.camera.lookAt(target)
    } else {
      const fwd = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw))
      const aim = target.clone().addScaledVector(fwd, 9)
      if (shoulder) {
        aim.x += Math.cos(this.camYaw) * shoulder
        aim.z -= Math.sin(this.camYaw) * shoulder
      }
      aim.y += 0.5
      this.camera.lookAt(aim)
    }
    if (this.intro > 0) this.intro -= dt
    const targetFov = this.player.car ? 62 + Math.min(14, Math.abs(this.player.car.speed) * 0.5) : 60
    this.camera.fov = lerp(this.camera.fov, targetFov, 1 - Math.exp(-dt * 4))
    this.camera.updateProjectionMatrix()
  }

  cameraBlocked(x, y, z) {
    for (const c of this.world.colliders) {
      if (x > c.minX - 0.4 && x < c.maxX + 0.4 && z > c.minZ - 0.4 && z < c.maxZ + 0.4 && y < c.maxY + 0.4) return true
    }
    return false
  }

  updateAttract(dt) {
    this.attractTime += dt
    const a = this.attractTime * 0.055 + 0.6
    this.camera.position.set(Math.sin(a) * 250, 82 + Math.sin(this.attractTime * 0.25) * 8, Math.cos(a) * 250)
    this.camera.lookAt(0, 52, 0)
    this.camera.fov = 58
    this.camera.updateProjectionMatrix()
    this.updateDayNight(dt)
  }

  updateAmbient(dt) {
    this.updateTraffic(dt)
    this.updatePeds(dt)
    this.updateEffects(dt)
    this.updateBeaconVisuals()
    this.audio.update()
  }

  updateWorldTime(dt) {
    if (!this._clockCache) this._clockCache = ''
  }

  updateDayNight(dt) {
    this.dayTime = (this.dayTime + dt / 720) % 1
    this.world.setTimeOfDay(this.dayTime)
  }

  updateHUDTimers(dt) {
    if (this.dead) return
    if (this.player.car) {
      this.audio.setDriving(true, this.player.car.speed)
    }
  }

  // -------------------------------------------------------------------- HUD ---
  $(id) { return document.getElementById(id) }

  toast(text, kind = 'info') {
    const host = this.$('toasts')
    if (!host) return
    const el = document.createElement('div')
    el.className = `toast ${kind}`
    el.textContent = text
    host.appendChild(el)
    while (host.children.length > 4) host.removeChild(host.firstChild)
    setTimeout(() => {
      el.classList.add('out')
      setTimeout(() => el.remove(), 500)
    }, 3200)
  }

  formatTime(sec) {
    const s = Math.max(0, Math.ceil(sec))
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  cycleRadio() {
    if (!this.player.car) return
    const station = this.audio.cycleStation()
    this.toast(station, 'info')
    const el = this.$('radio-name')
    if (el) el.textContent = station
  }

  updateHUD() {
    const cash = this.$('cash')
    if (cash) {
      const txt = '$' + Math.floor(this.money).toLocaleString('en-US')
      if (txt !== this._hudCache.cash) { cash.textContent = txt; this._hudCache.cash = txt }
    }
    const health = this.$('health-fill')
    if (health) {
      const v = Math.max(0, Math.round(this.health))
      if (v !== this._hudCache.health) { health.style.width = v + '%'; this._hudCache.health = v }
    }
    const armor = this.$('armor-fill')
    if (armor) {
      const v = Math.max(0, Math.round(this.armor))
      if (v !== this._hudCache.armor) { armor.style.width = v + '%'; this._hudCache.armor = v }
    }
    const stars = this.$('wanted')
    if (stars) {
      if (this.wanted !== this._hudCache.wanted) {
        const spans = stars.querySelectorAll('.star')
        spans.forEach((s, i) => s.classList.toggle('on', i < this.wanted))
        this._hudCache.wanted = this.wanted
        stars.classList.toggle('active', this.wanted > 0)
      }
      const evading = this.wanted > 0 && this.evadeTimer > 2
      stars.classList.toggle('evading', evading)
      const label = this.$('wanted-label')
      if (label) {
        const t = this.wanted === 0 ? '' : evading ? 'EVADING POLICE' : 'WANTED'
        if (t !== this._hudCache.wlabel) { label.textContent = t; this._hudCache.wlabel = t }
        label.classList.toggle('show', this.wanted > 0)
      }
    }
    const speedo = this.$('speedo')
    if (speedo) {
      if (this.player.car) {
        speedo.classList.add('show')
        const mph = Math.round(Math.abs(this.player.car.speed) * 2.237)
        const sp = this.$('speed-value')
        if (sp && mph !== this._hudCache.mph) { sp.textContent = String(mph); this._hudCache.mph = mph }
        const nm = this.$('car-name')
        if (nm && nm.textContent !== this.player.car.name) nm.textContent = this.player.car.name
      } else speedo.classList.remove('show')
    }
    const radio = this.$('radio')
    if (radio) radio.classList.toggle('show', !!this.player.car)
    const cross = this.$('crosshair')
    if (cross) cross.classList.toggle('show', !this.player.car && !this.dead)

    // clock
    const total = this.dayTime * 24 * 60
    const hh = Math.floor(total / 60) % 24
    const mm = Math.floor(total % 60)
    const ampm = hh >= 12 ? 'PM' : 'AM'
    const h12 = hh % 12 === 0 ? 12 : hh % 12
    const clock = `${h12}:${String(mm).padStart(2, '0')} ${ampm}`
    if (clock !== this._clockCache) {
      this._clockCache = clock
      const el = this.$('clock')
      if (el) el.textContent = clock
    }
    const flash = this.$('damage-flash')
    if (flash) flash.style.opacity = String(this.hurt * 0.55)
    const low = this.$('low-health')
    if (low) low.classList.toggle('show', this.health < 30 && !this.dead)
    this.updateMissionHUD()
  }

  updateMinimap(dt) {
    const canvas = this.$('minimap')
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const S = canvas.width
    const c = S / 2
    const range = 115
    const scale = (S / 2) / range
    const px = this.player.pos.x
    const pz = this.player.pos.z
    const heading = this.player.car ? this.player.car.heading : this.player.heading
    ctx.clearRect(0, 0, S, S)
    ctx.save()
    ctx.beginPath()
    ctx.arc(c, c, c - 3, 0, TAU)
    ctx.clip()
    ctx.fillStyle = '#0d1714'
    ctx.fillRect(0, 0, S, S)
    ctx.translate(c, c)
    ctx.rotate(heading - Math.PI)
    ctx.scale(scale, scale)
    // blocks
    for (const bx of CITY.CENTERS) {
      for (const bz of CITY.CENTERS) {
        const x = bx - px - CITY.BLOCK / 2
        const z = bz - pz - CITY.BLOCK / 2
        if (x > -range * 2 && x < range * 2 && z > -range * 2 && z < range * 2) {
          ctx.fillStyle = '#26382f'
          ctx.fillRect(x, z, CITY.BLOCK, CITY.BLOCK)
          ctx.strokeStyle = 'rgba(150,190,165,.13)'
          ctx.lineWidth = 0.5
          ctx.strokeRect(x, z, CITY.BLOCK, CITY.BLOCK)
        }
      }
    }
    // route
    const info = this.openMissionInfo()
    let target = null
    if (info.target) {
      target = new THREE.Vector3(info.target.x ?? info.target.pos?.x ?? 0, 0, info.target.z ?? info.target.pos?.z ?? 0)
    }
    if (target) {
      ctx.strokeStyle = info.offer ? 'rgba(125,255,176,.75)' : 'rgba(255,210,94,.8)'
      ctx.lineWidth = 2 / scale
      ctx.setLineDash([5 / scale, 4 / scale])
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(target.x - px, target.z - pz)
      ctx.stroke()
      ctx.setLineDash([])
    }
    // cars
    for (const car of this.cars) {
      if (car.dead || car === this.player.car) continue
      const x = car.pos.x - px
      const z = car.pos.z - pz
      if (Math.hypot(x, z) > range + 12) continue
      ctx.fillStyle = car.police ? (Math.sin(this.time * 8) > 0 ? '#ff4455' : '#4a7bff') : 'rgba(220,226,220,.55)'
      ctx.beginPath()
      ctx.arc(x, z, car.police ? 3.2 / scale : 1.8 / scale, 0, TAU)
      ctx.fill()
    }
    // cops on foot
    for (const cop of this.police) {
      if (cop.dead) continue
      const x = cop.pos.x - px
      const z = cop.pos.z - pz
      if (Math.hypot(x, z) > range + 8) continue
      ctx.fillStyle = '#ff4455'
      ctx.beginPath()
      ctx.arc(x, z, 2.6 / scale, 0, TAU)
      ctx.fill()
    }
    // pickups
    for (const p of this.pickups) {
      if (p.taken) continue
      const x = p.pos.x - px
      const z = p.pos.z - pz
      if (Math.hypot(x, z) > range + 6) continue
      ctx.fillStyle = p.type === 'health' ? '#ff5577' : p.type === 'armor' ? '#55b7ff' : '#68d987'
      ctx.beginPath()
      ctx.arc(x, z, 1.9 / scale, 0, TAU)
      ctx.fill()
    }
    // target marker
    if (target) {
      const x = target.x - px
      const z = target.z - pz
      if (Math.hypot(x, z) < range * 3) {
        ctx.fillStyle = info.offer ? '#7dffb0' : '#ffd25e'
        ctx.beginPath()
        ctx.arc(x, z, 4.2 / scale, 0, TAU)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,.9)'
        ctx.lineWidth = 1 / scale
        ctx.stroke()
      }
    }
    ctx.restore()

    // player arrow
    ctx.save()
    ctx.translate(c, c)
    ctx.fillStyle = '#f5f7f2'
    ctx.strokeStyle = 'rgba(0,0,0,.55)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(0, -9)
    ctx.lineTo(6.4, 7)
    ctx.lineTo(0, 3.6)
    ctx.lineTo(-6.4, 7)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    // north marker
    ctx.save()
    ctx.translate(c, c)
    ctx.rotate(heading - Math.PI)
    ctx.fillStyle = 'rgba(240,245,235,.75)'
    ctx.font = '600 13px Rajdhani, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('N', 0, -c + 17)
    ctx.restore()
  }

  updateBeaconVisuals() {
    updateBeacon(this.beacons.mission, this.time)
    updateBeacon(this.beacons.offer, this.time)
  }

  // ------------------------------------------------------------------ misc ---
  togglePause() {
    if (!this.started || this.dead) return
    this.paused = !this.paused
    document.body.classList.toggle('paused', this.paused)
    if (this.paused) {
      this.input.releasePointer()
      this.input.clearTouches()
    }
  }

  toggleMap() {
    if (!this.started || this.dead) return
    this.mapOpen = !this.mapOpen
    document.body.classList.toggle('map-open', this.mapOpen)
    if (this.mapOpen) {
      this.input.releasePointer()
      this.input.clearTouches()
      this.drawBigMap()
    }
  }

  drawBigMap() {
    const canvas = this.$('bigmap-canvas')
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const S = canvas.width
    const world = 430
    const scale = S / world
    const ox = S / 2
    const oy = S / 2
    ctx.clearRect(0, 0, S, S)
    ctx.fillStyle = '#0b1512'
    ctx.fillRect(0, 0, S, S)
    // roads background
    ctx.fillStyle = '#1b2722'
    ctx.fillRect(0, 0, S, S)
    for (const bx of CITY.CENTERS) {
      for (const bz of CITY.CENTERS) {
        const x = ox + bx * scale - (CITY.BLOCK / 2) * scale
        const y = oy + bz * scale - (CITY.BLOCK / 2) * scale
        ctx.fillStyle = '#2c4036'
        ctx.fillRect(x, y, CITY.BLOCK * scale, CITY.BLOCK * scale)
        ctx.strokeStyle = 'rgba(160,200,175,.16)'
        ctx.lineWidth = 1
        ctx.strokeRect(x, y, CITY.BLOCK * scale, CITY.BLOCK * scale)
      }
    }
    // route
    const info = this.openMissionInfo()
    let target = null
    if (info.target) target = { x: info.target.x ?? info.target.pos?.x ?? 0, z: info.target.z ?? info.target.pos?.z ?? 0 }
    if (target) {
      ctx.strokeStyle = 'rgba(255,210,94,.85)'
      ctx.lineWidth = 2.5
      ctx.setLineDash([8, 6])
      ctx.beginPath()
      ctx.moveTo(ox + this.player.pos.x * scale, oy + this.player.pos.z * scale)
      ctx.lineTo(ox + target.x * scale, oy + target.z * scale)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = info.offer ? '#7dffb0' : '#ffd25e'
      ctx.beginPath()
      ctx.arc(ox + target.x * scale, oy + target.z * scale, 7, 0, TAU)
      ctx.fill()
    }
    // cops
    for (const car of this.cars) {
      if (car.dead || !car.police) continue
      ctx.fillStyle = '#ff4d5f'
      ctx.beginPath()
      ctx.arc(ox + car.pos.x * scale, oy + car.pos.z * scale, 4, 0, TAU)
      ctx.fill()
    }
    // pickups
    for (const p of this.pickups) {
      if (p.taken) continue
      ctx.fillStyle = p.type === 'health' ? '#ff5577' : p.type === 'armor' ? '#55b7ff' : 'rgba(104,217,135,.8)'
      ctx.beginPath()
      ctx.arc(ox + p.pos.x * scale, oy + p.pos.z * scale, 3, 0, TAU)
      ctx.fill()
    }
    // player
    const hx = ox + this.player.pos.x * scale
    const hy = oy + this.player.pos.z * scale
    const heading = this.player.car ? this.player.car.heading : this.player.heading
    ctx.save()
    ctx.translate(hx, hy)
    ctx.rotate(heading)
    ctx.fillStyle = '#f7f8f4'
    ctx.beginPath()
    ctx.moveTo(0, -10)
    ctx.lineTo(7, 7)
    ctx.lineTo(0, 4)
    ctx.lineTo(-7, 7)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    // labels
    ctx.fillStyle = 'rgba(230,240,230,.55)'
    ctx.font = '600 16px Rajdhani, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('SUNSET CITY · DISTRICT MAP', S / 2, 26)
  }
}

export { CAR_COLORS, CAR_NAMES }
