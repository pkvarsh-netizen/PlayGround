import * as THREE from 'three'
import { rand, clamp, glowTexture } from './utils.js'

class ParticlePool {
  constructor(scene, max, blending, opacityScale = 1) {
    this.max = max
    this.particles = []
    this.geo = new THREE.BufferGeometry()
    this.positions = new Float32Array(max * 3)
    this.colors = new Float32Array(max * 3)
    this.sizes = new Float32Array(max)
    this.alphas = new Float32Array(max)
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('pcolor', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('psize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('palpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage))
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: glowTexture() }, opacityScale: { value: opacityScale } },
      vertexShader: /* glsl */`
        attribute vec3 pcolor;
        attribute float psize;
        attribute float palpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = pcolor;
          vAlpha = palpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * (330.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D map;
        uniform float opacityScale;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor, t.a * vAlpha * opacityScale);
          if (gl_FragColor.a < 0.01) discard;
        }`,
      transparent: true,
      depthWrite: false,
      blending
    })
    this.points = new THREE.Points(this.geo, this.mat)
    this.points.frustumCulled = false
    this.points.renderOrder = 5
    scene.add(this.points)
    for (let i = 0; i < max; i++) this.particles.push({ alive: false })
    this.cursor = 0
  }

  emit(x, y, z, vx, vy, vz, life, size, color, gravity = 0, drag = 0, grow = 0, alpha = 1) {
    let p
    for (let i = 0; i < this.max; i++) {
      const idx = (this.cursor + i) % this.max
      if (!this.particles[idx].alive) { p = this.particles[idx]; this.cursor = (idx + 1) % this.max; break }
    }
    if (!p) { p = this.particles[this.cursor]; this.cursor = (this.cursor + 1) % this.max }
    p.alive = true
    p.x = x; p.y = y; p.z = z
    p.vx = vx; p.vy = vy; p.vz = vz
    p.life = life; p.maxLife = life
    p.size = size; p.color = color
    p.gravity = gravity; p.drag = drag; p.grow = grow
    p.alpha = alpha
  }

  update(dt) {
    let n = 0
    for (let i = 0; i < this.max; i++) {
      const p = this.particles[i]
      if (!p.alive) {
        this.alphas[i] = 0
        this.sizes[i] = 0
        continue
      }
      p.life -= dt
      if (p.life <= 0) {
        p.alive = false
        this.alphas[i] = 0
        this.sizes[i] = 0
        continue
      }
      const drag = Math.exp(-p.drag * dt)
      p.vx *= drag
      p.vz *= drag
      p.vy = p.vy * drag - p.gravity * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      if (p.y < 0.04) { p.y = 0.04; p.vy = Math.abs(p.vy) * 0.25 }
      const t = p.life / p.maxLife
      this.positions[n * 3] = p.x
      this.positions[n * 3 + 1] = p.y
      this.positions[n * 3 + 2] = p.z
      this.colors[n * 3] = p.color.r
      this.colors[n * 3 + 1] = p.color.g
      this.colors[n * 3 + 2] = p.color.b
      this.sizes[n] = Math.max(0.01, p.size + p.grow * (1 - t))
      this.alphas[n] = Math.min(1, t * 1.7) * p.alpha
      n++
    }
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.pcolor.needsUpdate = true
    this.geo.attributes.psize.needsUpdate = true
    this.geo.attributes.palpha.needsUpdate = true
    this.geo.setDrawRange(0, this.max)
  }
}

const tempColor = new THREE.Color()

