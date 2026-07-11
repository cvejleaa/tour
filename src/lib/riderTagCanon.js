// ---------------------------------------------------------------------------
// riderTagCanon — kanonisér rytter-tags til ÉT dansk ord pr. begreb, så
// synonymer (sprinter/spurter, baroudeur/angrebsrytter/udbryder) samles i stedet
// for at brede sig. SPEJL af functions/riderTagCanon.js — hold dem 100% ens.
// ---------------------------------------------------------------------------

// synonym (lowercase) → kanonisk dansk term.
export const SYNONYMS = {
  // Spurter (etapevinder i massespurt)
  sprinter: 'spurter',
  massespurter: 'spurter',
  sprintafslutter: 'spurter',
  sprintspecialist: 'spurter',
  sprint: 'spurter',
  spurt: 'spurter',
  finisher: 'spurter',
  // Klatrer (bjergrytter)
  bjergrytter: 'klatrer',
  bjergkonge: 'klatrer',
  klatrekonge: 'klatrer',
  klatrespecialist: 'klatrer',
  // Udbryder (angrebs-/breakaway-rytter)
  baroudeur: 'udbryder',
  angrebsrytter: 'udbryder',
  angriber: 'udbryder',
  breakawayspecialist: 'udbryder',
  offensiv: 'udbryder',
  // Klassementsrytter (samlet-favorit)
  'gc-rytter': 'klassementsrytter',
  gcrytter: 'klassementsrytter',
  klassementskaptajn: 'klassementsrytter',
  klassementsfavorit: 'klassementsrytter',
  samletfavorit: 'klassementsrytter',
  klassementsmand: 'klassementsrytter',
  // Hjælperytter (domestique)
  domestique: 'hjælperytter',
  vandbærer: 'hjælperytter',
  hjælper: 'hjælperytter',
  // Tempospecialist (enkeltstart)
  enkeltstartsspecialist: 'tempospecialist',
  enkeltstartsrytter: 'tempospecialist',
  tempokører: 'tempospecialist',
  tempo: 'tempospecialist',
  // Puncheur
  'punchør': 'puncheur',
  puncher: 'puncheur',
  // Leadout (optrækker)
  'lead-out': 'leadout',
  leadoutmand: 'leadout',
  optrækker: 'leadout',
  // Stavevarianter
  alrounder: 'allrounder',
  'all-rounder': 'allrounder',
};

/** De kanoniske termer (til fx admin-hjælp). */
export const CANON_TAGS = [
  'spurter', 'klatrer', 'udbryder', 'klassementsrytter',
  'hjælperytter', 'tempospecialist', 'puncheur', 'leadout', 'allrounder',
];

/** Normalisér ét tag: trim + små bogstaver + synonym → kanonisk. */
export function canonTag(label) {
  const k = String(label || '').trim().toLowerCase();
  if (!k) return '';
  return SYNONYMS[k] || k;
}
