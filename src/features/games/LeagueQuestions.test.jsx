// ---------------------------------------------------------------------------
// LeagueQuestions — svartypen 'team' ("Hold"): svar og facit vælges blandt
// SPILLETS hold i stedet for fritekst.
//
// De tre fælder, testene her holder lukket:
//   1. Gaten skal tjekke RÅ game.teams — teamsOf falder tilbage på
//      Superligaens holdliste, så et spil uden hold ville få 12 danske
//      klubber i dropdown'en.
//   2. Visningsnavnet skal læses ALLE steder, svaret vises (dropdown-label,
//      "Dit svar", svar-badges, facit) — jf. visningsnavnFlader.test.jsx, og
//      med et navn der FAKTISK ændrer sig, ellers består testen også når
//      `vis` er tabt.
//   3. Værdien, der gemmes, er det KANONISKE navn — det er join-nøglen.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

const mockSaveAnswer = vi.fn().mockResolvedValue({ ok: true });
const mockLqStatus = vi.fn();
const mockBotRecap = vi.fn();
const mockUpdateQ = vi.fn().mockResolvedValue({ ok: true, deadlineSat: false });
const mockPostVaeg = vi.fn().mockResolvedValue({ ok: true });
vi.mock('./gameLeagueActions', () => ({
  createLeagueQuestion: vi.fn().mockResolvedValue({ ok: true }),
  setLeagueQuestionFacit: vi.fn().mockResolvedValue({ ok: true }),
  deleteLeagueQuestion: vi.fn().mockResolvedValue({ ok: true }),
  saveLeagueQuestionAnswer: (...a) => mockSaveAnswer(...a),
  callLeagueQuestionStatus: (...a) => mockLqStatus(...a),
  callLeagueQuestionRecapNow: (...a) => mockBotRecap(...a),
  updateLeagueQuestion: (...a) => mockUpdateQ(...a),
  postLeagueMessage: (...a) => mockPostVaeg(...a),
  LEAGUE_Q_LABEL_MAX: 120,
}));

import LeagueQuestions from './LeagueQuestions';

// teamStyles-visningsnavnet ("Wolverhampton…" → "Wolves") rammer den gren,
// hvor vis ≠ name — en assertion på et hold med vis === name beviser intet.
const PL_GAME = {
  id: 'pl',
  teams: [
    { name: 'Arsenal', short: 'ARS' },
    { name: 'Wolverhampton Wanderers', short: 'WOL' },
  ],
  teamStyles: { 'Wolverhampton Wanderers': { visningsnavn: 'Wolves' } },
};
const CYKELSPIL = { id: 'tour' }; // ingen teams — og må ALDRIG arve Superligaens
// TOM liste er den anden halvdel af fælden: et useedet spil HAR teams-nøglen,
// og netop dér falder teamsOf tilbage på Superligaens 12 klubber.
const USEEDET = { id: 'nyt', teams: [] };

const BASE = {
  gameId: 'pl', leagueId: 'L1', meUid: 'me', byUid: { me: { name: 'Mig' }, andet: { name: 'Anden' } },
};

function renderQ({ game = PL_GAME, isOwner = false, questions = [], answersByQid = {} }) {
  return render(
    <LeagueQuestions {...BASE} game={game} isOwner={isOwner} questions={questions} answersByQid={answersByQid} />,
  );
}

const teamQ = (over = {}) => ({ id: 'q1', label: 'Hvem vinder ligaen?', type: 'team', points: 10, deadline: null, ...over });

describe('LeagueQuestions — typen "Hold" i opret-formularen', () => {
  it('tilbydes i et spil MED hold', () => {
    renderQ({ isOwner: true });
    fireEvent.click(screen.getByText('+ Nyt spørgsmål'));
    expect(screen.getByRole('option', { name: 'Hold (vælg fra listen)' })).toBeInTheDocument();
  });

  it('tilbydes IKKE i et spil uden hold — og arver aldrig Superligaens liste', () => {
    for (const game of [CYKELSPIL, USEEDET]) {
      const { unmount } = renderQ({ game, isOwner: true });
      fireEvent.click(screen.getByText('+ Nyt spørgsmål'));
      expect(screen.queryByRole('option', { name: 'Hold (vælg fra listen)' })).toBeNull();
      // Fallback-fælden: ingen dansk klub må sive ind fra teamsOf's default.
      expect(screen.queryByRole('option', { name: /Brøndby|København/ })).toBeNull();
      unmount();
    }
  });
});

