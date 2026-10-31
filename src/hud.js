import { clamp, formatMoney, TAU } from './utils.js'
import { GRID, CITY_EDGE } from './world.js'

const $ = (id) => document.getElementById(id)

export class HUD {
  constructor(game) {
    this.game = game
    this.el = {
      hud: $('hud'),
      health: $('health-fill'),
      armor: $('armor-fill'),
      money: $('money'),
      stars: [...document.querySelectorAll('#stars .star')],
      clock: $('clock'),
      location: $('location'),
      objTitle: $('obj-title'),
      objText: $('obj-text'),
      objDist: $('obj-dist'),
      objTimer: $('obj-timer'),
      weaponName: $('weapon-name'),
      ammo: $('ammo'),
      reload: $('reload-fill'),
      speedo: $('speedo'),
      speedValue: $('speed-value'),
      gear: $('gear'),
      prompt: $('prompt'),
      crosshair: $('crosshair'),
      toasts: $('toasts'),
      banner: $('mission-banner'),
      bannerTitle: $('banner-title'),
      bannerSub: $('banner-sub'),
      wasted: $('wasted'),
      vignette: $('vignette'),
      damageFlash: $('damage-flash'),
      hitmarker: $('hitmarker'),
      start: $('start-screen'),
      pause: $('pause-screen'),
      pauseBtn: $('pause-btn'),
      minimap: $('minimap')
    }
    this.ctx = this.el.minimap.getContext('2d')
    this.cache = {}
    this.toastTimes = []
    this.bannerTimer = 0
    this.wastedTimer = 0
    this.minimapTick = 0
    this.resizeMinimap()
    window.addEventListener('resize', () => this.resizeMinimap())
    this.toasts = []
  }

  resizeMinimap() {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const size = this.el.minimap.clientWidth || 180
    this.el.minimap.width = Math.round(size * dpr)
    this.el.minimap.height = Math.round(size * dpr)
    this.mapDpr = dpr
    this.mapSize = size
    this.mapR = size * 0.47
  }

  setText(key, el, value) {
    if (this.cache[key] === value) return
    this.cache[key] = value
    el.textContent = value
  }

  showStart() {
    this.el.start.classList.remove('hidden')
    this.el.hud.classList.add('hidden')
  }

  hideStart() {
    this.el.start.classList.add('hidden')
    this.el.hud.classList.remove('hidden')
  }

  showPause() { this.el.pause.classList.remove('hidden') }
  hidePause() { this.el.pause.classList.add('hidden') }

  showWasted(title = 'WASTED', sub = 'Sunset City Medical has been notified') {
    this.el.wasted.querySelector('#wasted-title').textContent = title
    this.el.wasted.querySelector('#wasted-sub').textContent = sub
    this.el.wasted.classList.remove('hidden')
    this.wastedTimer = 3.4
  }

  toast(text, type = '') {
    const div = document.createElement('div')
    div.className = 'toast ' + type
    div.textContent = text
    this.el.toasts.appendChild(div)
    this.toasts.push({ el: div, life: 3.2 })
    while (this.toasts.length > 4) {
      const old = this.toasts.shift()
      old.el.remove()
    }
  }

  banner(title, sub = '', time = 2.6) {
    this.el.bannerTitle.textContent = title
    this.el.bannerSub.textContent = sub
    this.el.banner.classList.remove('hidden')
    this.el.banner.classList.add('show')
    this.bannerTimer = time
  }

  flashDamage(amount = 0.6) {
    this.el.damageFlash.style.opacity = String(clamp(amount, 0, 1))
    this.el.vignette.classList.add('hit')
    clearTimeout(this._dmgT)
    this._dmgT = setTimeout(() => {
      this.el.damageFlash.style.opacity = '0'
      this.el.vignette.classList.remove('hit')
    }, 220)
  }

  hitmarker(kill = false) {
    this.el.hitmarker.classList.remove('show', 'kill')
    void this.el.hitmarker.offsetWidth
    this.el.hitmarker.classList.add('show')
    if (kill) this.el.hitmarker.classList.add('kill')
    clearTimeout(this._hitT)
    this._hitT = setTimeout(() => this.el.hitmarker.classList.remove('show', 'kill'), 160)
  }

  setPrompt(text) {
    if (this.cache.prompt === text) return
    this.cache.prompt = text
    this.el.prompt.textContent = text || ''
    this.el.prompt.classList.toggle('hidden', !text)
  }

