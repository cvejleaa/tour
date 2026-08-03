import { describe, it, expect } from 'vitest';
import {
  scoreLeagueBonus, sumLeagueBonus, closestWinners, scoreLeagueBonusAll, DEFAULT_LB_POINTS,
} from './leagueBonusScoring';
import { LEAGUE_BONUS_TYPE } from '../../lib/constants';

describe('scoreLeagueBonus (individuelle typer, frit pointfelt)', () => {
  it('giver 0 uden facit eller svar', () => {
    expect(scoreLeagueBonus({ type: 'text', facit: null, points: 3 }, 'x')).toBe(0);
    expect(scoreLeagueBonus({ type: 'text', facit: 'x', points: 3 }, '')).toBe(0);
  });

  it('bruger spørgsmålets pointfelt (ikke et fast tal)', () => {
    const q = { type: LEAGUE_BONUS_TYPE.TEXT, facit: 'Mbappé', points: 7 };
    expect(scoreLeagueBonus(q, 'mbappe')).toBe(7);
  });

  it('falder tilbage til standardpoint uden pointfelt', () => {
    const q = { type: LEAGUE_BONUS_TYPE.TEXT, facit: 'Mbappé' };
    expect(scoreLeagueBonus(q, 'Mbappe')).toBe(DEFAULT_LB_POINTS);
  });

  it('fritekst: case/whitespace/accent-ufølsom + lille stavefejl', () => {
    const q = { type: LEAGUE_BONUS_TYPE.TEXT, facit: 'Mbappé', points: 3 };
    expect(scoreLeagueBonus(q, '  mbappe ')).toBe(3);
    expect(scoreLeagueBonus(q, 'Haaland')).toBe(0);
  });

  it('fritekst: manuelt godkendt stavemåde tæller', () => {
    const q = { type: LEAGUE_BONUS_TYPE.TEXT, facit: 'Gyökeres', acceptedAnswers: ['Viktor G'], points: 3 };
    expect(scoreLeagueBonus(q, 'Viktor G')).toBe(3);
  });

  it('hold (vælg ét): eksakt holdkode', () => {
    const q = { type: LEAGUE_BONUS_TYPE.TEAM, facit: 'UAD', points: 4 };
    expect(scoreLeagueBonus(q, 'UAD')).toBe(4);
    expect(scoreLeagueBonus(q, 'TVL')).toBe(0);
  });

  it('hold (vælg flere): rækkefølge-uafhængig', () => {
    const q = { type: LEAGUE_BONUS_TYPE.TEAMS, facit: ['UAD', 'TVL'], points: 5 };
    expect(scoreLeagueBonus(q, ['TVL', 'UAD'])).toBe(5);
    expect(scoreLeagueBonus(q, ['UAD', 'EFE'])).toBe(0);
  });

  it('ja/nej og tid', () => {
    expect(scoreLeagueBonus({ type: LEAGUE_BONUS_TYPE.BOOLEAN, facit: 'ja', points: 2 }, 'ja')).toBe(2);
    expect(scoreLeagueBonus({ type: LEAGUE_BONUS_TYPE.BOOLEAN, facit: 'ja', points: 2 }, 'nej')).toBe(0);
    expect(scoreLeagueBonus({ type: LEAGUE_BONUS_TYPE.TIME, facit: '1:23', points: 3 }, '1:23')).toBe(3);
  });

  it('tal scores ikke isoleret (relativ)', () => {
    expect(scoreLeagueBonus({ type: LEAGUE_BONUS_TYPE.NUMBER, facit: '311', points: 5 }, '311')).toBe(0);
  });
});

describe('closestWinners (NUMBER — nærmeste vinder pr. liga)', () => {
  const subs = [
    { uid: 'a', answer: '300' },
    { uid: 'b', answer: '320' },
    { uid: 'c', answer: '290' },
  ];

  it('den nærmeste på facit vinder (311 → b på 320)', () => {
    expect([...closestWinners('311', subs)]).toEqual(['b']);
  });

  it('uafgjort: alle de nærmeste vinder (310 → a og b)', () => {
    expect([...closestWinners('310', subs)].sort()).toEqual(['a', 'b']);
  });

  it('ugyldige/tomme svar kan ikke vinde', () => {
    const w = closestWinners('311', [{ uid: 'a', answer: '' }, { uid: 'b', answer: 'abc' }, { uid: 'c', answer: '312' }]);
    expect([...w]).toEqual(['c']);
  });

  it('ugyldigt facit → ingen vindere', () => {
    expect([...closestWinners('', subs)]).toEqual([]);
    expect([...closestWinners(null, subs)]).toEqual([]);
  });

  it('ingen svar → ingen vindere', () => {
    expect([...closestWinners('311', [])]).toEqual([]);
  });
});

describe('scoreLeagueBonusAll', () => {
  it('NUMBER: vinder(e) får spørgsmålets point, resten 0', () => {
    const q = { type: LEAGUE_BONUS_TYPE.NUMBER, facit: '311', points: 5 };
    const subs = [{ uid: 'a', answer: '300' }, { uid: 'b', answer: '320' }];
    expect(scoreLeagueBonusAll(q, subs)).toEqual({ a: 0, b: 5 });
  });

  it('NUMBER uafgjort: begge nærmeste får fuldt point', () => {
    const q = { type: LEAGUE_BONUS_TYPE.NUMBER, facit: '310', points: 5 };
    const subs = [{ uid: 'a', answer: '300' }, { uid: 'b', answer: '320' }, { uid: 'c', answer: '500' }];
    expect(scoreLeagueBonusAll(q, subs)).toEqual({ a: 5, b: 5, c: 0 });
  });

  it('uden facit → tomt resultat', () => {
    expect(scoreLeagueBonusAll({ type: LEAGUE_BONUS_TYPE.NUMBER, facit: null }, [{ uid: 'a', answer: '1' }])).toEqual({});
  });

  it('individuelle typer scores med pointfeltet', () => {
    const q = { type: LEAGUE_BONUS_TYPE.BOOLEAN, facit: 'ja', points: 2 };
    const subs = [{ uid: 'a', answer: 'ja' }, { uid: 'b', answer: 'nej' }];
    expect(scoreLeagueBonusAll(q, subs)).toEqual({ a: 2, b: 0 });
  });
});

describe('sumLeagueBonus', () => {
  it('summerer på tværs af spørgsmål', () => {
    const qs = [
      { id: 'q1', type: LEAGUE_BONUS_TYPE.BOOLEAN, facit: 'ja', points: 2 },
      { id: 'q2', type: LEAGUE_BONUS_TYPE.TEXT, facit: 'Brasilien', points: 3 },
    ];
    const answers = { q1: 'ja', q2: 'brasilien' };
    expect(sumLeagueBonus(qs, answers)).toBe(5);
  });
});
