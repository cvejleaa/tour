// ---------------------------------------------------------------------------
// scripts/lib/roller.mjs — HVILKE ROLLER skal køre på denne ændring?
//
// HVORFOR DEN FINDES. CLAUDE.md siger præcist, hvornår hver rolle skal køre.
// Alligevel blev reglen brudt i begge retninger i samme session: Quality
// Control blev kørt på både planen OG koden for ændringer, hvor reglen kun
// kræver planen ved ny brugerflade — og Release Manager blev kørt to gange,
// fordi den første briefing var forkert. Det kostede ~130.000 tokens uden at
// fange noget.
//
// Det er ikke en tekstmangel; teksten var der. Det er en vagt-mangel. Samme
// slutning som `puljeLockRound`: en beslutning, der bæres af et skøn, knækker
// tavst. Derfor beregnes den her ud fra de filer, ændringen faktisk rører, og
// svaret skrives i PR-teksten, så det kan efterprøves bagefter.
//
// DEN SKÆRER IKKE NED PÅ SIKKERHEDEN. Den siger både hvad der SKAL køre, og
// hvad der ikke skal — begge fejl er fejl. Er du i tvivl om et mønster, så
// udvid listen her, ikke skønnet på stedet.
// ---------------------------------------------------------------------------

/** Rører ændringen noget, der afgør HVEM DER SER HVAD, eller serverkode? */
const SIKKERHED = [
  { m: /^firestore\.rules$/, hvorfor: 'firestore.rules — reglerne selv' },
  { m: /^functions(-platform)?\//, hvorfor: 'Cloud Functions (serveren er eneste autoritet)' },
  { m: /^storage\.rules$/, hvorfor: 'storage-regler' },
  { m: /auth/i, hvorfor: 'auth-sti' },
  // `gameLeagueActions.js` indeholder joinLeagueByCode og leaveLeague — altså
  // MEDLEMSKAB, som afgør hvem der ser hvis tips. Stinavnet indeholder hverken
  // "join" eller "invit", så en ordbaseret regel ramte den ikke. Fundet af
  // testen; det er præcis den slags hul, en proxy-gate har.
  { m: /(Join|invit|redeem|LeagueCode)/i, hvorfor: 'invitationer eller liga-tilmelding' },
  { m: /[Ll]eagueActions/, hvorfor: 'liga-medlemskab (afgør hvem der ser hvis tips)' },
  { m: /^src\/features\/admin\//, hvorfor: 'admin-flade (adgang til andres data)' },
];

/** Rører ændringen SPILLET som spil — mekanik, point, rangliste, synlighed? */
const SPILFOERER = [
  { m: /(Scoring|scoring)/, hvorfor: 'scoring' },
  { m: /(pointOpdeling|ligaPoint|rundeSejre|chanceVagt|Chance)/, hvorfor: 'point- eller chance-mekanik' },
  { m: /(Standings|Pokaler|Leaderboard|Elo)/, hvorfor: 'rangliste eller styrketal' },
  { m: /(Recap|Bot|Reminder|mail|Mail)/, hvorfor: 'notifikationer, mails eller bot-opslag' },
  { m: /(LeagueBets|Indbyrdes|SpillerDetalje|useVisibleGame)/, hvorfor: 'hvem ser hvad hvornår' },
  { m: /(Pulje|pulje)/, hvorfor: 'pulje-mekanik' },
];

const erDoku = (f) => /^docs\//.test(f) || /\.md$/.test(f);
const erTest = (f) => /\.(test|spec)\.[jt]sx?$/.test(f) || /\.test\.mjs$/.test(f);
const erFlade = (f) => /\.jsx$/.test(f);

function traef(regler, filer) {
  const ud = [];
  for (const r of regler) {
    const ramt = filer.filter((f) => r.m.test(f));
    if (ramt.length) ud.push({ hvorfor: r.hvorfor, filer: ramt.slice(0, 3) });
  }
  return ud;
}

/**
 * @param {string[]} filer  ændrede stier (git diff --name-only mod base)
 * @returns {{roller: Array<{navn:string, hvornaar:string, hvorfor:string}>,
 *            undtaget: boolean, noter: string[]}}
 */
export function paakraevedeRoller(filer) {
  const f = (filer || []).filter(Boolean);
  const noter = [];
  if (!f.length) {
    // TOM DIFF ER IKKE "INGEN ROLLER". Det er en fejl i kaldet — og hvis den
    // fik lov at betyde "ingenting skal køre", ville en forkert base-branch
    // tavst afmelde hele gennemgangen. Samme klasse som en query, der giver
    // nul rækker, fordi filteret var forkert.
    return { roller: [], undtaget: false, noter: ['TOM DIFF — tjek base-branchen. Dette er ikke "ingen roller".'] };
  }

  // Undtagelsen i CLAUDE.md er SNÆVER: rene tekstrettelser i docs/ uden
  // kodeændring. En .md uden for docs/ (fx CLAUDE.md eller en rolledefinition)
  // ændrer ARBEJDSGANGEN og er derfor ikke undtaget.
  const kunDocs = f.every((x) => /^docs\/.*\.md$/.test(x));
  if (kunDocs) {
    return {
      roller: [],
      undtaget: true,
      noter: ['Ren tekstrettelse i docs/ uden kodeændring — undtaget i CLAUDE.md.'],
    };
  }
  if (f.every(erDoku)) {
    noter.push('Kun markdown, men uden for docs/ — arbejdsgangen ændres, så undtagelsen gælder IKKE.');
  }

  const roller = [
    { navn: 'Test Manager', hvornaar: 'på koden', hvorfor: 'fast rolle — hver ændring' },
    { navn: 'Quality Control', hvornaar: 'på koden', hvorfor: 'fast rolle — hver ændring' },
    { navn: 'Release Manager', hvornaar: 'efter de andre er grønne', hvorfor: 'fast rolle — udrulningsplanen' },
  ];

  const sik = traef(SIKKERHED, f);
  if (sik.length) {
    roller.push({
      navn: 'Security Reviewer',
      hvornaar: 'på koden, parallelt med de to andre',
      hvorfor: sik.map((x) => x.hvorfor).join('; '),
    });
  }

  const spil = traef(SPILFOERER, f);
  if (spil.length) {
    roller.push({
      navn: 'Spilfører',
      hvornaar: 'PÅ PLANEN, før koden skrives (rådgivende)',
      hvorfor: spil.map((x) => x.hvorfor).join('; '),
    });
  }

  // QC på planen er BETINGET — ikke standard. Det var netop dét, der blev
  // kørt for bredt. Ny .jsx-fil = ny flade; ændret .jsx kan være ny flade,
  // og det kan scriptet ikke afgøre, så det spørger i stedet for at gætte.
  const nyeFlader = f.filter((x) => erFlade(x) && !erTest(x));
  if (nyeFlader.length) {
    noter.push(
      `${nyeFlader.length} .jsx-fil(er) rørt. Tilføjer ændringen NY brugerflade eller NYE TAL på skærmen, `
      + 'så kør Quality Control på PLANEN først, og på opus. Gør den ikke, så lad være — '
      + 'det er den betingelse, der oftest overtrædes.',
    );
  }

  if (f.some((x) => /^src\/lib\//.test(x)) && f.some((x) => /^functions(-platform)?\//.test(x))) {
    noter.push('Spejlede filer rørt i begge ender — kontrollér at de følges ad (CLAUDE.md).');
  } else if (f.some((x) => /^src\/lib\//.test(x))) {
    noter.push('src/lib/ rørt: har filen en spejlet modpart i functions*/ som skal følge med?');
  }

  return { roller, undtaget: false, noter };
}

/** Menneskelig udskrift — også den, der klistres ind i PR-teksten. */
export function formatér({ roller, undtaget, noter }) {
  const l = [];
  if (undtaget) l.push('INGEN roller påkrævet.');
  else if (!roller.length) l.push('KUNNE IKKE AFGØRES.');
  else {
    l.push(`${roller.length} rolle(r) påkrævet:`);
    for (const r of roller) l.push(`  • ${r.navn} — ${r.hvornaar}\n      fordi: ${r.hvorfor}`);
  }
  for (const n of noter) l.push(`  ⚠️  ${n}`);
  return l.join('\n');
}
