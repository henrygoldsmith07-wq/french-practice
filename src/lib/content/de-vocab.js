// German vocabulary packs — split from de.js so eager scenario
// imports do not drag the whole pack library into the first bundle.

const w = (id, fr, en, emoji, freq, example, exampleEn, extra = {}) =>
  ({ id, fr, en, emoji, freq, example, exampleEn, syn: [], ant: [], coll: [], note: '', ...extra });

export const DE_VOCAB_PACKS = [
  {
    id: 'de-basics', title: 'Greetings & Basics', description: 'The words you need in the first five minutes.',
    entries: [
      w('de-hallo', 'hallo', 'hello', '👋', 1, 'Hallo, wie geht es dir?', 'Hello, how are you?'),
      w('de-danke', 'danke', 'thank you', '🙏', 1, 'Danke für deine Hilfe!', 'Thanks for your help!'),
      w('de-bitte', 'bitte', 'please / you’re welcome', '🤲', 1, 'Einen Kaffee, bitte.', 'A coffee, please.'),
      w('de-ja', 'ja', 'yes', '✅', 1, 'Ja, gern!', 'Yes, gladly!'),
      w('de-nein', 'nein', 'no', '❌', 1, 'Nein, danke.', 'No, thanks.'),
      w('de-tschuss', 'tschüss', 'bye', '👋', 1, 'Tschüss, bis morgen!', 'Bye, see you tomorrow!'),
      w('de-entschuldigung', 'die Entschuldigung', 'excuse me / sorry', '🙇', 2, 'Entschuldigung, wo ist der Bahnhof?', 'Excuse me, where is the station?'),
      w('de-gut', 'gut', 'good / well', '👍', 1, 'Mir geht es gut, danke.', 'I’m doing well, thanks.'),
    ],
  },
  {
    id: 'de-people', title: 'People & Pronouns', description: 'Talk about yourself and others.',
    entries: [
      w('de-ich', 'ich', 'I', '🙋', 1, 'Ich heiße Anna.', 'My name is Anna.'),
      w('de-du', 'du', 'you (informal)', '👉', 1, 'Woher kommst du?', 'Where are you from?'),
      w('de-sie', 'Sie', 'you (formal)', '🎩', 1, 'Können Sie mir helfen?', 'Can you help me?'),
      w('de-freund', 'der Freund', 'friend (m)', '🧑', 2, 'Er ist mein bester Freund.', 'He is my best friend.'),
      w('de-familie', 'die Familie', 'family', '👨‍👩‍👧', 2, 'Meine Familie wohnt in Berlin.', 'My family lives in Berlin.'),
      w('de-frau', 'die Frau', 'woman / wife', '👩', 1, 'Die Frau dort ist meine Chefin.', 'The woman over there is my boss.'),
      w('de-mann', 'der Mann', 'man / husband', '👨', 1, 'Der Mann liest eine Zeitung.', 'The man is reading a newspaper.'),
      w('de-kind', 'das Kind', 'child', '🧒', 2, 'Das Kind spielt im Park.', 'The child is playing in the park.'),
    ],
  },
  {
    id: 'de-food', title: 'Food & Café', description: 'Order, eat and drink with confidence.',
    entries: [
      w('de-wasser', 'das Wasser', 'water', '💧', 1, 'Ein Glas Wasser, bitte.', 'A glass of water, please.'),
      w('de-kaffee', 'der Kaffee', 'coffee', '☕', 2, 'Ich trinke gern Kaffee.', 'I like drinking coffee.'),
      w('de-brot', 'das Brot', 'bread', '🍞', 2, 'Das Brot ist noch warm.', 'The bread is still warm.'),
      w('de-bier', 'das Bier', 'beer', '🍺', 2, 'Zwei Bier, bitte!', 'Two beers, please!'),
      w('de-essen', 'das Essen', 'food / meal', '🍽️', 2, 'Das Essen schmeckt sehr gut.', 'The food tastes very good.'),
      w('de-rechnung', 'die Rechnung', 'the bill', '🧾', 3, 'Die Rechnung, bitte.', 'The bill, please.'),
      w('de-lecker', 'lecker', 'tasty', '😋', 3, 'Der Kuchen ist lecker!', 'The cake is tasty!'),
      w('de-hunger', 'der Hunger', 'hunger', '🤤', 3, 'Ich habe Hunger.', 'I’m hungry.'),
    ],
  },
  {
    id: 'de-travel', title: 'Travel & Getting Around', description: 'Stations, tickets and directions.',
    entries: [
      w('de-bahnhof', 'der Bahnhof', 'train station', '🚉', 2, 'Der Bahnhof ist gleich um die Ecke.', 'The station is just around the corner.'),
      w('de-zug', 'der Zug', 'train', '🚆', 2, 'Der Zug hat Verspätung.', 'The train is delayed.'),
      w('de-fahrkarte', 'die Fahrkarte', 'ticket', '🎫', 3, 'Ich möchte eine Fahrkarte nach München.', 'I’d like a ticket to Munich.'),
      w('de-links', 'links', 'left', '⬅️', 2, 'Gehen Sie nach links.', 'Go to the left.'),
      w('de-rechts', 'rechts', 'right', '➡️', 2, 'Die Bank ist rechts.', 'The bank is on the right.'),
      w('de-geradeaus', 'geradeaus', 'straight ahead', '⬆️', 3, 'Immer geradeaus, dann links.', 'Straight ahead, then left.'),
      w('de-flughafen', 'der Flughafen', 'airport', '✈️', 3, 'Wie komme ich zum Flughafen?', 'How do I get to the airport?'),
      w('de-karte', 'die Karte', 'map / card', '🗺️', 2, 'Hast du eine Karte der Stadt?', 'Do you have a map of the city?'),
    ],
  },
  {
    id: 'de-verbs', title: 'Everyday Verbs', description: 'The verbs you can’t speak without.',
    entries: [
      w('de-sein', 'sein', 'to be', '🫥', 1, 'Ich bin müde.', 'I am tired.', { note: 'ich bin, du bist, er ist …' }),
      w('de-haben', 'haben', 'to have', '🤲', 1, 'Hast du Zeit?', 'Do you have time?', { note: 'ich habe, du hast, er hat …' }),
      w('de-gehen', 'gehen', 'to go', '🚶', 1, 'Wir gehen ins Kino.', 'We’re going to the cinema.'),
      w('de-machen', 'machen', 'to do / make', '🔨', 1, 'Was machst du heute?', 'What are you doing today?'),
      w('de-kommen', 'kommen', 'to come', '👋', 1, 'Ich komme aus Spanien.', 'I come from Spain.'),
      w('de-wollen', 'wollen', 'to want', '🙏', 1, 'Ich will nach Hause.', 'I want to go home.'),
      w('de-koennen', 'können', 'can / to be able to', '💪', 1, 'Kannst du mir helfen?', 'Can you help me?'),
      w('de-sprechen', 'sprechen', 'to speak', '🗣️', 2, 'Sprechen Sie Englisch?', 'Do you speak English?'),
    ],
  },
  {
    id: 'de-time', title: 'Numbers & Time', description: 'Count, tell the time, make plans.',
    entries: [
      w('de-eins', 'eins', 'one', '1️⃣', 1, 'Ich hätte gern eins.', 'I’d like one.'),
      w('de-zwei', 'zwei', 'two', '2️⃣', 1, 'Zwei Kaffee, bitte.', 'Two coffees, please.'),
      w('de-drei', 'drei', 'three', '3️⃣', 1, 'In drei Minuten.', 'In three minutes.'),
      w('de-heute', 'heute', 'today', '📅', 1, 'Heute ist Montag.', 'Today is Monday.'),
      w('de-morgen', 'morgen', 'tomorrow / morning', '🌅', 2, 'Bis morgen!', 'See you tomorrow!'),
      w('de-jetzt', 'jetzt', 'now', '⏱️', 1, 'Wir müssen jetzt gehen.', 'We have to go now.'),
      w('de-uhr', 'die Uhr', 'clock / o’clock', '🕐', 2, 'Es ist drei Uhr.', 'It’s three o’clock.'),
      w('de-woche', 'die Woche', 'week', '🗓️', 2, 'Nächste Woche habe ich frei.', 'Next week I’m off.'),
    ],
  },
  {
    id: 'de-home', title: 'House & Home', description: 'Rooms, furniture and everyday spaces.',
    entries: [
      w('de-haus', 'das Haus', 'house', '🏠', 2, 'Unser Haus hat einen Garten.', 'Our house has a garden.'),
      w('de-wohnung', 'die Wohnung', 'flat / apartment', '🏢', 2, 'Ich suche eine neue Wohnung.', 'I’m looking for a new flat.'),
      w('de-kueche', 'die Küche', 'kitchen', '🍳', 2, 'Das Essen ist in der Küche.', 'The food is in the kitchen.'),
      w('de-zimmer', 'das Zimmer', 'room', '🚪', 2, 'Mein Zimmer ist im ersten Stock.', 'My room is on the first floor.'),
      w('de-bett', 'das Bett', 'bed', '🛏️', 2, 'Das Kind schläft im Bett.', 'The child is sleeping in bed.'),
      w('de-tisch', 'der Tisch', 'table', '🪑', 2, 'Das Buch liegt auf dem Tisch.', 'The book is on the table.'),
      w('de-fenster', 'das Fenster', 'window', '🪟', 2, 'Mach bitte das Fenster zu.', 'Please close the window.'),
      w('de-schluessel', 'der Schlüssel', 'key', '🔑', 3, 'Ich habe meinen Schlüssel verloren.', 'I’ve lost my key.'),
    ],
  },
  {
    id: 'de-body', title: 'Health & Body', description: 'Body parts and talking to a doctor.',
    entries: [
      w('de-kopf', 'der Kopf', 'head', '🧠', 2, 'Mein Kopf tut weh.', 'My head hurts.'),
      w('de-hand', 'die Hand', 'hand', '✋', 2, 'Gib mir die Hand.', 'Give me your hand.'),
      w('de-fuss', 'der Fuß', 'foot', '🦶', 2, 'Mein Fuß ist geschwollen.', 'My foot is swollen.'),
      w('de-auge', 'das Auge', 'eye', '👁️', 2, 'Sie hat blaue Augen.', 'She has blue eyes.'),
      w('de-krank', 'krank', 'ill / sick', '🤒', 2, 'Ich bin heute krank.', 'I’m ill today.'),
      w('de-arzt', 'der Arzt', 'doctor', '👨‍⚕️', 2, 'Ich muss zum Arzt.', 'I have to go to the doctor.'),
      w('de-schmerzen', 'die Schmerzen', 'pain', '💢', 3, 'Ich habe Schmerzen im Rücken.', 'I have pain in my back.'),
      w('de-gesund', 'gesund', 'healthy', '💪', 3, 'Obst ist gesund.', 'Fruit is healthy.'),
    ],
  },
  {
    id: 'de-weather', title: 'Nature & Weather', description: 'Talk about the sky and the seasons.',
    entries: [
      w('de-wetter', 'das Wetter', 'weather', '🌤️', 2, 'Wie ist das Wetter heute?', 'What’s the weather like today?'),
      w('de-sonne', 'die Sonne', 'sun', '☀️', 2, 'Die Sonne scheint.', 'The sun is shining.'),
      w('de-regen', 'der Regen', 'rain', '🌧️', 2, 'Bei Regen bleibe ich zu Hause.', 'When it rains I stay home.'),
      w('de-schnee', 'der Schnee', 'snow', '❄️', 3, 'Im Winter liegt viel Schnee.', 'In winter there’s a lot of snow.'),
      w('de-wind', 'der Wind', 'wind', '🌬️', 3, 'Heute weht ein kalter Wind.', 'A cold wind is blowing today.'),
      w('de-kalt', 'kalt', 'cold', '🥶', 1, 'Mir ist kalt.', 'I’m cold.'),
      w('de-warm', 'warm', 'warm', '🔥', 1, 'Es ist schön warm draußen.', 'It’s nice and warm outside.'),
      w('de-himmel', 'der Himmel', 'sky', '🌌', 3, 'Der Himmel ist blau.', 'The sky is blue.'),
    ],
  },
  {
    id: 'de-work', title: 'Work & Office', description: 'Get through the working day.',
    entries: [
      w('de-arbeit', 'die Arbeit', 'work / job', '💼', 2, 'Ich gehe zur Arbeit.', 'I’m going to work.'),
      w('de-buero', 'das Büro', 'office', '🏢', 2, 'Mein Büro ist im dritten Stock.', 'My office is on the third floor.'),
      w('de-chef', 'der Chef', 'boss', '👔', 2, 'Mein Chef ist sehr nett.', 'My boss is very nice.'),
      w('de-besprechung', 'die Besprechung', 'meeting', '📊', 3, 'Die Besprechung beginnt um zehn.', 'The meeting starts at ten.'),
      w('de-computer', 'der Computer', 'computer', '💻', 2, 'Mein Computer ist kaputt.', 'My computer is broken.'),
      w('de-email', 'die E-Mail', 'email', '📧', 2, 'Ich schicke dir eine E-Mail.', 'I’ll send you an email.'),
      w('de-kollege', 'der Kollege', 'colleague', '🧑‍💼', 3, 'Er ist ein guter Kollege.', 'He’s a good colleague.'),
      w('de-termin', 'der Termin', 'appointment', '📅', 3, 'Ich habe morgen einen Termin.', 'I have an appointment tomorrow.'),
    ],
  },
  {
    id: 'de-feelings', title: 'Feelings & Moods', description: 'Say how you really feel.',
    entries: [
      w('de-gluecklich', 'glücklich', 'happy', '😊', 2, 'Ich bin sehr glücklich.', 'I’m very happy.'),
      w('de-traurig', 'traurig', 'sad', '😢', 2, 'Warum bist du traurig?', 'Why are you sad?'),
      w('de-muede', 'müde', 'tired', '😴', 2, 'Ich bin heute sehr müde.', 'I’m very tired today.'),
      w('de-wuetend', 'wütend', 'angry', '😠', 3, 'Er ist wütend auf mich.', 'He’s angry with me.'),
      w('de-angst', 'die Angst', 'fear', '😨', 3, 'Ich habe Angst vor Hunden.', 'I’m afraid of dogs.'),
      w('de-liebe', 'die Liebe', 'love', '❤️', 2, 'Liebe ist stärker als alles.', 'Love is stronger than anything.'),
      w('de-froh', 'froh', 'glad', '🙂', 3, 'Ich bin froh, dich zu sehen.', 'I’m glad to see you.'),
      w('de-nervoes', 'nervös', 'nervous', '😰', 3, 'Vor der Prüfung bin ich nervös.', 'Before the exam I’m nervous.'),
    ],
  },
  {
    id: 'de-clothing', title: 'Clothing & Colours', description: 'Get dressed and describe it.',
    entries: [
      w('de-kleidung', 'die Kleidung', 'clothing', '👕', 2, 'Ich kaufe neue Kleidung.', 'I’m buying new clothes.'),
      w('de-hemd', 'das Hemd', 'shirt', '👔', 2, 'Das Hemd ist zu groß.', 'The shirt is too big.'),
      w('de-hose', 'die Hose', 'trousers', '👖', 2, 'Die Hose passt perfekt.', 'The trousers fit perfectly.'),
      w('de-schuhe', 'die Schuhe', 'shoes', '👟', 2, 'Deine Schuhe sind schön.', 'Your shoes are nice.'),
      w('de-rot', 'rot', 'red', '🔴', 1, 'Ich mag das rote Kleid.', 'I like the red dress.'),
      w('de-blau', 'blau', 'blue', '🔵', 1, 'Die Jacke ist blau.', 'The jacket is blue.'),
      w('de-gruen', 'grün', 'green', '🟢', 1, 'Das Gras ist grün.', 'The grass is green.'),
      w('de-schwarz', 'schwarz', 'black', '⚫', 1, 'Er trägt einen schwarzen Mantel.', 'He’s wearing a black coat.'),
    ],
  },
  {
    id: 'de-shopping', title: 'Shopping & Money', description: 'Buy, pay and haggle.',
    entries: [
      w('de-geld', 'das Geld', 'money', '💶', 2, 'Ich habe kein Geld dabei.', 'I don’t have any money on me.'),
      w('de-kaufen', 'kaufen', 'to buy', '🛒', 2, 'Ich möchte Brot kaufen.', 'I’d like to buy bread.'),
      w('de-teuer', 'teuer', 'expensive', '💸', 2, 'Das ist zu teuer.', 'That’s too expensive.'),
      w('de-billig', 'billig', 'cheap', '🏷️', 3, 'Das Hemd war sehr billig.', 'The shirt was very cheap.'),
      w('de-preis', 'der Preis', 'price', '🔖', 2, 'Wie ist der Preis?', 'What’s the price?'),
      w('de-geschaeft', 'das Geschäft', 'shop', '🏬', 2, 'Das Geschäft öffnet um neun.', 'The shop opens at nine.'),
      w('de-bezahlen', 'bezahlen', 'to pay', '💳', 2, 'Kann ich mit Karte bezahlen?', 'Can I pay by card?'),
      w('de-kasse', 'die Kasse', 'checkout / till', '🧾', 3, 'Bitte zahlen Sie an der Kasse.', 'Please pay at the till.'),
    ],
  },
  {
    id: 'de-adjectives', title: 'Everyday Adjectives', description: 'Describe almost anything.',
    entries: [
      w('de-gross', 'groß', 'big / tall', '🔼', 1, 'Das ist ein großes Haus.', 'That’s a big house.'),
      w('de-klein', 'klein', 'small', '🔽', 1, 'Ein kleiner Hund.', 'A small dog.'),
      w('de-neu', 'neu', 'new', '✨', 1, 'Ich habe ein neues Handy.', 'I have a new phone.'),
      w('de-alt', 'alt', 'old', '📜', 1, 'Das ist ein altes Auto.', 'That’s an old car.'),
      w('de-schoen', 'schön', 'beautiful / nice', '😍', 1, 'Was für ein schöner Tag!', 'What a beautiful day!'),
      w('de-schnell', 'schnell', 'fast', '⚡', 2, 'Der Zug ist sehr schnell.', 'The train is very fast.'),
      w('de-langsam', 'langsam', 'slow', '🐌', 2, 'Fahr bitte langsam.', 'Please drive slowly.'),
      w('de-wichtig', 'wichtig', 'important', '❗', 2, 'Das ist sehr wichtig.', 'That’s very important.'),
    ],
  },
  {
    id: 'de-questions', title: 'Question Words', description: 'Ask anything you need.',
    entries: [
      w('de-wer', 'wer', 'who', '🙋', 1, 'Wer ist das?', 'Who is that?'),
      w('de-was', 'was', 'what', '❓', 1, 'Was machst du?', 'What are you doing?'),
      w('de-wo', 'wo', 'where', '📍', 1, 'Wo wohnst du?', 'Where do you live?'),
      w('de-wann', 'wann', 'when', '🕐', 1, 'Wann kommst du?', 'When are you coming?'),
      w('de-warum', 'warum', 'why', '🤔', 1, 'Warum lachst du?', 'Why are you laughing?'),
      w('de-wie', 'wie', 'how', '🔧', 1, 'Wie geht es dir?', 'How are you?'),
      w('de-welcher', 'welcher', 'which', '🔀', 2, 'Welcher Zug fährt nach Köln?', 'Which train goes to Cologne?'),
      w('de-wieviel', 'wie viel', 'how much / many', '🔢', 2, 'Wie viel kostet das?', 'How much does that cost?'),
    ],
  },
  {
    id: 'de-connectors', title: 'Connectors & Discourse', description: 'Link ideas and sound fluent.',
    entries: [
      w('de-und', 'und', 'and', '➕', 1, 'Brot und Käse.', 'Bread and cheese.'),
      w('de-aber', 'aber', 'but', '↔️', 1, 'Ich will, aber ich kann nicht.', 'I want to, but I can’t.'),
      w('de-weil', 'weil', 'because', '💡', 1, 'Ich bleibe, weil es regnet.', 'I’m staying because it’s raining.'),
      w('de-also', 'also', 'so / well', '🗨️', 2, 'Also, was machen wir jetzt?', 'So, what do we do now?'),
      w('de-deshalb', 'deshalb', 'therefore', '➡️', 2, 'Es war spät, deshalb ging ich.', 'It was late, so I left.'),
      w('de-trotzdem', 'trotzdem', 'nevertheless', '🔁', 3, 'Es regnete; trotzdem gingen wir.', 'It was raining; we went anyway.'),
      w('de-zuerst', 'zuerst', 'first', '1️⃣', 2, 'Zuerst essen wir, dann gehen wir.', 'First we eat, then we go.'),
      w('de-dann', 'dann', 'then', '⏭️', 1, 'Erst die Arbeit, dann das Vergnügen.', 'Work first, then pleasure.'),
    ],
  },
  {
    id: 'de-animals', title: 'Animals', description: 'Pets, farm and wild animals.',
    entries: [
      w('de-hund', 'der Hund', 'dog', '🐕', 2, 'Der Hund bellt laut.', 'The dog is barking loudly.'),
      w('de-katze', 'die Katze', 'cat', '🐈', 2, 'Die Katze schläft auf dem Sofa.', 'The cat is sleeping on the sofa.'),
      w('de-vogel', 'der Vogel', 'bird', '🐦', 2, 'Ein Vogel singt im Baum.', 'A bird is singing in the tree.'),
      w('de-pferd', 'das Pferd', 'horse', '🐎', 3, 'Das Pferd läuft schnell.', 'The horse runs fast.'),
      w('de-fisch', 'der Fisch', 'fish', '🐟', 2, 'Wir essen heute Fisch.', 'We’re eating fish today.'),
      w('de-kuh', 'die Kuh', 'cow', '🐄', 3, 'Die Kuh gibt Milch.', 'The cow gives milk.'),
      w('de-tier', 'das Tier', 'animal', '🐾', 2, 'Mein Lieblingstier ist der Elefant.', 'My favourite animal is the elephant.'),
      w('de-baer', 'der Bär', 'bear', '🐻', 3, 'Im Wald leben Bären.', 'Bears live in the forest.'),
    ],
  },
  {
    id: 'de-nature', title: 'Nature & Outdoors', description: 'Trees, mountains and the sea.',
    entries: [
      w('de-baum', 'der Baum', 'tree', '🌳', 2, 'Der Baum ist sehr alt.', 'The tree is very old.'),
      w('de-blume', 'die Blume', 'flower', '🌸', 2, 'Ich schenke dir eine Blume.', 'I’m giving you a flower.'),
      w('de-berg', 'der Berg', 'mountain', '⛰️', 2, 'Wir wandern auf den Berg.', 'We’re hiking up the mountain.'),
      w('de-see', 'der See', 'lake', '🏞️', 3, 'Der See ist heute ruhig.', 'The lake is calm today.'),
      w('de-meer', 'das Meer', 'sea', '🌊', 2, 'Im Sommer fahren wir ans Meer.', 'In summer we go to the sea.'),
      w('de-wald', 'der Wald', 'forest', '🌲', 2, 'Der Wald ist grün und still.', 'The forest is green and quiet.'),
      w('de-fluss', 'der Fluss', 'river', '🏞️', 3, 'Der Fluss fließt durch die Stadt.', 'The river flows through the city.'),
      w('de-natur', 'die Natur', 'nature', '🍃', 2, 'Ich liebe die Natur.', 'I love nature.'),
    ],
  },
  // ── Second wave ───────────────────────────────────────────────────────────
  // The packs above cover topics; these cover the GRAMMAR-BEARING core —
  // verbs, modals and prepositions — which is what a learner actually needs to
  // build a sentence. Verbs and prepositions are the backbone of the Speak and
  // Repair stages, so they get their own packs rather than eight nouns.
  {
    id: 'de-family', title: 'Family & Relatives', description: 'The people at home.',
    entries: [
      w('de-eltern', 'die Eltern', 'parents', '👨‍👩‍👦', 2, 'Meine Eltern wohnen in Köln.', 'My parents live in Cologne.'),
      w('de-bruder', 'der Bruder', 'brother', '👦', 2, 'Mein Bruder spielt Fußball.', 'My brother plays football.'),
      w('de-schwester', 'die Schwester', 'sister', '👧', 2, 'Meine Schwester ist Lehrerin.', 'My sister is a teacher.'),
      w('de-sohn', 'der Sohn', 'son', '👶', 2, 'Ihr Sohn ist erst zwei Jahre alt.', 'Her son is only two years old.'),
      w('de-tochter', 'die Tochter', 'daughter', '👶', 2, 'Meine Tochter geht zur Schule.', 'My daughter goes to school.'),
      w('de-grossvater', 'der Großvater', 'grandfather', '👴', 3, 'Mein Großvater erzählt gern Geschichten.', 'My grandfather likes telling stories.'),
      w('de-enkel', 'der Enkel', 'grandchild', '🧒', 3, 'Mein Enkel besucht uns im Sommer.', 'My grandchild visits us in summer.'),
      w('de-cousin', 'der Cousin', 'cousin (m)', '👬', 3, 'Mein Cousin wohnt in Wien.', 'My cousin lives in Vienna.'),
    ],
  },
  {
    // The `de-verbs` pack above already owns the eight highest-frequency
    // infinitives (sein, haben, machen, gehen, kommen, wollen, können,
    // sprechen), several with conjugation notes. This pack carries the NEXT
    // tier instead of restating them — a duplicate id here would silently
    // shadow one of those entries.
    id: 'de-more-verbs', title: 'More Everyday Verbs', description: 'The second tier of verbs you need.',
    entries: [
      w('de-sehen', 'sehen', 'to see', '👁️', 1, 'Ich sehe dich morgen.', 'I’ll see you tomorrow.'),
      w('de-geben', 'geben', 'to give', '🎁', 1, 'Gib mir bitte das Buch.', 'Please give me the book.'),
      w('de-nehmen', 'nehmen', 'to take', '🤏', 1, 'Nimm bitte einen Zug.', 'Take a train, please.'),
      w('de-finden', 'finden', 'to find', '🔎', 2, 'Ich finde meine Schlüssel nicht.', 'I can’t find my keys.'),
      w('de-wissen', 'wissen', 'to know (a fact)', '🧠', 1, 'Ich weiß die Antwort nicht.', 'I don’t know the answer.'),
      w('de-lesen', 'lesen', 'to read', '📖', 1, 'Ich lese jeden Abend die Zeitung.', 'I read the newspaper every evening.'),
      w('de-schreiben', 'schreiben', 'to write', '✍️', 1, 'Schreib mir bitte eine Nachricht.', 'Please write me a message.'),
      w('de-arbeiten', 'arbeiten', 'to work', '💼', 1, 'Ich arbeite von neun bis fünf.', 'I work from nine to five.'),
    ],
  },
  {
    // können and wollen live in `de-verbs` already; this is the rest of the
    // modal system plus the two verbs that behave like modals in practice.
    id: 'de-modals', title: 'Modals, Need & Belief', description: 'Obligation, permission and what you take for granted.',
    entries: [
      w('de-muessen', 'müssen', 'must / have to', '⚠️', 1, 'Du musst jetzt leider gehen.', 'Unfortunately you have to go now.'),
      w('de-sollen', 'sollen', 'should', '📌', 2, 'Du sollst das nicht sagen.', 'You shouldn’t say that.'),
      w('de-duerfen', 'dürfen', 'may / be allowed to', '✅', 2, 'Hier darf man nicht parken.', 'You may not park here.'),
      w('de-moechten', 'möchten', 'would like (polite)', '🌟', 1, 'Ich möchte bitte ein Zimmer.', 'I would like a room, please.'),
      w('de-moegen', 'mögen', 'to like', '❤️', 2, 'Ich mag Kaffee mit Milch.', 'I like coffee with milk.'),
      w('de-werden', 'werden', 'will (future)', '🔮', 2, 'Ich werde dich morgen anrufen.', 'I’ll call you tomorrow.'),
      w('de-brauchen', 'brauchen', 'to need', '🫱', 1, 'Ich brauche zwei Tage Zeit.', 'I need two days.'),
      w('de-glauben', 'glauben', 'to believe / think', '💭', 2, 'Ich glaube, du hast recht.', 'I think you’re right.'),
    ],
  },
  {
    id: 'de-prepositions', title: 'Prepositions', description: 'Two-letter words that carry the case.',
    entries: [
      w('de-prap-in', 'in', 'in', '📥', 1, 'Ich wohne in Köln.', 'I live in Cologne.'),
      w('de-prap-auf', 'auf', 'on / onto', '⬆️', 1, 'Der Schlüssel liegt auf dem Tisch.', 'The key is on the table.'),
      w('de-prap-bei', 'bei', 'at / near', '📍', 2, 'Ich wohne bei meiner Schwester.', 'I live near my sister.'),
      w('de-prap-mit', 'mit', 'with', '🤝', 1, 'Komm bitte mit mir.', 'Please come with me.'),
      w('de-prap-fuer', 'für', 'for', '🎯', 1, 'Das Geschenk ist für dich.', 'The present is for you.'),
      w('de-prap-ohne', 'ohne', 'without', '🚫', 2, 'Einen Kaffee ohne Zucker, bitte.', 'A coffee without sugar, please.'),
      w('de-prap-von', 'von', 'from / of', '↩️', 2, 'Das Buch ist von Anna.', 'The book is by Anna.'),
      w('de-prap-zu', 'zu', 'to (a person or place)', '➡️', 2, 'Ich gehe zu dem Arzt.', 'I’m going to the doctor.'),
    ],
  },
  {
    id: 'de-city', title: 'City & Places', description: 'Where things are, and where to ask.',
    entries: [
      w('de-stadt', 'die Stadt', 'city', '🏙️', 2, 'Die Stadt hat viele Kirchen.', 'The city has many churches.'),
      w('de-strasse', 'die Straße', 'street', '🛣️', 2, 'Ich wohne in dieser Straße.', 'I live on this street.'),
      w('de-platz', 'der Platz', 'square', '🌇', 3, 'Der Platz ist heute sehr voll.', 'The square is very busy today.'),
      w('de-kirche', 'die Kirche', 'church', '⛪', 3, 'Die Kirche ist alt.', 'The church is old.'),
      w('de-museum', 'das Museum', 'museum', '🏛️', 2, 'Das Museum ist montags geschlossen.', 'The museum is closed on Mondays.'),
      w('de-krankenhaus', 'das Krankenhaus', 'hospital', '🏥', 3, 'Das Krankenhaus ist weit weg.', 'The hospital is far away.'),
      w('de-markt', 'der Markt', 'market', '🧺', 2, 'Am Markt kaufe ich frisches Brot.', 'At the market I buy fresh bread.'),
      w('de-bruecke', 'die Brücke', 'bridge', '🌉', 3, 'Wir gehen über die Brücke.', 'We are going over the bridge.'),
    ],
  },
  {
    id: 'de-tech', title: 'Phone & Technology', description: 'Screens, messages and passwords.',
    entries: [
      w('de-handy', 'das Handy', 'mobile phone', '📱', 2, 'Mein Handy ist kaputt.', 'My phone is broken.'),
      w('de-laptop', 'der Laptop', 'laptop', '💻', 2, 'Ich arbeite am Laptop.', 'I work on my laptop.'),
      w('de-app', 'die App', 'app', '🧩', 2, 'Ich lade die App herunter.', 'I’m downloading the app.'),
      w('de-internet', 'das Internet', 'the internet', '🌐', 2, 'Im Internet lerne ich viel.', 'I learn a lot on the internet.'),
      w('de-nachricht', 'die Nachricht', 'message', '✉️', 2, 'Ich habe eine Nachricht bekommen.', 'I got a message.'),
      w('de-passwort', 'das Passwort', 'password', '🔑', 2, 'Ich habe mein Passwort vergessen.', 'I’ve forgotten my password.'),
      w('de-bildschirm', 'der Bildschirm', 'screen', '🖥️', 2, 'Der Bildschirm ist zu hell.', 'The screen is too bright.'),
      w('de-datei', 'die Datei', 'file', '📁', 3, 'Die Datei ist zu groß.', 'The file is too large.'),
    ],
  },
  {
    id: 'de-school', title: 'School & Study', description: 'Lessons, exams and timetables.',
    entries: [
      w('de-schule', 'die Schule', 'school', '🏫', 2, 'Die Schule beginnt um acht.', 'School starts at eight.'),
      w('de-lehrer', 'der Lehrer', 'teacher (m)', '🧑‍🏫', 2, 'Der Lehrer erklärt es noch einmal.', 'The teacher is explaining it once more.'),
      w('de-klasse', 'die Klasse', 'class', '👨‍🎓', 2, 'Die Klasse hat dreißig Schüler.', 'The class has thirty pupils.'),
      w('de-lernen', 'lernen', 'to learn / study', '📖', 1, 'Ich lerne jeden Tag ein Wort.', 'I learn a word every day.'),
      w('de-pruefung', 'die Prüfung', 'exam / test', '📝', 3, 'Die Prüfung war nicht schwer.', 'The exam was not difficult.'),
      w('de-hausaufgaben', 'die Hausaufgaben', 'homework', '📚', 3, 'Die Hausaufgaben sind heute schwer.', 'The homework is hard today.'),
      w('de-stundenplan', 'der Stundenplan', 'timetable', '🗓️', 3, 'Der Stundenplan ändert sich jedes Jahr.', 'The timetable changes every year.'),
      w('de-universitaet', 'die Universität', 'university', '🎓', 3, 'Die Universität ist in der Nähe.', 'The university is nearby.'),
    ],
  },
  {
    id: 'de-sports', title: 'Sport & Hobbies', description: 'What you do when nobody is testing you.',
    entries: [
      w('de-sport', 'der Sport', 'sport', '⚽', 2, 'Machen wir Sport am Wochenende?', 'Shall we play sport at the weekend?'),
      w('de-schwimmen', 'schwimmen', 'to swim', '🏊', 2, 'Im Sommer schwimme ich im See.', 'In summer I swim in the lake.'),
      w('de-hobby', 'das Hobby', 'hobby', '🎯', 2, 'Mein Hobby ist Fotografieren.', 'My hobby is photography.'),
      w('de-verein', 'der Verein', 'club / society', '⚽', 3, 'Er ist im Fußballverein.', 'He is in the football club.'),
      w('de-spiel', 'das Spiel', 'match / game', '🎮', 2, 'Das Spiel beginnt um acht.', 'The match starts at eight.'),
      w('de-piano', 'das Klavier', 'piano', '🎹', 2, 'Sie spielt sehr gut Klavier.', 'She plays piano very well.'),
      w('de-roman', 'der Roman', 'novel', '📕', 3, 'Ich lese gerade einen langen Roman.', 'I’m reading a long novel at the moment.'),
      w('de-musik', 'die Musik', 'music', '🎵', 2, 'Ich höre gern Musik beim Lernen.', 'I like listening to music while I study.'),
    ],
  },
  {
    id: 'de-politeness', title: 'Politeness & Phrases', description: 'The sentences that make you sound polite.',
    entries: [
      w('de-bitte-schoen', 'bitte schön', 'here you are / you’re welcome', '🙇', 2, '— Danke! — Bitte schön.', '— Thanks! — You’re welcome.'),
      w('de-gern', 'gern', 'gladly', '😌', 1, 'Ich trinke gern Tee.', 'I like drinking tea.'),
      w('de-tut-mir-leid', 'es tut mir leid', 'I’m sorry', '😔', 2, 'Es tut mir leid, ich habe es nicht gewusst.', 'I’m sorry, I didn’t know.'),
      w('de-kein-problem', 'kein Problem', 'no problem', '👌', 2, 'Kein Problem, ich warte gern.', 'No problem, I’m happy to wait.'),
      w('de-natuerlich', 'natürlich', 'of course', '🌿', 1, 'Natürlich, ich helfe dir gern.', 'Of course, I’m happy to help you.'),
      w('de-willkommen', 'herzlich willkommen', 'welcome (formal)', '🎉', 3, 'Herzlich willkommen in Berlin!', 'Welcome to Berlin!'),
      w('de-wie-geht-es-ihnen', 'wie geht es Ihnen?', 'how are you? (formal)', '🎩', 2, 'Guten Tag, wie geht es Ihnen?', 'Good day, how are you?'),
      w('de-stimmt', 'das stimmt', 'that’s right / that’s correct', '✅', 2, 'Ja, das stimmt.', 'Yes, that’s correct.'),
    ],
  },
  {
    // Termin and E-Mail are already taught in the tech pack; this is the
    // vocabulary of arranging and changing a plan.
    id: 'de-appointments', title: 'Calling & Appointments', description: 'Bookings, plans and rescheduling.',
    entries: [
      w('de-anrufen', 'anrufen', 'to call (phone)', '📞', 2, 'Ich rufe dich morgen an.', 'I’ll call you tomorrow.'),
      w('de-buchen', 'buchen', 'to book', '📝', 2, 'Ich möchte ein Zimmer buchen.', 'I’d like to book a room.'),
      w('de-vereinbaren', 'vereinbaren', 'to arrange (a time)', '🤝', 3, 'Wir müssen einen Termin vereinbaren.', 'We have to arrange a time.'),
      w('de-verschieben', 'verschieben', 'to postpone / move', '📆', 3, 'Können wir das auf morgen verschieben?', 'Can we move it to tomorrow?'),
      w('de-absagen', 'absagen', 'to cancel', '🚫', 2, 'Ich muss den Termin leider absagen.', 'Unfortunately I have to cancel.'),
      w('de-kalender', 'der Kalender', 'calendar', '📆', 2, 'Trage es bitte in den Kalender ein.', 'Please put it in the calendar.'),
      w('de-erreichen', 'erreichen', 'to reach / get hold of', '📬', 3, 'Ich bin heute nicht zu erreichen.', 'I can’t be reached today.'),
      w('de-durchrufen', 'durchrufen', 'to call back', '📲', 3, 'Ich rufe Sie später zurück.', 'I’ll call you back later.'),
    ],
  },
];

