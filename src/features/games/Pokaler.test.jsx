import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Pokaler, { navneAf } from './Pokaler';

const kamp = (round, result) => ({ round, result });
const KAMPE = [
  kamp(1, '1'), kamp(1, 'X'),
  kamp(2, '1'), kamp(2, '2'),
  kamp(3, '1'), kamp(3, null),   // runde 3 er IKKE færdig
];

const r = (uid, name, perRound, chance) => ({
  uid, name, perRound, opdeling: chance == null ? undefined : { chance },
});

const vis = (props = {}) => render(
  <Pokaler rows={[]} matches={KAMPE} startRunde={null} {...props} />,
);

describe('Rundekongen', () => {
  it('kårer den med flest vundne runder og bøjer ental korrekt', () => {
    vis({
      rows: [
        r('a', 'Anne', { 1: 10, 2: 3 }),
        r('b', 'Bo', { 1: 4, 2: 12 }),
      ],
    });
    // Begge har én — så deles den. Ental skal stå i ental.
    expect(screen.getByText(/Anne, Bo/)).toBeInTheDocument();
    expect(screen.getByText(/1 rundesejr\b/)).toBeInTheDocument();
    expect(screen.getByText(/\(delt\)/)).toBeInTheDocument();
  });

  it('viser ÉN vinder uden "delt", når han står alene', () => {
    vis({
      rows: [
        r('a', 'Anne', { 1: 10, 2: 12 }),
        r('b', 'Bo', { 1: 4, 2: 3 }),
      ],
    });
    expect(screen.getByText(/Anne/)).toBeInTheDocument();
    expect(screen.getByText(/2 rundesejre/)).toBeInTheDocument();
    expect(screen.queryByText(/\(delt\)/)).not.toBeInTheDocument();
  });

  it('venter på den UDSATTE kamp — runde 3 kåres ikke', () => {
    // Runde 3 har en kamp uden facit. Uden den regel ville kongen skifte,
    // hver gang en enkelt kamp faldt.
    vis({ rows: [r('a', 'Anne', { 3: 99 })] });
    expect(screen.getByText(/Ingen har vundet en runde endnu/)).toBeInTheDocument();
  });

  it('skelner "ingen runder spillet" fra "ingen har vundet"', () => {
    const { unmount } = vis({ rows: [r('a', 'Anne', { 1: 5 })], matches: [kamp(1, null)] });
    expect(screen.getByText(/Ingen runder er spillet færdig endnu/)).toBeInTheDocument();
    unmount();
    vis({ rows: [r('a', 'Anne', { 1: -5 })] });
    expect(screen.getByText(/Ingen har vundet en runde endnu/)).toBeInTheDocument();
  });

  it('mærker kortet med ligaens startrunde, når den har én', () => {
    vis({ rows: [r('a', 'Anne', { 1: 10, 2: 12 })], startRunde: 2 });
    expect(screen.getByText(/fra runde 2/)).toBeInTheDocument();
    // Kun runde 2 tæller — ikke runde 1.
    expect(screen.getByText(/1 rundesejr\b/)).toBeInTheDocument();
  });

  it('mærker IKKE kortet, når hele spillet vises', () => {
    vis({ rows: [r('a', 'Anne', { 1: 10 })] });
    expect(screen.queryByText(/fra runde/)).not.toBeInTheDocument();
  });
});

describe('Chance-kongen', () => {
  it('hedder Chance-kongen og ikke Chancen', () => {
    // Opdelings-tabellen på samme fane har allerede en rubrik "Chancen".
    // To ting med samme navn på én skærm er tvetydige.
    vis({ rows: [r('a', 'Anne', { 1: 5 }, 12.5)] });
    expect(screen.getByText(/Chance-kongen/)).toBeInTheDocument();
  });

  it('viser bedst og modigst-i-minus med fortegn', () => {
    vis({
      rows: [
        r('a', 'Anne', { 1: 5 }, 12.5),
        r('b', 'Bo', { 1: 3 }, -31.5),
        r('c', 'Cai', { 1: 1 }, 2),
      ],
    });
    // Anne står i BEGGE kort (hun vandt også runder), så der scopes til
    // Chance-kortet — ellers måler testen på det forkerte trofæ.
    // Bind hvert navn til SIN label. Assertede man kun på kortets samlede
    // tekst, kunne sorteringen vendes, så bedst og værst byttede plads, uden
    // at noget blev rødt — samme klasse fejl som kolonne-ombytningen i det
    // indbyrdes opgør.
    const bedstLinje = screen.getByText(/Bedst:/).closest('p');
    const vaerstLinje = screen.getByText(/Modigst i minus/).closest('p');
    expect(bedstLinje.textContent).toContain('Anne');
    expect(bedstLinje.textContent).toContain('+12,5');
    expect(vaerstLinje.textContent).toContain('Bo');
    expect(vaerstLinje.textContent).toContain('\u221231,5');
    expect(bedstLinje.textContent).not.toContain('Bo');
    expect(vaerstLinje.textContent).not.toContain('Anne');

    const kort = screen.getByText(/Chance-kongen/).closest('.card');
    // Tallene står som tekstnoder ved siden af <strong>, så der assertes på
    // kortets samlede tekst. Fortegnet er pointen: uden det ligner et tab en
    // gevinst — samme grund som i opdelings-tabellen.
    expect(kort.textContent).toContain('Anne');
    expect(kort.textContent).toContain('+12,5');
    // ÆGTE minus-tegn (U+2212), ikke en bindestreg: det er dét, fmtSignedPoints
    // findes for, og en test med bindestreg ville stå grøn på et kort, der
    // holdt op med at bruge den.
    expect(kort.textContent).toContain('\u221231,5');
    expect(kort.textContent).not.toContain('-31,5');
    // Cai er hverken bedst eller værst og skal ikke stå der.
    expect(kort.textContent).not.toContain('Cai');
  });

  it('viser ikke "modigst i minus", når det er den samme spiller', () => {
    vis({ rows: [r('a', 'Anne', { 1: 5 }, 4)] });
    expect(screen.queryByText(/Modigst i minus/)).not.toBeInTheDocument();
  });

  it('tæller kun dem, der FAKTISK har brugt Chancen', () => {
    // En saldo på 0 kan både betyde "aldrig turdet" og "gik lige op". De to
    // skal ikke stå side om side, som var de det samme.
    vis({ rows: [r('a', 'Anne', { 1: 5 }, 0), r('b', 'Bo', { 1: 3 }, undefined)] });
    expect(screen.getByText(/Ingen har brugt Chancen endnu/)).toBeInTheDocument();
  });

  it('SKRIVER "hele sæsonen" i overskriften under et liga-filter med startrunde', () => {
    // Det afgørende: rundesejre kan afgrænses til ligaen, men opdeling.chance
    // er spil-scoped. Hænges én person op som "bedst" uden at skalaen står i
    // selve labelen, tror man, trofæet er ligaens. En grå fodnote er ikke nok.
    vis({ rows: [r('a', 'Anne', { 2: 5 }, 12.5)], startRunde: 2 });
    expect(screen.getByText(/hele sæsonen/)).toBeInTheDocument();
  });

  it('skriver det IKKE, når begge pokaler er på samme skala', () => {
    vis({ rows: [r('a', 'Anne', { 1: 5 }, 12.5)] });
    expect(screen.queryByText(/hele sæsonen/)).not.toBeInTheDocument();
  });
});

