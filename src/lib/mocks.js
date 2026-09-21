// Canned responses for Mock Mode — lets the whole app be exercised offline
// (no API key, no network) from the Dev Panel.
//
// Language honesty: the demo speaks the LEARNER'S language. A German learner
// finishes onboarding straight into a demo conversation — if the canned
// partner replied in French, German mode would be lying about what it does.
// Tables are keyed by the active content language, read at call time, so a
// mid-session switch is honoured on the next turn. The English coaching
// prose (corrections/strengths explanations) stays English by design: the
// UI chrome is English.

import { contentLang } from './content/active.js';

const MOCK_TRANSCRIPTS = {
  fr: [
    "Bonjour, je voudrais un café au lait et un croissant s'il vous plaît.",
    "Je pense que le train est en retard, du coup je vais attendre ici.",
    "Est-ce que vous pouvez m'aider ? J'ai perdu mon colis la semaine dernière.",
  ],
  de: [
    'Hallo, ich hätte gern einen Kaffee und ein Croissant, bitte.',
    'Ich glaube, der Zug hat Verspätung, also warte ich einfach hier.',
    'Können Sie mir helfen? Ich habe mein Paket letzte Woche verloren.',
  ],
  es: [
    'Buenos días, quiero un café con leche y un croissant, por favor.',
    'Creo que el tren va con retraso, así que voy a esperar aquí.',
    '¿Me puede ayudar? Perdí mi paquete la semana pasada.',
  ],
};

const MOCK_REPLIES = {
  fr: [
    {
      reply: "Très bon choix ! Un café au lait et un croissant, ça marche. Vous voulez autre chose avec ça ?",
      translation: "Great choice! A café au lait and a croissant, coming up. Would you like anything else with that?",
      corrections: "Almost perfect! One nuance: in a Parisian bistro you'd say <s>je voudrais un café au lait</s> <mark>je vais prendre un café crème</mark> — *café au lait* is mostly said at home.",
      native_alternative: "« Bonjour, je vous prends un petit crème et un croissant, s'il vous plaît ! »",
      grammar_topic: 'articles',
      scores: { grammar: 92, naturalness: 78, relevance: 95, fluency: 84, overall: 87 },
    },
    {
      reply: "Ah non, pas de chance ! Il y a souvent des retards sur cette ligne. Vous allez où, exactement ?",
      translation: "Oh no, bad luck! There are often delays on this line. Where exactly are you headed?",
      corrections: "Very good! Your use of <mark>du coup</mark> is perfectly natural here. Just watch the rhythm: take a small pause after «retard».",
      native_alternative: "« Le train a du retard, du coup je poireaute ici en attendant. »",
      grammar_topic: null,
      scores: { grammar: 88, naturalness: 85, relevance: 90, fluency: 76, overall: 85 },
    },
  ],
  de: [
    {
      reply: 'Sehr gute Wahl! Ein Kaffee und ein Croissant — gerne. Möchten Sie sonst noch etwas?',
      translation: 'Very good choice! A coffee and a croissant — gladly. Would you like anything else?',
      corrections: "Almost perfect! One nuance: at a German counter you'd more often hear <s>ich hätte gern einen Kaffee</s> <mark>ich nehme einen Kaffee</mark> — «ich nehme» is what people actually say. (Mock mode.)",
      native_alternative: '«Hallo, ich nehme einen Kaffee und ein Croissant, bitte!»',
      grammar_topic: null,
      scores: { grammar: 92, naturalness: 78, relevance: 95, fluency: 84, overall: 87 },
    },
    {
      reply: 'Ah, kein Glück! Auf dieser Strecke gibt es oft Verspätungen. Wo genau wollen Sie hin?',
      translation: 'Ah, bad luck! There are often delays on this route. Where exactly are you headed?',
      corrections: 'Very good! Your word order after «also» is exactly right. One rhythm note: a small pause after «Verspätungen» sounds natural. (Mock mode.)',
      native_alternative: '«Die Bahn hat mal wieder Verspätung, also warte ich hier.»',
      grammar_topic: null,
      scores: { grammar: 88, naturalness: 85, relevance: 90, fluency: 76, overall: 85 },
    },
  ],
  es: [
    {
      reply: '¡Muy buena elección! Un café con leche y un croissant, encantado. ¿Quiere algo más?',
      translation: 'Very good choice! A coffee with milk and a croissant, happy to help. Would you like anything else?',
      corrections: "Almost perfect! One nuance: at a Spanish bar you'd more often hear <s>quiero un café</s> <mark>ponme un café</mark> — «ponme» is what people actually say. (Mock mode.)",
      native_alternative: '«Buenos días, póngame un café con leche y un croissant, por favor.»',
      grammar_topic: null,
      scores: { grammar: 92, naturalness: 78, relevance: 95, fluency: 84, overall: 87 },
    },
    {
      reply: '¡Ah, qué mala suerte! En esta línea suele haber retrasos. ¿A dónde va exactamente?',
      translation: 'Ah, bad luck! There are often delays on this line. Where exactly are you headed?',
      corrections: 'Very good! Your connector «así que» is perfectly natural here. One rhythm note: a small pause after «retrasos» sounds native. (Mock mode.)',
      native_alternative: '«El tren va con retraso, así que espero aquí.»',
      grammar_topic: null,
      scores: { grammar: 88, naturalness: 85, relevance: 90, fluency: 76, overall: 85 },
    },
  ],
};

