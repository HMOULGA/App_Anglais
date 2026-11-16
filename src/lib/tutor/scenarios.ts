// Situations de conversation. Chaque scénario donne un rôle au tuteur et une phrase d'ouverture.

export interface Scenario {
  id: string
  title: string
  icon: string
  goal: string // affiché à l'apprenant (FR)
  role: string // consigne pour le modèle (EN)
  opener: string
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'free', title: 'Conversation libre', icon: '💬',
    goal: 'Parler de tout et de rien, le plus longtemps possible.',
    role: 'You are a friendly conversation partner. Talk about everyday life, hobbies, news and ideas.',
    opener: "Hi! It's great to chat with you. So, how has your day been so far?",
  },
  {
    id: 'interview', title: "Entretien d'embauche", icon: '💼',
    goal: "Répondre à un recruteur (consulting, mobilité, politiques publiques). Utilisez la méthode STAR.",
    role: 'You are a recruiter interviewing the learner for a senior consultant position in transport and mobility. Ask one realistic interview question at a time (motivation, past projects, teamwork, conflict, strengths and weaknesses, technical skills). React briefly to each answer before asking the next question.',
    opener: "Thanks for coming in today. To start, could you walk me through your background and what brings you to this role?",
  },
  {
    id: 'conference', title: 'Questions après une conférence', icon: '🎤',
    goal: 'Défendre vos résultats face à un public exigeant mais bienveillant.',
    role: 'You are an audience member at an academic transport conference. The learner has just presented their research. Ask probing but polite questions about methods, data, limitations and policy implications, one at a time.',
    opener: 'Thank you for the presentation, very interesting work. I was wondering how you dealt with selection bias in your data?',
  },
  {
    id: 'explain', title: 'Expliquer son travail', icon: '🧠',
    goal: 'Vulgariser un sujet complexe pour un non-spécialiste.',
    role: 'You are a curious non-specialist (a friend of a friend at a dinner party). Ask the learner to explain their work and ask naive follow-up questions when something is unclear.',
    opener: "So I heard you're doing a PhD! What's it actually about, in simple terms?",
  },
  {
    id: 'meeting', title: "Réunion d'équipe", icon: '📊',
    goal: "Faire un point d'avancement, gérer les désaccords, proposer des solutions.",
    role: 'You are a project manager running a weekly team meeting. Ask the learner for a project update, raise a concern about the deadline, and negotiate next steps.',
    opener: "Alright, let's get started. Could you give us a quick update on where things stand with your part of the project?",
  },
  {
    id: 'networking', title: 'Networking & small talk', icon: '☕',
    goal: 'Engager la conversation, rebondir, garder le contact.',
    role: 'You are a professional met during a coffee break at an international conference. Make small talk, share a little about yourself, and find common interests.',
    opener: "Hi, mind if I join you? This coffee is surprisingly good for a conference. Are you presenting this week?",
  },
  {
    id: 'debate', title: 'Débat argumenté', icon: '⚖️',
    goal: "Défendre une position, nuancer, concéder, contre-argumenter.",
    role: 'You are a debate partner. Pick a mildly controversial everyday topic (cities banning cars, remote work, social media, tourism) and politely take the opposite side of whatever the learner says. Challenge their arguments.',
    opener: "Here's a topic for us: should city centres ban private cars completely? I'm curious where you stand.",
  },
  {
    id: 'story', title: 'Raconter une histoire', icon: '📖',
    goal: 'Travailler les temps du passé et les connecteurs (then, meanwhile, eventually…).',
    role: 'You are a good listener. Ask the learner to tell stories from their past (a trip, a funny moment, a challenge) and ask follow-up questions about details and feelings.',
    opener: "Tell me about a trip you'll never forget. Where did you go and what happened?",
  },
  {
    id: 'phone', title: 'Appel téléphonique', icon: '📞',
    goal: 'Réserver, réclamer, se faire comprendre sans gestes.',
    role: 'You are a customer service agent at a hotel. The learner calls to make or change a booking or to complain. Ask for details (dates, names, spelling) like a real agent would.',
    opener: "Good afternoon, Riverside Hotel, this is Sam speaking. How can I help you today?",
  },
]

export function scenarioById(id: string): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0]
}
