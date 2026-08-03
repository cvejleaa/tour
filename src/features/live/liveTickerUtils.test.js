import { describe, it, expect } from 'vitest';
import { pictoEmoji, formatPostTime, isTodayInCopenhagen } from './liveTickerUtils';

describe('pictoEmoji', () => {
  it('mapper letours picto-navne til emojis', () => {
    expect(pictoEmoji('liv_finish')).toBe('🏁');
    expect(pictoEmoji('liv_actual_start')).toBe('🟢');
    expect(pictoEmoji('liv_start')).toBe('📣');
    expect(pictoEmoji('liv_chrono')).toBe('⏱️');
    expect(pictoEmoji('liv_green_jersey')).toBe('💚');
    expect(pictoEmoji('liv_yellow_jersey')).toBe('💛');
    expect(pictoEmoji('liv_statistics')).toBe('📊');
    expect(pictoEmoji('liv_story')).toBe('📖');
  });
  it('fallback er cyklen', () => {
    expect(pictoEmoji(null)).toBe('🚴');
    expect(pictoEmoji('noget_ukendt')).toBe('🚴');
  });
});

describe('formatPostTime', () => {
  it('viser dansk klokkeslæt (Europe/Copenhagen)', () => {
    // 15:39 UTC = 17:39 dansk sommertid
    expect(formatPostTime('2026-07-04T15:39:00Z')).toMatch(/17.39/);
  });
  it('tåler ugyldigt input', () => {
    expect(formatPostTime(null)).toBe('');
    expect(formatPostTime('hest')).toBe('');
  });
});

describe('isTodayInCopenhagen', () => {
  const now = new Date('2026-07-04T20:00:00+02:00');
  it('samme danske dato → true (også over midnat UTC)', () => {
    expect(isTodayInCopenhagen('2026-07-04T17:05:00+02:00', now)).toBe(true);
    // 23:30 dansk tid 4/7 = 21:30 UTC 4/7 — stadig 4/7 i DK.
    expect(isTodayInCopenhagen('2026-07-04T23:30:00+02:00', now)).toBe(true);
  });
  it('anden dato → false', () => {
    expect(isTodayInCopenhagen('2026-07-05T12:00:00+02:00', now)).toBe(false);
  });
  it('Firestore-Timestamp (toDate) understøttes', () => {
    expect(isTodayInCopenhagen({ toDate: () => new Date('2026-07-04T17:05:00+02:00') }, now)).toBe(true);
  });
  it('ugyldigt/tomt input → false', () => {
    expect(isTodayInCopenhagen(null, now)).toBe(false);
    expect(isTodayInCopenhagen('hest', now)).toBe(false);
  });
});
