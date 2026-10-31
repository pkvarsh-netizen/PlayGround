import * as THREE from 'three'

// ---------------------------------------------------------------------------
// SUNSET CITY — procedural open-world district
// A 7x7 block grid of downtown streets, sidewalks, parks, traffic loops and
// a sun-baked skyline. Everything is generated from code at load time.
// ---------------------------------------------------------------------------

export const CITY = {
  N: 7,
  BLOCK: 40,
  ROAD: 16,
  PITCH: 56,
  HALF: 196
}

CITY.CENTERS = Array.from({ length: CITY.N }, (_, i) => (i - (CITY.N - 1) / 2) * CITY.PITCH)
CITY.ROADS = CITY.CENTERS.map((c) => c + CITY.PITCH / 2).slice(0, -1) // -140..140
CITY.ROADS = [-196, ...CITY.ROADS, 196]

const C = (hex) => new THREE.Color(hex)
const rand = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[(Math.random() * arr.length) | 0]
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

function canvasTexture(w, h, draw, { repeat = [1, 1], srgb = true } = {}) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  draw(ctx, w, h)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat[0], repeat[1])
  t.anisotropy = 4
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

function speckle(ctx, w, h, count, colors, size = 1) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0]
    ctx.globalAlpha = Math.random() * 0.5 + 0.1
    const s = Math.random() * size + 0.4
    ctx.fillRect(Math.random() * w, Math.random() * h, s, s)
  }
  ctx.globalAlpha = 1
}

function makeAsphalt() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#383840'
    ctx.fillRect(0, 0, w, h)
    speckle(ctx, w, h, 1400, ['#47474e', '#2f2f35', '#52525a', '#232328'], 2)
    ctx.strokeStyle = 'rgba(20,20,22,.55)'
    ctx.lineWidth = 1
    for (let i = 0; i < 5; i++) {
      ctx.beginPath()
      let x = Math.random() * w
      ctx.moveTo(x, 0)
      for (let y = 0; y <= h; y += 16) ctx.lineTo(x += rand(-5, 5), y)
      ctx.stroke()
    }
  }, { repeat: [26, 26] })
}

function makeSidewalk() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b3aa9b'
    ctx.fillRect(0, 0, w, h)
    speckle(ctx, w, h, 700, ['#c2b9aa', '#a49a8c', '#ccc3b2'], 2)
    ctx.strokeStyle = 'rgba(70,62,54,.32)'
    ctx.lineWidth = 2
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(w, i * 64); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, h); ctx.stroke()
    }
  }, { repeat: [1, 1] })
}

function makeGrass() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#3f5b32'
    ctx.fillRect(0, 0, w, h)
    speckle(ctx, w, h, 500, ['#4c6c3b', '#35502c', '#5b7c45'], 2)
  }, { repeat: [4, 4] })
}

function makeFacade() {
  const W = 256
  const H = 512
  const lit = []
  const map = canvasTexture(W, H, (ctx, w, h) => {
    ctx.fillStyle = '#ded5c6'
    ctx.fillRect(0, 0, w, h)
    speckle(ctx, w, h, 500, ['#d4cabb', '#e8dfd0', '#c7bdae'], 2)
    const cols = 6
    const rows = 14
    const cw = w / cols
    const ch = h / rows
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw + cw * 0.16
        const y = r * ch + ch * 0.18
        const ww = cw * 0.68
        const wh = ch * 0.58
        const isLit = Math.random() < 0.24
        if (isLit) lit.push([x, y, ww, wh])
        const g = ctx.createLinearGradient(x, y, x, y + wh)
        if (isLit) {
          g.addColorStop(0, '#ffe1a6')
          g.addColorStop(1, '#d99e58')
        } else {
          g.addColorStop(0, '#33485a')
          g.addColorStop(0.55, '#22313f')
          g.addColorStop(1, '#3d5266')
        }
        ctx.fillStyle = g
        ctx.fillRect(x, y, ww, wh)
        ctx.fillStyle = 'rgba(255,255,255,.16)'
        ctx.fillRect(x, y, ww, wh * 0.18)
        ctx.strokeStyle = 'rgba(35,30,26,.38)'
        ctx.lineWidth = 2
        ctx.strokeRect(x, y, ww, wh)
        // sill
        ctx.fillStyle = 'rgba(90,78,64,.35)'
        ctx.fillRect(x - 2, y + wh, ww + 4, 3)
      }
      ctx.fillStyle = 'rgba(80,70,58,.20)'
      ctx.fillRect(0, r * ch, w, 2)
    }
  })
  const emissive = canvasTexture(W, H, (ctx, w, h) => {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
    for (const [x, y, ww, wh] of lit) {
      const g = ctx.createLinearGradient(x, y, x, y + wh)
      g.addColorStop(0, '#ffdda6')
      g.addColorStop(1, '#b06c31')
      ctx.fillStyle = g
      ctx.fillRect(x, y, ww, wh)
    }
  })
  return { map, emissive }
}

