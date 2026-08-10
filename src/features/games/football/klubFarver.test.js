// ---------------------------------------------------------------------------
// HVILKEN SPILLER FÅR HVILKEN RING — og hvem får ingen.
//
// To gates afgør det, og begge er der af en grund, der HAR gjort skade før:
//
//  1. `teamsOf` falder tilbage på Superligaens tolv hold, når spillet ikke har
//     nogen. Det giver mening på tip-fladen i et endnu ikke seedet fodboldspil,
//     men her ville det give en Tour-spiller en ring i Brøndby-gul.
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

const HOLD = [
  { name: 'Brøndby IF', short: 'BIF', color: '#E5B905' },
  { name: 'Randers FC', short: 'RFC', color: '#78C5ED', troejer: { hjemme: { sekundaer: '#30374F', moenster: 'skraabaand' } } },
  { name: 'F.C. København', short: 'FCK', color: '#FFFFFF' },
];
const SPIL = { id: 'sl', type: 'football', teams: HOLD };

describe('klubFarverAf', () => {
  it('giver hjemmetrøjens primær- og sekundærfarve', () => {
    expect(klubFarverAf(HOLD, {}, 'Randers FC'))
      .toEqual({ primaer: '#78C5ED', sekundaer: '#30374F', navn: 'Randers FC' });
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

  // …og for et fodboldspil, der ikke er seedet endnu. Fallbacken i `teamsOf`
  // hører til tip-fladen, ikke her.
  it.each([undefined, [], null])('giver null, når spillet ingen holdliste har (%p)', (teams) => {
    expect(kald({ id: 'sl', type: 'football', teams }, 'Brøndby IF')).toBeNull();
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
