import './styles.css'
import { initStore, streak, subscribe } from './lib/store'
import { isAndroid } from './lib/platform'
import { stopSpeaking, setNoEnglishVoiceHandler } from './lib/speech/tts'
import { toast } from './lib/ui'
import * as home from './screens/home'
import * as talk from './screens/talk'
import * as shadow from './screens/shadow'
import * as review from './screens/review'
import * as progress from './screens/progress'
import * as settings from './screens/settings'

type Screen = { render(root: HTMLElement, params: string[]): void | (() => void) }
const routes: Record<string, Screen> = { '': home, talk, shadow, review, progress, settings }

initStore(isAndroid)
setNoEnglishVoiceHandler(() => toast('Aucune voix anglaise installée : choisissez la voix neuronale dans Réglages › Voix.', 8000))
const app = document.getElementById('app')!
let cleanup: void | (() => void)

function route() {
  const [name = '', ...params] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent)
  const screen = routes[name] ?? home
  if (typeof cleanup === 'function') cleanup()
  void stopSpeaking()
  document.querySelectorAll('.modal-wrap').forEach((m) => m.remove())
  app.innerHTML = ''
  app.className = `screen-${name || 'home'}`
  document.querySelectorAll<HTMLAnchorElement>('.tabs a').forEach((a) =>
    a.classList.toggle('active', (a.dataset.tab === 'home' ? '' : a.dataset.tab) === name))
  cleanup = screen.render(app, params)
  window.scrollTo(0, 0)
}

function paintStreak() {
  const n = streak()
  document.getElementById('streak')!.textContent = `🔥 ${n}`
}

window.addEventListener('hashchange', route)
subscribe(paintStreak)
paintStreak()
route()
