// Fully synthesized audio: no external assets.
export class GameAudio {
  constructor() {
    this.ctx = null
    this.master = null
    this.engine = null
    this.siren = null
    this.muted = false
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.32
    this.master.connect(this.ctx.destination)

    // Engine: detuned saw pair through a lowpass.
    const eGain = this.ctx.createGain()
    eGain.gain.value = 0
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 220
    filter.Q.value = 2
    const oscA = this.ctx.createOscillator()
    oscA.type = 'sawtooth'
    oscA.frequency.value = 55
    const oscB = this.ctx.createOscillator()
    oscB.type = 'square'
    oscB.frequency.value = 41
    const bGain = this.ctx.createGain()
    bGain.gain.value = 0.5
    oscA.connect(filter)
    oscB.connect(bGain)
    bGain.connect(filter)
    filter.connect(eGain)
    eGain.connect(this.master)
    oscA.start()
    oscB.start()
    this.engine = { gain: eGain, filter, oscA, oscB }

    // Siren: two-tone oscillator.
    const sGain = this.ctx.createGain()
    sGain.gain.value = 0
    const sOsc = this.ctx.createOscillator()
    sOsc.type = 'triangle'
    sOsc.frequency.value = 720
    const sFilter = this.ctx.createBiquadFilter()
    sFilter.type = 'bandpass'
    sFilter.frequency.value = 900
    sFilter.Q.value = 1.2
    sOsc.connect(sFilter)
    sFilter.connect(sGain)
    sGain.connect(this.master)
    sOsc.start()
    this.siren = { gain: sGain, osc: sOsc, filter: sFilter, t: 0, active: false }
    this.noise = this.makeNoiseBuffer()
  }

  makeNoiseBuffer() {
    const len = this.ctx.sampleRate * 1.2
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    return buf
  }

  setMuted(m) {
    this.muted = m
    if (this.master) this.master.gain.value = m ? 0 : 0.32
  }

  setEngine(speedRatio, throttle) {
    if (!this.engine) return
    const t = this.ctx.currentTime
    const target = Math.min(1, speedRatio)
    this.engine.gain.gain.setTargetAtTime(target > 0.02 ? 0.09 + target * 0.1 : 0, t, 0.08)
    this.engine.filter.frequency.setTargetAtTime(160 + target * 900 + throttle * 300, t, 0.08)
    this.engine.oscA.frequency.setTargetAtTime(48 + target * 120, t, 0.06)
    this.engine.oscB.frequency.setTargetAtTime(36 + target * 92, t, 0.06)
  }

  updateSiren(dt, active) {
    if (!this.siren) return
    const t = this.ctx.currentTime
    this.siren.gain.gain.setTargetAtTime(active ? 0.045 : 0, t, 0.18)
    if (active) {
      this.siren.t += dt
      const f = 640 + (Math.sin(this.siren.t * 6) * 0.5 + 0.5) * 420
      this.siren.osc.frequency.setTargetAtTime(f, t, 0.03)
    }
  }

  noiseBurst(duration, gain, filterType, freqStart, freqEnd) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    const f = this.ctx.createBiquadFilter()
    f.type = filterType
    f.frequency.setValueAtTime(freqStart, t)
    f.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t + duration)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    src.connect(f)
    f.connect(g)
    g.connect(this.master)
    src.start(t)
    src.stop(t + duration + 0.05)
  }

  gunshot() {
    if (!this.ctx) return
    this.noiseBurst(0.16, 0.5, 'lowpass', 4200, 320)
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(140, t)
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12)
    g.gain.setValueAtTime(0.22, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)
    osc.connect(g)
    g.connect(this.master)
    osc.start(t)
    osc.stop(t + 0.16)
  }

  explosion() {
    this.noiseBurst(1.1, 0.7, 'lowpass', 1600, 60)
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(80, t)
    osc.frequency.exponentialRampToValueAtTime(24, t + 0.8)
    g.gain.setValueAtTime(0.5, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9)
    osc.connect(g)
    g.connect(this.master)
    osc.start(t)
    osc.stop(t + 0.95)
  }

  thud() {
    this.noiseBurst(0.18, 0.3, 'lowpass', 700, 80)
  }

  hurt() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(180, t)
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.2)
    g.gain.setValueAtTime(0.12, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
    osc.connect(g)
    g.connect(this.master)
    osc.start(t)
    osc.stop(t + 0.24)
  }

  pickup() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    ;[660, 880, 1320].forEach((f, i) => {
      const osc = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = f
      g.gain.setValueAtTime(0.0001, t + i * 0.07)
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.07 + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.07 + 0.2)
      osc.connect(g)
      g.connect(this.master)
      osc.start(t + i * 0.07)
      osc.stop(t + i * 0.07 + 0.22)
    })
  }

  ui() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(520, t)
    osc.frequency.exponentialRampToValueAtTime(780, t + 0.07)
    g.gain.setValueAtTime(0.05, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
    osc.connect(g)
    g.connect(this.master)
    osc.start(t)
    osc.stop(t + 0.12)
  }

  reload() {
    this.noiseBurst(0.07, 0.18, 'highpass', 1800, 3000)
    setTimeout(() => this.noiseBurst(0.06, 0.14, 'highpass', 1200, 2200), 120)
  }

  notify(high = false) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(high ? 880 : 440, t)
    osc.frequency.setValueAtTime(high ? 1320 : 660, t + 0.09)
    g.gain.setValueAtTime(0.07, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
    osc.connect(g)
    g.connect(this.master)
    osc.start(t)
    osc.stop(t + 0.32)
  }
}
