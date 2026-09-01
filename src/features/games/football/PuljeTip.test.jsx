// Pulje-vælgeren skal vise SPILLETS hold.
//
// Den var det eneste sted i fodbold-fladen, der ikke allerede faldt tilbage på
// `game.teams` — den importerede den danske holdliste direkte. På et engelsk
// spil ville vælgeren derfor have vist tolv danske klubber, og et tip ville
// have været umuligt at afgive rigtigt.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../../../firebase', () => ({ db: {} }));

// Firestore-lytteren: styrbar pr. test — mockBet.current er spillerens
// gemte pulje-tip (null = intet tip endnu).
const mockBet = { current: null };
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  onSnapshot: (_ref, cb) => {
    cb({ exists: () => mockBet.current != null, data: () => mockBet.current });
    return () => {};
  },
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'A' } }),
}));

const mockSetPuljeBet = vi.fn().mockResolvedValue({ ok: true });
vi.mock('../gameActions', () => ({ setPuljeBet: (...a) => mockSetPuljeBet(...a) }));

// Fixtures har game.pulje med: komponenten er konfigurations-gated (#8) og
// renderer intet uden pulje — fanen er alligevel data-gated på samme felt.
import PuljeTip, { topTitel, sektionsNavn } from './PuljeTip';
import { PREMIER_LEAGUE_TEAMS_2026 } from '../../../data/premierLeagueTeams2026';
import { SUPERLIGA_TEAMS_2026 } from '../../../data/superligaTeams2026';

beforeEach(() => { vi.clearAllMocks(); mockBet.current = null; });

