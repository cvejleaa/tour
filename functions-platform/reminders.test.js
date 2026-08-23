// ---------------------------------------------------------------------------
// reminders.test.js — hvilke kampe der overhovedet må rykkes for.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { upcomingMatches } = require('./reminders.js');

/** Firestore-agtigt Timestamp. */
const ts = (ms) => ({ toDate: () => new Date(ms), toMillis: () => ms });

const NOW = Date.UTC(2026, 6, 27, 12, 0, 0);
const H = 3600 * 1000;
const now = new Date(NOW);
const windowEnd = new Date(NOW + 24 * H);

const { gatedeKampe, startRundeFor } = require('./startGate');

describe('upcomingMatches', () => {
  const matches = [
    { id: 'past', kickoff: ts(NOW - 2 * H) },
    { id: 'soon', kickoff: ts(NOW + 3 * H) },
    { id: 'later', kickoff: ts(NOW + 20 * H) },
    { id: 'next-week', kickoff: ts(NOW + 200 * H) },
    { id: 'no-kickoff' },
  ];

  it('tager kun kampe i det næste døgn', () => {
    expect(upcomingMatches(matches, now, windowEnd).map((m) => m.id)).toEqual(['soon', 'later']);
  });

  // GATEN ER ET SÆT AF KAMPE, IKKE ET TIDSPUNKT. Den kommer fra `startGate`,
  // altså nøjagtig den samme mængde, pointgivningen bruger — så en spiller
  // ikke kan blive rykket for en kamp, der ikke giver point. Da den var et
  // tidspunkt, kunne de to svare forskelligt på en runde, der lå spredt.
  it('springer gatede kampe over', () => {
    expect(upcomingMatches(matches, now, windowEnd, new Set(['soon'])).map((m) => m.id))
      .toEqual(['later']);
  });

  it('uden gate rykkes der for alt i vinduet', () => {
    expect(upcomingMatches(matches, now, windowEnd, null).map((m) => m.id)).toEqual(['soon', 'later']);
    expect(upcomingMatches(matches, now, windowEnd, new Set()).map((m) => m.id)).toEqual(['soon', 'later']);
  });

  it('er hele runden gatet, rykkes der slet ikke', () => {
    expect(upcomingMatches(matches, now, windowEnd, new Set(['soon', 'later']))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// …OG GATEN SKAL KOMME FRA SPILLET, ikke fra et tal, kaldestedet fandt på.
//
// `upcomingMatches` kan ikke selv se, om sættet er rigtigt. Den her test går
// gennem `startGate` med et spil-dokument, som kaldestederne gør.
// ---------------------------------------------------------------------------
describe('påmindelser bruger spillets startrunde', () => {
  const kampe = [
    { id: 'r1', round: 1, kickoff: ts(NOW + 3 * H) },
    { id: 'r2', round: 2, kickoff: ts(NOW + 20 * H) },
  ];

  it('rykker ikke for en runde under startrunden', () => {
    const gatede = gatedeKampe(kampe, startRundeFor({ startRound: 2 }, kampe));
    expect(upcomingMatches(kampe, now, windowEnd, gatede).map((m) => m.id)).toEqual(['r2']);
  });

  it('rykker for alt, når spillet ingen startrunde har', () => {
    const gatede = gatedeKampe(kampe, startRundeFor({}, kampe));
    expect(upcomingMatches(kampe, now, windowEnd, gatede).map((m) => m.id)).toEqual(['r1', 'r2']);
  });
});

// ---------------------------------------------------------------------------
// byggTipStatus (opgave #37) — kortet må ALDRIG modsige 'Send påmindelser
// nu'-knappen lige under det: "haster" og rammesAfKnappenNu bruger knappens
// EGET vindue (upcomingMatches, 24 t). Og grænsen: output kender kun OM der
// er tippet — aldrig valget.
// ---------------------------------------------------------------------------
describe('byggTipStatus — hvem mangler at tippe', () => {
  const { byggTipStatus } = require('./reminders.js');
  const matches = [
    { id: 'k3', round: 4, home: 'BIF', away: 'FCM', kickoff: ts(NOW - 2 * H) },  // spillet
    { id: 'k1', round: 4, home: 'FCK', away: 'AGF', kickoff: ts(NOW + 3 * H) },  // haster (24t)
    { id: 'k2', round: 4, home: 'OB', away: 'Vejle', kickoff: ts(NOW + 30 * H) },// senere i runden
    { id: 'k5', round: 5, home: 'SIF', away: 'VFF', kickoff: ts(NOW + 5 * H) },  // ANDEN runde, men i 24t-vinduet
  ];
  const emails = new Map([['a', 'a@x.dk'], ['b', 'b@x.dk'], ['c', 'c@x.dk']]);
  const brugere = new Map([
    ['a', { displayName: 'Anna' }],
    ['b', { displayName: 'Bo', emailOptOut: true }],
    ['c', { displayName: 'Carla' }],
  ]);
  const byg = (betByUid) => byggTipStatus({
    game: {}, matches, memberUids: ['a', 'b', 'c'], betByUid, brugere, emails, round: 4, now,
  });
  const bets = new Map([
    ['a', new Set(['k1', 'k2', 'k3'])], // alt tippet
    ['b', new Set(['k1'])],             // mangler k2 (senere) + k3 (spillet)
    // c: intet tippet
  ]);

  it('dækning pr. spiller — flest ÅBNE mangler først, og spillede kampe er "nåede det ikke"', () => {
    const ud = byg(bets);
    expect(ud.kampeIRunden).toBe(3); // k5 er runde 5 — usynlig her, selv om den er i 24t-vinduet
    expect(ud.spillere.map((s) => s.navn)).toEqual(['Carla', 'Bo', 'Anna']);
    const carla = ud.spillere[0];
    expect(carla.tippet).toBe(0);
    expect(carla.ialt).toBe(3);
    // Manglende følger kickoff-orden: spillet kamp først, så haster, så senere.
    expect(carla.manglende).toEqual([
      { id: 'k3', kamp: 'BIF – FCM', kickoff: NOW - 2 * H, naaedeDetIkke: true, haster: false },
      { id: 'k1', kamp: 'FCK – AGF', kickoff: NOW + 3 * H, naaedeDetIkke: false, haster: true },
      { id: 'k2', kamp: 'OB – Vejle', kickoff: NOW + 30 * H, naaedeDetIkke: false, haster: false },
    ]);
    const anna = ud.spillere.find((s) => s.navn === 'Anna');
    expect(anna.tippet).toBe(3);
    expect(anna.manglende).toEqual([]);
    // Bo kan ikke nås af knappen (emailOptOut) — det skal fladen kunne vise.
    expect(ud.spillere.find((s) => s.navn === 'Bo').kanRykkes).toBe(false);
    expect(carla.kanRykkes).toBe(true);
  });

  it('rammesAfKnappenNu er PRÆCIS knappens modtagerkreds — ikke rundens mangler-tal', () => {
    const ud = byg(bets);
    // Carla mangler k1 (24t-vinduet) og kan nås → tælles. Bo mangler kun k2
    // (30 t ude — uden for knappens vindue), så knappen ville springe ham
    // over UANSET optOut. Anna mangler intet. Kortet må aldrig love flere.
    expect(ud.rammesAfKnappenNu).toBe(1);
  });

  it('en NÅBAR spiller, der kun mangler kampe UDEN FOR døgnet, tælles ikke af knappen', () => {
    // TM-fund: mutationen 'tæl alle med manglende' overlevede, fordi enhver
    // nåbar spiller i fixtures også manglede en hastende kamp. Ditte kan nås
    // og mangler k2 (30 t ude) — men knappen ville springe hende over, så
    // kortet må ikke tælle hende. UI-teksten lover præcis dét skel.
    const ud = byggTipStatus({
      game: {},
      matches,
      memberUids: ['a', 'c', 'd'],
      betByUid: new Map([
        ['a', new Set(['k1', 'k2', 'k3'])],
        ['d', new Set(['k1', 'k3'])], // mangler KUN k2 — uden for vinduet
        // c mangler alt, herunder k1 (haster)
      ]),
      brugere: new Map([...brugere, ['d', { displayName: 'Ditte' }]]),
      emails: new Map([...emails, ['d', 'd@x.dk']]),
      round: 4,
      now,
    });
    expect(ud.spillere.find((s2) => s2.navn === 'Ditte').manglende.map((m) => m.id)).toEqual(['k2']);
    expect(ud.rammesAfKnappenNu).toBe(1); // kun Carla — IKKE Ditte
  });

  it('optOut fjerner en spiller fra knappens tal, selv når han mangler i vinduet', () => {
    const ud = byg(new Map()); // ingen har tippet noget
    // Anna + Carla mangler k1 og kan nås; Bo mangler k1 men er opt-out.
    expect(ud.rammesAfKnappenNu).toBe(2);
  });

  it('gaten: runder før spillets startrunde har ingen kampe at mangle', () => {
    const ud = byggTipStatus({
      game: { startRound: 4 },
      matches: [{ id: 'g1', round: 3, home: 'A', away: 'B', kickoff: ts(NOW + 3 * H) }, ...matches],
      memberUids: ['a'], betByUid: new Map(), brugere, emails, round: 3, now,
    });
    expect(ud.kampeIRunden).toBe(0);
    expect(ud.spillere[0].manglende).toEqual([]);
  });

  it('grænsen står i selve datastrukturen: intet pick/valg kan optræde i svaret', () => {
    const ud = byg(bets);
    expect(JSON.stringify(ud)).not.toMatch(/"pick"|"valg"|"1"\s*:\s*"[1X2]"/);
  });
});

// ---------------------------------------------------------------------------
// hentTipStatus — LÆSEREN er selve sikkerhedsgrænsen (Security-fund): bets
// har picks i databasen, men kun matchId må komme ind i processen. Mutationen
// 'add(b) i stedet for add(b.matchId)' var grøn i hele suiten, fordi alle
// tests kørte byggTipStatus, hvis input pr. konstruktion allerede var rene.
// Denne test kører den ÆGTE læser mod en fake db med fjendtlige bets.
// ---------------------------------------------------------------------------
describe('hentTipStatus — picks findes i databasen, men aldrig i svaret', () => {
  const { hentTipStatus } = require('./reminders.js');

  function fakeDb() {
    const bets = [
      { uid: 'a', matchId: 'k1', pick: '1', points: 7.7, hemmelig: 'x' },
      { uid: 'c', matchId: 'k2', pick: 'X', points: 0 },
    ];
    const matches = [
      { id: 'k1', round: 4, home: 'FCK', away: 'AGF', kickoff: ts(NOW + 3 * H) },
      { id: 'k2', round: 4, home: 'OB', away: 'Vejle', kickoff: ts(NOW + 30 * H) },
    ];
    const docsAf = (liste) => liste.map((d) => ({ id: d.id ?? d.uid, exists: true, data: () => d }));
    const gameRef = {
      get: async () => ({ exists: true, data: () => ({ name: 'Testspillet' }) }),
      collection: (navn) => ({
        get: async () => ({
          docs: navn === 'matches' ? docsAf(matches)
            : navn === 'players' ? [{ id: 'a', data: () => ({}) }, { id: 'c', data: () => ({}) }]
              : [],
        }),
        where: () => ({
          get: async () => ({ docs: bets.map((b) => ({ data: () => b })) }),
        }),
      }),
    };
    return {
      collection: (navn) => ({
        doc: (id) => (navn === 'games' ? gameRef : {
          __id: id,
          get: async () => ({ exists: true, data: () => ({ displayName: `Navn-${id}` }) }),
        }),
        get: async () => ({ docs: [{ id: 'a', data: () => ({ email: 'a@x.dk' }) }] }), // userContacts
      }),
      getAll: async (...refs) => refs.map((r) => ({
        id: r.__id, exists: true, data: () => ({ displayName: `Navn-${r.__id}` }),
      })),
    };
  }

  it('svaret indeholder hverken pick, points eller ukendte bet-felter', async () => {
    const svar = await hentTipStatus(fakeDb(), 'spil', 4, now);
    expect(svar.gameNavn).toBe('Testspillet');
    // a har tippet k1 (1/2) — c har tippet k2 (1/2): dækningen kom igennem…
    expect(svar.spillere.find((s) => s.uid === 'a').tippet).toBe(1);
    // …men intet af bettenes indhold gjorde:
    const raa = JSON.stringify(svar);
    expect(raa).not.toContain('"pick"');
    expect(raa).not.toContain('7.7');
    expect(raa).not.toContain('hemmelig');
  });
});

// ---------------------------------------------------------------------------
// paamindelsesLinje — driftkortets afbildning. Hele tabellen med EKSAKT niveau
// og indhold, plus det der IKKE må stå: "Sendte" på en linje, hvor intet blev
// sendt, var præcis den tavse fejl, kortet findes for.
// ---------------------------------------------------------------------------
const { runGameTipReminders, paamindelsesLinje, koerPaamindelserForSpil } = require('./reminders.js');

describe('paamindelsesLinje', () => {
  it('kastet fejl → rødt kort med fejlteksten', () => {
    const l = paamindelsesLinje({ fejl: 'boom' });
    expect(l.niveau).toBe('fejl');
    expect(l.besked).toContain('Kørslen fejlede: boom');
  });

  it('manglende SMTP → rødt kort, der navngiver secret\'en', () => {
    const l = paamindelsesLinje({ harSmtp: false });
    expect(l.niveau).toBe('fejl');
    expect(l.besked).toContain('SMTP_PASSWORD');
  });

  // Pausens niveau er BETINGET (spilfører): harmløs i en kampfri periode
  // (gul), rød præcis den morgen den koster nogen en deadline. Mutationen
  // 'fejl'→'advarsel' (eller omvendt) skal blive rød i begge grene.
  it('pause uden kampe i vinduet → advarsel — og linjen påstår IKKE at have sendt', () => {
    const l = paamindelsesLinje({ paused: true, resultat: { upcoming: 0 } });
    expect(l.niveau).toBe('advarsel');
    expect(l.besked).toContain('sat på pause');
    expect(l.besked).toContain('🔔 Påmindelser');
    expect(l.besked).not.toContain('Sendte');
  });

  it('pause MED kampe i vinduet → rødt kort: nogen kan misse deadline', () => {
    const l = paamindelsesLinje({ paused: true, resultat: { upcoming: 2 } });
    expect(l.niveau).toBe('fejl');
    expect(l.besked).toContain('2 kampe inden for det næste døgn');
    expect(l.besked).toContain('misse deadline');
  });

  it('ingen kampe i vinduet → grønt "ingen at rykke"', () => {
    const l = paamindelsesLinje({ resultat: { sent: 0, fejlede: 0, reason: 'no-matches' } });
    expect(l.niveau).toBe('ok');
    expect(l.besked).toContain('Ingen kampe inden for det næste døgn');
  });

  it('ingen deltagere → grønt', () => {
    const l = paamindelsesLinje({ resultat: { sent: 0, fejlede: 0, reason: 'no-members' } });
    expect(l.niveau).toBe('ok');
    expect(l.besked).toContain('ingen deltagere');
  });

  it('sendte N → grønt med alle tre tal', () => {
    const l = paamindelsesLinje({ resultat: { sent: 5, fejlede: 0, upcoming: 3, members: 12 } });
    expect(l.niveau).toBe('ok');
    expect(l.besked).toBe('Sendte 5 påmindelser (3 kommende kampe, 12 deltagere).');
    expect(l.tal).toEqual({ sent: 5, fejlede: 0, upcoming: 3, members: 12 });
  });

  // sent: 0 er OGSÅ det normale "alle har tippet" — det må ikke dele ordlyd
  // med et nedbrud, og det må ikke hedde "Sendte 0" (QC-fund på planen).
  it('sent 0 uden fejl = alle har tippet — egen ordlyd, aldrig "Sendte"', () => {
    const l = paamindelsesLinje({ resultat: { sent: 0, fejlede: 0, upcoming: 3, members: 12 } });
    expect(l.niveau).toBe('ok');
    expect(l.besked).toContain('Ingen manglede at tippe');
    expect(l.besked).not.toContain('Sendte');
  });

  it('delvist nedbrud → gult; totalt nedbrud → rødt — aldrig grønt', () => {
    const delvis = paamindelsesLinje({ resultat: { sent: 3, fejlede: 2, upcoming: 3, members: 12 } });
    expect(delvis.niveau).toBe('advarsel');
    expect(delvis.besked).toContain('2 af 5 påmindelser kunne ikke sendes');

    const totalt = paamindelsesLinje({ resultat: { sent: 0, fejlede: 5, upcoming: 3, members: 12 } });
    expect(totalt.niveau).toBe('fejl');
    expect(totalt.besked).toContain('5 af 5');
    expect(totalt.besked).not.toContain('Ingen manglede');
  });
});

// ---------------------------------------------------------------------------
// koerPaamindelserForSpil + fejlede-tælleren, kørt mod en lille Firestore-
// attrap: nok til at bevise, at et SMTP-nedbrud bliver et RØDT kort — ikke et
// grønt "Sendte 0" (arkitektens afsnit 7-forbehold, QC-krav på planen).
// ---------------------------------------------------------------------------
function fakeReminderDb({ game = {}, matches = [], players = [], contacts = {}, users = {} } = {}) {
  const gameRef = {
    get: async () => ({ exists: true, data: () => game }),
    collection: (name) => {
      if (name === 'matches') return { get: async () => ({ docs: matches.map((m) => ({ id: m.id, data: () => m })) }) };
      if (name === 'players') return { get: async () => ({ docs: players.map((uid) => ({ id: uid })) }) };
      if (name === 'bets') return { where: () => ({ get: async () => ({ docs: [] }) }) };
      throw new Error(`uventet subcollection: ${name}`);
    },
  };
  return {
    collection: (name) => {
      if (name === 'games') return { doc: () => gameRef };
      if (name === 'userContacts') {
        return { get: async () => ({ docs: Object.entries(contacts).map(([uid, email]) => ({ id: uid, data: () => ({ email }) })) }) };
      }
      if (name === 'users') return { doc: (uid) => ({ _uid: uid }) };
      if (name === 'emailLog') return { add: async () => {} };
      throw new Error(`uventet collection: ${name}`);
    },
    getAll: async (...refs) => refs.map((r) => ({ id: r._uid, exists: true, data: () => users[r._uid] || {} })),
  };
}

const SPIL = { id: 'sl', name: 'Superligaen', type: 'football', status: 'live' };
const KAMP_I_VINDUET = { id: 'm1', round: 1, home: 'AGF', away: 'OB', kickoff: ts(NOW + 2 * H) };

describe('runGameTipReminders — fejlede-tælleren', () => {
  const dbMedEnDerMangler = () => fakeReminderDb({
    game: SPIL, matches: [KAMP_I_VINDUET], players: ['u1'],
    contacts: { u1: 'u1@eksempel.dk' }, users: { u1: { displayName: 'Ulla' } },
  });

  it('tæller modtagere, hvor sendEmail kastede — og linjen bliver RØD', async () => {
    const transporter = { sendMail: async () => { throw new Error('SMTP nede'); } };
    const r = await runGameTipReminders(dbMedEnDerMangler(), transporter, 'sl', now);
    expect(r.sent).toBe(0);
    expect(r.fejlede).toBe(1);
    // Hele kæden: nedbruddet ender som et rødt kort, aldrig et grønt "0".
    expect(paamindelsesLinje({ resultat: r }).niveau).toBe('fejl');
  });

  it('tæller 0 fejlede, når afsendelsen lykkes', async () => {
    const transporter = { sendMail: async () => {} };
    const r = await runGameTipReminders(dbMedEnDerMangler(), transporter, 'sl', now);
    expect(r.sent).toBe(1);
    expect(r.fejlede).toBe(0);
    expect(paamindelsesLinje({ resultat: r }).niveau).toBe('ok');
  });
});

describe('koerPaamindelserForSpil', () => {
  it('fanger sin egen fejl og returnerer rødt — fjernes try/catch, bliver denne rød', async () => {
    const kaster = async () => { throw new Error('databasen brændte'); };
    const l = await koerPaamindelserForSpil({}, { sendMail: async () => {} }, SPIL, { _koer: kaster });
    expect(l.niveau).toBe('fejl');
    expect(l.besked).toContain('databasen brændte');
  });

  it('uden transporter: SMTP-linjen — kørslen startes slet ikke', async () => {
    const _koer = async () => { throw new Error('må ikke kaldes'); };
    const l = await koerPaamindelserForSpil({}, null, SPIL, { _koer });
    expect(l.niveau).toBe('fejl');
    expect(l.besked).toContain('SMTP_PASSWORD');
  });

  it('pauset spil: kører intet, men tæller kampvinduet — rød med kamp i vinduet', async () => {
    const _koer = async () => { throw new Error('må ikke kaldes under pause'); };
    const db = fakeReminderDb({ game: SPIL, matches: [KAMP_I_VINDUET] });
    const l = await koerPaamindelserForSpil(db, { sendMail: async () => {} }, { ...SPIL, paused: true }, { now, _koer });
    expect(l.niveau).toBe('fejl');
    expect(l.besked).toContain('misse deadline');
  });

  it('pauset spil uden kampe i vinduet: gul', async () => {
    const db = fakeReminderDb({ game: SPIL, matches: [] });
    const l = await koerPaamindelserForSpil(db, { sendMail: async () => {} }, { ...SPIL, paused: true }, { now });
    expect(l.niveau).toBe('advarsel');
    expect(l.besked).toContain('sat på pause');
  });
});