describe('tomme tilstande', () => {
  it('viser begge kort med ord i stedet for tomme felter', () => {
    const { container } = vis({ rows: [] });
    expect(screen.getByText(/Rundekongen/)).toBeInTheDocument();
    expect(screen.getByText(/Chance-kongen/)).toBeInTheDocument();
    expect(container.querySelectorAll('.card')).toHaveLength(2);
  });

  it('kaster ikke på spillere uden rundevektor eller opdeling', () => {
    expect(() => vis({ rows: [{ uid: 'x', name: 'X' }, { uid: 'y' }] })).not.toThrow();
  });

  it('viser ALDRIG en procent', () => {
    // Samme regel som det indbyrdes opgør: mål valg, ikke evne.
    const { container } = vis({
      rows: [r('a', 'Anne', { 1: 10, 2: 12 }, 12.5), r('b', 'Bo', { 1: 4 }, -3)],
    });
    expect(container.textContent).not.toMatch(/%/);
  });

describe('modigst i minus', () => {
  it('vises IKKE, når ingen faktisk er i minus', () => {
    // QC beviste fejlen ved at rendere den: `vaerst` var bare feltets laveste
    // tal, så kortet skrev "Modigst i minus: Bo +3" og modsagde sig selv.
    // Helt almindeligt tidligt på sæsonen, hvor alle har tjent på Chancen.
    const { container } = vis({
      rows: [r('a', 'Anne', { 1: 5 }, 12.5), r('b', 'Bo', { 1: 3 }, 3)],
    });
    expect(screen.queryByText(/Modigst i minus/)).not.toBeInTheDocument();
    expect(container.textContent).toContain('Anne');
    // Og især: der må ikke stå et PLUS-tal under en minus-overskrift.
    expect(container.textContent).not.toMatch(/Modigst i minus[^]*\+/);
  });

  it('vises, så snart ÉN er i minus', () => {
    vis({ rows: [r('a', 'Anne', { 1: 5 }, 12.5), r('b', 'Bo', { 1: 3 }, -0.5)] });
    const linje = screen.getByText(/Modigst i minus/).closest('p');
    expect(linje.textContent).toContain('Bo');
    expect(linje.textContent).toContain('\u22120,5');
  });

  it('vises ikke, når den eneste med Chancen selv er bedst OG i minus', () => {
    // Én spiller kan ikke være både bedst og modigst — han står ét sted.
    vis({ rows: [r('a', 'Anne', { 1: 5 }, -4)] });
    expect(screen.queryByText(/Modigst i minus/)).not.toBeInTheDocument();
    expect(screen.getByText(/Bedst:/).closest('p').textContent).toContain('Anne');
  });
});

describe('navneAf', () => {
  it('sammenføjer delte vindere med komma', () => {
    const rows = [{ uid: 'a', name: 'Anne' }, { uid: 'b', name: 'Bo' }];
    expect(navneAf(rows, ['a', 'b'])).toBe('Anne, Bo');
  });

  it('falder tilbage på uid frem for at rendere ingenting', () => {
    // Kan ikke nås gennem komponenten (vinderne kommer fra samme rows), men
    // koden findes, og et manglende navn ville give " — 3 rundesejre" uden en
    // vinder. Derfor bevist her frem for at stå utestet.
    expect(navneAf([{ uid: 'a', name: 'Anne' }], ['a', 'ukendt'])).toBe('Anne, ukendt');
    expect(navneAf([], ['x'])).toBe('x');
    expect(navneAf(null, null)).toBe('');
  });
});
});
