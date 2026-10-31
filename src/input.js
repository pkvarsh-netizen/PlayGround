// Unified keyboard, mouse and multi-touch input.
export class Input {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas
    this.hooks = hooks
    this.keys = new Set()
    this.actions = new Set()
    this.lookX = 0
    this.lookY = 0
    this.joy = { x: 0, y: 0, active: false, id: null, ox: 0, oy: 0 }
    this.lookPointer = null
    this.lookLast = { x: 0, y: 0 }
    this.firing = false
    this.sprintHold = false
    this.brakeHold = false
    this.enabled = true
    this.isTouch = false
    this._bind()
  }

  _bind() {
    const canvas = this.canvas
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault()
      if (e.repeat) return
      this.keys.add(e.code)
      if (e.code === 'KeyF') this.actions.add('interact')
      if (e.code === 'Space') this.actions.add('jump')
      if (e.code === 'KeyM') this.actions.add('map')
      if (e.code === 'KeyT') this.actions.add('radio')
      if (e.code === 'Escape') this.actions.add('pause')
      if (e.code === 'KeyH') this.actions.add('horn')
    })
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => { this.keys.clear(); this.firing = false })
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement) this.firing = false
    })
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.lookX += e.movementX
        this.lookY += e.movementY
      } else if (this.rightDrag) {
        this.lookX += e.movementX
        this.lookY += e.movementY
      }
    })
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return
      if (e.button === 0) {
        this.firing = true
        if (!this.isTouch && document.pointerLockElement !== canvas) {
          canvas.requestPointerLock?.()
        }
      }
      if (e.button === 2) this.rightDrag = true
    })
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false
      if (e.button === 2) this.rightDrag = false
    })
    window.addEventListener('touchstart', () => { this.isTouch = true }, { passive: true, once: true })

    // touch / pen controls
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || !this.enabled) return
      this.isTouch = true
      const w = window.innerWidth
      const h = window.innerHeight
      if (e.clientX < w * 0.44 && e.clientY > h * 0.46) {
        this.joy.active = true
        this.joy.id = e.pointerId
        this.joy.ox = e.clientX
        this.joy.oy = e.clientY
        const base = document.getElementById('joystick')
        const knob = document.getElementById('joystick-knob')
        if (base) {
          base.classList.add('active')
          base.style.left = e.clientX + 'px'
          base.style.top = e.clientY + 'px'
        }
        if (knob) knob.style.transform = 'translate(-50%, -50%)'
      } else {
        this.lookPointer = e.pointerId
        this.lookLast.x = e.clientX
        this.lookLast.y = e.clientY
      }
    })
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') return
      if (this.joy.active && e.pointerId === this.joy.id) {
        const dx = e.clientX - this.joy.ox
        const dy = e.clientY - this.joy.oy
        const len = Math.hypot(dx, dy) || 1
        const max = 52
        const k = Math.min(1, max / len)
        const kx = dx * k
        const ky = dy * k
        this.joy.x = kx / max
        this.joy.y = -ky / max
        const knob = document.getElementById('joystick-knob')
        if (knob) knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`
      } else if (e.pointerId === this.lookPointer) {
        this.lookX += (e.clientX - this.lookLast.x) * 1.35
        this.lookY += (e.clientY - this.lookLast.y) * 1.35
        this.lookLast.x = e.clientX
        this.lookLast.y = e.clientY
      }
    })
    const end = (e) => {
      if (e.pointerId === this.joy.id) {
        this.joy.active = false
        this.joy.id = null
        this.joy.x = 0
        this.joy.y = 0
        const base = document.getElementById('joystick')
        base?.classList.remove('active')
      }
      if (e.pointerId === this.lookPointer) this.lookPointer = null
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)

    const hold = (id, down, up) => {
      const el = document.getElementById(id)
      if (!el) return
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        el.classList.add('pressed')
        down()
      })
      const release = () => { el.classList.remove('pressed'); up?.() }
      el.addEventListener('pointerup', release)
      el.addEventListener('pointercancel', release)
      el.addEventListener('pointerleave', release)
    }
    hold('btn-fire', () => { this.firing = true }, () => { this.firing = false })
    hold('btn-sprint', () => { this.sprintHold = true }, () => { this.sprintHold = false })
    hold('btn-brake', () => { this.brakeHold = true }, () => { this.brakeHold = false })
    hold('btn-action', () => this.actions.add('interact'))
    hold('btn-jump', () => this.actions.add('jump'))
  }

  consume(name) {
    if (!this.actions.has(name)) return false
    this.actions.delete(name)
    return true
  }

  takeLook() {
    const l = { x: this.lookX, y: this.lookY }
    this.lookX = 0
    this.lookY = 0
    return l
  }

  get moveX() {
    let x = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0)
    x += this.joy.x
    return Math.max(-1, Math.min(1, x))
  }

  get moveY() {
    let y = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0)
    y += this.joy.y
    return Math.max(-1, Math.min(1, y))
  }

  get sprint() {
    return this.sprintHold || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.joy.y > 0.92
  }

  get brake() {
    return this.brakeHold || this.keys.has('Space')
  }

  releasePointer() {
    if (document.pointerLockElement) document.exitPointerLock?.()
    this.firing = false
  }

  clearTouches() {
    this.joy.active = false
    this.joy.x = this.joy.y = 0
    this.joy.id = null
    this.lookPointer = null
    document.getElementById('joystick')?.classList.remove('active')
  }
}