function makeSign(text, color = '#ff5f7a', accent = '#fff2c8') {
  return canvasTexture(256, 1024, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(12,10,18,.92)'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = color
    ctx.lineWidth = 10
    ctx.strokeRect(10, 10, w - 20, h - 20)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const letters = text.split('')
    const step = (h - 100) / letters.length
    ctx.font = '900 74px Impact, "Arial Black", sans-serif'
    letters.forEach((ch, i) => {
      ctx.fillStyle = i % 2 ? accent : color
      ctx.shadowColor = color
      ctx.shadowBlur = 22
      ctx.fillText(ch, w / 2, 62 + step * (i + 0.5))
    })
    ctx.shadowBlur = 0
  })
}

function makeBillboard() {
  return canvasTexture(1024, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, '#180d2c')
    g.addColorStop(0.5, '#3d123a')
    g.addColorStop(1, '#1a0c24')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#ffc46b'
    ctx.lineWidth = 8
    ctx.strokeRect(12, 12, w - 24, h - 24)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '600 126px "Bebas Neue", Impact, sans-serif'
    ctx.shadowColor = '#ff7b3d'
    ctx.shadowBlur = 36
    ctx.fillStyle = '#fff0c8'
    ctx.fillText('SUNSET CITY', w / 2, h / 2 + 8)
    ctx.shadowBlur = 0
    ctx.font = '700 30px Rajdhani, sans-serif'
    ctx.fillStyle = '#ff9f6e'
    ctx.fillText('LIVE  ·  WORK  ·  SURVIVE', w / 2, h - 54)
  })
}

function makeGlow() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    g.addColorStop(0, 'rgba(255,225,170,.9)')
    g.addColorStop(0.35, 'rgba(255,190,120,.35)')
    g.addColorStop(1, 'rgba(255,160,90,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }, { srgb: true })
}

function blobShadowTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2)
    g.addColorStop(0, 'rgba(0,0,0,.55)')
    g.addColorStop(0.6, 'rgba(0,0,0,.26)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
}

