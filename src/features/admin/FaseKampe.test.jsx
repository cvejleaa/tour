// Tests for 📥 Læg næste fases kampe ind (FaseKampe.jsx, D9).
//
// Fladen opretter kampe i produktion gennem serveren, og en oprettet kamp kan
// ikke slettes i appen. Testene binder derfor: at advarslen står ORDRET (og
// at «Hent» ikke står — knappen henter intet), at formularens rullelister er
// spillets egne hold, at det, der sendes, er de rå felter (ingen fortolkning
// i klienten), at tør-kørslens tabel viser tiden i dansk tid, at
// «Opret»-knappen KUN findes efter en tør-kørsel uden fejl og forsvinder, når
// et felt ændres, og at confirm navngiver kampene og advarslen.
import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import {
  render, screen, fireEvent, waitFor, within,
} from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {} }));
const mockGetDocs = vi.fn();
vi.mock('firebase/firestore', () => ({
  collection: (...a) => ({ __sti: a.slice(1) }),
  getDocs: (...a) => mockGetDocs(...a),
}));
const mockOpret = vi.fn();
const mockRet = vi.fn();
vi.mock('./adminActions', () => ({
  callOpretFaseKampe: (...a) => mockOpret(...a),
  callRetFaseKampKickoff: (...a) => mockRet(...a),
}));

import FaseKampe, {
  KNAP_TEKST, ADVARSEL_FORTRYD, FORKLARING, retteKandidater, forudfyldDato, rundensDatoListe,
} from './FaseKampe';
import { TEST_FASER, TEST_FASER_EN_KVARTRUNDE } from '../../test/faseKalender';
import { GAMES } from '../../../scripts/games.mjs';
import { HAANDBOLD_VM2027_HOLD } from '../../data/haandboldVm2027Hold';

const HVM = { ...GAMES.find((g) => g.id === 'hvm2027'), id: 'hvm2027', teams: HAANDBOLD_VM2027_HOLD };
// Kvartfinalerne som én runde over tir 26/1 + ons 27/1 (sidsteDato).
const HVM_EN = { ...HVM, faser: TEST_FASER_EN_KVARTRUNDE };

const STATUS = {
  faser: [{ navn: 'Hovedrunde', har: 0, antalKampe: 36 }],
  aabneDage: [{ runde: 8, etiket: 'Hovedrunde · dag 1 (ons 20/1)', dato: '2027-01-20', har: 0, forventet: 6 }],
  linjer: ['Hovedrunde: 0 af 36 kampe er lagt ind.', 'Dage, der mangler kampe og stadig kan få dem: Hovedrunde · dag 1 (ons 20/1) 0 af 6.'],
};
const PLAN = {
  dryRun: true, skrevet: false, aftryk: 'aftryk-1', status: STATUS, puljeAfgoeres: false,
  nye: [{ id: 'r8-den-nor', round: 8, etiket: 'Hovedrunde · dag 1', home: 'Danmark', away: 'Norge', kickoff: 1, tid: 'ons 20/1 kl. 18.00', odds: { 1: 1.4, X: 9.5, 2: 4.25 } }],
  fejl: [],
  advarsler: ['Hovedrunde · dag 1 (ons 20/1): 1 af 6 kampe efter denne oprettelse. Læg helst hele dagen ind ad gangen — Tip-siden ser færdig ud med en halv dag.'],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockOpret.mockResolvedValue({ ok: true, data: { ...PLAN, nye: [], advarsler: [] } });
});

async function aabn(game = HVM) {
  render(<FaseKampe game={game} />);
  fireEvent.click(screen.getByRole('button', { name: KNAP_TEKST }));
  await screen.findByText('Hovedrunde: 0 af 36 kampe er lagt ind.');
}

