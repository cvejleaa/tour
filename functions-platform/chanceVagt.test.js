import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  setChanceCore, erKampLaast, normaliserIndsats, harFacit, kickoffMs,
  chanceFejl, CHANCE_ERR,
} = require('./chanceVagt');
const KILDE = require('fs').readFileSync(new URL('./chanceVagt.js', import.meta.url), 'utf8');

const FieldValue = { serverTimestamp: () => ({ __ts: true }) };

const NU = Date.parse('2026-08-08T18:00:00Z');
const T = (iso) => Date.parse(iso);

// --- Fake-Firestore ---------------------------------------------------------
// Nok til at køre kernen: én transaktion med get/getAll/where-get/set.
// `state.skrevet` opsamler hver skrivning, så testene kan se PRÆCIS hvilke
// felter der landede hvor — ikke bare at der blev skrevet.
function makeDb({ erSpiller = true, spiller = { uid: 'me' }, bruger = { status: 'approved' }, kampe = [], tips = [] } = {}) {
  const state = { skrevet: [], laesninger: 0 };
  const kampAf = new Map(kampe.map((k) => [k.id, k]));
  const tipAf = new Map(tips.map((t) => [t.id, t]));

  const snapAf = (id, map) => {
    const d = map.get(id);
    return {
      id,
      exists: !!d,
      data: () => (d ? { ...d } : undefined),
      ref: { id, set: null },
    };
  };
  const betRef = (id) => ({ id, __bet: true });

  const matchesCol = {
    doc: (id) => ({ __match: id }),
    where: (felt, _op, vaerdi) => ({ __query: { felt, vaerdi } }),
  };
  const betsCol = { doc: (id) => betRef(id) };
  const playersCol = { doc: (id) => ({ __player: id }) };

  const tx = {
    async get(ref) {
      // Firestore KRÆVER alle læsninger før første skrivning. Uden denne
      // vagt var fake'en mere eftergivende end den ægte transaktion, og en
      // ombytning af rækkefølgen ville stå grøn her og fejle i produktionen
      // (Test Manager-fund: den mutation overlevede hele suiten).
      if (state.skrevet.length) throw new Error('læsning efter skrivning i transaktionen');
      state.laesninger += 1;
      if (ref.__user) return { exists: !!bruger, data: () => bruger };
      if (ref.__player) return { exists: erSpiller, data: () => spiller };
      if (ref.__match) return snapAf(ref.__match, kampAf);
      if (ref.__query) {
        const { felt, vaerdi } = ref.__query;
        const traef = kampe.filter((k) => k[felt] === vaerdi);
        return { docs: traef.map((k) => ({ id: k.id, data: () => ({ ...k }) })) };
      }
      throw new Error(`ukendt ref: ${JSON.stringify(ref)}`);
    },
    // Skrivninger går gennem tx.set(ref, …) som i Admin SDK — ikke på ref'en
    // selv. Ellers ville fake'en tillade et kald, den ægte transaktion afviser.
    set(ref, patch, opts) { state.skrevet.push({ id: ref.id, patch, opts }); },
    async getAll(...refs) {
      state.laesninger += refs.length;
      return refs.map((r) => {
        const d = tipAf.get(r.id);
        return { id: r.id, exists: !!d, data: () => (d ? { ...d } : undefined), ref: r };
      });
    },
  };

  return {
    _state: state,
    collection: (navn) => (navn === 'users' ? { doc: (id) => ({ __user: id }) } : {
      doc: () => ({
        collection: (sub) => {
          if (sub === 'matches') return matchesCol;
          if (sub === 'bets') return betsCol;
          return playersCol;
        },
      }),
    }),
    async runTransaction(fn) { return fn(tx); },
  };
}

/** To kampe i runde 3, én i runde 4 — nok til at vise, at snittet virker. */
function standardKampe() {
  return [
    { id: 'm1', round: 3, home: 'Brøndby', away: 'FCK', kickoff: T('2026-08-09T16:00:00Z') },
    { id: 'm2', round: 3, home: 'AGF', away: 'FCM', kickoff: T('2026-08-09T18:00:00Z') },
    { id: 'm9', round: 4, home: 'OB', away: 'Viborg', kickoff: T('2026-08-16T16:00:00Z') },
  ];
}
const tip = (matchId, extra = {}) => ({ id: `u1_${matchId}`, uid: 'u1', matchId, pick: '1', ...extra });

