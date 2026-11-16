// Consignes données au modèle local. Elles sont courtes et très explicites : les petits modèles suivent mieux.
import type { ChatMsg } from '../llm/engine'
import type { Level } from '../store'
import type { Scenario } from './scenarios'

export const TUTOR_NAME = 'Emma'

const LEVEL_STYLE: Record<Level, string> = {
  B1: 'Use clear, simple everyday English and speak in short sentences.',
  B2: 'Use natural everyday English with some common idioms and phrasal verbs.',
  C1: 'Use rich, idiomatic, fast-paced native English, including advanced vocabulary and phrasal verbs.',
}

export function tutorSystem(s: Scenario, level: Level): string {
  return [
    `You are ${TUTOR_NAME}, a warm and curious native English speaker in a spoken conversation with an English learner (level ${level}).`,
    s.role,
    LEVEL_STYLE[level],
    'Rules: reply in 1 to 3 short spoken sentences (maximum 45 words).',
    'Always end with exactly one open question so the learner keeps talking.',
    'Never correct the learner and never talk about grammar. Stay in your role.',
    'No lists, no emojis, no markdown, no stage directions.',
  ].join(' ')
}

export function tutorMessages(s: Scenario, level: Level, history: ChatMsg[], maxTurns = 12): ChatMsg[] {
  // fenêtre glissante : les petits modèles ont un contexte limité
  return [{ role: 'system', content: tutorSystem(s, level) }, ...history.slice(-maxTurns)]
}

export interface Correction {
  ok: boolean
  corrected: string
  explanation: string
  better: string
  expressions: { phrase: string; meaning: string }[]
}

export const CORRECTION_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    corrected: { type: 'string' },
    explanation: { type: 'string' },
    better: { type: 'string' },
    expressions: {
      type: 'array',
      maxItems: 2,
      items: {
        type: 'object',
        properties: { phrase: { type: 'string' }, meaning: { type: 'string' } },
        required: ['phrase', 'meaning'],
      },
    },
  },
  required: ['ok', 'corrected', 'explanation', 'better', 'expressions'],
}

export function correctionMessages(said: string, context: string, level: Level, french: boolean): ChatMsg[] {
  const lang = french ? 'in French' : 'in simple English'
  return [
    {
      role: 'system',
      content: [
        `You are an expert English teacher for French speakers (learner level ${level}).`,
        'You check ONE sentence spoken by the learner. It comes from speech recognition: ignore punctuation, capital letters and filler words.',
        'Return JSON only, with these fields:',
        'ok: true if the sentence is grammatically correct AND sounds natural, otherwise false.',
        'corrected: the sentence with the minimum changes needed to make it correct (identical to the original if ok is true).',
        `explanation: the main mistake explained in at most 20 words, ${lang} (empty if ok is true).`,
        'better: how a native speaker would naturally say the same idea, at most 30 words.',
        'expressions: 0 to 2 useful idioms or collocations the learner could have used here, each with its meaning in French.',
        'Do not invent mistakes. Keep the learner\'s meaning.',
      ].join('\n'),
    },
    { role: 'user', content: `The tutor said: "${context}"\nThe learner answered: "${said}"` },
  ]
}

export interface Summary { strengths: string; focus: string[]; tip: string }

export const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    strengths: { type: 'string' },
    focus: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    tip: { type: 'string' },
  },
  required: ['strengths', 'focus', 'tip'],
}

export function summaryMessages(lines: { said: string; corrected?: string }[], french: boolean): ChatMsg[] {
  const lang = french ? 'French' : 'simple English'
  const body = lines
    .map((l, i) => `${i + 1}. said: "${l.said}"${l.corrected && l.corrected !== l.said ? ` → correct: "${l.corrected}"` : ''}`)
    .join('\n')
  return [
    {
      role: 'system',
      content: `You are an English speaking coach writing a short session summary (recap) for a learner. Write in ${lang}. Return JSON: strengths (one encouraging but honest sentence), focus (up to 3 short grammar or vocabulary points to work on, based on recurring mistakes), tip (one concrete thing to try in the next conversation).`,
    },
    { role: 'user', content: `Learner sentences from this session:\n${body}` },
  ]
}
