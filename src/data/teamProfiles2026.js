// ---------------------------------------------------------------------------
// Holdprofiler 2026 — primær disciplin, forventede HOVEDNAVNE (stjerner) og det
// primære mål pr. hold (slået op på holdkode). MANUELT kurateret. Det er IKKE
// den fulde startliste (den hentes live fra TV2 til `riders`), men holdets
// profil og de navne man skal holde øje med. Når den officielle startliste er
// udtaget, markeres disse hovednavne med ⭐ i rytterlisten (matchet på navn).
// ---------------------------------------------------------------------------

export const TEAM_PROFILES = {
  UEX: { profile: 'Klassement', stars: [{ name: 'Tadej Pogačar', note: 'storfavorit' }], goal: 'Pogačar vinder Tour — rekord-femte sejr' },
  TVL: { profile: 'Klassement & etaper', stars: [{ name: 'Jonas Vingegaard', note: 'klassementsudfordrer' }], goal: 'Vingegaard vinder samlet — sin tredje' },
  RBH: { profile: 'Klassement & etaper', stars: [{ name: 'Remco Evenepoel' }, { name: 'Florian Lipowitz' }], goal: 'Evenepoel + Lipowitz på podiet' },
  NCI: { profile: 'Klassement & etaper', stars: [{ name: 'Carlos Rodríguez' }, { name: 'Kévin Vauquelin' }] },
  SOQ: { profile: 'Klassement & massespurt', stars: [{ name: 'Tim Merlier' }, { name: 'Mikel Landa' }], goal: 'Etapesejre via Merlier' },
  LTK: { profile: 'Klassement & klassikere', stars: [{ name: 'Juan Ayuso', note: 'GC' }, { name: 'Mads Pedersen' }], goal: 'Ayuso på podiet + Pedersen vinder grøn trøje' },
  DCT: { profile: 'Klassement & ungdom', stars: [{ name: 'Paul Seixas', note: 'Tour-debut, GC' }], goal: 'Seixas top 5 samlet i Tour-debut' },
  MOV: { profile: 'Klassement', stars: [{ name: 'Cian Uijtdebroeks', note: 'GC' }] },
  JAY: { profile: 'Klassement & massespurt', stars: [{ name: "Ben O'Connor" }, { name: 'Michael Matthews' }] },
  TBV: { profile: 'Klassement & etaper', stars: [{ name: 'Antonio Tiberi' }, { name: 'Lenny Martínez' }], goal: 'Tiberi / Martínez top 10' },
  TPP: { profile: 'Klassement & etaper', stars: [{ name: 'Oscar Onley' }] },
  EFE: { profile: 'Etaper & klassikere', stars: [{ name: 'Richard Carapaz' }, { name: 'Ben Healy' }] },
  GFC: { profile: 'Etaper & ungdom', stars: [{ name: 'David Gaudu' }, { name: 'Romain Grégoire' }] },
  UXM: { profile: 'Etaper & udbrydere', stars: [{ name: 'Tobias Halland Johannessen' }], goal: 'Halland Johannessen top 10 samlet' },
  APT: { profile: 'Massespurter', stars: [{ name: 'Mathieu van der Poel' }, { name: 'Jasper Philipsen' }], goal: 'Etapesejre via Philipsen + Van der Poel' },
  COF: { profile: 'Etaper & klassikere', stars: [{ name: 'Ion Izagirre' }, { name: 'Alex Aranburu' }] },
  XAT: { profile: 'Etaper & bjerge', stars: [{ name: 'Harold Tejada', note: 'klassement' }] },
  LOI: { profile: 'Massespurter & etaper', stars: [{ name: 'Arnaud De Lie' }, { name: 'Lennert Van Eetvelt' }] },
  NSN: { profile: 'Massespurter & etaper', stars: [{ name: 'Biniam Girmay' }], goal: 'Etapesejr til Girmay' },
  TUD: { profile: 'Udbrydere & etaper', stars: [{ name: 'Julian Alaphilippe' }, { name: 'Michael Storer' }, { name: 'Matteo Trentin' }], goal: 'Etapesejr (Alaphilippe-faktor)' },
  TEN: { profile: 'Udbrydere', stars: [{ name: 'Jordan Jegat' }, { name: 'Anthony Turgis' }] },
  PQT: { profile: 'Kuperede etaper & udbrydere', stars: [{ name: 'Tom Pidcock', note: 'Tour-debut' }], goal: 'Pidcock leverer i Tour-debut' },
  CJR: { profile: 'Udbrydere & bjerge', stars: [{ name: 'Pablo Castrillo' }, { name: 'Orluis Aular' }] },
};

/** Normalisér et rytternavn til matchning (små bogstaver, uden accenter). */
export function normRiderName(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Slå holdets profil op via holdkode. Returnerer { profile, stars, goal? } eller null. */
export function teamProfile(code) {
  return (code && TEAM_PROFILES[code]) || null;
}
