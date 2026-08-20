/**
 * Tests for FootballTable — at holdets FARVER når fra data til badge, og at
 * visningen følger SPILLET: pulje-spil deles i mesterskabs-/nedrykningsspil,
 * spil uden pulje får én flad tabel uden Superliga-begreber.
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
import FootballTable from './FootballTable';
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

describe('FootballTable — farven når fra holdlisten til badgen', () => {
  // Bærende test. Den dør, hvis `color`-proppen fjernes, hvis holdlistens
  // værdi ændres, eller hvis ClubBadge holder op med at male kroppen.
  it('tegner Silkeborgs røde, som den står i holdlisten', () => {
    const { container } = render(<FootballTable game={spil(['Silkeborg IF'])} />);
    expect(fyld(container)).toContain('#CA202C');
  });

  // ET STRIBET HOLD SKAL BÆRE BEGGE FARVER. Det er den her, der dræber
  // mutationen "fjern color2 og moenster": uden dem tegnes kun kroppen.
  it('tegner OB med BÅDE sin blå krop og sine hvide striber', () => {
    const { container } = render(<FootballTable game={spil(['OB'])} />);
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
    const { container } = render(<FootballTable game={spil(['Lyngby Boldklub'])} />);
    expect(fyld(container)).toContain('#022592');
    expect(container.querySelectorAll('rect').length).toBe(0);
  });

  // To hold på samme tabel må ikke dele klipsti — så mister den ene sit
  // mønster. Fejlen ville kun vise sig med mere end ét stribet hold på skærmen.
  it('giver hvert hold sin egen klipsti', () => {
    const { container } = render(
      <FootballTable game={spil(['OB', 'AC Horsens', 'Sønderjyske Fodbold'])} />,
    );
    const ider = [...container.querySelectorAll('clipPath')].map((c) => c.id);
    expect(ider.length).toBe(3);
    expect(new Set(ider).size).toBe(3);
  });

  it('viser holdets navn og kortkode ved siden af badgen', () => {
    const { container } = render(<FootballTable game={spil(['F.C. København'])} />);
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
    const { container } = render(<FootballTable game={game} />);
    expect(container.textContent).toContain('FC Ukendt');
  });
});

// Visningen skal følge SPILLET. Fanen blev set i produktion i Premier
// League-spillet med "hentes fra Superligaen" og ville med data have delt
// tabellen i mesterskabs-/nedrykningsspil, som ikke findes i England.
describe('FootballTable — visningen følger spillet', () => {
  const plHold = Array.from({ length: 20 }, (_, i) => `Klub ${i + 1}`);
  const plSpil = {
    sync: { provider: 'pulselive' },
    standings: plHold.map((n, i) => ({ ...raekke(n, i + 1), teamName: n, teamShortName: undefined })),
  };
  const slSpil = { ...spil(['OB', 'AGF']), pulje: { poolSize: 6 }, sync: { provider: 'superliga' } };

  it('deler pulje-spillet i mesterskabs- og nedrykningsspil', () => {
    const { container } = render(<FootballTable game={slSpil} />);
    expect(container.textContent).toContain('Mesterskabsspil (top 6)');
    expect(container.textContent).toContain('Nedrykningsspil (bund 6)');
    expect(container.textContent).toContain('Superligaen — grundspil');
  });

  // Kernen i rettelsen: PL-varianten må IKKE indeholde et eneste
  // Superliga-begreb. En test, der kun tjekker den nye tekst, fanger ikke en
  // halv rettelse (jf. TroejeOversigt-præcedensen).
  it('viser spil uden pulje som én flad tabel uden Superliga-begreber', () => {
    const { container } = render(<FootballTable game={plSpil} />);
    expect(container.textContent).not.toContain('Superliga');
    expect(container.textContent).not.toContain('Mesterskabsspil');
    expect(container.textContent).not.toContain('pulje');
    expect(container.textContent).toContain('Officiel stilling');
  });

  // QC-fund på #8-planen: PL-PULJEN må ikke flippe Tabel-fanen. Delingen
  // styres af tabelDeling (liga-FORMATET), ikke af at spillet har en pulje —
  // ellers ville 16 hold stå under "Nedrykningsspil", og den rigtige bund-3-
  // streg forsvinde, i samme sekund puljen blev tændt.
  it('PL MED pulje (tabelDeling: false) er stadig én flad tabel med bund-3-streg', () => {
    const medPulje = {
      ...plSpil,
      pulje: { poolSize: 4, nedSize: 3, facitKilde: 'egneKampe', tabelDeling: false },
    };
    const { container } = render(<FootballTable game={medPulje} />);
    expect(container.textContent).not.toContain('Mesterskabsspil');
    expect(container.textContent).not.toContain('Nedrykningsspil');
    expect(container.textContent).toContain('Nedrykning (bund 3)');
  });

  // …og Superligaens LITERALE {poolSize: 6} normaliseres til deling — det er
  // båndet, der holder SL-adfærden fast, mens gaten er flyttet til konfig.
  it('SL-formen {poolSize: 6} deler stadig (tabelDeling-default)', () => {
    const { container } = render(<FootballTable game={slSpil} />);
    expect(container.textContent).toContain('Mesterskabsspil (top 6)');
  });

  it('sætter nedrykningsstregen før de nederste 3 — regnet fra bunden', () => {
    const { container } = render(<FootballTable game={plSpil} />);
    expect(container.textContent).toContain('Nedrykning (bund 3)');
    // Stregen skal stå EFTER nr. 17: præcis de tre sidste rækker under den.
    const rows = [...container.querySelectorAll('tbody tr')];
    const streg = rows.findIndex((r) => r.textContent.includes('Nedrykning'));
    expect(streg).toBe(17);
    expect(rows.length).toBe(21); // 20 hold + stregen
  });

  // MODPRØVEN på "regnet fra bunden": med 20 hold er `length - 3` og et
  // hardcodet 17 uskelnelige — mutationen overlevede netop derfor. 10 hold
  // skiller dem: stregen skal stå efter nr. 7, aldrig ved 17.
  it('regner stregen fra bunden, ikke fra rank 17 — 10 hold får stregen efter nr. 7', () => {
    const ti = { ...plSpil, standings: plSpil.standings.slice(0, 10) };
    const { container } = render(<FootballTable game={ti} />);
    const rows = [...container.querySelectorAll('tbody tr')];
    expect(rows.findIndex((r) => r.textContent.includes('Nedrykning'))).toBe(7);
    expect(rows.length).toBe(11); // 10 hold + stregen
  });

  // En halv-synket tabel må ikke vise alle hold som nedrykkere.
  it('tegner ingen nedrykningsstreg, når tabellen har 3 hold eller færre', () => {
    const lille = { ...plSpil, standings: plSpil.standings.slice(0, 2) };
    const { container } = render(<FootballTable game={lille} />);
    expect(container.textContent).not.toContain('Nedrykning');
    expect(container.querySelectorAll('tbody tr').length).toBe(2);
  });
});

// Tomtilstanden må ikke love automatik, der ikke findes: PL har ingen synk
// endnu, så "hentes så snart sæsonen er i gang" ville være usand dér.
describe('FootballTable — tom tilstand og kildelinje', () => {
  it('er liga-neutral og ærlig uden standings', () => {
    const { container } = render(<FootballTable game={{ sync: { provider: 'pulselive' } }} />);
    expect(container.textContent).toContain('Stillingen er ikke klar endnu.');
    expect(container.textContent).toContain('vises her, når den er hentet');
    expect(container.textContent).not.toContain('Superligaen');
    expect(container.textContent).not.toContain('så snart sæsonen er i gang');
  });

  it('viser kilden pr. provider — og udelader linjen for en ukendt', () => {
    const base = { ...spil(['OB']), standingsSyncedAt: { seconds: 1 } };
    const sl = render(<FootballTable game={{ ...base, sync: { provider: 'superliga' } }} />);
    expect(sl.container.textContent).toContain('Kilde: api.superliga.dk');
    const pl = render(<FootballTable game={{ ...base, sync: { provider: 'pulselive' } }} />);
    expect(pl.container.textContent).toContain('Kilde: premierleague.com');
    // Ukendt provider: en gættet kilde er værre end ingen.
    const ukendt = render(<FootballTable game={{ ...base, sync: { provider: 'andet' } }} />);
    expect(ukendt.container.textContent).not.toContain('Kilde:');
  });
});
