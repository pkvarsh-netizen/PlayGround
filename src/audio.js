// Tiny procedural audio: engine, radio, sirens and gunshots. No asset files.
export class AudioEngine {
  constructor() {
    this.ctx = null
    this.ready = false
    this.muted = false
    this.driving = false
    this.radioOn = true
    this.siren = 0
    this.step = 0
    this.nextNote = 0
    this.sirenPhase = 0
    this.station = 0
    this.stations = ['SUNSET FM 89.1', 'K-NEON 103.7', 'WAVE 88.3']
  }

  init() {
    if (this.ready) return
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      this.ctx = ctx
      const master = ctx.createGain()
      master.gain.value = 0.55
      master.connect(ctx.destination)
      this.master = master

      const music = ctx.createGain()
      music.gain.value = 0.0
      music.connect(master)
      this.music = music

      const sfx = ctx.createGain()
      sfx.gain.value = 0.85
      sfx.connect(master)
      this.sfx = sfx

      // noise source buffer
      const len = ctx.sampleRate * 2
      const buf = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
      this.noiseBuf = buf

      // engine
      const engGain = ctx.createGain()
      engGain.gain.value = 0
      const engineFilter = ctx.createBiquadFilter()
      engineFilter.type = 'lowpass'
      engineFilter.frequency.value = 420
      const oscA = ctx.createOscillator()
      oscA.type = 'sawtooth'
      oscA.frequency.value = 60
      const oscB = ctx.createOscillator()
      oscB.type = 'square'
      oscB.frequency.value = 44
      const oscBGain = ctx.createGain()
      oscBGain.gain.value = 0.3
      oscA.connect(engineFilter)
      oscB.connect(oscBGain).connect(engineFilter)
      engineFilter.connect(engGain).connect(this.sfx)
      oscA.start()
      oscB.start()
      this.engine = { oscA, oscB, gain: engGain, filter: engineFilter, current: 0 }

      // siren
      const sirenGain = ctx.createGain()
      sirenGain.gain.value = 0
      const sirenOsc = ctx.createOscillator()
      sirenOsc.type = 'square'
      sirenOsc.frequency.value = 660
      const sirenFilter = ctx.createBiquadFilter()
      sirenFilter.type = 'lowpass'
      sirenFilter.frequency.value = 1400
      sirenOsc.connect(sirenFilter).connect(sirenGain).connect(this.sfx)
      sirenOsc.start()
      this.sirenNode = { osc: sirenOsc, gain: sirenGain, filter: sirenFilter }

      this.ready = true
      this.nextNote = ctx.currentTime + 0.2
      this.setMuted(false)
    } catch (error) {
      console.warn('Audio unavailable', error)
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
  }

  setMuted(muted) {
    this.muted = muted
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.05)
  }

  setDriving(on, speed = 0) {
    this.driving = on
    if (!this.ready) return
    const t = this.ctx.currentTime
    const sp = Math.min(28, Math.abs(speed))
    this.engine.gain.gain.setTargetAtTime(on ? 0.055 + sp * 0.003 : 0, t, 0.08)
    this.engine.oscA.frequency.setTargetAtTime(46 + sp * 4.6, t, 0.08)
    this.engine.oscB.frequency.setTargetAtTime(33 + sp * 3.1, t, 0.08)
    this.engine.filter.frequency.setTargetAtTime(320 + sp * 55, t, 0.1)
    this.music.gain.setTargetAtTime(on && this.radioOn ? 0.16 : 0, t, 0.25)
  }

  setSiren(level) {
    this.siren = level
    if (!this.ready) return
    const t = this.ctx.currentTime
    this.sirenNode.gain.gain.setTargetAtTime(level > 0 ? 0.02 + level * 0.006 : 0, t, 0.15)
  }

  playGunshot(vol = 1) {
    if (!this.ready) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.5 * vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16)
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(2600, t)
    f.frequency.exponentialRampToValueAtTime(240, t + 0.15)
    src.connect(f).connect(g).connect(this.sfx)
    src.start(t)
    src.stop(t + 0.2)
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.setValueAtTime(140, t)
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12)
    const og = ctx.createGain()
    og.gain.setValueAtTime(0.22 * vol, t)
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
    osc.connect(og).connect(this.sfx)
    osc.start(t)
    osc.stop(t + 0.16)
  }

  playCash() {
    if (!this.ready) return
    const ctx = this.ctx
    const t = ctx.currentTime
    ;[880, 1174, 1568].forEach((f, i) => {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = f
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t + i * 0.06)
      g.gain.exponentialRampToValueAtTime(0.11, t + i * 0.06 + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.06 + 0.3)
      o.connect(g).connect(this.sfx)
      o.start(t + i * 0.06)
      o.stop(t + i * 0.06 + 0.32)
    })
  }

  playHurt() {
    if (!this.ready) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(180, t)
    o.frequency.exponentialRampToValueAtTime(70, t + 0.2)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.15, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
    o.connect(g).connect(this.sfx)
    o.start(t)
    o.stop(t + 0.25)
  }

  cycleStation() {
    this.station = (this.station + 1) % this.stations.length
    return this.stations[this.station]
  }

  note(freq, when, dur, type, gain, filter) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, when)
    g.gain.exponentialRampToValueAtTime(gain, when + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
    let node = o
    if (filter) {
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = filter
      o.connect(f)
      node = f
    }
    node.connect(g).connect(this.music)
    o.start(when)
    o.stop(when + dur + 0.03)
  }

  kick(when) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(110, when)
    o.frequency.exponentialRampToValueAtTime(42, when + 0.13)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.3, when)
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.2)
    o.connect(g).connect(this.music)
    o.start(when)
    o.stop(when + 0.22)
  }

  hat(when) {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const f = ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 7000
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.05, when)
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05)
    src.connect(f).connect(g).connect(this.music)
    src.start(when)
    src.stop(when + 0.06)
  }

  update() {
    if (!this.ready) return
    const ctx = this.ctx
    // radio sequencer: 4-bar synthwave loop
    if (this.driving && this.radioOn) {
      const bars = [
        { root: 55.0, notes: [220.0, 261.63, 329.63] },
        { root: 43.65, notes: [174.61, 220.0, 261.63] },
        { root: 65.41, notes: [196.0, 261.63, 329.63] },
        { root: 49.0, notes: [196.0, 246.94, 293.66] }
      ]
      while (this.nextNote < ctx.currentTime + 0.25) {
        const step = this.step % 32
        const bar = bars[Math.floor(step / 8)]
        const when = this.nextNote
        if (step % 8 === 0) {
          this.note(bar.root, when, 1.6, 'sawtooth', 0.09, 420)
          for (const f of bar.notes) this.note(f, when, 1.5, 'triangle', 0.025, 900)
        }
        const arp = bar.notes[step % 3] * (step % 6 < 3 ? 2 : 1)
        if (step % 2 === 0) this.note(arp, when, 0.16, 'square', 0.028, 1800)
        if (step % 8 === 0 || step % 8 === 4) this.kick(when)
        if (step % 4 === 2) this.hat(when)
        this.step++
        this.nextNote += 0.235
      }
    } else {
      this.nextNote = Math.max(this.nextNote, ctx.currentTime + 0.1)
    }
    // siren warble
    if (this.siren > 0) {
      this.sirenPhase += 0.055
      const f = 640 + Math.sin(this.sirenPhase) * 240
      this.sirenNode.osc.frequency.setTargetAtTime(f, ctx.currentTime, 0.03)
    }
  }
}
