// Spil-listen mod de invarianter, den skal overholde.
//
// Listen stod uden for enhver kontrol, indtil den blev skilt ud af
// seed-games.mjs. Den beskriver de felter, en fejl er dyrest i: hvor facit
// hentes fra, og hvilke faner et spil har. Og den skrives DIREKTE i
// produktionsdata — der er ingen tør-kørsel på seed-games.
//
// EN TING, DER GØR ALT HERUNDER VIGTIGERE: seedet skriver med `merge: true`,
// og merge FJERNER ALDRIG ET FELT. Er `sync` eller `pulje` først skrevet på et
// spil, kan det ikke fjernes ved at slette det fra denne liste — det kræver en
// håndrettelse i konsollen. Testene her beskytter altså den ENESTE chance for
// at få felterne rigtige: den første kørsel.
import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { GAMES } from './games.mjs';

// Providerens navn → de nøgler, den præcist skal have. Ingen flere, ingen
// færre. Et `SHAPES`-objekt frem for if-grene, så en NY provider ikke kan
// slippe igennem uden en form (opt-in-grene gav nul kontrol på ukendte).
const SHAPES = {
  superliga: ['provider', 'seasonId', 'stageId', 'tournamentId'],
  pulselive: ['competitionId', 'provider', 'season'],
};

// De faktiske værdier, pinnet. Et forkert seasonId synker den forkerte sæson
// og skriver fremmede resultater ind i kampene — og `expect.any(Number)`
// fangede det ikke.
const FORVENTET_SYNC = {
  superliga2627: { provider: 'superliga', seasonId: 35802, tournamentId: 46, stageId: 935487 },
  'pl2627-efteraar': { provider: 'pulselive', competitionId: 8, season: 2026 },
};

const medSync = GAMES.filter((g) => g.sync);

describe('spil-listen', () => {
  // Id'erne matcher migreringens datastier og kan ikke ændres bagefter:
  // players, bets, leagues og matches hænger alle under games/{gameId}/.
  it('har præcis de spil-id\'er, platformen kender', () => {
    expect(GAMES.map((g) => g.id)).toEqual([
      'vm2026', 'tour2026', 'superliga2627', 'pl2627-efteraar',
    ]);
  });

  it('har de felter, fladen læser, på hvert spil', () => {
    for (const g of GAMES) {
      expect(g.name, g.id).toBeTruthy();
      expect(g.shortName, g.id).toBeTruthy();
      expect(g.emoji, g.id).toBeTruthy();
      expect(g.type, g.id).toMatch(/^(football|cycling)$/);
      expect(['open', 'live', 'finished'], g.id).toContain(g.status);
      expect(typeof g.joinable, g.id).toBe('boolean');
      expect(g.season, g.id).toMatch(/^\d{4}(-\d{2})?$/);
    }
  });

  // `order` styrer BÅDE sorteringen og selve forespørgslen: useGames bruger
  // orderBy('order'), og Firestore udelader dokumenter uden feltet. Et spil
  // uden order forsvinder fra oversigten uden fejlbesked.
  it('har et positivt, entydigt order på hvert spil', () => {
    for (const g of GAMES) expect(Number.isInteger(g.order) && g.order > 0, g.id).toBe(true);
    expect(new Set(GAMES.map((g) => g.order)).size).toBe(GAMES.length);
    expect([...GAMES].sort((a, b) => a.order - b.order).map((g) => g.id)).toEqual(GAMES.map((g) => g.id));
  });

  it('har entydige navne, så to spil ikke kan forveksles', () => {
    expect(new Set(GAMES.map((g) => g.shortName)).size).toBe(GAMES.length);
  });

  // Et afsluttet spil må ikke kunne tilmeldes — det ville stå under "Åbne
  // spil" uden at kunne spilles.
  it('lader ikke et afsluttet spil være joinable', () => {
    for (const g of GAMES.filter((x) => x.status === 'finished')) {
      expect(g.joinable, g.id).toBe(false);
    }
  });

  // Premier League oprettes SKJULT. Seedet skriver spillet og 180 kampe i én
  // kørsel; står joinable til true, ligger spillet under "Åbne spil — deltag"
  // i samme sekund — før nogen har set holdnavne, kickoff-tider og odds efter.
  // joinable er ADMIN_OWNED, så listen bestemmer kun ved oprettelsen: knappen
  // i Spil-tidsplan slår synligheden til bagefter, og en senere seed-kørsel
  // skjuler ikke spillet igen.
  it('opretter Premier League skjult, så det kan gennemgås før afsløringen', () => {
    const pl = GAMES.find((g) => g.id === 'pl2627-efteraar');
    expect(pl.joinable).toBe(false);
    // Men ÅBENT: skjult er ikke det samme som afsluttet. Stod status til
    // 'finished', ville påmindelserne aldrig starte, og spillet ville bære en
    // usand etiket.
    expect(pl.status).toBe('open');
  });

  it('peger kun på logoer, der findes', () => {
    for (const g of GAMES.filter((x) => x.logo)) {
      // process.cwd() er projektroden i vitest. `import.meta.url` duer ikke:
      // vite transformerer testfilen, så den peger et andet sted hen.
      expect(existsSync(resolve(process.cwd(), `public${g.logo}`)), `${g.id}: ${g.logo}`).toBe(true);
    }
  });

  // Touren kører i sin egen app; forsiden linker UD i stedet for at tilbyde
  // Deltag. Forsvinder feltet, bliver spillet et dødt kort.
  it('lader Touren linke ud til sin egen app', () => {
    expect(GAMES.find((g) => g.id === 'tour2026').externalUrl).toBe('https://tour.vejleaa.dk');
  });
});

