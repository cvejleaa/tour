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
import program from '../../scripts/premier-league-fixtures-2627.json';

const fixtures = program.fixtures;

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

  // Spredningen er bevaret fra kilden og IKKE klemt ned til Superligaens — se
  // begrundelsen i filhovedet. Den påstand hører i en kommentar, ikke i en
  // assertion mod et tilfældigt tal: en grænse på "mere end 400" ville kun
  // kunne fejle, hvis nogen skrev dataen om, og så ville den fejle uden at
  // forklare hvorfor netop 400.

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

  // FILEN SER FÆRDIG UD, OG DET ER DEN IKKE. Premier League udgiver programmet
  // før TV-udvælgelsen: alt lægges i standard-slottet, og kampene flyttes
  // derefter. Kun runde 1–5 har rigtige, spredte tidspunkter — i runde 6–38
  // står alle ti kampe på samme sekund.
  //
  // Det er ikke en detalje, for kickoff ER tip-deadlinen (firestore.rules), og
  // `pendingMatches` i synken leder kun efter kampe i et vindue omkring det
  // tidspunkt. Står tiden forkert, lander facit aldrig — uden fejlbesked.
  // Derfor kræver vi, at filen selv siger det højt.
  it('advarer i sit eget _note om, at 33 runders tider er pladsholdere', () => {
    expect(program._note).toBeTruthy();
    expect(program._note).toMatch(/pulselive/i);
    expect(program._note).toMatch(/pladsholder|flytte sig/i);
    expect(program._note).toMatch(/deadline/i);
  });

  it('har stadig kun standard-slot i runde 6–38 — gensynkronisering mangler', () => {
    const tiderPr = new Map();
    for (const f of fixtures) {
      if (!tiderPr.has(f.round)) tiderPr.set(f.round, new Set());
      tiderPr.get(f.round).add(f.kickoff);
    }
    const spredte = [...tiderPr.entries()].filter(([, s]) => s.size > 1).map(([r]) => r);
    // Runde 1–5 er TV-fastlagte. Vokser listen, er programmet blevet
    // opdateret fra API'et — så er det denne test, der skal rettes, ikke data.
    expect(spredte.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  // Kickoff ER tip-deadlinen (firestore.rules), så tidszonen må ikke smutte.
  // Kilden skriver London-tid; august er BST (UTC+1), december er GMT (UTC+0).
  // Konverteres der med en fast forskydning, rammer den ene af de to forkert.
  // Bemærk: vinter-eksemplet er hentet fra en pladsholder-runde — selve
  // konverteringen er stadig bevist, men tidspunktet vil ændre sig.
  it('har kickoff i UTC med sommertid håndteret', () => {
    for (const f of fixtures) expect(f.kickoff).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    const aabning = fixtures.find((f) => f.id === 'r1-2645195');
    expect(aabning.kickoff).toBe('2026-08-21T19:00:00Z'); // 20.00 BST
    const vinter = fixtures.find((f) => f.kickoff.startsWith('2026-12-02'));
    expect(vinter.kickoff.endsWith('20:00:00Z')).toBe(true); // 20.00 GMT
  });

  // DELINGEN MELLEM DE TO SPIL ER PÅ RUNDENUMMER, IKKE PÅ DATO. En udsat
  // runde 18-kamp, der spilles i januar, hører stadig til spil 1 — ellers
  // ville en kamp skifte spil, efter folk har tippet på den.
  //
  // Datoen var kun dét, der afgjorde HVOR vi skar. Den påstand hører derfor
  // ikke i en assertion: det er en påstand om virkeligheden, og virkeligheden
  // vinder. Første udsatte decemberkamp ville gøre den rød på korrekt data.
  it('deler sig i to spil på rundenummer: 180 kampe i runde 1–18, 200 i 19–38', () => {
    const spil1 = fixtures.filter((f) => f.round <= 18);
    const spil2 = fixtures.filter((f) => f.round >= 19);
    expect(spil1).toHaveLength(180);
    expect(spil2).toHaveLength(200);
    expect(spil1.length + spil2.length).toBe(fixtures.length);
  });

  // Som programmet så ud ved seeding, faldt snittet rent sammen med nytår.
  // Testen dokumenterer det snapshot — den er IKKE et krav til fremtiden.
  it('faldt ved seeding sammen med nytår', () => {
    const senesteI2026 = fixtures.filter((f) => f.round <= 18)
      .reduce((s, f) => (f.kickoff > s ? f.kickoff : s), '');
    expect(senesteI2026 < '2027-01-01').toBe(true);
  });

  it('lader hvert hold spille 38 kampe — 19 hjemme og 19 ude', () => {
    for (const t of TEAMS) {
      expect(fixtures.filter((f) => f.home === t.name), t.name).toHaveLength(19);
      expect(fixtures.filter((f) => f.away === t.name), t.name).toHaveLength(19);
    }
  });
});
