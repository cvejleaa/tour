// ---------------------------------------------------------------------------
// DriftTab — statusfladen må ALDRIG lyve (TM-fund: klientlaget var utestet,
// ⚠-badget kunne fjernes med grøn suite):
//   - et forventet kort uden dokument er GRÅT ("afventer"), ikke et hul
//   - serverens naesteForventetFoer i fortiden = rødt "HAR IKKE KØRT"
//   - et status-dokument UDEN forventet kort vises alligevel (QC-fund:
//     divergens mellem klientens afledte liste og serverens SYNCED_GAMES)
//   - en læsefejl vises som fejl — aldrig som "ingen problemer"
//   - titlen flipper ikke til råt id efter første kørsel
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockDrift = vi.fn();
vi.mock('./useDriftStatus', async (orig) => ({
  ...(await orig()),
  useDriftStatus: () => mockDrift(),
}));
vi.mock('../games/useGames', () => ({
  useGames: () => ({
    games: [
      // type/status SKAL med i fixturen: reminder-kortets gate
      // (forventerPaamindelser) kræver football + open/live. Uden felterne
      // gav gaten 0 reminder-kort, og suiten stod grøn på en feature, der
      // ikke gjorde noget (arkitektens fælde-advarsel på planen).
      { id: 'sl', name: 'Superligaen', type: 'football', status: 'open', sync: { provider: 'superliga' } },
      { id: 'pl', name: 'Premier League', type: 'football', status: 'live', sync: { provider: 'pulselive' } },
      { id: 'tour', name: 'Touren', type: 'cycling', status: 'finished' }, // intet sync-felt → ingen kort
    ],
  }),
}));
vi.mock('../../firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => vi.fn() }));
// Postbudets to knapper går gennem adminActions — attrappen svarer det, en
// test sætter op, så fladen kan bevises på INDHOLDET af svaret.
const mockSendNu = vi.fn();
const mockTestAlarm = vi.fn();
vi.mock('./adminActions', () => ({
  callSendDriftAlarmMailNu: () => mockSendNu(),
  callFyrTestAlarm: () => mockTestAlarm(),
}));

import DriftTab, { forventedeKoersler, globaleKoersler } from './DriftTab';

const basis = { status: [], alarmer: [], loading: false, error: '' };

describe('forventedeKoersler — matrixen maskineri × spil', () => {
  const SL = { id: 'superliga2627', name: 'Superligaen', type: 'football', status: 'open', sync: { provider: 'superliga' } };
  const typer = (g) => forventedeKoersler([g]).map((k) => k.type);

  it('et spil med livescore-kortlægning får et Live-mål-kort — jobbet har intet søskende-job', () => {
    expect(typer(SL)).toEqual(['sweep', 'kickoff', 'livemaal', 'reminder']);
  });

  it('SAMME provider, andet spil-id: intet Live-mål-kort (gaten er evnen, ikke provideren)', () => {
    expect(typer({ ...SL, id: 'sl2728' })).toEqual(['sweep', 'kickoff', 'reminder']);
  });

  it('et spil uden synk får ingen kørsels-kort', () => {
    expect(typer({ id: 'tour', name: 'Touren', type: 'cycling', status: 'finished' })).toEqual([]);
  });

  it('tegner Live-mål-kortet med det danske navn og kørslens linje', () => {
    // useGames-attrappen ovenfor kender kun 'sl'/'pl' — så kortet bevises via
    // status-dokumentet (orphan-grenen), som fladen viser med TYPE_NAVN.
    mockDrift.mockReturnValue({
      ...basis,
      status: [{
        id: 'livemaal-superliga2627', type: 'livemaal', gameId: 'superliga2627', gameNavn: 'Superligaen',
        niveau: 'ok', besked: 'Live-mål: 1 kamp i gang, 1 liste skrevet.', koertAt: Date.now(), naesteForventetFoer: null,
      }],
    });
    render(<DriftTab />);
    expect(screen.getByText(/Live-mål \(kampe i gang\) · Superligaen/)).toBeInTheDocument();
    expect(screen.getByText(/1 liste skrevet/)).toBeInTheDocument();
    expect(screen.queryByText(/^livemaal/)).toBeNull();
  });
});

describe('DriftTab', () => {
  it('tegner GRÅT kort pr. forventet kørsel uden dokument — aldrig et hul i listen', () => {
    mockDrift.mockReturnValue(basis);
    render(<DriftTab />);
    // BÅDE SL og PL har kickoff-synk (begge providere har hentKickoffs), så:
    // SL: sweep + kickoff + reminder. PL: sweep + kickoff + reminder.
    // Touren (uden sync, cycling/finished): ingenting.
    // 4 → 6: SL og PL fik hver et påmindelses-kort (09-jobbet kunne før kun
    // fejle tavst — opgave #47). 6 → 7: alarm-postbudets globale kort
    // (vendt bevidst — et postbud, der aldrig har kørt, må ikke være usynligt).
    expect(screen.getAllByText('afventer første kørsel').length).toBe(7);
    // Præcist TO kickoff-kort — ét for hvert synket spil, ikke kun PL. Ét af
    // dem SKAL være Superligaens (titlen er "Daglig kickoff-synk · <navn>").
    expect(screen.getAllByText(/Daglig kickoff-synk/).length).toBe(2);
    expect(screen.getByText(/Daglig kickoff-synk · Superligaen/)).toBeInTheDocument();
    expect(screen.queryByText(/Touren/)).toBeNull();
  });

  // Matrixen maskineri × spil for påmindelses-kortet: præcis de spil, 09-
  // jobbet kører for, har et kort — med det DANSKE navn, aldrig den rå
  // 'reminder'-streng (den ville ellers stå der via orphan-grenen).
  it('påmindelses-kort for præcis de aktive fodbold-spil — på dansk', () => {
    mockDrift.mockReturnValue(basis);
    render(<DriftTab />);
    expect(screen.getAllByText(/Daglig tip-påmindelse/).length).toBe(2);
    expect(screen.getByText(/Daglig tip-påmindelse · Superligaen/)).toBeInTheDocument();
    expect(screen.getByText(/Daglig tip-påmindelse · Premier League/)).toBeInTheDocument();
    expect(screen.queryByText(/reminder/)).toBeNull();
    expect(screen.queryByText(/Touren/)).toBeNull();
  });

  // Afslutnings-status: når et spil sættes til finished, forsvinder dets
  // forventede kort, og serveren lukker dokumentet med naesteForventetFoer:
  // null. Et sådant dokument (vises via orphan-grenen) må ALDRIG stå som
  // "HAR IKKE KØRT til tiden" — det var den evigt-røde fælde fra planen.
  it('et lukket kort (naesteForventetFoer: null) står aldrig som "HAR IKKE KØRT"', () => {
    mockDrift.mockReturnValue({
      ...basis,
      status: [{
        id: 'reminder-gammel', type: 'reminder', gameId: 'gammel', gameNavn: 'Gammelt spil',
        niveau: 'ok', besked: 'Spillet er afsluttet — der sendes ikke flere påmindelser.',
        koertAt: 1, naesteForventetFoer: null,
      }],
    });
    render(<DriftTab />);
    expect(screen.getByText(/Spillet er afsluttet/)).toBeInTheDocument();
    expect(screen.queryByText('HAR IKKE KØRT til tiden')).toBeNull();
  });

  it('serverens naesteForventetFoer i fortiden gør kortet rødt "HAR IKKE KØRT til tiden"', () => {
    mockDrift.mockReturnValue({
      ...basis,
      status: [{ id: 'sweep-sl', type: 'sweep', gameId: 'sl', gameNavn: 'sl', niveau: 'ok', besked: 'Alt vel.', koertAt: 1, naesteForventetFoer: Date.now() - 60000 }],
    });
    render(<DriftTab />);
    expect(screen.getByText('HAR IKKE KØRT til tiden')).toBeInTheDocument();
  });

  it('et status-dokument UDEN forventet kort vises alligevel — et rødt dokument må ikke gemme sig i divergensen', () => {
    mockDrift.mockReturnValue({
      ...basis,
      status: [{ id: 'sweep-vaek', type: 'sweep', gameId: 'vaek', gameNavn: 'vaek', niveau: 'fejl', besked: 'Resultat-synken fejlede.', koertAt: 1, naesteForventetFoer: Date.now() + 3600000 }],
    });
    render(<DriftTab />);
    expect(screen.getByText(/Resultat-synken fejlede/)).toBeInTheDocument();
  });

  it('en læsefejl vises som fejl — aldrig som "ingen problemer"', () => {
    mockDrift.mockReturnValue({ ...basis, error: 'Kunne ikke hente driftstatus — det er i sig selv en driftfejl.' });
    render(<DriftTab />);
    expect(screen.getByText(/i sig selv en driftfejl/)).toBeInTheDocument();
    expect(screen.queryByText(/ingen åbne/)).toBeNull();
  });

  it('titlen bruger spillets NAVN — også når serverens dokument kun kender det rå id', () => {
    mockDrift.mockReturnValue({
      ...basis,
      status: [{ id: 'sweep-sl', type: 'sweep', gameId: 'sl', gameNavn: 'sl', niveau: 'ok', besked: 'Alt vel.', koertAt: 1, naesteForventetFoer: Date.now() + 3600000 }],
    });
    render(<DriftTab />);
    expect(screen.getAllByText(/Superligaen/).length).toBeGreaterThan(0);
  });

  it('kvittér-knappen findes kun på ukvitterede alarmer, der kræver kvittering', () => {
    mockDrift.mockReturnValue({
      ...basis,
      alarmer: [
        { id: 'a1', besked: 'Genåbning afvist.', kraeverKvittering: true, kvitteretAt: null, loestAt: null, antal: 1, foersteSetAt: 1, sidstSetAt: 1 },
        { id: 'a2', besked: 'Strandet kamp.', kraeverKvittering: false, kvitteretAt: null, loestAt: null, antal: 1, foersteSetAt: 1, sidstSetAt: 1 },
      ],
    });
    render(<DriftTab />);
    expect(screen.getAllByRole('button', { name: /Kvittér/ }).length).toBe(1);
  });
});

// ── Alarm-postbudet: kortet, knapperne og titlerne ──────────────────────────
describe('DriftTab — alarm-postbudet', () => {
  // Attrapperne deles af hele filen, og vitest nulstiller dem ikke selv: uden
  // dette afhang «kaldt 1 gang» / «ikke kaldt» af testenes rækkefølge og blev
  // rødt under --sequence.shuffle (3 af 3 seeds).
  beforeEach(() => {
    mockSendNu.mockReset();
    mockTestAlarm.mockReset();
  });

  it('postbudet er et GLOBALT kort («Platformen») med dansk navn — og forventedeKoersler(games) er uændret', () => {
    expect(globaleKoersler()).toEqual([{ type: 'postbud', gameId: null, gameNavn: 'Platformen' }]);
    mockDrift.mockReturnValue(basis);
    render(<DriftTab />);
    expect(screen.getByText(/Alarm-mail \(hvert 15\. min\) · Platformen/)).toBeInTheDocument();
    expect(screen.queryByText(/^postbud/)).toBeNull();
  });

  it('postbudets dokument (gameId null) lander på det globale kort — ét kort, ikke et ekstra orphan-kort', () => {
    mockDrift.mockReturnValue({
      ...basis,
      status: [{
        id: 'postbud', type: 'postbud', gameId: null, gameNavn: 'Platformen', niveau: 'ok',
        besked: 'Sendt til 2 modtagere (1 alarm).', koertAt: Date.now(), naesteForventetFoer: Date.now() + 1e6,
      }],
    });
    render(<DriftTab />);
    expect(screen.getAllByText(/Alarm-mail \(hvert 15\. min\)/).length).toBe(1);
    expect(screen.getByText('Sendt til 2 modtagere (1 alarm).')).toBeInTheDocument();
  });

  it('introen siger, at alarmer og fejlede kørsler MAILES inden for 15 min — pull blev push', () => {
    mockDrift.mockReturnValue(basis);
    render(<DriftTab />);
    expect(screen.getByText(/mailes til administratorerne inden for 15 min/)).toBeInTheDocument();
  });

  it('«Send alarm-mail nu» kalder postbudet og viser SERVERENS svar — ikke bare «ok»', async () => {
    mockSendNu.mockResolvedValue({ ok: true, data: { niveau: 'ok', besked: 'Sendt til 2 modtagere (3 alarmer).', sendt: 2 } });
    mockDrift.mockReturnValue(basis);
    render(<DriftTab />);
    fireEvent.click(screen.getByRole('button', { name: '📨 Send alarm-mail nu' }));
    expect(await screen.findByText('Sendt til 2 modtagere (3 alarmer).')).toBeInTheDocument();
    expect(mockSendNu).toHaveBeenCalledTimes(1);
    expect(mockTestAlarm).not.toHaveBeenCalled();
  });

  it('«Send en test-alarm» kalder fyrTestAlarm og siger, hvad der sker nu — og at kvitteringen lukker den', async () => {
    mockTestAlarm.mockResolvedValue({ ok: true, data: { ok: true } });
    mockDrift.mockReturnValue(basis);
    render(<DriftTab />);
    fireEvent.click(screen.getByRole('button', { name: '🧪 Send en test-alarm' }));
    const svar = await screen.findByText(/Test-alarmen er oprettet/);
    expect(svar.textContent).toMatch(/inden for 15 min/);
    expect(svar.textContent).toMatch(/Kvittér alarmen herunder bagefter; så forsvinder den\./);
    expect(mockTestAlarm).toHaveBeenCalledTimes(1);
  });

  it('serverens afvisning vises som fejl — et klik er aldrig tavst', async () => {
    mockTestAlarm.mockResolvedValue({ ok: false, error: 'Vent 10 minutter mellem test-alarmer.' });
    mockDrift.mockReturnValue(basis);
    render(<DriftTab />);
    fireEvent.click(screen.getByRole('button', { name: '🧪 Send en test-alarm' }));
    expect(await screen.findByText('Vent 10 minutter mellem test-alarmer.')).toBeInTheDocument();
    expect(screen.queryByText(/Test-alarmen er oprettet/)).toBeNull();
  });

  it('AlarmKort viser serverens titel — og typen, når et gammelt dokument mangler feltet', () => {
    mockDrift.mockReturnValue({
      ...basis,
      alarmer: [
        { id: 'a1', type: 'kickoff48t', titel: 'Kamp flyttet til under 48 timer', besked: 'k1 er flyttet.', kraeverKvittering: true, kvitteretAt: null, loestAt: null, antal: 1, foersteSetAt: 1, sidstSetAt: 1 },
        { id: 'a2', type: 'strandet', besked: 'Strandet kamp.', kraeverKvittering: false, kvitteretAt: null, loestAt: null, antal: 1, foersteSetAt: 1, sidstSetAt: 1 },
      ],
    });
    render(<DriftTab />);
    expect(screen.getByText('Kamp flyttet til under 48 timer')).toBeInTheDocument();
    expect(screen.getByText('strandet')).toBeInTheDocument();
  });

  // Tillæg efter mutationstest: tre klik-veje overlevede med alt grønt.
  it('«Send alarm-mail nu» uden besked i svaret falder tilbage på «Postbudet kørte.» — et klik er aldrig tavst', async () => {
    mockSendNu.mockResolvedValue({ ok: true, data: {} });
    mockDrift.mockReturnValue(basis);
    render(<DriftTab />);
    fireEvent.click(screen.getByRole('button', { name: '📨 Send alarm-mail nu' }));
    expect(await screen.findByText('Postbudet kørte.')).toBeInTheDocument();
  });

  it('serverens afvisning af «Send alarm-mail nu» vises som fejl-badge — og ikke som et svar', async () => {
    mockSendNu.mockResolvedValue({ ok: false, error: 'Kun owner/global admin har adgang.' });
    mockDrift.mockReturnValue(basis);
    render(<DriftTab />);
    fireEvent.click(screen.getByRole('button', { name: '📨 Send alarm-mail nu' }));
    expect(await screen.findByText('Kun owner/global admin har adgang.')).toHaveClass('badge--red');
    expect(screen.queryByText('Postbudet kørte.')).toBeNull();
  });

  it('begge knapper er låst, mens et kald er i gang — et dobbeltklik koster ikke to kald', async () => {
    let frigiv;
    mockSendNu.mockReturnValue(new Promise((resolve) => { frigiv = resolve; }));
    mockDrift.mockReturnValue(basis);
    render(<DriftTab />);
    fireEvent.click(screen.getByRole('button', { name: '📨 Send alarm-mail nu' }));
    expect(screen.getByRole('button', { name: '📨 Send alarm-mail nu' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '🧪 Send en test-alarm' })).toBeDisabled();
    frigiv({ ok: true, data: { besked: 'Færdig.' } });
    expect(await screen.findByText('Færdig.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '📨 Send alarm-mail nu' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '🧪 Send en test-alarm' })).toBeEnabled();
    expect(mockSendNu).toHaveBeenCalledTimes(1);
  });
});

describe('DriftTab — postbudets svar farves efter serverens niveau', () => {
  it('et «fejl»-svar (SMTP mangler) står som rødt badge — ikke som neutral tekst, der ligner succes', async () => {
    mockSendNu.mockResolvedValue({ ok: true, data: { niveau: 'fejl', besked: 'SMTP_PASSWORD mangler — 2 alarmer kunne ikke mailes.', sendt: 0 } });
    mockDrift.mockReturnValue(basis);
    render(<DriftTab />);
    fireEvent.click(screen.getByRole('button', { name: '📨 Send alarm-mail nu' }));
    const svar = await screen.findByText('SMTP_PASSWORD mangler — 2 alarmer kunne ikke mailes.');
    expect(svar.className).toMatch(/badge--red/);
  });

  it('et «ok»-svar står som almindelig tekst', async () => {
    mockSendNu.mockResolvedValue({ ok: true, data: { niveau: 'ok', besked: 'Sendt til 1 modtager (1 alarm).', sendt: 1 } });
    mockDrift.mockReturnValue(basis);
    render(<DriftTab />);
    fireEvent.click(screen.getByRole('button', { name: '📨 Send alarm-mail nu' }));
    const svar = await screen.findByText('Sendt til 1 modtager (1 alarm).');
    expect(svar.className).not.toMatch(/badge--red/);
  });
});
