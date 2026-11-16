// Phrases de shadowing (écouter → répéter à voix haute → comparaison mot à mot).
// Rédigées pour l'application ; chaque thème cible un besoin oral fréquent au niveau B2–C1.

export interface ShadowSet { id: string; title: string; focus: string; lines: string[] }

export const SHADOW_SETS: ShadowSet[] = [
  {
    id: 'linkers', title: 'Nuancer et enchaîner', focus: 'Connecteurs, concessions, hésitations naturelles',
    lines: [
      "That's a fair point, but I'd look at it from a slightly different angle.",
      'On the one hand it saves time, on the other hand it costs a lot more.',
      "To be honest, I'm not entirely convinced it would work in practice.",
      'What I mean is that the effect depends heavily on the local context.',
      "Having said that, there's still a lot we don't know.",
      'It sounds simple at first, but it gets tricky once you look at the details.',
      "Let me put it another way: people won't change unless it's easier for them.",
      "I see where you're coming from, although I'd push back on one thing.",
    ],
  },
  {
    id: 'work', title: 'Réunions et travail', focus: 'Faire un point, proposer, gérer un désaccord',
    lines: [
      "Just to give you a quick update, we're slightly behind schedule but nothing critical.",
      "Could we circle back to this once we've got the final numbers?",
      "I'd suggest we split the task and touch base again on Friday.",
      "I'm afraid that deadline is a bit tight for the amount of work involved.",
      "Let's make sure we're all on the same page before we move forward.",
      "I'll follow up with an email summarising what we've agreed on.",
      "Correct me if I'm wrong, but I think we've overlooked the budget constraint.",
      "That's outside my area, but I can put you in touch with the right person.",
    ],
  },
  {
    id: 'present', title: 'Présenter des résultats', focus: 'Chiffres, tendances, prudence scientifique',
    lines: [
      'As you can see on this slide, demand has roughly doubled over the last five years.',
      'Our results suggest a significant drop in car ownership among users.',
      'This effect is statistically significant, but its magnitude remains modest.',
      'One limitation of this study is that the sample is not fully representative.',
      'In a nutshell, the policy works, but only under certain conditions.',
      "We're currently extending the analysis to other cities to test robustness.",
      'These findings have clear implications for urban transport policy.',
      "That's a great question, and to be honest, it's something we're still working on.",
    ],
  },
  {
    id: 'social', title: 'Small talk', focus: 'Rebondir, montrer de l\'intérêt, conclure poliment',
    lines: [
      "So, what's keeping you busy these days?",
      "Oh really? I didn't know that. How did you end up working there?",
      "I've been meaning to visit that place for ages, but I never got round to it.",
      "It was lovely chatting with you. Let's keep in touch.",
      "I'm terrible with names, could you remind me of yours?",
      "We should grab a coffee sometime and talk about it properly.",
      "No way! That's exactly what happened to me last year.",
      'Anyway, I should let you go. Enjoy the rest of the conference!',
    ],
  },
  {
    id: 'idioms', title: 'Expressions idiomatiques', focus: 'Idiomes et phrasal verbs très fréquents',
    lines: [
      "Let's not beat around the bush, the project is running out of money.",
      "I'll have to sleep on it before I make up my mind.",
      "We're on a tight budget, so we'll need to cut corners somewhere.",
      "It's not rocket science, but it does take a bit of practice.",
      'The new manager really turned things around in just a few months.',
      "I'm swamped this week, can we put it off until Monday?",
      "He came up with a brilliant idea out of the blue.",
      "Don't worry, I'll figure it out as I go along.",
    ],
  },
  {
    id: 'sounds', title: 'Sons difficiles', focus: 'th, h aspiré, terminaisons -ed, voyelles longues/courtes',
    lines: [
      'I think three of the theories are worth thinking through thoroughly.',
      'He hopes to have his house in Hampshire finished by the holidays.',
      'They walked, talked and laughed until it started to rain.',
      'This ship is cheap, but that sheep is a real treat to eat.',
      'Whether the weather is warm or cold, we will go together.',
      'I asked whether the results were published or just presented.',
      'The thirty-third thing they thought about was the theatre.',
      'Would you rather walk to work or ride a bike when the road is wet?',
    ],
  },
]