function udfyld(i, { dato, tid, hjemme, ude }) {
  if (dato != null) fireEvent.change(screen.getByLabelText(`Dato, kamp ${i}`), { target: { value: dato } });
  fireEvent.change(screen.getByLabelText(`Tid (dansk tid), kamp ${i}`), { target: { value: tid } });
  fireEvent.change(screen.getByLabelText(`Hjemmehold, kamp ${i}`), { target: { value: hjemme } });
  fireEvent.change(screen.getByLabelText(`Udehold, kamp ${i}`), { target: { value: ude } });
}

describe('📥 Læg næste fases kampe ind', () => {
  it('knappen siger «Læg … ind» — aldrig «Hent» — og panelet bærer advarslen ordret', async () => {
    await aabn();
    expect(screen.getByRole('button', { name: '📥 Læg næste fases kampe ind' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(ADVARSEL_FORTRYD);
    expect(ADVARSEL_FORTRYD).toBe('Oprettede kampe kan ikke fortrydes i appen: de kan hverken slettes eller flyttes til en anden dag. Kun kickoff kan rettes (nedenfor), så længe kampen ikke er gået i gang.');
    expect(screen.getByText(FORKLARING)).toBeInTheDocument();
    expect(FORKLARING).toMatch(/dansk tid/);
    expect(screen.queryByText(/\bHent\b/)).toBeNull();
    // Status kommer fra serveren — en tør-kørsel uden kampe.
    expect(mockOpret).toHaveBeenCalledWith({ gameId: 'hvm2027', kampe: [], dryRun: true });
    expect(screen.getByText(/Hovedrunde · dag 1 \(ons 20\/1\) 0 af 6/)).toBeInTheDocument();
  });

  it('første række starter på serverens første åbne dag; rullelisterne er spillets 32 hold, sorteret', async () => {
    await aabn();
    expect(screen.getByLabelText('Dato, kamp 1').value).toBe('2027-01-20');
    const valg = within(screen.getByLabelText('Hjemmehold, kamp 1')).getAllByRole('option').map((o) => o.value).filter(Boolean);
    expect(valg).toHaveLength(32);
    expect(valg).toEqual([...HAANDBOLD_VM2027_HOLD.map((t) => t.name)].sort((a, b) => a.localeCompare(b, 'da')));
    expect(valg).not.toContain('AGF');
  });

  it('«Vis hvad der oprettes» sender de RÅ felter; tabellen viser tiden i dansk tid og odds', async () => {
    await aabn();
    expect(screen.getByRole('button', { name: 'Vis hvad der oprettes' })).toBeDisabled();
    udfyld(1, { tid: '18:00', hjemme: 'Danmark', ude: 'Norge' });
    mockOpret.mockResolvedValueOnce({ ok: true, data: PLAN });
    fireEvent.click(screen.getByRole('button', { name: 'Vis hvad der oprettes' }));
    const tabel = await screen.findByRole('table', { name: 'Kampe, der oprettes' });
    expect(mockOpret).toHaveBeenLastCalledWith({
      gameId: 'hvm2027', kampe: [{ dato: '2027-01-20', tid: '18:00', hjemme: 'Danmark', ude: 'Norge' }], dryRun: true,
    });
    expect(within(tabel).getByText('ons 20/1 kl. 18.00')).toBeInTheDocument();
    expect(within(tabel).getByText('Danmark – Norge')).toBeInTheDocument();
    expect(within(tabel).getByText('1,40 / 9,50 / 4,25')).toBeInTheDocument();
    expect(screen.getByText(/1 af 6 kampe efter denne oprettelse/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Opret de 1 kamp' })).toBeInTheDocument();
  });

  it('med fejl: ingen «Opret»-knap — og fejlen står med kampens nummer', async () => {
    await aabn();
    udfyld(1, { tid: '18:00', hjemme: 'Danmark', ude: 'Norge' });
    mockOpret.mockResolvedValueOnce({ ok: true, data: { ...PLAN, nye: [], fejl: [{ linje: 1, tekst: 'Norge har ingen kamp i den indledende runde' }] } });
    fireEvent.click(screen.getByRole('button', { name: 'Vis hvad der oprettes' }));
    expect(await screen.findByText('Kamp 1: Norge har ingen kamp i den indledende runde')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Opret de/ })).toBeNull();
  });

  it('et ændret felt efter tør-kørslen fjerner «Opret»-knappen', async () => {
    await aabn();
    udfyld(1, { tid: '18:00', hjemme: 'Danmark', ude: 'Norge' });
    mockOpret.mockResolvedValueOnce({ ok: true, data: PLAN });
    fireEvent.click(screen.getByRole('button', { name: 'Vis hvad der oprettes' }));
    await screen.findByRole('button', { name: 'Opret de 1 kamp' });
    fireEvent.change(screen.getByLabelText('Tid (dansk tid), kamp 1'), { target: { value: '20:30' } });
    expect(screen.queryByRole('button', { name: /^Opret de/ })).toBeNull();
  });

  it('«Opret» spørger med kampene og advarslen, og opretter PLANEN med aftrykket', async () => {
    await aabn();
    udfyld(1, { tid: '18:00', hjemme: 'Danmark', ude: 'Norge' });
    mockOpret.mockResolvedValueOnce({ ok: true, data: PLAN });
    fireEvent.click(screen.getByRole('button', { name: 'Vis hvad der oprettes' }));
    const knap = await screen.findByRole('button', { name: 'Opret de 1 kamp' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockOpret.mockResolvedValueOnce({ ok: true, data: { ...PLAN, dryRun: false, skrevet: true, puljeAfregnet: { settled: 7 } } });
    fireEvent.click(knap);
    await screen.findByText('1 kamp oprettet. Puljen er afgjort og afregnet (7 tip).');
    const tekst = confirm.mock.calls[0][0];
    expect(tekst).toContain('Hovedrunde · dag 1: Danmark – Norge, ons 20/1 kl. 18.00');
    expect(tekst).toContain(ADVARSEL_FORTRYD);
    expect(tekst).toContain('1 af 6 kampe efter denne oprettelse');
    // Kald 1 = status, 2 = tør-kørslen, 3 = oprettelsen (4 = ny status efter genmonteringen).
    expect(mockOpret).toHaveBeenNthCalledWith(3, {
      gameId: 'hvm2027', kampe: [{ dato: '2027-01-20', tid: '18:00', hjemme: 'Danmark', ude: 'Norge' }], aftryk: 'aftryk-1', dryRun: false,
    });
    confirm.mockRestore();
  });

  it('nej i confirm opretter intet; et svar uden skrevet siger det', async () => {
    await aabn();
    udfyld(1, { tid: '18:00', hjemme: 'Danmark', ude: 'Norge' });
    mockOpret.mockResolvedValueOnce({ ok: true, data: PLAN });
    fireEvent.click(screen.getByRole('button', { name: 'Vis hvad der oprettes' }));
    const knap = await screen.findByRole('button', { name: 'Opret de 1 kamp' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(knap);
    expect(mockOpret).toHaveBeenCalledTimes(2);
    confirm.mockReturnValue(true);
    mockOpret.mockResolvedValueOnce({ ok: true, data: { ...PLAN, dryRun: true, skrevet: false } });
    fireEvent.click(knap);
    expect(await screen.findByText('Serveren oprettede INTET. Vis igen.')).toBeInTheDocument();
    confirm.mockRestore();
  });

  it('serverens afvisning («noget er ændret») vises, og planen forsvinder', async () => {
    await aabn();
    udfyld(1, { tid: '18:00', hjemme: 'Danmark', ude: 'Norge' });
    mockOpret.mockResolvedValueOnce({ ok: true, data: PLAN });
    fireEvent.click(screen.getByRole('button', { name: 'Vis hvad der oprettes' }));
    const knap = await screen.findByRole('button', { name: 'Opret de 1 kamp' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockOpret.mockResolvedValueOnce({ ok: false, error: 'Noget er ændret siden tør-kørslen (et facit, en pris eller en kamp) — vis igen. Intet er oprettet.' });
    fireEvent.click(knap);
    expect(await screen.findByText(/Noget er ændret siden tør-kørslen/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Opret de/ })).toBeNull();
    confirm.mockRestore();
  });

  it('en anden dato sendes, som den er tastet — klienten udleder ikke dagen', async () => {
    await aabn();
    udfyld(1, { dato: '2027-01-21', tid: '20:30', hjemme: 'Sverige', ude: 'Island' });
    mockOpret.mockResolvedValueOnce({ ok: true, data: { ...PLAN, nye: [] } });
    fireEvent.click(screen.getByRole('button', { name: 'Vis hvad der oprettes' }));
    await waitFor(() => expect(mockOpret).toHaveBeenLastCalledWith({
      gameId: 'hvm2027', kampe: [{ dato: '2027-01-21', tid: '20:30', hjemme: 'Sverige', ude: 'Island' }], dryRun: true,
    }));
  });

  it('flere kampe: ＋ Tilføj kamp arver datoen, og ✕ fjerner rækken', async () => {
    await aabn();
    fireEvent.click(screen.getByRole('button', { name: '＋ Tilføj kamp' }));
    expect(screen.getByLabelText('Dato, kamp 2').value).toBe('2027-01-20');
    fireEvent.click(screen.getByRole('button', { name: 'Fjern kamp 2' }));
    expect(screen.queryByLabelText('Dato, kamp 2')).toBeNull();
  });
});

describe('🕒 Ret kickoff på en kamp', () => {
  const nu = Date.now();
  const KAMPE = [
    { id: 'r8-den-nor', round: 8, home: 'Danmark', away: 'Norge', kickoff: nu + 5 * 3600e3 },
    { id: 'r7-isl-mkd', round: 7, home: 'Island', away: 'Nordmakedonien', kickoff: nu - 3600e3 },
    { id: 'r8-swe-esp', round: 8, home: 'Sverige', away: 'Spanien', kickoff: nu + 6 * 3600e3, result: '1' },
  ];
  it('kun kampe uden facit, der ikke er gået i gang, kan vælges', () => {
    expect(retteKandidater(KAMPE, nu).map((m) => m.id)).toEqual(['r8-den-nor']);
  });
  it('tør-kørsel → før og efter i dansk tid → ret med aftrykket', async () => {
    mockGetDocs.mockResolvedValue({ docs: KAMPE.map(({ id, ...d }) => ({ id, data: () => d })) });
    await aabn();
    fireEvent.click(screen.getByRole('button', { name: '🕒 Ret kickoff på en kamp' }));
    const select = await screen.findByLabelText('Kamp at rette kickoff på i Håndbold-VM 2027');
    expect(within(select).getAllByRole('option').map((o) => o.value)).toEqual(['', 'r8-den-nor']);
    fireEvent.change(select, { target: { value: 'r8-den-nor' } });
    fireEvent.change(screen.getByLabelText('Nyt kickoff (dansk tid)'), { target: { value: '18:00' } });
    const svar = {
      dryRun: true, skrevet: false, aftryk: 'k-1', advarsler: [],
      kamp: { id: 'r8-den-nor', home: 'Danmark', away: 'Norge' },
      foer: { tid: 'ons 20/1 kl. 20.30' }, efter: { tid: 'ons 20/1 kl. 18.00' },
    };
    mockRet.mockResolvedValueOnce({ ok: true, data: svar });
    fireEvent.click(screen.getByRole('button', { name: 'Vis rettelsen' }));
    expect(await screen.findByText(/ons 20\/1 kl\. 20\.30 →/)).toBeInTheDocument();
    expect(mockRet).toHaveBeenLastCalledWith({ gameId: 'hvm2027', matchId: 'r8-den-nor', tid: '18:00', dryRun: true });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockRet.mockResolvedValueOnce({ ok: true, data: { ...svar, dryRun: false, skrevet: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Ret kickoff' }));
    await waitFor(() => expect(mockRet).toHaveBeenLastCalledWith({
      gameId: 'hvm2027', matchId: 'r8-den-nor', tid: '18:00', aftryk: 'k-1', dryRun: false,
    }));
    expect(confirm.mock.calls[0][0]).toContain('ons 20/1 kl. 20.30 → ons 20/1 kl. 18.00 (dansk tid). Tip-låsen flytter med.');
    expect(await screen.findByText('Kickoff rettet: Danmark – Norge spilles ons 20/1 kl. 18.00.')).toBeInTheDocument();
    confirm.mockRestore();
  });
});

// QC B2: en runde over flere datoer får INGEN forudfyldt dato — en 27/1-kamp
// tastet som 26/1 lukkede for tips et døgn for tidligt. Og Ret kickoff kan
// flytte en kamp mellem rundens egne datoer.
describe('en runde over to datoer (kvartfinalerne 26/1 + 27/1)', () => {
  const KV_STATUS = {
    ...STATUS,
    aabneDage: [{ runde: 14, etiket: 'Kvartfinaler (tir 26/1–ons 27/1)', dato: '2027-01-26', har: 0, forventet: 4 }],
  };

  it('forudfyldDato: tom for en dato i runden over to datoer — uændret ellers', () => {
    expect(forudfyldDato(HVM_EN, '2027-01-26')).toBe('');
    expect(forudfyldDato(HVM_EN, '2027-01-27')).toBe('');
    expect(forudfyldDato(HVM_EN, '2027-01-29')).toBe('2027-01-29');
    expect(forudfyldDato(HVM_EN, '2027-01-20')).toBe('2027-01-20');
    // Produktionens kalender HAR nu kvartfinalerne som én runde over to datoer
    // (før forudfyldtes 26/1 her) — og en kvartfinale over FLERE runder
    // (TEST_FASER: én runde pr. dato) forudfyldes stadig.
    expect(forudfyldDato(HVM, '2027-01-26')).toBe('');
    expect(forudfyldDato(HVM, '2027-01-27')).toBe('');
    expect(forudfyldDato({ ...HVM, faser: TEST_FASER }, '2027-01-27')).toBe('2027-01-27');
    expect(forudfyldDato(HVM_EN, '')).toBe('');
    expect(rundensDatoListe(HVM_EN, 14)).toEqual(['2027-01-26', '2027-01-27']);
    expect(rundensDatoListe(HVM_EN, 8)).toEqual(['2027-01-20']);
    expect(rundensDatoListe({ id: 'sl' }, 8)).toEqual([]);
  });

  it('første række står UDEN dato, når serverens første åbne dag er kvartfinalerunden — og ＋ arver ikke en kvartfinaledato', async () => {
    mockOpret.mockResolvedValue({ ok: true, data: { ...PLAN, status: KV_STATUS, nye: [], advarsler: [] } });
    await aabn(HVM_EN);
    expect(screen.getByLabelText('Dato, kamp 1').value).toBe('');
    fireEvent.change(screen.getByLabelText('Dato, kamp 1'), { target: { value: '2027-01-27' } });
    fireEvent.click(screen.getByRole('button', { name: '＋ Tilføj kamp' }));
    expect(screen.getByLabelText('Dato, kamp 2').value).toBe('');
    // En semifinaledato (én dato) arves som før.
    fireEvent.change(screen.getByLabelText('Dato, kamp 2'), { target: { value: '2027-01-29' } });
    fireEvent.click(screen.getByRole('button', { name: '＋ Tilføj kamp' }));
    expect(screen.getByLabelText('Dato, kamp 3').value).toBe('2027-01-29');
  });

  it('Ret kickoff: en kvartfinale får en datovælger med rundens to datoer, og den valgte dato sendes', async () => {
    // Test Manager (KAN): tiden fryses, så fixturet ikke skifter betydning,
    // når 26/1 2027 passerer.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-01-20T10:00:00Z'));
    const nu = Date.now();
    // Kampen står i dag på 26/1-datoen (dansk tid); tiden er i fremtiden.
    const kickoff = Date.parse('2027-01-26T19:30:00Z');
    const kampe = [
      { id: 'r14-fra-swe', round: 14, home: 'Frankrig', away: 'Sverige', kickoff: Math.max(kickoff, nu + 3600e3) },
      { id: 'r15-ger-den', round: 15, home: 'Tyskland', away: 'Danmark', kickoff: Math.max(Date.parse('2027-01-29T16:30:00Z'), nu + 7200e3) },
    ];
    mockGetDocs.mockResolvedValue({ docs: kampe.map(({ id, ...d }) => ({ id, data: () => d })) });
    await aabn(HVM_EN);
    fireEvent.click(screen.getByRole('button', { name: '🕒 Ret kickoff på en kamp' }));
    const select = await screen.findByLabelText('Kamp at rette kickoff på i Håndbold-VM 2027');
    // Semifinalen har én dato: ingen datovælger.
    fireEvent.change(select, { target: { value: 'r15-ger-den' } });
    expect(screen.queryByLabelText('Ny dato (inden for runden)')).toBeNull();
    fireEvent.change(select, { target: { value: 'r14-fra-swe' } });
    const datoValg = screen.getByLabelText('Ny dato (inden for runden)');
    expect(within(datoValg).getAllByRole('option').map((o) => o.value)).toEqual(['2027-01-26', '2027-01-27']);
    expect(within(datoValg).getAllByRole('option').map((o) => o.textContent)).toEqual(['tir 26/1', 'ons 27/1']);
    fireEvent.change(datoValg, { target: { value: '2027-01-27' } });
    fireEvent.change(screen.getByLabelText('Nyt kickoff (dansk tid)'), { target: { value: '18:00' } });
    mockRet.mockResolvedValueOnce({
      ok: true,
      data: {
        dryRun: true, skrevet: false, aftryk: 'k-2', advarsler: [],
        kamp: { id: 'r14-fra-swe', home: 'Frankrig', away: 'Sverige' },
        foer: { tid: 'tir 26/1 kl. 20.30' }, efter: { tid: 'ons 27/1 kl. 18.00' },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Vis rettelsen' }));
    expect(await screen.findByText(/tir 26\/1 kl\. 20\.30 →/)).toBeInTheDocument();
    expect(mockRet).toHaveBeenLastCalledWith({
      gameId: 'hvm2027', matchId: 'r14-fra-swe', tid: '18:00', dato: '2027-01-27', dryRun: true,
    });
    vi.useRealTimers();
  });
});

// Test Manager (kvart-tm): Ret kickoff i en runde over to datoer. Tre
// mutationer overlevede den grønne suite — skrive-kaldet sendte ikke datoen
// (serveren regner så et andet aftryk og afviser rettelsen), valget af en
// dato blev ikke nulstillet ved skift af kamp, og vælgerens standardværdi var
// ikke kampens EGEN dato. Tiden fryses (kun Date), så fixturet ikke skifter
// betydning, når 26/1 2027 passerer.
describe('🕒 Ret kickoff — runden over to datoer: skrive-kaldet og valget', () => {
  const KV = [
    // Frankrig–Sverige: tir 26/1 kl. 20.30 dansk tid (19.30 UTC).
    { id: 'r14-fra-swe', round: 14, home: 'Frankrig', away: 'Sverige', kickoff: Date.parse('2027-01-26T19:30:00Z') },
    // Danmark–Norge: tir 26/1 kl. 18.00.
    { id: 'r14-den-nor', round: 14, home: 'Danmark', away: 'Norge', kickoff: Date.parse('2027-01-26T17:00:00Z') },
    // Spanien–Kroatien: ons 27/1 kl. 18.00.
    { id: 'r14-esp-cro', round: 14, home: 'Spanien', away: 'Kroatien', kickoff: Date.parse('2027-01-27T17:00:00Z') },
  ];
  const svar = (matchId, home, away) => ({
    dryRun: true, skrevet: false, aftryk: 'k-3', advarsler: [],
    kamp: { id: matchId, home, away },
    foer: { tid: 'tir 26/1 kl. 20.30' }, efter: { tid: 'ons 27/1 kl. 18.00' },
  });

  async function aabnRet() {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-01-20T10:00:00Z'));
    mockGetDocs.mockResolvedValue({ docs: KV.map(({ id, ...d }) => ({ id, data: () => d })) });
    await aabn(HVM_EN);
    fireEvent.click(screen.getByRole('button', { name: '🕒 Ret kickoff på en kamp' }));
    return screen.findByLabelText('Kamp at rette kickoff på i Håndbold-VM 2027');
  }
  afterEach(() => { vi.useRealTimers(); });

  it('den valgte dato følger med i BÅDE tør-kørslen og skrive-kaldet — sammen med aftrykket', async () => {
    const select = await aabnRet();
    fireEvent.change(select, { target: { value: 'r14-fra-swe' } });
    fireEvent.change(screen.getByLabelText('Ny dato (inden for runden)'), { target: { value: '2027-01-27' } });
    fireEvent.change(screen.getByLabelText('Nyt kickoff (dansk tid)'), { target: { value: '18:00' } });
    mockRet.mockResolvedValueOnce({ ok: true, data: svar('r14-fra-swe', 'Frankrig', 'Sverige') });
    fireEvent.click(screen.getByRole('button', { name: 'Vis rettelsen' }));
    expect(await screen.findByText(/tir 26\/1 kl\. 20\.30 →/)).toBeInTheDocument();
    expect(mockRet).toHaveBeenLastCalledWith({
      gameId: 'hvm2027', matchId: 'r14-fra-swe', tid: '18:00', dato: '2027-01-27', dryRun: true,
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockRet.mockResolvedValueOnce({ ok: true, data: { ...svar('r14-fra-swe', 'Frankrig', 'Sverige'), dryRun: false, skrevet: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Ret kickoff' }));
    await waitFor(() => expect(mockRet).toHaveBeenLastCalledWith({
      gameId: 'hvm2027', matchId: 'r14-fra-swe', tid: '18:00', dato: '2027-01-27', aftryk: 'k-3', dryRun: false,
    }));
    confirm.mockRestore();
  });

  it('vælgeren står på kampens EGEN dato — og et skift af kamp nulstiller en tidligere valgt dato', async () => {
    const select = await aabnRet();
    // Onsdagskampen: vælgeren viser onsdag (ikke rundens første dato).
    fireEvent.change(select, { target: { value: 'r14-esp-cro' } });
    expect(screen.getByLabelText('Ny dato (inden for runden)').value).toBe('2027-01-27');
    // Tirsdagskampen: flyttes til onsdag i vælgeren …
    fireEvent.change(select, { target: { value: 'r14-fra-swe' } });
    fireEvent.change(screen.getByLabelText('Ny dato (inden for runden)'), { target: { value: '2027-01-27' } });
    // … men et skift til en anden tirsdagskamp må ikke tage onsdagen med.
    fireEvent.change(select, { target: { value: 'r14-den-nor' } });
    expect(screen.getByLabelText('Ny dato (inden for runden)').value).toBe('2027-01-26');
    fireEvent.change(screen.getByLabelText('Nyt kickoff (dansk tid)'), { target: { value: '17:30' } });
    mockRet.mockResolvedValueOnce({ ok: true, data: svar('r14-den-nor', 'Danmark', 'Norge') });
    fireEvent.click(screen.getByRole('button', { name: 'Vis rettelsen' }));
    await screen.findByText(/tir 26\/1 kl\. 20\.30 →/);
    // Ingen dato valgt for DENNE kamp → ingen dato sendt: serveren beholder kampens egen.
    const kald = mockRet.mock.calls.at(-1)[0];
    expect(kald).toEqual({
      gameId: 'hvm2027', matchId: 'r14-den-nor', tid: '17:30', dryRun: true,
    });
    expect(kald).not.toHaveProperty('dato');
  });
});
