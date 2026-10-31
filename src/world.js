import * as THREE from 'three'
import {
  TAU, clamp, lerp, rand, randInt, pick, chance,
  asphaltTexture, concreteTexture, sandTexture, grassTexture,
  facadeTextures, neonTexture, glowTexture, glowSprite, shopTexture
} from './utils.js'

export const GRID = 70
export const CITY_EDGE = 350
export const ROAD_HALF = 9
export const BLOCK_HALF = 26
export const OCEAN_Z = 438

const FOG_DENSITY = 0.0019

export class World {
  constructor(scene, renderer) {
    this.scene = scene
    this.renderer = renderer
    this.group = new THREE.Group()
    scene.add(this.group)
    this.buildings = []
    this.buildingParts = [[], [], [], []]
    this.buildingMeshes = []
    this.colliders = []
    this.streetlights = []
    this.timeOfDay = 17.35
    this.dayLength = 2400 // seconds per 24h
    this.nightFactor = 0
    this._t = 0
    this._lightTimer = 0
    this._textures = {}
    this._build()
  }

  _build() {
    this._makeSky()
    this._makeLights()
    this._makeGround()
    this._makeCity()
    this._makePark()
    this._makePlaza()
    this._makeCasino()
    this._makeStreetFurniture()
    this._makeBeach()
    this._makeDistant()
    this._makeCityLights()
  }

