import { describe, it, expect } from 'vitest';
import {
  pageKeyFromPath, dayKeyCopenhagen, isNewVisit, activityRows, VISIT_GAP_MS, PAGE_LABELS,
} from './presence';

describe('pageKeyFromPath', () => {
  it('mapper ruter til stabile sektionsnøgler', () => {
    expect(pageKeyFromPath('/')).toBe('forside');
    expect(pageKeyFromPath('/etaper')).toBe('etaper');
    expect(pageKeyFromPath('/etape/3')).toBe('etaper'); // underside → sektion
    expect(pageKeyFromPath('/hold/UEX')).toBe('hold');
    expect(pageKeyFromPath('/mine-tips')).toBe('minetips'); // feltnavn-sikker
    expect(pageKeyFromPath('/stilling')).toBe('stilling');
  });
  it('ukendte ruter samles under "andet"', () => {
    expect(pageKeyFromPath('/noget-nyt')).toBe('andet');
    expect(pageKeyFromPath(null)).toBe('forside');
  });
  it('platformens spil-flade har sine EGNE nøgler — aldrig "andet" (sweep-fund L1-2)', () => {
    // Før denne nøgle landede AL platform-trafik i 'andet', og "Mest brugte
    // sider" var informationstom for hele spil-fladen. Oversigt ≠ spillet.
    expect(pageKeyFromPath('/spil')).toBe('spiloversigt');
    expect(pageKeyFromPath('/spil/superliga2627')).toBe('spil');
    expect(pageKeyFromPath('/spil/pl2627-efteraar')).toBe('spil');
    // Begge nøgler skal have et dansk visningsnavn i admin-fanen.
    expect(PAGE_LABELS.spiloversigt).toBe('Spiloversigt');
    expect(PAGE_LABELS.spil).toBe('Inde i spillet');
  });
});

describe('dayKeyCopenhagen', () => {
  it('giver YYYY-MM-DD i dansk tid', () => {
    // 4. juli 23:30 UTC = 5. juli 01:30 dansk tid → dagen er 2026-07-05
    expect(dayKeyCopenhagen(new Date('2026-07-04T23:30:00Z'))).toBe('2026-07-05');
    expect(dayKeyCopenhagen(new Date('2026-07-04T12:00:00Z'))).toBe('2026-07-04');
  });
});

describe('isNewVisit', () => {
  it('tæller kun besøg efter 30 minutters pause', () => {
    const now = 10_000_000;
    expect(isNewVisit(0, now)).toBe(true); // aldrig set før
    expect(isNewVisit(now - VISIT_GAP_MS, now)).toBe(true);
    expect(isNewVisit(now - VISIT_GAP_MS + 1000, now)).toBe(false); // 29 min
  });
});

describe('activityRows', () => {
  const ts = (ms) => ({ toMillis: () => ms });
  const users = [
    { id: 'a', displayName: 'Anna', status: 'approved' },
    { id: 'b', displayName: 'Bo', status: 'approved' },
    { id: 'c', displayName: 'Afvist', status: 'pending' }, // filtreres fra
  ];
  const presence = [
    { uid: 'a', lastSeenAt: ts(2000), days: { '2026-07-04': 2, '2026-07-05': 1 }, pages: { forside: 9, etaper: 4, stilling: 2, hold: 1 } },
  ];

  it('fletter, summerer besøg og finder topsider', () => {
    const rows = activityRows(users, presence);
    expect(rows).toHaveLength(2); // kun godkendte
    expect(rows[0]).toMatchObject({ uid: 'a', name: 'Anna', visits: 3, activeDays: 2 });
    expect(rows[0].topPages.map((p) => p.key)).toEqual(['forside', 'etaper', 'stilling']); // top 3
  });

  it('brugere uden presence kommer sidst med 0 besøg', () => {
    const rows = activityRows(users, presence);
    expect(rows[1]).toMatchObject({ uid: 'b', visits: 0, activeDays: 0, lastSeenAt: null });
  });
});
