import { Game } from './game.js'
import { Input } from './input.js'
import { AudioEngine } from './audio.js'

const canvas = document.getElementById('game')
const input = new Input(canvas)
let game
try {
  game = new Game(canvas, input)
} catch (error) {
  console.error(error)
  const box = document.getElementById('error-box')
  if (box) {
    box.textContent = 'This browser could not start the WebGL renderer. Try Chrome or Safari with hardware acceleration enabled.'
    box.style.display = 'block'
  }
  throw error
}

const audio = new AudioEngine()
game.setAudio(audio)

const startScreen = document.getElementById('start-screen')
const startBtn = document.getElementById('start-btn')
const pauseScreen = document.getElementById('pause-screen')
const mapScreen = document.getElementById('bigmap')
const wasted = document.getElementById('wasted')
const soundBtn = document.getElementById('sound-btn')

function syncTouchClass() {
  const coarse = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
  document.body.classList.toggle('touch', coarse || window.innerWidth < 720)
}
syncTouchClass()
window.addEventListener('resize', syncTouchClass)

startBtn?.addEventListener('click', () => {
  startScreen?.classList.add('hidden')
  document.body.classList.add('playing')
  game.start()
  audio.init()
  audio.resume()
  updateSoundButton()
})

document.getElementById('resume-btn')?.addEventListener('click', () => game.togglePause())
document.getElementById('pause-map-btn')?.addEventListener('click', () => {
  if (game.paused) game.togglePause()
  game.toggleMap()
})
document.getElementById('map-close')?.addEventListener('click', () => game.toggleMap())
document.getElementById('pause-restart-btn')?.addEventListener('click', () => window.location.reload())
document.getElementById('sound-btn')?.addEventListener('click', (e) => {
  e.stopPropagation()
  audio.init()
  audio.setMuted(!audio.muted)
  updateSoundButton()
})
document.getElementById('pause-sound-btn')?.addEventListener('click', () => {
  audio.init()
  audio.setMuted(!audio.muted)
  updateSoundButton()
})
mapScreen?.addEventListener('click', (e) => {
  if (e.target === mapScreen) game.toggleMap()
})
wasted?.addEventListener('click', () => {})

function updateSoundButton() {
  if (!soundBtn) return
  soundBtn.classList.toggle('muted', audio.muted)
  soundBtn.setAttribute('aria-label', audio.muted ? 'Unmute audio' : 'Mute audio')
  const label = document.getElementById('sound-label')
  if (label) label.textContent = audio.muted ? 'SOUND OFF' : 'SOUND ON'
}
updateSoundButton()

// hide any stray focus outline while playing
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && document.activeElement?.tagName === 'BUTTON') document.activeElement.blur()
})

let last = performance.now()
let frames = 0
function frame(now) {
  const dt = Math.min(0.09, Math.max(0.0001, (now - last) / 1000))
  last = now
  game.update(dt)
  game.renderer.render(game.scene, game.camera)
  frames++
  if (!document.body.classList.contains('ready')) document.body.classList.add('ready')
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// expose a small debug/state surface for automated checks
window.__sunsetCity = {
  game,
  state: () => ({
    started: game.started,
    paused: game.paused,
    money: game.money,
    health: game.health,
    wanted: game.wanted,
    mission: game.mission?.type || null,
    cars: game.cars.length,
    peds: game.peds.length,
    position: game.player.pos.toArray(),
    inCar: !!game.player.car
  })
}
