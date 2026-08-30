// xG (målchancer) i fladerne, og de ord der ALDRIG må stå der.
//
// Målingen (scripts/maal-xg.mjs) viser, at xG peger på det modsatte hold i 13
// af 37 afgjorte kampe. Et tal, der rammer forbi hver tredje gang, må ikke
// præsenteres som en dom over kampen. Sprogreglen er derfor ikke en aftale i
// en kommentar, men en test: den forbudte ordliste asserteres på fladen.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import HoldSide from './HoldSide';
import HoldXgListe from './HoldXgListe';
import FootballHelp from './FootballHelp';

// Ord, der gør et beskrivende tal til en dom. "fortjent" er forbudt overalt,
// også i filnavne. De øvrige er Quality Controls udvidelse af listen.
const FORBUDTE = [
  'fortjent', 'undertjent', 'burde have vundet', 'skulle have vundet',
  'var bedst', 'spillede bedst', 'heldig', 'uheldig', 'tyveri', 'røvet', 'snydt',
];

const TEAMS = [
  { name: 'AGF', short: 'AGF', elo: 1500 },
  { name: 'OB', short: 'OB', elo: 1480 },
];
const kamp = (id, home, away, hg, ag, xh, xa) => ({
  id, round: 1, home, away, kickoff: 1000 + id,
  result: hg > ag ? '1' : (hg < ag ? '2' : 'X'),
  homeGoals: hg, awayGoals: ag, xgHome: xh, xgAway: xa,
});

const visHold = (matches) => render(
  <MemoryRouter initialEntries={['/spil/sl?fane=elo&hold=AGF']}>
    <Routes>
      <Route
        path="/spil/:gameId"
        element={<HoldSide game={{ id: 'sl', type: 'football', teams: TEAMS }} matches={matches} short="AGF" />}
      />
    </Routes>
  </MemoryRouter>,
);

describe('holdsidens kort: Mål og målchancer', () => {
  it('viser begge sider af regnskabet', () => {
    visHold([kamp(1, 'AGF', 'OB', 2, 0, 1.4, 0.7), kamp(2, 'OB', 'AGF', 1, 3, 0.9, 2.2)]);
    expect(screen.getByText(/Mål og målchancer/)).toBeInTheDocument();
    expect(screen.getByText('Scoret')).toBeInTheDocument();
    expect(screen.getByText('Lukket ind')).toBeInTheDocument();
  });

  it('siger at BEGGE kolonner dækker samme kampe — og hvor mange', () => {
    visHold([kamp(1, 'AGF', 'OB', 2, 0, 1.4, 0.7), kamp(2, 'OB', 'AGF', 1, 3, 0.9, 2.2)]);
    expect(screen.getByText(/Begge kolonner dækker de samme 2 kampe/)).toBeInTheDocument();
  });

  it('siger det HØJT, når nogle spillede kampe mangler målchancer', () => {
    // Uden den sætning ser et manglende tal ud som en overpræstation.
    visHold([
      kamp(1, 'AGF', 'OB', 2, 0, 1.4, 0.7),
      kamp(2, 'OB', 'AGF', 0, 4, null, null),
    ]);
    expect(screen.getByText(/holdet har spillet 2 kampe/)).toBeInTheDocument();
  });

  it('forbeholdet står IKKE, når alle spillede kampe har målchancer', () => {
    // Fraværs-siden af den sætning. Uden denne kunne betingelsen hardkodes til
    // true, og kortet ville altid undskylde for data, der ikke mangler.
    visHold([kamp(1, 'AGF', 'OB', 2, 0, 1.4, 0.7), kamp(2, 'OB', 'AGF', 1, 3, 0.9, 2.2)]);
    expect(screen.queryByText(/holdet har spillet/)).toBeNull();
  });

  it('kortet SKJULES helt, når ingen kamp har målchancer', () => {
    visHold([kamp(1, 'AGF', 'OB', 2, 0, null, null)]);
    expect(screen.queryByText(/Mål og målchancer/)).toBeNull();
    // Og der står ingen nuller i stedet.
    expect(screen.queryByText('Scoret')).toBeNull();
  });

  it('ÉT datapunkt er nok — kortet må ikke være skjult for et nystartet spil', () => {
    visHold([kamp(1, 'AGF', 'OB', 1, 1, 0.8, 1.9)]);
    expect(screen.getByText(/Mål og målchancer/)).toBeInTheDocument();
    expect(screen.getByText(/Begge kolonner dækker de samme 1 kamp/)).toBeInTheDocument();
  });

  it('viser differensen pr. kamp med fortegn — samme tal som hold-listen', () => {
    // Quality Controls B4: holdsiden forbød engang differensen, mens dens egen
    // nabo ("Mod modellens forventning") viste én. Nu viser begge flader den,
    // og de skal vise DET SAMME. 2+3 mål mod 1,4+2,2 xG over 2 kampe = +0,70.
    visHold([kamp(1, 'AGF', 'OB', 2, 0, 1.4, 0.7), kamp(2, 'OB', 'AGF', 1, 3, 0.9, 2.2)]);
    expect(screen.getByText('+0,70')).toBeInTheDocument();
  });

  it('bruger ægte minus-tegn på en negativ differens', () => {
    visHold([kamp(1, 'AGF', 'OB', 0, 0, 2.0, 0.5), kamp(2, 'AGF', 'OB', 0, 0, 2.0, 0.5)]);
    const celle = screen.getByText(/^−2,00$/);
    expect(celle).toBeInTheDocument();
    expect(celle.textContent).not.toContain('-');
  });

  it('fælder INGEN dom — ingen af de forbudte ord står på siden', () => {
    visHold([kamp(1, 'AGF', 'OB', 4, 0, 0.3, 2.8)]); // groft "heldig" resultat
    const tekst = document.body.textContent.toLowerCase();
    for (const ord of FORBUDTE) {
      expect(tekst, `"${ord}" står på holdsiden`).not.toContain(ord);
    }
  });
});

