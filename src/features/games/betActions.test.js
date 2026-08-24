/**
 * Tests for betActions.js — især leagueIds på tippet, som afgør hvem der kan
 * se det efter kickoff. Firebase er fuldt mocket.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setBet, setChance, betId } from './betActions';

const mockSetDoc = vi.fn();
const mockDoc = vi.fn((db, ...path) => ({ _path: path }));

vi.mock('firebase/firestore', () => ({
  doc: (...a) => mockDoc(...a),
  setDoc: (...a) => mockSetDoc(...a),
  serverTimestamp: () => ({ _serverTimestamp: true }),
}));

vi.mock('../../firebase', () => ({ db: {}, functions: {} }));

// setChance henter callable'en med en DYNAMISK import, så mocken skal ligge
// her og ikke i selve testen.
const mockFn = vi.fn();
vi.mock('firebase/functions', () => ({
  httpsCallable: (...a) => { mockHttpsCallable(...a); return (...b) => mockFn(...b); },
}));
const mockHttpsCallable = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockSetDoc.mockResolvedValue(undefined);
});

/** Payload'en fra det seneste setDoc-kald. */
const payload = () => mockSetDoc.mock.calls[0][1];

describe('betId', () => {
  it('binder tippet til uid_matchId — ét tip pr. kamp', () => {
    expect(betId('u1', 'm1')).toBe('u1_m1');
  });
});