let mockIdx = 0;

// Rows for the active language, falling back to French (never to a crash).
const rows = (table) => table[contentLang()] || table.fr;

export function mockTurn() {
  const transcripts = rows(MOCK_TRANSCRIPTS);
  const replies = rows(MOCK_REPLIES);
  const transcript = transcripts[mockIdx % transcripts.length];
  const evaluation = replies[mockIdx % replies.length];
  mockIdx += 1;
  return { transcript, evaluation };
}

const MOCK_HINTS = {
  fr: [
    "Useful vocabulary: «l'addition» (the bill), «régler» (to pay), «une terrasse» (outdoor seating).",
    "Start with: «Excusez-moi, est-ce que je pourrais…»",
    "«Excusez-moi, est-ce que je pourrais avoir l'addition, s'il vous plaît ?» — Excuse me, could I have the bill, please?",
  ],
  de: [
    'Useful vocabulary: «die Rechnung» (the bill), «zahlen» (to pay), «die Terrasse» (outdoor seating).',
    'Start with: «Entschuldigung, könnte ich bitte…»',
    '«Entschuldigung, könnte ich bitte die Rechnung haben?» — Excuse me, could I have the bill, please?',
  ],
  es: [
    'Useful vocabulary: «la cuenta» (the bill), «pagar» (to pay), «la terraza» (outdoor seating).',
    'Start with: «Disculpe, ¿podría…?»',
    '«Disculpe, ¿me trae la cuenta, por favor?» — Excuse me, could you bring me the bill, please?',
  ],
};

export function mockHint(level) {
  return rows(MOCK_HINTS)[level - 1] || 'Try answering simply, one idea at a time.';
}

export function mockSentenceCheck() {
  const feedback = {
    fr: "Nice! That's a natural use of the expression. (Mock mode — enable a real API key for genuine feedback.)",
    de: "Nice! That reads naturally. (Mock mode — enable a real API key for genuine feedback.)",
    es: "Nice! That reads naturally. (Mock mode — enable a real API key for genuine feedback.)",
  };
  return { correct: true, feedback: rows({ fr: feedback.fr, de: feedback.de, es: feedback.es }) };
}

export function mockAccentFeedback() {
  return {
    fr: "Good rhythm overall. The recognizer stumbled on «voudrais» — make sure the French r comes from the back of the throat, and round your lips tightly for the u in «du». (Mock mode — add a real API key for genuine accent analysis.)",
    de: "Good rhythm overall. Watch the umlauts: round your lips firmly for «ö» and «ü», and keep final -er light («besser»). (Mock mode — add a real API key for genuine accent analysis.)",
    es: "Good rhythm overall. Keep the vowels crisp and short — Spanish vowels never glide — and roll the rr in «perro» with a light tap for single r. (Mock mode — add a real API key for genuine accent analysis.)",
  }[contentLang()] || "Good rhythm overall. (Mock mode — add a real API key for genuine accent analysis.)";
}

