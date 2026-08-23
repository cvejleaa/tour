import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Indbyrdes from './Indbyrdes';

// Kilden er ét dokument pr. spiller. Her styres den direkte, så testen kan
// vise, at BEGGE sider hentes, og at panelet ikke henter noget, før nogen
// folder ud.
const svar = new Map();
const kald = [];
vi.mock('./useSpillerOpdeling', () => ({
  useSpillerOpdeling: (gameId, uid) => {
    kald.push({ gameId, uid });
    if (!gameId) return { kampe: null, loading: false, error: null };
    return svar.get(uid) || { kampe: {}, loading: false, error: null };
  },
}));

const KAMPE = [
  { id: 'm1', round: 5, home: 'Brøndby IF', away: 'FC København', result: '1', kickoff: 5 },
  { id: 'm2', round: 5, home: 'AGF', away: 'Viborg FF', result: '2', kickoff: 6 },
  { id: 'm3', round: 4, home: 'OB', away: 'FC Midtjylland', result: 'X', kickoff: 4 },
];
const rounds = [
  { round: 5, matches: KAMPE.filter((m) => m.round === 5) },
  { round: 4, matches: KAMPE.filter((m) => m.round === 4) },
];

function opsaet({ mine, deres, loading = false, error = null }) {
  svar.clear();
  kald.length = 0;
  svar.set('mig', { kampe: mine, loading, error });
  svar.set('dem', { kampe: deres, loading, error });
}

const vis = (props = {}) => render(
  <Indbyrdes
    game={{ id: 'g1' }}
    rounds={rounds}
    minUid="mig"
    dueUid="dem"
    dueNavn="Morten"
    {...props}
  />,
);

beforeEach(() => { svar.clear(); kald.length = 0; });

