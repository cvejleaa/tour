// Holdopslaget skal følge SPILLET, ikke en import.
//
// Fejlen, det her findes for: hele fladen slog op i den danske holdliste, uanset
// hvilket spil man så på. Med Premier League ved siden af ville hvert engelsk
// hold få `null` — ingen farve, ingen kortkode, intet stadion — og badgen ville
// falde tilbage på at udlede tre bogstaver af navnet. Den udledning giver
// "MAN" til BÅDE Manchester City og Manchester United, så to klubber ville stå
// med samme mærke i stillingen.
import { describe, it, expect } from 'vitest';
import { teamsOf, teamInfo, shortOf } from './teamInfo';
import { SUPERLIGA_TEAMS_2026 } from '../../../data/superligaTeams2026';
import { PREMIER_LEAGUE_TEAMS_2026 } from '../../../data/premierLeagueTeams2026';

describe('teamsOf', () => {
  it('bruger spillets egne hold', () => {
    // IKKE `toBe` mere: listen får `vis` lagt på, så det er en ny liste.
    // Til gengæld skal ALLE felter overleve — det var dét, identitets-
    // assertionen beskyttede — og opslaget skal cache, så to kald giver samme
    // objekt og ikke sender hver useMemo i gang forfra.
    const spil = { teams: PREMIER_LEAGUE_TEAMS_2026 };
    const ud = teamsOf(spil);
    expect(ud).toHaveLength(PREMIER_LEAGUE_TEAMS_2026.length);
    for (const [i, t] of PREMIER_LEAGUE_TEAMS_2026.entries()) {
      expect(ud[i]).toMatchObject(t);
    }
    expect(teamsOf(spil)).toBe(ud);
  });

  // Fallbacken er der for et spil, der endnu ikke er seedet. Den bevarer den
  // adfærd, fladen havde før — men den må ALDRIG vinde over spillets egne.
  it('falder tilbage på Superligaen, når spillet ingen hold har', () => {
    // Fallbacken får ogsaa `vis` lagt på, så den kan ikke sammenlignes med
    // `toBe`. Det, der betyder noget, er at det ER Superligaens hold.
    for (const spil of [{}, null, { teams: [] }, { teams: 'ikke en liste' }]) {
      const ud = teamsOf(spil);
      expect(ud.map((t) => t.name)).toEqual(SUPERLIGA_TEAMS_2026.map((t) => t.name));
      expect(ud[0]).toMatchObject(SUPERLIGA_TEAMS_2026[0]);
    }
  });
});

describe('teamInfo', () => {
  it('finder holdet i den liste, det bliver givet', () => {
    const pl = teamInfo(PREMIER_LEAGUE_TEAMS_2026, 'Arsenal');
    expect(pl.short).toBe('ARS');
    expect(pl.venue).toBe('Emirates Stadium');
  });

  // DEN EGENTLIGE PRØVE. Slår opslaget i den forkerte liste, får holdet null —
  // og det var præcis, hvad hele fladen gjorde før.
  it('finder ikke et engelsk hold i den danske liste, og omvendt', () => {
    expect(teamInfo(SUPERLIGA_TEAMS_2026, 'Arsenal')).toBeNull();
    expect(teamInfo(PREMIER_LEAGUE_TEAMS_2026, 'Brøndby IF')).toBeNull();
  });

  it('tåler manglende input uden at vælte', () => {
    expect(teamInfo(null, 'Arsenal')).toBeNull();
    expect(teamInfo(PREMIER_LEAGUE_TEAMS_2026, null)).toBeNull();
    expect(teamInfo([{ navn: 'uden name' }], 'Arsenal')).toBeNull();
  });
});

describe('shortOf', () => {
  it('giver kortkoden fra den rigtige liste', () => {
    expect(shortOf(PREMIER_LEAGUE_TEAMS_2026, 'Manchester City')).toBe('MCI');
    expect(shortOf(PREMIER_LEAGUE_TEAMS_2026, 'Manchester United')).toBe('MUN');
  });

  // Uden opslaget faldt badgen tilbage på tre bogstaver af navnet. Testen her
  // viser hvorfor det ikke duer: de to Manchester-klubber ville blive ens.
  it('holder de to Manchester-klubber adskilt — navne-udledning ville ikke', () => {
    const udledt = (n) => String(n).replace(/[^A-Za-zÆØÅæøå]/g, '').slice(0, 3).toUpperCase();
    expect(udledt('Manchester City')).toBe(udledt('Manchester United')); // begge "MAN"
    expect(shortOf(PREMIER_LEAGUE_TEAMS_2026, 'Manchester City'))
      .not.toBe(shortOf(PREMIER_LEAGUE_TEAMS_2026, 'Manchester United'));
  });

  it('falder tilbage på det fulde navn for et ukendt hold', () => {
    expect(shortOf(PREMIER_LEAGUE_TEAMS_2026, 'Vejle Boldklub')).toBe('Vejle Boldklub');
  });
});
