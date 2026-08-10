/**
 * Tests for TipsHistorik — den fælles visning bag "Mine tips" og
 * spillerdetaljen.
 *
 * Historikken bygges med den ÆGTE buildTipsHistory: en håndlavet form ville
 * kun bevise, at komponenten kan tegne noget, jeg selv har fundet på.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { groupByRound } from './footballRounds';
import { buildTipsHistory } from './tipsHistory';
import TipsHistorik from './TipsHistorik';

const MATCHES = [
  { id: 'm1', round: 1, home: 'AGF', away: 'OB', kickoff: new Date('2026-08-01T17:00:00Z'), result: '1', odds: { 1: 2.5, X: 4, 2: 4 } },
  { id: 'm2', round: 2, home: 'Brøndby IF', away: 'AaB', kickoff: new Date('2026-08-08T17:00:00Z'), result: 'X', odds: { 1: 3, X: 3.4, 2: 2.6 } },
];
const BETS = {
  m1: { pick: '1', points: 2.5, chanceStake: 0 },
  m2: { pick: 'X', points: 3.4, chanceStake: 0 },
};

const hist = (bets = BETS, pulje = 0) => buildTipsHistory(groupByRound(MATCHES), bets, pulje);
const TOM = <p>Du har ikke tippet endnu.</p>;

describe('TipsHistorik', () => {
  // Nyeste runde øverst. Skal man scrolle forbi 21 runder for at se den, man
  // lige har spillet, er listen ubrugelig midt i en sæson.
  it('viser nyeste runde øverst', () => {
    const { container } = render(<TipsHistorik history={hist()} total={5.9} />);
    const overskrifter = [...container.querySelectorAll('.mytips__round')].map((e) => e.textContent);
    expect(overskrifter).toEqual(['Runde 2', 'Runde 1']);
  });

  // Har spilleren point uden rækker — fx fordi opdelingen ikke er bagfyldt
  // endnu — må totalen ikke forsvinde. Så ville panelet sige "ingen kampe",
  // mens stillingen ved siden af viser 60 point.
  it('beholder totalen for en spiller med point, men uden opdeling', () => {
    render(<TipsHistorik history={hist({})} opdeling={null} total={60} tom={TOM} />);
    expect(screen.getByText('60')).toBeInTheDocument();
    expect(screen.getByText(/ikke klar endnu/)).toBeInTheDocument();
  });

  // Gulvet: delene kan summe under nul, mens totalen står på 0. Panelet må
  // ikke forsvinde, bare fordi tallet er nul — der ER noget at forklare.
  it('beholder panelet for en spiller på 0 point med en opdeling', () => {
    render(
      <TipsHistorik
        history={hist({})}
        opdeling={{ p1x2: 11, chance: -44.8, combi: 0, pulje: 8.5 }}
        total={0}
        tom={TOM}
      />,
    );
    expect(screen.getByText(/kan ikke gå i minus/)).toBeInTheDocument();
  });

  // Men FIRE NULLER er ikke point. En spiller, der ikke har tippet, får en
  // opdeling med lutter nuller, så snart serveren har været forbi ham — og
  // uden dette tjek stod der et pointkort med nuller OVENOVER "du har ikke
  // tippet endnu".
  it('viser kun den tomme tilstand for en spiller uden tips og uden point', () => {
    render(
      <TipsHistorik
        history={hist({})}
        opdeling={{ p1x2: 0, chance: 0, combi: 0, pulje: 0 }}
        total={0}
        tom={TOM}
      />,
    );
    expect(screen.getByText('Du har ikke tippet endnu.')).toBeInTheDocument();
    expect(screen.queryByText(/I alt/)).toBeNull();
  });

  // Serverens total er den autoritative. Regner fladen sin egen, har appen to
  // sandheder om det samme tal.
  it('foretrækker serverens total frem for historikkens', () => {
    render(<TipsHistorik history={hist()} total={60} />);
    expect(screen.getByText('60')).toBeInTheDocument();
    expect(screen.queryByText('5,9')).toBeNull();
  });

  it('falder tilbage til historikkens total, når serverens mangler', () => {
    render(<TipsHistorik history={hist()} />);
    expect(screen.getByText('5,9')).toBeInTheDocument();
  });

  // Mærkaten skal sige, HVAD der tælles: i spillerdetaljen rummer rækkerne kun
  // afgjorte kampe, så "tips afgivet" ville stå med et lavere tal end på Mine
  // tips for den samme person.
  it('skifter mærkat, når rækkerne kun dækker afgjorte kampe', () => {
    const { rerender } = render(<TipsHistorik history={hist()} total={5.9} />);
    expect(screen.getByText('tips afgivet')).toBeInTheDocument();
    rerender(<TipsHistorik history={hist()} total={5.9} kunAfgjorte />);
    expect(screen.getByText('tips på afgjorte kampe')).toBeInTheDocument();
  });
});

// --- Splittet runde ---------------------------------------------------------
//
// Uden denne linje ser spilleren "6/6 tippet · 4 ramt" uden combi og tror,
// bonussen er forsvundet — i stedet for at to kampe aldrig var på kuponen.
describe('TipsHistorik — splittet runde', () => {
  const SPLIT = [
    { id: 'a1', round: 3, home: 'AGF', away: 'OB', kickoff: new Date('2026-08-07T17:00:00Z'), result: '1', odds: { 1: 2, X: 4, 2: 4 } },
    { id: 'a2', round: 3, home: 'Brøndby IF', away: 'AaB', kickoff: new Date('2026-08-08T15:00:00Z'), result: 'X', odds: { 1: 3, X: 3, 2: 3 } },
    { id: 'a3', round: 3, home: 'FCK', away: 'FCM', kickoff: new Date('2026-09-02T17:00:00Z'), result: null, odds: { 1: 2, X: 4, 2: 4 } },
  ];
  const B = {
    a1: { pick: '1', points: 2 },
    a2: { pick: 'X', points: 3 },
    a3: { pick: '1', points: 0 },
  };

  it('siger hvor stor kuponen var, og hvor mange der stod udenfor', () => {
    render(<TipsHistorik history={buildTipsHistory(groupByRound(SPLIT), B, 0)} total={5} />);
    const note = screen.getByTestId('udenfor-3');
    expect(note).toHaveTextContent('kupon 2 kampe');
    expect(note).toHaveTextContent('1 uden for ugen');
  });

  // Er runden hel, må linjen ikke stå der. Ellers står den på hver eneste
  // runde hele sæsonen og betyder ingenting.
  it('siger intet, når runden er hel', () => {
    render(<TipsHistorik history={hist()} total={5.9} />);
    expect(screen.queryByTestId('udenfor-1')).toBeNull();
    expect(screen.queryByTestId('udenfor-2')).toBeNull();
  });
});

// --- Hvad chancen kostede --------------------------------------------------
//
// Brugerens ord, efter at han tabte en chance: "det vi skal have gjort noget
// ved er visningen". Et forkert tip stod som et bart rødt ✗ — man kunne se, at
// man tabte, men ikke at det kostede fire point. Tallet lå allerede i
// bet.points; det blev bare smidt væk.
describe('TipsHistorik — chancens udfald pr. kamp', () => {
  const CH = [
    { id: 'c1', round: 1, home: 'AGF', away: 'OB', kickoff: new Date('2026-08-01T17:00:00Z'), result: '1', odds: { 1: 3.9, X: 3.5, 2: 2 } },
  ];
  const tegn = (bets, matches = CH) => render(
    <TipsHistorik history={buildTipsHistory(groupByRound(matches), bets)} total={0} />,
  );

  it('viser hvad en TABT chance kostede', () => {
    tegn({ c1: { pick: '2', points: -4, chanceStake: 4 } });
    const celle = screen.getByText(/✗/);
    expect(celle).toHaveTextContent('−4');
    expect(celle).toHaveAttribute('title', 'Chancen tabt: 4 point');
  });

  // Et forkert tip UDEN chance har intet tal at vise: 0 point er ikke en
  // oplysning, og et "−0" ville se ud som om noget var trukket fra.
  it('sætter ikke et tal på et forkert tip uden chance', () => {
    tegn({ c1: { pick: '2', points: 0, chanceStake: 0 } });
    const celle = screen.getByText(/✗/);
    expect(celle.textContent.trim()).toBe('✗');
  });

  // Uden gyldige odds har serveren ikke afregnet chancen. Så må der hverken
  // stå −4 (løgn) eller 0 (gæt).
  // Teksten skal BÆRE SIG SELV: en title findes ikke på en telefon, og
  // "ikke afregnet" alene læses som "vent, den kommer" — hvad den aldrig gør,
  // når kampen mangler odds.
  it('siger hvorfor, når odds mangler — og gætter ikke et tal', () => {
    const udenOdds = [{ ...CH[0], odds: null }];
    tegn({ c1: { pick: '2', points: 0, chanceStake: 4 } }, udenOdds);
    const celle = screen.getByText(/ingen odds/);
    expect(celle).toHaveTextContent('hverken vundet eller tabt');
    expect(celle.textContent).not.toMatch(/−4|-4/);
    expect(celle.textContent).not.toMatch(/afregnes om lidt/);
  });

  // SCORINGSVINDUET: facit er på kampen, men bettet er ikke scoret endnu.
  // Uden den egen tilstand stod der et grønt "✓ +0 · Chancen vundet" på et
  // tip, spilleren netop havde tabt fire point på.
  it('siger "afregnes om lidt", mens bettet venter på serveren', () => {
    tegn({ c1: { pick: '2', chanceStake: 4 } }); // intet points-felt
    const celle = screen.getByText(/afregnes om lidt/);
    expect(celle.textContent).not.toMatch(/[−+]4/);
    expect(celle.textContent).not.toMatch(/ingen odds/);
  });

  // Et RAMT tip uden odds gav faktisk point (DEFAULT_POINTS). Den tidligere
  // udgave returnerede før træf-grenen og slugte tallet.
  it('beholder tippets point på et træf uden odds', () => {
    const udenOdds = [{ ...CH[0], odds: null }];
    tegn({ c1: { pick: '1', points: 4, chanceStake: 4 } }, udenOdds);
    expect(screen.getByText(/ingen odds/)).toHaveTextContent('✓ +4');
  });

  // En vundet chance: tallet rummer både tippet og gevinsten, og uden
  // forklaringen kunne man ikke se, hvorfor en kamp til odds 3,9 gav 15,9.
  it('forklarer fordelingen, når en chance er vundet', () => {
    tegn({ c1: { pick: '1', points: 15.9, chanceStake: 4 } });
    const celle = screen.getByText(/✓/);
    expect(celle).toHaveTextContent('+15,9');
    expect(celle).toHaveAttribute('title', '3,9 for tippet + 12 fra Chancen');
  });

  // Et træf uden chance skal IKKE have en forklaring — der er intet at dele op.
  it('forklarer ikke noget på et træf uden chance', () => {
    tegn({ c1: { pick: '1', points: 3.9, chanceStake: 0 } });
    expect(screen.getByText(/✓/)).not.toHaveAttribute('title');
  });

  // Point er heltal eller én decimal — ikke "+19,0".
  it('skriver hele point uden en meningsløs decimal', () => {
    tegn({ c1: { pick: '1', points: 16, chanceStake: 4 } });
    expect(screen.getByText(/✓/)).toHaveTextContent('+16');
    expect(screen.getByText(/✓/).textContent).not.toMatch(/16,0/);
  });

  // RÆKKEFØLGEN i ResultCell. Bytter man om på "afventer" og chance-grenen,
  // får en chance på en kamp UDEN facit et rødt kryds og en besked om odds —
  // på en kamp, der ikke er spillet endnu. Intet bandt rækkefølgen.
  it('siger "afventer" på en chance, hvis kampen ikke er spillet endnu', () => {
    const ikkeSpillet = [{ ...CH[0], result: null }];
    tegn({ c1: { pick: '1', chanceStake: 4 } }, ikkeSpillet);
    expect(screen.getByText('afventer')).toBeInTheDocument();
    expect(screen.queryByText(/ingen odds/)).not.toBeInTheDocument();
    expect(screen.queryByText(/afregnes om lidt/)).not.toBeInTheDocument();
    expect(screen.queryByText(/✗/)).not.toBeInTheDocument();
  });

  // En gevinst kan lovligt være 0: indsats 1 til odds under 1,50 giver
  // Math.round(profit) = 0. Det er en AFREGNET chance, og valget om at vise
  // den som en gevinst skal stå fast.
  it('viser en gevinst på nul point som en gevinst — ikke som uafgjort', () => {
    const lav = [{ ...CH[0], odds: { 1: 1.1, X: 3, 2: 3 } }];
    tegn({ c1: { pick: '1', points: 1.1, chanceStake: 1 } }, lav);
    const celle = screen.getByText(/✓/);
    expect(celle).toHaveClass('badge--green');
    expect(celle).toHaveAttribute('title', '1,1 for tippet + 0 fra Chancen');
  });
});

// ---------------------------------------------------------------------------
// HOLDNAVNET
//
// Listen viste kun kortkoder ("SJF–VFF"), og det krævede, at man kunne
// tolvte-dels-alfabetet udenad for at læse sin egen tipshistorik. Spillerpanelet
// viste til gengæld fulde navne — men KUN fordi det glemte at sende `teams`
// med, så `shortOf` faldt tilbage på navnet. To flader, to visninger, ingen
// beslutning bag nogen af dem.
//
// Nu står det fulde VISNINGSNAVN begge steder og på alle skærmbredder. En
// mellemløsning med kortkode på telefon blev prøvet og forkastet: kampkortet
// sagde "Sønderjyske", mens historikken ved siden af sagde "SJF".
// ---------------------------------------------------------------------------
describe('TipsHistorik — holdnavn', () => {
  const HOLD = [
    { name: 'AGF', short: 'AGF' },
    { name: 'OB', short: 'OB' },
    { name: 'Brøndby IF', short: 'BIF' },
    { name: 'AaB', short: 'AAB' },
  ];

  it('viser det fulde holdnavn', () => {
    const { container } = render(<TipsHistorik history={hist()} teams={HOLD} total={5.9} />);
    const kampe = [...container.querySelectorAll('.mytips__match')].map((e) => e.textContent);
    expect(kampe.join(' ')).toContain('Brøndby IF');
    expect(kampe.join(' ')).toContain('AaB');
  });

  // BÆRENDE: kortkoden må IKKE stå der. Den var der før, og den var
  // ulæselig for spillerne.
  it('viser ikke kortkoden', () => {
    const { container } = render(<TipsHistorik history={hist()} teams={HOLD} total={5.9} />);
    expect(container.querySelectorAll('.mytips__hold-kort')).toHaveLength(0);
    const kampe = [...container.querySelectorAll('.mytips__match')].map((e) => e.textContent).join(' ');
    expect(kampe).not.toContain('BIF');
    expect(kampe).not.toContain('AAB');
  });

  // VISNINGSNAVNET slår igennem her som alle andre steder — det er hele
  // grunden til, at det lægges på i teamsOf() og ikke på hvert brugssted.
  it('bruger visningsnavnet, når holdet har et', () => {
    const medVis = [
      { name: 'AGF', short: 'AGF' },
      { name: 'OB', short: 'OB' },
      { name: 'Brøndby IF', short: 'BIF', vis: 'Brøndby' },
      { name: 'AaB', short: 'AAB' },
    ];
    const { container } = render(<TipsHistorik history={hist()} teams={medVis} total={5.9} />);
    const kampe = [...container.querySelectorAll('.mytips__match')].map((e) => e.textContent).join(' ');
    expect(kampe).toContain('Brøndby');
    expect(kampe).not.toContain('Brøndby IF');
  });

  // Uden holdliste skal navnet stadig stå — bare uden visningsnavn.
  it('falder tilbage på kampens eget navn, når holdlisten mangler', () => {
    const { container } = render(<TipsHistorik history={hist()} total={5.9} />);
    const kampe = [...container.querySelectorAll('.mytips__match')].map((e) => e.textContent).join(' ');
    expect(kampe).toContain('Brøndby IF');
  });
});
