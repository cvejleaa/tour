// Tests for ✍️ Sæt eller ret facit i hånden (ManuelFacit.jsx) — nødbremsen.
//
// Fladen skriver point i produktion gennem serveren. Testene binder derfor:
// at listen viser holdnavne og tid (ikke dokument-id'er), at advarslerne
// står ORDRET (og det, der ikke må stå), at knockout-felterne kun kommer for
// en knockout-kamp, at skrive-knappen først findes efter tør-kørslen og
// forsvinder, når felterne ændres, og at confirm navngiver konsekvenserne.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render, screen, fireEvent, waitFor, within, cleanup,
} from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {} }));

const mockGetDocs = vi.fn();
vi.mock('firebase/firestore', () => ({
  collection: (...a) => ({ __sti: a.slice(1) }),
  getDocs: (...a) => mockGetDocs(...a),
}));

const mockSaet = vi.fn();
const mockFrigiv = vi.fn();
vi.mock('./adminActions', () => ({
  callSaetFacitManuelt: (...a) => mockSaet(...a),
  callFrigivFacitTilSynk: (...a) => mockFrigiv(...a),
}));

import ManuelFacit, {
  ADVARSEL_SYNK, ADVARSEL_BOT, advarselBot, prognoseLinjer, facitKandidater,
} from './ManuelFacit';

const TIME = 3600 * 1000;
const nu = Date.now();
const SL = { id: 'superliga2627', name: 'Superligaen 2026/27', type: 'football', status: 'live', sync: { provider: 'superliga' } };
const HB = {
  id: 'hvm2027', name: 'Håndbold-VM 2027', type: 'football', status: 'open', sport: 'haandbold',
  // En GYLDIG kalender (faser.faseKalenderFejl): knockout læses af
  // faser.erKnockout, som fladerne og serveren deler.
  faser: [
    { navn: 'Indledende runde', fra: 1, til: 6, start: '2027-01-13' },
    { navn: 'Kvartfinaler', fra: 7, til: 7, start: '2027-01-20', knockout: true },
  ],
};
// Samme turnering med et HUL i kalenderen (runde 7 efter runde 3). Et naivt
// opslag ville finde Kvartfinaler i runde 7 — men en kalender, der ikke
// består formkontrollen, tæller ikke nogen steder, heller ikke her.
const HB_UGYLDIG = {
  ...HB,
  faser: [{ navn: 'Indledende runde', fra: 1, til: 3, start: '2027-01-13' }, { ...HB.faser[1] }],
};

function kampe(liste) {
  mockGetDocs.mockResolvedValue({ docs: liste.map(({ id, ...d }) => ({ id, data: () => d })) });
}

const SL_KAMPE = [
  { id: 'r5-agf-ob', round: 5, home: 'AGF', away: 'OB', kickoff: nu - 5 * TIME },
  { id: 'r4-fck-bif', round: 4, home: 'FC København', away: 'Brøndby IF', kickoff: nu - 50 * TIME, result: '1', homeGoals: 2, awayGoals: 1, resultatKilde: 'manuel' },
  { id: 'r6-vff-rfc', round: 6, home: 'Viborg FF', away: 'Randers FC', kickoff: nu + 20 * TIME },
];

const PLAN = {
  dryRun: true, skrevet: false, ingenAendring: false, knockout: false,
  kamp: { id: 'r5-agf-ob', home: 'AGF', away: 'OB', round: 5, kickoff: nu - 5 * TIME },
  foer: { result: null, homeGoals: null, awayGoals: null, slut: null, resultatKilde: null },
  efter: { result: '1', homeGoals: 2, awayGoals: 0, slut: null, resultatKilde: 'manuel' },
  udfaldSkifter: true, gatet: false, eloFlytter: true, botPoster: true,
  point: { tips: 14, aendredeTips: 14, spillere: 9, iAlt: 27.7, combi: 5.7 },
  aftryk: 'aftryk-r5',
};

async function aabn(game = SL) {
  render(<ManuelFacit game={game} harSynk={game === SL} />);
  fireEvent.click(screen.getByRole('button', { name: /Sæt eller ret facit i hånden/ }));
  return screen.findByLabelText(`Kamp at sætte facit på i ${game.name}`);
}

const vaelg = (select, id) => fireEvent.change(select, { target: { value: id } });

beforeEach(() => {
  vi.clearAllMocks();
  kampe(SL_KAMPE);
});

