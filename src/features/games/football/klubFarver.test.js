// ---------------------------------------------------------------------------
// HVILKEN SPILLER FÅR HVILKEN RING — og hvem får ingen.
//
// To gates afgør det, og begge er der af en grund, der HAR gjort skade før:
//
//  1. SPILLET SKAL VÆRE ET FODBOLDSPIL. `teamsOf` falder tilbage på
//     Superligaens tolv hold, når spillet ikke har nogen — uden gaten ville en
//     Tour-spiller kunne få en ring i Brøndby-gul. Gaten kræver derimod IKKE,
//     at spillet har sin egen liste: ringen bruger nøjagtig den liste,
//     holdvælgeren viser, så de to ikke kan sige forskellige ting.
//  2. `gameStandings.js` falder tilbage på brugerens GLOBALE yndlingshold
//     (`p.favoriteTeam ?? u.favoriteTeam`), og for en migreret Tour-bruger står
//     der et CYKELHOLD dér — "Visma", "UAE". Uden et opslag i spillets holdliste
//     ville `badgeFor` beredvilligt give GRÅ tilbage, og grå ligner en rigtig
//     klubfarve.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { klubFarverAf } from './badges';
import { useKlubFarver } from './useKlubFarver';
import { teamsOf } from './teamInfo';
import { HAANDBOLD_VM2027_HOLD } from '../../../data/haandboldVm2027Hold';
import { SUPERLIGA_TEAMS_2026 } from '../../../data/superligaTeams2026';
import { PREMIER_LEAGUE_TEAMS_2026 } from '../../../data/premierLeagueTeams2026';

const HOLD = [
  { name: 'Brøndby IF', short: 'BIF', color: '#E5B905' },
  { name: 'Randers FC', short: 'RFC', color: '#78C5ED', troejer: { hjemme: { sekundaer: '#30374F', moenster: 'skraabaand' } } },
  { name: 'F.C. København', short: 'FCK', color: '#FFFFFF' },
];
const SPIL = { id: 'sl', type: 'football', teams: HOLD };

describe('klubFarverAf', () => {
  it('giver hjemmetrøjens primær- og sekundærfarve', () => {
    expect(klubFarverAf(HOLD, {}, 'Randers FC'))
      .toEqual({ primaer: '#78C5ED', sekundaer: '#30374F', navn: 'Randers FC', landeflag: false });
  });

  it('giver null for sekundær, når holdet er ensfarvet', () => {
    expect(klubFarverAf(HOLD, {}, 'Brøndby IF').sekundaer).toBeNull();
  });

  // BÆRENDE. Uden det her opslag ville et cykelholdsnavn give `badgeFor`s grå
  // — en farve, der ser ud som en klubfarve og ikke som "intet valgt".
  it.each(['Visma', 'UAE Team Emirates', 'Arsenal', ''])('giver null for %p, som spillet ikke kender', (navn) => {
    expect(klubFarverAf(HOLD, {}, navn)).toBeNull();
  });

  it('giver null uden hold', () => {
    expect(klubFarverAf(HOLD, {}, null)).toBeNull();
  });

  // ADMIN-OVERRIDES SKAL SLÅ IGENNEM. Det er hele grunden til, at opslaget går
  // gennem `badgeFor` frem for at læse `hold.color` direkte: ellers ville
  // ringen vise én farve og kampkortet en anden efter en rettelse i admin.
  it('følger en farve, ejeren har rettet i admin', () => {
    const styles = { 'Brøndby IF': { color: '#123456' } };
    expect(klubFarverAf(HOLD, styles, 'Brøndby IF').primaer).toBe('#123456');
    // …og uden override står standarden.
    expect(klubFarverAf(HOLD, {}, 'Brøndby IF').primaer).toBe('#E5B905');
  });

  // INGEN EGEN FARVE → INGEN RING (QC på flagplanen, fund 1). `badgeFor`
  // giver GREY for et kendt hold uden farve, og en grå ring ligner en rigtig
  // farve — lige ved siden af et landeflag. Før landefarverne gjaldt det alle
  // 32 hold i håndbold-VM'et.
  it('giver null for et kendt hold uden farve — ingen grå ring', () => {
    const uden = [{ name: 'Danmark', short: 'DEN', iso2: 'dk' }];
    expect(klubFarverAf(uden, {}, 'Danmark')).toBeNull();
    expect(klubFarverAf(uden, undefined, 'Danmark')).toBeNull();
  });

  it('giver en ring, når farven er sat i admin eller i holdlisten', () => {
    const uden = [{ name: 'Danmark', short: 'DEN' }];
    expect(klubFarverAf(uden, { Danmark: { color: '#C8102E' } }, 'Danmark').primaer).toBe('#C8102E');
    expect(klubFarverAf([{ name: 'Danmark', color: '#C8102E' }], {}, 'Danmark').primaer).toBe('#C8102E');
  });

  it('bruger visningsnavnet, hvis holdet har et', () => {
    const medVis = [{ ...HOLD[0], vis: 'Brøndby' }];
    expect(klubFarverAf(medVis, {}, 'Brøndby IF').navn).toBe('Brøndby');
  });
});

