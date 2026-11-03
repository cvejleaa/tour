// Spil-listen mod de invarianter, den skal overholde.
//
// Listen stod uden for enhver kontrol, indtil den blev skilt ud af
// seed-games.mjs. Den beskriver de felter, en fejl er dyrest i: hvor facit
// hentes fra, og hvilke faner et spil har. Og den skrives i produktionsdata.
// seed-games har nu en tør-kørsel (scripts/lib/seedGames.mjs), men den viser
// kun, hvad listen siger — den kan ikke vide, om listen har ret.
//
// EN TING, DER GØR ALT HERUNDER VIGTIGERE: seedet skriver med `merge: true`,
// og merge FJERNER ALDRIG ET FELT. Er `sync` eller `pulje` først skrevet på et
// spil, kan det ikke fjernes ved at slette det fra denne liste — det kræver en
// håndrettelse i konsollen. Testene her beskytter altså den ENESTE chance for
// at få felterne rigtige: den første kørsel.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { GAMES } from './games.mjs';
import { SPORT_PROFILER, ukendtSport } from '../src/lib/superligaScoring.js';
import { faseKalenderFejl } from '../src/lib/faser.js';
import { puljeSeedFejl } from '../src/lib/puljeFacit.js';
import { HAANDBOLD_SPIL } from '../src/test/faseKalender.js';
import { ADMIN_OWNED } from './seed-payload.mjs';
import { SEED_FILER } from './seed-filer.mjs';
import { SYNK_HULLER } from '../src/test/synkHuller.js';
import { harFaseKalender } from '../src/lib/faser.js';
import { HAANDBOLD_VM2027_HOLD } from '../src/data/haandboldVm2027Hold.js';

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
      'vm2026', 'tour2026', 'superliga2627', 'pl2627-efteraar', 'hvm2027',
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
      // En TURNERING (spil med fasekalender) har ingen sæson — årstallet står
      // i navnet, og «Sæson …» foran overskriften ville være forkert (QC).
      if (g.faser === undefined) expect(g.season, g.id).toMatch(/^\d{4}(-\d{2})?$/);
      else expect(g, g.id).not.toHaveProperty('season');
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

  // Håndbold-VM oprettes skjult af samme grund: seedGames skriver spillet,
  // seedKampe den indledende runde, og spillet skal gennemgås (holdnavne,
  // tider, odds), før det står under "Åbne spil — deltag".
  it('opretter Håndbold-VM 2027 skjult, men åbent — som håndboldspil', () => {
    const hvm = GAMES.find((g) => g.id === 'hvm2027');
    expect(hvm).toMatchObject({
      name: 'Håndbold-VM 2027', type: 'football', sport: 'haandbold', status: 'open', joinable: false,
    });
    // Navnet på kortet og i fanerne (shortName) og ikonet — ellers ubundne
    // (mutant overlevede i D6-gennemgangen).
    expect(hvm.shortName).toBe('Håndbold-VM');
    expect(hvm.emoji).toBe('🤾');
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
  // Et aktivt kampspil uden provider er kun i orden som et NAVNGIVET hul
  // (src/test/synkHuller.js) — ellers er det en glemt konfiguration.
  it('giver hvert aktivt kampspil en provider — eller står som et bevidst hul', () => {
    const aktive = GAMES.filter((g) => g.type === 'football' && g.status !== 'finished');
    expect(aktive.length).toBeGreaterThan(0);
    for (const g of aktive.filter((x) => !Object.hasOwn(SYNK_HULLER, x.id))) {
      expect(g.sync, `${g.id} mangler sync`).toBeTruthy();
    }
  });

  // Hullet er bevidst og MIDLERTIDIGT: spillet må ikke have en sync-blok
  // (en provider, serveren ikke har, ville ligne synk på skærmen), og et hul,
  // der har fået sin provider, skal ud af listen i samme PR.
  it('hvert bevidst hul er et aktivt kampspil UDEN sync', () => {
    expect(Object.keys(SYNK_HULLER)).toEqual(['hvm2027']);
    for (const id of Object.keys(SYNK_HULLER)) {
      const g = GAMES.find((x) => x.id === id);
      expect(g, id).toBeTruthy();
      expect(g.type, id).toBe('football');
      expect(g.status, id).not.toBe('finished');
      expect(g, id).not.toHaveProperty('sync');
    }
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
  it('findes på Superligaen, PL-efteråret og Håndbold-VM — og ingen andre', () => {
    expect(GAMES.filter((g) => g.pulje).map((g) => g.id).sort())
      .toEqual(['hvm2027', 'pl2627-efteraar', 'superliga2627']);
  });

  // Ejerens valg (planen §11-tillæg 3): semifinalisterne, deadline = første
  // kamp på første spilledag, og kun ligaer fra første spilledag får puljen.
  it('Håndbold-VM: semifinalisterne, puljeLockRound 1, maksStartRunde 1 — og ingen fast dato', () => {
    const hvm = GAMES.find((g) => g.id === 'hvm2027');
    expect(hvm.pulje).toEqual({
      poolSize: 4, facitKilde: 'runde', facitFase: 'Semifinaler', maksStartRunde: 1,
      labels: { overskrift: '🏆 Semifinalisterne' },
    });
    expect(hvm.puljeLockRound).toBe(1);
    // Ingen puljeLockAt: seedet ville skrive den tilbage over admins værdi,
    // og når kickoff-synken lander, ville to kilder bestemme deadlinen.
    expect('puljeLockAt' in hvm).toBe(false);
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
    // Deadline SOM RUNDE (#8): puljeLockRound udleder selv puljeLockAt fra
    // det tidligste kickoff i runden ved kickoff-synken — ingen hårdkodet dato
    // en landsholdspause kan ramme forbi. Runde 3 = PULJE_MAKS_STARTRUNDE
    // (spilfører-afgørelsen, der holder bonussen inde for alle ligaer, der kan
    // nå at tippe).
    expect(pl.puljeLockRound).toBe(3);
    // puljeLockAt sættes IKKE i config — den udledes. Står den her, er der to
    // kilder til samme deadline, og de kan drive fra hinanden.
    expect('puljeLockAt' in pl).toBe(false);
  });
});

// Seedet skriver `sport` med merge, og merge FJERNER ALDRIG et felt: en tastefejl
// her (`sport: 'handbold'`) kan kun rettes i konsollen — og Ompris-knappen og det
// fulde seed afviser spillet, indtil det er gjort. Et spil UDEN sport er fodbold
// med vilje (SL, PL); et spil MED sport skal være en, registret kender.
// Håndbold-VM 2027 er det første spil med `sport` (D6).
describe('sport på spillene', () => {
  it('præcis Håndbold-VM sætter sport — og til haandbold', () => {
    expect(GAMES.filter((g) => g.sport !== undefined).map((g) => [g.id, g.sport])).toEqual([['hvm2027', 'haandbold']]);
  });

  it('intet spil i listen har et sat-men-ukendt sport', () => {
    expect(GAMES.length).toBeGreaterThan(0);
    for (const g of GAMES) {
      expect(ukendtSport(g), `${g.id}: sport ${JSON.stringify(g.sport)}`).toBe(false);
      if (g.sport !== undefined) expect(Object.keys(SPORT_PROFILER), g.id).toContain(g.sport);
    }
  });
});

// Fasekalenderen (delopgave 5) seedes herfra og skrives med merge — ligesom
// sync og pulje kan den kun rettes i konsollen bagefter. En kalender, der ikke
// består formkontrollen, tæller ikke i fladerne (de viser «Runde N» igen), så
// en fejl her ville tavst slå hele turneringens ord fra.
describe('faser på spillene', () => {
  it('hver kalender i listen består formkontrollen', () => {
    for (const g of GAMES.filter((x) => x.faser !== undefined)) {
      expect(faseKalenderFejl(g.faser), g.id).toEqual([]);
    }
  });

  // FRAVÆRS-ASSERTION MED VILJE. Superligaen og Premier League er ligaer:
  // deres sidste oprettede runde ER sæsonens sidste, og «Runde N af M» er
  // rigtigt dér. Får de en kalender, skifter alle deres tekster til «Dag N».
  it('Superligaen og Premier League har INGEN kalender', () => {
    for (const id of ['superliga2627', 'pl2627-efteraar']) {
      expect(GAMES.find((g) => g.id === id), id).not.toHaveProperty('faser');
    }
  });

  // Kalenderen er spillets program, ikke et admin-valg: et senere seed skal
  // kunne rette den. Stod den i ADMIN_OWNED, blev en rettelse tavst sprunget over.
  it('faser er ikke admin-ejet', () => {
    expect(ADMIN_OWNED).not.toContain('faser');
  });

  // Kalenderen er et SPEJL af programfilens `faser` (scripts/haandbold-
  // program.mjs bygger begge af det filtrerede program). Bygges programmet
  // om, skal kalenderen her følge med — ellers seedes en gammel kalender med
  // merge, og «Dag 7 af 17» tæller forkert.
  it('Håndbold-VM: kalenderen er ordret programfilens og tæller som gyldig', () => {
    const hvm = GAMES.find((g) => g.id === 'hvm2027');
    const program = JSON.parse(readFileSync(resolve(process.cwd(), 'scripts/haandbold-vm2027-program.json'), 'utf8'));
    expect(hvm.faser).toEqual(program.faser);
    expect(harFaseKalender(hvm)).toBe(true);
    expect(hvm.faser.at(-1).til).toBe(17);
    expect(hvm.faser.map((f) => f.navn)).toEqual(['Indledende runde', 'Hovedrunde', 'Kvartfinaler', 'Semifinaler', 'Finaledag']);
  });

  // GRUPPERNE er et spejl af programfilens `grupper` på samme måde som
  // kalenderen: bygges programmet om, skal de følge med, ellers seedes gamle
  // grupper med merge.
  it('Håndbold-VM: grupperne er ordret programfilens', () => {
    const hvm = GAMES.find((g) => g.id === 'hvm2027');
    const program = JSON.parse(readFileSync(resolve(process.cwd(), 'scripts/haandbold-vm2027-program.json'), 'utf8'));
    expect(program.grupper).toBeDefined();
    expect(hvm.grupper).toEqual(program.grupper);
  });

  // STRUKTUREN, uafhængigt af programfilen (så en fejl i byggeren ikke
  // bæres med over i spejlet): hver `fase` er en ikke-knockout-fase i
  // kalenderen, hvert hold står i holdfilen og i præcis én gruppe, og hver
  // hovedrundegruppes `fra` er bogstaver fra den forrige fase — hver brugt
  // én gang.
  // TODO (integration med src/lib/grupper.js): tilføj
  //   expect(grupperFejl(hvm.grupper, hvm)).toEqual([]) og harGrupper(hvm) === true
  // her, når B's grupperFejl er landet. Indtil da bærer denne test formen.
  it('Håndbold-VM: grupperne har kontraktens form og passer til kalenderen og holdene', () => {
    const hvm = GAMES.find((g) => g.id === 'hvm2027');
    const { grupper } = hvm;
    expect(Object.keys(grupper)).toEqual(['point', 'faser']);
    expect(grupper.point).toEqual({ sejr: 2, uafgjort: 1 });
    expect(grupper.faser.map((f) => [f.fase, f.videre])).toEqual([['Indledende runde', 3], ['Hovedrunde', 2]]);
    for (const f of grupper.faser) {
      const fase = hvm.faser.find((x) => x.navn === f.fase);
      expect(fase, f.fase).toBeDefined();
      expect(fase.knockout, f.fase).toBeUndefined();
    }
    const [indledende, hoved] = grupper.faser;
    const holdnavne = new Set(HAANDBOLD_VM2027_HOLD.map((t) => t.name));
    const alle = indledende.grupper.flatMap((g) => g.hold);
    expect(indledende.grupper.map((g) => g.hold.length)).toEqual([4, 4, 4, 4, 4, 4, 4, 4]);
    expect(new Set(alle).size).toBe(32);
    for (const h of alle) expect(holdnavne.has(h), h).toBe(true);
    const bogstaver = indledende.grupper.map((g) => g.navn);
    const fra = hoved.grupper.flatMap((g) => g.fra);
    expect([...fra].sort()).toEqual([...bogstaver].sort());
    // Indledende grupper har `hold` og ingen `fra`; hovedrundens omvendt.
    for (const g of indledende.grupper) expect(Object.keys(g), g.navn).toEqual(['navn', 'hold']);
    for (const g of hoved.grupper) expect(Object.keys(g), g.navn).toEqual(['navn', 'fra']);
  });

  it('Superligaen og Premier League har INGEN grupper', () => {
    for (const id of ['superliga2627', 'pl2627-efteraar']) {
      expect(GAMES.find((g) => g.id === id), id).not.toHaveProperty('grupper');
    }
  });

  // Grupperne er spillets program, ikke et admin-valg: et senere seed skal
  // kunne rette dem. Stod de i ADMIN_OWNED, blev en rettelse tavst sprunget over.
  it('grupper er ikke admin-ejet', () => {
    expect(ADMIN_OWNED).not.toContain('grupper');
  });
});

// Filerne, et spil seedes fra, står i scripts/seed-filer.mjs — IKKE på
// GAMES-posterne, for seedPayload skriver hvert felt ud på spil-dokumentet.
// To lister om samme spil skal bindes, ellers driver de: et nyt fodboldspil
// uden post kan ikke seedes fra workflowet, og en post uden spil seeder et
// spil, platformen ikke kender.
describe('seed-filer pr. spil', () => {
  it('hvert aktivt kampspil har en post i SEED_FILER', () => {
    const aktive = GAMES.filter((g) => g.type === 'football' && g.status !== 'finished');
    expect(aktive.length).toBeGreaterThan(0);
    for (const g of aktive) expect(Object.hasOwn(SEED_FILER, g.id), `${g.id} mangler i scripts/seed-filer.mjs`).toBe(true);
  });

  it('hver post i SEED_FILER er et kampspil i GAMES', () => {
    for (const id of Object.keys(SEED_FILER)) {
      const g = GAMES.find((x) => x.id === id);
      expect(g, `${id} findes ikke i GAMES`).toBeTruthy();
      expect(g.type, id).toBe('football');
    }
  });

  it('ingen GAMES-post bærer filstier (de ville blive seedet ud i produktionsdata)', () => {
    for (const g of GAMES) {
      for (const k of ['teams', 'fixtures', 'runder', 'seedFiler']) expect(g, `${g.id}.${k}`).not.toHaveProperty(k);
    }
  });
});

// En RUNDE-pulje ("hvem når semifinalerne?", facitKilde: 'runde') afgøres af
// holdene i en fase af kalenderen. Står fasen ikke i kalenderen, har den intet
// antalKampe, eller passer poolSize ikke til fasens hold, kan puljen ALDRIG
// afgøres — og det ville først vise sig ved semifinalerne. Skrevet med merge,
// så den første kørsel er den eneste gode chance (se toppen af filen).
// Vagten (puljeSeedFejl) bor i src/lib/puljeFacit.js — ikke her — så den
// også gælder kørslen, der skriver: scripts/seed-games.mjs afviser HELE
// seedet, før noget skrives, hvis én post har en fejl (beviset nedenfor).
describe('runde-puljer på spillene', () => {
  it('hver pulje i listen kan afgøres', () => {
    for (const g of GAMES.filter((x) => x.pulje)) {
      expect(puljeSeedFejl(g), g.id).toEqual([]);
    }
  });

  // «STADIG MED»-PULSEN (QC på pulsen, Bør 4): pulsen tæller kun HELE faser,
  // og «hel» kræver fasens antalKampe. Feltet er valgfrit i kalenderen, og
  // puljeKonfigFejl tjekker kun facit-fasen — en hovedrunde uden antal ville
  // gøre pulsen tavst mørk. Bundet her (ikke i afregningens gate, som det ikke
  // må blokere): hver fase til og med facit-fasen har et antal.
  it('hver fase til og med facit-fasen har antalKampe — ellers kan pulsen aldrig tænde', () => {
    const rundePuljer = GAMES.filter((x) => x.pulje?.facitKilde === 'runde');
    expect(rundePuljer.map((g) => g.id)).toEqual(['hvm2027']);
    for (const g of rundePuljer) {
      const slut = g.faser.findIndex((f) => f.navn === g.pulje.facitFase);
      expect(slut, g.id).toBeGreaterThan(0);
      for (const f of g.faser.slice(0, slut + 1)) {
        expect(Number.isInteger(f.antalKampe) && f.antalKampe > 0, `${g.id} · ${f.navn}`).toBe(true);
      }
    }
  });

  // Listen HAR en runde-pulje (hvm2027), så testen ovenfor dækker den. Her
  // bevises vagten på samme form — og på de fejl, den skal fange
  // (modstander-bemærkning). Formen er bundet til hvm2027's nedenfor.
  it('vagten er rød på en forkert runde-pulje og grøn på den tilsigtede form', () => {
    const TILSIGTET = {
      ...HAANDBOLD_SPIL,
      pulje: { poolSize: 4, facitKilde: 'runde', facitFase: 'Semifinaler', maksStartRunde: 1, labels: { overskrift: '🏆 Semifinalisterne' } },
      puljeLockRound: 1,
    };
    expect(puljeSeedFejl(TILSIGTET)).toEqual([]);
    const hvm = GAMES.find((g) => g.id === 'hvm2027');
    expect(hvm.pulje).toEqual(TILSIGTET.pulje);
    expect(hvm.puljeLockRound).toBe(TILSIGTET.puljeLockRound);
    const uden = { ...TILSIGTET, pulje: { ...TILSIGTET.pulje, maksStartRunde: undefined } };
    expect(puljeSeedFejl(uden)).toEqual(['maksStartRunde skal sættes eksplicit på en runde-pulje (ejerens valg — håndbold-VM: 1)']);
    expect(puljeSeedFejl({ ...TILSIGTET, pulje: { ...TILSIGTET.pulje, maksStartRunde: 0 } })).toHaveLength(1);
    expect(puljeSeedFejl({ ...TILSIGTET, pulje: { ...TILSIGTET.pulje, facitFase: 'Ottendedele' } }))
      .toEqual(['fasen «Ottendedele» findes ikke i kalenderen']);
    expect(puljeSeedFejl({ ...TILSIGTET, pulje: { ...TILSIGTET.pulje, poolSize: 8 } })).toHaveLength(1);
    // SL/PL-formen kræver ingen grænse — standarden er deres.
    expect(puljeSeedFejl({ pulje: { poolSize: 6 } })).toEqual([]);
  });

  // seed-games.mjs kan ikke importeres (firebase-admin initialiseres på
  // øverste niveau), så LEDNINGEN bevogtes som tekst. Forløbet (vagt før
  // første læsning, ingen skrivning uden skriv) er bevist med en fake
  // Firestore i scripts/lib/seedGames.test.mjs; her bindes, at scriptet
  // faktisk sender vagten og --skriv videre — og ikke selv skriver.
  it('seed-games.mjs sender pulje-vagten og --skriv til det testede forløb — og skriver ikke selv', () => {
    const kilde = readFileSync(resolve(process.cwd(), 'scripts/seed-games.mjs'), 'utf8')
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(kilde).toMatch(/const \{ puljeSeedFejl \} = createRequire\(import\.meta\.url\)\('\.\.\/functions-platform\/puljeFacit\.js'\);/);
    expect(kilde).toMatch(/const \{ koerSeedGames \} = await import\('\.\/lib\/seedGames\.mjs'\);/);
    // SKRIV kommer KUN fra et præcist --skriv, og et ukendt argument afvises.
    expect(kilde).toMatch(/const SKRIV = argv\.includes\('--skriv'\);/);
    expect(kilde).toMatch(/const ukendte = argv\.filter\(\(a\) => a !== '--skriv'\);\nif \(ukendte\.length\) \{\n[^\n]*\n {2}process\.exit\(1\);\n\}/);
    expect(kilde).toMatch(/koerSeedGames\(\{\s*games: GAMES, db, skriv: SKRIV, now, puljeSeedFejl,/);
    for (const skriv of ['.batch(', '.set(', '.commit(', '.update(']) expect(kilde, skriv).not.toContain(skriv);
    expect(kilde.match(/koerSeedGames\(/g)).toHaveLength(1);
    // Sidste linje i en Actions-log må ikke kunne læses som en skrivning:
    // efter en tør-kørsel siger den det (modstander/Security D6).
    expect(kilde).toContain("console.log(SKRIV ? '\\n✅ Færdig.' : '\\n✅ Færdig (tør-kørsel — intet skrevet).')");
  });

  // FRAVÆRS-ASSERTION MED VILJE: Superligaen og Premier League skal have
  // præcis de puljer, de har i dag. maksStartRunde er en turnerings-knap
  // (dage, ikke uger); facitFase findes kun på en runde-pulje.
  it('Superligaen og Premier League har hverken maksStartRunde eller facitFase', () => {
    for (const id of ['superliga2627', 'pl2627-efteraar']) {
      const g = GAMES.find((x) => x.id === id);
      expect(g.pulje, id).not.toHaveProperty('maksStartRunde');
      expect(g.pulje, id).not.toHaveProperty('facitFase');
      expect(g.pulje.facitKilde, id).not.toBe('runde');
    }
  });
});