describe('hold-listen ved Elo-tabellen', () => {
  // Fire hold à mindst tre kampe med målchancer — under enten gulvet eller
  // hold-tallet forsvinder listen helt, og så tester resten af blokken intet.
  const HOLD = ['AGF', 'OB', 'FCK', 'BIF'].map((name) => ({ name, short: name, elo: 1500 }));
  const serie = (home, n, opt) => Array.from({ length: n }, (_, i) => ({
    id: `${home}-${i}`, round: i + 1, home, away: 'Z', kickoff: 1000 + i,
    result: '1', homeGoals: opt.hg, awayGoals: 0, xgHome: opt.xh, xgAway: 1,
  }));
  const BASIS = [
    ...serie('AGF', 3, { hg: 6, xh: 1 }),   // +5 mål over 3 kampe → +1,67 pr. kamp
    ...serie('OB', 3, { hg: 0, xh: 2 }),    // −6 mål over 3 kampe → −2,00 pr. kamp
    ...serie('FCK', 3, { hg: 1, xh: 1 }),   //  0                  →  0,00
    ...serie('BIF', 3, { hg: 2, xh: 1 }),   // +3                  → +1,00
  ];
  const vis = (matches, teams = HOLD) => render(
    <MemoryRouter initialEntries={['/spil/sl?fane=elo']}>
      <Routes>
        <Route
          path="/spil/:gameId"
          element={<HoldXgListe game={{ id: 'sl', type: 'football', teams }} matches={matches} />}
        />
      </Routes>
    </MemoryRouter>,
  );

  it('viser holdene i rækkefølge efter forskellen pr. kamp', () => {
    vis(BASIS);
    const navne = [...document.querySelectorAll('tbody tr')]
      .map((tr) => tr.querySelector('td').textContent.trim());
    expect(navne).toEqual(['AGF', 'BIF', 'FCK', 'OB']);
  });

  it('viser fortegnet — og de tre tal, det kan efterregnes af', () => {
    // Reglen kortet står på: et afledt tal må have fortegn, når begge
    // bestanddele og grundlaget (n) står ved siden af. Assertér på INDHOLDET,
    // ikke bare på at rækken blev vist.
    vis(BASIS);
    const agf = [...document.querySelectorAll('tbody tr')]
      .find((tr) => tr.textContent.includes('AGF'));
    const celler = [...agf.querySelectorAll('td')].map((td) => td.textContent.trim());
    expect(celler[1]).toBe('3');       // kampe
    expect(celler[2]).toBe('18');      // mål
    expect(celler[3]).toBe('3,0');     // målchancer
    expect(celler[4]).toBe('+5,00');   // (18 − 3) / 3
  });

  it('bruger ægte minus-tegn, ikke bindestreg, på et negativt tal', () => {
    vis(BASIS);
    const ob = [...document.querySelectorAll('tbody tr')]
      .find((tr) => tr.textContent.includes('OB'));
    const sidste = [...ob.querySelectorAll('td')].pop().textContent.trim();
    expect(sidste).toBe('−2,00');
    expect(sidste).not.toContain('-');
  });

  it('giver ALDRIG et tal farve — fortegnet er dommen nok', () => {
    // Farven var det, reglen forbød. En grøn/rød kolonne siger "godt"/"skidt"
    // om et tal, der er uenigt med facit i mere end hver tredje kamp.
    vis(BASIS);
    for (const td of document.querySelectorAll('tbody td')) {
      expect(td.className).not.toMatch(/green|red|badge--/);
      expect(td.getAttribute('style') || '').not.toMatch(/color/);
    }
  });

  it('siger HVORFOR der sorteres pr. kamp, og hvad gulvet er', () => {
    vis(BASIS);
    const tekst = document.body.textContent;
    expect(tekst).toMatch(/pr\. kamp/i);
    expect(tekst).toMatch(/mindst tre kampe/i);
    // Grunden, ikke bare valget: en sum ville sætte holdet med mindst data yderst.
    expect(tekst).toMatch(/sum ville sætte holdet med mindst data yderst/i);
  });

  it('siger ALDRIG "sæsonen" — PL-spillet er runde 1-18 af 38', () => {
    // Quality Controls B5. Ordet er sandt for Superligaen og usandt for
    // Premier League, og fladen er den samme.
    vis(BASIS);
    expect(document.body.textContent.toLowerCase()).not.toMatch(/sæsonen|sæsonens/);
    expect(document.body.textContent).toMatch(/i dette spil/i);
  });

  it('forkorter ALDRIG "Målchancer" til "Chancer" i en overskrift', () => {
    vis(BASIS);
    const th = [...document.querySelectorAll('th')].map((e) => e.textContent.trim());
    expect(th).toContain('Målchancer');
    expect(th).not.toContain('Chancer');
  });

  it('et hold under gulvet er VÆK — ikke med på 0,0', () => {
    const tynd = { name: 'Tynd', short: 'TYN', elo: 1500 };
    vis([...BASIS, ...serie('Tynd', 2, { hg: 1, xh: 1 })], [...HOLD, tynd]);
    expect(screen.queryByText('Tynd')).toBeNull();
    expect(document.querySelectorAll('tbody tr')).toHaveLength(4);
  });

  it('hele kortet er VÆK, når færre end fire hold har grundlag', () => {
    // Målt tilstand for Premier League i dag: højst 2 kampe pr. hold.
    vis(serie('AGF', 3, { hg: 2, xh: 1 }));
    expect(screen.queryByText(/Mål og målchancer/)).toBeNull();
  });

  it('fælder INGEN dom — ingen af de forbudte ord står i listen', () => {
    // Quality Controls B8: sprogreglen dækkede kun HoldSide og guiden, og en
    // tredje flade med de samme tal stod uden for testen.
    vis([...serie('AGF', 3, { hg: 9, xh: 0.5 }), ...BASIS.slice(3)]);
    const tekst = document.body.textContent.toLowerCase();
    for (const ord of FORBUDTE) {
      expect(tekst, `"${ord}" står i hold-listen`).not.toContain(ord);
    }
  });
});

