# Fluent — tuteur d'anglais oral 100 % hors-ligne

Application Android et Windows pour progresser vite à l'oral en anglais (niveau intermédiaire et plus).
L'IA tourne **entièrement sur l'appareil** : aucun compte, aucun abonnement, aucune donnée envoyée.

## Ce que fait l'application

| Écran | Rôle pédagogique |
|---|---|
| **Parler** | Conversation vocale avec « Emma » dans 9 situations : conversation libre, entretien d'embauche, questions après une conférence, vulgariser son travail, réunion, networking, débat, récit au passé, appel téléphonique. Mode mains libres : le micro se relance seul après chaque réponse. |
| Corrections | Après chaque phrase : correction minimale, explication courte, version « plus naturelle » et 0 à 2 expressions idiomatiques. Bouton **Redire correctement** avec score mot à mot. Les corrections peuvent aussi n'apparaître qu'en fin de séance. |
| Bilan | Prises de parole, débit (mots/min), part de phrases correctes, points forts, 3 points à travailler, conseil pour la prochaine fois. |
| **Révision** | Répétition espacée (SM-2) de **vos propres erreurs** et des expressions proposées, en répondant **à l'oral**. |
| **Shadowing** | 48 phrases natives en 6 thèmes (nuancer, réunions, présenter des résultats, small talk, idiomes, sons difficiles) : écouter, répéter, comparaison mot à mot. |
| **Progrès** | Série de jours, minutes de parole sur 14 jours, débit par séance, historique des bilans. |

La séance du jour sur l'accueil suit la méthode : révisions → 10–15 min de conversation → 5 min de shadowing.

## IA en ligne (Gemini ou Groq, recommandé)

**Gemini** : clé gratuite sur aistudio.google.com (Get API key) avec un compte Google ; modèle par défaut Gemini 2.5 Flash, sans « réflexion » pour répondre vite. La reconnaissance vocale reste alors locale.

**Groq** : collez une clé API Groq gratuite (console.groq.com › API Keys) dans **Réglages**. Le tuteur passe alors par Llama 3.3 70B (ou GPT-OSS 120B, Qwen 3 32B…) et l'écoute par Whisper large-v3 turbo : corrections bien plus fiables, réponses quasi instantanées. Sans réseau, quota épuisé ou clé refusée, l'appli repasse automatiquement sur l'IA locale ci-dessous. L'option **Mode privé** force l'IA locale.

## Les moteurs d'IA locaux (secours / hors-ligne)

| Fonction | Moteur | Détail |
|---|---|---|
| Tuteur et corrections | [wllama](https://github.com/ngxson/wllama) (llama.cpp en WebAssembly) | Modèles GGUF téléchargés une fois puis gardés en cache. Corrections en JSON contraint par schéma. |
| Reconnaissance vocale | Whisper (transformers.js) **ou** moteur natif Android | Whisper : tiny/base/small.en. Android : rapide, hors-ligne si le pack anglais est installé. |
| Voix | Voix du système | Windows : voix SAPI. Android : moteur TTS du téléphone. |

Modèles proposés (Réglages) :

| Modèle | Taille | Usage |
|---|---|---|
| Qwen 2.5 0.5B | 0,4 Go | téléphones modestes |
| Gemma 3 1B | 0,8 Go | **défaut Android** |
| Qwen 2.5 1.5B | 1 Go | compromis |
| Qwen 2.5 3B | 1,9 Go | **défaut Windows** |

Vous pouvez aussi coller l'URL de n'importe quel GGUF de moins de 2 Go, ou charger un fichier `.gguf` déjà présent sur l'appareil.

> **Premier lancement** : connectez-vous en Wi-Fi. L'appli télécharge le modèle choisi et Whisper. Ensuite tout fonctionne sans réseau.

## Développement

```bash
npm install --ignore-scripts
npm run dev            # http://localhost:5173 (ajoutez ?mock pour une IA simulée)
npm test               # tests unitaires (vitest)
npm run electron       # appli Windows en local (après: node node_modules/electron/install.js)
npm run android:sync   # build web + copie dans le projet Android
npm run android:open   # ouvre Android Studio (Run ▶ pour installer sur le téléphone)
```

### Builds automatiques (GitHub Actions)

`.github/workflows/build.yml` lance les tests, puis produit `Fluent-android.apk` (APK de débogage installable directement) et les `.exe` Windows (installateur + version portable). Ils sont téléchargeables dans l'onglet **Actions**, rubrique *Artifacts*. Pousser un tag `v0.1.0` crée une *Release* GitHub avec les fichiers.

```bash
git init && git add . && git commit -m "Fluent v0.1"
git branch -M main
git remote add origin https://github.com/<vous>/Fluent.git
git push -u origin main
```

## Structure

```
src/lib/llm/engine.ts        moteur wllama + moteur simulé (?mock) + cache des modèles
src/lib/llm/models.ts        catalogue des modèles GGUF et Whisper
src/lib/speech/recorder.ts   micro, détection de fin de phrase, rééchantillonnage 16 kHz
src/lib/speech/whisper.worker.ts  Whisper dans un Web Worker (wasm embarqué, sans CDN)
src/lib/speech/stt.ts        choix Whisper / reconnaissance native Android
src/lib/speech/tts.ts        voix du système (Windows / Android)
src/lib/tutor/scenarios.ts   situations de conversation
src/lib/tutor/prompts.ts     consignes du tuteur, de la correction (schéma JSON) et du bilan
src/lib/tutor/analysis.ts    débit, mots de remplissage, alignement mot à mot
src/lib/srs.ts               répétition espacée
src/lib/store.ts             état local (réglages, cartes, statistiques)
src/data/shadowing.ts        phrases de shadowing
src/screens/                 Accueil, Parler, Shadowing, Révision, Progrès, Réglages
electron/main.cjs            appli Windows (protocole app://, en-têtes COOP/COEP, micro)
android/                     projet Android (Capacitor) ; MainActivity ajoute COOP/COEP
```

## Limites à connaître

- **Qualité des corrections** : un modèle de 1 à 3 milliards de paramètres corrige bien les erreurs fréquentes (temps, prépositions, articles, accords), mais il lui arrive de rater une erreur ou d'en signaler une à tort. Sur PC, préférez Qwen 2.5 3B.
- **Vitesse** : sur téléphone, comptez quelques secondes avant chaque réponse. Le multi-thread (en-têtes COOP/COEP) accélère nettement quand le WebView le permet ; l'état s'affiche dans Réglages.
- **Whisper « corrige » parfois ce qu'il entend** (il transcrit une phrase plausible) : certaines fautes de grammaire orales peuvent donc disparaître de la transcription, et le score de shadowing mesure surtout l'intelligibilité, pas l'accent.
- La limite de 2 Go par fichier vient de WebAssembly (ArrayBuffer) ; au-delà, il faut un GGUF découpé (`llama-gguf-split`).

## Licences des modèles

Qwen 2.5 (Apache 2.0, sauf 3B : Qwen Research License, usage non commercial), Gemma 3 (Gemma Terms of Use), Whisper (MIT). Vérifiez ces conditions avant toute diffusion publique.
