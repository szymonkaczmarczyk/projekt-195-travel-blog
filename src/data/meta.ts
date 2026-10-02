export const site = {
  name: 'Projekt 195',
  claim: 'Złapać Świat',
  total: 195,
  started: 2012,
  next: { name: 'Bhutan', when: 'listopad 2026' },
  email: 'kontakt@projekt195.pl',
  description: 'Blog podróżniczy z misją odwiedzenia wszystkich 195 krajów świata. Krajobrazy, trasy i notatki z drogi.',
};

export const continents = [
  { key: 'europa', name: 'Europa', photo: 'ISL' },
  { key: 'azja', name: 'Azja', photo: 'KGZ' },
  { key: 'afryka', name: 'Afryka', photo: 'NAM' },
  { key: 'ameryka-polnocna', name: 'Ameryka Północna', photo: 'CAN' },
  { key: 'ameryka-poludniowa', name: 'Ameryka Południowa', photo: 'BOL' },
  { key: 'oceania', name: 'Oceania', photo: 'NZL' },
] as const;

export type ContinentKey = (typeof continents)[number]['key'];

export const collectionsMeta = [
  { key: 'najlepsze', name: 'Najlepsze', note: 'top 10, bez dyskusji', description: 'Dziesięć krajów, do których wróciłbym jutro. Kolejność jest przypadkowa, zachwyt nie.', photo: 'NZL' },
  { key: 'wyspy', name: 'Wyspiarskie', note: 'sól we włosach', description: 'Od Islandii po Fidżi. Kraje, do których prowadzi prom, mały samolot albo bardzo długi most.', photo: 'FJI' },
  { key: 'gory', name: 'Góry i wysoko', note: 'brak tlenu = zachwyt', description: 'Przełęcze, bazy pod szczytami i schroniska bez zasięgu. Tu zawsze najszybciej uciekają dni.', photo: 'NPL' },
  { key: 'pustynie', name: 'Pustynie', note: 'piasek w butach do dziś', description: 'Wydmy, solniska i kamienne doliny. Miejsca, w których cisza ma swoją fakturę.', photo: 'NAM' },
  { key: 'dzika-przyroda', name: 'Dzika przyroda', note: 'niecodzienne zwierzęta', description: 'Safari, goryle, lemury i jeden bardzo pewny siebie hipopotam.', photo: 'BWA' },
  { key: 'tropiki', name: 'Tropiki', note: 'wilgotność 98%', description: 'Dżungla, rafy, ryż i wodospady w kolorze, który wygląda na filtr.', photo: 'PHL' },
] as const;

export const nav = [
  { href: '/kraje/', label: 'Kraje' },
  { href: '/globus/', label: 'Globus' },
  { href: '/kolekcje/najlepsze/', label: 'Najlepsze' },
  { href: '/o-projekcie/', label: 'O projekcie' },
];

export const legal = [
  { href: '/polityka-prywatnosci/', label: 'Polityka prywatności' },
  { href: '/regulamin/', label: 'Regulamin' },
];
