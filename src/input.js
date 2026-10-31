export class Input {
  constructor(canvas, touchRoot) {
    this.canvas = canvas
    this.touchRoot = touchRoot
    this.keys = new Set()
    this.actions = Object.create(null)
    this.pressed = new Set()
    this.lookDX = 0
    this.lookDY = 0
    this.firing = false
    this.aiming = false
    this.touchMove = { x: 0, y: 0 }
    this.touchActive = false
    this.isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
    this.pointerLocked = false
    this.stickPointer = null
    this.lookPointer = null
    this.lookStart = { x: 0, y: 0 }
    this._bind()
  }

  _bind() {
    const down = (e) => {
      if (e.target.closest?.('button, input, a')) return
      this.keys.add(e.code)
      if (!e.repeat) {
        if (e.code === 'KeyE') this.pressed.add('enter')
        if (e.code === 'Space') { this.pressed.add('jump'); e.preventDefault() }
        if (e.code === 'KeyR') this.pressed.add('reload')
        if (e.code === 'KeyM') this.pressed.add('mute')
        if (e.code === 'Escape') this.pressed.add('pause')
        if (e.code === 'KeyC') this.pressed.add('camera')
      }
    }
    const up = (e) => this.keys.delete(e.code)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', () => { this.keys.clear(); this.firing = false; this.aiming = false })

    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.lookDX += e.movementX
        this.lookDY += e.movementY
      } else if (this.lookPointer === 'mouse') {
        this.lookDX += e.movementX
        this.lookDY += e.movementY
      }
    })
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.firing = true
      if (e.button === 2) this.aiming = true
      if (!this.pointerLocked && !this.isTouch) {
        this.lookPointer = 'mouse'
        try { this.canvas.requestPointerLock?.() } catch { /* ignore */ }
      }
    })
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false
      if (e.button === 2) this.aiming = false
      if (this.lookPointer === 'mouse') this.lookPointer = null
    })
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas
    })

    // Touch: left joystick, right side drag to look, buttons.
    const stickBase = this.touchRoot?.querySelector('#stick-base')
    const stickKnob = this.touchRoot?.querySelector('#stick-knob')
    if (stickBase) {
      const updateStick = (e) => {
        const r = stickBase.getBoundingClientRect()
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        let dx = e.clientX - cx
        let dy = e.clientY - cy
        const max = r.width * 0.42
        const len = Math.hypot(dx, dy)
        if (len > max) { dx = dx / len * max; dy = dy / len * max }
        this.touchMove.x = dx / max
        this.touchMove.y = dy / max
        stickKnob.style.transform = `translate(${dx}px, ${dy}px)`
      }
      stickBase.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        this.stickPointer = e.pointerId
        stickBase.setPointerCapture(e.pointerId)
        updateStick(e)
      })
      stickBase.addEventListener('pointermove', (e) => {
        if (this.stickPointer !== e.pointerId) return
        updateStick(e)
      })
      const endStick = (e) => {
        if (this.stickPointer !== e.pointerId) return
        this.stickPointer = null
        this.touchMove.x = 0
        this.touchMove.y = 0
        stickKnob.style.transform = 'translate(0px, 0px)'
      }
      stickBase.addEventListener('pointerup', endStick)
      stickBase.addEventListener('pointercancel', endStick)
    }

    this.canvas.addEventListener('touchstart', (e) => {
      if (this.lookPointer !== null) return
      const t = e.changedTouches[0]
      this.lookPointer = t.identifier
      this.lookStart.x = t.clientX
      this.lookStart.y = t.clientY
    }, { passive: true })
    this.canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.lookPointer) continue
        const dx = t.clientX - this.lookStart.x
        const dy = t.clientY - this.lookStart.y
        this.lookStart.x = t.clientX
        this.lookStart.y = t.clientY
        this.lookDX += dx * 1.35
        this.lookDY += dy * 1.35
      }
    }, { passive: true })
    const endLook = (e) => {
      for (const t of e.changedTouches) if (t.identifier === this.lookPointer) this.lookPointer = null
    }
    this.canvas.addEventListener('touchend', endLook, { passive: true })
    this.canvas.addEventListener('touchcancel', endLook, { passive: true })

    for (const btn of this.touchRoot?.querySelectorAll('[data-action]') || []) {
      const action = btn.dataset.action
      if (action === 'fire' || action === 'aim' || action === 'sprint') {
        const on = (e) => {
          e.preventDefault()
          btn.classList.add('held')
          if (action === 'fire') this.firing = true
          else if (action === 'aim') this.aiming = true
          else this.actions.sprint = true
        }
        const off = (e) => {
          e.preventDefault()
          btn.classList.remove('held')
          if (action === 'fire') this.firing = false
          else if (action === 'aim') this.aiming = false
          else this.actions.sprint = false
        }
        btn.addEventListener('pointerdown', on)
        btn.addEventListener('pointerup', off)
        btn.addEventListener('pointercancel', off)
        btn.addEventListener('pointerleave', off)
      } else {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault()
          this.pressed.add(action)
        })
      }
    }
  }

  setTouchMode(on) {
    this.isTouch = on
    document.body.classList.toggle('touch', on)
  }

  down(code) { return this.keys.has(code) }
  sprinting() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.actions.sprint }
  moveVector() {
    let x = 0
    let y = 0
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1
    x += this.touchMove.x
    y -= this.touchMove.y
    const len = Math.hypot(x, y)
    if (len > 1) { x /= len; y /= len }
    return { x, y }
  }

  consumeLook() {
    const out = { x: this.lookDX, y: this.lookDY }
    this.lookDX = 0
    this.lookDY = 0
    return out
  }

  wasPressed(action) {
    if (!this.pressed.has(action)) return false
    this.pressed.delete(action)
    return true
  }

  endFrame() {
    this.pressed.clear()
  }
}
