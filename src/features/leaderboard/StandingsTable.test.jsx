/**
 * Tests for StandingsTable-komponenten.
 * Bruger vi.mock til at isolere Firebase-afhængigheder.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import StandingsTable from './StandingsTable';

// Mock standingsUtils – vi tester komponentens adfærd, ikke utilities
vi.mock('./standingsUtils', async (importOriginal) => {
  const actual = await importOriginal();
  return actual; // Brug de rigtige utils i komponenten
});

const testUsers = [
  { uid: 'uid-1', displayName: 'Alice', totalPoints: 30 },
  { uid: 'uid-2', displayName: 'Bob', totalPoints: 50 },
  { uid: 'uid-3', displayName: 'Charlie', totalPoints: 20 },
  { uid: 'uid-4', displayName: 'Diana', totalPoints: 50 },
];

describe('StandingsTable', () => {
  it('sorterer brugere faldende efter point', () => {
    render(<StandingsTable users={testUsers} />);
    const rows = screen.getAllByRole('row').slice(1); // spring header over
    // Bob og Diana begge 50 point → first, derefter Alice (30), Charlie (20)
    expect(rows[0]).toHaveTextContent('50');
    expect(rows[1]).toHaveTextContent('50');
    const lastRow = rows[rows.length - 1];
    expect(lastRow).toHaveTextContent('20');
  });

  it('viser "dig"-badge for den indloggede bruger', () => {
    render(<StandingsTable users={testUsers} meUid="uid-1" />);
    expect(screen.getByText('dig')).toBeInTheDocument();
  });

  it('fremhæver den indloggede brugers række med is-me-klassen', () => {
    render(<StandingsTable users={testUsers} meUid="uid-1" />);
    const meRow = screen.getByText('Alice').closest('tr');
    expect(meRow).toHaveClass('is-me');
  });

  it('viser Etaper/Bonus/Total-kolonner med showBreakdown', () => {
    const users = [{ uid: 'u', displayName: 'Eva', stagePoints: 22, bonusPoints: 7, totalPoints: 29 }];
    render(<StandingsTable users={users} showBreakdown />);
    expect(screen.getByText('Etaper')).toBeInTheDocument();
    expect(screen.getByText('Bonus')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    const row = screen.getByText('Eva').closest('tr');
    expect(row).toHaveTextContent('22'); // etape-point
    expect(row).toHaveTextContent('7');  // bonus
    expect(row).toHaveTextContent('29'); // total
  });

  it('getBreakdown overstyrer standard-opdelingen (fx liga-scoring)', () => {
    const users = [{ uid: 'u', displayName: 'Eva', stagePoints: 22, bonusPoints: 7 }];
    render(
      <StandingsTable
        users={users}
        showBreakdown
        getPoints={() => 90}
        getBreakdown={() => ({ stage: 80, bonus: 10 })}
      />,
    );
    const row = screen.getByText('Eva').closest('tr');
    expect(row).toHaveTextContent('80'); // etaper fra override
    expect(row).toHaveTextContent('10'); // bonus fra override
    expect(row).toHaveTextContent('90'); // total fra getPoints
  });

  it('andre rækker har IKKE is-me-klassen', () => {
    render(<StandingsTable users={testUsers} meUid="uid-1" />);
    const bobRow = screen.getByText('Bob').closest('tr');
    expect(bobRow).not.toHaveClass('is-me');
  });

  it('viser medaljer med DELT konkurrence-placering ved pointlighed', () => {
    render(<StandingsTable users={testUsers} />);
    // Bob og Diana deler 1.-pladsen (50 point) → TO guld, INGEN "Placering 2";
    // Alice (30) er derfor nr. 3 (bronze), Charlie (20) nr. 4.
    expect(screen.getAllByLabelText('Placering 1')).toHaveLength(2);
    expect(screen.queryByLabelText('Placering 2')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Placering 3')).toHaveTextContent('🥉');
    const charlieRow = screen.getByText('Charlie').closest('tr');
    expect(charlieRow).toHaveTextContent('4');
  });

  it('dag 0 (alle på 0 point): delt 1.-plads, INGEN medaljer, venlig besked', () => {
    const zeroUsers = testUsers.map((u) => ({ ...u, totalPoints: 0 }));
    render(<StandingsTable users={zeroUsers} />);
    // Ingen guld/sølv/bronze efter alfabetet før første etape…
    expect(screen.queryByLabelText('Placering 1')).not.toBeInTheDocument();
    expect(screen.getByText(/Alle står lige endnu/)).toBeInTheDocument();
    // …og alle rækker viser den delte placering "1".
    const rows = screen.getAllByRole('row').slice(1);
    for (const row of rows) expect(row).toHaveTextContent('1');
  });

  it('filtrerer til kun memberUids når angivet', () => {
    render(<StandingsTable users={testUsers} memberUids={['uid-1', 'uid-3']} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    expect(screen.queryByText('Diana')).not.toBeInTheDocument();
  });

  it('viser tom-tilstand når ingen spillere matcher filter', () => {
    render(
      <StandingsTable
        users={testUsers}
        memberUids={['uid-999']}
        emptyMsg="Ingen matcher."
      />
    );
    expect(screen.getByText('Ingen matcher.')).toBeInTheDocument();
  });

  it('viser spinner under loading', () => {
    render(<StandingsTable users={[]} loading />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('bruger getPoints-funktion til at hente daglige point', () => {
    const getPoints = (uid) => ({ 'uid-2': 15, 'uid-1': 5 }[uid] ?? 0);
    render(<StandingsTable users={testUsers} getPoints={getPoints} />);

    // Bob (15 pt) bør stå øverst
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('15');
  });

  it('viser alle spillere med totalPoints=0 når getPoints ikke er sat og ingen point', () => {
    const usersNoPts = testUsers.map((u) => ({ ...u, totalPoints: 0 }));
    render(<StandingsTable users={usersNoPts} />);
    const ptsCells = screen.getAllByText('0');
    expect(ptsCells.length).toBeGreaterThan(0);
  });

  it('viser standardtekst ved tom bruger-liste (ingen filter)', () => {
    render(<StandingsTable users={[]} emptyMsg="Ingen spillere." />);
    expect(screen.getByText('Ingen spillere.')).toBeInTheDocument();
  });

  it('viser standard emptyMsg hvis ingen angivet', () => {
    render(<StandingsTable users={[]} />);
    expect(screen.getByText('Ingen spillere at vise.')).toBeInTheDocument();
  });

  it('viser placeringstallet (ikke medalje) for rang 4+', () => {
    const manyUsers = [
      { uid: 'u1', displayName: 'Spiller1', totalPoints: 100 },
      { uid: 'u2', displayName: 'Spiller2', totalPoints: 90 },
      { uid: 'u3', displayName: 'Spiller3', totalPoints: 80 },
      { uid: 'u4', displayName: 'Spiller4', totalPoints: 70 },
    ];
    render(<StandingsTable users={manyUsers} />);
    // Rang 4 vises som tal
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('viser ikke "dig"-badge når meUid ikke matcher nogen bruger', () => {
    render(<StandingsTable users={testUsers} meUid="ukendt-uid" />);
    expect(screen.queryByText('dig')).not.toBeInTheDocument();
  });

  it('viser ikke "dig"-badge når meUid er null', () => {
    render(<StandingsTable users={testUsers} meUid={null} />);
    expect(screen.queryByText('dig')).not.toBeInTheDocument();
  });

  it('viser korrekt antal rækker uden filter', () => {
    render(<StandingsTable users={testUsers} />);
    const rows = screen.getAllByRole('row').slice(1); // spring header over
    expect(rows).toHaveLength(testUsers.length);
  });

  it('benytter getPoints fremfor totalPoints til sortering', () => {
    // Charlie (uid-3) har 20 totalPoints men 99 dagligpoints
    const getPoints = (uid) => (uid === 'uid-3' ? 99 : 0);
    render(<StandingsTable users={testUsers} getPoints={getPoints} />);
    const rows = screen.getAllByRole('row').slice(1);
    // Første række bør vise 99
    expect(rows[0]).toHaveTextContent('99');
    expect(rows[0]).toHaveTextContent('Charlie');
  });

  it('returnerer 0 fra getPoints for brugere uden daglige point', () => {
    const getPoints = vi.fn().mockReturnValue(0);
    render(<StandingsTable users={testUsers.slice(0, 2)} getPoints={getPoints} />);
    const ptsCells = screen.getAllByText('0');
    expect(ptsCells.length).toBeGreaterThan(0);
  });

  it('viser tabel-header med #, Spiller og Point', () => {
    render(<StandingsTable users={testUsers} />);
    expect(screen.getByText('#')).toBeInTheDocument();
    expect(screen.getByText('Spiller')).toBeInTheDocument();
    expect(screen.getByText('Point')).toBeInTheDocument();
  });

  it('viser "(ukendt)" for bruger uden displayName', () => {
    const usersUdenNavn = [{ uid: 'uid-x', totalPoints: 5 }];
    render(<StandingsTable users={usersUdenNavn} />);
    expect(screen.getByText('(ukendt)')).toBeInTheDocument();
  });
});