export function mockWritingFeedback(depth) {
  const essay = depth === 'essay';
  const byLang = {
    fr: {
      corrections: "Nice work overall. One slip: <s>je suis allé au la plage</s> <mark>je suis allé à la plage</mark> — «à + la» never contracts. (Mock mode.)",
      strengths: ['Good use of the passé composé («je suis allé»).', 'Clear, simple sentence rhythm.'],
      suggestions: essay
        ? ['Add connectors between paragraphs («d\'abord», «ensuite», «enfin»).', 'Vary sentence openings — three sentences start with «je».']
        : ['Try one sentence with «qui» or «que» next time.'],
    },
    de: {
      corrections: 'Nice work overall. One slip: <s>ich bin gegangen zu dem Bahnhof</s> <mark>ich bin zum Bahnhof gegangen</mark> — the verb bracket comes last. (Mock mode.)',
      strengths: ['Good verb-final order in subordinate clauses.', 'Clear, simple sentence rhythm.'],
      suggestions: essay
        ? ['Add connectors between paragraphs («zuerst», «dann», «schließlich»).', 'Vary sentence openings — three sentences start with «ich».']
        : ['Try one sentence with a subordinate clause («weil», «dass») next time.'],
    },
    es: {
      corrections: 'Nice work overall. One slip: <s>fui a la playa el semana pasada</s> <mark>fui a la playa la semana pasada</mark> — «semana» is feminine. (Mock mode.)',
      strengths: ['Good use of the preterite («fui»).', 'Clear, simple sentence rhythm.'],
      suggestions: essay
        ? ['Add connectors between paragraphs («primero», «luego», «por último»).', 'Vary sentence openings — three sentences start with «yo».']
        : ['Try one sentence with a subjunctive trigger («espero que…») next time.'],
    },
  };
  const picked = byLang[contentLang()] || byLang.fr;
  return {
    ...picked,
    scores: essay
      ? { grammar: 82, vocabulary: 76, structure: 70, overall: 76 }
      : { grammar: 84, vocabulary: 78, overall: 81 },
  };
}

export function mockCompletion() {
  const feedback = {
    fr: "Natural and correct — «Si j'avais le temps, je voyagerais plus» is exactly right. (Mock mode.)",
    de: "Natural and correct — «Wenn ich Zeit hätte, würde ich mehr reisen» is exactly right. (Mock mode.)",
    es: "Natural and correct — «Si tuviera tiempo, viajaría más» is exactly right. (Mock mode.)",
  };
  return { natural: true, feedback: feedback[contentLang()] || feedback.fr };
}

export function mockTutorReply(question) {
  const replies = {
    fr: `Great question! Here's the short version.\n\nIn French, **le passé composé** is used for completed actions: «J'ai mangé une pomme.» (I ate an apple.) The **imparfait** paints the background: «Il pleuvait quand je suis sorti.» (It was raining when I went out.)\n\nA good rule of thumb: if you could answer "what happened?", use passé composé; if you're answering "what was it like?", use imparfait.\n\n*(Mock mode — add a real API key for a genuine tutor. You asked: «${question.slice(0, 60)}»)*`,
    de: `Great question! Here's the short version.\n\nIn German, the **Perfekt** covers everyday completed actions: «Ich habe einen Apfel gegessen.» (I ate an apple.) The **Präteritum** is the written/narrated form: «Es regnete, als ich ausging.» (It was raining when I went out.)\n\nA good rule of thumb: in speech use Perfekt with «haben/sein»; in stories and news, expect Präteritum.\n\n*(Mock mode — add a real API key for a genuine tutor. You asked: «${question.slice(0, 60)}»)*`,
    es: `Great question! Here's the short version.\n\nIn Spanish, the **pretérito indefinido** is used for completed actions: «Comí una manzana.» (I ate an apple.) The **pretérito imperfecto** paints the background: «Llovía cuando salí.» (It was raining when I went out.)\n\nA good rule of thumb: if you could answer "what happened?", use indefinido; if you're answering "what was it like?", use imperfecto.\n\n*(Mock mode — add a real API key for a genuine tutor. You asked: «${question.slice(0, 60)}»)*`,
  };
  return replies[contentLang()] || replies.fr;
}

