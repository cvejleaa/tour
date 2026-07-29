/**
 * Tests for useGames.
 * Den rene hjælpefunktion splitGames testes uden Firebase.
 */
import { describe, it, expect, vi } from 'vitest';

// Undgå at trække den rigtige Firebase-init ind (useGames.js importerer db).
vi.mock('../../firebase', () => ({ db: {}, auth: {} }));

import { splitGames } from './useGames';

const games = [
  { id: 'a', name: 'Alpha', order: 2, joinable: true, status: 'open' },
  { id: 'b', name: 'Beta', order: 1, joinable: true, status: 'live' },
  { id: 'c', name: 'Gamma', order: 3, joinable: false, status: 'open' },
  { id: 'd', name: 'Delta', order: 4, joinable: true, status: 'finished' },
];

describe('splitGames', () => {
  it('lægger spil jeg deltager i under "mine"', () => {
    const { mine } = splitGames(games, new Set(['a', 'b']));
    expect(mine.map((g) => g.id)).toEqual(['b', 'a']); // sorteret efter order
  });

  it('accepterer også et array af id\'er', () => {
    const { mine } = splitGames(games, ['a']);
    expect(mine.map((g) => g.id)).toEqual(['a']);
  });

  it('"åbne" = spil jeg IKKE er med i, joinable og ikke afsluttet', () => {
    const { open } = splitGames(games, new Set(['a']));
    // b er joinable+live (ikke mit) → med. c er ikke joinable → ude.
    // d er finished → ude. a er mit → ude.
    expect(open.map((g) => g.id)).toEqual(['b']);
  });

  it('udelader afsluttede spil fra "åbne"', () => {
    const { open } = splitGames(games, new Set());
    expect(open.map((g) => g.id)).not.toContain('d');
  });

  it('udelader ikke-joinable spil fra "åbne"', () => {
    const { open } = splitGames(games, new Set());
    expect(open.map((g) => g.id)).not.toContain('c');
  });

  it('sorterer begge lister efter order', () => {
    const { mine, open } = splitGames(games, new Set(['a', 'b']));
    expect(mine.map((g) => g.order)).toEqual([1, 2]);
    expect(open.map((g) => g.order)).toEqual(open.map((g) => g.order).slice().sort((x, y) => x - y));
  });

  it('tolererer tomme/undefined input', () => {
    expect(splitGames(undefined, undefined)).toEqual({ mine: [], open: [], external: [] });
    expect(splitGames([], new Set())).toEqual({ mine: [], open: [], external: [] });
  });

  it('lægger eksterne spil (externalUrl) under "external" — uanset medlemskab', () => {
    const withExt = [
      ...games,
      { id: 'e', name: 'Ekstern', order: 5, joinable: false, status: 'live', externalUrl: 'https://tour.vejleaa.dk' },
    ];
    // Ikke medlem: stadig i external, aldrig i open/mine.
    const a = splitGames(withExt, new Set());
    expect(a.external.map((g) => g.id)).toEqual(['e']);
    expect(a.open.map((g) => g.id)).not.toContain('e');
    // Selv hvis man "er medlem": vises som link-ud, ikke under mine.
    const b = splitGames(withExt, new Set(['e']));
    expect(b.external.map((g) => g.id)).toEqual(['e']);
    expect(b.mine.map((g) => g.id)).not.toContain('e');
  });

  // Et afsluttet eksternt spil må IKKE forsvinde fra oversigten: appen kører
  // stadig, og stillingen skal kunne slås op bagefter. Tidligere faldt det ud
  // af alle tre lister på én gang og var dermed usynligt for alle, der ikke
  // tilfældigvis havde et players-dokument i spillet.
  it('afsluttede eksterne spil bliver stående som link-ud', () => {
    const withExt = [{ id: 'f', name: 'Slut', order: 1, joinable: false, status: 'finished', externalUrl: 'https://x' }];
    const { external, mine, open } = splitGames(withExt, new Set());
    expect(external.map((g) => g.id)).toEqual(['f']);
    // …men det reklameres stadig ikke som noget, man kan deltage i.
    expect(open).toEqual([]);
    expect(mine).toEqual([]);
  });

  it('afsluttet eksternt spil er stadig ude af "åbne", selv når det er joinable', () => {
    const withExt = [{ id: 'g', name: 'Slut2', order: 1, joinable: true, status: 'finished', externalUrl: 'https://x' }];
    expect(splitGames(withExt, new Set()).open).toEqual([]);
  });
});
