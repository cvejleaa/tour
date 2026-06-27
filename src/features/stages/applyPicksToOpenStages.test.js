// Tests for applyPicksToOpenStages — batched skrivning kun til ÅBNE etaper.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../firebase', () => ({ db: { _db: true } }));

const batchSet = vi.fn();
const batchCommit = vi.fn(() => Promise.resolve());
const mockWriteBatch = vi.fn(() => ({ set: batchSet, commit: batchCommit }));
const mockDoc = vi.fn((_db, col, id) => ({ _ref: `${col}/${id}` }));
const mockServerTimestamp = vi.fn(() => 'SERVER_TS');

vi.mock('firebase/firestore', () => ({
  writeBatch: (...a) => mockWriteBatch(...a),
  doc: (...a) => mockDoc(...a),
  serverTimestamp: () => mockServerTimestamp(),
}));

import { applyPicksToOpenStages } from './applyPicksToOpenStages';

// Etape 1 er åben (kickoff i fremtiden), etape 2 er låst (kickoff i fortiden),
// etape 3 er afgjort (hasResults).
const NOW = Date.parse('2026-07-04T10:00:00+02:00');
function makeStages() {
  return [
    { id: '2026-stage-1', season: 2026, number: 1, kickoff: '2026-07-05T12:00:00+02:00' },
    { id: '2026-stage-2', season: 2026, number: 2, kickoff: '2026-07-03T12:00:00+02:00' },
    { id: '2026-stage-3', season: 2026, number: 3, kickoff: '2026-07-06T12:00:00+02:00', hasResults: true },
  ];
}

const PICKS = { winnerTeam: 'UAD', gcTeam: 'TVL', mountainTeam: 'EFE', sprintTeam: 'SOQ' };

describe('applyPicksToOpenStages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('skriver kun til åbne etaper og commit\'er én batch', async () => {
    const n = await applyPicksToOpenStages('uid-1', PICKS, makeStages(), NOW);
    expect(n).toBe(1); // kun etape 1 er åben
    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    expect(batchSet).toHaveBeenCalledTimes(1);
    expect(batchCommit).toHaveBeenCalledTimes(1);
    // doc-ref peger på den åbne etape
    expect(mockDoc).toHaveBeenCalledWith({ _db: true }, 'stageBets', 'uid-1_2026-stage-1');
  });

  it('skriver dokument-formen uden points', async () => {
    await applyPicksToOpenStages('uid-1', PICKS, makeStages(), NOW);
    const payload = batchSet.mock.calls[0][1];
    const opts = batchSet.mock.calls[0][2];
    expect(payload).toEqual({
      uid: 'uid-1',
      stageId: '2026-stage-1',
      season: 2026,
      winnerTeam: 'UAD',
      gcTeam: 'TVL',
      mountainTeam: 'EFE',
      sprintTeam: 'SOQ',
      updatedAt: 'SERVER_TS',
    });
    expect(payload.points).toBeUndefined();
    expect(opts).toEqual({ merge: true });
  });

  it('skriver til flere åbne etaper i samme batch', async () => {
    const stages = [
      { id: '2026-stage-1', season: 2026, number: 1, kickoff: '2026-07-05T12:00:00+02:00' },
      { id: '2026-stage-4', season: 2026, number: 4, kickoff: '2026-07-08T12:00:00+02:00' },
    ];
    const n = await applyPicksToOpenStages('uid-1', PICKS, stages, NOW);
    expect(n).toBe(2);
    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    expect(batchSet).toHaveBeenCalledTimes(2);
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('gør intet uden uid', async () => {
    const n = await applyPicksToOpenStages(null, PICKS, makeStages(), NOW);
    expect(n).toBe(0);
    expect(mockWriteBatch).not.toHaveBeenCalled();
  });

  it('committer ikke når der ingen åbne etaper er', async () => {
    const stages = [{ id: '2026-stage-2', season: 2026, number: 2, kickoff: '2026-07-03T12:00:00+02:00' }];
    const n = await applyPicksToOpenStages('uid-1', PICKS, stages, NOW);
    expect(n).toBe(0);
    expect(mockWriteBatch).not.toHaveBeenCalled();
    expect(batchCommit).not.toHaveBeenCalled();
  });
});
