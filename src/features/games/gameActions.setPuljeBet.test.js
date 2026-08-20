// setPuljeBet (#8) — klientens EGEN validering af pulje-tippet. Serveren
// (firestore.rules) håndhæver de samme grænser, men klientens fejltekster og
// den samlede skrivning (relegation kun når nedSize > 0) var helt udækket
// (TM-fund: overlap-guarden kunne fjernes med hele src/features/games grøn).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSetDoc = vi.fn().mockResolvedValue();
vi.mock('firebase/firestore', () => ({
  doc: (...a) => ({ __path: a.slice(1) }),
  setDoc: (...a) => mockSetDoc(...a),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  serverTimestamp: () => ({ __ts: true }),
  Timestamp: {},
}));
vi.mock('../../firebase', () => ({ db: {} }));

import { setPuljeBet } from './gameActions';

const SL = { poolSize: 6, nedSize: 0 };
const PL = { poolSize: 4, nedSize: 3 };
const seks = ['A', 'B', 'C', 'D', 'E', 'F'];

beforeEach(() => mockSetDoc.mockClear());

describe('setPuljeBet — konfigurationsstyret validering', () => {
  it('SL: 6 hold gemmes UDEN relegation-felt', async () => {
    const res = await setPuljeBet('u', 'g', seks, { konfig: SL });
    expect(res.ok).toBe(true);
    const data = mockSetDoc.mock.calls[0][1];
    expect(data.championship).toEqual(seks);
    expect('relegation' in data).toBe(false);
  });

  it('SL: forkert antal afvises før skrivning', async () => {
    const res = await setPuljeBet('u', 'g', seks.slice(0, 5), { konfig: SL });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('6 hold');
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('PL: 4+3 gemmes MED relegation', async () => {
    const res = await setPuljeBet('u', 'g', ['A', 'B', 'C', 'D'], { konfig: PL, relegation: ['X', 'Y', 'Z'] });
    expect(res.ok).toBe(true);
    expect(mockSetDoc.mock.calls[0][1].relegation).toEqual(['X', 'Y', 'Z']);
  });

  it('PL: manglende bund-liste afvises (halvt svar)', async () => {
    const res = await setPuljeBet('u', 'g', ['A', 'B', 'C', 'D'], { konfig: PL, relegation: ['X'] });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('3 hold');
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('PL: et hold i BÅDE top og bund afvises — dét er overlap-guarden', async () => {
    const res = await setPuljeBet('u', 'g', ['A', 'B', 'C', 'D'], { konfig: PL, relegation: ['A', 'Y', 'Z'] });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('både');
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('uden konfig antages SL-standard (6 hold)', async () => {
    expect((await setPuljeBet('u', 'g', seks)).ok).toBe(true);
    expect((await setPuljeBet('u', 'g', seks.slice(0, 4))).ok).toBe(false);
  });
});
