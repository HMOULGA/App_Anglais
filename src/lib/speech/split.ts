// Découpage du texte pour la synthèse vocale phrase par phrase.
/** Découpe en phrases (puis en morceaux de ~200 caractères) pour une latence faible. */
export function sentences(text: string): string[] {
  const parts = text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? []
  const out: string[] = []
  for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
    if (p.length <= 220) { out.push(p); continue }
    let cur = ''
    for (const w of p.split(/(?<=,)\s+|\s+/)) {
      if ((cur + ' ' + w).length > 200 && cur) { out.push(cur); cur = w } else cur = cur ? `${cur} ${w}` : w
    }
    if (cur) out.push(cur)
  }
  return out
}
