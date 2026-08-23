import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import Pokaler from './Pokaler';

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
    const kort = screen.getByText(/Chance-kongen/).closest('.card');
    expect(within(kort).getByText(/Modigst i minus/)).toBeInTheDocument();
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
});