describe('✍️ listen og advarslerne', () => {
  it('henter FØRST kampene, når knappen trykkes', async () => {
    render(<ManuelFacit game={SL} harSynk />);
    expect(mockGetDocs).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Sæt eller ret facit i hånden/ }));
    await screen.findByLabelText(/Kamp at sætte facit på/);
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
  });

  it('viser holdnavne, runde, tid og facit — ikke dokument-id\'er — og kun begyndte kampe', async () => {
    const select = await aabn();
    const tekster = within(select).getAllByRole('option').map((o) => o.textContent);
    // Manglende facit først, så dem med facit.
    expect(tekster[1]).toMatch(/^Rd 5 · AGF – OB · .+ · mangler facit$/);
    expect(tekster[2]).toMatch(/^Rd 4 · FC København – Brøndby IF · .+ · facit 2-1 · ✍️ sat i hånden$/);
    expect(tekster).toHaveLength(3); // + "Vælg kamp" — den ikke-begyndte er væk
    for (const t of tekster) {
      expect(t).not.toMatch(/r5-agf-ob|r4-fck-bif|r6-/);
      expect(t).not.toMatch(/Viborg/);
    }
  });

  it('advarslerne står ordret — og henviser ikke til en guide', async () => {
    await aabn();
    const note = screen.getByRole('note');
    expect(note.textContent).toBe(`${ADVARSEL_SYNK} ${ADVARSEL_BOT}`);
    expect(ADVARSEL_SYNK).toBe('Synken overskriver ikke denne kamp herefter. En tastefejl rettes kun her.');
    expect(ADVARSEL_BOT).toBe('Er det rundens sidste kamp, skriver Runde-Botten straks på alle ligavægge. Det kan ikke trækkes tilbage.');
    expect(note.textContent).not.toMatch(/admin-guiden|Firebase-konsollen/);
  });

  // Med en fasekalender er runden en DAG — i listen, i advarslen og i
  // prognosen. Uden kalender (og med en UGYLDIG, som ingen flade tæller)
  // er alt som før. QC-fund: listen sagde "Rd 3" og advarslen "rundens
  // sidste kamp" i en turnering, hvor alle andre flader siger "Dag 3".
  it('med fasekalender: «Dag N» og «dagens sidste kamp» — aldrig «Rd» eller «rundens»', async () => {
    kampe([{ id: 'r3-dk-no', round: 3, home: 'Danmark', away: 'Norge', kickoff: nu - 4 * TIME }]);
    const select = await aabn(HB);
    const tekster = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(tekster[1]).toMatch(/^Dag 3 · Danmark – Norge · .+ · mangler facit$/);
    expect(tekster[1]).not.toMatch(/Rd /);
    const note = screen.getByRole('note');
    expect(advarselBot(HB)).toBe('Er det dagens sidste kamp, skriver Runde-Botten straks på alle ligavægge. Det kan ikke trækkes tilbage.');
    expect(note.textContent).toBe(`${ADVARSEL_SYNK} ${advarselBot(HB)}`);
    expect(note.textContent).not.toMatch(/rundens/);

    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(false);
    vaelg(select, 'r3-dk-no');
    fireEvent.change(screen.getByLabelText('Mål Danmark'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Mål Norge'), { target: { value: '28' } });
    mockSaet.mockResolvedValue({ ok: true, data: { ...PLAN, kamp: { id: 'r3-dk-no', home: 'Danmark', away: 'Norge', round: 3, kickoff: nu - 4 * TIME } } });
    fireEvent.click(screen.getByRole('button', { name: 'Vis hvad der ændrer sig' }));
    expect(await screen.findByText('Det er dagens sidste kamp: Runde-Botten skriver straks på alle ligavægge, når du skriver.')).toBeInTheDocument();
    expect(screen.queryByText(/rundens sidste kamp/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Skriv facit' }));
    const tekst = bekraeft.mock.calls[0][0];
    expect(tekst).toContain(advarselBot(HB));
    expect(tekst).toContain('Det er dagens sidste kamp');
    expect(tekst).toContain('combi regnes for alle dagens tippere, også dem uden tip på kampen');
    expect(tekst).not.toMatch(/rundens/);
    bekraeft.mockRestore();
  });

  it('uden fasekalender: «Rd N» og «rundens sidste kamp» som før — også med en UGYLDIG kalender', async () => {
    for (const game of [SL, HB_UGYLDIG]) {
      kampe([{ id: 'r3-x', round: 3, home: 'AGF', away: 'OB', kickoff: nu - 4 * TIME }]);
      const select = await aabn(game);
      const t = within(select).getAllByRole('option')[1].textContent;
      expect(t).toMatch(/^Rd 3 · AGF – OB/);
      expect(t).not.toMatch(/Dag 3/);
      expect(advarselBot(game)).toBe(ADVARSEL_BOT);
      expect(screen.getByRole('note').textContent).not.toMatch(/dagens/);
      cleanup();
    }
    expect(prognoseLinjer({ ...PLAN }, SL).join(' ')).toContain('Det er rundens sidste kamp');
    expect(prognoseLinjer({ ...PLAN }, HB).join(' ')).toContain('Det er dagens sidste kamp');
  });

  it('melder det, når ingen kamp er begyndt', async () => {
    kampe([SL_KAMPE[2]]);
    render(<ManuelFacit game={SL} harSynk />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt eller ret facit i hånden/ }));
    expect(await screen.findByText(/Ingen af spillets kampe er begyndt endnu/)).toBeInTheDocument();
  });

  it('facitKandidater: ældste uden facit først, nyeste med facit først', () => {
    const ud = facitKandidater([
      { id: 'a', kickoff: nu - 1 * TIME, result: '1' },
      { id: 'b', kickoff: nu - 9 * TIME },
      { id: 'c', kickoff: nu - 3 * TIME },
      { id: 'd', kickoff: nu - 5 * TIME, result: 'X' },
      { id: 'e', kickoff: null },
    ], nu);
    expect(ud.map((m) => m.id)).toEqual(['b', 'c', 'a', 'd']);
  });
});

