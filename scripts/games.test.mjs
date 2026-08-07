// Spil-listen mod de invarianter, den skal overholde.
//
// Listen stod uden for enhver kontrol, indtil den blev skilt ud af
// seed-games.mjs. Den beskriver præcis de felter, en fejl er dyrest i: hvor
// facit hentes fra, og hvilke faner et spil har. Og den skrives DIREKTE i
// produktionsdata — der er ingen tør-kørsel på seed-games.
import { describe, it, expect } from 'vitest';
import { GAMES } from './games.mjs';

/** De providere, koden kender. En værdi udenfor denne liste synkes ikke. */
const KENDTE_PROVIDERE = ['superliga', 'pulselive'];

const fodbold = GAMES.filter((g) => g.type === 'football' && g.status !== 'finished');

describe('spil-listen', () => {
  it('har entydige id\'er og rækkefølge', () => {
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(GAMES.length);
    expect(new Set(GAMES.map((g) => g.order)).size).toBe(GAMES.length);
  });

  it('har de felter, fladen læser, på hvert spil', () => {
    for (const g of GAMES) {
      expect(g.name, g.id).toBeTruthy();
      expect(g.shortName, g.id).toBeTruthy();
      expect(g.type, g.id).toMatch(/^(football|cycling)$/);
      expect(['open', 'live', 'finished'], g.id).toContain(g.status);
      expect(typeof g.joinable, g.id).toBe('boolean');
    }
  });
});

describe('sync — hvor facit hentes fra', () => {
  // Uden sync bliver spillet ikke synket, og fejlen er TAVS: kampene står bare
  // uden facit. Kun den strandede-alarm ville råbe op, og først timer efter.
  it('giver hvert aktivt fodboldspil en provider', () => {
    expect(fodbold.length).toBeGreaterThan(0);
    for (const g of fodbold) {
      expect(g.sync, `${g.id} mangler sync`).toBeTruthy();
      expect(KENDTE_PROVIDERE, g.id).toContain(g.sync.provider);
    }
  });

  // DEN VIGTIGSTE TEST I FILEN. firestore.rules giver isGlobalAdmin()
  // skriveadgang til HELE spil-dokumentet, så alt i sync kan ændres udefra af
  // en kompromitteret admin-konto. Står der en vært her, er det en SSRF-vej ud
  // af en Cloud Function. Værdierne må kun bruges som tal i en query-string —
  // aldrig som adresse.
  it('indeholder ingen URL, vært eller sti — kun id\'er', () => {
    for (const g of fodbold) {
      for (const [k, v] of Object.entries(g.sync)) {
        if (k === 'provider') continue;
        expect(typeof v, `${g.id}.sync.${k}`).toBe('number');
      }
      const rå = JSON.stringify(g.sync);
      expect(rå, g.id).not.toMatch(/https?:|\/\/|\.(com|dk|net|org)/i);
    }
  });

  // Superligaens tre id'er og Premier Leagues to har intet til fælles. Formen
  // KAN altså ikke være fast — men den skal være rigtig pr. provider, ellers
  // bygger URL-byggeren en adresse, der svarer 404 og fejler tavst.
  it('har de nøgler, hver provider faktisk skal bruge', () => {
    for (const g of fodbold) {
      if (g.sync.provider === 'superliga') {
        expect(g.sync, g.id).toMatchObject({
          seasonId: expect.any(Number), tournamentId: expect.any(Number), stageId: expect.any(Number),
        });
      }
      if (g.sync.provider === 'pulselive') {
        expect(g.sync, g.id).toMatchObject({
          competitionId: expect.any(Number), season: expect.any(Number),
        });
      }
    }
  });
});

describe('pulje — hvilke spil har et mesterskabsspil at tippe om', () => {
  // Feltets TILSTEDEVÆRELSE er signalet. Mangler det, har spillet ingen pulje,
  // og fanen skal ikke vises. Superligaens top-6 er en egenskab ved DEN liga.
  it('findes kun på Superligaen', () => {
    const medPulje = GAMES.filter((g) => g.pulje).map((g) => g.id);
    expect(medPulje).toEqual(['superliga2627']);
  });

  it('har en poolSize, der matcher pointreglen', async () => {
    const { PULJE } = await import('../src/lib/superligaScoring.js');
    for (const g of GAMES.filter((x) => x.pulje)) {
      expect(g.pulje.poolSize, g.id).toBe(PULJE.POOL_SIZE);
    }
  });

  // Premier League har ingen opdeling i mesterskabs- og nedrykningsspil.
  // Fik den et pulje-felt ved et uheld, ville spillerne få en fane, hvor de
  // skulle udpege seks hold til noget, der ikke findes — og et gem ville
  // ramme firestore.rules' `size() == 6` og fejle uden forklaring.
  it('findes IKKE på Premier League', () => {
    for (const g of GAMES.filter((x) => x.id.startsWith('pl'))) {
      expect(g.pulje, g.id).toBeUndefined();
    }
  });
});

describe('Premier League', () => {
  it('er skåret på rundenummer, ikke dato — efteråret er sit eget spil', () => {
    const pl = GAMES.find((g) => g.id === 'pl2627-efteraar');
    expect(pl).toBeTruthy();
    expect(pl.type).toBe('football');
    expect(pl.season).toBe('2026-27');
  });
});
