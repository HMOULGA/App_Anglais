import { describe, it, expect } from 'vitest'
import { sentences } from '../src/lib/speech/split'
import { pickEnglishVoice } from '../src/lib/speech/tts'

describe('voix', () => {
  it('découpe en phrases', () => {
    expect(sentences("That's great! What did you do next? I went home.")).toEqual(["That's great!", 'What did you do next?', 'I went home.'])
    expect(sentences('No final punctuation')).toEqual(['No final punctuation'])
    const long = sentences('word, '.repeat(80) + 'end.')
    expect(long.length).toBeGreaterThan(1)
    expect(long.every((s) => s.length <= 220)).toBe(true)
  })
  it('ne choisit jamais une voix française', () => {
    const fr = [{ name: 'Microsoft Hortense', lang: 'fr-FR' }, { name: 'Microsoft Paul', lang: 'fr-FR' }]
    expect(pickEnglishVoice(fr, '', 'en-US')).toBeNull()
    const mix = [...fr, { name: 'Microsoft Hazel', lang: 'en-GB' }]
    expect(pickEnglishVoice(mix, '', 'en-US')?.name).toBe('Microsoft Hazel')
    expect(pickEnglishVoice([...mix, { name: 'Zira', lang: 'en_US' }], '', 'en-US')?.name).toBe('Zira')
  })
})