describe('✍️ felterne — ordinær tid og knockout', () => {
  it('Superligaen (ingen faser): KUN ordinær tid — også ved uafgjort', async () => {
    vaelg(await aabn(), 'r5-agf-ob');
    fireEvent.change(screen.getByLabelText('Mål AGF'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Mål OB'), { target: { value: '1' } });
    expect(screen.getByText(/^Mål efter ordinær tid:$/)).toBeInTheDocument();
    expect(screen.queryByText(/Slutresultat efter forlængelse/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Hvordan blev kampen afgjort')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vis hvad der ændrer sig' })).toBeEnabled();
  });

  it('en rettelse starter fra det facit, der står', async () => {
    vaelg(await aabn(), 'r4-fck-bif');
    expect(screen.getByLabelText('Mål FC København')).toHaveValue(2);
    expect(screen.getByLabelText('Mål Brøndby IF')).toHaveValue(1);
  });

  // En rettelse af en KO-kamp starter fra HELE det facit, der står — også
  // slutresultatet og afgørelsen. Ellers sendte "Vis hvad der ændrer sig"
  // et facit uden slut, og en rettelse af ét mål slettede slutresultatet.
  it('en rettelse af en knockout-kamp starter fra slutresultat og afgørelse', async () => {
    kampe([{
      id: 'r7-dk-se', round: 7, home: 'Danmark', away: 'Sverige', kickoff: nu - 4 * TIME,
      result: 'X', homeGoals: 30, awayGoals: 30, slut: { home: 35, away: 34, afgjort: 'straffe' }, resultatKilde: 'manuel',
    }]);
    vaelg(await aabn(HB), 'r7-dk-se');
    // Kamplisten viser begge stillinger — som spillerne ser dem.
    expect(screen.getByRole('option', { name: /facit 30-30 · 35-34 e\.str\./ })).toBeInTheDocument();
    expect(screen.getByLabelText('Mål Danmark')).toHaveValue(30);
    expect(screen.getByLabelText('Mål Sverige')).toHaveValue(30);
    expect(screen.getByLabelText('Slutresultat Danmark')).toHaveValue(35);
    expect(screen.getByLabelText('Slutresultat Sverige')).toHaveValue(34);
    expect(screen.getByLabelText('Hvordan blev kampen afgjort')).toHaveValue('straffe');
    // Udfyldt og gyldig: tør-kørslen kan spørges med det samme.
    expect(screen.getByRole('button', { name: 'Vis hvad der ændrer sig' })).toBeEnabled();
  });

  // SPORTENS spilletid: en fodbold-turnering (samme kalender, ingen sport)
  // siger 90 min. Uden testen kunne «60 min» hardkodes (modstanderens C40).
  it('knockout i en fodbold-turnering: feltet siger 90 min — ikke 60', async () => {
    kampe([{ id: 'r7-dk-se', round: 7, home: 'Danmark', away: 'Sverige', kickoff: nu - 4 * TIME }]);
    vaelg(await aabn({ ...HB, sport: undefined }), 'r7-dk-se');
    expect(screen.getByText(/^Mål efter ordinær tid \(90 min, uden forlængelse og straffekast — det, der tippes på\):$/)).toBeInTheDocument();
    expect(screen.queryByText(/60 min/)).not.toBeInTheDocument();
  });

  it('knockout + uafgjort: slutresultat og afgørelse kræves, før serveren spørges', async () => {
    kampe([{ id: 'r7-dk-se', round: 7, home: 'Danmark', away: 'Sverige', kickoff: nu - 4 * TIME }]);
    vaelg(await aabn(HB), 'r7-dk-se');
    fireEvent.change(screen.getByLabelText('Mål Danmark'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Mål Sverige'), { target: { value: '30' } });
    // Sportens ordinære spilletid (sportOrd — 60 min i håndbold), ikke fodboldens.
    expect(screen.getByText(/^Mål efter ordinær tid \(60 min, uden forlængelse og straffekast — det, der tippes på\):$/)).toBeInTheDocument();
    expect(screen.queryByText(/90 min/)).not.toBeInTheDocument();
    expect(screen.getByText(/Slutresultat efter forlængelse\/straffekast/)).toBeInTheDocument();
    const vis = screen.getByRole('button', { name: 'Vis hvad der ændrer sig' });
    expect(vis).toBeDisabled();
    expect(screen.getByText(/Slutresultatet skal være hele tal/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Slutresultat Danmark'), { target: { value: '35' } });
    fireEvent.change(screen.getByLabelText('Slutresultat Sverige'), { target: { value: '34' } });
    expect(screen.getByText(/Vælg, hvordan kampen blev afgjort/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Hvordan blev kampen afgjort'), { target: { value: 'forlaenget' } });
    expect(vis).toBeEnabled();

    mockSaet.mockResolvedValue({ ok: true, data: { ...PLAN, knockout: true, efter: { ...PLAN.efter, result: 'X', homeGoals: 30, awayGoals: 30, slut: { home: 35, away: 34, afgjort: 'forlaenget' } } } });
    fireEvent.click(vis);
    await waitFor(() => expect(mockSaet).toHaveBeenCalledWith({
      gameId: 'hvm2027', matchId: 'r7-dk-se', homeGoals: 30, awayGoals: 30,
      slut: { home: 35, away: 34, afgjort: 'forlaenget' }, dryRun: true,
    }));
    expect(await screen.findByText(/Slutresultat 35-34 efter forlænget spilletid — vises separat og flytter ingen point/)).toBeInTheDocument();
  });

  // C12: knockout-skrivningen i fladen — hvad der SENDES, og hvad der VISES.
  it('knockout: Skriv facit sender slut og aftryk, og kvitteringen nævner slutresultatet', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(true);
    kampe([{ id: 'r7-dk-se', round: 7, home: 'Danmark', away: 'Sverige', kickoff: nu - 4 * TIME }]);
    vaelg(await aabn(HB), 'r7-dk-se');
    fireEvent.change(screen.getByLabelText('Mål Danmark'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Mål Sverige'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Slutresultat Danmark'), { target: { value: '35' } });
    fireEvent.change(screen.getByLabelText('Slutresultat Sverige'), { target: { value: '34' } });
    fireEvent.change(screen.getByLabelText('Hvordan blev kampen afgjort'), { target: { value: 'forlaenget' } });
    const plan = {
      ...PLAN, knockout: true, botPoster: false, aftryk: 'aftryk-ko',
      kamp: { id: 'r7-dk-se', home: 'Danmark', away: 'Sverige', round: 7, kickoff: nu - 4 * TIME },
      efter: { result: 'X', homeGoals: 30, awayGoals: 30, slut: { home: 35, away: 34, afgjort: 'forlaenget' }, resultatKilde: 'manuel' },
    };
    mockSaet.mockResolvedValueOnce({ ok: true, data: plan }).mockResolvedValueOnce({ ok: true, data: { ...plan, dryRun: false, skrevet: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Vis hvad der ændrer sig' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skriv facit' }));
    await waitFor(() => expect(mockSaet).toHaveBeenCalledTimes(2));
    expect(mockSaet.mock.calls[1][0]).toEqual({
      gameId: 'hvm2027', matchId: 'r7-dk-se', homeGoals: 30, awayGoals: 30,
      slut: { home: 35, away: 34, afgjort: 'forlaenget' }, aftryk: 'aftryk-ko', dryRun: false,
    });
    const kvit = await screen.findByText(/^Facit skrevet:/);
    expect(kvit.textContent).toBe('Facit skrevet: Danmark – Sverige 30-30 (X), slutresultat 35-34 efter forlænget spilletid. Point, Elo og odds afregnes nu af serveren.');
    expect(kvit.textContent).not.toMatch(/r7-dk-se|Runde-Botten/);
    bekraeft.mockRestore();
  });

  for (const [navn, aendr] of [
    ['slutresultatet hjemme', () => fireEvent.change(screen.getByLabelText('Slutresultat Danmark'), { target: { value: '36' } })],
    ['slutresultatet ude', () => fireEvent.change(screen.getByLabelText('Slutresultat Sverige'), { target: { value: '33' } })],
    ['afgørelsen', () => fireEvent.change(screen.getByLabelText('Hvordan blev kampen afgjort'), { target: { value: 'straffe' } })],
  ]) {
    it(`knockout: en ændring af ${navn} fjerner en forældet tør-kørsel`, async () => {
      kampe([{ id: 'r7-dk-se', round: 7, home: 'Danmark', away: 'Sverige', kickoff: nu - 4 * TIME }]);
      vaelg(await aabn(HB), 'r7-dk-se');
      fireEvent.change(screen.getByLabelText('Mål Danmark'), { target: { value: '30' } });
      fireEvent.change(screen.getByLabelText('Mål Sverige'), { target: { value: '30' } });
      fireEvent.change(screen.getByLabelText('Slutresultat Danmark'), { target: { value: '35' } });
      fireEvent.change(screen.getByLabelText('Slutresultat Sverige'), { target: { value: '34' } });
      fireEvent.change(screen.getByLabelText('Hvordan blev kampen afgjort'), { target: { value: 'forlaenget' } });
      mockSaet.mockResolvedValue({ ok: true, data: { ...PLAN, knockout: true, efter: { ...PLAN.efter, result: 'X', homeGoals: 30, awayGoals: 30, slut: { home: 35, away: 34, afgjort: 'forlaenget' } } } });
      fireEvent.click(screen.getByRole('button', { name: 'Vis hvad der ændrer sig' }));
      await screen.findByRole('button', { name: 'Skriv facit' });
      aendr();
      expect(screen.queryByRole('button', { name: 'Skriv facit' })).not.toBeInTheDocument();
      expect(screen.queryByText(/Slutresultat 35-34 efter forlænget spilletid/)).not.toBeInTheDocument();
    });
  }

  it('knockout med en vinder i ordinær tid: ingen slut-felter', async () => {
    kampe([{ id: 'r7-dk-se', round: 7, home: 'Danmark', away: 'Sverige', kickoff: nu - 4 * TIME }]);
    vaelg(await aabn(HB), 'r7-dk-se');
    fireEvent.change(screen.getByLabelText('Mål Danmark'), { target: { value: '31' } });
    fireEvent.change(screen.getByLabelText('Mål Sverige'), { target: { value: '30' } });
    expect(screen.queryByText(/Slutresultat efter forlængelse/)).not.toBeInTheDocument();
  });

  it('en UGYLDIG kalender kender ingen knockout — samme svar som serveren', async () => {
    kampe([{ id: 'r7-dk-se', round: 7, home: 'Danmark', away: 'Sverige', kickoff: nu - 4 * TIME }]);
    vaelg(await aabn(HB_UGYLDIG), 'r7-dk-se');
    fireEvent.change(screen.getByLabelText('Mål Danmark'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Mål Sverige'), { target: { value: '30' } });
    expect(screen.queryByText(/Slutresultat efter forlængelse/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Hvordan blev kampen afgjort')).not.toBeInTheDocument();
    expect(screen.queryByText(/uden forlængelse og straffekast/)).not.toBeInTheDocument();
    expect(screen.getByText(/^Mål efter ordinær tid:$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vis hvad der ændrer sig' })).toBeEnabled();
  });

  it('en kamp i håndboldspillets indledende runde er ikke knockout', async () => {
    kampe([{ id: 'r2-dk-no', round: 2, home: 'Danmark', away: 'Norge', kickoff: nu - 4 * TIME }]);
    vaelg(await aabn(HB), 'r2-dk-no');
    fireEvent.change(screen.getByLabelText('Mål Danmark'), { target: { value: '28' } });
    fireEvent.change(screen.getByLabelText('Mål Norge'), { target: { value: '28' } });
    expect(screen.queryByText(/Slutresultat efter forlængelse/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vis hvad der ændrer sig' })).toBeEnabled();
  });
});

describe('✍️ tør-kørsel → skriv', () => {
  async function tast(h = '2', a = '0') {
    vaelg(await aabn(), 'r5-agf-ob');
    fireEvent.change(screen.getByLabelText('Mål AGF'), { target: { value: h } });
    fireEvent.change(screen.getByLabelText('Mål OB'), { target: { value: a } });
  }

  it('skrive-knappen findes FØRST efter tør-kørslen — og prognosen står med tal', async () => {
    await tast();
    expect(screen.queryByRole('button', { name: 'Skriv facit' })).not.toBeInTheDocument();
    mockSaet.mockResolvedValue({ ok: true, data: PLAN });
    fireEvent.click(screen.getByRole('button', { name: 'Vis hvad der ændrer sig' }));
    expect(await screen.findByRole('button', { name: 'Skriv facit' })).toBeInTheDocument();
    expect(mockSaet).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true, homeGoals: 2, awayGoals: 0, slut: null }));
    expect(screen.getByText('1/X/2: intet facit → 1. Mål: — → 2-0.')).toBeInTheDocument();
    expect(screen.getByText('14 tips på kampen. 9 spillere får ændret point, i alt +27,7 (heraf combi +5,7 — combi regnes for alle rundens tippere, også dem uden tip på kampen). Elo og odds på kommende kampe regnes om.')).toBeInTheDocument();
    expect(screen.getByText(/rundens sidste kamp: Runde-Botten skriver straks/)).toBeInTheDocument();
  });

  // HVER ændring af kamp eller felter skal fjerne en forældet tør-kørsel —
  // ellers stod "Skriv facit" under en plan for noget andet end felterne.
  // Én test pr. felt: en manglende nulstil() i ét af dem er rød her.
  for (const [navn, aendr] of [
    ['kampen', () => vaelg(screen.getByLabelText(`Kamp at sætte facit på i ${SL.name}`), 'r4-fck-bif')],
    ['mål hjemme', () => fireEvent.change(screen.getByLabelText('Mål AGF'), { target: { value: '3' } })],
    ['mål ude', () => fireEvent.change(screen.getByLabelText('Mål OB'), { target: { value: '1' } })],
  ]) {
    it(`en ændring af ${navn} fjerner en forældet tør-kørsel`, async () => {
      await tast();
      mockSaet.mockResolvedValue({ ok: true, data: PLAN });
      fireEvent.click(screen.getByRole('button', { name: 'Vis hvad der ændrer sig' }));
      await screen.findByRole('button', { name: 'Skriv facit' });
      expect(screen.getByText('1/X/2: intet facit → 1. Mål: — → 2-0.')).toBeInTheDocument();
      aendr();
      expect(screen.queryByRole('button', { name: 'Skriv facit' })).not.toBeInTheDocument();
      expect(screen.queryByText(/1\/X\/2: intet facit → 1/)).not.toBeInTheDocument();
    });
  }

  // Skrive-kaldet bærer PLANEN — det, tør-kørslen viste — og dens aftryk.
  // Planen er her med vilje en anden end felterne (3-0 mod 2-0): så kan
  // testen se, hvad der faktisk sendes.
  it('Skriv facit sender tør-kørslens plan og aftryk — ikke felternes indhold', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await tast('2', '0');
    const vist = { ...PLAN, efter: { ...PLAN.efter, homeGoals: 3, awayGoals: 0 }, aftryk: 'aftryk-vist' };
    mockSaet.mockResolvedValueOnce({ ok: true, data: vist }).mockResolvedValueOnce({ ok: true, data: { ...vist, dryRun: false, skrevet: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Vis hvad der ændrer sig' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skriv facit' }));
    expect(bekraeft.mock.calls[0][0]).toContain('Mål: — → 3-0.');
    await waitFor(() => expect(mockSaet).toHaveBeenCalledTimes(2));
    expect(mockSaet.mock.calls[1][0]).toEqual({
      gameId: 'superliga2627', matchId: 'r5-agf-ob', homeGoals: 3, awayGoals: 0, slut: null, aftryk: 'aftryk-vist', dryRun: false,
    });
    bekraeft.mockRestore();
  });

  it('afviser serveren skrivningen (kampen er ændret), forsvinder skrive-knappen med beskeden', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await tast();
    mockSaet
      .mockResolvedValueOnce({ ok: true, data: PLAN })
      .mockResolvedValueOnce({ ok: false, error: 'Kampen er ændret siden tør-kørslen — kør tør-kørslen igen. Intet er skrevet.' });
    fireEvent.click(screen.getByRole('button', { name: 'Vis hvad der ændrer sig' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skriv facit' }));
    expect(await screen.findByText('Kampen er ændret siden tør-kørslen — kør tør-kørslen igen. Intet er skrevet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skriv facit' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Facit skrevet/)).not.toBeInTheDocument();
    bekraeft.mockRestore();
  });

  it('confirm navngiver kampen, prognosen og begge advarsler; annuller = intet kald', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await tast();
    mockSaet.mockResolvedValue({ ok: true, data: PLAN });
    fireEvent.click(screen.getByRole('button', { name: 'Vis hvad der ændrer sig' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skriv facit' }));
    const tekst = bekraeft.mock.calls[0][0];
    expect(tekst).toMatch(/^Skriv facit for AGF – OB i "Superligaen 2026\/27"\?/);
    expect(tekst).toContain(ADVARSEL_SYNK);
    expect(tekst).toContain(ADVARSEL_BOT);
    expect(tekst).toContain('9 spillere får ændret point');
    expect(tekst).not.toContain('r5-agf-ob');
    expect(mockSaet).toHaveBeenCalledTimes(1); // kun tør-kørslen
    bekraeft.mockRestore();
  });

  it('OK skriver med dryRun:false, kvitterer og henter listen igen', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await tast();
    mockSaet
      .mockResolvedValueOnce({ ok: true, data: PLAN })
      .mockResolvedValueOnce({ ok: true, data: { ...PLAN, dryRun: false, skrevet: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Vis hvad der ændrer sig' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skriv facit' }));
    await waitFor(() => expect(mockSaet).toHaveBeenLastCalledWith({
      gameId: 'superliga2627', matchId: 'r5-agf-ob', homeGoals: 2, awayGoals: 0, slut: null, aftryk: 'aftryk-r5', dryRun: false,
    }));
    expect(await screen.findByText(/Facit skrevet: AGF – OB 2-0 \(1\)\. Point, Elo og odds afregnes nu af serveren, og Runde-Botten poster/)).toBeInTheDocument();
    await waitFor(() => expect(mockGetDocs).toHaveBeenCalledTimes(2));
    bekraeft.mockRestore();
  });

  it('svarer serveren med en tør-kørsel, siger fladen, at INTET er skrevet', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await tast();
    mockSaet.mockResolvedValue({ ok: true, data: PLAN });
    fireEvent.click(screen.getByRole('button', { name: 'Vis hvad der ændrer sig' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skriv facit' }));
    expect(await screen.findByText(/Serveren skrev INTET/)).toBeInTheDocument();
    expect(screen.queryByText(/Facit skrevet/)).not.toBeInTheDocument();
    bekraeft.mockRestore();
  });

  // Svaret siger dryRun:false, men skrevet:false (fx facit stod der i
  // forvejen). Det er IKKE en skrivning — fladen må ikke kvittere grønt.
  it('svarer serveren dryRun:false men skrevet:false, siger fladen, at INTET er skrevet', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await tast();
    mockSaet
      .mockResolvedValueOnce({ ok: true, data: PLAN })
      .mockResolvedValueOnce({ ok: true, data: { ...PLAN, dryRun: false, skrevet: false } });
    fireEvent.click(screen.getByRole('button', { name: 'Vis hvad der ændrer sig' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skriv facit' }));
    const fejl = await screen.findByText('Serveren skrev INTET. Vis ændringen igen.');
    expect(fejl).toHaveClass('badge--red');
    expect(screen.queryByText(/Facit skrevet/)).not.toBeInTheDocument();
    bekraeft.mockRestore();
  });

  // Kvitteringen står uden for panelet (den skal overleve genmonteringen),
  // men en gammel grøn "Facit skrevet" må ikke blive stående, når panelet
  // lukkes og åbnes igen — så lignede den svaret på den næste handling.
  it('kvitteringen forsvinder, når panelet lukkes', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await tast();
    mockSaet
      .mockResolvedValueOnce({ ok: true, data: PLAN })
      .mockResolvedValueOnce({ ok: true, data: { ...PLAN, dryRun: false, skrevet: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Vis hvad der ændrer sig' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skriv facit' }));
    expect(await screen.findByText(/^Facit skrevet:/)).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /Sæt eller ret facit i hånden/ });
    fireEvent.click(toggle); // luk
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/Facit skrevet/)).not.toBeInTheDocument();
    bekraeft.mockRestore();
  });

  it('viser serverens afvisning', async () => {
    await tast();
    mockSaet.mockResolvedValue({ ok: false, error: 'Kampen er ikke begyndt endnu, og tips kan stadig afgives.' });
    fireEvent.click(screen.getByRole('button', { name: 'Vis hvad der ændrer sig' }));
    expect(await screen.findByText(/ikke begyndt endnu/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skriv facit' })).not.toBeInTheDocument();
  });

  it('ingen skrive-knap, når facit allerede står sådan i hånden', async () => {
    vaelg(await aabn(), 'r4-fck-bif');
    mockSaet.mockResolvedValue({ ok: true, data: { ...PLAN, ingenAendring: true, udfaldSkifter: false } });
    fireEvent.click(screen.getByRole('button', { name: 'Vis hvad der ændrer sig' }));
    expect(await screen.findByText(/Facit står allerede sådan/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skriv facit' })).not.toBeInTheDocument();
  });
});

describe('↩️ Lad synken overtage igen', () => {
  it('vises for en kamp sat i hånden i et spil MED synk — og skriver efter bekræftelse', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vaelg(await aabn(), 'r4-fck-bif');
    mockFrigiv.mockResolvedValue({ ok: true, data: { dryRun: false, varManuel: true, frigivet: true } });
    fireEvent.click(screen.getByRole('button', { name: /Lad synken overtage igen/ }));
    expect(bekraeft.mock.calls[0][0]).toMatch(/overskriver synken det ved næste kørsel/);
    await waitFor(() => expect(mockFrigiv).toHaveBeenCalledWith({ gameId: 'superliga2627', matchId: 'r4-fck-bif', dryRun: false }));
    // C14: kvitteringen — ordlyd, farve, og at fejlteksten IKKE står.
    const kvit = await screen.findByText('FC København – Brøndby IF er givet tilbage til synken.');
    expect(kvit).toHaveClass('badge--green');
    expect(kvit.textContent).not.toMatch(/r4-fck-bif/);
    expect(screen.queryByText(/Serveren ændrede INTET/)).not.toBeInTheDocument();
    // Panelet er monteret forfra: kamplisten hentes igen og viser det nye.
    await waitFor(() => expect(mockGetDocs).toHaveBeenCalledTimes(2));
    bekraeft.mockRestore();
  });

  it('frigiver serveren INTET, siger fladen det — og kvitterer ikke', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vaelg(await aabn(), 'r4-fck-bif');
    mockFrigiv.mockResolvedValue({ ok: true, data: { dryRun: false, varManuel: false, frigivet: false } });
    fireEvent.click(screen.getByRole('button', { name: /Lad synken overtage igen/ }));
    const fejl = await screen.findByText('Serveren ændrede INTET. Prøv igen.');
    expect(fejl).toHaveClass('badge--red');
    expect(screen.queryByText(/givet tilbage til synken/)).not.toBeInTheDocument();
    bekraeft.mockRestore();
  });

  it('annulleret bekræftelse frigiver intet', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(false);
    vaelg(await aabn(), 'r4-fck-bif');
    fireEvent.click(screen.getByRole('button', { name: /Lad synken overtage igen/ }));
    expect(mockFrigiv).not.toHaveBeenCalled();
    bekraeft.mockRestore();
  });

  it('vises IKKE for en kamp, synken ejer', async () => {
    vaelg(await aabn(), 'r5-agf-ob');
    expect(screen.queryByRole('button', { name: /Lad synken overtage igen/ })).not.toBeInTheDocument();
  });

  it('vises IKKE i et spil uden synk — der er intet at give kampen tilbage til', async () => {
    kampe([{ id: 'r1-dk-no', round: 1, home: 'Danmark', away: 'Norge', kickoff: nu - 4 * TIME, result: '1', homeGoals: 30, awayGoals: 28, resultatKilde: 'manuel' }]);
    vaelg(await aabn(HB), 'r1-dk-no');
    expect(screen.queryByRole('button', { name: /Lad synken overtage igen/ })).not.toBeInTheDocument();
  });
});

describe('prognoseLinjer', () => {
  it('1X2 uændret: siger, at intet flytter sig — og nævner ingen point', () => {
    const l = prognoseLinjer({ ...PLAN, udfaldSkifter: false, botPoster: false, foer: { ...PLAN.efter, homeGoals: 1, resultatKilde: null } });
    expect(l.join(' ')).toMatch(/1X2 er det samme, så ingen point, Elo eller odds flytter sig/);
    expect(l.join(' ')).not.toMatch(/spillere får ændret point|Runde-Botten/);
  });
  it('gatet kamp: ingen point, men Elo og odds', () => {
    const l = prognoseLinjer({ ...PLAN, gatet: true, botPoster: false }).join(' ');
    expect(l).toMatch(/før spillets start og giver ingen point/);
    expect(l).not.toMatch(/spillere får ændret point/);
  });
  // VENDT BEVIDST (task #14). Mens serveren kun genberegnede kampens egne
  // tippere, stod der en sætning om "N spillere uden tip på denne kamp får
  // ændret combi … men ikke nu", fodret af feltet `senere`. Nu genberegner
  // serveren hele runden, og spillerne er med i tallet. Sætningen må ALDRIG
  // komme igen — heller ikke hvis en gammel server stadig sender `senere`
  // (hosting rulles ud minutter før functions).
  it('ingen sætning om combi "senere" — heller ikke når en gammel server sender feltet', () => {
    for (const senere of [{ spillere: 3, combi: 12.4 }, { spillere: 0, combi: 0 }, undefined]) {
      const l = prognoseLinjer({ ...PLAN, senere }).join(' ');
      expect(l).not.toMatch(/uden tip på denne kamp|men ikke nu|Genberegn point|3 spillere/);
    }
  });
  // QC: "8 tips på kampen. 10 spillere får ændret point" ligner en fejl, når
  // combi'en også går til rundens tippere uden tip på kampen. Linjen siger
  // det — men KUN når der er combi; ellers er tallet bare kampens tippere.
  it('med combi siger linjen, at combi regnes for hele runden — uden combi gør den ikke', () => {
    const med = prognoseLinjer({ ...PLAN, botPoster: false, point: { tips: 8, aendredeTips: 8, spillere: 10, iAlt: 30.2, combi: 11.4 } });
    expect(med).toContain('8 tips på kampen. 10 spillere får ændret point, i alt +30,2 (heraf combi +11,4 — combi regnes for alle rundens tippere, også dem uden tip på kampen). Elo og odds på kommende kampe regnes om.');
    const uden = prognoseLinjer({ ...PLAN, botPoster: false, point: { tips: 8, aendredeTips: 8, spillere: 8, iAlt: 12, combi: 0 } }).join(' ');
    expect(uden).toContain('8 tips på kampen. 8 spillere får ændret point, i alt +12,0. Elo og odds på kommende kampe regnes om.');
    expect(uden).not.toMatch(/rundens tippere|uden tip på kampen/);
  });
  it('combi nævnes kun, når den flytter sig — og negative tal har ægte minus', () => {
    const l = prognoseLinjer({ ...PLAN, botPoster: false, point: { tips: 3, aendredeTips: 3, spillere: 2, iAlt: -4, combi: 0 } }).join(' ');
    expect(l).toContain('i alt −4,0.');
    expect(l).not.toMatch(/combi/);
  });
});
