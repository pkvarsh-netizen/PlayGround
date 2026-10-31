import * as THREE from 'three'
import { clamp, dist2, glowSprite, glowTexture } from './utils.js'

export const MISSIONS = [
  {
    id: 'welcome',
    title: 'Welcome to Sunset',
    start: { x: 0, z: 118 },
    reward: 600,
    steps: [
      { type: 'enterCar', text: 'Boost any vehicle' },
      { type: 'goto', target: { x: -160, z: 470 }, radius: 12, text: 'Drive the ride to the pier' }
    ]
  },
  {
    id: 'heat',
    title: 'Heat Wave',
    start: { x: 140, z: 140 },
    reward: 1000,
    steps: [
      { type: 'goto', target: { x: 140, z: 245 }, radius: 7, text: 'Meet the crew on the east side' },
      { type: 'survive', seconds: 35, stars: 2, text: 'Survive the police response' }
    ]
  },
  {
    id: 'company',
    title: 'Bad Company',
    start: { x: 35, z: 76 },
    reward: 1600,
    steps: [
      { type: 'goto', target: { x: 35, z: 58 }, radius: 7, text: 'Reach the plaza' },
      { type: 'kill', count: 3, text: 'Take out the dealers', spawn: [{ x: 22, z: 48 }, { x: 48, z: 48 }, { x: 35, z: 28 }] },
      { type: 'goto', target: { x: 0, z: -40 }, radius: 8, text: 'Drop the package downtown' }
    ]
  },
  {
    id: 'getaway',
    title: 'Getaway',
    start: { x: -140, z: -105 },
    reward: 2400,
    steps: [
      { type: 'goto', target: { x: -140, z: -190 }, radius: 8, text: 'Reach the northside garage' },
      { type: 'survive', seconds: 45, stars: 3, text: 'Lose the cops — survive 45 seconds' }
    ]
  },
  {
    id: 'score',
    title: 'The Big Score',
    start: { x: 175, z: -72 },
    reward: 6000,
    steps: [
      { type: 'goto', target: { x: 175, z: -84 }, radius: 7, text: 'Enter the casino' },
      { type: 'goto', target: { x: -160, z: 470 }, radius: 12, text: 'Deliver the briefcase to the pier', wanted: 3 }
    ]
  }
]

export class MissionManager {
  constructor(game) {
    this.game = game
    this.index = 0
    this.state = 'idle'
    this.stepIndex = -1
    this.timer = 0
    this.cooldown = 0
    this.failed = false
    this.kills = 0
    this.targets = []
    this.markerPos = { ...MISSIONS[0].start }
    this.buildMarker()
    this.stepStarted = false
    this.surviveStars = 0
  }