export function mockTranslation(direction) {
  const pairs = {
    fr: direction === 'fr-en'
      ? 'I would like to book a table for two people, please. (Mock mode.)'
      : "Je voudrais réserver une table pour deux personnes, s'il vous plaît. (Mode démo.)",
    de: direction === 'fr-en'
      ? 'I would like to book a table for two people, please. (Mock mode.)'
      : 'Ich möchte einen Tisch für zwei Personen reservieren, bitte. (Demo-Modus.)',
    es: direction === 'fr-en'
      ? 'I would like to book a table for two people, please. (Mock mode.)'
      : 'Quisiera reservar una mesa para dos personas, por favor. (Modo demo.)',
  };
  return pairs[contentLang()] || pairs.fr;
}

export function mockExercises() {
  return {
    fr: [
      { q: 'Je ___ au cinéma hier soir.', options: ['suis allé', 'ai allé', 'vais'], answer: 0, why: '«Aller» takes être in the passé composé.' },
      { q: 'Il faut que tu ___ tes devoirs.', options: ['fais', 'fasses', 'feras'], answer: 1, why: '«Il faut que» triggers the subjonctif.' },
      { q: "C'est la femme ___ j'ai rencontrée.", options: ['qui', 'que', 'dont'], answer: 1, why: '«Que» stands for the direct object of «rencontrer».' },
    ],
    de: [
      { q: 'Gestern ___ ich ins Kino.', options: ['bin gegangen', 'habe gegangen', 'gehe'], answer: 0, why: '«Gehen» takes «sein» in the Perfekt.' },
      { q: 'Es ist schade, dass du ___.', options: ['kommst', 'kommst nicht', 'kommst spät'], answer: 0, why: 'After «dass», the conjugated verb goes to the end.' },
      { q: 'Das ist der Mann, ___ ich kenne.', options: ['der', 'den', 'dem'], answer: 1, why: '«Den» is the accusative relative pronoun (direct object).' },
    ],
    es: [
      { q: 'Ayer ___ al cine.', options: ['fui', 'iba', 'voy'], answer: 0, why: 'A completed action yesterday takes the preterite «fui».' },
      { q: 'Espero que tú ___ mañana.', options: ['vienes', 'vengas', 'vendrás'], answer: 1, why: '«Espero que» triggers the subjunctive.' },
      { q: 'La mujer ___ conozco es profesora.', options: ['que', 'a quien', 'cuyo'], answer: 1, why: 'A specific person as direct object takes the personal «a» — «a quien».' },
    ],
  }[contentLang()] || [];
}

export function mockLesson() {
  const lessons = {
    fr: {
      title: 'Taming the subjonctif after «il faut que»',
      explanation: "Your recent sessions show hesitation after «il faut que». The rule: expressions of necessity, doubt and emotion push the next verb into the subjonctif. For regular verbs, take the ils-form stem and add -e, -es, -e, -ions, -iez, -ent: «il faut que tu parles», «il faut que nous finissions». (Mock mode.)",
    },
    de: {
      title: 'Word order after «weil» and «dass»',
      explanation: 'Your recent sessions show hesitation with subordinate clauses. The rule: after «weil» and «dass», the conjugated verb moves to the END: «…, weil ich müde bin», «…, dass du kommst». Main clause stays verb-second. (Mock mode.)',
    },
    es: {
      title: 'Subjunctive after expressions of wish',
      explanation: 'Your recent sessions show hesitation after wish expressions. The rule: «espero que», «quiero que» and «ojalá» push the next verb into the subjunctive: «espero que vengas», «quiero que estudies». Compare indicative «sé que vienes» — certainty, no shift. (Mock mode.)',
    },
  };
  const lesson = lessons[contentLang()] || lessons.fr;
  return { ...lesson, exercises: mockExercises() };
}