describe('Indbyrdes', () => {
  it('henter INTET, før nogen folder ud — to læsninger skal ikke betales af alle', async () => {
    opsaet({ mine: {}, deres: {} });
    vis();
    // Alle kald skal have gameId=null, altså "hent ikke".
    expect(kald.length).toBeGreaterThan(0);
    expect(kald.every((k) => k.gameId === null)).toBe(true);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('henter BEGGE spilleres dokumenter, når man folder ud', async () => {
    opsaet({
      mine: { m1: { pick: '1', points: 2 } },
      deres: { m1: { pick: '2', points: 0 } },
    });
    vis();
    await userEvent.click(screen.getByRole('button', { name: /Jer to imellem/ }));
    const hentede = kald.filter((k) => k.gameId === 'g1').map((k) => k.uid);
    expect(hentede).toContain('mig');
    expect(hentede).toContain('dem');
  });

  it('viser stillingen i opgøret med NAVN og tal', async () => {
    opsaet({
      // m1: jeg ret. m2: Morten ret. m3: begge fejl.
      mine: { m1: { pick: '1' }, m2: { pick: '1' }, m3: { pick: '1' } },
      deres: { m1: { pick: '2' }, m2: { pick: '2' }, m3: { pick: '2' } },
    });
    vis();
    await userEvent.click(screen.getByRole('button', { name: /Jer to imellem/ }));
    expect(screen.getByText(/Det står 1-1/)).toBeInTheDocument();
    expect(screen.getByText(/I 1 af uenighederne tog I begge fejl/)).toBeInTheDocument();
  });

  it('viser KUN uenighederne i tabellen — enigheden er ét tal', async () => {
    opsaet({
      mine: { m1: { pick: '1' }, m2: { pick: '2' }, m3: { pick: 'X' } },
      deres: { m1: { pick: '2' }, m2: { pick: '2' }, m3: { pick: 'X' } },
    });
    vis();
    await userEvent.click(screen.getByRole('button', { name: /Jer to imellem/ }));
    // Kun m1 var en uenighed.
    expect(screen.getByText(/Brøndby/)).toBeInTheDocument();
    expect(screen.queryByText(/AGF/)).not.toBeInTheDocument();
    expect(screen.queryByText(/OB/)).not.toBeInTheDocument();
    expect(screen.getByText(/I var enige om 2 af 3 afgjorte kampe/)).toBeInTheDocument();
  });

  it('siger det med ord, når de aldrig har mødtes — ikke en tom tabel', async () => {
    opsaet({ mine: {}, deres: {} });
    vis();
    await userEvent.click(screen.getByRole('button', { name: /Jer to imellem/ }));
    expect(screen.getByText(/endnu ikke tippet nogen af de samme afgjorte kampe/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('skelner "aldrig mødtes" fra "altid enige"', async () => {
    opsaet({
      mine: { m1: { pick: '1' } },
      deres: { m1: { pick: '1' } },
    });
    vis();
    await userEvent.click(screen.getByRole('button', { name: /Jer to imellem/ }));
    expect(screen.getByText(/tippet ens hver gang/)).toBeInTheDocument();
    expect(screen.queryByText(/endnu ikke tippet nogen/)).not.toBeInTheDocument();
  });

  it('nævner kampe, kun den ene tippede, så regnestykket kan gå op', async () => {
    opsaet({
      mine: { m1: { pick: '1' }, m2: { pick: '1' } },
      deres: { m1: { pick: '2' } },
    });
    vis();
    await userEvent.click(screen.getByRole('button', { name: /Jer to imellem/ }));
    expect(screen.getByText(/Uden for opgøret/)).toBeInTheDocument();
    expect(screen.getByText(/1 kamp tippede kun du/)).toBeInTheDocument();
  });

  it('viser en afvist læsning som fejl i stedet for en tom liste', async () => {
    opsaet({ mine: {}, deres: {}, error: 'Ingen adgang.' });
    vis();
    await userEvent.click(screen.getByRole('button', { name: /Jer to imellem/ }));
    expect(screen.getByText('Ingen adgang.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('vises SLET IKKE på ens eget navn', () => {
    opsaet({ mine: {}, deres: {} });
    const { container } = vis({ dueUid: 'mig' });
    expect(container).toBeEmptyDOMElement();
  });

  it('vises ikke, hvis den kiggende er ukendt', () => {
    opsaet({ mine: {}, deres: {} });
    const { container } = vis({ minUid: null });
    expect(container).toBeEmptyDOMElement();
  });

  it('bruger holdenes VISNINGSNAVN, ikke det rå navn', async () => {
    opsaet({
      mine: { m1: { pick: '1' } },
      deres: { m1: { pick: '2' } },
    });
    const { container } = vis({ teams: [{ name: 'FC København', vis: 'FCK' }] });
    await userEvent.click(screen.getByRole('button', { name: /Jer to imellem/ }));
    // Uden teams-proppen ville der stå det fulde navn — samme drift som
    // sammeVisning-testen findes for at fange. Navnene står i hver sin
    // tekstnode, så der assertes på rækkens samlede tekst.
    expect(container.textContent).toContain('FCK');
    expect(container.textContent).not.toContain('FC København');
  });

  it('siger ALDRIG en procent om spillerne', async () => {
    // Træfprocent mellem to venner ville mest vise, at sæsonen var tilfældig.
    opsaet({
      mine: { m1: { pick: '1' }, m2: { pick: '1' } },
      deres: { m1: { pick: '2' }, m2: { pick: '2' } },
    });
    const { container } = vis();
    await userEvent.click(screen.getByRole('button', { name: /Jer to imellem/ }));
    expect(container.textContent).not.toMatch(/%/);
  });

  it('viser MIT valg og point i "Dig"-kolonnen og MODPARTENS i den anden', async () => {
    // Den alvorlige mutation: kolonnerne kunne byttes om, uden at en test blev
    // rød — og en spiller ville se sit eget resultat stå som modstanderens.
    // Cellerne bindes derfor til PARTEN, ikke til rækkefølgen.
    opsaet({
      mine: { m1: { pick: '1', points: 4.2 } },
      deres: { m1: { pick: '2', points: -3 } },
    });
    const { container } = vis();
    await userEvent.click(screen.getByRole('button', { name: /Jer to imellem/ }));

    expect(container.querySelector('td[data-side="mig"]').textContent).toBe('1');
    expect(container.querySelector('td[data-side="dem"]').textContent).toBe('2');
    expect(container.querySelector('span[data-side="mig"]').textContent).toContain('4,2');
    expect(container.querySelector('span[data-side="dem"]').textContent).toContain('3');
    // Og pointene må ikke stå ens: fixturet havde før ingen points, så
    // kolonnen viste altid "0 / 0" og kunne ikke afsløre en ombytning.
    expect(container.querySelector('span[data-side="mig"]').textContent)
      .not.toBe(container.querySelector('span[data-side="dem"]').textContent);
  });

  it('har kolonnerne i SAMME rækkefølge som overskrifterne', async () => {
    // data-side binder værdien til parten, men ikke til PLADSEN. Byttes de to
    // celler om, ville overskriften "Dig" stå over modstanderens tal — og
    // attributterne ville følge med, så ingen af de øvrige tests så det.
    opsaet({
      mine: { m1: { pick: '1', points: 4.2 } },
      deres: { m1: { pick: '2', points: -3 } },
    });
    const { container } = vis();
    await userEvent.click(screen.getByRole('button', { name: /Jer to imellem/ }));

    const overskrifter = [...container.querySelectorAll('thead th')].map((t) => t.textContent);
    expect(overskrifter).toEqual(['Runde', 'Kamp', 'Dig', 'Morten', 'Point']);

    const celler = [...container.querySelectorAll('tbody tr td')];
    expect(celler[2].getAttribute('data-side')).toBe('mig');   // under "Dig"
    expect(celler[3].getAttribute('data-side')).toBe('dem');   // under "Morten"

    // Og i point-cellen skal MIT tal stå først, som overskriftsrækkefølgen lover.
    const tal = [...celler[4].querySelectorAll('span')].map((x) => x.getAttribute('data-side'));
    expect(tal).toEqual(['mig', 'dem']);
  });

  it('markerer den, der RAMTE — og kun den', async () => {
    opsaet({
      mine: { m1: { pick: '1' } },   // m1 endte '1' → jeg ramte
      deres: { m1: { pick: '2' } },
    });
    const { container } = vis();
    await userEvent.click(screen.getByRole('button', { name: /Jer to imellem/ }));
    expect(container.querySelector('td[data-side="mig"] .badge').className).toContain('badge--green');
    expect(container.querySelector('td[data-side="dem"] .badge').className).not.toContain('badge--green');
  });

  it('skriver en HEL sætning, når kun MODPARTEN har tippet kampe alene', async () => {
    // Den symmetriske gren, render-testen manglede: før stod der
    // "0 kampe tippede kun du, 2 kun Morten".
    opsaet({
      mine: { m1: { pick: '1' } },
      deres: { m1: { pick: '2' }, m2: { pick: '1' }, m3: { pick: '1' } },
    });
    const { container } = vis();
    await userEvent.click(screen.getByRole('button', { name: /Jer to imellem/ }));
    expect(screen.getByText('Uden for opgøret: 2 kampe tippede kun Morten.')).toBeInTheDocument();
    expect(container.textContent).not.toContain('0 kampe');
  });

  it('nævner slet ikke "uden for opgøret", når der ikke er noget', async () => {
    opsaet({
      mine: { m1: { pick: '1' } },
      deres: { m1: { pick: '2' } },
    });
    const { container } = vis();
    await userEvent.click(screen.getByRole('button', { name: /Jer to imellem/ }));
    expect(container.textContent).not.toContain('Uden for opgøret');
  });

  it('vises ikke, når modparten er ukendt', () => {
    // dueUid-halvdelen af vagten var udækket: den kunne fjernes med grøn suite.
    opsaet({ mine: {}, deres: {} });
    const { container } = vis({ dueUid: null });
    expect(container).toBeEmptyDOMElement();
  });
});