  buildMarker() {
    const g = new THREE.Group()
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.4, 0.16, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.9, toneMapped: false })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.15
    g.add(ring)
    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(2.2, 32),
      new THREE.MeshBasicMaterial({ color: 0xffc833, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    )
    inner.rotation.x = -Math.PI / 2
    inner.position.y = 0.14
    g.add(inner)
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 2.4, 30, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffc833, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false })
    )
    beam.position.y = 15
    g.add(beam)
    const icon = glowSprite(0xffd24a, 7, 0.85)
    icon.position.y = 4.2
    g.add(icon)
    this.icon = icon
    this.ring = ring
    this.beam = beam
    this.marker = g
    g.visible = false
    this.game.scene.add(g)
  }

  get currentMission() {
    return MISSIONS[this.index] || null
  }

  get currentStep() {
    const m = this.currentMission
    return m ? m.steps[this.stepIndex] : null
  }

  startMission() {
    const m = this.currentMission
    if (!m) return
    this.state = 'active'
    this.stepIndex = 0
    this.failed = false
    this.kills = 0
    this.targets = []
    this.game.audio.notify(true)
    this.game.hud.banner(m.title, m.steps[0].text, 3)
    this.game.hud.toast('MISSION STARTED', 'gold')
    this.startStep()
  }

  startStep() {
    const step = this.currentStep
    if (!step) return
    this.stepStarted = true
    this.stepTimer = 0
    this.kills = 0
    if (step.type === 'kill') {
      this.targets = []
      for (const pos of step.spawn) {
        const thug = this.game.spawnThug(pos.x, pos.z)
        thug.missionTag = 'target'
        this.targets.push(thug)
      }
      this.game.hud.toast('TARGETS MARKED', 'red')
    }
    if (step.type === 'survive') {
      this.timer = step.seconds
      this.surviveStars = step.stars
      this.game.setWanted(Math.max(this.game.wanted, step.stars), true)
      this.game.forcedWanted = step.stars
      this.game.hud.banner('HEAT INCOMING', 'Survive the police response', 2.4)
    } else if (step.wanted) {
      this.game.setWanted(Math.max(this.game.wanted, step.wanted), true)
      this.game.forcedWanted = step.wanted
    } else {
      this.game.forcedWanted = 0
    }
  }

  completeStep() {
    const m = this.currentMission
    if (!m) return
    this.stepIndex++
    if (this.stepIndex >= m.steps.length) {
      this.finishMission()
      return
    }
    this.game.audio.notify(true)
    this.game.hud.toast('OBJECTIVE UPDATED', 'gold')
    this.startStep()
  }

  finishMission() {
    const m = this.currentMission
    this.game.player.money += m.reward
    this.game.forcedWanted = 0
    this.state = 'cooldown'
    this.failed = false
    this.cooldown = 7
    this.game.audio.notify(true)
    this.game.hud.banner('MISSION PASSED', `${m.title}  ·  +$${m.reward}`, 4)
    this.game.hud.toast(`+$${m.reward}`, 'money')
    this.game.stats.missions++
    this.marker.visible = false
  }

  fail(reason = 'MISSION FAILED') {
    if (this.state !== 'active') return
    this.state = 'cooldown'
    this.failed = true
    this.cooldown = 5
    this.game.forcedWanted = 0
    this.game.hud.banner('MISSION FAILED', reason, 4)
    this.game.hud.toast(reason, 'red')
    this.marker.visible = false
    for (const t of this.targets) {
      if (t && !t.dead) {
        t.dead = true
        t.group.visible = false
        t.removed = true
      }
    }
    this.targets = []
  }

  registerKill(agent) {
    if (this.state !== 'active') return
    const step = this.currentStep
    if (!step || step.type !== 'kill') return
    if (agent.missionTag !== 'target') return
    this.kills++
    this.game.hud.toast(`TARGET DOWN  ${this.kills}/${step.count}`, 'red')
    if (this.kills >= step.count) {
      this.game.audio.notify(true)
      setTimeout(() => {
        if (this.state === 'active' && this.currentStep?.type === 'kill') this.completeStep()
      }, 900)
    }
  }

  update(dt) {
    const g = this.game
    if (this.marker.visible) {
      const t = performance.now() * 0.001
      this.ring.rotation.z = t * 0.7
      this.ring.scale.setScalar(1 + Math.sin(t * 2.2) * 0.06)
      this.icon.position.y = 4.2 + Math.sin(t * 2.5) * 0.35
      this.beam.material.opacity = 0.07 + Math.sin(t * 2) * 0.025
    }

    if (this.state === 'idle') {
      const m = this.currentMission
      if (!m) { this.state = 'complete'; return }
      this.marker.position.set(m.start.x, 0, m.start.z)
      this.marker.visible = true
      this.markerPos = m.start
      const d = dist2(g.player.pos.x, g.player.pos.z, m.start.x, m.start.z)
      if (d < 4.2) this.startMission()
      return
    }

    if (this.state === 'cooldown') {
      this.cooldown -= dt
      if (this.cooldown <= 0) {
        if (this.failed) {
          this.state = 'idle'
          this.failed = false
          this.markerPos = this.currentMission?.start || null
        } else {
          this.index++
          if (this.index >= MISSIONS.length) {
            this.state = 'complete'
            this.game.hud.banner('CITY LEGEND', 'All jobs complete. The city is yours.', 5)
            this.game.hud.toast('ALL MISSIONS COMPLETE', 'gold')
            this.marker.visible = false
          } else {
            this.state = 'idle'
            this.stepIndex = -1
            this.markerPos = this.currentMission.start
          }
        }
      }
      return
    }

    if (this.state === 'complete') return

    if (this.state === 'active') {
      const step = this.currentStep
      if (!step) return
      const p = g.player.car ? g.player.pos : g.player.pos
      if (step.type === 'enterCar') {
        if (g.player.car && !g.player.car.destroyed) this.completeStep()
        return
      }
      if (step.type === 'goto') {
        this.marker.position.set(step.target.x, 0, step.target.z)
        this.marker.visible = true
        this.markerPos = step.target
        const pos = g.player.car ? g.player.car.pos : g.player.pos
        if (dist2(pos.x, pos.z, step.target.x, step.target.z) < step.radius) {
          this.completeStep()
        }
        return
      }
      if (step.type === 'kill') {
        const alive = this.targets.filter((t) => t && !t.dead)
        if (alive.length) {
          this.marker.position.set(alive[0].pos.x, 0, alive[0].pos.z)
          this.marker.visible = true
          this.markerPos = { x: alive[0].pos.x, z: alive[0].pos.z }
        } else {
          this.marker.visible = false
        }
        return
      }
      if (step.type === 'survive') {
        this.timer -= dt
        g.forcedWanted = step.stars
        if (g.wanted < step.stars) g.setWanted(step.stars, true)
        if (this.timer <= 0) {
          g.forcedWanted = 0
          this.completeStep()
        }
        return
      }
    }
  }

  getMarkerPos() {
    if (this.state === 'complete' || this.state === 'cooldown') return null
    if (this.state === 'active') {
      const step = this.currentStep
      if (step?.type === 'enterCar') return null
      if (step?.type === 'goto') return step.target
      if (step?.type === 'kill') {
        const alive = this.targets.find((t) => t && !t.dead)
        return alive ? { x: alive.pos.x, z: alive.pos.z } : null
      }
      return null
    }
    const m = this.currentMission
    return m ? m.start : null
  }

  getHudState() {
    const m = this.currentMission
    if (!m) return null
    if (this.state === 'complete') {
      return { title: 'FREE ROAM', text: 'All jobs complete. Raise hell, explore the city, or just watch the sunset.', distance: null, timer: null }
    }
    if (this.state === 'cooldown') {
      return { title: m.title, text: this.failed ? 'Regrouping…' : 'Job complete', distance: null, timer: null }
    }
    if (this.state === 'idle') {
      const d = dist2(this.game.player.pos.x, this.game.player.pos.z, m.start.x, m.start.z)
      return { title: 'AVAILABLE JOB', text: `${m.title} — ${m.steps[0].text}`, distance: d, timer: null }
    }
    const step = this.currentStep
    if (!step) return null
    let d = null
    if (step.type === 'goto') {
      const pos = this.game.player.car ? this.game.player.car.pos : this.game.player.pos
      d = dist2(pos.x, pos.z, step.target.x, step.target.z)
    }
    if (step.type === 'kill') {
      const alive = this.targets.filter((t) => t && !t.dead)
      if (alive.length) d = dist2(this.game.player.pos.x, this.game.player.pos.z, alive[0].pos.x, alive[0].pos.z)
    }
    return {
      title: m.title,
      text: step.text + (step.type === 'kill' ? ` (${this.kills}/${step.count})` : ''),
      distance: d,
      timer: step.type === 'survive' ? this.timer : null
    }
  }
}
