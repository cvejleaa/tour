// updateLeagueQuestion (#40) — klient-vagterne, der SKAL holde, fordi rules
// ikke gør det for os her:
// - Første-gangs-deadline i FORTIDEN er uigenkaldelig (åbner alles svar
//   øjeblikkeligt, og kan derefter hverken ændres eller slettes). Rules
//   accepterer den (gren 2 er betingelsesfri) — klienten er ENESTE vagt, og
//   browserens min-attribut gælder ikke programmatisk satte værdier
//   (QC-blokerende fund på planen).
// - points skal ALTID med i patchen (reglen kræver `points is number` i det
//   resulterende dokument).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdateDoc = vi.fn().mockResolvedValue();
vi.mock('firebase/firestore', () => ({
  doc: (...a) => ({ __path: a.slice(1) }),
  updateDoc: (...a) => mockUpdateDoc(...a),
  collection: vi.fn(),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  serverTimestamp: () => ({ __ts: true }),
}));
vi.mock('../../firebase', () => ({ db: {}, functions: {} }));

import { updateLeagueQuestion } from './gameLeagueActions';
import { tilLokalInput } from '../../lib/daDate';

const BASE = { gameId: 'g', leagueId: 'l', questionId: 'q1' };
const OM_EN_DAG = Date.now() + 86400000;
const OM_TO_DAGE = Date.now() + 2 * 86400000;

beforeEach(() => mockUpdateDoc.mockClear());

describe('updateLeagueQuestion — deadline-vagterne', () => {
  it('AFVISER en deadline i fortiden — den ville åbne alles svar uigenkaldeligt', async () => {
    const res = await updateLeagueQuestion({
      ...BASE, q: { label: 'x', points: 5, deadline: null },
      label: 'Spørgsmålet', points: '5', deadline: '2020-01-01T12:00',
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('fremtiden');
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('AFVISER at rykke en deadline FREM — kun udskydelse', async () => {
    const res = await updateLeagueQuestion({
      ...BASE, q: { label: 'x', points: 5, deadline: OM_TO_DAGE },
      label: 'Spørgsmålet', points: '5', deadline: new Date(OM_EN_DAG).toISOString().slice(0, 16),
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('udskydes');
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('gyldig fremtids-deadline gemmes — og points er ALTID med i patchen', async () => {
    const res = await updateLeagueQuestion({
      ...BASE, q: { label: 'x', points: 7, deadline: null },
      label: 'Nyt spørgsmål', points: '7', deadline: new Date(OM_EN_DAG).toISOString().slice(0, 16),
    });
    expect(res).toMatchObject({ ok: true, deadlineSat: true });
    const patch = mockUpdateDoc.mock.calls[0][1];
    expect(patch.label).toBe('Nyt spørgsmål');
    expect(patch.points).toBe(7);
    expect(typeof patch.deadline).toBe('number');
    expect(patch.deadline).toBeGreaterThan(Date.now());
  });

  it('uændret deadline sendes IKKE med (og deadlineSat er false)', async () => {
    const res = await updateLeagueQuestion({
      ...BASE, q: { label: 'x', points: 5, deadline: null },
      label: 'Kun teksten rettes', points: '5', deadline: '',
    });
    expect(res).toMatchObject({ ok: true, deadlineSat: false });
    expect(mockUpdateDoc.mock.calls[0][1]).toEqual({ label: 'Kun teksten rettes', points: 5 });
  });

  // TM-fund: "uændret"-tjekket (ms !== nuvaerende) var kun testet med tom
  // streng, som filtreres bort FØR sammenligningen. Det REELLE scenarie:
  // ✏️-formen prefiller feltet med tilLokalInput(q.deadline), og ejeren gemmer
  // en ren tekst-rettelse uden at røre deadline. Da må deadline IKKE med i
  // patchen, og deadlineSat SKAL være false (ellers falsk 📣-væg-tilbud).
  it('deadline prefillet uændret (minut-rundet) sendes IKKE med', async () => {
    // Minut-rundet fremtids-ms, så tilLokalInput-rundturen rammer præcist.
    const ms = Math.floor((Date.now() + 3 * 86400000) / 60000) * 60000;
    const res = await updateLeagueQuestion({
      ...BASE, q: { label: 'x', points: 5, deadline: ms },
      label: 'Rettet tekst', points: '5', deadline: tilLokalInput(ms),
    });
    expect(res).toMatchObject({ ok: true, deadlineSat: false });
    expect('deadline' in mockUpdateDoc.mock.calls[0][1]).toBe(false);
  });

  it('for kort tekst afvises før noget skrives', async () => {
    const res = await updateLeagueQuestion({
      ...BASE, q: { label: 'x', points: 5 }, label: 'ab', points: '5', deadline: null,
    });
    expect(res.ok).toBe(false);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('kapløbet får sin EGEN besked: permission-denied ved deadline-forsøg', async () => {
    mockUpdateDoc.mockRejectedValueOnce({ code: 'permission-denied' });
    const res = await updateLeagueQuestion({
      ...BASE, q: { label: 'x', points: 5, deadline: OM_EN_DAG },
      label: 'Spørgsmålet', points: '5', deadline: new Date(OM_TO_DAGE).toISOString().slice(0, 16),
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('nåede at passere');
  });
});
