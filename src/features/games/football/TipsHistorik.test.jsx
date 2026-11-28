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
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    // HELE teksten: ved et forkert tip ER tallet chance-tabet, så der må ikke
    // komme en «(heraf ⚡ −4)» med, nu hvor det ramte mærke har fået en parentes.
    expect(celle.textContent).toBe('✗ −4');
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
    // Ingen deling: chancen er ikke afregnet, så der findes intet ⚡-tal.
    expect(screen.getByText(/ingen odds/).textContent).not.toMatch(/heraf|\(⚡/);
  });

  // En vundet chance: tallet rummer både tippet og gevinsten, og uden
  // forklaringen kunne man ikke se, hvorfor en kamp til odds 3,9 gav 15,9.
  //
  // DELINGEN STÅR PÅ MÆRKET, ikke kun i title'en — title findes ikke på en
  // telefon. Fixturen er en rigtig afregning: 3,9 + round(4 × 2,9) = 3,9 + 12.
  // HELE teksten asserteres: en substring-match på «+15,9» var grøn både før
  // og efter, og ville også være grøn, hvis parentesen viste totalen.
  it('viser fordelingen på mærket, når en chance er vundet', () => {
    tegn({ c1: { pick: '1', points: 15.9, chanceStake: 4 } });
    const celle = screen.getByText(/✓/);
    expect(celle.textContent).toBe('✓ +15,9 (heraf ⚡ +12)');
    expect(celle).toHaveAttribute('title', '3,9 for tippet + 12 fra Chancen');
    // Klassen bærer stablingen på telefon (theme.css, testen nederst).
    expect(celle).toHaveClass('mytips__delt');
  });

  // EJERENS TILFÆLDE (PL runde 12): to spillere tippede begge 1 med ⚡ på
  // samme kamp og fik «✓ +11» og «✓ +9» uden synlig grund. Indsatsen er
  // spillerens eget valg (1–8). Odds 2,1: 2,1 + round(8 × 1,1) = 2,1 + 9 og
  // 2,1 + round(6 × 1,1) = 2,1 + 7. Tippets del er ens — det er det, mærket
  // skal gøre synligt.
  it('viser hvorfor samme tip på samme kamp gav forskellige point', () => {
    const odds21 = [{ ...CH[0], odds: { 1: 2.1, X: 3.4, 2: 3.5 } }];
    const { unmount } = tegn({ c1: { pick: '1', points: 11.1, chanceStake: 8 } }, odds21);
    expect(screen.getByText(/✓/).textContent).toBe('✓ +11,1 (heraf ⚡ +9)');
    unmount();
    tegn({ c1: { pick: '1', points: 9.1, chanceStake: 6 } }, odds21);
    expect(screen.getByText(/✓/).textContent).toBe('✓ +9,1 (heraf ⚡ +7)');
  });

  // Et træf uden chance skal IKKE have en forklaring — der er intet at dele op.
  // Hverken title, parentes eller ⚡ i mærket.
  it('forklarer ikke noget på et træf uden chance', () => {
    tegn({ c1: { pick: '1', points: 3.9, chanceStake: 0 } });
    const celle = screen.getByText(/✓/);
    expect(celle).not.toHaveAttribute('title');
    expect(celle.textContent).toBe('✓ +3,9');
    expect(celle).not.toHaveClass('mytips__delt');
  });

  // Point er heltal eller én decimal — ikke "+19,0". Fixturen var før 16 point
  // til odds 3,9, hvilket gav et ⚡-tal på 12,1, som aldrig kan forekomme
  // (settleChance giver et heltal). Nu odds 4: 4 + round(4 × 3) = 4 + 12.
  it('skriver hele point uden en meningsløs decimal', () => {
    tegn({ c1: { pick: '1', points: 16, chanceStake: 4 } }, [{ ...CH[0], odds: { 1: 4, X: 3.5, 2: 2 } }]);
    expect(screen.getByText(/✓/).textContent).toBe('✓ +16 (heraf ⚡ +12)');
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
    // «(heraf ⚡ +0)» er et BEVIDST valg: det er ærligt (chancen ER afregnet, og
    // gevinsten blev 0) og spejler kampkortets «⚡ +0». At skjule parentesen
    // ville gøre rækken umulig at skelne fra et træf uden chance.
    expect(celle.textContent).toBe('✓ +1,1 (heraf ⚡ +0)');
  });

  // STABLINGEN PÅ TELEFON. Inline tog mærket ~115 px ved 360 px og pressede
  // holdnavnet ned på ~15 px (målt med Playwright). jsdom anvender ingen CSS,
  // så reglen bindes som TEKST — groft, men uden den kan stablingen fjernes
  // med hele suiten grøn.
  it('stabler delingen under 600 px og bryder aldrig midt i en del', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../styles/theme.css'), 'utf8');
    expect(css).toMatch(/\.mytips__delt \{ white-space: nowrap; \}/);
    const mq = css.indexOf('@media (max-width: 600px) {\n  .mytips__delt');
    expect(mq).toBeGreaterThan(-1);
    const blok = css.slice(mq, css.indexOf('\n}', mq));
    expect(blok).toMatch(/\.mytips__delt \{[^}]*flex-direction: column/);
    // «heraf» gjorde andenlinjen bredest: i fuld størrelse 99 px mærke og 31 px
    // holdnavn ved 360 px; med 0,72em 77 px og 53 px (målt med Playwright).
    expect(blok).toMatch(/\.mytips__delt \.mytips__chance-del \{ font-size: 0\.72em; \}/);
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
  // BEGGE SIDER AF KAMPEN. Kun hjemmeholdet havde et afvigende `vis`, så
  // `{visOf(teams, row.away)}` → `{row.away}` overlevede: to grene, én dækket.
  // Kampen er "Brøndby IF–AaB", så hjemme og ude prøves i samme række.
  it('bruger visningsnavnet, når holdet har et — på BEGGE sider', () => {
    const medVis = [
      { name: 'AGF', short: 'AGF' },
      { name: 'OB', short: 'OB' },
      { name: 'Brøndby IF', short: 'BIF', vis: 'Brøndby' },
      { name: 'AaB', short: 'AAB', vis: 'Aalborg' },
    ];
    const { container } = render(<TipsHistorik history={hist()} teams={medVis} total={5.9} />);
    const kampe = [...container.querySelectorAll('.mytips__match')].map((e) => e.textContent).join(' ');
    expect(kampe).toContain('Brøndby');
    expect(kampe).toContain('Aalborg');
    expect(kampe).not.toContain('Brøndby IF');
    expect(kampe).not.toContain('AaB');
  });

  // Uden holdliste skal navnet stadig stå — bare uden visningsnavn.
  it('falder tilbage på kampens eget navn, når holdlisten mangler', () => {
    const { container } = render(<TipsHistorik history={hist()} total={5.9} />);
    const kampe = [...container.querySelectorAll('.mytips__match')].map((e) => e.textContent).join(' ');
    expect(kampe).toContain('Brøndby IF');
  });
});