async function saet(opts, arg) {
  const db = makeDb(opts);
  const res = await setChanceCore(db, FieldValue, { uid: 'u1', gameId: 'g1', nowMs: NU, ...arg });
  return { res, db };
}
async function fanger(opts, arg) {
  try {
    await saet(opts, arg);
  } catch (e) { return e; }
  throw new Error('forventede en fejl, men kaldet lykkedes');
}

// --- kickoffMs / harFacit ---------------------------------------------------
describe('kickoffMs', () => {
  it('læser tal, streng, Timestamp og Date', () => {
    expect(kickoffMs({ kickoff: 1000 })).toBe(1000);
    expect(kickoffMs({ kickoff: '2026-08-09T16:00:00Z' })).toBe(T('2026-08-09T16:00:00Z'));
    expect(kickoffMs({ kickoff: { toMillis: () => 42 } })).toBe(42);
    expect(kickoffMs({ kickoff: new Date(77) })).toBe(77);
    expect(kickoffMs({ kickoff: { seconds: 5 } })).toBe(5000);
  });
  it('giver null for manglende og ulæselige værdier', () => {
    expect(kickoffMs({})).toBe(null);
    expect(kickoffMs({ kickoff: 'i morgen' })).toBe(null);
    expect(kickoffMs({ kickoff: NaN })).toBe(null);
  });
});

describe('harFacit', () => {
  it('er sand ved result ELLER begge målscorer — også 0-0', () => {
    expect(harFacit({ result: '1' })).toBe(true);
    expect(harFacit({ homeGoals: 0, awayGoals: 0 })).toBe(true);
  });
  it('er falsk ved tomme felter og halvt facit', () => {
    expect(harFacit({})).toBe(false);
    expect(harFacit({ result: '' })).toBe(false);
    expect(harFacit({ homeGoals: 2 })).toBe(false);
    expect(harFacit({ homeGoals: 2, awayGoals: '' })).toBe(false);
  });
});

// --- VAGT "HVORNÅR" ---------------------------------------------------------
describe('erKampLaast', () => {
  const senere = { kickoff: NU + 3600e3 };
  it('låser ikke en kamp, der endnu ikke er begyndt', () => {
    expect(erKampLaast(senere, NU)).toBe(false);
  });
  it('låser når kickoff er passeret — også præcis PÅ kickoff', () => {
    expect(erKampLaast({ kickoff: NU - 1 }, NU)).toBe(true);
    expect(erKampLaast({ kickoff: NU }, NU)).toBe(true);
  });
  it('låser når kampen har facit, selv om kickoff ligger i fremtiden', () => {
    expect(erKampLaast({ ...senere, result: 'X' }, NU)).toBe(true);
  });
  it('låser når kilden melder kampen i gang, selv om kickoff ligger i fremtiden', () => {
    // Fx en kamp, der startede før tid, eller et forkert gemt kickoff.
    expect(erKampLaast({ ...senere, live: { status: 'direkte' } }, NU)).toBe(true);
    expect(erKampLaast({ ...senere, live: { status: 'slut' } }, NU)).toBe(true);
  });
  it('LÅSER en AFBRUDT kamp — den rullede, og stillingen var synlig', () => {
    // Kilden skriver kun et live-felt for kampe, den melder `inprogress`
    // (syncProviders.js:173), så 'afbrudt' står ALDRIG på en udsat kamp — kun
    // på en, der gik i gang og blev afbrudt. En tidligere udgave af vagten
    // frigav her og gav dermed chancen tilbage, efter spilleren havde set
    // stillingen. Denne test er tripwiren mod, at den gren kommer igen.
    expect(erKampLaast({ kickoff: NU - 3600e3, live: { status: 'afbrudt', home: 3, away: 0 } }, NU)).toBe(true);
  });
  it('FRIGIVER en udsat kamp — udsættelse er en FLYTTET kickoff, ikke en status', () => {
    // Kickoff-synken rykker tiden frem; så er kampen ikke længere passeret,
    // og spilleren er ikke låst fast til en kamp, der aldrig blev spillet.
    // Ingen live-status er involveret, fordi kilden aldrig så kampen i gang.
    expect(erKampLaast({ kickoff: NU + 21 * 24 * 3600e3 }, NU)).toBe(false);
  });
  it('låser ved ulæseligt eller manglende kickoff — en vagt i tvivl siger nej', () => {
    expect(erKampLaast({}, NU)).toBe(true);
    expect(erKampLaast({ kickoff: 'snart' }, NU)).toBe(true);
    expect(erKampLaast(null, NU)).toBe(true);
    expect(erKampLaast(undefined, NU)).toBe(true);
  });
});