describe('useKlubFarver — de to gates', () => {
  const kald = (game, navn) => renderHook(() => useKlubFarver(game)).result.current(navn);

  it('virker for et fodboldspil med hold', () => {
    expect(kald(SPIL, 'Brøndby IF').primaer).toBe('#E5B905');
  });

  // GATE 1. Et Tour-spil har ingen fodboldhold, og `teamsOf` ville ellers
  // levere Superligaens tolv — så ville "Brøndby IF" i et cykelspil give gul.
  it.each([
    ['tour', { id: 't', type: 'tour', teams: [] }],
    ['uden type', { id: 'x', teams: HOLD }],
  ])('giver null for et %s-spil', (_navn, game) => {
    expect(kald(game, 'Brøndby IF')).toBeNull();
  });

  // ET FODBOLDSPIL UDEN EGEN HOLDLISTE bruger `teamsOf`s fallback — NØJAGTIG
  // som holdvælgeren på samme kort gør.
  //
  // Gaten krævede før også en ikke-tom `teams`, og så opstod der en ny udgave
  // af netop den fejl, hele ændringen retter: `games/{id}.teams` skrives kun af
  // `seed-football.mjs`, og profil-fanen er ikke gated på fodbold. I et
  // fodboldspil uden liste viste vælgeren derfor Superligaens tolv hold, mens
  // ringen udeblev — og hjælpeteksten lige over lovede en ring. Falsk igen, i
  // det samme kort.
  it.each([undefined, [], null])('bruger fallback-listen, når spillet ingen har (%p)', (teams) => {
    expect(kald({ id: 'sl', type: 'football', teams }, 'Brøndby IF').primaer).toBe('#E5B905');
  });

  // …men gaten på spiltype holder stadig, og det er DEN, der beskytter Tour.
  it('giver stadig null for et tour-spil uden holdliste', () => {
    expect(kald({ id: 't', type: 'tour', teams: undefined }, 'Brøndby IF')).toBeNull();
  });

  // GATE 2, gennem hook'en: navnet skal findes i SPILLETS liste.
  it('giver null for et cykelhold i et fodboldspil', () => {
    expect(kald(SPIL, 'Visma')).toBeNull();
  });

  // Samme navn, to spil, to holdlister — svaret skal følge spillet.
  it('følger spillets egen holdliste, ikke en import', () => {
    const andet = { id: 'pl', type: 'football', teams: [{ name: 'Brøndby IF', short: 'X', color: '#000001' }] };
    expect(kald(SPIL, 'Brøndby IF').primaer).toBe('#E5B905');
    expect(kald(andet, 'Brøndby IF').primaer).toBe('#000001');
  });
});