// ---------------------------------------------------------------------------
// TIPPET OG INDSATSEN (28/11)
//
// Ejeren læste «1 ⚡» som «én chance» eller en indsats på 1 — men 1-tallet var
// tippet. Nu står tippet i en boks (et udfald, ikke et tal), og indsatsen står
// med ord under kampen: «⚡ 8 sat på spil». Hans egne ord.
//
// Teksten bruger hårde mellemrum (se indsatsTekst); de normaliseres her, så
// testene læser det, en spiller ser.
// ---------------------------------------------------------------------------
describe('TipsHistorik — tippet i en boks og indsatsen med ord', () => {
  const K = (id, result, odds = { 1: 2.1, X: 3.4, 2: 3.5 }) => ({
    id, round: 1, home: `Hjem ${id}`, away: `Ude ${id}`, kickoff: new Date('2026-08-01T17:00:00Z'), result, odds,
  });
  const tekst = (el) => el.textContent.replace(/\u00a0/g, ' ');
  const tegn = (matches, bets) => render(
    <TipsHistorik history={buildTipsHistory(groupByRound(matches), bets)} total={0} />,
  );
  const raekke = (container, id) => [...container.querySelectorAll('.mytips__row')]
    .find((r) => r.querySelector('.mytips__match').textContent.startsWith(`Hjem ${id}`));

  // DEN RAMTE RÆKKE: to ⚡-tal side om side. Indsatsen er et beløb (intet
  // fortegn), Chancens del en ændring (altid fortegn). Uden den regel kan
  // «8» og «+9» læses som det samme slags tal.
  it('en ramt Chance: boks, indsats uden fortegn og delta med fortegn', () => {
    const { container } = tegn([K('a', '1')], { a: { pick: '1', points: 11.1, chanceStake: 8 } });
    const r = raekke(container, 'a');
    expect(r.querySelector('.mytips__pick').textContent).toBe('1');
    expect(r.querySelector('.mytips__udfald').textContent).toBe('1');
    expect(tekst(r.querySelector('.mytips__indsats'))).toBe('⚡ 8 sat på spil');
    expect(r.querySelector('.mytips__res').textContent).toBe('✓ +11,1 (heraf ⚡ +9)');
    // Fortegnsreglen, læst på hele rækken: «8» står ALDRIG med fortegn, og
    // ⚡-deltaet står ALDRIG uden.
    expect(tekst(r)).not.toMatch(/[+−-]\s?8 sat/);
    expect(tekst(r)).toMatch(/\(heraf ⚡ \+9\)/);
    // Tip-kolonnen har intet andet end udfaldet — ⚡'et er flyttet til indsatsen.
    expect(r.querySelector('.mytips__pick').textContent).not.toMatch(/⚡/);
    expect(r.querySelector('.mytips__chance')).toBeNull();
  });

  it('en tabt Chance: samme N i indsatsen og i mærket', () => {
    const { container } = tegn([K('d', 'X')], { d: { pick: '1', points: -4, chanceStake: 4 } });
    const r = raekke(container, 'd');
    expect(tekst(r.querySelector('.mytips__indsats'))).toBe('⚡ 4 sat på spil');
    expect(r.querySelector('.mytips__res').textContent).toBe('✗ −4');
  });

  // DEN FORFALSKEDE INDSATS. Serveren afregnede 100 som 8 (clampStake), og så
  // må rækken hverken sige 100 eller noget andet tal over loftet.
  it('en forfalsket indsats på 100 står som 8 — og 100 står ingen steder', () => {
    const { container } = tegn([K('g', 'X')], { g: { pick: '2', points: -8, chanceStake: 100 } });
    const r = raekke(container, 'g');
    expect(tekst(r.querySelector('.mytips__indsats'))).toBe('⚡ 8 sat på spil');
    expect(r.querySelector('.mytips__res').textContent).toBe('✗ −8');
    expect(container.textContent).not.toMatch(/100/);
  });

  // Under 1 afregnede serveren ingen Chance. Så er rækken en almindelig række:
  // ingen indsats, ingen ⚡-farve, intet «heraf».
  it('en indsats på 0,9 er ingen Chance — ingen indsats-linje', () => {
    const { container } = tegn([K('e', '1')], { e: { pick: '1', points: 2.1, chanceStake: 0.9 } });
    expect(container.querySelector('.mytips__indsats')).toBeNull();
    expect(container.querySelector('.mytips__row--chance')).toBeNull();
    expect(raekke(container, 'e').querySelector('.mytips__res').textContent).toBe('✓ +2,1');
    expect(raekke(container, 'e').textContent).not.toMatch(/på spil|⚡/);
  });

  // «på spil» KUN på Chance-rækker. En runde med og uden Chance side om side.
  it('«sat på spil» står kun på Chance-rækkerne', () => {
    const { container } = tegn(
      [K('a', '1'), K('b', '1'), K('c', '2'), K('n', '1')],
      {
        a: { pick: '1', points: 11.1, chanceStake: 8 },
        b: { pick: '1', points: 2.1, chanceStake: 0 },
        c: { pick: '1', points: 0 },
        // n: ikke tippet
      },
    );
    const medIndsats = [...container.querySelectorAll('.mytips__row')]
      .filter((r) => /på.spil/.test(r.textContent))
      .map((r) => r.querySelector('.mytips__match').textContent);
    expect(medIndsats).toHaveLength(1);
    expect(medIndsats[0]).toMatch(/^Hjem a/);
    expect(container.querySelectorAll('.mytips__indsats')).toHaveLength(1);
  });

  // ÆRLIG FØR AFREGNING. Indsatsen ER sat, også når intet er afgjort endnu —
  // men mærket må stadig hverken gætte et tal eller kalde den vundet/tabt.
  it('ikke spillet, venter på serveren og uden odds: indsatsen står, mærket gætter ikke', () => {
    const { container } = tegn(
      [K('h', null), K('v', '2'), K('f', '2', null)],
      {
        h: { pick: 'X', chanceStake: 5 },
        v: { pick: '1', chanceStake: 3 }, // facit, men endnu ikke scoret
        f: { pick: '1', points: 0, chanceStake: 8 },
      },
    );
    const res = (id) => raekke(container, id).querySelector('.mytips__res').textContent;
    const ind = (id) => tekst(raekke(container, id).querySelector('.mytips__indsats'));
    expect(ind('h')).toBe('⚡ 5 sat på spil');
    expect(res('h')).toBe('afventer');
    expect(ind('v')).toBe('⚡ 3 sat på spil');
    expect(res('v')).toBe('✗ · ⚡ afregnes om lidt');
    expect(ind('f')).toBe('⚡ 8 sat på spil');
    expect(res('f')).toBe('✗ · ⚡ ingen odds, hverken vundet eller tabt');
    // Intet fortegnstal på de ikke-afregnede.
    for (const id of ['h', 'v', 'f']) expect(res(id)).not.toMatch(/[+−-]\d/);
  });

  // Ingen boks uden et tip: en boks siger "dit udfald", og der er intet.
  it('en ikke-tippet kamp har en streg, ikke en tom boks', () => {
    const { container } = tegn([K('a', '1'), K('n', '1')], { a: { pick: '1', points: 2.1 } });
    const r = raekke(container, 'n');
    expect(r.querySelector('.mytips__pick').textContent).toBe('–');
    expect(r.querySelector('.mytips__udfald')).toBeNull();
    expect(container.querySelectorAll('.mytips__udfald')).toHaveLength(1);
  });

  // NEUTRAL BOKS. jsdom anvender ingen CSS, så reglerne bindes som TEKST:
  // boksen har 1/X/2-knappens kant, men ingen af dens farvetilstande, og
  // indsatsen står som en blok-linje under navnet, der aldrig brydes midt i et
  // ord (ellers stod «s / pil» ved 360 px — målt med Playwright).
  it('boksen er neutral, og indsats-linjen brydes kun mellem ord', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../styles/theme.css'), 'utf8');
    const regel = (sel) => {
      const i = css.indexOf(`\n${sel} {`);
      expect(i, sel).toBeGreaterThan(-1);
      return css.slice(i, css.indexOf('}', i));
    };
    const boks = regel('.mytips__udfald');
    expect(boks).toMatch(/border: 1\.5px solid var\(--c-border\)/);
    expect(boks).not.toMatch(/--c-pitch|--c-danger|--c-accent|--c-red|--c-green/);
    const ind = regel('.mytips__indsats');
    expect(ind).toMatch(/display: block/);
    expect(ind).toMatch(/overflow-wrap: normal/);
    expect(ind).not.toMatch(/nowrap/); // nowrap gav vandret scroll ved 360 px
    // Boksen har kun sin egen klasse — ingen pick--/badge--farveklasser.
    const { container } = tegn([K('a', '1')], { a: { pick: '1', points: 11.1, chanceStake: 8 } });
    expect(container.querySelector('.mytips__udfald').className).toBe('mytips__udfald');
  });

  // De hårde mellemrum er grunden til, at linjen brydes som «⚡ 8 sat / på spil».
  it('holder «⚡ 8» og «på spil» sammen med hårde mellemrum', () => {
    const { container } = tegn([K('a', '1')], { a: { pick: '1', points: 11.1, chanceStake: 8 } });
    expect(container.querySelector('.mytips__indsats').textContent).toBe('⚡\u00a08\u00a0sat på\u00a0spil');
  });
});
