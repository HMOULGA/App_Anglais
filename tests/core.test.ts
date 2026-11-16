import { describe, it, expect, beforeEach } from 'vitest'
import { newCard, review, dueCards } from '../src/lib/srs'
import { compareWords, fluency, normalize } from '../src/lib/tutor/analysis'
import { parseJson } from '../src/lib/llm/engine'
import { cleanReply, looksGarbled } from '../src/screens/talk'
import { initStore, update, streak, todayKey, getState } from '../src/lib/store'
import { tutorMessages, correctionMessages } from '../src/lib/tutor/prompts'
import { SCENARIOS } from '../src/lib/tutor/scenarios'
import { SHADOW_SETS } from '../src/data/shadowing'
import { MODELS } from '../src/lib/llm/models'

const DAY = 86_400_000

describe('répétition espacée', () => {
  it('programme les intervalles croissants', () => {
    let c = newCard('mistake', 'I go yesterday', 'I went yesterday', '', 0)
    c = review(c, 2, 0); expect(c.interval).toBe(1)
    c = review(c, 2, 0); expect(c.interval).toBe(6)
    c = review(c, 2, 0); expect(c.interval).toBe(15)
  })
  it('« à revoir » remet la carte dans 10 minutes et baisse la facilité', () => {
    const c = review(newCard('expression', 'a', 'b', '', 0), 0, 1000)
    expect(c.due).toBe(1000 + 600_000)
    expect(c.ease).toBeCloseTo(2.3)
  })
  it('ne renvoie que les cartes dues', () => {
    const a = newCard('mistake', 'a', 'b', '', 0)
    const b = { ...newCard('mistake', 'c', 'd', '', 0), due: 5 * DAY }
    expect(dueCards([a, b], DAY).map((x) => x.front)).toEqual(['a'])
  })
})

describe('analyse orale', () => {
  it('score parfait malgré ponctuation, casse et contractions', () => {
    const r = compareWords("I'm not entirely convinced it would work.", 'i am not entirely convinced it would work')
    expect(r.score).toBe(100)
  })
  it('repère mots manqués et faux', () => {
    const r = compareWords('They walked and talked until it rained', 'they walk and talked it rained')
    expect(r.diff.find((d) => d.word === 'walked')?.status).toBe('wrong')
    expect(r.diff.find((d) => d.word === 'until')?.status).toBe('missed')
    expect(r.score).toBeLessThan(80)
  })
  it('calcule le débit et les mots de remplissage', () => {
    const f = fluency('Um I think, you know, it is fine', 4)
    expect(f.words).toBe(8)
    expect(f.wpm).toBe(120)
    expect(f.fillers).toBe(2)
  })
  it('normalise les apostrophes typographiques', () => {
    expect(normalize('It’s FINE!')).toBe("it's fine")
  })
})

describe('sorties du modèle', () => {
  it('extrait un JSON entouré de texte', () => {
    expect(parseJson<{ ok: boolean }>('Sure! {"ok": true} hope it helps')).toEqual({ ok: true })
    expect(parseJson('pas de json')).toBeNull()
  })
  it('détecte une sortie incohérente', () => {
    expect(looksGarbled('DirectDet Spy byt تلف bientôt desainiccation Dizจากการδοση Jason 回家 baleethaneнай使い')).toBe(true)
    expect(looksGarbled("That's great! What did you do at the café afterwards?")).toBe(false)
  })
  it('nettoie les réponses du tuteur', () => {
    expect(cleanReply('Emma: "That sounds great! (smiles) What happened next?"')).toBe('That sounds great! What happened next?')
  })
  it('limite l’historique envoyé au modèle', () => {
    const h = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? 'user' : 'assistant') as 'user' | 'assistant', content: String(i) }))
    const m = tutorMessages(SCENARIOS[0], 'B2', h)
    expect(m[0].role).toBe('system')
    expect(m[m.length - 1].content).toBe('29')
    // alternance stricte user/assistant, en commençant par user (exigence de Gemma)
    m.slice(1).forEach((x, i) => expect(x.role).toBe(i % 2 === 0 ? 'user' : 'assistant'))
  })
  it('commence par l’utilisateur même si le tuteur a ouvert la conversation', () => {
    const m = tutorMessages(SCENARIOS[0], 'B2', [
      { role: 'assistant', content: 'Hi! How was your day?' },
      { role: 'user', content: 'Good.' },
      { role: 'user', content: 'Very good.' },
    ])
    expect(m.map((x) => x.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(m[3].content).toBe('Good.\nVery good.')
  })
  it('la consigne de correction contient la phrase et le contexte', () => {
    const m = correctionMessages('I go there yesterday', 'Where did you go?', 'B2', true)
    expect(m[1].content).toContain('I go there yesterday')
    expect(m[0].content).toContain('in French')
  })
})

describe('état et série', () => {
  beforeEach(() => { localStorage.clear(); initStore(false) })
  it('compte les jours consécutifs', () => {
    const d = (n: number) => { const x = new Date(); x.setDate(x.getDate() - n); return todayKey(x) }
    update((s) => {
      for (const n of [0, 1, 2, 4]) s.days[d(n)] = { date: d(n), speakingSec: 60, words: 10, turns: 1, mistakes: 0, shadowSum: 0, shadowCount: 0, reviews: 0 }
    })
    expect(streak()).toBe(3)
  })
  it('persiste et recharge', () => {
    update((s) => { s.settings.level = 'C1' })
    expect(initStore(false).settings.level).toBe('C1')
    expect(getState().settings.llmModel).toBe('qwen25-3b')
  })
})

describe('contenus', () => {
  it('scénarios et phrases bien formés', () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length)
    for (const s of SHADOW_SETS) expect(s.lines.length).toBeGreaterThanOrEqual(8)
    for (const m of MODELS) {
      expect(m.url).toMatch(/^https:\/\/huggingface\.co\/.+\/resolve\/main\/.+\.gguf$/)
      expect(m.sizeMB).toBeLessThan(2048) // limite ArrayBuffer de wllama
    }
  })
})