describe('LeagueQuestions — svar på et hold-spørgsmål', () => {
  it('svaret vælges i en dropdown: visningsnavn som label, kanonisk navn som værdi', () => {
    renderQ({ questions: [teamQ()] });
    // Badge-etiketten skal sige typens navn — '10 point · Tekst' på et
    // hold-spørgsmål ville være ||-fallbacken, der lyver.
    expect(screen.getByText('10 point · Hold')).toBeInTheDocument();
    const select = screen.getByLabelText('Dit svar');
    const labels = [...select.querySelectorAll('option')].map((o) => o.textContent);
    expect(labels).toContain('Wolves'); // teamStyles-visningsnavnet, IKKE det lange
    expect(labels).not.toContain('Wolverhampton Wanderers');
    fireEvent.change(select, { target: { value: 'Wolverhampton Wanderers' } });
    fireEvent.click(screen.getByRole('button', { name: 'Svar' }));
    // Gemt værdi er den KANONISKE — join-nøglen i hele appen.
    expect(mockSaveAnswer).toHaveBeenCalledWith(expect.objectContaining({ answer: 'Wolverhampton Wanderers' }));
  });

  it('gemte svar og facit VISES med visningsnavn — aldrig det rå kanoniske', () => {
    renderQ({
      questions: [teamQ({ deadline: 1, facit: 'Wolverhampton Wanderers' })], // deadline for længst passeret
      answersByQid: { q1: [{ uid: 'andet', answer: 'Wolverhampton Wanderers' }] },
    });
    // Badge + facit-linjen: "Wolves", og det lange navn optræder INGEN steder.
    expect(screen.getByText(/Anden: Wolves/)).toBeInTheDocument();
    expect(screen.getByText('Wolves', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.queryByText(/Wolverhampton Wanderers/)).toBeNull();
  });

  it('falder tilbage til tekst-input, hvis holdlisten er væk — aldrig en tom dropdown', () => {
    renderQ({ game: CYKELSPIL, questions: [teamQ()] });
    expect(screen.getByPlaceholderText('Dit svar')).toBeInTheDocument();
    expect(screen.queryByLabelText('Dit svar')).toBeNull(); // ingen select
  });

  it('EGET gemte svar vises med visningsnavn i den åbne periode', () => {
    // "Dit svar: …"-linjen er sit eget visningssted — mutationen "vis rå
    // værdi netop dér" overlevede, fordi kun badges og facit var dækket.
    renderQ({
      questions: [teamQ()],
      answersByQid: { q1: [{ uid: 'me', answer: 'Wolverhampton Wanderers' }] },
    });
    expect(screen.getByText(/Dit svar: Wolves/)).toBeInTheDocument();
    expect(screen.queryByText(/Dit svar: Wolverhampton/)).toBeNull();
  });
});

describe('LeagueQuestions — ejerens facit på et hold-spørgsmål', () => {
  it('facit vælges i samme dropdown, og "Også godkendt" vises ikke', () => {
    renderQ({ isOwner: true, questions: [teamQ()] });
    const facit = screen.getByLabelText('Facit');
    expect(facit.tagName).toBe('SELECT');
    expect([...facit.querySelectorAll('option')].map((o) => o.textContent)).toContain('Wolves');
    // acceptedAnswers er fritekstens sikkerhedsnet — overflødigt og
    // forvirrende, når svaret ikke kan staves forkert.
    expect(screen.queryByPlaceholderText('Også godkendt (komma-adskilt)')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Hvem mangler at svare? (opgave #38) — den ærlige tæller og dæknings-knappen.
// Båndet er dét, der IKKE må stå: "1 svar" på et åbent spørgsmål var løgnen
// (klienten kan kun læse sit eget svar før lukning).
// ---------------------------------------------------------------------------
import { waitFor } from '@testing-library/react';

describe('LeagueQuestions — ærlig tæller på åbne spørgsmål', () => {
  it('åbent + eget svar: "Du har svaret ✓" — og ALDRIG "1 svar"', () => {
    renderQ({
      questions: [teamQ({ deadline: Date.now() + 86400000 })],
      answersByQid: { q1: [{ uid: 'me', questionId: 'q1', answer: 'Arsenal' }] },
    });
    expect(screen.getByText(/Du har svaret ✓/)).toBeInTheDocument();
    expect(screen.getByText(/svarene vises ved deadline/)).toBeInTheDocument();
    expect(screen.queryByText(/1 svar/)).toBeNull();
  });

  it('åbent uden eget svar: "Du mangler at svare" — uden deadline vises facit-varianten', () => {
    renderQ({ questions: [teamQ()], answersByQid: {} });
    expect(screen.getByText(/Du mangler at svare/)).toBeInTheDocument();
    expect(screen.getByText(/svarene vises når facit sættes/)).toBeInTheDocument();
  });

  it('lukket spørgsmål: tallet er sandt igen og vises som før', () => {
    renderQ({
      questions: [teamQ({ facit: 'Arsenal' })],
      answersByQid: { q1: [{ uid: 'me', answer: 'Arsenal' }, { uid: 'andet', answer: 'Wolves' }] },
    });
    expect(screen.getByText(/2 svar/)).toBeInTheDocument();
  });
});

describe('LeagueQuestions — Hvem mangler at svare?', () => {
  it('knappen kalder serveren og viser dækningen i rækken — med "dig" for en selv', async () => {
    mockLqStatus.mockResolvedValue({
      ok: true,
      data: {
        spoergsmaal: [{
          id: 'q1', label: 'Hvem vinder ligaen?', deadline: null, besvaret: 1, ialt: 3,
          mangler: [{ uid: 'me', navn: 'Mig' }, { uid: 'andet', navn: 'Anden' }],
        }],
      },
    });
    renderQ({ questions: [teamQ()], answersByQid: {} });
    fireEvent.click(screen.getByTestId('lq-hvem-mangler'));
    await waitFor(() => expect(mockLqStatus).toHaveBeenCalledWith('pl', 'L1'));
    const status = await screen.findByTestId('lq-status-q1');
    expect(status.textContent).toContain('1 af 3');
    expect(status.textContent).toContain('mangler: dig, Anden');
    expect(screen.getByText(/Viser kun spørgsmål, der stadig kan besvares/)).toBeInTheDocument();
  });

  it('fejl fra serveren vises — og knappen findes IKKE uden spørgsmål', async () => {
    mockLqStatus.mockResolvedValue({ ok: false, error: 'Kun ligaens medlemmer kan se svar-status.' });
    renderQ({ questions: [teamQ()], answersByQid: {} });
    fireEvent.click(screen.getByTestId('lq-hvem-mangler'));
    expect(await screen.findByText(/Kun ligaens medlemmer/)).toBeInTheDocument();
    renderQ({ questions: [], answersByQid: {} });
    expect(screen.queryAllByTestId('lq-hvem-mangler')).toHaveLength(1); // kun fra første render
  });
});

// ---------------------------------------------------------------------------
// Runde-Bottens afsløring (#39): ejerens bevidste start, når trigger-opslaget
// mangler. Botten poster normalt selv — sektionen må derfor kun invitere til
// handling, når markøren botFacitAt mangler.
// ---------------------------------------------------------------------------
describe('LeagueQuestions — Runde-Bottens afsløring (ejer)', () => {
  const afgjort = (over = {}) => teamQ({ facit: 'Arsenal', ...over });

  it('ejer ser Forhåndsvis/Post når opslaget mangler — teksten vises, og Post poster', async () => {
    mockBotRecap.mockResolvedValueOnce({ ok: true, data: { posted: 0, dryRun: true, text: 'Udkastet 🤖' } })
      .mockResolvedValueOnce({ ok: true, data: { posted: 1 } });
    renderQ({ isOwner: true, questions: [afgjort()], answersByQid: { q1: [{ uid: 'me', answer: 'Arsenal' }] } });
    const sektion = screen.getByTestId('lq-bot-q1');
    expect(sektion.textContent).toContain('ikke postet');

    fireEvent.click(screen.getByText('Forhåndsvis'));
    await waitFor(() => expect(mockBotRecap).toHaveBeenCalledWith('pl', 'L1', 'q1', { dryRun: true, tvingNy: false }));
    const udkast = await screen.findByTestId('lq-bot-udkast-q1');
    expect(udkast.textContent).toContain('Udkastet 🤖');

    // Post fra udkastet — dryRun: false.
    fireEvent.click(within(udkast).getByText('Post på væggen'));
    await waitFor(() => expect(mockBotRecap).toHaveBeenLastCalledWith('pl', 'L1', 'q1', { dryRun: false, tvingNy: false }));
    expect(await screen.findByText(/Afsløringen er postet på væggen/)).toBeInTheDocument();
  });

  it('markør sat: "postet ✓" og INGEN post-knapper — "post igen" kræver bekræftelse (tvingNy)', async () => {
    mockBotRecap.mockResolvedValue({ ok: true, data: { posted: 1 } });
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    renderQ({ isOwner: true, questions: [afgjort({ botFacitAt: { seconds: 1 } })], answersByQid: {} });
    const sektion = screen.getByTestId('lq-bot-q1');
    expect(sektion.textContent).toContain('postet på væggen ✓');
    expect(screen.queryByText('Forhåndsvis')).toBeNull();
    fireEvent.click(screen.getByText('post igen'));
    await waitFor(() => expect(mockBotRecap).toHaveBeenCalledWith('pl', 'L1', 'q1', { dryRun: false, tvingNy: true }));
  });

  it('bottens nej-grund oversættes til dansk — og sektionen findes hverken for medlemmer eller på åbne spørgsmål', async () => {
    mockBotRecap.mockResolvedValue({ ok: true, data: { posted: 0, reason: 'too-few-answers' } });
    renderQ({ isOwner: true, questions: [afgjort()], answersByQid: {} });
    fireEvent.click(screen.getByText('Post på væggen'));
    expect(await screen.findByText(/mindst 2 svar/)).toBeInTheDocument();

    const medlem = renderQ({ isOwner: false, questions: [afgjort({ id: 'q9' })], answersByQid: {} });
    expect(screen.queryByTestId('lq-bot-q9')).toBeNull();
    medlem.unmount();
    renderQ({ isOwner: true, questions: [teamQ({ id: 'q8' })], answersByQid: {} }); // åbent — intet facit
    expect(screen.queryByTestId('lq-bot-q8')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ✏️ redigering (#40): fladen FØLGER regel-grænserne — points kun før lukning,
// deadline kun sæt/udskyd — og siger dem, i stedet for at opdage dem ved fejl.
// ---------------------------------------------------------------------------
describe('LeagueQuestions — ✏️ ret spørgsmålet (ejer)', () => {
  const aabn = (q) => {
    renderQ({ isOwner: true, questions: [q], answersByQid: {} });
    fireEvent.click(screen.getByTitle('Ret spørgsmålet (tekst, point, deadline)'));
    return screen.getByTestId(`lq-ret-${q.id}`);
  };

  it('åbent spørgsmål uden deadline: tekst + point + "Sæt deadline" med fremtids-forklaring', async () => {
    const form = aabn(teamQ());
    expect(within(form).getByLabelText('Point')).toBeInTheDocument();
    expect(within(form).getByText('Sæt deadline')).toBeInTheDocument();
    expect(form.textContent).toContain('svarene vises for alle, når den passerer');
    fireEvent.change(within(form).getByLabelText('Spørgsmålets tekst'), { target: { value: 'Ny tekst her' } });
    fireEvent.click(within(form).getByText('Gem rettelse'));
    await waitFor(() => expect(mockUpdateQ).toHaveBeenCalled());
    expect(mockUpdateQ.mock.calls[0][0]).toMatchObject({ label: 'Ny tekst her', questionId: 'q1' });
  });

  it('kommende deadline: "Udskyd deadline" — og forklaringen siger aldrig-frem-aldrig-væk', () => {
    const form = aabn(teamQ({ deadline: Date.now() + 86400000 }));
    expect(within(form).getByText('Udskyd deadline')).toBeInTheDocument();
    expect(form.textContent).toContain('kun udskydes');
    expect(form.textContent).toContain('aldrig rykkes frem eller fjernes');
    // min-attributten er sat — i LOKAL tid (QC-fund: toISOString rammer forkert)
    expect(within(form).getByLabelText('Deadline').getAttribute('min')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('passeret deadline: HVERKEN point- eller deadline-felt — kun tekst, med forklaring', () => {
    const form = aabn(teamQ({ deadline: 1 }));
    expect(within(form).queryByLabelText('Point')).toBeNull();
    expect(within(form).queryByLabelText('Deadline')).toBeNull();
    expect(form.textContent).toContain('Deadline er passeret og kan ikke ændres');
  });

  it('afgjort spørgsmål: kun tekst — "Facit er sat"-forklaring, ingen point-rettelse', () => {
    const form = aabn(teamQ({ facit: 'Arsenal' }));
    expect(within(form).queryByLabelText('Point')).toBeNull();
    expect(form.textContent).toContain('Facit er sat — kun teksten kan rettes');
  });

  it('ny deadline tilbyder "📣 Fortæl det på væggen" — væggen notificerer ellers ingen', async () => {
    mockUpdateQ.mockResolvedValueOnce({ ok: true, deadlineSat: true });
    const form = aabn(teamQ());
    fireEvent.change(within(form).getByLabelText('Deadline'), { target: { value: '2030-01-01T18:00' } });
    fireEvent.click(within(form).getByText('Gem rettelse'));
    const vaegKnap = await screen.findByTestId('lq-vaeg-q1');
    fireEvent.click(vaegKnap);
    await waitFor(() => expect(mockPostVaeg).toHaveBeenCalled());
    const { text } = mockPostVaeg.mock.calls[0][0];
    expect(text).toContain('Deadline på');
    expect(text).toContain('husk at svare');
  });

  it('ikke-ejer har ingen ✏️', () => {
    renderQ({ isOwner: false, questions: [teamQ()], answersByQid: {} });
    expect(screen.queryByTitle('Ret spørgsmålet (tekst, point, deadline)')).toBeNull();
  });
});
