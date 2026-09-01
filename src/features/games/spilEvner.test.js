import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import {
  KICKOFF_PROVIDERE, RESULTAT_PROVIDERE, XG_PROVIDERE, KAMPDETALJE_SPIL,
  harKickoffSynk, harXg, harResultatSynk, harKampdetaljer,
} from './spilEvner';
import { GAMES } from '../../../scripts/games.mjs';

// Kampdetalje-evnen spejles mod SERVERENS egen liste og ikke mod games.mjs.
// De andre evner kan nøjes med games.mjs, fordi de er egenskaber ved den
// provider, DER STÅR i sync-feltet. Kampdetalje-kilden står bevidst ikke i
// sync (den seedes ikke ud på dokumentet), så games.mjs ved intet om den —
// og en spejling mod en fil, der ikke kender evnen, ville være en tom vagt.
const require = createRequire(import.meta.url);
const { SYNCED_GAMES } = require('../../../functions-platform/syncProviders');

describe('harKickoffSynk', () => {
  it('er sand for de kilder, der har en daglig kickoff-synk (pulselive, superliga)', () => {
    expect(harKickoffSynk({ sync: { provider: 'pulselive' } })).toBe(true);
    expect(harKickoffSynk({ sync: { provider: 'superliga' } })).toBe(true);
  });

  it('er falsk for et spil uden synk eller med en kilde uden kickoff-synk', () => {
    expect(harKickoffSynk({})).toBe(false);
    expect(harKickoffSynk({ sync: {} })).toBe(false);
    expect(harKickoffSynk({ sync: { provider: 'en-anden' } })).toBe(false);
    expect(harKickoffSynk(null)).toBe(false);
  });

  it('sættet indeholder præcis de to kendte kilder', () => {
    expect([...KICKOFF_PROVIDERE].sort()).toEqual(['pulselive', 'superliga']);
  });
});

describe('harResultatSynk', () => {
  it('er sand for de implementerede kilder (pulselive, superliga)', () => {
    expect(harResultatSynk({ sync: { provider: 'pulselive' } })).toBe(true);
    expect(harResultatSynk({ sync: { provider: 'superliga' } })).toBe(true);
  });

  // ALLOWLISTE-BEVISET: et spil kan seedes med en provider, serveren endnu
  // ikke har implementeret (games.mjs tillader det udtrykkeligt). En gate på
  // `!!sync.provider` ville vise en knap, hvis kald kun kan fejle med
  // invalid-argument. Muteres allowlisten til en sandheds-gate, bliver
  // 'endnu-ikke-bygget'-linjen rød.
  it('er falsk for et spil uden synk eller med en endnu ikke implementeret provider', () => {
    expect(harResultatSynk({})).toBe(false);
    expect(harResultatSynk({ sync: {} })).toBe(false);
    expect(harResultatSynk({ sync: { provider: 'endnu-ikke-bygget' } })).toBe(false);
    expect(harResultatSynk(null)).toBe(false);
  });

  it('sættet indeholder præcis de to implementerede kilder', () => {
    expect([...RESULTAT_PROVIDERE].sort()).toEqual(['pulselive', 'superliga']);
  });
});

describe('XG_PROVIDERE', () => {
  it('indeholder præcis de kilder, serveren har hentXg for', () => {
    // Søskende-evnerne har den samme test. Uden den kunne en tredje kilde
    // føjes til sættet UDEN at serveren har hentXg — og så ville guiden
    // forklare et tal, spillet aldrig får. Sættet er kun korrekt i dag, fordi
    // begge nuværende providere tilfældigvis har metoden; intet binder dem.
    expect([...XG_PROVIDERE].sort()).toEqual(['pulselive', 'superliga']);
  });

  it('en ukendt kilde har ikke evnen', () => {
    expect(harXg({ sync: { provider: 'noget-andet' } })).toBe(false);
    expect(harXg({})).toBe(false);
    expect(harXg(null)).toBe(false);
  });
});