  update(dt, game) {
    const p = game.player
    this.el.health.style.transform = `scaleX(${clamp(p.health / 100, 0, 1)})`
    this.el.armor.style.transform = `scaleX(${clamp(p.armor / 100, 0, 1)})`
    this.el.health.classList.toggle('low', p.health < 30)
    this.setText('money', this.el.money, formatMoney(p.money))

    const stars = Math.round(game.wanted)
    if (this.cache.stars !== stars) {
      this.cache.stars = stars
      this.el.stars.forEach((s, i) => s.classList.toggle('on', i < stars))
      this.el.stars.forEach((s) => s.classList.toggle('pulse', stars > 0))
    }
    this.setText('clock', this.el.clock, game.world.getTimeString())
    this.setText('loc', this.el.location, locName(p.pos))

    if (p.reloading) {
      const t = 1 - p.reloadTimer / p.reloadTime
      this.el.reload.style.transform = `scaleX(${clamp(t, 0, 1)})`
      this.setText('ammo', this.el.ammo, 'RELOADING')
    } else {
      this.el.reload.style.transform = 'scaleX(0)'
      this.setText('ammo', this.el.ammo, `${p.ammo} / ${p.reserve}`)
    }
    this.setText('weapon', this.el.weaponName, p.car ? 'DRIVE' : 'PISTOL')

    const driving = !!p.car
    this.el.speedo.classList.toggle('hidden', !driving)
    this.el.crosshair.classList.toggle('hidden', driving)
    if (driving) {
      this.setText('speed', this.el.speedValue, String(Math.round(p.car.speedKmh)))
      this.setText('gear', this.el.gear, p.car.speed < -0.5 ? 'R' : p.car.speed > 1 ? 'D' : 'N')
    }
    this.el.crosshair.classList.toggle('aiming', game.input.aiming && !driving)
    this.el.crosshair.style.setProperty('--spread', game.input.aiming ? '6px' : '14px')

    // Objective
    const obj = game.missions.getHudState()
    if (obj) {
      this.setText('objTitle', this.el.objTitle, obj.title)
      this.setText('objText', this.el.objText, obj.text || '')
      this.setText('objDist', this.el.objDist, obj.distance != null ? `${Math.round(obj.distance)} m` : '')
      this.setText('objTimer', this.el.objTimer, obj.timer != null ? `${Math.ceil(obj.timer)}s` : '')
      this.el.objTimer.classList.toggle('warn', obj.timer != null && obj.timer < 10)
    } else {
      this.setText('objTitle', this.el.objTitle, 'FREE ROAM')
      this.setText('objText', this.el.objText, 'Explore Sunset City. Find the gold marker to start a job.')
      this.setText('objDist', this.el.objDist, '')
      this.setText('objTimer', this.el.objTimer, '')
    }

    // Toasts
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i]
      t.life -= dt
      if (t.life < 0.6) t.el.style.opacity = String(clamp(t.life / 0.6, 0, 1))
      if (t.life <= 0) { t.el.remove(); this.toasts.splice(i, 1) }
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt
      if (this.bannerTimer <= 0) {
        this.el.banner.classList.add('hidden')
        this.el.banner.classList.remove('show')
      }
    }
    if (this.wastedTimer > 0) {
      this.wastedTimer -= dt
      if (this.wastedTimer <= 0) this.el.wasted.classList.add('hidden')
    }

    this.minimapTick += dt
    if (this.minimapTick > 1 / 24) {
      this.minimapTick = 0
      this.drawMinimap(game)
    }
  }

  drawMinimap(game) {
    const ctx = this.ctx
    const dpr = this.mapDpr || 1
    const size = this.mapSize || 180
    const r = this.mapR || 84
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)
    const cx = size / 2
    const cy = size / 2
    const scale = 0.8
    const yaw = game.player.camYaw
    const cos = Math.cos(yaw)
    const sin = Math.sin(yaw)
    const p = game.player.car ? game.player.car.pos : game.player.pos
    const px = p.x
    const pz = p.z

    const toScreen = (x, z) => {
      const dx = x - px
      const dz = z - pz
      return [cx + (dx * cos - dz * sin) * scale, cy + (dx * sin + dz * cos) * scale]
    }

    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, TAU)
    ctx.clip()
    ctx.fillStyle = '#1b2024'
    ctx.fillRect(0, 0, size, size)

    // Water / beach south (rotates with the minimap).
    const water = [
      toScreen(-1200, 452), toScreen(1200, 452),
      toScreen(1200, 1400), toScreen(-1200, 1400)
    ]
    ctx.fillStyle = '#123a46'
    ctx.beginPath()
    ctx.moveTo(water[0][0], water[0][1])
    for (let k = 1; k < water.length; k++) ctx.lineTo(water[k][0], water[k][1])
    ctx.closePath()
    ctx.fill()

    // Blocks
    ctx.fillStyle = '#2c3137'
    for (let i = -5; i < 5; i++) {
      for (let j = -5; j < 5; j++) {
        const bx = GRID * i + GRID / 2
        const bz = GRID * j + GRID / 2
        const half = 26
        const corners = [
          toScreen(bx - half, bz - half),
          toScreen(bx + half, bz - half),
          toScreen(bx + half, bz + half),
          toScreen(bx - half, bz + half)
        ]
        ctx.beginPath()
        ctx.moveTo(corners[0][0], corners[0][1])
        for (let k = 1; k < 4; k++) ctx.lineTo(corners[k][0], corners[k][1])
        ctx.closePath()
        ctx.fill()
      }
    }

    // Roads
    ctx.strokeStyle = '#4b5158'
    ctx.lineWidth = 18 * scale
    for (let line = -5; line <= 5; line++) {
      const p0 = toScreen(GRID * line, -CITY_EDGE)
      const p1 = toScreen(GRID * line, CITY_EDGE)
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke()
      const p2 = toScreen(-CITY_EDGE, GRID * line)
      const p3 = toScreen(CITY_EDGE, GRID * line)
      ctx.beginPath(); ctx.moveTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.stroke()
    }

    // Mission marker
    const missionPos = game.missions.getMarkerPos()
    if (missionPos) {
      const [mx, my] = toScreen(missionPos.x, missionPos.z)
      ctx.save()
      ctx.translate(mx, my)
      ctx.rotate(Math.PI / 4)
      ctx.fillStyle = '#ffd24a'
      ctx.strokeStyle = '#5a4300'
      ctx.lineWidth = 1.5
      ctx.fillRect(-5, -5, 10, 10)
      ctx.strokeRect(-5, -5, 10, 10)
      ctx.restore()
    }

    // Pickups
    for (const pickup of game.pickups) {
      if (pickup.taken) continue
      const [ix, iy] = toScreen(pickup.pos.x, pickup.pos.z)
      if ((ix - cx) ** 2 + (iy - cy) ** 2 > r * r) continue
      ctx.fillStyle = pickup.type === 'health' ? '#6dff8a' : pickup.type === 'armor' ? '#6db7ff' : '#ffd24a'
      ctx.beginPath(); ctx.arc(ix, iy, 2.2, 0, TAU); ctx.fill()
    }

    // Traffic
    for (const v of game.vehicles) {
      if (v.occupiedByPlayer || v.destroyed) continue
      const [vx, vy] = toScreen(v.pos.x, v.pos.z)
      if ((vx - cx) ** 2 + (vy - cy) ** 2 > r * r) continue
      ctx.fillStyle = v.police ? '#7fa8ff' : '#d7d7d7'
      ctx.fillRect(vx - 1.5, vy - 1.5, 3, 3)
    }

    // Cops
    for (const cop of game.cops) {
      if (cop.dead) continue
      const [ox, oy] = toScreen(cop.pos.x, cop.pos.z)
      if ((ox - cx) ** 2 + (oy - cy) ** 2 > r * r) continue
      ctx.fillStyle = '#ff5050'
      ctx.beginPath(); ctx.arc(ox, oy, 2.6, 0, TAU); ctx.fill()
    }
    for (const v of game.vehicles) {
      if (!v.police || v.destroyed) continue
      const [ox, oy] = toScreen(v.pos.x, v.pos.z)
      if ((ox - cx) ** 2 + (oy - cy) ** 2 > r * r) continue
      ctx.fillStyle = Math.sin(performance.now() * 0.012) > 0 ? '#ff3030' : '#3060ff'
      ctx.beginPath(); ctx.arc(ox, oy, 3.4, 0, TAU); ctx.fill()
    }

    // Player arrow
    ctx.save()
    ctx.translate(cx, cy)
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#12151a'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(0, -8)
    ctx.lineTo(5.5, 6)
    ctx.lineTo(0, 3)
    ctx.lineTo(-5.5, 6)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()

    // North marker
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.font = 'bold 9px Arial'
    ctx.textAlign = 'center'
    const nx = cx + Math.sin(yaw) * (r - 10)
    const ny = cy - Math.cos(yaw) * (r - 10)
    ctx.fillText('N', nx, ny + 3)

    ctx.restore()

    // Border
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, TAU)
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, r + 1.5, 0, TAU)
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

function locName(pos) {
  const beach = pos.z > 340
  if (beach) return 'Vice Beach'
  const x = pos.x
  const z = pos.z
  if (Math.abs(x) < 90 && Math.abs(z) < 90) return 'Downtown'
  if (x < -80 && z > 80) return 'West Grove'
  if (x > 120 && z < -40) return 'Casino Strip'
  if (z < -150) return 'Northside'
  if (x > 150) return 'East Docks'
  return 'Sunset City'
}