export function mockStory() {
  return {
    title: {
      fr: 'Le café du matin',
      de: 'Der Morgenkaffee',
      es: 'El café de la mañana',
    }[contentLang()] || 'Le café du matin',
    paragraphs: {
      fr: [
        { fr: 'Ce matin, Léa se lève tôt. Il fait beau et le soleil entre par la fenêtre.', en: 'This morning, Léa gets up early. The weather is nice and the sun comes through the window.' },
        { fr: 'Elle prend son petit-déjeuner : du pain, du fromage et un grand café.', en: 'She has her breakfast: some bread, some cheese and a big coffee.' },
        { fr: '« Aujourd’hui, je vais au marché », dit-elle. Elle a besoin de légumes et de fruits.', en: '“Today, I’m going to the market,” she says. She needs vegetables and fruit.' },
        { fr: 'Dans la rue, elle rencontre un ami. Ils parlent un peu, puis ils continuent leur chemin. (Mock mode.)', en: 'In the street, she meets a friend. They talk a little, then they carry on their way. (Mock mode.)' },
      ],
      de: [
        { fr: 'Heute Morgen steht Léa früh auf. Das Wetter ist schön und die Sonne kommt durchs Fenster.', en: 'This morning, Léa gets up early. The weather is nice and the sun comes through the window.' },
        { fr: 'Sie frühstückt: Brot, Käse und einen großen Kaffee.', en: 'She has her breakfast: some bread, some cheese and a big coffee.' },
        { fr: '„Heute gehe ich zum Markt“, sagt sie. Sie braucht Gemüse und Obst.', en: '“Today, I’m going to the market,” she says. She needs vegetables and fruit.' },
        { fr: 'Auf der Straße trifft sie einen Freund. Sie sprechen ein wenig und gehen dann weiter. (Mock mode.)', en: 'In the street, she meets a friend. They talk a little, then they carry on their way. (Mock mode.)' },
      ],
      es: [
        { fr: 'Esta mañana, Léa se levanta temprano. Hace buen tiempo y el sol entra por la ventana.', en: 'This morning, Léa gets up early. The weather is nice and the sun comes through the window.' },
        { fr: 'Desayuna: pan, queso y un café grande.', en: 'She has her breakfast: some bread, some cheese and a big coffee.' },
        { fr: '«Hoy voy al mercado», dice. Necesita verduras y fruta.', en: '“Today, I’m going to the market,” she says. She needs vegetables and fruit.' },
        { fr: 'En la calle se encuentra con un amigo. Hablan un poco y luego siguen su camino. (Mock mode.)', en: 'In the street, she meets a friend. They talk a little, then they carry on their way. (Mock mode.)' },
      ],
    }[contentLang()] || [],
  };
}

export function mockSnapVocab() {
  const items = {
    fr: [
      { fr: 'la tasse', en: 'the cup', emoji: '☕' },
      { fr: 'le pain', en: 'the bread', emoji: '🍞' },
      { fr: 'le couteau', en: 'the knife', emoji: '🔪' },
      { fr: 'la fenêtre', en: 'the window', emoji: '🪟' },
      { fr: 'la fleur', en: 'the flower', emoji: '🌸' },
      { fr: 'le journal', en: 'the newspaper', emoji: '📰' },
    ],
    de: [
      { fr: 'die Tasse', en: 'the cup', emoji: '☕' },
      { fr: 'das Brot', en: 'the bread', emoji: '🍞' },
      { fr: 'das Messer', en: 'the knife', emoji: '🔪' },
      { fr: 'das Fenster', en: 'the window', emoji: '🪟' },
      { fr: 'die Blume', en: 'the flower', emoji: '🌸' },
      { fr: 'die Zeitung', en: 'the newspaper', emoji: '📰' },
    ],
    es: [
      { fr: 'la taza', en: 'the cup', emoji: '☕' },
      { fr: 'el pan', en: 'the bread', emoji: '🍞' },
      { fr: 'el cuchillo', en: 'the knife', emoji: '🔪' },
      { fr: 'la ventana', en: 'the window', emoji: '🪟' },
      { fr: 'la flor', en: 'the flower', emoji: '🌸' },
      { fr: 'el periódico', en: 'the newspaper', emoji: '📰' },
    ],
  };
  const captions = {
    fr: { caption: 'Une table de petit-déjeuner près de la fenêtre.', captionEn: 'A breakfast table by the window.' },
    de: { caption: 'Ein Frühstückstisch am Fenster.', captionEn: 'A breakfast table by the window.' },
    es: { caption: 'Una mesa de desayuno junto a la ventana.', captionEn: 'A breakfast table by the window.' },
  };
  const lang = contentLang();
  return { ...(captions[lang] || captions.fr), items: items[lang] || items.fr };
}