// --- VAGT "HVOR STOR" -------------------------------------------------------
describe('normaliserIndsats', () => {
  it('tillader 0 (fjern chancen) og hele tal i MIN..MAX_ABS', () => {
    expect(normaliserIndsats(0)).toBe(0);
    expect(normaliserIndsats(1)).toBe(1);
    expect(normaliserIndsats(8)).toBe(8);
  });
  it('afviser over loftet, negativ, decimal og alt, der ikke ER et tal', () => {
    // '', null og [] koger alle til 0 med Number() — de må ikke tavst blive
    // læst som "fjern chancen".
    for (const v of [9, 100, -1, 2.5, '3', 'tre', '', null, undefined, NaN, Infinity, [], {}]) {
      expect(() => normaliserIndsats(v), `${String(v)} burde afvises`).toThrow('bad-stake');
    }
  });
  it('lader være med at kopiere det BANK-afhængige loft', () => {
    // 15 %-loftet hører til afregningen (clampStake): saldoen ved skrivning er
    // ikke saldoen ved afregning, og to kopier ville være to regler med ét navn.
    // Kernen må ikke IMPLEMENTERE bank-loftet...
    expect(KILDE).not.toMatch(/CAP_FRACTION\s*[*.]|chanceMaxStake\(|isValidStake\(/);
    // ...og den må heller ikke PÅSTÅ, at afregningen gør det. gameScoring
    // kalder scoreBet uden bank, så det loft findes ikke — en kommentar, der
    // udpeger en vagt, som ikke er der, gør hullet sværere at finde.
    const scoring = require('fs').readFileSync(new URL('./gameScoring.js', import.meta.url), 'utf8');
    expect(scoring).not.toMatch(/scoreBet\([^)]*bank/);
    expect(KILDE).toMatch(/håndhæves I DAG SLET IKKE/);
  });
});

// --- Fejltabellen -----------------------------------------------------------
describe('CHANCE_ERR', () => {
  it('dækker hver kode, kernen faktisk kaster — og intet mere', () => {
    // Både fejl('x') og new Error('x') — ellers ville en kode, der kastes uden
    // for transaktionen (bad-stake), stå udækket i tabellen.
    const kastet = new Set(
      [...KILDE.matchAll(/(?:fejl|new Error)\('([a-z-]+)'/g)].map((m) => m[1]),
    );
    expect(kastet.size).toBeGreaterThan(5);
    for (const k of kastet) expect(Object.keys(CHANCE_ERR)).toContain(k);
    for (const k of Object.keys(CHANCE_ERR)) expect([...kastet]).toContain(k);
  });
  it('nævner KAMPEN og runden i "allerede brugt"-beskeden', () => {
    const [kode, besked] = chanceFejl(
      Object.assign(new Error('chance-laast'), { detaljer: { gruppe: 3, kamp: 'Brøndby–FCK' } }),
    );
    expect(kode).toBe('failed-precondition');
    expect(besked).toContain('runde 3');
    expect(besked).toContain('Brøndby–FCK');
    expect(besked).toContain('gået i gang');
    // Den må ikke være en indholdsløs afvisning — reglen skal kunne læres af den.
    expect(besked).not.toMatch(/^Handlingen|afvist\.$/);
    expect(besked).not.toContain('{');
  });
  it('falder tilbage til internal for en ukendt fejl', () => {
    expect(chanceFejl(new Error('noget-helt-andet'))[0]).toBe('internal');
    expect(chanceFejl(undefined)[0]).toBe('internal');
  });
  it('nævner de faktiske grænser i bad-stake', () => {
    expect(CHANCE_ERR['bad-stake'][1]).toContain('1');
    expect(CHANCE_ERR['bad-stake'][1]).toContain('8');
  });
});

// --- Kernen: den glade vej --------------------------------------------------
describe('setChanceCore — sætter chancen', () => {
  it('skriver indsats, tidspunkt og flytnings-tæller på tippet', async () => {
    const { res, db } = await saet(
      { kampe: standardKampe(), tips: [tip('m1')] },
      { matchId: 'm1', stake: 5 },
    );
    expect(res).toMatchObject({ ok: true, gruppe: 3, indsats: 5, matchId: 'm1', flyttetFra: [] });
    expect(db._state.skrevet).toHaveLength(1);
    expect(db._state.skrevet[0]).toMatchObject({
      id: 'u1_m1',
      patch: { chanceStake: 5, chanceSatAt: NU, chanceFlytninger: 1 },
      opts: { merge: true },
    });
    // points må ALDRIG røres herfra — feltet ejes af afregningen.
    expect(Object.keys(db._state.skrevet[0].patch)).not.toContain('points');
  });

  it('fjerner chancen med indsats 0 og nulstiller tidspunktet', async () => {
    const { db } = await saet(
      { kampe: standardKampe(), tips: [tip('m1', { chanceStake: 5, chanceSatAt: NU - 1e5, chanceFlytninger: 2 })] },
      { matchId: 'm1', stake: 0 },
    );
    expect(db._state.skrevet[0].patch).toMatchObject({
      chanceStake: 0, chanceSatAt: null, chanceFlytninger: 2,
    });
  });

  it('FLYTTER en åben chance fra en anden kamp i runden', async () => {
    const { res, db } = await saet(
      {
        kampe: standardKampe(),
        tips: [tip('m1', { chanceStake: 4, chanceFlytninger: 1 }), tip('m2')],
      },
      { matchId: 'm2', stake: 6 },
    );
    expect(res.flyttetFra).toEqual(['u1_m1']);
    const fra = db._state.skrevet.find((s) => s.id === 'u1_m1');
    const til = db._state.skrevet.find((s) => s.id === 'u1_m2');
    expect(fra.patch).toMatchObject({ chanceStake: 0, chanceSatAt: null });
    expect(til.patch).toMatchObject({ chanceStake: 6, chanceFlytninger: 1 });
  });

  it('lader en LÅST kamp UDEN chance i runden være i fred', async () => {
    // Den overlevende mutation: uden `chanceStake > 0`-vagten ville løkken
    // kaste chance-laast for en låst kamp, spilleren aldrig satte ⚡ på — og
    // en spiller med sin chance i behold ville få at vide, at han havde
    // brugt den.
    const kampe = standardKampe();
    kampe[0].kickoff = NU - 60e3;          // m1 er i gang, men uden chance
    const { res, db } = await saet(
      { kampe, tips: [tip('m1'), tip('m2')] },
      { matchId: 'm2', stake: 3 },
    );
    expect(res).toMatchObject({ ok: true, indsats: 3, flyttetFra: [] });
    expect(db._state.skrevet.map((s) => s.id)).toEqual(['u1_m2']);
  });

  it('rører IKKE en chance i en anden runde', async () => {
    const { res, db } = await saet(
      {
        kampe: standardKampe(),
        tips: [tip('m9', { chanceStake: 8 }), tip('m1')],
      },
      { matchId: 'm1', stake: 2 },
    );
    expect(res.flyttetFra).toEqual([]);
    expect(db._state.skrevet.map((s) => s.id)).toEqual(['u1_m1']);
  });

  it('skriver INTET, når den samme indsats sættes igen på den samme kamp', async () => {
    // Uden no-op-vagten talte et gentaget klik chanceFlytninger op og rykkede
    // chanceSatAt — revisionsfeltet blev støj, og et klik-loop blev skrivninger.
    const { res, db } = await saet(
      { kampe: standardKampe(), tips: [tip('m1', { chanceStake: 5, chanceFlytninger: 1 })] },
      { matchId: 'm1', stake: 5 },
    );
    expect(res).toMatchObject({ ok: true, uaendret: true, flyttetFra: [] });
    expect(db._state.skrevet).toEqual([]);
  });

  it('skriver dog, når indsatsen ÆNDRES på den samme kamp', async () => {
    const { res, db } = await saet(
      { kampe: standardKampe(), tips: [tip('m1', { chanceStake: 5, chanceFlytninger: 1 })] },
      { matchId: 'm1', stake: 6 },
    );
    expect(res.uaendret).toBe(false);
    expect(db._state.skrevet[0].patch).toMatchObject({ chanceStake: 6, chanceFlytninger: 2 });
  });

  it('tæller flytninger op pr. tip, så summen over runden er antal gange lagt', async () => {
    const { db } = await saet(
      { kampe: standardKampe(), tips: [tip('m1', { chanceFlytninger: 3 })] },
      { matchId: 'm1', stake: 1 },
    );
    expect(db._state.skrevet[0].patch.chanceFlytninger).toBe(4);
  });
});

// --- Kernen: vagterne -------------------------------------------------------
describe('setChanceCore — afviser', () => {
  it('en chance på en kamp, der er gået i gang', async () => {
    const kampe = standardKampe();
    kampe[0].kickoff = NU - 60e3;
    const e = await fanger({ kampe, tips: [tip('m1')] }, { matchId: 'm1', stake: 3 });
    expect(e.message).toBe('kamp-laast');
  });

  it('en ANDEN chance, når den første kamp er låst — og navngiver kampen', async () => {
    // Præcis hullet fra runde 3: ⚡ på m1, m1 låser, ⚡ forsøges på m2.
    const kampe = standardKampe();
    kampe[0].kickoff = NU - 60e3; // Brøndby–FCK er i gang
    const e = await fanger(
      { kampe, tips: [tip('m1', { chanceStake: 4 }), tip('m2')] },
      { matchId: 'm2', stake: 6 },
    );
    expect(e.message).toBe('chance-laast');
    expect(e.detaljer).toEqual({ gruppe: 3, kamp: 'Brøndby–FCK' });
  });

  it('OGSÅ når den første kamp blev AFBRUDT — den rullede, og stillingen sås', async () => {
    // Denne test stod oprindeligt med den modsatte forventning og var grøn,
    // fordi den forsvarede en fejl: chancen blev givet tilbage til en spiller,
    // der havde set 3-0 efter 70 minutter. 'afbrudt' skrives kun på kampe,
    // kilden har meldt i gang.
    const kampe = standardKampe();
    kampe[0].kickoff = NU - 60e3;
    kampe[0].live = { status: 'afbrudt', home: 3, away: 0 };
    const e = await fanger(
      { kampe, tips: [tip('m1', { chanceStake: 4 }), tip('m2')] },
      { matchId: 'm2', stake: 6 },
    );
    expect(e.message).toBe('chance-laast');
  });

  it('men TILLADER flytningen, når den første kamps kickoff er UDSKUDT', async () => {
    // Den ægte udsættelses-vej: kickoff-synken har flyttet tiden frem.
    const kampe = standardKampe();
    kampe[0].kickoff = NU + 21 * 24 * 3600e3;
    const { res } = await saet(
      { kampe, tips: [tip('m1', { chanceStake: 4 }), tip('m2')] },
      { matchId: 'm2', stake: 6 },
    );
    expect(res.flyttetFra).toEqual(['u1_m1']);
  });

  it('en spiller uden tip på kampen', async () => {
    const e = await fanger({ kampe: standardKampe(), tips: [] }, { matchId: 'm1', stake: 3 });
    expect(e.message).toBe('intet-tip');
  });

  it('en bruger, der ikke deltager i spillet — også med et tip liggende', async () => {
    // Deltagelse er sin EGEN vagt, ikke en bivirkning af tip-kravet.
    const e = await fanger(
      { erSpiller: false, kampe: standardKampe(), tips: [tip('m1')] },
      { matchId: 'm1', stake: 3 },
    );
    expect(e.message).toBe('not-member');
  });

  it('en spiller, der har FORLADT spillet — dokumentet findes, men er et arkiv', async () => {
    const e = await fanger(
      { spiller: { uid: 'me', forladt: true, totalPoints: 12 }, kampe: standardKampe(), tips: [tip('m1')] },
      { matchId: 'm1', stake: 3 },
    );
    expect(e.message).toBe('not-member');
  });

  it('en AFVIST bruger — reglerne beskytter intet, når Admin SDK skriver', async () => {
    // setUserStatus rører kun users-dokumentet, så players-dokumentet
    // overlever en afvisning. Uden denne vagt kunne en bortvist spiller blive
    // ved med at sætte ⚡ fra devtools, mens reglerne spærrede hen ude fra
    // selve 1X2-valget.
    const e = await fanger(
      { bruger: { status: 'rejected' }, kampe: standardKampe(), tips: [tip('m1')] },
      { matchId: 'm1', stake: 3 },
    );
    expect(e.message).toBe('rejected');
  });

  it('en bruger, der ikke er godkendt endnu — og en UDEN brugerdokument', async () => {
    // `!== 'approved'`, ikke `=== 'rejected'`: et manglende dokument slap
    // igennem en tidligere udgave af vagten.
    for (const bruger of [{ status: 'pending' }, {}, null]) {
      const e = await fanger(
        { bruger, kampe: standardKampe(), tips: [tip('m1')] },
        { matchId: 'm1', stake: 3 },
      );
      expect(e.message, JSON.stringify(bruger)).toBe('not-approved');
    }
  });

  it('en ukendt kamp, et manglende id og en manglende bruger', async () => {
    expect((await fanger({ kampe: standardKampe(), tips: [tip('m1')] }, { matchId: 'xx', stake: 1 })).message).toBe('no-match');
    expect((await fanger({}, { matchId: '', stake: 1 })).message).toBe('bad-input');
    expect((await fanger({}, { uid: '', matchId: 'm1', stake: 1 })).message).toBe('unauthenticated');
  });

  it('en kamp uden runde — snittet findes ikke', async () => {
    const kampe = [{ id: 'm1', home: 'A', away: 'B', kickoff: NU + 1e6 }];
    const e = await fanger({ kampe, tips: [tip('m1')] }, { matchId: 'm1', stake: 1 });
    expect(e.message).toBe('no-group');
  });

  it('en ugyldig indsats FØR den rører databasen', async () => {
    const db = makeDb({ kampe: standardKampe(), tips: [tip('m1')] });
    await expect(setChanceCore(db, FieldValue, { uid: 'u1', gameId: 'g1', matchId: 'm1', stake: 99, nowMs: NU }))
      .rejects.toThrow('bad-stake');
    expect(db._state.laesninger).toBe(0);
    expect(db._state.skrevet).toEqual([]);
  });

  it('uden at skrive NOGET, når en vagt siger fra', async () => {
    const kampe = standardKampe();
    kampe[0].kickoff = NU - 60e3;
    const db = makeDb({ kampe, tips: [tip('m1', { chanceStake: 4 }), tip('m2')] });
    await expect(setChanceCore(db, FieldValue, { uid: 'u1', gameId: 'g1', matchId: 'm2', stake: 6, nowMs: NU }))
      .rejects.toThrow('chance-laast');
    expect(db._state.skrevet).toEqual([]);
  });
});

// --- Transaktionens rækkefølge ----------------------------------------------
describe('læs-før-skriv', () => {
  it('fake\'en afviser en læsning efter første skrivning', async () => {
    // Beviser at vagten i fake'en VIRKER — ellers ville den være en kommentar,
    // og en ombytning af rækkefølgen i kernen ville stadig stå grøn.
    const db = makeDb({ kampe: standardKampe(), tips: [tip('m1')] });
    db._state.skrevet.push({ id: 'snyd' });
    await expect(setChanceCore(db, FieldValue, { uid: 'u1', gameId: 'g1', matchId: 'm1', stake: 1, nowMs: NU }))
      .rejects.toThrow('læsning efter skrivning');
  });
});

// --- Afregningen må IKKE dedup'e --------------------------------------------
describe('afregningen er uændret', () => {
  it('gameScoring kender hverken runde-dedup eller chanceSatAt', () => {
    // Dedup'ede afregningen OGSÅ, kunne hele transaktionen i chanceVagt tømmes
    // for indhold med grøn suite: afregningen ville stiltiende rydde op.
    // Vagten skal være det ENESTE sted, reglen findes.
    const scoring = require('fs').readFileSync(new URL('./gameScoring.js', import.meta.url), 'utf8');
    expect(scoring).not.toContain('chanceSatAt');
    expect(scoring).not.toContain('chanceFlytninger');
  });
});
