// ukvitterede(): kun alarmer, der KRÆVER kvittering og ikke har fået den,
// driver ⚠-markøren — en auto-lukbar alarm (strandet kamp) må ikke tælle.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../firebase', () => ({ db: {} }));

import { ukvitterede } from './useDriftStatus';

describe('ukvitterede', () => {
  it('tæller kun kraeverKvittering uden kvitteretAt', () => {
    const alarmer = [
      { id: 'a', kraeverKvittering: true, kvitteretAt: null },   // tæller
      { id: 'b', kraeverKvittering: true, kvitteretAt: 123 },    // kvitteret
      { id: 'c', kraeverKvittering: false, kvitteretAt: null },  // auto-lukbar
      { id: 'd' },                                               // uden felter
    ];
    expect(ukvitterede(alarmer).map((a) => a.id)).toEqual(['a']);
    expect(ukvitterede([])).toEqual([]);
    expect(ukvitterede(null)).toEqual([]);
  });
});
