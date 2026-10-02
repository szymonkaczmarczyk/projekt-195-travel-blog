import countries from 'world-countries';
import fs from 'node:fs';

const extra = new Set(['VAT', 'PSE']);
const names = {
  USA: 'Stany Zjednoczone', GBR: 'Wielka Brytania', CZE: 'Czechy', MKD: 'Macedonia Północna', BIH: 'Bośnia i Hercegowina',
  CPV: 'Republika Zielonego Przylądka', ARE: 'Zjednoczone Emiraty Arabskie', KOR: 'Korea Południowa', PRK: 'Korea Północna',
  COD: 'Demokratyczna Republika Konga', COG: 'Kongo', CAF: 'Republika Środkowoafrykańska', DOM: 'Dominikana',
  VAT: 'Watykan', PSE: 'Palestyna', FSM: 'Mikronezja', SWZ: 'Eswatini', CIV: 'Wybrzeże Kości Słoniowej', TLS: 'Timor Wschodni',
  MMR: 'Mjanma', CMR: 'Kamerun', SSD: 'Sudan Południowy', ZAF: 'Republika Południowej Afryki', STP: 'Wyspy Świętego Tomasza i Książęca', KNA: 'Saint Kitts i Nevis', VCT: 'Saint Vincent i Grenadyny', LCA: 'Saint Lucia',
};
const slugs = { ZAF: 'rpa', ARE: 'emiraty-arabskie', USA: 'usa' };
const continentOf = (c) => {
  if (c.region === 'Europe') return 'europa';
  if (c.region === 'Asia') return 'azja';
  if (c.region === 'Africa') return 'afryka';
  if (c.region === 'Oceania') return 'oceania';
  if (c.subregion === 'South America') return 'ameryka-poludniowa';
  return 'ameryka-polnocna';
};
const slugify = (s) => s.toLowerCase()
  .replace(/ł/g, 'l')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const list = countries
  .filter((c) => c.unMember || extra.has(c.cca3))
  .map((c) => {
    const name = names[c.cca3] ?? c.translations.pol.common;
    const [lat, lng] = c.capitalInfo?.latlng ?? c.latlng;
    return {
      code: c.cca3,
      iso2: c.cca2,
      ccn3: c.ccn3,
      slug: slugs[c.cca3] ?? slugify(name),
      name,
      nameEn: c.name.common,
      continent: continentOf(c),
      subregion: c.subregion,
      lat: +lat.toFixed(3),
      lng: +lng.toFixed(3),
      area: Math.round(c.area),
      flag: c.flag,
      landlocked: c.landlocked,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name, 'pl'));

fs.writeFileSync('src/data/countries.json', JSON.stringify(list, null, 1));
const by = {};
list.forEach((c) => (by[c.continent] = (by[c.continent] || 0) + 1));
console.log(list.length, by);
