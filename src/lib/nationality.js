// Mapping fra football-data.org's engelske nationalitets-navne til ISO 3166-1
// alpha-2 (til rigtige flag via flagcdn). Spiller-nationalitet kommer som fuldt
// engelsk landenavn ("Norway", "Germany"), ikke som FIFA-kode.

const NATIONALITY_ISO = {
  // Europa
  'England': 'gb-eng', 'Scotland': 'gb-sct', 'Wales': 'gb-wls', 'Northern Ireland': 'gb-nir',
  'Germany': 'de', 'France': 'fr', 'Spain': 'es', 'Portugal': 'pt', 'Italy': 'it',
  'Netherlands': 'nl', 'Belgium': 'be', 'Croatia': 'hr', 'Denmark': 'dk', 'Sweden': 'se',
  'Norway': 'no', 'Finland': 'fi', 'Iceland': 'is', 'Poland': 'pl', 'Austria': 'at',
  'Switzerland': 'ch', 'Czech Republic': 'cz', 'Czechia': 'cz', 'Slovakia': 'sk',
  'Slovenia': 'si', 'Serbia': 'rs', 'Croatia ': 'hr', 'Hungary': 'hu', 'Romania': 'ro',
  'Bulgaria': 'bg', 'Greece': 'gr', 'Turkey': 'tr', 'Türkiye': 'tr', 'Ukraine': 'ua',
  'Russia': 'ru', 'Republic of Ireland': 'ie', 'Ireland': 'ie', 'Albania': 'al',
  'North Macedonia': 'mk', 'Bosnia-Herzegovina': 'ba', 'Bosnia and Herzegovina': 'ba',
  'Montenegro': 'me', 'Kosovo': 'xk', 'Georgia': 'ge', 'Armenia': 'am', 'Belarus': 'by',
  'Estonia': 'ee', 'Latvia': 'lv', 'Lithuania': 'lt', 'Luxembourg': 'lu', 'Cyprus': 'cy',
  'Israel': 'il',
  // Sydamerika
  'Brazil': 'br', 'Argentina': 'ar', 'Uruguay': 'uy', 'Colombia': 'co', 'Chile': 'cl',
  'Peru': 'pe', 'Paraguay': 'py', 'Ecuador': 'ec', 'Venezuela': 've', 'Bolivia': 'bo',
  // Nord-/Mellemamerika
  'United States': 'us', 'USA': 'us', 'Mexico': 'mx', 'Canada': 'ca', 'Costa Rica': 'cr',
  'Panama': 'pa', 'Honduras': 'hn', 'Jamaica': 'jm', 'Curaçao': 'cw', 'Haiti': 'ht',
  // Afrika
  'Morocco': 'ma', 'Senegal': 'sn', 'Nigeria': 'ng', 'Egypt': 'eg', 'Algeria': 'dz',
  'Tunisia': 'tn', 'Cameroon': 'cm', 'Ghana': 'gh', 'Ivory Coast': 'ci', "Cote d'Ivoire": 'ci',
  'Mali': 'ml', 'Senegal ': 'sn', 'South Africa': 'za', 'DR Congo': 'cd',
  'Congo DR': 'cd', 'Congo': 'cg', 'Guinea': 'gn', 'Burkina Faso': 'bf', 'Gabon': 'ga',
  'Cape Verde': 'cv', 'Zambia': 'zm', 'Angola': 'ao', 'Kenya': 'ke', 'Togo': 'tg',
  'Benin': 'bj', 'Mozambique': 'mz', 'Zimbabwe': 'zw',
  // Asien/Oceanien
  'Japan': 'jp', 'South Korea': 'kr', 'Korea Republic': 'kr', 'Australia': 'au',
  'Iran': 'ir', 'Saudi Arabia': 'sa', 'Qatar': 'qa', 'Iraq': 'iq', 'United Arab Emirates': 'ae',
  'China': 'cn', 'China PR': 'cn', 'Uzbekistan': 'uz', 'Jordan': 'jo', 'New Zealand': 'nz',
};

/** ISO 3166-1 alpha-2 (eller flagcdn-region) for et engelsk nationalitets-navn, ellers null. */
export function nationalityIso(name) {
  if (!name || typeof name !== 'string') return null;
  return NATIONALITY_ISO[name.trim()] ?? null;
}

/** flagcdn-URL for en nationalitet, eller null hvis ukendt. w = bredde i px. */
export function nationalityFlagUrl(name, w = 20) {
  const iso = nationalityIso(name);
  return iso ? `https://flagcdn.com/w${w}/${iso}.png` : null;
}
