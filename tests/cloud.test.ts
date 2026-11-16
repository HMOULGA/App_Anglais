import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { initStore, update } from '../src/lib/store'
import { cloudChat, cloudUsable, cloudStatus, encodeWav, cloudTranscribe, resetCloudPause, replacementModel } from '../src/lib/cloud'
import { getState } from '../src/lib/store'
import { llm, NeedLocalError } from '../src/lib/llm/engine'

function sse(chunks: string[]): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream({
    start(c) {
      for (const t of chunks) c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`))
      c.enqueue(enc.encode('data: [DONE]\n\n'))
      c.close()
    },
  })
  return new Response(body, { status: 200 })
}

describe('Groq', () => {
  beforeEach(() => {
    localStorage.clear()
    initStore(false)
    update((s) => { s.settings.cloudProvider = 'groq'; s.settings.groqKey = 'gsk_test_key_123456' })
    resetCloudPause()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('actif seulement avec une clé et hors mode privé', () => {
    expect(cloudUsable()).toBe(true)
    update((s) => { s.settings.privateMode = true })
    expect(cloudUsable()).toBe(false)
    expect(cloudStatus()).toContain('mode privé')
  })

  it('lit un flux SSE en streaming', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse(['Hello', ' there', '!']))
    vi.stubGlobal('fetch', fetchMock)
    const seen: string[] = []
    const out = await cloudChat([{ role: 'user', content: 'hi' }], { onToken: (t) => seen.push(t) })
    expect(out).toBe('Hello there!')
    expect(seen).toEqual(['Hello', 'Hello there', 'Hello there!'])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer gsk_test_key_123456')
    expect(JSON.parse(init.body).model).toBe('llama-3.3-70b-versatile')
  })

  it('demande du JSON pour les corrections', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] })))
    vi.stubGlobal('fetch', fetchMock)
    expect(await cloudChat([{ role: 'user', content: 'x' }], { jsonSchema: {} })).toBe('{"ok":true}')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format).toEqual({ type: 'json_object' })
  })

  it('quota atteint → pause du cloud et erreur NeedLocal si pas de modèle local', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":{"message":"rate"}}', { status: 429 })))
    await expect(llm.chat([{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(NeedLocalError)
    expect(cloudUsable()).toBe(false)
    expect(cloudStatus()).toContain('quota')
  })

  it('envoie un WAV 16 kHz à Whisper', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: ' I go there yesterday. ' })))
    vi.stubGlobal('fetch', fetchMock)
    expect(await cloudTranscribe(new Float32Array(16000))).toBe('I go there yesterday.')
    const form = fetchMock.mock.calls[0][1].body as FormData
    expect(form.get('model')).toBe('whisper-large-v3-turbo')
    expect(form.get('language')).toBe('en')
  })

  it('encode un WAV valide', () => {
    const w = new DataView(encodeWav(new Float32Array([0, 1, -1]), 16000))
    expect(String.fromCharCode(w.getUint8(0), w.getUint8(1), w.getUint8(2), w.getUint8(3))).toBe('RIFF')
    expect(w.getUint32(24, true)).toBe(16000)
    expect(w.getInt16(46, true)).toBe(32767)
    expect(w.getInt16(48, true)).toBe(-32768)
  })

  it('Gemini : système séparé, rôle model, sans réflexion, en streaming', async () => {
    update((s) => { s.settings.cloudProvider = 'gemini'; s.settings.geminiKey = 'AIza_test_key_123456' })
    const enc = new TextEncoder()
    const chunk = (t: string) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\n\n`
    const body = new ReadableStream({ start(c) { c.enqueue(enc.encode(chunk('Great') + chunk(' answer!'))); c.close() } })
    const fetchMock = vi.fn().mockResolvedValue(new Response(body))
    vi.stubGlobal('fetch', fetchMock)
    const out = await cloudChat([
      { role: 'system', content: 'Be nice' },
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
      { role: 'user', content: 'How are you' },
    ], { onToken: () => {} })
    expect(out).toBe('Great answer!')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse')
    expect(init.headers['x-goog-api-key']).toBe('AIza_test_key_123456')
    const b = JSON.parse(init.body)
    expect(b.systemInstruction.parts[0].text).toBe('Be nice')
    expect(b.contents.map((c: any) => c.role)).toEqual(['user', 'model', 'user'])
    expect(b.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'LOW' })
  })

  it('Gemini : modèle retiré → adopte le remplaçant indiqué et réessaie', async () => {
    update((s) => { s.settings.cloudProvider = 'gemini'; s.settings.geminiKey = 'AIza_test_key_123456'; s.settings.geminiModel = 'gemini-2.5-flash' })
    const retired = '{"error":{"message":"This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features."}}'
    const ok = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ready' }] } }] })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(retired, { status: 404 }))
      .mockResolvedValueOnce(new Response(ok))
    vi.stubGlobal('fetch', fetchMock)
    expect(await cloudChat([{ role: 'user', content: 'x' }])).toBe('ready')
    expect(getState().settings.geminiModel).toBe('gemini-3.8-flash')
    expect(fetchMock.mock.calls[1][0]).toContain('/models/gemini-3.8-flash:generateContent')
    expect(replacementModel('quota exceeded')).toBeNull()
  })

  it('Gemini : clé invalide (400) → pause et message clair', async () => {
    update((s) => { s.settings.cloudProvider = 'gemini'; s.settings.geminiKey = 'AIza_bad_key_123456' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":{"message":"API key not valid. Please pass a valid API key."}}', { status: 400 })))
    await expect(cloudChat([{ role: 'user', content: 'x' }])).rejects.toThrow('Clé Gemini invalide')
    expect(cloudStatus()).toContain('clé refusée')
  })

  it('Gemini : modèle saturé (503) → un autre modèle Gemini répond, le réglage ne change pas', async () => {
    update((s) => { s.settings.cloudProvider = 'gemini'; s.settings.geminiKey = 'AIza_test_key_123456'; s.settings.geminiModel = 'gemini-3.8-flash' })
    const busy = '{"error":{"message":"This model is currently experiencing high demand. Please try again later."}}'
    const ok = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ready' }] } }] })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(busy, { status: 503 }))
      .mockResolvedValueOnce(new Response(ok))
    vi.stubGlobal('fetch', fetchMock)
    expect(await cloudChat([{ role: 'user', content: 'x' }])).toBe('ready')
    expect(fetchMock.mock.calls[1][0]).toContain('/models/gemini-flash-latest:')
    expect(getState().settings.geminiModel).toBe('gemini-3.8-flash')
    expect(cloudUsable()).toBe(true)
  })
})