// SPEJLINGS-TRIPWIRE mod den levende spilliste: serverens synk (og dermed
// knappernes berettigelse) afgøres af games.mjs' sync-felt. Får et spil en
// provider — eller mister et den — skal dette billede ændre sig, og testen
// tvinger allowlisterne til at blive taget stilling til i samme PR (spejler
// syncProviders.test.js' games.mjs⇄SYNCED_GAMES-tripwire på klientsiden).
describe('harKampdetaljer', () => {
  it('er sand for spillene med livescore-kortlægning', () => {
    expect(harKampdetaljer({ id: 'superliga2627' })).toBe(true);
    expect(harKampdetaljer({ id: 'pl2627-efteraar' })).toBe(true);
  });

  it('gates på SPILLET, ikke på provideren', () => {
    // Dét, testen findes for. Et fremtidigt spil med samme facit-kilde, men
    // uden livescore-kortlægning, må IKKE arve knap og hjælpetekst — det er
    // puljeLockRound-fejlen, hvor en gate testede en nabo-egenskab.
    expect(harKampdetaljer({ id: 'pl2728-foraar', sync: { provider: 'pulselive' } })).toBe(false);
    expect(harKampdetaljer({ id: 'sl2728', sync: { provider: 'superliga' } })).toBe(false);
  });

  it('er falsk uden id', () => {
    expect(harKampdetaljer({})).toBe(false);
    expect(harKampdetaljer(null)).toBe(false);
    expect(harKampdetaljer(undefined)).toBe(false);
  });
});

// SPEJLINGS-TRIPWIRE mod serverens SYNCED_GAMES. Får et spil
// livescore-kortlægning — eller mister et den — skal begge sider ændres i
// SAMME PR, ellers får fladen en knap, hvis kald kun kan fejle, eller
// serveren en synk, ingen kan starte og ingen kan se fejle.
describe('spejling mod functions-platform/syncProviders.js', () => {
  it('KAMPDETALJE_SPIL er præcis de spil, serveren har en livescore-konfiguration for', () => {
    const server = SYNCED_GAMES.filter((g) => g.livescore).map((g) => g.gameId).sort();
    expect([...KAMPDETALJE_SPIL].sort()).toEqual(server);
  });

  it('hvert spil i KAMPDETALJE_SPIL findes overhovedet i games.mjs', () => {
    // Ellers gater fladen på et id, der ikke er noget spil — evnen ville være
    // usynlig uden at nogen test blev rød.
    for (const id of KAMPDETALJE_SPIL) {
      expect(GAMES.some((g) => g.id === id), id).toBe(true);
    }
  });
});

describe('spejling mod scripts/games.mjs', () => {
  it('præcis Superligaen og PL har resultat-synk (og dermed ⬇️-knappen)', () => {
    const med = GAMES.filter((g) => harResultatSynk(g)).map((g) => g.id).sort();
    expect(med).toEqual(['pl2627-efteraar', 'superliga2627']);
  });

  it('præcis Superligaen og PL har kickoff-synk (og dermed 🗓️-knappen + Drift-kort)', () => {
    const med = GAMES.filter((g) => harKickoffSynk(g)).map((g) => g.id).sort();
    expect(med).toEqual(['pl2627-efteraar', 'superliga2627']);
  });

  it('præcis Superligaen og PL har xG (og dermed guidens målchance-afsnit)', () => {
    // Uden denne kunne en fremtidig kilde med resultat-synk, men UDEN hentXg,
    // få en guide-sektion, ingen kamp nogensinde udfylder — en regelbog om et
    // tal, spillet aldrig får. hentXg er VALGFRI i provider-kontrakten, modsat
    // hentFaerdige, så de tre allowlister kan lovligt divergere. Netop derfor
    // skal hver af dem tages stilling til i den PR, der ændrer dem.
    const med = GAMES.filter((g) => harXg(g)).map((g) => g.id).sort();
    expect(med).toEqual(['pl2627-efteraar', 'superliga2627']);
  });
});
