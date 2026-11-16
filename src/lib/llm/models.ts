// Catalogue des modèles de langage locaux (format GGUF, exécutés par llama.cpp/WebAssembly).
// Téléchargés une seule fois depuis Hugging Face, puis gardés en cache sur l'appareil.

export interface ModelInfo {
  id: string
  label: string
  sizeMB: number
  url: string
  note: string
  device: 'phone' | 'pc' | 'both'
}

const hf = (repo: string, file: string) => `https://huggingface.co/${repo}/resolve/main/${file}`

export const MODELS: ModelInfo[] = [
  {
    id: 'qwen25-0.5b',
    label: 'Qwen 2.5 0.5B — ultra-léger',
    sizeMB: 400,
    url: hf('bartowski/Qwen2.5-0.5B-Instruct-GGUF', 'Qwen2.5-0.5B-Instruct-Q4_K_M.gguf'),
    note: 'Pour téléphones modestes. Réponses rapides mais corrections approximatives.',
    device: 'phone',
  },
  {
    id: 'gemma3-1b',
    label: 'Gemma 3 1B — équilibré',
    sizeMB: 810,
    url: hf('ggml-org/gemma-3-1b-it-GGUF', 'gemma-3-1b-it-Q4_K_M.gguf'),
    note: 'Recommandé sur téléphone : bon anglais conversationnel.',
    device: 'both',
  },
  {
    id: 'qwen25-1.5b',
    label: 'Qwen 2.5 1.5B — intermédiaire',
    sizeMB: 990,
    url: hf('bartowski/Qwen2.5-1.5B-Instruct-GGUF', 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf'),
    note: 'Corrections plus fiables, un peu plus lent.',
    device: 'both',
  },
  {
    id: 'qwen25-3b',
    label: 'Qwen 2.5 3B — qualité (PC)',
    sizeMB: 1930,
    url: hf('bartowski/Qwen2.5-3B-Instruct-GGUF', 'Qwen2.5-3B-Instruct-Q4_K_M.gguf'),
    note: 'Recommandé sur PC : meilleures corrections et reformulations.',
    device: 'pc',
  },
]

export const WHISPER_MODELS = [
  { id: 'Xenova/whisper-tiny.en', label: 'Whisper tiny.en (~40 Mo, rapide)' },
  { id: 'Xenova/whisper-base.en', label: 'Whisper base.en (~80 Mo, recommandé)' },
  { id: 'Xenova/whisper-small.en', label: 'Whisper small.en (~250 Mo, précis, PC)' },
]

export function modelUrl(id: string, customUrl: string): string {
  if (id === 'custom') return customUrl.trim()
  return (MODELS.find((m) => m.id === id) ?? MODELS[1]).url
}
