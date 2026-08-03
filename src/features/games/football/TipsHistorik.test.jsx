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
