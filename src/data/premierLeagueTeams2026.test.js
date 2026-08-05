// Holdlisten mod kampprogrammet.
//
// Fejlen, det her findes for: `teamElo()` i superligaSeed.js falder TAVST
// tilbage til ELO.START (1500) for et navn, den ikke kender. Staver holdlisten
// "Brighton & Hove Albion", mens kilden skriver "Brighton and Hove Albion",
// får hver eneste Brighton-kamp odds som om de var et midterhold — uden fejl,
// uden log, uden at nogen opdager det før facit falder.
//
// Derfor sammenholdes de to filer med hinanden i stedet for hver for sig: de
// stammer fra SAMME kilde (pulselive), så ethvert afvig er en tastefejl hos os.
import { describe, it, expect } from 'vitest';
import { PREMIER_LEAGUE_TEAMS_2026 as TEAMS } from './premierLeagueTeams2026.js';
import { teamElo } from '../lib/superligaSeed.js';
import { ELO } from '../lib/superligaScoring.js';
import fixtures from '../../scripts/premier-league-fixtures-2627.json';

const iProgrammet = [...new Set(fixtures.flatMap((f) => [f.home, f.away]))];

describe('Premier League-holdlisten mod kampprogrammet', () => {
  it('har præcis de 20 hold, der spiller i programmet', () => {
    expect(TEAMS).toHaveLength(20);
    expect(iProgrammet).toHaveLength(20);
    expect(TEAMS.map((t) => t.name).sort()).toEqual(iProgrammet.slice().sort());
  });

  // Den direkte prøve på fælden: slå hvert eneste holdnavn fra programmet op
  // gennem den funktion, seedingen faktisk bruger.
  it('giver intet hold i programmet den tavse 1500-tilbagefaldsværdi', () => {
    const neutrale = iProgrammet.filter((n) => teamElo(TEAMS, n) === ELO.START);
    expect(neutrale).toEqual([]);
  });

  it('kender hvert holds hjemmebane og kortkode', () => {
    for (const t of TEAMS) {
      expect(t.short, t.name).toMatch(/^[A-Z]{3}$/);
      expect(t.venue, t.name).toBeTruthy();
    }
    // Kortkoden er det, badgen viser — to hold med samme ville være ulæseligt.
    expect(new Set(TEAMS.map((t) => t.short)).size).toBe(20);
  });

  it('har farver, der kan sættes direkte i CSS', () => {
    for (const t of TEAMS) {
      for (const felt of ['color', 'awayColor', 'thirdColor']) {
        expect(t[felt], `${t.name}.${felt}`).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });
});

describe('Elo-startværdierne', () => {
  // Forskydningen er hele pointen: gennemsnittet skal ligge på ELO.START, så et
  // ukendt hold og et gennemsnitshold er samme styrke. Rammer den ikke, er
  // hele skalaen forskudt, og favoritterne får systematisk for lave odds.
  it('har gennemsnit på ELO.START', () => {
    const snit = TEAMS.reduce((s, t) => s + t.elo, 0) / TEAMS.length;
    expect(Math.round(snit)).toBe(ELO.START);
  });

  // Spredningen er bevaret fra kilden, IKKE klemt ned til Superligaens. Var den
  // klemt, ville forskellen på top og bund forsvinde ud af oddsene.
  it('bevarer en spredning, der er bredere end Superligaens', () => {
    const v = TEAMS.map((t) => t.elo);
    expect(Math.max(...v) - Math.min(...v)).toBeGreaterThan(400);
  });

  // De tre oprykkere må ikke ligge på 1500 — dét ville være at give dem
  // præcis den værdi, et UKENDT hold får, og så er fælden tilbage i praksis.
  it('giver oprykkerne en værdi under gennemsnittet', () => {
    for (const navn of ['Coventry City', 'Hull City', 'Ipswich Town']) {
      const t = TEAMS.find((x) => x.name === navn);
      expect(t, navn).toBeTruthy();
      expect(t.elo, navn).toBeLessThan(ELO.START);
    }
  });
});

describe('kampprogrammet', () => {
  it('er hele sæsonen: 380 kampe over 38 runder', () => {
    expect(fixtures).toHaveLength(380);
    const runder = [...new Set(fixtures.map((f) => f.round))].sort((a, b) => a - b);
    expect(runder[0]).toBe(1);
    expect(runder[runder.length - 1]).toBe(38);
    expect(runder).toHaveLength(38);
  });

  it('har et entydigt id pr. kamp, bygget på kildens eget matchId', () => {
    expect(new Set(fixtures.map((f) => f.id)).size).toBe(380);
    for (const f of fixtures) expect(f.id).toMatch(/^r\d{1,2}-\d+$/);
  });

  // Kickoff ER tip-deadlinen (firestore.rules), så tidszonen må ikke smutte.
  // Kilden skriver London-tid; august er BST (UTC+1), december er GMT (UTC+0).
  // Konverteres der med en fast forskydning, rammer den ene af de to forkert.
  it('har kickoff i UTC med sommertid håndteret', () => {
    for (const f of fixtures) expect(f.kickoff).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    const aabning = fixtures.find((f) => f.id === 'r1-2645195');
    expect(aabning.kickoff).toBe('2026-08-21T19:00:00Z'); // 20.00 BST
    const vinter = fixtures.find((f) => f.kickoff.startsWith('2026-12-02'));
    expect(vinter.kickoff.endsWith('20:00:00Z')).toBe(true); // 20.00 GMT
  });

  // Snittet ved nytår afgør, hvad der er spil 1 og hvad der er spil 2. Ligger
  // en runde på tværs, skal kupon og combi-bonus deles midt i en runde.
  it('deler sig rent ved nytår: runde 1–18 i 2026, 19–38 i 2027', () => {
    const i2026 = fixtures.filter((f) => f.kickoff < '2027-01-01');
    const i2027 = fixtures.filter((f) => f.kickoff >= '2027-01-01');
    expect(i2026).toHaveLength(180);
    expect(i2027).toHaveLength(200);
    expect(Math.max(...i2026.map((f) => f.round))).toBe(18);
    expect(Math.min(...i2027.map((f) => f.round))).toBe(19);
    const paaTvaers = [...new Set(i2026.map((f) => f.round))]
      .filter((r) => i2027.some((f) => f.round === r));
    expect(paaTvaers).toEqual([]);
  });

  it('lader hvert hold spille 38 kampe — 19 hjemme og 19 ude', () => {
    for (const t of TEAMS) {
      expect(fixtures.filter((f) => f.home === t.name), t.name).toHaveLength(19);
      expect(fixtures.filter((f) => f.away === t.name), t.name).toHaveLength(19);
    }
  });
});
