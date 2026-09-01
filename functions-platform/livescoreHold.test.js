// ---------------------------------------------------------------------------
// PARITETSTEST MOD LIVESCORE — den vagt, kortlægningen står og falder med.
//
// Tabellen i livescoreHold.js er skrevet i hånden ud fra én måling. Omdøber
// livescore et hold eller ændrer en kode, bliver vores kobling tavst forkert:
// kampen findes ikke, feltet udebliver, og fladen viser ingenting uden at
// nogen får besked. Det er præcis den slags fejl, huset har brændt sig på.
//
// Testen læser derfor den LEVENDE kilde. Det er et bevidst brud med reglen om
// hermetiske tests, og prisen er, at den kan fejle på en netværksfejl. Til
// gengæld fejler den DAGEN EFTER en omdøbning i stedet for midt i en sæson.
// Uden netværk springes den over med `ctx.skip()` og IKKE med et tavst
// `return`. Forskellen er hele pointen: et `return` giver en GRØN test uden
// en eneste assertion, og en grøn CI-markering læser ingen. `ctx.skip()`
// tælles derimod som "N skipped" i selve sammendraget, så et udfald — eller
// en blokering af CI's IP, hvilket er sandsynligt for et browser-endpoint —
// er synligt uden at nogen skal åbne loggen. Test Managers krav.
//
// Den efterprøver TO ting, og den anden er den vigtigste:
//   1. Afvigelserne i tabellen er stadig afvigelser.
//   2. De hold, tabellen IKKE nævner, har faktisk samme kode begge steder.
// Uden nr. 2 er fald-tilbagen i `livescoreKode` udokumenteret — og den dækker
// 24 af 32 hold.
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { AFVIGER, livescoreKode, kampNoegle } = require('./livescoreHold');

const API = 'https://prod-cdn-public-api.lsmedia1.com/v1/api/app';
const OPT = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
      + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
    Referer: 'https://www.livescore.com/',
  },
};

const SPIL = [
  { navn: 'Premier League', fil: 'premierLeagueTeams2026.js', sti: 'england/premier-league' },
  { navn: 'Superligaen', fil: 'superligaTeams2026.js', sti: 'denmark/superliga' },
];

const voresHold = (fil) => new Map(
  [...readFileSync(new URL(`../src/data/${fil}`, import.meta.url), 'utf8')
    .matchAll(/name:\s*'([^']+)',\s*short:\s*'([^']+)'/g)].map((m) => [m[1], m[2]]),
);