export function buildCity(scene) {
  scene.background = new THREE.Color(0x1a1330)
  scene.fog = new THREE.FogExp2(0x9c6a58, 0.0026)

  const colliders = []
  const blockCenters = []
  const buildings = []
  const intersections = []
  const missionSpots = []
  const parkSpots = []
  const parkingSpots = []

  // ---------------------------------------------------------------- sky ----
  const skyUniforms = {
    topColor: { value: new THREE.Color(0x242a63) },
    horizonColor: { value: new THREE.Color(0xff8f5a) },
    bottomColor: { value: new THREE.Color(0x5b3140) },
    sunColor: { value: new THREE.Color(0xfff0c2) },
    sunDir: { value: new THREE.Vector3(-0.45, 0.14, -0.88).normalize() },
    night: { value: 0 }
  }
  const skyGeo = new THREE.SphereGeometry(700, 32, 20)
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 topColor, horizonColor, bottomColor, sunColor, sunDir;
      uniform float night;
      varying vec3 vWorld;
      void main() {
        vec3 dir = normalize(vWorld);
        float h = dir.y;
        vec3 col = mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.62));
        col = mix(bottomColor, col, smoothstep(-0.12, 0.02, h));
        float sd = max(dot(dir, normalize(sunDir)), 0.0);
        col += sunColor * pow(sd, 360.0) * 2.2;
        col += sunColor * pow(sd, 12.0) * 0.16;
        col = mix(col, vec3(0.015, 0.02, 0.06), night * 0.72);
        gl_FragColor = vec4(col, 1.0);
      }`
  })
  scene.add(new THREE.Mesh(skyGeo, skyMat))

  const starGeo = new THREE.BufferGeometry()
  const starPos = []
  for (let i = 0; i < 460; i++) {
    const a = Math.random() * Math.PI * 2
    const y = Math.random() * 0.85 + 0.1
    const r = Math.sqrt(1 - y * y)
    starPos.push(Math.cos(a) * r * 640, y * 640, Math.sin(a) * r * 640)
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3))
  const starMat = new THREE.PointsMaterial({ color: 0xfff1d0, size: 2.1, transparent: true, opacity: 0, depthWrite: false, fog: false })
  const stars = new THREE.Points(starGeo, starMat)
  scene.add(stars)

  // ------------------------------------------------------------- lighting ---
  const hemi = new THREE.HemisphereLight(0x9aa8ff, 0x7a5238, 1.1)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xffc08a, 2.4)
  sun.position.set(-160, 90, -260)
  scene.add(sun)
  const rim = new THREE.DirectionalLight(0x6d7bff, 0.5)
  rim.position.set(120, 60, 180)
  scene.add(rim)
  // warm bounce from the street side keeps facades facing the player readable
  const fill = new THREE.DirectionalLight(0xffb894, 0.95)
  fill.position.set(90, 55, 240)
  scene.add(fill)
  const ambient = new THREE.AmbientLight(0x6d6070, 0.34)
  scene.add(ambient)

  // ---------------------------------------------------------------- roads ---
  const asphalt = makeAsphalt()
  const groundGeo = new THREE.PlaneGeometry(1100, 1100)
  const groundMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.94, metalness: 0.02 })
  const ground = new THREE.Mesh(groundGeo, groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = 0
  ground.receiveShadow = false
  scene.add(ground)

  // ------------------------------------------------------------ sidewalks ---
  const sidewalkTex = makeSidewalk()
  const sideMat = new THREE.MeshStandardMaterial({ map: sidewalkTex, roughness: 0.92 })
  const slabGeo = new THREE.BoxGeometry(CITY.BLOCK, 0.24, CITY.BLOCK)
  const slabs = new THREE.InstancedMesh(slabGeo, sideMat, CITY.N * CITY.N)
  const m4 = new THREE.Matrix4()
  let slabIdx = 0
  for (const x of CITY.CENTERS) {
    for (const z of CITY.CENTERS) {
      m4.makeTranslation(x, 0.12, z)
      slabs.setMatrixAt(slabIdx++, m4)
    }
  }
  slabs.instanceMatrix.needsUpdate = true
  scene.add(slabs)

  const grassTex = makeGrass()
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.98 })
  const grassGeo = new THREE.PlaneGeometry(34, 34)
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, 10)

  // ------------------------------------------------------------- buildings --
  const { map: facadeMap, emissive: facadeEmissive } = makeFacade()
  const buildingMat = new THREE.MeshStandardMaterial({
    map: facadeMap,
    emissiveMap: facadeEmissive,
    emissive: new THREE.Color(0xffb066),
    emissiveIntensity: 0,
    roughness: 0.82,
    metalness: 0.06
  })
  // Tile the facade with the height/width of each instance so windows keep a
  // believable scale instead of stretching across skyscrapers.
  buildingMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      #ifdef USE_INSTANCING
        float bH = max(1.0, length(instanceMatrix[1].xyz) / 26.0);
        float bW = max(1.0, max(length(instanceMatrix[0].xyz), length(instanceMatrix[2].xyz)) / 18.0);
        vMapUv *= vec2(bW, bH);
        vEmissiveMapUv *= vec2(bW, bH);
      #endif`
    )
  }
  buildingMat.customProgramCacheKey = () => 'sunset-facade'
  const palette = ['#d8c8ae', '#c7a98a', '#b48e76', '#d6d0c4', '#9e8f7d', '#c9b7a5', '#b9c1bd', '#d3bda6', '#a98e79', '#c2b2c4'].map(C)

  const boxes = []
  const parkList = []
  let grassIdx = 0

  for (const bx of CITY.CENTERS) {
    for (const bz of CITY.CENTERS) {
      blockCenters.push({ x: bx, z: bz })
      const dist = Math.hypot(bx, bz)
      const isCenter = bx === 0 && bz === 0
      const isPark = !isCenter && Math.random() < 0.13
      if (isPark) {
        parkList.push({ x: bx, z: bz })
        parkSpots.push({ x: bx + rand(-11, 11), y: 0.24, z: bz + rand(-11, 11) })
        if (grassIdx < 10) {
          m4.compose(
            new THREE.Vector3(bx, 0.252, bz),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
            new THREE.Vector3(1, 1, 1)
          )
          grass.setMatrixAt(grassIdx++, m4)
        }
        // a small pavilion / fountain-ish crate
        if (Math.random() < 0.6) {
          boxes.push({
            x: bx + rand(-5, 5), z: bz + rand(-5, 5), w: rand(2.5, 5), d: rand(2.5, 5),
            h: rand(1.2, 2.6), color: C('#8d8172'), collide: true, park: true
          })
        }
        continue
      }
      if (isCenter) {
        const h = 128
        boxes.push({ x: bx, z: bz, w: 30, d: 30, h, color: C('#d9c9ad'), collide: true, landmark: true })
        continue
      }
      const split = dist < 90 ? (Math.random() < 0.5 ? 1 : 2) : (Math.random() < 0.65 ? 2 : 4)
      const slots = []
      if (split === 1) slots.push([0, 0, 30, 30])
      else if (split === 2) {
        if (Math.random() < 0.5) {
          slots.push([-8.5, 0, 14, 31], [8.5, 0, 14, 31])
        } else {
          slots.push([0, -8.5, 31, 14], [0, 8.5, 31, 14])
        }
      } else {
        slots.push([-8.5, -8.5, 14, 14], [8.5, -8.5, 14, 14], [-8.5, 8.5, 14, 14], [8.5, 8.5, 14, 14])
      }
      for (const [ox, oz, sw, sd] of slots) {
        const w = sw - rand(0.5, 2)
        const d = sd - rand(0.5, 2)
        const tower = Math.exp(-Math.pow(dist / 105, 2))
        let h = 13 + tower * 68 + rand(-5, 14)
        if (Math.random() < 0.06) h += rand(20, 40)
        h = Math.max(9, h)
        boxes.push({
          x: bx + ox + rand(-1, 1), z: bz + oz + rand(-1, 1), w, d, h,
          color: pick(palette), collide: true
        })
      }
    }
  }
  if (grassIdx < 10) grass.count = grassIdx
  scene.add(grass)

  const buildingGeo = new THREE.BoxGeometry(1, 1, 1)
  const bmesh = new THREE.InstancedMesh(buildingGeo, buildingMat, boxes.length)
  const roofBoxes = []
  boxes.forEach((b, i) => {
    const base = 0.24
    m4.compose(
      new THREE.Vector3(b.x, base + b.h / 2, b.z),
      new THREE.Quaternion(),
      new THREE.Vector3(b.w, b.h, b.d)
    )
    bmesh.setMatrixAt(i, m4)
    bmesh.setColorAt(i, b.color)
    if (b.collide) {
      colliders.push({
        minX: b.x - b.w / 2, maxX: b.x + b.w / 2,
        minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2,
        maxY: base + b.h,
        landmark: !!b.landmark
      })
    }
    buildings.push(b)
    const top = base + b.h
    if (!b.park && b.h > 10 && b.w > 6 && Math.random() < 0.72) {
      roofBoxes.push({ x: b.x + rand(-b.w * 0.22, b.w * 0.22), z: b.z + rand(-b.d * 0.22, b.d * 0.22), w: rand(2, 5), h: rand(1, 4), d: rand(2, 5), top })
    }
    if (b.w > 12 && Math.random() < 0.25) {
      roofBoxes.push({ x: b.x, z: b.z, w: 1.1, h: rand(2.5, 4.5), d: 1.1, tank: true, top })
    }
  })
  bmesh.instanceMatrix.needsUpdate = true
  if (bmesh.instanceColor) bmesh.instanceColor.needsUpdate = true
  scene.add(bmesh)

  const roofMat = new THREE.MeshStandardMaterial({ color: 0x7a7064, roughness: 0.9 })
  const roofMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), roofMat, roofBoxes.length)
  roofBoxes.forEach((r, i) => {
    m4.compose(new THREE.Vector3(r.x, r.top + r.h / 2, r.z), new THREE.Quaternion(), new THREE.Vector3(r.w, r.h, r.d))
    roofMesh.setMatrixAt(i, m4)
  })
  roofMesh.instanceMatrix.needsUpdate = true
  scene.add(roofMesh)

  // --------------------------------------------------------------- signs ----
  const signMeshes = []
  const signNames = ['SUNSET', 'MOTEL', 'NEON', 'PLAYA', 'LIQUOR', 'TACOS']
  const tall = buildings.filter((b) => b.h > 24 && !b.park)
  for (let i = 0; i < 6 && tall.length; i++) {
    const b = tall.splice((Math.random() * tall.length) | 0, 1)[0]
    const signTex = makeSign(signNames[i % signNames.length], i % 2 ? '#5ef0ff' : '#ff5f8f')
    const mat = new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false, side: THREE.DoubleSide })
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 18.4), mat)
    m.position.set(b.x + b.w / 2 + 0.2, 0.24 + b.h * 0.62, b.z)
    m.rotation.y = Math.PI / 2
    scene.add(m)
    signMeshes.push(m)
  }

  // landmark billboard on the central tower
  const billboard = new THREE.Mesh(
    new THREE.PlaneGeometry(44, 11),
    new THREE.MeshBasicMaterial({ map: makeBillboard(), toneMapped: false })
  )
  billboard.position.set(0, 110, 15.2)
  billboard.rotation.y = 0
  scene.add(billboard)
  const billboard2 = billboard.clone()
  billboard2.position.set(15.2, 110, 0)
  billboard2.rotation.y = Math.PI / 2
  scene.add(billboard2)

  // ---------------------------------------------------------- street lamps --
  const lampSpots = []
  for (const bx of CITY.CENTERS) {
    for (const bz of CITY.CENTERS) {
      if (Math.random() < 0.45) continue
      const sx = Math.random() < 0.5 ? -1 : 1
      const sz = Math.random() < 0.5 ? -1 : 1
      lampSpots.push({ x: bx + sx * 18.2, z: bz + sz * 18.2, rot: Math.atan2(sx, sz) })
    }
  }
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2c31, roughness: 0.6, metalness: 0.7 })
  const poleMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.14, 5.4, 6), poleMat, lampSpots.length)
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x6b6252, toneMapped: false })
  const lampMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 8, 6), lampMat, lampSpots.length)
  const glowTex = makeGlow()
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
  const glowMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(10, 10), glowMat, lampSpots.length)
  lampSpots.forEach((p, i) => {
    m4.makeTranslation(p.x, 2.7, p.z)
    poleMesh.setMatrixAt(i, m4)
    m4.makeTranslation(p.x, 5.45, p.z)
    lampMesh.setMatrixAt(i, m4)
    m4.compose(new THREE.Vector3(p.x, 0.14, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), new THREE.Vector3(1, 1, 1))
    glowMesh.setMatrixAt(i, m4)
  })
  poleMesh.instanceMatrix.needsUpdate = true
  lampMesh.instanceMatrix.needsUpdate = true
  glowMesh.instanceMatrix.needsUpdate = true
  scene.add(poleMesh, lampMesh, glowMesh)

  // ---------------------------------------------------------------- trees ---
  const treeSpots = []
  for (const bx of CITY.CENTERS) {
    for (const bz of CITY.CENTERS) {
      const n = parkList.some((p) => p.x === bx && p.z === bz) ? 4 : (Math.random() < 0.5 ? 1 : 0)
      for (let i = 0; i < n; i++) {
        treeSpots.push({ x: bx + rand(-16, 16), z: bz + rand(-16, 16), s: rand(0.8, 1.5) })
      }
    }
  }
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3d2b, roughness: 0.95 })
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f7138, roughness: 0.9 })
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.24, 3.4, 5), trunkMat, treeSpots.length)
  const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.5, 0), leafMat, treeSpots.length * 2)
  treeSpots.forEach((t, i) => {
    m4.compose(new THREE.Vector3(t.x, 0.24 + 1.7 * t.s, t.z), new THREE.Quaternion(), new THREE.Vector3(t.s, t.s, t.s))
    trunks.setMatrixAt(i, m4)
    m4.compose(new THREE.Vector3(t.x, 0.24 + 4 * t.s, t.z), new THREE.Quaternion(), new THREE.Vector3(t.s * 1.1, t.s, t.s * 1.1))
    leaves.setMatrixAt(i * 2, m4)
    m4.compose(new THREE.Vector3(t.x + 0.7 * t.s, 0.24 + 3.3 * t.s, t.z + 0.4 * t.s), new THREE.Quaternion(), new THREE.Vector3(t.s * 0.75, t.s * 0.75, t.s * 0.75))
    leaves.setMatrixAt(i * 2 + 1, m4)
  })
  trunks.instanceMatrix.needsUpdate = true
  leaves.instanceMatrix.needsUpdate = true
  scene.add(trunks, leaves)

  // ---------------------------------------------------------- road paint ----
  const dashGeo = new THREE.BoxGeometry(0.17, 0.03, 2.4)
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd9c89a, transparent: true, opacity: 0.55 })
  const dashes = []
  for (const rx of CITY.ROADS) {
    for (let z = -CITY.HALF; z <= CITY.HALF; z += 9) {
      if (CITY.ROADS.some((rz) => Math.abs(z - rz) < 8)) continue
      dashes.push({ x: rx, z, rot: 0 })
    }
  }
  for (const rz of CITY.ROADS) {
    for (let x = -CITY.HALF; x <= CITY.HALF; x += 9) {
      if (CITY.ROADS.some((rx) => Math.abs(x - rx) < 8)) continue
      dashes.push({ x, z: rz, rot: Math.PI / 2 })
    }
  }
  const dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length)
  dashes.forEach((d, i) => {
    m4.compose(
      new THREE.Vector3(d.x, 0.02, d.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.rot),
      new THREE.Vector3(1, 1, 1)
    )
    dashMesh.setMatrixAt(i, m4)
  })
  dashMesh.instanceMatrix.needsUpdate = true
  scene.add(dashMesh)

  // crosswalks at each intersection
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xe4e0d2, transparent: true, opacity: 0.38 })
  const crossGeo = new THREE.BoxGeometry(0.55, 0.03, 7.4)
  const crossMesh = new THREE.InstancedMesh(crossGeo, crossMat, CITY.ROADS.length * CITY.ROADS.length * 8)
  let crossIdx = 0
  for (const ix of CITY.ROADS) {
    for (const iz of CITY.ROADS) {
      for (let s = 0; s < 4; s++) {
        for (let k = 0; k < 2; k++) {
          const off = (k - 0.5) * 4.2
          const dir = s % 2 === 0
          const px = dir ? ix + off : ix + (s === 1 ? 5.4 : -5.4)
          const pz = dir ? iz + (s === 0 ? 5.4 : -5.4) : iz + off
          const rot = dir ? (s === 0 ? 0 : 0) : Math.PI / 2
          m4.compose(new THREE.Vector3(px, 0.028, pz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1, 1, 1))
          crossMesh.setMatrixAt(crossIdx++, m4)
        }
      }
    }
  }
  crossMesh.count = crossIdx
  crossMesh.instanceMatrix.needsUpdate = true
  scene.add(crossMesh)

  // -------------------------------------------------------------- scenery ---
  // layered ridgelines hide the edge of the world without reading as cones
  const ridgeLayers = [
    { radius: 660, height: 104, color: 0x2c1b29, rough: 30 },
    { radius: 520, height: 62, color: 0x201320, rough: 22 }
  ]
  for (const layer of ridgeLayers) {
    const segments = 108
    const pos = []
    const col = []
    const base = new THREE.Color(layer.color)
    const peak = base.clone().lerp(new THREE.Color(0x6a3d49), 0.35)
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2
      const h = layer.height + Math.sin(a * 3.1) * layer.rough + Math.sin(a * 7.3 + 1.7) * layer.rough * 0.7 + Math.sin(a * 17.7) * 9 + Math.abs(Math.sin(a * 29.1)) * 11
      const r = layer.radius + Math.sin(a * 5.2) * 22
      const an = ((i + 1) / segments) * Math.PI * 2
      const hn = layer.height + Math.sin(an * 3.1) * layer.rough + Math.sin(an * 7.3 + 1.7) * layer.rough * 0.7 + Math.sin(an * 17.7) * 9 + Math.abs(Math.sin(an * 29.1)) * 11
      const rn = layer.radius + Math.sin(an * 5.2) * 22
      const x0 = Math.cos(a) * r, z0 = Math.sin(a) * r
      const x1 = Math.cos(an) * rn, z1 = Math.sin(an) * rn
      pos.push(x0, -12, z0, x1, -12, z1, x1, hn, z1)
      pos.push(x0, -12, z0, x1, hn, z1, x0, h, z0)
      for (let k = 0; k < 6; k++) {
        const c = k === 0 || k === 1 || k === 3 ? base : peak
        col.push(c.r, c.g, c.b)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }))
    mesh.renderOrder = -1
    scene.add(mesh)
  }

  // ----------------------------------------------------------------- data ---
  for (const x of CITY.ROADS) for (const z of CITY.ROADS) intersections.push({ x, z })
  for (const bx of CITY.CENTERS) {
    for (const bz of CITY.CENTERS) {
      missionSpots.push(
        { x: bx - 21, y: 0.24, z: bz - 21 },
        { x: bx + 21, y: 0.24, z: bz - 21 },
        { x: bx - 21, y: 0.24, z: bz + 21 },
        { x: bx + 21, y: 0.24, z: bz + 21 }
      )
      parkingSpots.push(
        { x: bx + 24.4, z: bz, heading: 0 },
        { x: bx - 24.4, z: bz, heading: Math.PI },
        { x: bx, z: bz + 24.4, heading: Math.PI / 2 },
        { x: bx, z: bz - 24.4, heading: -Math.PI / 2 }
      )
    }
  }

  const skyState = { night: 0, t: 0 }
  const sunDir = skyUniforms.sunDir.value
  const dayFog = new THREE.Color(0xb9775d)
  const nightFog = new THREE.Color(0x141a2e)
  const nightSkyTop = new THREE.Color(0x050914)
  const nightSkyHorizon = new THREE.Color(0x1a2547)
  const dayTop = new THREE.Color(0x242a63)
  const dayHorizon = new THREE.Color(0xff8f5a)
  const dusk = new THREE.Color(0xff6b42)

  function setTimeOfDay(t) {
    const tt = ((t % 1) + 1) % 1
    skyState.t = tt
    const u = (tt - 0.25) * Math.PI * 2
    const elev = Math.sin(u)
    const az = Math.cos(u)
    sunDir.set(az * 0.9, Math.max(-0.25, elev), -0.55).normalize()
    sun.position.copy(sunDir).multiplyScalar(320)
    const day = clamp(elev * 2.2 + 0.25, 0, 1)
    const night = clamp(1 - elev * 3.0, 0, 1)
    const sunset = clamp(1 - Math.abs(elev) * 4.2, 0, 1)
    skyState.night = night
    skyUniforms.night.value = night * 0.85
    skyUniforms.topColor.value.copy(dayTop).lerp(nightSkyTop, night)
    skyUniforms.horizonColor.value.copy(dayHorizon).lerp(dusk, sunset * 0.55).lerp(nightSkyHorizon, night)
    skyUniforms.bottomColor.value.copy(dusk).lerp(new THREE.Color(0x241522), night)
    sun.intensity = 0.12 + day * 2.6
    sun.color.copy(new THREE.Color(0xffc08a)).lerp(new THREE.Color(0xff7b4e), sunset * 0.7)
    hemi.intensity = 0.35 + day * 1.0
    rim.intensity = 0.2 + day * 0.4
    fill.intensity = 0.35 + day * 0.8
    ambient.intensity = 0.25 + day * 0.25
    buildingMat.emissiveIntensity = night * 1.5 + 0.06
    lampMat.color.copy(new THREE.Color(0x6b6252)).lerp(new THREE.Color(0xffdda0), night)
    glowMat.opacity = 0.1 + night * 0.62
    starMat.opacity = night * 0.9
    scene.fog.color.copy(dayFog).lerp(nightFog, night)
    scene.fog.density = 0.0026 + night * 0.0016
  }
  setTimeOfDay(0.716)

  return {
    colliders,
    buildings,
    blockCenters,
    intersections,
    missionSpots,
    parkSpots,
    parkingSpots,
    lampSpots,
    ground,
    skyState,
    setTimeOfDay,
    sun,
    worldHalf: CITY.HALF,
    groundY: 0
  }
}
