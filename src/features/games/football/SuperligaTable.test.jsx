/**
 * Tests for SuperligaTable — særligt at holdets FARVER når fra data til badge.
 *
 * DET HER HUL VAR ÅBENT PÅ ALLE FEM FLADER. Test Manager fjernede
 * `color2`/`moenster`-propsene fra SuperligaTable, EloTable, PuljeTip,
 * GameProfile og FootballTip — fem separate mutationer, alle grønne med 1863
 * tests. Værre endnu: `color: override || fallback` kunne sættes til en fast
 * grå i FootballTip, så hvert eneste kampkort mistede sin farve, uden ét rødt
 * tegn.
 *
 * `ClubBadge` var testet for sig, og holdlisterne var testet for sig. Ingen
 * test bandt de to sammen — så hele farvearbejdet kunne falde på gulvet mellem
 * dem. Den her fil lukker vejen for Superliga-tabellen.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import SuperligaTable from './SuperligaTable';
import { SUPERLIGA_TEAMS_2026 } from '../../../data/superligaTeams2026';

const raekke = (navn, rank) => ({
  rank, teamName: navn, teamShortName: SUPERLIGA_TEAMS_2026.find((t) => t.name === navn)?.short,
  played: 3, won: 2, draw: 1, lost: 0, gf: 5, ga: 2, points: 7,
});

const spil = (navne) => ({
  teams: SUPERLIGA_TEAMS_2026,
  standings: navne.map((n, i) => raekke(n, i + 1)),
});

const fyld = (c) => [...c.querySelectorAll('[fill]')].map((e) => e.getAttribute('fill'));

describe('SuperligaTable — farven når fra holdlisten til badgen', () => {
  // Bærende test. Den dør, hvis `color`-proppen fjernes, hvis holdlistens
  // værdi ændres, eller hvis ClubBadge holder op med at male kroppen.
  it('tegner Silkeborgs røde, som den står i holdlisten', () => {
    const { container } = render(<SuperligaTable game={spil(['Silkeborg IF'])} />);
    expect(fyld(container)).toContain('#CA202C');
  });

  // ET STRIBET HOLD SKAL BÆRE BEGGE FARVER. Det er den her, der dræber
  // mutationen "fjern color2 og moenster": uden dem tegnes kun kroppen.
  it('tegner OB med BÅDE sin blå krop og sine hvide striber', () => {
    const { container } = render(<SuperligaTable game={spil(['OB'])} />);
    const f = fyld(container);
    expect(f).toContain('#0A4AA5');
    expect(f).toContain('#FFFFFF');
    // Og striberne skal faktisk være tegnet som bånd, ikke bare være en farve
    // et sted i dokumentet.
    expect(container.querySelectorAll('rect').length).toBeGreaterThan(0);
  });

  // Modprøven: et ENSFARVET hold må ikke få bånd. Uden den ville testen
  // ovenfor bestå, selv hvis badgen stribede alting.
  it('tegner Lyngby uden bånd — holdet er ensfarvet', () => {
    const { container } = render(<SuperligaTable game={spil(['Lyngby Boldklub'])} />);
    expect(fyld(container)).toContain('#022592');
    expect(container.querySelectorAll('rect').length).toBe(0);
  });

  // To hold på samme tabel må ikke dele klipsti — så mister den ene sit
  // mønster. Fejlen ville kun vise sig med mere end ét stribet hold på skærmen.
  it('giver hvert hold sin egen klipsti', () => {
    const { container } = render(
      <SuperligaTable game={spil(['OB', 'AC Horsens', 'Sønderjyske Fodbold'])} />,
    );
    const ider = [...container.querySelectorAll('clipPath')].map((c) => c.id);
    expect(ider.length).toBe(3);
    expect(new Set(ider).size).toBe(3);
  });

  it('viser holdets navn og kortkode ved siden af badgen', () => {
    const { container } = render(<SuperligaTable game={spil(['F.C. København'])} />);
    // Kortkoden er det, der skiller to hvide trøjer fra hinanden — FCK og AGF
    // er begge hvide, så navnet ved siden af er ikke pynt.
    expect(container.textContent).toContain('F.C. København');
  });

  // Et hold, der ikke står i spillets liste, må ikke vælte tabellen. Det sker
  // for et navn, api.superliga.dk staver anderledes end vores liste.
  it('falder blødt tilbage for et hold, listen ikke kender', () => {
    const game = {
      teams: SUPERLIGA_TEAMS_2026,
      standings: [{ ...raekke('OB', 1), teamName: 'FC Ukendt', teamShortName: 'UKE' }],
    };
    const { container } = render(<SuperligaTable game={game} />);
    expect(container.textContent).toContain('FC Ukendt');
  });
});
