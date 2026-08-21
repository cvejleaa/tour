import { describe, it, expect } from 'vitest';
import { mergeGameLeagues } from './useMyLeaguesAcrossGames';

describe('mergeGameLeagues', () => {
  it('fladgør {gameId → ligaer} til én liste, hver mærket med sit gameId', () => {
    const out = mergeGameLeagues({
      g2: [{ id: 'L3', memberUids: ['me', 'a'] }],
      g1: [{ id: 'L1', memberUids: ['me'] }, { id: 'L2', memberUids: ['me', 'b'] }],
    });
    // Stabil rækkefølge: gameId først (g1 før g2), så liga-id. Og gameId-mærket
    // SKAL være spillet, ligaen kom fra — en mutation, der taber mærket eller
    // sætter det forkert, bliver rød.
    expect(out).toEqual([
      { id: 'L1', memberUids: ['me'], gameId: 'g1' },
      { id: 'L2', memberUids: ['me', 'b'], gameId: 'g1' },
      { id: 'L3', memberUids: ['me', 'a'], gameId: 'g2' },
    ]);
  });

  it('bevarer et eksisterende gameId-felt ikke — mærket vinder over data', () => {
    // Skulle et liga-dokument selv indeholde et (forkert) gameId, skal
    // mærkningen fra den samling, det faktisk kom fra, vinde.
    const out = mergeGameLeagues({ gTrue: [{ id: 'L', gameId: 'gWrong' }] });
    expect(out).toEqual([{ id: 'L', gameId: 'gTrue' }]);
  });

  it('håndterer tomt/undefined input', () => {
    expect(mergeGameLeagues({})).toEqual([]);
    expect(mergeGameLeagues(null)).toEqual([]);
    expect(mergeGameLeagues({ g1: [] })).toEqual([]);
  });
});
