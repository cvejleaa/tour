// ---------------------------------------------------------------------------
// Holdprofiler 2026 — primær disciplin + nøgleryttere pr. hold (slået op på
// holdkode). MANUELT kurateret; det er IKKE den fulde startliste (den tilføjes
// som `riders` på holdene når den offentliggøres), men holdets profil og de
// mest markante ryttere, så holdsiderne har indhold før løbsstart.
// ---------------------------------------------------------------------------

export const TEAM_PROFILES = {
  UEX: { profile: 'Klassement', riders: ['Tadej Pogačar', 'Adam Yates'] },
  TVL: { profile: 'Klassement & etaper', riders: ['Jonas Vingegaard', 'Sepp Kuss'] },
  RBH: { profile: 'Klassement & etaper', riders: ['Remco Evenepoel', 'Florian Lipowitz'] },
  NCI: { profile: 'Klassement & etaper', riders: ['Thomas Pidcock', 'Laurens De Plus'] },
  SOQ: { profile: 'Klassement & massespurt', riders: ['Julian Alaphilippe'] },
  LTK: { profile: 'Klassement & klassikere', riders: ['Mattias Skjelmose', 'Mads Pedersen'] },
  DCT: { profile: 'Klassement & ungdom', riders: ['Paul Seixas'] },
  MOV: { profile: 'Klassement', riders: ['Cian Uijtdebroeks'] },
  JAY: { profile: 'Klassement & massespurt', riders: ["Ben O'Connor", 'Michael Matthews'] },
  TBV: { profile: 'Klassement & etaper', riders: ['Santiago Buitrago', 'Antonio Tiberi'] },
  TPP: { profile: 'Klassement & etaper', riders: ['Frank van den Broek'] },
  EFE: { profile: 'Etaper & klassikere', riders: ['Ben Healy'] },
  GFC: { profile: 'Etaper & ungdom', riders: ['David Gaudu', 'Lenny Martinez'] },
  UXM: { profile: 'Etaper & udbrydere', riders: ['Magnus Cort', 'Tobias Johannessen'] },
  APT: { profile: 'Massespurter', riders: ['Mathieu van der Poel', 'Jasper Philipsen'] },
  COF: { profile: 'Etaper & klassikere', riders: ['Alex Aranburu', 'Ion Izagirre'] },
  XAT: { profile: 'Etaper & bjerge', riders: ['Lorenzo Fortunato'] },
  LOI: { profile: 'Massespurter & etaper', riders: ['Arnaud De Lie'] },
  NSN: { profile: 'Massespurter & etaper', riders: ['Biniam Girmay'] },
  TUD: { profile: 'Udbrydere & etaper', riders: ['Matteo Trentin', 'Michael Storer'] },
  TEN: { profile: 'Udbrydere', riders: ['Jordan Jegat'] },
  PQT: { profile: 'Kuperede etaper & udbrydere', riders: [] },
  CJR: { profile: 'Udbrydere & bjerge', riders: [] },
};

/** Slå holdets profil op via holdkode. Returnerer { profile, riders } eller null. */
export function teamProfile(code) {
  return (code && TEAM_PROFILES[code]) || null;
}