describe('guidens afsnit om målchancer', () => {
  const guide = (game) => render(
    <MemoryRouter initialEntries={['/spil/sl?fane=hjaelp']}>
      <Routes><Route path="/spil/:gameId" element={<FootballHelp game={game} />} /></Routes>
    </MemoryRouter>,
  );
  const medKilde = { id: 'sl', type: 'football', sync: { provider: 'superliga' } };

  it('forklarer hvad tallet ER, og hvad det IKKE er', () => {
    guide(medKilde);
    const afsnit = screen.getByText(/Målchancer \(xG\)/).closest('section, div');
    expect(afsnit.textContent).toMatch(/hvor gode chancer hvert hold skabte/i);
    expect(afsnit.textContent).toMatch(/ikke et bud på, hvem der burde have vundet/i);
  });

  it('siger hvor ofte tallet er uenigt — og DATERER påstanden', () => {
    // En brøk uden dato ældes til en løgn: scriptet siger selv ±15
    // procentpoint og "citér som retning, ikke som en rate". Et MÅLT tal med
    // dato kan ikke blive falsk, kun gammelt — og læseren kan se hvor gammelt.
    guide(medKilde);
    const afsnit = screen.getByText(/Målchancer \(xG\)/).closest('section, div');
    expect(afsnit.textContent).toMatch(/mere end hver tredje/i);
    expect(afsnit.textContent).toMatch(/målt 30\. august 2026 på 37 kampe/i);
    expect(afsnit.textContent).toMatch(/tallet flytter sig/i);
    // Den præcise brøk må IKKE stå alene — den er det, der ældes forkert.
    expect(afsnit.textContent).not.toMatch(/13 ud af 37 afgjorte kampe\./);
  });

  it('lover ALDRIG et nul for et manglende tal', () => {
    guide(medKilde);
    const afsnit = screen.getByText(/Målchancer \(xG\)/).closest('section, div');
    expect(afsnit.textContent).toMatch(/aldrig 0,0 for et tal, vi mangler/i);
  });

  it('peger på hold-listen under Elo-tabellen — og siger hvornår den dukker op', () => {
    // Guiden er en spejlet flade: viser vi tallet et nyt sted, skal guiden
    // sige hvor, ellers findes fladen kun for den, der falder over den.
    guide(medKilde);
    const afsnit = screen.getByText(/Målchancer \(xG\)/).closest('section, div');
    expect(afsnit.textContent).toMatch(/under elo-tabellen/i);
    expect(afsnit.textContent).toMatch(/sorteret efter forskellen pr\. kamp/i);
    // HVORFOR pr. kamp, ikke bare AT. Guiden bærer sin egen kopi af
    // begrundelsen, og den kunne fjernes ubemærket: fladens tilsvarende
    // assertion kigger kun på kortets DOM, aldrig på guiden. Test Managers
    // fund — mutationen "fjern begrundelsen fra guiden" overlevede.
    expect(afsnit.textContent).toMatch(/mindst data yderst/i);
    // Betingelsen for at listen findes — ellers leder læseren efter en flade,
    // spillet ikke har endnu.
    expect(afsnit.textContent).toMatch(/mindst fire hold har tre kampe/i);
  });

  it('siger ALDRIG "over sæsonen" om holdsidens tal', () => {
    // PL-spillet er runde 1-18 af 38. Ordet var der, og det var usandt for
    // halvdelen af spillerne.
    guide(medKilde);
    const afsnit = screen.getByText(/Målchancer \(xG\)/).closest('section, div');
    expect(afsnit.textContent).not.toMatch(/over sæsonen/i);
    expect(afsnit.textContent).toMatch(/mål og målchancer i dette spil/i);
  });

  it('afsnittet er VÆK i et spil, hvis kilde ikke kan levere målchancer', () => {
    // Guiden er en regelbog for ÉT spil. Den må ikke forklare et tal, spillet
    // aldrig får — gaten er spil-bred, ikke pr. kamp.
    guide({ id: 'x', type: 'football', sync: { provider: 'ukendt' } });
    expect(screen.queryByText(/Målchancer \(xG\)/)).toBeNull();
  });
});