export function mockCharacterReply() {
  return {
    fr: "Ah, mon petit ! Quand j'avais ton âge, on faisait le pain nous-mêmes tous les dimanches. Et toi, tu sais cuisiner ?\n*Ah, my dear! When I was your age, we made bread ourselves every Sunday. And you, can you cook? (Mock mode.)*",
    de: 'Ach, mein Liebling! Als ich in deinem Alter war, haben wir jeden Sonntag selbst Brot gebacken. Und du, kannst du kochen?\n*Ah, my dear! When I was your age, we baked bread ourselves every Sunday. And you, can you cook? (Mock mode.)*',
    es: '¡Ay, cariño! Cuando yo tenía tu edad, hacíamos el pan nosotros mismos todos los domingos. ¿Y tú, sabes cocinar?\n*Ah, my dear! When I was your age, we made bread ourselves every Sunday. And you, can you cook? (Mock mode.)*',
  }[contentLang()] || '';
}

export function mockExplanation() {
  return {
    fr: "The core rule here is agreement: in the passé composé with «être», the past participle agrees with the subject — «elle est allée», «ils sont partis». French keeps this marker because the participle behaves like an adjective after «être». Pattern to remember: DR & MRS VANDERTRAMP verbs take «être» and agree. Extra example: «Elles sont arrivées en retard.» — They (f.) arrived late. (Mock mode.)",
    de: 'The core rule here is the Perfekt bracket: the finite verb sits second («ich bin…», «ich habe…») and the participle closes the clause («…gegangen», «…gegessen»). Motion and state-change verbs take «sein»; everything else takes «haben». Extra example: «Wir sind gestern angekommen.» — We arrived yesterday. (Mock mode.)',
    es: 'The core rule here is the preterite of «ser/ir»: both conjugate identically («fui, fuiste, fue…»), so context decides the meaning. «Fui al mercado» = I went; «fue interesante» = it was. Extra example: «Fueron muy amables.» — They were very kind. (Mock mode.)',
  }[contentLang()] || '';
}

export function mockReport() {
  return {
    session_grade: 'B+',
    average_scores: { grammar: 87, naturalness: 79, relevance: 91, fluency: 78, overall: 84 },
    strengths: {
      fr: [
        'Confident use of polite request forms («je voudrais», «est-ce que je pourrais»).',
        'Good situational vocabulary — «colis», «en retard» used correctly.',
      ],
      de: [
        'Confident use of polite request forms («ich hätte gern», «könnten Sie»).',
        'Good situational vocabulary — «Paket», «Verspätung» used correctly.',
      ],
      es: [
        'Confident use of polite request forms («quisiera», «¿podría?»).',
        'Good situational vocabulary — «paquete», «retraso» used correctly.',
      ],
    }[contentLang()] || [],
    stubborn_habits: {
      fr: [
        'Literal translations of English idioms («je suis excité» patterns).',
        'Hesitation before numbers and times — practise saying prices aloud.',
      ],
      de: [
        'Dropping the verb to the end in «weil»-clauses.',
        'Hesitation before numbers and times — practise saying prices aloud.',
      ],
      es: [
        'Mixing ser/estar with temporary states.',
        'Hesitation before numbers and times — practise saying prices aloud.',
      ],
    }[contentLang()] || [],
    tomorrow_focus: {
      fr: "Practise the subjonctif after «il faut que» and drop three conversational fillers (du coup, en fait, bref) into your replies.",
      de: 'Practise subordinate-clause word order (weil/dass → verb last) and drop three conversational fillers (also, genau, ehrlich gesagt) into your replies.',
      es: 'Practise the subjunctive after «espero que» and drop three conversational fillers (pues, o sea, en fin) into your replies.',
    }[contentLang()] || 'Practise one new connector tomorrow.',
  };
}