async function deresKoder(sti) {
  const res = await fetch(`${API}/stage/soccer/${sti}/0`, {
    ...OPT, signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  const ud = new Map();
  for (const s of d.Stages || []) {
    for (const e of s.Events || []) {
      for (const t of [...(e.T1 || []), ...(e.T2 || [])]) ud.set(t.Abr, t.Nm);
    }
  }
  return ud;
}

describe.each(SPIL)('livescore-koder · $navn', ({ fil, sti }) => {
  let deres = null;
  let fejl = null;
  beforeAll(async () => {
    try { deres = await deresKoder(sti); } catch (e) { fejl = e; }
  }, 30000);

  it('hvert af VORES hold har en kode, livescore kender', (ctx) => {
    if (fejl || deres.size < 10) return ctx.skip();
    // ANTALS-TJEKKET ER IKKE PYNT. `voresHold` regexer en datafil; skifter den
    // citationstegn eller feltrækkefølge, bliver Map'en tom — og så er
    // `toEqual([])` grøn med NUL hold kontrolleret. Testen ville forsvare
    // ingenting og se ud som om den beviste alt.
    const vores = voresHold(fil);
    expect(vores.size).toBeGreaterThan(9);
    const mangler = [...vores]
      .filter(([, kode]) => !deres.has(livescoreKode(kode)))
      .map(([navn, kode]) => `${navn} (${kode} → ${livescoreKode(kode)})`);
    expect(mangler, 'hold uden modstykke hos livescore').toEqual([]);
  });

  it('de hold, tabellen IKKE nævner, har SAMME kode begge steder', (ctx) => {
    // Fald-tilbagen dækker 24 af 32 hold. Uden denne kunne den være forkert
    // for et af dem, uden at testen ovenfor opdagede det — for den bruger
    // netop fald-tilbagen til sit opslag.
    if (fejl || deres.size < 10) return ctx.skip();
    const uden = [...voresHold(fil)].filter(([, kode]) => !(kode in AFVIGER));
    const forkerte = uden.filter(([, kode]) => !deres.has(kode)).map(([n]) => n);
    expect(forkerte, 'hold uden for tabellen, hvis kode IKKE matcher').toEqual([]);
    expect(uden.length).toBeGreaterThan(0);
  });

  it('to af VORES hold får aldrig SAMME livescore-kode', (ctx) => {
    // Kortlægningen skal være injektiv. Testen ovenfor spørger kun, om hver
    // af vores koder FINDES hos dem — ikke om to af vores peger samme sted.
    // Den dag en liga får et hold med kortkoden COP, BRO, LYN, RAN, SIL, SOE,
    // VIB eller FOR, ville to af vores kampe koble til samme nøgle, og intet
    // ville blive rødt. Security Reviewers fund.
    if (fejl || deres.size < 10) return ctx.skip();
    const koder = [...voresHold(fil).values()].map(livescoreKode);
    expect(koder.length).toBeGreaterThan(9);
    expect(new Set(koder).size, 'to hold deler livescore-kode').toBe(koder.length);
  });

  it('hver af tabellens afvigelser er STADIG en afvigelse', (ctx) => {
    // Retter livescore en dag sin kode til vores, bliver posten overflødig —
    // og en tabel med døde poster er en tabel, ingen tør rette i.
    if (fejl || deres.size < 10) return ctx.skip();
    const alle = voresHold(fil);
    expect(alle.size).toBeGreaterThan(9);
    const vores = new Set(alle.values());
    for (const [vor, deresKode] of Object.entries(AFVIGER)) {
      if (!vores.has(vor)) continue; // hører til det andet spil
      expect(deres.has(deresKode), `${vor} → ${deresKode} findes ikke hos livescore`).toBe(true);
      expect(deres.has(vor), `${vor} er ikke længere en afvigelse — fjern posten`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// SOMMERTIDS-VAGTEN — den test, der ville have fanget offset-fejlen.
//
// Det sidste segment i `stage/.../{OFFSET}` er et UTC-offset i TIMER, ikke en
// version. Koden hentede først med `/2`, og JSDoc'en påstod, at `Esd` var UTC.
// `/2` er et FAST offset uden sommertid, så det faldt tilfældigvis sammen med
// dansk tid i august og ville være én time forkert fra sidste søndag i
// oktober.
//
// Derfor to kampe: én i sommertid og én i vintertid. Med `/2` fejler BEGGE
// (to timer forskudt); med et naivt "dansk tid"-offset ville kun den ene
// fejle — og en test med kun sommerkampen ville have godkendt netop den fejl.
//
// Sandheden er vores EGET kampprogram, som er committet og i UTC.
// ---------------------------------------------------------------------------
describe('Esd fra /0 er ægte UTC', () => {
  const SANDHED = [
    ['sommertid (BST)', 2645195, '20260821190000'],   // Arsenal-Coventry, r1
    ['vintertid (GMT)', 2645315, '20261202200000'],   // Bournemouth-Brighton, r13
  ];

  it.each(SANDHED)('%s: kildens Esd matcher vores kickoff', async (_navn, matchId, ventet, ctx) => {
    let kampe = null;
    try {
      const res = await fetch(`${API}/stage/soccer/england/premier-league/0`, {
        ...OPT, signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      kampe = (d.Stages || []).flatMap((x) => x.Events || []);
    } catch { return ctx?.skip?.(); }
    if (!kampe || kampe.length < 100) return ctx?.skip?.();

    // Deres Eid er ikke vores matchId, så kampen findes på holdparret. Begge
    // hold, ikke ét: tre kampe starter rutinemæssigt i samme minut.
    const vores = JSON.parse(
      readFileSync(new URL('../scripts/premier-league-fixtures-2627.json', import.meta.url), 'utf8'),
    ).fixtures.find((f) => f.id.endsWith(String(matchId)));
    expect(vores, `vores kamp ${matchId}`).toBeTruthy();

    // KODEN, IKKE NAVNET — og det er ikke en detalje. Første udgave af denne
    // test matchede på navn og fejlede på vinterkampen, fordi livescore
    // skriver "AFC Bournemouth" hvor vores program skriver "Bournemouth".
    // Tiderne var identiske. Det er nøjagtig den fælde, hele modulet findes
    // for at lukke, og testen faldt selv i den.
    const kode = livescoreKode(voresHold('premierLeagueTeams2026.js').get(vores.home));
    expect(kode, `ingen kortkode for ${vores.home}`).toBeTruthy();
    const traef = kampe.find((e) => String(e.Esd) === ventet
      && (e.T1 || []).some((t) => t.Abr === kode));
    expect(traef, `ingen livescore-kamp på ${ventet} med ${kode}`).toBeTruthy();
    // Og vores eget program skal sige det samme — ellers er "sandheden" flyttet.
    expect(vores.kickoff.replace(/[-:TZ]/g, '')).toBe(ventet);
  }, 30000);
});

describe('kampNoegle', () => {
  it('oversætter begge hold og nøgler på DATOEN, ikke klokkeslættet', () => {
    expect(kampNoegle(20260831190000, 'AVL', 'ARS')).toBe('20260831|AVL|ARS');
    expect(kampNoegle('20260724190000', 'VFF', 'OB')).toBe('20260724|VIB|OB');
  });

  // ── Produktionsfundet, vendt til en test ────────────────────────────────
  it('kobler stadig, når de to kilder er UENIGE om klokkeslættet', () => {
    // FCM-Randers, runde 5: vores program sagde 12:00:00, livescore 12:05:00,
    // og kampen kunne derfor ikke kobles ved første tryk på knappen. Fejlen
    // var ikke de fem minutter — den var at KRÆVE, at to uafhængige kilder er
    // enige på sekundet. Vores tid er den planlagte, deres er den, kampen
    // faktisk gik i gang på. De begreber bliver aldrig ens.
    expect(kampNoegle(20260823120000, 'FCM', 'RFC'))
      .toBe(kampNoegle(20260823120500, 'FCM', 'RFC'));
    // …og en time senere, som en udskudt kamp typisk flyttes.
    expect(kampNoegle(20260823120000, 'FCM', 'RFC'))
      .toBe(kampNoegle(20260823130000, 'FCM', 'RFC'));
  });

  it('to kampe mellem SAMME hold på FORSKELLIGE dage er stadig to nøgler', () => {
    // Prisen for at slippe klokkeslættet: uden datoen ville hjemme- og
    // udekampen — og et gensyn i mesterskabsspillet — smelte sammen til én.
    expect(kampNoegle(20260823120000, 'FCM', 'RFC'))
      .not.toBe(kampNoegle(20261115120000, 'FCM', 'RFC'));
  });

  it('afviser en cifferstreng, der ikke er en gyldig DATO', () => {
    // '00000000000000' er 14 cifre og ville uden dette være en gyldig nøgle,
    // som ALLE ulæselige tider delte — altså én kamp, der trak vilkårlige
    // andre til sig. Det er den værste form for fejlkobling: den ser ud til
    // at virke.
    for (const t of ['00000000000000', '20261301120000', '20260732120000', '18990101120000']) {
      expect(kampNoegle(t, 'AVL', 'ARS'), String(t)).toBeNull();
    }
  });

  it('afviser en tid, der ikke er 14 cifre', () => {
    // En afkortet eller tom tid ville give en nøgle, der matcher FORKERT
    // frem for slet ikke at matche — og en forkert kobling er værre end
    // ingen, fordi den ser ud til at virke.
    for (const t of ['', null, undefined, '2026083119', '20260831190000Z', 'abc']) {
      expect(kampNoegle(t, 'AVL', 'ARS'), String(t)).toBeNull();
    }
  });

  it('afviser en holdkode med separatoren i sig', () => {
    // ('A|B','C') og ('A','B|C') gav før SAMME nøgle. Tiden var strengt
    // valideret, koderne slet ikke — og en nøgle, der kan bygges på to måder,
    // peger ikke længere på én bestemt kamp.
    expect(kampNoegle(20260831190000, 'A|B', 'C')).toBeNull();
    expect(kampNoegle(20260831190000, 'AVL', 'AR|S')).toBeNull();
    expect(kampNoegle(20260831190000, 'arsenal', 'ARS')).toBeNull();
  });

  it('afviser en FOR LANG cifferstreng, ikke kun en for kort', () => {
    // Test Managers fund: `/^\d{14}$/` kunne blive til `/^\d{14,30}$/` med
    // grøn suite, fordi reject-listen kun rummede korte og ugyldige strenge.
    // Et bånd, der kun lukker den ene ende, måler kun den ene ende.
    expect(kampNoegle('202608311900001', 'AVL', 'ARS')).toBeNull();
    expect(kampNoegle('2026083119000000', 'AVL', 'ARS')).toBeNull();
  });

  it('livescoreKode giver null for tom streng — ikke tom streng', () => {
    // Kontrakten siger `string|null`. Uden denne kunne vagten fjernes, så
    // funktionen returnerede '' — grøn suite, fordi den eneste kalder
    // (`kampNoegle`) behandler '' og null ens. En kontrakt, kun én kalder
    // efterprøver, er ikke efterprøvet.
    expect(livescoreKode('')).toBeNull();
    expect(livescoreKode(null)).toBeNull();
    expect(livescoreKode(42)).toBeNull();
  });

  it('afviser en manglende holdkode', () => {
    expect(kampNoegle(20260831190000, '', 'ARS')).toBeNull();
    expect(kampNoegle(20260831190000, 'AVL', null)).toBeNull();
  });

  it('begge hold indgår — ikke kun hjemmeholdet', () => {
    // Tre Premier League-kampe starter rutinemæssigt i samme minut. Med kun
    // hjemmeholdet i nøglen ville de være skelnelige; med kun kickoff ikke.
    expect(kampNoegle(20260831190000, 'AVL', 'ARS'))
      .not.toBe(kampNoegle(20260831190000, 'AVL', 'CHE'));
  });
});
