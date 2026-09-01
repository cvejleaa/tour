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
  const res = await fetch(`${API}/stage/soccer/${sti}/2`, {
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
    if (fejl) return ctx.skip();
    const mangler = [...voresHold(fil)]
      .filter(([, kode]) => !deres.has(livescoreKode(kode)))
      .map(([navn, kode]) => `${navn} (${kode} → ${livescoreKode(kode)})`);
    expect(mangler, 'hold uden modstykke hos livescore').toEqual([]);
  });

  it('de hold, tabellen IKKE nævner, har SAMME kode begge steder', (ctx) => {
    // Fald-tilbagen dækker 24 af 32 hold. Uden denne kunne den være forkert
    // for et af dem, uden at testen ovenfor opdagede det — for den bruger
    // netop fald-tilbagen til sit opslag.
    if (fejl) return ctx.skip();
    const uden = [...voresHold(fil)].filter(([, kode]) => !(kode in AFVIGER));
    const forkerte = uden.filter(([, kode]) => !deres.has(kode)).map(([n]) => n);
    expect(forkerte, 'hold uden for tabellen, hvis kode IKKE matcher').toEqual([]);
    expect(uden.length).toBeGreaterThan(0);
  });

  it('hver af tabellens afvigelser er STADIG en afvigelse', (ctx) => {
    // Retter livescore en dag sin kode til vores, bliver posten overflødig —
    // og en tabel med døde poster er en tabel, ingen tør rette i.
    if (fejl) return ctx.skip();
    const vores = new Set(voresHold(fil).values());
    for (const [vor, deresKode] of Object.entries(AFVIGER)) {
      if (!vores.has(vor)) continue; // hører til det andet spil
      expect(deres.has(deresKode), `${vor} → ${deresKode} findes ikke hos livescore`).toBe(true);
      expect(deres.has(vor), `${vor} er ikke længere en afvigelse — fjern posten`).toBe(false);
    }
  });
});

describe('kampNoegle', () => {
  it('oversætter begge hold og bevarer kickoff', () => {
    expect(kampNoegle(20260831190000, 'AVL', 'ARS')).toBe('20260831190000|AVL|ARS');
    expect(kampNoegle('20260724190000', 'VFF', 'OB')).toBe('20260724190000|VIB|OB');
  });

  it('afviser en tid, der ikke er 14 cifre', () => {
    // En afkortet eller tom tid ville give en nøgle, der matcher FORKERT
    // frem for slet ikke at matche — og en forkert kobling er værre end
    // ingen, fordi den ser ud til at virke.
    for (const t of ['', null, undefined, '2026083119', '20260831190000Z', 'abc']) {
      expect(kampNoegle(t, 'AVL', 'ARS'), String(t)).toBeNull();
    }
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