describe('sync — hvor facit hentes fra', () => {
  it('giver hvert aktivt fodboldspil en provider', () => {
    const aktive = GAMES.filter((g) => g.type === 'football' && g.status !== 'finished');
    expect(aktive.length).toBeGreaterThan(0);
    for (const g of aktive) expect(g.sync, `${g.id} mangler sync`).toBeTruthy();
  });

  // SSRF-SPÆRREN. firestore.rules giver isGlobalAdmin() skriveadgang til HELE
  // spil-dokumentet, så alt i sync kan ændres udefra af en kompromitteret
  // admin-konto. Rammer en Cloud Functions fetch metadata-serveren
  // (169.254.169.254), får angriberen et service-account-token — altså mere,
  // end reglerne nogensinde ville give.
  //
  // VÆR ÆRLIG OM RÆKKEVIDDEN: den her beviser, at den COMMITEDE liste er ren.
  // Den siger intet om, hvad der ligger i Firestore. Den rigtige spærre er en
  // re-validering ved LÆSNING i #7's provider-lag — kræv den præcise nøglesæt
  // og Number.isInteger, og fald aldrig tilbage på en default ved fejl.
  //
  // Løber over ALLE spil, ikke kun de aktive fodboldspil: et spil bliver
  // `finished` ved sæsonslut, mens sync-blokken bliver stående — og så holdt
  // vagten op med at virke præcis dér, hvor en glemt konfiguration lever.
  it('har kun heltals-id\'er i sync — på ethvert spil', () => {
    for (const g of medSync) {
      for (const [k, v] of Object.entries(g.sync)) {
        if (k === 'provider') continue;
        expect(Number.isInteger(v) && v > 0, `${g.id}.sync.${k} = ${JSON.stringify(v)}`).toBe(true);
      }
    }
  });

  // Pinner de faktiske værdier. `expect.any(Number)` lod seasonId: 1 passere,
  // og et forkert sæson-id synker en fremmed sæsons resultater ind i kampene.
  it('har præcis den sync, hvert spil skal have', () => {
    for (const g of medSync) {
      expect(g.sync, g.id).toEqual(FORVENTET_SYNC[g.id]);
    }
    expect(medSync.map((g) => g.id).sort()).toEqual(Object.keys(FORVENTET_SYNC).sort());
  });

  // Nøglesættet skal matche PRÆCIST — hverken flere eller færre. En snuget
  // ekstra nøgle (fx apiBase) gør hele blokken ugyldig i stedet for bare at
  // blive ignoreret, og det er samme kontrakt, #7's læse-validering skal have.
  it('har præcis de nøgler, providerens form kræver', () => {
    for (const g of medSync) {
      expect(SHAPES, `${g.id}: ukendt provider "${g.sync.provider}"`).toHaveProperty(g.sync.provider);
      expect(Object.keys(g.sync).sort(), g.id).toEqual(SHAPES[g.sync.provider]);
    }
  });
});

describe('pulje — sæson-spørgsmålene pr. spil (#8)', () => {
  // Feltets TILSTEDEVÆRELSE er signalet. GamePage.faneVises læser det, og
  // settlePuljeBets afviser at afregne uden det.
  it('findes på Superligaen og PL-efteråret — og ingen andre', () => {
    expect(GAMES.filter((g) => g.pulje).map((g) => g.id).sort())
      .toEqual(['pl2627-efteraar', 'superliga2627']);
  });

  it('Superligaens form er det LITERALE {poolSize: 6} — normalizerens SL-bånd', async () => {
    const { PULJE } = await import('../src/lib/superligaScoring.js');
    const sl = GAMES.find((g) => g.id === 'superliga2627');
    // Præcis den form, puljeKonfig-defaults er kalibreret til: ændres den her,
    // skal normalizerens defaults (og dens SL-bånd i testene) flytte med.
    expect(sl.pulje).toEqual({ poolSize: PULJE.POOL_SIZE });
    expect(sl.pulje.poolSize).toBe(6);
  });

  it('PL-formen: 4+3, egne kampe som facit, flad tabel — og deadline i samme skrivning', () => {
    const pl = GAMES.find((g) => g.id === 'pl2627-efteraar');
    expect(pl.pulje).toMatchObject({
      poolSize: 4, nedSize: 3, perTeam: 4, perfectBonus: 10,
      facitKilde: 'egneKampe', tabelDeling: false,
    });
    for (const nøgle of ['overskrift', 'top', 'ned', 'facit']) {
      expect(typeof pl.pulje.labels[nøgle], nøgle).toBe('string');
    }
    // pulje uden puljeLockAt viser en fane, hvor rules afviser alt (QC-fund):
    // de to felter SKAL følges ad i seedet.
    expect(pl.puljeLockAt instanceof Date).toBe(true);
    // Deadline før runde 3 (PULJE_MAKS_STARTRUNDE) — spilfører-afgørelsen, der
    // holder bonussen inde for alle ligaer, der kan nå at tippe.
    expect(pl.puljeLockAt.getTime()).toBeLessThan(new Date('2026-09-13T00:00:00Z').getTime());
  });
});
