import { describe, it, expect } from 'vitest';
import { scoreLeagueBonus, sumLeagueBonus, LB_POINTS } from './leagueBonusScoring';
import { LEAGUE_BONUS_TYPE } from '../../lib/constants';

describe('scoreLeagueBonus', () => {
  it('giver 0 uden facit eller svar', () => {
    expect(scoreLeagueBonus({ type: 'text', facit: null }, 'x')).toBe(0);
    expect(scoreLeagueBonus({ type: 'text', facit: 'x' }, '')).toBe(0);
  });

  it('fritekst: case/whitespace/accent-ufølsom + lille stavefejl', () => {
    const q = { type: LEAGUE_BONUS_TYPE.TEXT, facit: 'Mbappé' };
    expect(scoreLeagueBonus(q, '  mbappe ')).toBe(LB_POINTS.TEXT); // accent ligegyldig
    expect(scoreLeagueBonus(q, 'Mbappe')).toBe(LB_POINTS.TEXT);
    expect(scoreLeagueBonus(q, 'Haaland')).toBe(0);
  });

  it('fritekst: manuelt godkendt stavemåde tæller', () => {
    const q = { type: LEAGUE_BONUS_TYPE.TEXT, facit: 'Gyökeres', acceptedAnswers: ['Gyokeres FC', 'Viktor G'] };
    // helt anden, men godkendt variant
    expect(scoreLeagueBonus(q, 'Viktor G')).toBe(LB_POINTS.TEXT);
  });

  it('valg og ja/nej', () => {
    expect(scoreLeagueBonus({ type: LEAGUE_BONUS_TYPE.CHOICE, facit: 'A' }, 'a')).toBe(LB_POINTS.CHOICE);
    expect(scoreLeagueBonus({ type: LEAGUE_BONUS_TYPE.YESNO, facit: 'yes' }, 'yes')).toBe(LB_POINTS.YESNO);
    expect(scoreLeagueBonus({ type: LEAGUE_BONUS_TYPE.YESNO, facit: 'yes' }, 'no')).toBe(0);
  });

  describe('top-liste med rækkefølge-bonus', () => {
    const q = { type: LEAGUE_BONUS_TYPE.TOPLIST, facit: ['Messi', 'Mbappé', 'Haaland'] };

    it('point pr. korrekt navn + bonus for rigtig plads', () => {
      // Messi rigtig plads (2+1), Mbappé rigtig plads (2+1), Haaland ikke på listen
      expect(scoreLeagueBonus(q, ['Messi', 'Mbappé', 'Ronaldo'])).toBe(6);
    });

    it('korrekt navn men forkert plads giver kun navn-point', () => {
      // Mbappé på plads 0 (facit plads 1) → 2; Messi på plads 1 (facit 0) → 2
      expect(scoreLeagueBonus(q, ['Mbappé', 'Messi'])).toBe(4);
    });

    it('helt forkert giver 0', () => {
      expect(scoreLeagueBonus(q, ['A', 'B', 'C'])).toBe(0);
    });

    it('dublet-navne tæller kun én gang', () => {
      // Messi to gange: kun første tæller (2 navn + 1 plads = 3)
      expect(scoreLeagueBonus(q, ['Messi', 'Messi'])).toBe(3);
    });

    it('fuzzy match på navne i top-liste', () => {
      // 'Mbappe' (uden accent) matcher facit 'Mbappé' på plads 1
      expect(scoreLeagueBonus(q, ['Messi', 'Mbappe'])).toBe(6);
    });
  });
});

describe('sumLeagueBonus', () => {
  it('summerer på tværs af spørgsmål', () => {
    const qs = [
      { id: 'q1', type: LEAGUE_BONUS_TYPE.YESNO, facit: 'yes' },
      { id: 'q2', type: LEAGUE_BONUS_TYPE.TEXT, facit: 'Brasilien' },
    ];
    const answers = { q1: 'yes', q2: 'brasilien' };
    expect(sumLeagueBonus(qs, answers)).toBe(LB_POINTS.YESNO + LB_POINTS.TEXT);
  });
});