export class Effects {
  constructor(scene) {
    this.scene = scene
    this.glow = new ParticlePool(scene, 700, THREE.AdditiveBlending, 1)
    this.smokePool = new ParticlePool(scene, 420, THREE.NormalBlending, 0.55)
    this.shake = 0
    this.flashes = []
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: 0xffd08a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
      }))
      s.scale.set(2, 2, 1)
      scene.add(s)
      this.flashes.push({ sprite: s, life: 0, maxLife: 0.07, size: 2 })
    }
    this.flashCursor = 0

    const maxTracers = 40
    this.tracerPos = new Float32Array(maxTracers * 6)
    this.tracerCol = new Float32Array(maxTracers * 6)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3).setUsage(THREE.DynamicDrawUsage))
    this.tracerMesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    }))
    this.tracerMesh.frustumCulled = false
    scene.add(this.tracerMesh)
    this.tracers = []

    this.explosionLight = new THREE.PointLight(0xffaa55, 0, 55, 2)
    scene.add(this.explosionLight)
    this.explosionLightLife = 0
  }

  addShake(v) {
    this.shake = Math.min(1.4, this.shake + v)
  }

  emit(x, y, z, opts = {}) {
    const color = tempColor.set(opts.color ?? 0xffffff).clone()
    const count = opts.count ?? 1
    for (let i = 0; i < count; i++) {
      const sp = opts.speed ?? 0
      const spread = opts.spread ?? 1
      this.glow.emit(
        x + rand(-spread, spread) * 0.1, y + rand(-spread, spread) * 0.1, z + rand(-spread, spread) * 0.1,
        (opts.vx ?? 0) + rand(-sp, sp), (opts.vy ?? 0) + rand(-sp, sp) * 0.6, (opts.vz ?? 0) + rand(-sp, sp),
        rand(opts.lifeMin ?? 0.2, opts.lifeMax ?? 0.6),
        rand(opts.sizeMin ?? 0.15, opts.sizeMax ?? 0.4),
        color,
        opts.gravity ?? 0,
        opts.drag ?? 1,
        opts.grow ?? 0,
        opts.alpha ?? 1
      )
    }
  }

  smoke(x, y, z, scale = 1) {
    const c = new THREE.Color().setHSL(0.08, 0.03, rand(0.16, 0.3)).clone()
    for (let i = 0; i < 2; i++) {
      this.smokePool.emit(
        x + rand(-0.3, 0.3), y + rand(-0.1, 0.3), z + rand(-0.3, 0.3),
        rand(-0.4, 0.4), rand(0.7, 1.5), rand(-0.4, 0.4),
        rand(0.8, 1.8), rand(0.7, 1.3) * scale, c, -0.35, 0.7, rand(1.4, 2.6) * scale, 0.85
      )
    }
  }

  fire(x, y, z, scale = 1) {
    this.emit(x, y, z, { color: 0xff7a22, count: 1, speed: 0.8, vy: 2.2, lifeMin: 0.2, lifeMax: 0.5, sizeMin: 0.5, sizeMax: 1.1, grow: 0.6, gravity: -1 })
    this.emit(x, y, z, { color: 0xffd56a, count: 1, speed: 0.3, vy: 1.8, lifeMin: 0.12, lifeMax: 0.3, sizeMin: 0.3, sizeMax: 0.6, gravity: -1 })
    if (Math.random() < 0.5) this.smoke(x, y + 0.4, z, scale * 1.2)
  }

  sparks(x, y, z, n = 8, color = 0xffd27a) {
    this.emit(x, y, z, { color, count: n, speed: 4.5, vy: 1.2, lifeMin: 0.12, lifeMax: 0.4, sizeMin: 0.06, sizeMax: 0.18, gravity: 9, drag: 1.4 })
  }

  blood(x, y, z, dir = null) {
    const c = 0x8e1717
    for (let i = 0; i < 7; i++) {
      this.smokePool.emit(
        x, y, z,
        (dir ? dir.x * 2 : 0) + rand(-1.2, 1.2), rand(0.2, 1.4), (dir ? dir.z * 2 : 0) + rand(-1.2, 1.2),
        rand(0.25, 0.6), rand(0.09, 0.2), new THREE.Color(c), 7, 0.3, 0, 0.9
      )
    }
  }

  muzzle(x, y, z) {
    const f = this.flashes[this.flashCursor]
    this.flashCursor = (this.flashCursor + 1) % this.flashes.length
    f.life = f.maxLife
    f.sprite.position.set(x, y, z)
    f.sprite.material.opacity = 1
    f.sprite.scale.setScalar(rand(1.3, 2.1))
    this.emit(x, y, z, { color: 0xffdf9a, count: 3, speed: 1.8, lifeMin: 0.05, lifeMax: 0.14, sizeMin: 0.2, sizeMax: 0.5 })
  }

  tracer(from, to, color = 0xffe6a8) {
    this.tracers.push({ from: from.clone(), to: to.clone(), life: 0.09, maxLife: 0.09, color: new THREE.Color(color) })
    if (this.tracers.length > 30) this.tracers.shift()
  }

  explosion(x, y, z) {
    this.explosionLight.position.set(x, y + 2, z)
    this.explosionLight.intensity = 220
    this.explosionLightLife = 0.35
    for (let i = 0; i < 42; i++) {
      const a = rand(0, Math.PI * 2)
      const s = rand(3, 12)
      this.emit(x, y + 0.5, z, {
        color: Math.random() < 0.5 ? 0xffb347 : 0xff5a1f,
        vx: Math.cos(a) * s, vy: rand(2, 9), vz: Math.sin(a) * s,
        lifeMin: 0.3, lifeMax: 0.9, sizeMin: 0.4, sizeMax: 1.5, grow: 2.2, gravity: 6, drag: 0.5
      })
    }
    for (let i = 0; i < 16; i++) {
      const a = rand(0, Math.PI * 2)
      this.smokePool.emit(
        x + rand(-0.6, 0.6), y + rand(0.4, 2), z + rand(-0.6, 0.6),
        Math.cos(a) * rand(1, 4), rand(2, 6), Math.sin(a) * rand(1, 4),
        rand(1.6, 3.2), rand(1.2, 2.6), new THREE.Color().setHSL(0.05, 0.05, 0.12), -0.6, 0.8, rand(2, 4), 0.9
      )
    }
    this.addShake(0.9)
  }

  update(dt) {
    this.glow.update(dt)
    this.smokePool.update(dt)
    this.shake = Math.max(0, this.shake - dt * 2.4)

    for (const f of this.flashes) {
      if (f.life > 0) {
        f.life -= dt
        f.sprite.material.opacity = Math.max(0, f.life / f.maxLife)
        if (f.life <= 0) f.sprite.material.opacity = 0
      }
    }

    // Tracers
    let ti = 0
    for (let i = this.tracers.length - 1; i >= 0; i--) this.tracers[i].life -= dt
    this.tracers = this.tracers.filter((t) => t.life > 0)
    for (const t of this.tracers) {
      if (ti >= 40) break
      this.tracerPos[ti * 6] = t.from.x
      this.tracerPos[ti * 6 + 1] = t.from.y
      this.tracerPos[ti * 6 + 2] = t.from.z
      this.tracerPos[ti * 6 + 3] = t.to.x
      this.tracerPos[ti * 6 + 4] = t.to.y
      this.tracerPos[ti * 6 + 5] = t.to.z
      const a = clamp(t.life / t.maxLife, 0, 1)
      this.tracerCol[ti * 6] = t.color.r * a
      this.tracerCol[ti * 6 + 1] = t.color.g * a
      this.tracerCol[ti * 6 + 2] = t.color.b * a
      this.tracerCol[ti * 6 + 3] = t.color.r * a
      this.tracerCol[ti * 6 + 4] = t.color.g * a
      this.tracerCol[ti * 6 + 5] = t.color.b * a
      ti++
    }
    for (let i = ti; i < 40; i++) {
      this.tracerPos.fill(0, i * 6, i * 6 + 6)
      this.tracerCol.fill(0, i * 6, i * 6 + 6)
    }
    this.tracerMesh.geometry.attributes.position.needsUpdate = true
    this.tracerMesh.geometry.attributes.color.needsUpdate = true
    this.tracerMesh.geometry.setDrawRange(0, ti * 2)

    if (this.explosionLightLife > 0) {
      this.explosionLightLife -= dt
      this.explosionLight.intensity = Math.max(0, this.explosionLight.intensity - dt * 700)
    } else {
      this.explosionLight.intensity = 0
    }
  }
}