// ---------------------------------------------------------------------------
// FLAG-SPIL: RINGEN SKAL VISE, HVEM MAN HOLDER MED (Spilfører på flag-koden).
// Omkring halvdelen af de 32 landehold har en rød primærfarve, og med en
// ensfarvet ring stod Danmark, Norge og Tyskland ens i stillingen — netop de
// valg, en dansk vennekreds driller hinanden med. Landets ANDEN flagfarve
// (`awayColor`) bliver derfor ringens sekundærfarve, når spillet har flag.
// ---------------------------------------------------------------------------
describe('klubFarverAf — flag-spil får landets anden farve i ringen', () => {
  const HVM = { id: 'hvm2027', type: 'football', sport: 'haandbold', teams: HAANDBOLD_VM2027_HOLD };
  const kald = (game, navn) => renderHook(() => useKlubFarver(game)).result.current(navn);

  it('Danmark, Norge, Tyskland og Sverige — gennem hook\'en, som stillingen bruger', () => {
    expect(kald(HVM, 'Danmark')).toEqual({ primaer: '#C8102E', sekundaer: '#FFFFFF', navn: 'Danmark', landeflag: true });
    expect(kald(HVM, 'Norge')).toEqual({ primaer: '#ED2939', sekundaer: '#002664', navn: 'Norge', landeflag: true });
    expect(kald(HVM, 'Tyskland')).toEqual({ primaer: '#FF0000', sekundaer: '#FFCC00', navn: 'Tyskland', landeflag: true });
    expect(kald(HVM, 'Sverige')).toEqual({ primaer: '#FECB00', sekundaer: '#005293', navn: 'Sverige', landeflag: true });
  });

  // De to røde, der skulle kunne skelnes: forskellig sekundærfarve.
  it('Danmark og Norge har ikke samme ring', () => {
    expect(kald(HVM, 'Danmark').sekundaer).not.toBe(kald(HVM, 'Norge').sekundaer);
  });

  it('alle 32: sekundærfarven er holdets awayColor', () => {
    const teams = teamsOf(HVM);
    for (const t of HAANDBOLD_VM2027_HOLD) {
      expect(klubFarverAf(teams, {}, t.name).sekundaer, t.name).toBe(t.awayColor);
    }
  });

  // Admin-rettelsen slår igennem på udefarven som på primærfarven.
  it('følger en udefarve, ejeren har rettet i admin', () => {
    const teams = teamsOf(HVM);
    expect(klubFarverAf(teams, { Norge: { awayColor: '#123456' } }, 'Norge').sekundaer).toBe('#123456');
  });

  // Er den anden farve den samme som den første, er der ingen anden farve —
  // en «stribe» i samme farve som ringen er ingen stribe.
  it('giver null, når udefarven er den samme som primærfarven', () => {
    const teams = teamsOf(HVM);
    expect(klubFarverAf(teams, { Norge: { awayColor: '#ed2939' } }, 'Norge').sekundaer).toBeNull();
  });

  // ET HÅNDBOLDSPIL UDEN FLAG tegner trøjer — gaten er evnen, ikke `sport`.
  // Mangler ét hold flag, er der ingen flag nogen steder, og så heller ingen
  // landefarve-stribe.
  it('håndboldspil, hvor ét hold mangler flag: ensfarvet ring som før', () => {
    const mangler = HAANDBOLD_VM2027_HOLD.map((t) => (t.name === 'Japan' ? { ...t, iso2: undefined } : t));
    expect(kald({ ...HVM, teams: mangler }, 'Danmark')).toEqual({ primaer: '#C8102E', sekundaer: null, navn: 'Danmark', landeflag: false });
  });
});

// SUPERLIGAEN OG PREMIER LEAGUE ER UÆNDREDE. Klubberne HAR awayColor (deres
// udetrøje), så en gate, der lækkede, ville give dem en stribe i udetrøjens
// farve. Sekundærfarven skal være trøjeformens — og forudsætningen, at der
// overhovedet er klubber, hvor de to er forskellige, står med, så testen ikke
// kan blive grøn af tomme lister.
describe('klubFarverAf — klubspil uden flag er uændrede', () => {
  it.each([
    ['Superligaen', SUPERLIGA_TEAMS_2026],
    ['Premier League', PREMIER_LEAGUE_TEAMS_2026],
  ])('%s: sekundærfarven er trøjeformens, aldrig udefarven', (_navn, liste) => {
    const teams = teamsOf({ type: 'football', teams: liste });
    const ville = liste.filter((t) => t.awayColor && t.awayColor !== (t.troejer?.hjemme?.sekundaer ?? null));
    expect(ville.length).toBeGreaterThan(5);
    for (const t of liste) {
      expect(klubFarverAf(teams, {}, t.name).sekundaer, t.name).toBe(t.troejer?.hjemme?.sekundaer ?? null);
      // …og ringen tegnes som før: `landeflag` er det, Avatar giver
      // sekundærfarven en bredere stribe på (Avatar.jsx `sekundaerBredde`).
      expect(klubFarverAf(teams, {}, t.name).landeflag, t.name).toBe(false);
    }
  });
});