  _makeSky() {
    const geo = new THREE.SphereGeometry(880, 32, 20)
    this.skyUniforms = {
      topColor: { value: new THREE.Color(0x2c3a78) },
      horizonColor: { value: new THREE.Color(0xff945c) },
      sunDir: { value: new THREE.Vector3(0, 0.2, 0.3) },
      sunColor: { value: new THREE.Color(0xffd39a) }
    }
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this.skyUniforms,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 sunDir;
        uniform vec3 sunColor;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y * 1.35 + 0.08, 0.0, 1.0);
          vec3 col = mix(horizonColor, topColor, pow(h, 0.62));
          float sd = max(dot(d, normalize(sunDir)), 0.0);
          col += sunColor * pow(sd, 420.0) * 2.2;
          col += sunColor * pow(sd, 9.0) * 0.22;
          gl_FragColor = vec4(col, 1.0);
        }`
    })
    this.sky = new THREE.Mesh(geo, mat)
    this.sky.frustumCulled = false
    this.scene.add(this.sky)

    this.sunSprite = glowSprite(0xffd9a0, 170, 0.95)
    this.sunSprite.material.depthWrite = false
    this.scene.add(this.sunSprite)

    // Soft cloud banks near the horizon.
    this.clouds = []
    const cloudColors = [0xffd0b0, 0xffb9a0, 0xc8a6c8]
    for (let i = 0; i < 12; i++) {
      const s = glowSprite(pick(cloudColors), rand(70, 160), rand(0.07, 0.16))
      const a = rand(0, TAU)
      const r = rand(280, 620)
      s.position.set(Math.cos(a) * r, rand(55, 130), Math.sin(a) * r)
      s.scale.y *= 0.33
      this.scene.add(s)
      this.clouds.push(s)
    }

    this.stars = null
    const starGeo = new THREE.BufferGeometry()
    const pos = []
    for (let i = 0; i < 900; i++) {
      const a = rand(0, TAU)
      const y = rand(0.12, 1)
      const r = Math.sqrt(1 - y * y) * 830
      pos.push(Math.cos(a) * r, y * 830, Math.sin(a) * r)
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    this.starMat = new THREE.PointsMaterial({
      color: 0xdfe8ff, size: 1.9, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false
    })
    this.stars = new THREE.Points(starGeo, this.starMat)
    this.scene.add(this.stars)
    this.scene.fog = new THREE.FogExp2(0xbc8f82, FOG_DENSITY)
  }

  _makeLights() {
    this.hemi = new THREE.HemisphereLight(0x9fc4ff, 0x4c4038, 0.7)
    this.scene.add(this.hemi)
    this.ambient = new THREE.AmbientLight(0x93a6c9, 0.34)
    this.scene.add(this.ambient)
    this.sun = new THREE.DirectionalLight(0xffd0a0, 2.4)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(1024, 1024)
    this.sun.shadow.camera.left = -95
    this.sun.shadow.camera.right = 95
    this.sun.shadow.camera.top = 95
    this.sun.shadow.camera.bottom = -95
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 420
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.035
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)

    this.lightPool = []
    for (let i = 0; i < 5; i++) {
      const l = new THREE.PointLight(0xffb35e, 0, 30, 2)
      this.scene.add(l)
      this.lightPool.push(l)
    }
    this.moon = new THREE.DirectionalLight(0x8ea6ff, 0)
    this.scene.add(this.moon)
  }

  _makeGround() {
    const asphalt = asphaltTexture()
    this._textures.asphalt = asphalt
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1700, 1700),
      new THREE.MeshStandardMaterial({ map: asphalt, color: 0xffffff, roughness: 0.94, metalness: 0.04 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.group.add(ground)
    this.ground = ground
  }

  _blockCenter(i, j) {
    return { x: GRID * i + GRID / 2, z: GRID * j + GRID / 2 }
  }

  _blockType(i, j) {
    if (i === 0 && j === 0) return 'plaza'
    if (i === -2 && j === 2) return 'park'
    if (i === 2 && j === -2) return 'casino'
    return 'city'
  }

  _makeCity() {
    const concrete = concreteTexture()
    this._textures.concrete = concrete
    const grass = grassTexture()
    this._textures.grass = grass

    const plateGeo = new THREE.BoxGeometry(52, 0.18, 52)
    const plateMat = new THREE.MeshStandardMaterial({ map: concrete, color: 0xb8b8bd, roughness: 0.95 })
    const parkMat = new THREE.MeshStandardMaterial({ map: grass, color: 0xffffff, roughness: 1 })
    const plates = new THREE.InstancedMesh(plateGeo, plateMat, 100)
    plates.receiveShadow = true
    const parkPlates = []
    let pi = 0
    let ppi = 0
    const m = new THREE.Matrix4()

    for (let i = -5; i < 5; i++) {
      for (let j = -5; j < 5; j++) {
        const type = this._blockType(i, j)
        const c = this._blockCenter(i, j)
        m.makeTranslation(c.x, 0.09, c.z)
        if (type === 'park') {
          parkPlates.push({ c })
          const p = new THREE.Mesh(new THREE.BoxGeometry(52, 0.2, 52), parkMat)
          p.position.set(c.x, 0.1, c.z)
          p.receiveShadow = true
          this.group.add(p)
          continue
        }
        plates.setMatrixAt(pi++, m)
        if (type === 'city') this._fillBlock(i, j)
      }
    }
    plates.count = pi
    plates.instanceMatrix.needsUpdate = true
    this.group.add(plates)

    this._mergeBuildings()

    // Lane dashes along the centre of every road, skipping intersections.
    const dashGeo = new THREE.BoxGeometry(0.18, 0.02, 3.4)
    const dashMat = new THREE.MeshStandardMaterial({ color: 0xd9d4c2, roughness: 0.8, emissive: 0x222018, emissiveIntensity: 0.2 })
    const dashes = []
    for (let line = -5; line <= 5; line++) {
      const p = GRID * line
      for (let s = -5; s < 5; s++) {
        for (let k = 0; k < 5; k++) {
          const z = GRID * s + 18 + k * 8.6
          dashes.push({ x: p, z, rot: false })
          dashes.push({ x: z, z: p, rot: true })
        }
      }
    }
    const dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length)
    let di = 0
    for (const d of dashes) {
      if (d.rot) {
        const rot = new THREE.Matrix4().makeRotationY(Math.PI / 2)
        rot.setPosition(d.x, 0.021, d.z)
        dashMesh.setMatrixAt(di++, rot)
      } else {
        m.makeTranslation(d.x, 0.021, d.z)
        dashMesh.setMatrixAt(di++, m)
      }
    }
    dashMesh.count = di
    dashMesh.instanceMatrix.needsUpdate = true
    this.group.add(dashMesh)

    // Crosswalk stripes at every intersection.
    const cwGeo = new THREE.BoxGeometry(1.5, 0.02, 3.1)
    const cw = []
    for (let i = -5; i <= 5; i++) {
      for (let j = -5; j <= 5; j++) {
        const x = GRID * i
        const z = GRID * j
        for (let k = -3; k <= 3; k++) {
          if (Math.abs(k) < 1) continue
          cw.push([x + k * 2.2, z - 12.4, 0])
          cw.push([x + k * 2.2, z + 12.4, 0])
          cw.push([x - 12.4, z + k * 2.2, 1])
          cw.push([x + 12.4, z + k * 2.2, 1])
        }
      }
    }
    const cwMesh = new THREE.InstancedMesh(cwGeo, new THREE.MeshStandardMaterial({ color: 0xcfc9b8, roughness: 0.85 }), cw.length)
    for (let i = 0; i < cw.length; i++) {
      const [x, z, rot] = cw[i]
      if (rot) {
        const mat = new THREE.Matrix4().makeRotationY(Math.PI / 2)
        mat.setPosition(x, 0.022, z)
        cwMesh.setMatrixAt(i, mat)
      } else {
        m.makeTranslation(x, 0.022, z)
        cwMesh.setMatrixAt(i, m)
      }
    }
    cwMesh.instanceMatrix.needsUpdate = true
    this.group.add(cwMesh)

    // Curbs
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x9d9da1, roughness: 0.9 })
    const curbGeo = new THREE.BoxGeometry(52.4, 0.3, 0.5)
    const curbs = new THREE.InstancedMesh(curbGeo, curbMat, 400)
    let ci = 0
    for (let i = -5; i < 5; i++) {
      for (let j = -5; j < 5; j++) {
        const c = this._blockCenter(i, j)
        if (this._blockType(i, j) === 'park') continue
        for (const [dx, dz, rot] of [[0, -26.2, 0], [0, 26.2, 0], [-26.2, 0, 1], [26.2, 0, 1]]) {
          const mat = rot ? new THREE.Matrix4().makeRotationY(Math.PI / 2) : new THREE.Matrix4()
          mat.setPosition(c.x + dx, 0.15, c.z + dz)
          curbs.setMatrixAt(ci++, mat)
        }
      }
    }
    curbs.count = ci
    curbs.instanceMatrix.needsUpdate = true
    this.group.add(curbs)
  }

  _fillBlock(i, j) {
    const c = this._blockCenter(i, j)
    const dist = Math.hypot(c.x, c.z)
    const downtown = clamp(1 - dist / 240, 0, 1)
    const beachfront = j >= 4
    const styles = [0, 1, 2, 3]

    const add = (x, z, w, d, h, style) => {
      const tint = new THREE.Color().setHSL(rand(0.05, 0.62), rand(0.02, 0.12), rand(0.55, 0.82))
      this._addBuilding(x, z, w, d, h, style, tint)
    }

    if (chance(0.18) && downtown > 0.25) {
      // Signature tower on the block
      const h = rand(55, 118) * (0.55 + downtown * 0.8)
      add(c.x, c.z, rand(28, 38), rand(28, 38), h, randInt(0, 3))
      return
    }

    const rows = chance(0.55) ? 2 : 1
    const cols = chance(0.55) ? 2 : 1
    const lot = 39
    const gap = 2.4
    const bw = (lot - gap * (cols - 1)) / cols
    const bd = (lot - gap * (rows - 1)) / rows
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        if (rows * cols === 4 && chance(0.12)) continue
        const x = c.x - lot / 2 + bw / 2 + col * (bw + gap)
        const z = c.z - lot / 2 + bd / 2 + r * (bd + gap)
        let h
        if (beachfront) h = rand(9, 22)
        else h = rand(11, 30) + Math.pow(downtown, 2.2) * rand(25, 80)
        if (chance(0.05) && downtown > 0.3) h = rand(85, 125)
        add(x, z, bw * rand(0.86, 1), bd * rand(0.86, 1), h, pick(styles))
      }
    }
  }

  _addBuilding(x, z, w, d, h, style, tint, yBase = 0.18) {
    const geo = new THREE.BoxGeometry(w, h, d)
    geo.translate(0, h / 2, 0)
    const uv = geo.attributes.uv
    const color = new Float32Array(geo.attributes.position.count * 3)
    const roof = new THREE.Color(0x2c2c30)
    const side = tint
    for (let f = 0; f < 6; f++) {
      let su, sv
      if (f === 0 || f === 1) { su = d / 8; sv = h / 7 }
      else if (f === 4 || f === 5) { su = w / 8; sv = h / 7 }
      else { su = w / 8; sv = d / 8 }
      for (let k = 0; k < 4; k++) {
        const idx = f * 4 + k
        uv.setXY(idx, uv.getX(idx) * su, uv.getY(idx) * sv)
        const cc = (f === 2 || f === 3) ? roof : side
        color[idx * 3] = cc.r
        color[idx * 3 + 1] = cc.g
        color[idx * 3 + 2] = cc.b
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(color, 3))
    geo.deleteAttribute('uv1')
    geo.deleteAttribute('uv2')
    const ng = geo.toNonIndexed()
    ng.translate(x, yBase, z)
    this.buildingParts[style].push(ng)
    geo.dispose()

    this.buildings.push({
      minX: x - w / 2, maxX: x + w / 2,
      minZ: z - d / 2, maxZ: z + d / 2,
      height: h + yBase, x, z, w, d, h
    })

    if (h > 18 && chance(0.4)) {
      this._roofProps = this._roofProps || []
      this._roofProps.push({ x, z, y: h + yBase, w, d })
    }
  }

  _mergeBuildings() {
    const mats = [0, 1, 2, 3].map((s) => {
      const tex = facadeTextures(s)
      this._textures['facade' + s] = tex
      return new THREE.MeshStandardMaterial({
        map: tex.map,
        emissiveMap: tex.emissive,
        emissive: 0xffffff,
        emissiveIntensity: 0,
        vertexColors: true,
        roughness: 0.82,
        metalness: 0.08
      })
    })
    this.buildingMaterials = mats
    for (let s = 0; s < 4; s++) {
      const parts = this.buildingParts[s]
      if (!parts.length) continue
      let vcount = 0
      for (const g of parts) vcount += g.attributes.position.count
      const pos = new Float32Array(vcount * 3)
      const nor = new Float32Array(vcount * 3)
      const uv = new Float32Array(vcount * 2)
      const col = new Float32Array(vcount * 3)
      let o = 0
      for (const g of parts) {
        const n = g.attributes.position.count
        pos.set(g.attributes.position.array, o * 3)
        nor.set(g.attributes.normal.array, o * 3)
        uv.set(g.attributes.uv.array, o * 2)
        col.set(g.attributes.color.array, o * 3)
        o += n
        g.dispose()
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      geo.computeBoundingSphere()
      const mesh = new THREE.Mesh(geo, mats[s])
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.group.add(mesh)
      this.buildingMeshes.push(mesh)
      this.colliders.push(mesh)
    }

    // Rooftop AC units and antennas.
    const props = this._roofProps || []
    const acGeo = new THREE.BoxGeometry(1, 1, 1)
    const acMat = new THREE.MeshStandardMaterial({ color: 0x6a6c70, roughness: 0.9 })
    const acMesh = new THREE.InstancedMesh(acGeo, acMat, props.length * 2)
    acMesh.castShadow = true
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const sc = new THREE.Vector3()
    const pv = new THREE.Vector3()
    let n = 0
    for (const p of props) {
      for (let k = 0; k < 2; k++) {
        if (chance(0.35)) continue
        pv.set(p.x + rand(-p.w * 0.28, p.w * 0.28), p.y + 0.8, p.z + rand(-p.d * 0.28, p.d * 0.28))
        sc.set(rand(1.5, 3.2), rand(1, 2), rand(1.5, 3.4))
        m.compose(pv, q, sc)
        acMesh.setMatrixAt(n++, m)
      }
    }
    acMesh.count = n
    acMesh.instanceMatrix.needsUpdate = true
    this.group.add(acMesh)

    const antGeo = new THREE.CylinderGeometry(0.08, 0.12, 1, 5)
    const antMat = new THREE.MeshStandardMaterial({ color: 0x44464c, roughness: 0.7, metalness: 0.5 })
    const antMesh = new THREE.InstancedMesh(antGeo, antMat, props.length)
    let an = 0
    for (const p of props) {
      if (!chance(0.5)) continue
      pv.set(p.x, p.y + rand(3, 7), p.z)
      sc.set(1, rand(6, 14), 1)
      m.compose(pv, q, sc)
      antMesh.setMatrixAt(an++, m)
    }
    antMesh.count = an
    antMesh.instanceMatrix.needsUpdate = true
    this.group.add(antMesh)
  }

  _makePark() {
    const c = this._blockCenter(-2, 2)
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 50),
      new THREE.MeshStandardMaterial({ map: this._textures.grass, color: 0x9bb07f, roughness: 1 })
    )
    grass.rotation.x = -Math.PI / 2
    grass.position.set(c.x, 0.21, c.z)
    grass.receiveShadow = true
    this.group.add(grass)

    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(9.5, 32),
      new THREE.MeshStandardMaterial({ color: 0x2d6e78, roughness: 0.15, metalness: 0.5 })
    )
    pond.rotation.x = -Math.PI / 2
    pond.position.set(c.x + 7, 0.24, c.z + 4)
    this.group.add(pond)
    this.pond = pond

    for (let i = 0; i < 22; i++) {
      const a = rand(0, TAU)
      const r = rand(9, 23)
      const x = c.x + Math.cos(a) * r
      const z = c.z + Math.sin(a) * r
      if (Math.abs(x - (c.x + 7)) < 12 && Math.abs(z - (c.z + 4)) < 12) continue
      this._tree(x, z, rand(0.8, 1.5))
    }
    this._bench(c.x - 4, c.z - 14)
    this._bench(c.x + 15, c.z - 3)
  }

  _makePlaza() {
    const c = this._blockCenter(0, 0)
    // Dark paved plaza with concentric fountain.
    const pave = new THREE.Mesh(
      new THREE.CircleGeometry(25.5, 48),
      new THREE.MeshStandardMaterial({ color: 0x8b8175, roughness: 0.9 })
    )
    pave.rotation.x = -Math.PI / 2
    pave.position.set(c.x, 0.2, c.z)
    pave.receiveShadow = true
    this.group.add(pave)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(12, 12.6, 48),
      new THREE.MeshStandardMaterial({ color: 0xd9c9a8, roughness: 0.6 })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.set(c.x, 0.215, c.z)
    this.group.add(ring)

    const base = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 7, 0.7, 24), new THREE.MeshStandardMaterial({ color: 0xb6a98f, roughness: 0.8 }))
    base.position.set(c.x, 0.55, c.z)
    base.castShadow = true
    base.receiveShadow = true
    this.group.add(base)
    const water = new THREE.Mesh(new THREE.CircleGeometry(5.4, 32), new THREE.MeshStandardMaterial({ color: 0x4c9aa8, roughness: 0.12, metalness: 0.4 }))
    water.rotation.x = -Math.PI / 2
    water.position.set(c.x, 0.93, c.z)
    this.group.add(water)
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 2.8, 12), new THREE.MeshStandardMaterial({ color: 0xc9bb9e, roughness: 0.7 }))
    column.position.set(c.x, 2.1, c.z)
    column.castShadow = true
    this.group.add(column)
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 1.2, 0.45, 20), new THREE.MeshStandardMaterial({ color: 0xc9bb9e, roughness: 0.7 }))
    bowl.position.set(c.x, 3.5, c.z)
    bowl.castShadow = true
    this.group.add(bowl)
    this.fountain = water

    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU
      this._tree(c.x + Math.cos(a) * 20.5, c.z + Math.sin(a) * 20.5, rand(0.9, 1.35))
    }

    // Signature glowing sign at the plaza edge.
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 4.5),
      new THREE.MeshBasicMaterial({ map: neonTexture('SUNSET CITY', '#ff5a9e'), transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide })
    )
    sign.position.set(c.x, 7.4, c.z + 25)
    this.group.add(sign)
    this.plazaSign = sign
    const halo = glowSprite(0xff5a9e, 26, 0.22)
    halo.position.copy(sign.position)
    this.group.add(halo)
  }

  _makeCasino() {
    const c = this._blockCenter(2, -2)
    const gold = new THREE.MeshStandardMaterial({ color: 0xc79a4a, metalness: 0.65, roughness: 0.28 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b2230, metalness: 0.3, roughness: 0.5 })
    const tower = new THREE.Mesh(new THREE.BoxGeometry(34, 92, 26), gold)
    tower.position.set(c.x, 46.2, c.z)
    tower.castShadow = true
    tower.receiveShadow = true
    this.group.add(tower)
    this.buildings.push({ minX: c.x - 17, maxX: c.x + 17, minZ: c.z - 13, maxZ: c.z + 13, height: 92, x: c.x, z: c.z, w: 34, d: 26, h: 92 })
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(8, 14, 16, 6), dark)
    crown.position.set(c.x, 99, c.z)
    crown.castShadow = true
    this.group.add(crown)
    const spire = new THREE.Mesh(new THREE.ConeGeometry(2.2, 20, 6), gold)
    spire.position.set(c.x, 116, c.z)
    this.group.add(spire)

    const podium = new THREE.Mesh(new THREE.BoxGeometry(44, 10, 34), dark)
    podium.position.set(c.x, 5.2, c.z)
    podium.castShadow = true
    this.group.add(podium)
    this.buildings.push({ minX: c.x - 22, maxX: c.x + 22, minZ: c.z - 17, maxZ: c.z + 17, height: 10, x: c.x, z: c.z, w: 44, d: 34, h: 10 })

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 7.5),
      new THREE.MeshBasicMaterial({ map: neonTexture('CASINO', '#ffc24b'), transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide })
    )
    sign.position.set(c.x, 75, c.z + 13.2)
    this.group.add(sign)
    const halo = glowSprite(0xffc24b, 42, 0.3)
    halo.position.copy(sign.position)
    this.group.add(halo)
    this.casinoPos = { x: c.x, z: c.z + 22 }

    for (let k = 0; k < 5; k++) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(34.2, 0.5, 26.2),
        new THREE.MeshBasicMaterial({ color: 0xffcf7a, toneMapped: false })
      )
      strip.position.set(c.x, 18 + k * 12, c.z)
      strip.material.transparent = true
      strip.material.opacity = 0.45
      this.group.add(strip)
    }
  }

  _tree(x, z, scale = 1) {
    const g = new THREE.Group()
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22 * scale, 0.32 * scale, 3.4 * scale, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 })
    )
    trunk.position.y = 1.7 * scale
    trunk.castShadow = true
    g.add(trunk)
    const leafMat = new THREE.MeshStandardMaterial({ color: pick([0x396a35, 0x487a3c, 0x2f5c33]), roughness: 1, flatShading: true })
    for (let i = 0; i < 3; i++) {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(1.6, 2.2) * scale, 0), leafMat)
      leaf.position.set(rand(-0.8, 0.8) * scale, (3.7 + i * 0.9) * scale, rand(-0.8, 0.8) * scale)
      leaf.castShadow = true
      g.add(leaf)
    }
    g.position.set(x, 0.2, z)
    g.rotation.y = rand(0, TAU)
    this.group.add(g)
  }

  _palm(x, z, scale = 1) {
    const g = new THREE.Group()
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6d5136, roughness: 1 })
    const segs = 5
    let py = 0
    const lean = rand(-0.14, 0.14)
    for (let i = 0; i < segs; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * scale, 0.26 * scale, 1.7 * scale, 6), trunkMat)
      seg.position.set(lean * i * 1.1, py + 0.85 * scale, 0)
      seg.rotation.z = lean * i * 0.16
      seg.castShadow = true
      g.add(seg)
      py += 1.55 * scale
    }
    const leafMat = new THREE.MeshStandardMaterial({ color: pick([0x2f6b3e, 0x3d7d46, 0x27603a]), roughness: 1, side: THREE.DoubleSide })
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + rand(-0.2, 0.2)
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.55 * scale, 0.08, 4.4 * scale), leafMat)
      leaf.position.set(lean * 4 * 1.1 + Math.cos(a) * 1.7 * scale, py + 0.15, Math.sin(a) * 1.7 * scale)
      leaf.rotation.y = -a + Math.PI / 2
      leaf.rotation.x = 0.42
      leaf.castShadow = true
      g.add(leaf)
    }
    g.position.set(x, 0.15, z)
    g.rotation.y = rand(0, TAU)
    this.group.add(g)
  }

  _bench(x, z) {
    const g = new THREE.Group()
    const wood = new THREE.MeshStandardMaterial({ color: 0x6c4c2f, roughness: 0.9 })
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.65), wood)
    seat.position.y = 0.55
    g.add(seat)
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 0.12), wood)
    back.position.set(0, 0.9, -0.3)
    g.add(back)
    for (const sx of [-0.9, 0.9]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.55), new THREE.MeshStandardMaterial({ color: 0x333336, roughness: 0.6 }))
      leg.position.set(sx, 0.27, 0)
      g.add(leg)
    }
    g.position.set(x, 0.2, z)
    g.rotation.y = rand(0, TAU)
    this.group.add(g)
  }

  _makeStreetFurniture() {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3c3f46, roughness: 0.55, metalness: 0.6 })
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff0cc, emissive: 0xffc46a, emissiveIntensity: 0, toneMapped: false })
    this.lampMat = lampMat
    const positions = []
    for (let line = -5; line <= 5; line++) {
      for (let s = -5; s < 5; s++) {
        if ((line + s) % 2 !== 0) continue
        const mid = GRID * s + GRID / 2
        const x = GRID * line
        positions.push({ x: x + 11.5, z: mid + 16 })
        positions.push({ x: x - 11.5, z: mid - 16 })
        positions.push({ x: mid + 16, z: x + 11.5 })
        positions.push({ x: mid - 16, z: x - 11.5 })
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.11, 0.16, 6.4, 6)
    const armGeo = new THREE.BoxGeometry(1.8, 0.12, 0.12)
    const lampGeo = new THREE.BoxGeometry(0.8, 0.22, 0.34)
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, positions.length)
    const arms = new THREE.InstancedMesh(armGeo, poleMat, positions.length)
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, positions.length)
    poles.castShadow = true
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3(1, 1, 1)
    const v = new THREE.Vector3()
    positions.forEach((p, i) => {
      v.set(p.x, 3.3, p.z)
      m.compose(v, q, s)
      poles.setMatrixAt(i, m)
      const towardX = Math.abs(p.x % GRID) < 20
      const dir = p.x < GRID * 0 ? 1 : -1
      v.set(p.x + (towardX ? 0 : dir * 0.8), 6.3, p.z + (towardX ? dir * 0.8 : 0))
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, towardX ? 0 : Math.PI / 2, 0))
      m.compose(v, rot, s)
      arms.setMatrixAt(i, m)
      v.set(p.x + (towardX ? 0 : dir * 1.55), 6.2, p.z + (towardX ? dir * 1.55 : 0))
      m.compose(v, rot, s)
      lamps.setMatrixAt(i, m)
      this.streetlights.push({ x: v.x, z: v.z })
    })
    this.group.add(poles, arms, lamps)

    // Traffic lights on some corners.
    const tlPole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.12, 4.2, 6), poleMat, 40)
    const tlBox = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 1.1, 0.32), new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.8 }), 40)
    const tlLight = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.2, 0.1), new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff2222, emissiveIntensity: 1.6, toneMapped: false }), 40)
    let ti = 0
    for (let i = -5; i <= 5 && ti < 40; i++) {
      for (let j = -5; j <= 5 && ti < 40; j++) {
        if ((i * 3 + j * 5) % 4 !== 0) continue
        const x = GRID * i + 10
        const z = GRID * j + 10
        v.set(x, 2.1, z)
        m.compose(v, q, s)
        tlPole.setMatrixAt(ti, m)
        v.set(x, 4.4, z)
        m.compose(v, q, s)
        tlBox.setMatrixAt(ti, m)
        v.set(x, 4.65, z + 0.18)
        m.compose(v, q, s)
        tlLight.setMatrixAt(ti, m)
        ti++
      }
    }
    tlPole.count = tlBox.count = tlLight.count = ti
    this.group.add(tlPole, tlBox, tlLight)

    // Warm storefront windows at street level.
    const shopTextures = [0, 1, 2, 3].map((k) => shopTexture(k))
    const shopMats = shopTextures.map((t) => new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, side: THREE.DoubleSide }))
    const shopCandidates = this.buildings.filter((b) => b.h > 8 && b.h < 70)
    for (let i = 0; i < 46; i++) {
      if (!shopCandidates.length) break
      const b = shopCandidates[randInt(0, shopCandidates.length - 1)]
      const bc = { x: Math.floor(b.x / GRID) * GRID + GRID / 2, z: Math.floor(b.z / GRID) * GRID + GRID / 2 }
      const faces = [
        { d: Math.abs(b.maxX - bc.x), pos: [b.maxX + 0.14, 1.65, b.z], rot: Math.PI / 2, w: b.d },
        { d: Math.abs(b.minX - bc.x), pos: [b.minX - 0.14, 1.65, b.z], rot: -Math.PI / 2, w: b.d },
        { d: Math.abs(b.maxZ - bc.z), pos: [b.x, 1.65, b.maxZ + 0.14], rot: 0, w: b.w },
        { d: Math.abs(b.minZ - bc.z), pos: [b.x, 1.65, b.minZ - 0.14], rot: Math.PI, w: b.w }
      ]
      faces.sort((a, c) => c.d - a.d)
      const face = faces[0]
      const width = Math.min(8.5, Math.max(4.5, face.w * 0.45))
      const mat = pick(shopMats)
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, 3.0), mat)
      plane.position.set(face.pos[0], 1.65, face.pos[2])
      plane.rotation.y = face.rot
      this.group.add(plane)
      const halo = glowSprite(0xffb36a, width * 0.9, 0.1)
      halo.position.set(face.pos[0], 1.4, face.pos[2])
      halo.position.x += Math.sin(face.rot) * 0.3
      halo.position.z += Math.cos(face.rot) * 0.3
      this.group.add(halo)
    }

    // Neon shop signs attached to building edges.
    const signs = [
      ['HOTEL', '#ff3f8e'], ['24/7', '#58f2ff'], ['LIQUOR', '#ffd34d'],
      ['TATTOO', '#ff5b4d'], ['NOODLES', '#7dff6a'], ['PAWN', '#ffa53f'],
      ['MOTEL', '#ff4fd8'], ['DINER', '#57b8ff'], ['BAR', '#ff7b3d'], ['GUNS', '#ff3030']
    ]
    const shuffled = [...signs].sort(() => Math.random() - 0.5)
    const candidates = this.buildings.filter((b) => b.h > 8 && b.h < 100)
    for (let i = 0; i < Math.min(9, candidates.length); i++) {
      const b = pick(candidates)
      const [text, color] = shuffled[i % shuffled.length]
      const w = clamp(text.length * 2.1, 6, 12)
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(w, w * 0.25),
        new THREE.MeshBasicMaterial({ map: neonTexture(text, color), transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide })
      )
      const face = randInt(0, 3)
      const y = rand(3.2, Math.min(9, b.h - 2))
      if (face === 0) { sign.position.set(b.maxX + 0.12, y, b.z); sign.rotation.y = Math.PI / 2 }
      if (face === 1) { sign.position.set(b.minX - 0.12, y, b.z); sign.rotation.y = -Math.PI / 2 }
      if (face === 2) { sign.position.set(b.x, y, b.maxZ + 0.12); sign.rotation.y = 0 }
      if (face === 3) { sign.position.set(b.x, y, b.minZ - 0.12); sign.rotation.y = Math.PI }
      this.group.add(sign)
      const halo = glowSprite(new THREE.Color(color).getHex(), w * 1.1, 0.2)
      halo.position.copy(sign.position)
      halo.position.y += 0.2
      this.group.add(halo)
    }
  }

  _makeBeach() {
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(1200, 120),
      new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 1, color: 0xffe2b8 })
    )
    sand.rotation.x = -Math.PI / 2
    sand.position.set(0, 0.05, 410)
    sand.receiveShadow = true
    this.group.add(sand)

    // Boardwalk edge
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1100, 0.32, 8),
      new THREE.MeshStandardMaterial({ color: 0x6b4d33, roughness: 0.9 })
    )
    board.position.set(0, 0.18, 344)
    board.receiveShadow = true
    this.group.add(board)

    for (let i = 0; i < 26; i++) {
      const x = -390 + i * 31 + rand(-4, 4)
      this._palm(x, rand(356, 392), rand(0.85, 1.25))
    }
    for (let i = 0; i < 10; i++) {
      this._palm(rand(-330, 330), rand(395, 428), rand(0.7, 1.05))
    }

    // Lifeguard towers
    for (const x of [-240, 120, 300]) {
      const g = new THREE.Group()
      const wood = new THREE.MeshStandardMaterial({ color: 0xe8dfcb, roughness: 0.8 })
      const cab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 3), wood)
      cab.position.y = 4.4
      cab.castShadow = true
      g.add(cab)
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.4, 4), new THREE.MeshStandardMaterial({ color: 0xd6544a, roughness: 0.8 }))
      roof.position.y = 6.4
      roof.rotation.y = Math.PI / 4
      g.add(roof)
      for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.2, 0.22), wood)
        leg.position.set(dx, 1.6, dz)
        g.add(leg)
      }
      g.position.set(x, 0.15, 392)
      g.rotation.y = Math.PI
      this.group.add(g)
    }

    this._makeOcean()
    this._makePier()
  }

  _makeOcean() {
    const geo = new THREE.PlaneGeometry(2400, 1200, 1, 1)
    geo.rotateX(-Math.PI / 2)
    this.waterUniforms = {
      time: { value: 0 },
      sunDir: { value: new THREE.Vector3(0, 0.2, 0.3) },
      sunColor: { value: new THREE.Color(0xffd0a0) },
      skyColor: { value: new THREE.Color(0xff9a6a) },
      deep: { value: new THREE.Color(0x0b2a3a) },
      shallow: { value: new THREE.Color(0x1d6673) }
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: this.waterUniforms,
      vertexShader: /* glsl */`
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        uniform float time;
        uniform vec3 sunDir;
        uniform vec3 sunColor;
        uniform vec3 skyColor;
        uniform vec3 deep;
        uniform vec3 shallow;
        varying vec3 vWorld;
        void main() {
          vec3 p = vWorld;
          float w1 = sin(p.x * 0.12 + time * 0.9) + sin(p.z * 0.19 - time * 1.25);
          float w2 = sin((p.x + p.z) * 0.045 - time * 0.55);
          vec3 n = normalize(vec3(w1 * 0.055 + w2 * 0.035, 1.0, w2 * 0.06 - w1 * 0.03));
          vec3 viewDir = normalize(cameraPosition - p);
          float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
          vec3 col = mix(deep, shallow, 0.35 + 0.3 * w2);
          col = mix(col, skyColor, clamp(fres * 0.9, 0.0, 0.72));
          vec3 halfV = normalize(normalize(sunDir) + viewDir);
          float spec = pow(max(dot(n, halfV), 0.0), 280.0);
          col += sunColor * spec * 3.0;
          float sparkle = smoothstep(0.93, 1.0, sin(p.x * 1.8 + p.z * 0.4 + time * 0.7) * sin(p.z * 1.2 - time * 0.4));
          col += sunColor * sparkle * 0.12;
          float horizon = smoothstep(180.0, 600.0, distance(p.xz, cameraPosition.xz));
          col = mix(col, skyColor * 0.85, horizon * 0.55);
          gl_FragColor = vec4(col, 1.0);
        }`
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(0, -0.4, 1000)
    this.group.add(mesh)
    this.ocean = mesh
  }

  _makePier() {
    const g = new THREE.Group()
    const wood = new THREE.MeshStandardMaterial({ color: 0x5b432e, roughness: 0.95 })
    const plankGeo = new THREE.BoxGeometry(16, 0.22, 1.4)
    const planks = new THREE.InstancedMesh(plankGeo, wood, 130)
    const m = new THREE.Matrix4()
    for (let i = 0; i < 130; i++) {
      m.makeTranslation(0, 0.1, i * 1.55)
      planks.setMatrixAt(i, m)
    }
    planks.instanceMatrix.needsUpdate = true
    g.add(planks)
    for (let i = 0; i < 14; i++) {
      for (const dx of [-7.4, 7.4]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 5, 6), wood)
        post.position.set(dx, -2, i * 14 + 4)
        g.add(post)
      }
    }
    for (let i = 0; i < 8; i++) {
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.4, 0.4),
        new THREE.MeshStandardMaterial({ color: 0xffe8b0, emissive: 0xffb84d, emissiveIntensity: 1.4, toneMapped: false })
      )
      lamp.position.set(7, 4.2, 8 + i * 22)
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.2, 5), new THREE.MeshStandardMaterial({ color: 0x33363b, metalness: 0.5, roughness: 0.6 }))
      pole.position.set(7, 2.1, 8 + i * 22)
      g.add(lamp, pole)
    }

    // Ferris wheel landmark.
    const wheel = new THREE.Group()
    wheel.position.set(0, 22, 180)
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(16, 0.35, 6, 40),
      new THREE.MeshStandardMaterial({ color: 0xd8dbe2, metalness: 0.6, roughness: 0.35 })
    )
    wheel.add(rim)
    const rim2 = rim.clone()
    rim2.position.z = 2.2
    wheel.add(rim2)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU
      const spoke = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 32, 4),
        new THREE.MeshStandardMaterial({ color: 0xaeb4c0, metalness: 0.5, roughness: 0.4 })
      )
      spoke.rotation.z = a
      spoke.position.set(0, 0, 1.1)
      wheel.add(spoke)
      const cab = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 2.2, 2.4),
        new THREE.MeshStandardMaterial({ color: [0xff5f6d, 0xffc14d, 0x5ad1ff, 0xff7ae0][i % 4], roughness: 0.5 })
      )
      cab.position.set(Math.cos(a) * 16, Math.sin(a) * 16, 0)
      wheel.add(cab)
    }
    wheel.children.forEach((c) => { if (c.isMesh) c.castShadow = true })
    g.add(wheel)
    this.ferris = wheel
    const supportMat = new THREE.MeshStandardMaterial({ color: 0x8c93a0, metalness: 0.6, roughness: 0.4 })
    for (const dz of [-1.6, 3.8]) {
      for (const dx of [-9, 9]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 30, 6), supportMat)
        leg.position.set(dx * 0.9, 8, dz)
        leg.rotation.z = dx > 0 ? 0.28 : -0.28
        g.add(leg)
      }
    }
    g.position.set(-160, 0.15, 330)
    this.group.add(g)
    this.pier = g
    this.pierDrop = { x: -160, z: 500 }

    // End-of-pier arcade building
    const arcade = new THREE.Mesh(new THREE.BoxGeometry(18, 6, 12), new THREE.MeshStandardMaterial({ color: 0x502d4e, roughness: 0.7 }))
    arcade.position.set(-160, 3.2, 520)
    arcade.castShadow = true
    this.group.add(arcade)
    const arcadeSign = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 3.4),
      new THREE.MeshBasicMaterial({ map: neonTexture('ARCADE', '#62f5ff'), transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide })
    )
    arcadeSign.position.set(-160, 7.6, 520)
    this.group.add(arcadeSign)
    this.buildings.push({ minX: -169, maxX: -151, minZ: 514, maxZ: 526, height: 6.5, x: -160, z: 520, w: 18, d: 12, h: 6 })
  }

  _makeDistant() {
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x4a4a63, roughness: 1, flatShading: true })
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU
      if (Math.sin(a) > 0.35) continue // leave the ocean side open
      const r = rand(560, 780)
      const h = rand(60, 170)
      const hill = new THREE.Mesh(new THREE.ConeGeometry(rand(140, 260), h, 5), hillMat)
      hill.position.set(Math.cos(a) * r, h / 2 - 20, Math.sin(a) * r)
      hill.rotation.y = rand(0, TAU)
      this.group.add(hill)
    }
    // Distant skyline silhouettes.
    const silMat = new THREE.MeshBasicMaterial({ color: 0x3b3a58, fog: true })
    for (let i = 0; i < 30; i++) {
      const a = rand(-Math.PI * 0.9, Math.PI * 0.1)
      const r = rand(470, 640)
      const h = rand(30, 120)
      const b = new THREE.Mesh(new THREE.BoxGeometry(rand(16, 45), h, rand(16, 45)), silMat)
      b.position.set(Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r)
      this.group.add(b)
    }
  }

  _makeCityLights() {
    // A few warm taxi/street glows for atmosphere.
    this.cityGlows = []
    for (let i = 0; i < 10; i++) {
      const s = glowSprite(0xffb066, rand(12, 24), 0.0)
      s.position.set(rand(-300, 300), rand(1, 5), rand(-300, 300))
      this.group.add(s)
      this.cityGlows.push(s)
    }
  }

  updateLighting(dt, camera, playerPos) {
    this._t += dt
    this.timeOfDay = (this.timeOfDay + dt * 24 / this.dayLength) % 24
    const hour = this.timeOfDay
    const az = ((hour - 6) / 24) * TAU
    const ele = Math.sin(az)
    const dir = new THREE.Vector3(Math.cos(az), ele * 0.95, Math.sin(az) * 0.32 + 0.18).normalize()
    this.sunDir = dir

    const day = clamp(ele * 3.2, 0, 1)
    const dusk = clamp(1 - Math.abs(ele - 0.06) * 2.4, 0, 1)
    const night = clamp(1 - ele * 4.2, 0, 1)
    this.nightFactor = night

    const dayTop = new THREE.Color(0x3c72b8)
    const duskTop = new THREE.Color(0x3b3478)
    const nightTop = new THREE.Color(0x050a1c)
    const dayHor = new THREE.Color(0xbcd4e6)
    const duskHor = new THREE.Color(0xff8e58)
    const nightHor = new THREE.Color(0x141a33)
    const top = nightTop.clone().lerp(duskTop, clamp(night * 0.85 + day * 0.1, 0, 1)).lerp(dayTop, day * 0.9)
    const hor = nightHor.clone().lerp(duskHor, dusk * 0.9 + day * 0.1).lerp(dayHor, day * 0.8)
    // Keep the sunset saturated during the golden hour.
    if (dusk > 0.4) hor.lerp(new THREE.Color(0xff9c5e), 0.25)
    this.skyUniforms.topColor.value.copy(top)
    this.skyUniforms.horizonColor.value.copy(hor)
    this.skyUniforms.sunDir.value.copy(dir)
    this.skyUniforms.sunColor.value.setHSL(0.075 + day * 0.03, 0.9, 0.68)
    this.waterUniforms.sunDir.value.copy(dir)
    this.waterUniforms.sunColor.value.copy(this.skyUniforms.sunColor.value)
    this.waterUniforms.skyColor.value.copy(hor)
    this.waterUniforms.time.value = this._t
    if (this.scene.fog) this.scene.fog.color.copy(hor).multiplyScalar(0.88)

    this.sun.position.copy(playerPos).addScaledVector(dir, 180)
    this.sun.target.position.copy(playerPos)
    this.sun.intensity = clamp((ele + 0.06) * 5.0, 0, 3.0)
    this.sun.color.copy(this.skyUniforms.sunColor.value)
    this.moon.position.copy(playerPos).add(new THREE.Vector3(-80, 160, -60))
    this.moon.intensity = night * 0.25
    this.hemi.intensity = 0.72 + day * 0.85
    this.hemi.color.copy(top).lerp(new THREE.Color(0xffffff), 0.55)
    this.hemi.groundColor.set(0x453d35)

    this.sunSprite.position.copy(playerPos).addScaledVector(dir, 700)
    this.sunSprite.material.opacity = clamp(ele * 6, 0, 0.95)
    this.sunSprite.material.color.copy(this.skyUniforms.sunColor.value)
    this.sunSprite.scale.setScalar(170 + dusk * 60)

    this.sky.position.copy(camera.position)
    this.stars.position.copy(camera.position)
    this.starMat.opacity = night * 0.9
    for (const c of this.clouds) {
      c.position.x += dt * 0.5
      if (c.position.x > 700) c.position.x = -700
      c.material.color.copy(hor).lerp(new THREE.Color(0xffffff), 0.5)
      c.material.opacity = 0.05 + day * 0.1 + dusk * 0.09
    }

    const windowGlow = night * 1.0
    for (const mat of this.buildingMaterials) mat.emissiveIntensity = windowGlow
    this.lampMat.emissiveIntensity = night * 2.2
    for (const g of this.cityGlows) g.material.opacity = night * 0.2
    for (const s of this.clouds) s.visible = true

    this._lightTimer -= dt
    if (this._lightTimer <= 0) {
      this._lightTimer = 0.35
      const near = this.streetlights
        .map((p) => ({ p, d: (p.x - playerPos.x) ** 2 + (p.z - playerPos.z) ** 2 }))
        .sort((a, b) => a.d - b.d)
        .slice(0, this.lightPool.length)
      this.lightPool.forEach((light, i) => {
        const n = near[i]
        if (!n) { light.intensity = 0; return }
        light.position.set(n.p.x, 6.1, n.p.z)
        light.intensity = night * 26
        light.distance = 26
      })
    }
    return { day, dusk, night }
  }

  // -------- collision helpers --------
  resolveCircle(pos, radius) {
    for (const b of this.buildings) {
      if (b.height < 0.8) continue
      const cx = clamp(pos.x, b.minX, b.maxX)
      const cz = clamp(pos.z, b.minZ, b.maxZ)
      const dx = pos.x - cx
      const dz = pos.z - cz
      const d2 = dx * dx + dz * dz
      if (d2 >= radius * radius) continue
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2)
        const push = (radius - d) / d
        pos.x += dx * push
        pos.z += dz * push
      } else {
        // Center inside: push out the nearest face.
        const dl = pos.x - b.minX
        const dr = b.maxX - pos.x
        const dt = pos.z - b.minZ
        const db = b.maxZ - pos.z
        const m = Math.min(dl, dr, dt, db)
        if (m === dl) pos.x = b.minX - radius
        else if (m === dr) pos.x = b.maxX + radius
        else if (m === dt) pos.z = b.minZ - radius
        else pos.z = b.maxZ + radius
      }
    }
    pos.x = clamp(pos.x, -CITY_EDGE - 20, CITY_EDGE + 20)
    pos.z = clamp(pos.z, -CITY_EDGE - 20, 600)
  }

  circleBlocked(x, z, radius) {
    for (const b of this.buildings) {
      if (b.height < 0.8) continue
      const cx = clamp(x, b.minX, b.maxX)
      const cz = clamp(z, b.minZ, b.maxZ)
      if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) return true
    }
    return false
  }

  lineBlocked(ax, az, bx, bz) {
    const dx = bx - ax
    const dz = bz - az
    const len = Math.hypot(dx, dz)
    if (len < 0.01) return false
    for (const b of this.buildings) {
      if (b.height < 2.2) continue
      if (Math.max(ax, bx) < b.minX || Math.min(ax, bx) > b.maxX) continue
      if (Math.max(az, bz) < b.minZ || Math.min(az, bz) > b.maxZ) continue
      // Segment vs inflated AABB using slabs.
      let t0 = 0
      let t1 = 1
      const pad = 0.2
      const minX = b.minX - pad
      const maxX = b.maxX + pad
      const minZ = b.minZ - pad
      const maxZ = b.maxZ + pad
      let ok = true
      for (const [p, d, mn, mx] of [[ax, dx, minX, maxX], [az, dz, minZ, maxZ]]) {
        if (Math.abs(d) < 1e-6) {
          if (p < mn || p > mx) { ok = false; break }
        } else {
          let ta = (mn - p) / d
          let tb = (mx - p) / d
          if (ta > tb) [ta, tb] = [tb, ta]
          t0 = Math.max(t0, ta)
          t1 = Math.min(t1, tb)
          if (t0 > t1) { ok = false; break }
        }
      }
      if (ok) return true
    }
    return false
  }

  collideCamera(pivot, desired) {
    const dir = desired.clone().sub(pivot)
    const dist = dir.length()
    if (dist < 0.01) return desired
    dir.normalize()
    let closest = dist
    for (const b of this.buildings) {
      if (b.height < pivot.y) continue
      // ray vs AABB expanded
      let t0 = 0
      let t1 = closest
      let ok = true
      const pad = 0.35
      for (const [p, d, mn, mx] of [[pivot.x, dir.x, b.minX - pad, b.maxX + pad], [pivot.y, dir.y, 0, b.height + pad], [pivot.z, dir.z, b.minZ - pad, b.maxZ + pad]]) {
        if (Math.abs(d) < 1e-6) {
          if (p < mn || p > mx) { ok = false; break }
        } else {
          let ta = (mn - p) / d
          let tb = (mx - p) / d
          if (ta > tb) [ta, tb] = [tb, ta]
          t0 = Math.max(t0, ta)
          t1 = Math.min(t1, tb)
          if (t0 > t1) { ok = false; break }
        }
      }
      if (ok && t0 > 0.2 && t0 < closest) closest = t0
    }
    return pivot.clone().addScaledVector(dir, Math.max(0.5, closest - 0.35))
  }

  randomRoadPoint(minDist, from, avoidOcean = true) {
    for (let i = 0; i < 60; i++) {
      const line = randInt(-5, 5)
      const other = randInt(-5, 5)
      const x = GRID * line + pick([-1, 1]) * rand(2, 7)
      const z = GRID * other + pick([-1, 1]) * rand(2, 7)
      if (avoidOcean && z > 345) continue
      if (minDist && Math.hypot(x - from.x, z - from.z) < minDist) continue
      return { x, z }
    }
    return { x: GRID * randInt(-4, 4), z: GRID * randInt(-4, 4) }
  }

  getTimeString() {
    const h = Math.floor(this.timeOfDay)
    const m = Math.floor((this.timeOfDay - h) * 60)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
}