describe('setBet', () => {
  const base = { uid: 'u1', gameId: 'sl', matchId: 'm1', pick: '1' };

  it('kræver login, spil-id og et gyldigt udfald', async () => {
    expect((await setBet({ ...base, uid: '' })).ok).toBe(false);
    expect((await setBet({ ...base, gameId: '' })).ok).toBe(false);
    expect((await setBet({ ...base, pick: 'J' })).ok).toBe(false);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('skriver tippet på games/{gameId}/bets/{uid_matchId}', async () => {
    const res = await setBet(base);
    expect(res).toEqual({ ok: true });
    expect(mockDoc).toHaveBeenCalledWith({}, 'games', 'sl', 'bets', 'u1_m1');
    expect(mockSetDoc.mock.calls[0][2]).toEqual({ merge: true });
  });

  it('sætter ALDRIG points — det felt ejes af serveren', async () => {
    await setBet(base);
    expect('points' in payload()).toBe(false);
  });

  // leagueIds er dét, reglen bruger til at afgøre, hvem der må se tippet efter
  // kickoff. Uden feltet er tippet kun synligt for én selv.
  it('skriver mine ligaer med på tippet', async () => {
    await setBet({ ...base, leagueIds: ['L1', 'L2'] });
    expect(payload().leagueIds).toEqual(['L1', 'L2']);
  });

  it('bruger tom liste, når man ikke er i nogen liga', async () => {
    await setBet(base);
    expect(payload().leagueIds).toEqual([]);
  });

  it('renser dubletter og tomme værdier ud af ligaerne', async () => {
    await setBet({ ...base, leagueIds: ['L1', 'L1', '', null, 'L2'] });
    expect(payload().leagueIds).toEqual(['L1', 'L2']);
  });

  it('tolererer at leagueIds slet ikke er en liste', async () => {
    await setBet({ ...base, leagueIds: 'L1' });
    expect(payload().leagueIds).toEqual([]);
  });

  it('SKRIVER ALDRIG chanceStake — feltet ejes af serveren', async () => {
    // VENDT BEVIDST. Testen hed før "afviser en Chancen-indsats, saldoen ikke
    // bærer" og forsvarede, at setBet validerede indsatsen. Den regel er
    // flyttet til serveren (setGameChance), fordi "én ⚡ pr. runde" er en
    // FORESPØRGSEL, som firestore.rules ikke kan køre — og browservalidering
    // kan omgås.
    //
    // Pendant til "sætter ALDRIG points" ovenfor: begge felter ejes af
    // serveren, og begge ville kunne skrives herfra uden denne vagt.
    await setBet({ ...base, chanceStake: 500, bank: 10 });
    expect(mockSetDoc).toHaveBeenCalled();
    expect('chanceStake' in payload()).toBe(false);
  });

  it('rører ikke chance-felterne overhovedet', async () => {
    // merge: true lader serverens felter stå. Sendte setBet et af dem med —
    // også som 0 — ville et skift af 1X2 nulstille en chance, spilleren havde
    // sat, og gøre det tavst.
    await setBet(base);
    for (const felt of ['chanceStake', 'chanceSatAt', 'chanceFlytninger']) {
      expect(felt in payload(), felt).toBe(false);
    }
  });

  it('nævner GENINDLÆSNING som mulig årsag, når skrivningen afvises', async () => {
    // "Deadline passeret eller ingen adgang" på en ÅBEN kamp er den værste
    // besked i mekanikken: den beskylder spilleren for at være for sen på
    // noget, der ikke er lukket. Efter at serveren overtog chanceStake, er en
    // forældet fane en ægte årsag — den gamle klient sender chanceStake: 0
    // med hvert klik, og på et nyt tip er fravær → 0 en berørt nøgle.
    mockSetDoc.mockRejectedValueOnce(Object.assign(new Error('nej'), { code: 'permission-denied' }));
    const res = await setBet(base);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/genindlæs/i);
    // Deadline skal stadig nævnes — den er den anden ægte årsag.
    expect(res.error).toMatch(/deadline/i);
    // Men den må ikke stå som den ENESTE forklaring længere.
    expect(res.error).not.toBe('Tippet kunne ikke gemmes (deadline passeret eller ingen adgang).');
  });
});

// ---------------------------------------------------------------------------
// setChance — SERVEREN ejer Chancen.
//
// Test Manager fandt, at hele funktionen kunne tømmes til
// `err?.message || 'Chancen kunne ikke sættes.'` med 2681 grønne tests:
// betActions.test.js importerede den ikke, og FootballTip.test.jsx mockede den
// helt væk. Nul dækning på det modul, hele ændringen findes for.
// ---------------------------------------------------------------------------

describe('setChance', () => {
  it('kalder setGameChance og giver serverens svar videre', async () => {
    mockFn.mockResolvedValueOnce({ data: { ok: true, indsats: 4, flyttetFra: ['u1_m9'], gruppe: 3 } });
    const res = await setChance({ gameId: 'sl', matchId: 'm1', stake: 4 });
    expect(mockHttpsCallable).toHaveBeenCalledWith({}, 'setGameChance');
    expect(mockFn).toHaveBeenCalledWith({ gameId: 'sl', matchId: 'm1', stake: 4 });
    // Serverens felter skal med UÆNDRET videre — kvitteringen bygger på dem.
    expect(res).toMatchObject({ ok: true, indsats: 4, flyttetFra: ['u1_m9'], gruppe: 3 });
  });

  it('sender indsatsen VIDERE som den er — reglen bor ét sted', async () => {
    // Klienten må ikke klippe, runde eller validere: så ville der være to
    // steder at have loftet, og de kunne drive fra hinanden. normaliserIndsats
    // på serveren er den ene vagt.
    mockFn.mockResolvedValue({ data: { ok: true } });
    for (const stake of [0, 1, 8, 99, -3, 2.5]) {
      await setChance({ gameId: 'sl', matchId: 'm1', stake });
      expect(mockFn.mock.calls.at(-1)[0].stake).toBe(stake);
    }
  });

  it('siger det MED ORD, når callable\'en ikke er udrullet', async () => {
    // Uden denne gren ville spilleren se en engelsk SDK-streng, og Chancen
    // ville se ud til at være gået i stykker uden et ord om hvorfor.
    mockFn.mockRejectedValueOnce(Object.assign(new Error('not found'), { code: 'functions/not-found' }));
    const res = await setChance({ gameId: 'sl', matchId: 'm1', stake: 4 });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/ikke udrullet/);
    expect(res.error).not.toMatch(/not found/i);
  });

  it('forsikrer om, at INTET gik tabt ved en netværksfejl', async () => {
    // Det vigtigste her er ikke fejlen, men at chancen er uændret. Uden den
    // forsikring tror spilleren, den måske ligger et sted, han ikke kan se —
    // og opdager det først, når runden er afgjort.
    mockFn.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'functions/unavailable' }));
    const res = await setChance({ gameId: 'sl', matchId: 'm1', stake: 4 });
    expect(res.error).toMatch(/Chancen er uændret/);
  });

  it('videresender serverens EGEN besked uændret', async () => {
    // chanceFejl på serveren nævner kampen, chancen sidder fast på. Klienten
    // må ikke erstatte den med sin egen, vagere formulering.
    const besked = 'Chancen er allerede brugt i runden på Brøndby–FCK, og den kamp er i gang.';
    mockFn.mockRejectedValueOnce(Object.assign(new Error(besked), { code: 'functions/failed-precondition' }));
    const res = await setChance({ gameId: 'sl', matchId: 'm1', stake: 4 });
    expect(res.error).toBe(besked);
  });

  it('kalder slet ikke serveren uden spil- eller kamp-id', async () => {
    for (const arg of [{ matchId: 'm1', stake: 1 }, { gameId: 'sl', stake: 1 }, {}]) {
      const res = await setChance(arg);
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/Mangler/);
    }
    expect(mockFn).not.toHaveBeenCalled();
  });

  it('har en dansk fallback, når fejlen ingen besked har', async () => {
    mockFn.mockRejectedValueOnce({});
    const res = await setChance({ gameId: 'sl', matchId: 'm1', stake: 4 });
    expect(res.error).toBe('Chancen kunne ikke sættes.');
  });
});