describe('PuljeTip — holdene kommer fra spillet', () => {
  it('viser de engelske hold på et Premier League-spil', () => {
    render(<PuljeTip game={{ id: 'pl', teams: PREMIER_LEAGUE_TEAMS_2026, pulje: { poolSize: 4, nedSize: 3, facitKilde: 'egneKampe', tabelDeling: false } }} matches={[]} />);
    // PL-konfigurationen har BÅDE top- og bund-sektion, så hvert hold står
    // i to grids — deraf getAllByText (2 = én pr. sektion).
    expect(screen.getAllByText('Arsenal')).toHaveLength(2);
    expect(screen.getAllByText('Manchester City')).toHaveLength(2);
    // …og ingen danske. Dét var fejlen.
    expect(screen.queryByText('Brøndby IF')).not.toBeInTheDocument();
    expect(screen.queryByText('F.C. København')).not.toBeInTheDocument();
  });

  it('viser de danske hold på Superligaen', () => {
    render(<PuljeTip game={{ id: 'sl', teams: SUPERLIGA_TEAMS_2026, pulje: { poolSize: 6 } }} matches={[]} />);
    expect(screen.getByText('Brøndby IF')).toBeInTheDocument();
    expect(screen.queryByText('Arsenal')).not.toBeInTheDocument();
  });

  // Fallbacken må ikke vinde over spillets egne hold — den er kun til et spil,
  // der endnu ikke er seedet.
  it('falder tilbage på Superligaen for et spil uden hold', () => {
    render(<PuljeTip game={{ id: 'nyt', pulje: { poolSize: 6 } }} matches={[]} />);
    expect(screen.getByText('Brøndby IF')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// #8: konfigurationsdrevet pulje — to sektioner, ærlig deadline-tekst, delt
// facit-kilde og "lige nu"-puls. Små egne hold, så tabellen er forudsigelig.
// ---------------------------------------------------------------------------
const HOLD8 = Array.from({ length: 8 }, (_, i) => ({ name: `H${i + 1}`, short: `H${i + 1}` }));
const PL_KONFIG = {
  poolSize: 4, nedSize: 3, perTeam: 4, perfectBonus: 10, facitKilde: 'egneKampe', tabelDeling: false,
  labels: { overskrift: '🎄 Juletabellen', top: 'top 4 juleaften', ned: 'nedrykningszonen', facit: 'stillingen, når alle 18 runder er spillet' },
};
// 4 spillede kampe → 8 hold i tabellen: H1,H3,H5,H7 vandt.
const SPILLEDE = [
  { home: 'H1', away: 'H2', homeGoals: 2, awayGoals: 0 },
  { home: 'H3', away: 'H4', homeGoals: 1, awayGoals: 0 },
  { home: 'H5', away: 'H6', homeGoals: 3, awayGoals: 1 },
  { home: 'H7', away: 'H8', homeGoals: 1, awayGoals: 0 },
];
const plGame = (over = {}) => ({
  id: 'pl', teams: HOLD8, pulje: PL_KONFIG, puljeLockAt: Date.now() + 86400000, ...over,
});

describe('PuljeTip — PL-formen (top + bund)', () => {
  it('UDEN deadline: ærlig "ikke åbnet"-tekst, ingen Gem-knap, knapper slået fra', () => {
    render(<PuljeTip game={plGame({ puljeLockAt: undefined })} matches={[]} />);
    // Den gamle tekst "🟢 Åbent — deadline fastsættes af admin" inviterede til
    // en gemme-knap, rules garanteret afviste (QC-fund). Assertér på begge.
    expect(screen.getByText(/Endnu ikke åbnet — arrangøren har ikke sat en deadline/)).toBeInTheDocument();
    expect(screen.queryByText(/Åbent/)).toBeNull();
    expect(screen.queryByText('Gem pulje-tip')).toBeNull();
    expect(screen.getAllByText('H1')[0].closest('button')).toBeDisabled();
  });

  it('to sektioner med hver sit antal — Gem er låst, til BEGGE er fulde, og gemmer samlet', async () => {
    render(<PuljeTip game={plGame()} matches={[]} />);
    expect(screen.getByText(/Toppen — vælg 4/)).toBeInTheDocument();
    expect(screen.getByText(/Bunden — vælg 3/)).toBeInTheDocument();
    // Overskriften og reglen kommer fra konfigurationen — ikke hårdkodet SL.
    expect(screen.getByText('🎄 Juletabellen')).toBeInTheDocument();
    expect(screen.queryByText(/mesterskabsspillet/)).toBeNull();

    const knap = () => screen.getByText('Gem pulje-tip').closest('button');
    // getAllByText(navn): [0] = top-griddet, [1] = bund-griddet.
    for (const navn of ['H1', 'H2', 'H3', 'H4']) fireEvent.click(screen.getAllByText(navn)[0]);
    expect(knap()).toBeDisabled(); // halvt svar må ikke kunne gemmes (QC-fund)
    expect(screen.getByText(/begge dele gemmes samlet/)).toBeInTheDocument();
    for (const navn of ['H6', 'H7', 'H8']) fireEvent.click(screen.getAllByText(navn)[1]);
    expect(knap()).not.toBeDisabled();
    fireEvent.click(knap());
    await waitFor(() => expect(mockSetPuljeBet).toHaveBeenCalled());
    const [uid, gameId, picks, opts] = mockSetPuljeBet.mock.calls[0];
    expect(uid).toBe('A');
    expect(gameId).toBe('pl');
    expect(picks).toEqual(['H1', 'H2', 'H3', 'H4']);
    expect(opts.relegation).toEqual(['H6', 'H7', 'H8']);
    expect(opts.konfig.poolSize).toBe(4);
  });

  it('et hold kan ikke vælges i BÅDE toppen og bunden (rules-spejl)', () => {
    render(<PuljeTip game={plGame()} matches={[]} />);
    fireEvent.click(screen.getAllByText('H1')[0]); // toppen
    fireEvent.click(screen.getAllByText('H1')[1]); // bunden — skal ignoreres
    expect(screen.getByText('1/4 valgt')).toBeInTheDocument();
    expect(screen.getByText('0/3 valgt')).toBeInTheDocument();
  });

  it('facit-kortet SPLITTER de to spørgsmål — bonus-summen har en forklaring', () => {
    mockBet.current = {
      championship: ['H1', 'H3', 'H5', 'H7'], relegation: ['H2', 'H4', 'H8'],
      correct: 2, points: 8, nedCorrect: 1, nedPoints: 4,
    };
    // Alle kampe spillet → egneKampe-facit findes (klienten regnede før med
    // en 12-holds-antagelse og viste ALDRIG kortet for PL — QC-fund).
    render(<PuljeTip game={plGame()} matches={SPILLEDE} />);
    expect(screen.getByText('Facit: top 4 juleaften')).toBeInTheDocument();
    expect(screen.getByText('Facit: nedrykningszonen')).toBeInTheDocument();
    expect(screen.getByText(/2\/4 rigtige/)).toBeInTheDocument();
    expect(screen.getByText(/1\/3 rigtige/)).toBeInTheDocument();
  });

  it('"lige nu"-linjen viser pulsen midt i sæsonen — og siger, at intet er afgjort', () => {
    mockBet.current = { championship: ['H1', 'H3', 'H5', 'H7'], relegation: ['H2', 'H4', 'H8'] };
    const medUspillet = [...SPILLEDE, { home: 'H1', away: 'H3', homeGoals: null, awayGoals: null }];
    render(<PuljeTip game={plGame()} matches={medUspillet} />);
    const linje = screen.getByTestId('pulje-ligenu');
    expect(linje.textContent).toContain('Lige nu');
    expect(linje.textContent).toContain('hvis tabellen sluttede i dag');
    expect(linje.textContent).toContain('Intet er afgjort endnu');
    // Vinderne af de 4 kampe er toppen lige nu → 4 af 4; bunden: 2 af 3.
    expect(linje.textContent).toContain('4 af 4');
  });

  it('SL-formen: ét grid, 6 valg, ingen bund-sektion — men EN overskrift', () => {
    render(<PuljeTip game={{ id: 'sl', teams: HOLD8, pulje: { poolSize: 6 }, puljeLockAt: Date.now() + 86400000 }} matches={[]} />);
    expect(screen.queryByText(/Bunden — vælg/)).toBeNull();
    expect(screen.getByText('0/6 valgt')).toBeInTheDocument();
    expect(screen.getByText(/mesterskabsspillet/)).toBeInTheDocument();
    // Overskriften manglede HELT for spil uden bundsektion — antallet stod kun
    // i brødteksten, mens PL sagde det direkte over gitteret.
    expect(screen.getByRole('heading', { name: '🏆 Mesterskabsspillet — vælg 6' })).toBeInTheDocument();
    // Og den må ikke hedde "Toppen": der er ingen bund at være top FOR.
    expect(screen.queryByText(/Toppen — vælg/)).toBeNull();
  });
});

describe('PuljeTip — "lige nu" har brug for nok spillede kampe', () => {
  it('tidligt i sæsonen (færre hold i tabellen end top+bund) vises INGEN "lige nu"-linje', () => {
    // TM-fund: tilstrækkeligheds-vagten (leagueTable(spillede).length <
    // poolSize+nedSize) var udækket. VIGTIGT at der er USPILLEDE kampe med,
    // ellers er "alle spillet" sandt → seasonDone → facit-kortet vises i
    // stedet, og "lige nu" testes aldrig. Her: 1 spillet (2 hold i tabellen)
    // + 1 uspillet → seasonDone=false, men kun 2 < 7 hold → vagten skal
    // undertrykke linjen (mutant uden vagt ville vise "på tomt grundlag").
    mockBet.current = { championship: ['H1', 'H2', 'H3', 'H4'], relegation: ['H6', 'H7', 'H8'] };
    render(<PuljeTip game={plGame()} matches={[
      { home: 'H1', away: 'H2', homeGoals: 1, awayGoals: 0 },
      { home: 'H3', away: 'H4', homeGoals: null, awayGoals: null }, // uspillet
    ]} />);
    expect(screen.queryByTestId('pulje-ligenu')).toBeNull();
  });
});

describe('sektionsNavn + topTitel — overskriften over holdgitteret', () => {
  it('spil MED bund: "toppen", fordi der er en bund at være top for', () => {
    const k = { poolSize: 4, nedSize: 3, labels: { top: 'top 4 juleaften' } };
    expect(sektionsNavn(k)).toBe('toppen');
    expect(topTitel(k)).toBe('🏆 Toppen — vælg 4');
  });

  it('spil UDEN bund: spillets eget ord, med stort begyndelsesbogstav', () => {
    const k = { poolSize: 6, nedSize: 0, labels: { top: 'mesterskabsspillet' } };
    expect(sektionsNavn(k)).toBe('mesterskabsspillet');
    expect(topTitel(k)).toBe('🏆 Mesterskabsspillet — vælg 6');
  });

  it('ANTALLET følger konfigurationen — det var hele pointen med overskriften', () => {
    expect(topTitel({ poolSize: 8, nedSize: 0, labels: { top: 'slutspillet' } }))
      .toBe('🏆 Slutspillet — vælg 8');
  });

  it('LÅST siger den, hvad man HAR — ikke hvad man skal', () => {
    // "vælg 6" over et gitter, man ikke kan vælge i, er en imperativ, ingen
    // kan følge. Efter at overskriften kom til, var den den eneste tekst dér.
    const k = { poolSize: 6, nedSize: 0, labels: { top: 'mesterskabsspillet' } };
    expect(topTitel(k, true)).toBe('🏆 Mesterskabsspillet — dine 6');
    expect(topTitel(k, true)).not.toContain('vælg');
    expect(topTitel({ poolSize: 4, nedSize: 3 }, true)).toBe('🏆 Toppen — dine 4');
  });

  it('tomt eller manglende ord falder tilbage på "Toppen", ikke på et hul', () => {
    // `puljeKonfig` typetjekker labels.top, men ikke længden — en admin kan
    // sætte "". Uden vagten ville overskriften blive "🏆  — vælg 6".
    expect(topTitel({ poolSize: 6, nedSize: 0, labels: { top: '' } }))
      .toBe('🏆 Toppen — vælg 6');
    expect(topTitel({ poolSize: 6, nedSize: 0, labels: { top: '   ' } }))
      .toBe('🏆 Toppen — vælg 6');
    expect(topTitel({ poolSize: 6, nedSize: 0 })).toBe('🏆 Toppen — vælg 6');
  });
});

describe('PuljeTip — den LÅSTE Superliga, som ejeren faktisk kigger på', () => {
  const laastSL = { id: 'sl', teams: HOLD8, pulje: { poolSize: 6 }, puljeLockAt: Date.now() - 1000 };
  const aabenSL = { id: 'sl', teams: HOLD8, pulje: { poolSize: 6 }, puljeLockAt: Date.now() + 86400000 };

  it('overskriften siger "dine 6" — ikke "vælg 6" — og tælleren bliver stående', () => {
    render(<PuljeTip game={laastSL} matches={[]} />);
    expect(screen.getByRole('heading', { name: '🏆 Mesterskabsspillet — dine 6' })).toBeInTheDocument();
    expect(screen.queryByText(/vælg 6/)).toBeNull();
    // Tælleren var skjult, når der var låst. En spiller, der aldrig nåede at
    // tippe, fik dermed ingen besked om det.
    expect(screen.getByText(/0\/6 valgt · låst/)).toBeInTheDocument();
  });

  it('ÅBEN: "vælg 6", og tælleren står uden låse-mærket', () => {
    render(<PuljeTip game={aabenSL} matches={[]} />);
    expect(screen.getByRole('heading', { name: '🏆 Mesterskabsspillet — vælg 6' })).toBeInTheDocument();
    expect(screen.getByText('0/6 valgt')).toBeInTheDocument();
    expect(screen.queryByText(/låst/)).toBeNull();
  });

  it('låst gitter mærkes; åbent gør ikke', () => {
    const { container, unmount } = render(<PuljeTip game={laastSL} matches={[]} />);
    expect([...container.querySelectorAll('.pulje-team')].every((k) => k.classList.contains('pulje-team--laast'))).toBe(true);
    unmount();
    const { container: c2 } = render(<PuljeTip game={aabenSL} matches={[]} />);
    expect([...c2.querySelectorAll('.pulje-team')].some((k) => k.classList.contains('pulje-team--laast'))).toBe(false);
  });

  it('"lige nu"-linjen bruger SPILLETS ord for sektionen, ikke "toppen"', () => {
    // Sektionen fik et spil-specifikt navn i overskriften, men linjen sagde
    // stadig "i toppen" — og så stod ordet "toppen" intet andet sted på
    // Superligaens side (QC-fund). De to skal komme fra samme beslutning.
    // Linjen kræver et GEMT pulje-tip: `ligeNuTop` er null uden `bet`.
    mockBet.current = { championship: ['H1', 'H3', 'H5', 'H7', 'H2', 'H4'] };
    const medUspillet = [...SPILLEDE, { home: 'H1', away: 'H3', homeGoals: null, awayGoals: null }];
    render(<PuljeTip game={aabenSL} matches={medUspillet} />);
    const linje = screen.getByTestId('pulje-ligenu');
    expect(linje.textContent).toContain('i mesterskabsspillet');
    expect(linje.textContent).not.toContain('i toppen');
  });

  it('PL beholder "i toppen" — dér ER der en bund at være top for', () => {
    mockBet.current = { championship: ['H1', 'H3', 'H5', 'H7'], relegation: ['H2', 'H4', 'H8'] };
    const medUspillet = [...SPILLEDE, { home: 'H1', away: 'H3', homeGoals: null, awayGoals: null }];
    render(<PuljeTip game={plGame()} matches={medUspillet} />);
    const linje = screen.getByTestId('pulje-ligenu');
    expect(linje.textContent).toContain('i toppen');
    expect(linje.textContent).toContain('i bunden');
  });

  it('"endnu ikke åbnet" mærkes IKKE som låst — dér er dæmpningen det rigtige signal', () => {
    // Ingen puljeLockAt = deadline ikke udledt endnu. Der er ingen spillede
    // kampe, altså ingen pokaler, ingen tæller og ingen gem-knap: et fuldt
    // oplyst, klikbart-udseende gitter ville love noget, det ikke kan holde.
    const { container } = render(<PuljeTip game={{ id: 'sl', teams: HOLD8, pulje: { poolSize: 6 } }} matches={[]} />);
    expect([...container.querySelectorAll('.pulje-team')].some((k) => k.classList.contains('pulje-team--laast'))).toBe(false);
  });
});

describe('Pulje-gitteret — CSS\'en MÅLES, ikke læses', () => {
  // Den første udgave af denne test asserterede på regel-TEKST, og var derfor
  // grøn på en regel, der ikke gjorde noget: undtagelsen
  // `.pulje-team--laast:disabled > * { opacity: 1 }` vejede (0,2,0) mod
  // basisreglens (0,3,0) — `:not()` arver sit arguments specificitet — og tabte
  // uanset kilderækkefølge. Hele det låste gitter stod stadig dæmpet.
  //
  // Jsdom regner faktisk kaskaden for `opacity` med `:not()` og `>`, så
  // effekten kan måles. Det er forskellen på at bevise, at reglen STÅR der, og
  // at den VIRKER.
  const css = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../styles/theme.css'),
    'utf8',
  );
  const blok = css.slice(css.indexOf('.pulje-team {'), css.indexOf('.pulje-team__name {'));

  const maal = (klasser) => {
    document.head.innerHTML = `<style>${blok}</style>`;
    document.body.innerHTML = `<button class="${klasser}" disabled>
      <span class="pulje-team__name">A</span>
      <span class="pulje-team__actual">🏆</span></button>`;
    const knap = document.querySelector('button');
    return {
      navn: getComputedStyle(knap.querySelector('.pulje-team__name')).opacity,
      pokal: getComputedStyle(knap.querySelector('.pulje-team__actual')).opacity,
    };
  };

  it('POKALEN dæmpes aldrig — heller ikke på et felt, der er fravalgt af maks', () => {
    expect(maal('pulje-team').pokal).toBe('1');
  });

  it('et fravalgt felt dæmpes stadig — dæmpningen ER beskeden dér', () => {
    expect(maal('pulje-team').navn).toBe('0.55');
  });

  it('et LÅST felt dæmpes slet ikke', () => {
    // Rød af den gamle to-regel-form: dér målte begge 0.55.
    const laast = maal('pulje-team pulje-team--laast');
    expect(laast.navn).toBe('1');
    expect(laast.pokal).toBe('1');
  });
});
