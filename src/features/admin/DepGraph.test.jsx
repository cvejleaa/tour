import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import DepGraph, { naboGrupper, filKanterFor, udfoldning, filNaboer, layoutBlokke, navnAf } from './DepGraph';
import rigtig from '../../data/depGraph.json';

// En lille kodebase: app-skal → to sider → games/lib; games har en INTERN kant
// (G importerer H), og G importerer l.js to gange (count 2).
const FILER = [
  { id: 'src/App.jsx', gruppe: 'app-skal' },                // 0
  { id: 'src/pages/A.jsx', gruppe: 'pages' },               // 1
  { id: 'src/pages/B.jsx', gruppe: 'pages' },               // 2
  { id: 'src/features/games/G.jsx', gruppe: 'features/games' }, // 3
  { id: 'src/features/games/H.jsx', gruppe: 'features/games' }, // 4
  { id: 'src/lib/l.js', gruppe: 'lib (kerne)' },            // 5
  { id: 'src/firebase.js', gruppe: 'firebase' },            // 6
];
const GRAF = {
  generatedAt: '2026-09-04T12:00:00.000Z',
  nodes: [
    { id: 'firebase', layer: 0, files: 1 },
    { id: 'lib (kerne)', layer: 0, files: 1 },
    { id: 'features/games', layer: 2, files: 2 },
    { id: 'pages', layer: 3, files: 2 },
    { id: 'app-skal', layer: 4, files: 1 },
  ],
  edges: [
    { from: 'app-skal', to: 'pages', count: 2 },
    { from: 'pages', to: 'features/games', count: 1 },
    { from: 'pages', to: 'lib (kerne)', count: 2 },
    { from: 'features/games', to: 'lib (kerne)', count: 3 },
    { from: 'features/games', to: 'firebase', count: 1 },
  ],
  filer: FILER,
  filKanter: [[0, 1], [0, 2], [1, 3], [1, 5], [2, 5], [3, 4], [3, 5], [3, 5], [4, 5], [4, 6]],
};

const kasser = () => screen.getAllByTestId('dep-kasse').map((k) => k.dataset.id);
const kasse = (id) => screen.getAllByTestId('dep-kasse').find((k) => k.dataset.id === id);
const filKasse = (id) => screen.queryAllByTestId('dep-fil-kasse').find((k) => k.dataset.id === id);
const kant = (id) => screen.queryAllByTestId('dep-kant').find((k) => k.dataset.id === id);
const hit = (id) => screen.getAllByTestId('dep-kant-hit').find((k) => k.dataset.id === id);
const fremhaevede = () => Object.fromEntries(screen.getAllByTestId('dep-kant').map((k) => [k.dataset.id, k.dataset.fremhaevet]));

describe('DepGraph — fuld visning, peg og klik på pile', () => {
  it('tegner alle kasser og pile, ingen fremhævet, og panelet er tomt', () => {
    render(<DepGraph graf={GRAF} />);
    expect(kasser().sort()).toEqual(['app-skal', 'features/games', 'firebase', 'lib (kerne)', 'pages']);
    expect(screen.getAllByTestId('dep-kant')).toHaveLength(5);
    expect(Object.values(fremhaevede()).every((f) => f === 'normal')).toBe(true);
    expect(screen.queryByTestId('dep-panel')).not.toBeInTheDocument();
    // Forklaringen nævner de tre gestus i den rækkefølge, de opdages.
    const f = screen.getByTestId('dep-forklaring').textContent;
    expect(f.indexOf('Peg')).toBeLessThan(f.indexOf('Klik'));
    expect(f.indexOf('Klik')).toBeLessThan(f.indexOf('Dobbeltklik'));
    expect(f).toContain('«Fold ud i filer»');
    expect(f).toContain('«Vis hele diagrammet»');
  });

  it('peg på en kasse: dens pile tegnes op med retning (ud = blå, ind = orange), resten dæmpes — og slipper igen', () => {
    render(<DepGraph graf={GRAF} />);
    fireEvent.mouseEnter(kasse('pages'));
    expect(fremhaevede()).toEqual({
      'app-skal→pages': 'ind',
      'pages→features/games': 'ud',
      'pages→lib (kerne)': 'ud',
      'features/games→lib (kerne)': 'nej',
      'features/games→firebase': 'nej',
    });
    // Nabokasser i fuld farve, ikke-naboer dæmpet — men de STÅR der (ingen omberegning).
    expect(kasse('firebase').dataset.daempet).toBe('true');
    expect(kasse('lib (kerne)').dataset.daempet).toBe('false');
    expect(screen.getByTestId('dep-hover')).toHaveTextContent('pages: blå = det den importerer, orange = det der importerer den');
    fireEvent.mouseLeave(kasse('pages'));
    expect(Object.values(fremhaevede()).every((f) => f === 'normal')).toBe(true);
    expect(kasse('firebase').dataset.daempet).toBe('false');
  });

  it('peg på en pil: titlen siger hvem → hvem og hvor mange imports', () => {
    render(<DepGraph graf={GRAF} />);
    fireEvent.mouseEnter(hit('pages→lib (kerne)'));
    expect(screen.getByTestId('dep-hover')).toHaveTextContent('pages → lib (kerne): 2 imports');
    expect(fremhaevede()['pages→lib (kerne)']).toBe('ja');
    expect(within(hit('features/games→firebase')).getByText('games → firebase: 1 import')).toBeInTheDocument();
  });

  it('klik på en pil: panelet lister de konkrete fil-imports bag den, dedupleret med antal', () => {
    render(<DepGraph graf={GRAF} />);
    fireEvent.click(hit('features/games→lib (kerne)'));
    const panel = screen.getByTestId('dep-panel');
    expect(panel).toHaveTextContent('games → lib (kerne) · 3 imports');
    const linjer = within(panel).getAllByRole('listitem').map((l) => l.textContent);
    expect(linjer).toEqual(['G.jsx → l.js (2)', 'H.jsx → l.js']);
    // Kassernes positioner er urørte af et kant-klik.
    fireEvent.click(hit('pages→lib (kerne)'));
    expect(within(screen.getByTestId('dep-panel')).getAllByRole('listitem').map((l) => l.textContent)).toEqual(['A.jsx → l.js', 'B.jsx → l.js']);
  });
});

describe('DepGraph — fokus på en kasse', () => {
  it('klik på en kasse: kun dens pile tegnes, ikke-naboer tømmes men flytter sig ikke, panelet viser filer og naboer med tal', () => {
    render(<DepGraph graf={GRAF} />);
    const foer = kasse('lib (kerne)').getAttribute('transform');
    fireEvent.click(kasse('features/games'));
    // Kasser: alle fem står der stadig — app-skal og pages er dæmpet (ikke naboer).
    expect(kasser()).toHaveLength(5);
    expect(kasse('app-skal').dataset.daempet).toBe('true');
    expect(kasse('lib (kerne)').dataset.daempet).toBe('false');
    expect(kasse('lib (kerne)').getAttribute('transform')).toBe(foer);
    // Dæmpede kasser har ingen tekst (og kan ikke tabbes til).
    expect(kasse('app-skal').textContent).toBe('');
    expect(kasse('app-skal').getAttribute('tabindex')).toBe('-1');
    // Kun naboernes kanter tegnes: app-skal→pages er væk.
    expect(kant('app-skal→pages')).toBeUndefined();
    expect(fremhaevede()).toEqual({
      'pages→features/games': 'ind',
      'features/games→lib (kerne)': 'ud',
      'features/games→firebase': 'ud',
    });
    const panel = screen.getByTestId('dep-panel');
    expect(panel).toHaveTextContent('games · 2 filer');
    expect(panel).toHaveTextContent('Importerer (2 grupper)');
    expect(panel).toHaveTextContent('lib (kerne) (3)');
    expect(panel).toHaveTextContent('Importeres af (1 grupper)');
    expect(panel).toHaveTextContent('pages (1)');
    expect(panel).toHaveTextContent('G.jsx');
    expect(panel).toHaveTextContent('H.jsx');
    // «Vis hele diagrammet» genopretter alt.
    fireEvent.click(screen.getByTestId('dep-vis-alt'));
    expect(screen.getAllByTestId('dep-kant')).toHaveLength(5);
    expect(kasse('app-skal').dataset.daempet).toBe('false');
    expect(screen.queryByTestId('dep-panel')).not.toBeInTheDocument();
  });

  it('klik på en nabo flytter fokus; «← Tilbage» går ét trin tilbage; Esc går helt ud', () => {
    render(<DepGraph graf={GRAF} />);
    fireEvent.click(kasse('pages'));
    expect(screen.getByTestId('dep-tilbage')).toBeInTheDocument(); // tilbage = den fulde visning
    fireEvent.click(kasse('features/games'));
    expect(screen.getByTestId('dep-panel')).toHaveTextContent('games · 2 filer');
    fireEvent.click(screen.getByTestId('dep-tilbage'));
    expect(screen.getByTestId('dep-panel')).toHaveTextContent('pages · 2 filer');
    fireEvent.keyDown(kasse('pages'), { key: 'Escape' });
    expect(screen.queryByTestId('dep-panel')).not.toBeInTheDocument();
    expect(kasse('firebase').dataset.daempet).toBe('false');
  });

  it('tastatur: Enter og Space på en kasse giver fokus (role=button)', () => {
    render(<DepGraph graf={GRAF} />);
    expect(kasse('pages').getAttribute('role')).toBe('button');
    expect(kasse('pages').getAttribute('aria-label')).toBe('pages, 2 filer');
    fireEvent.keyDown(kasse('pages'), { key: 'Enter' });
    expect(screen.getByTestId('dep-panel')).toHaveTextContent('pages · 2 filer');
    fireEvent.click(screen.getByTestId('dep-vis-alt'));
    fireEvent.keyDown(kasse('lib (kerne)'), { key: ' ' });
    expect(screen.getByTestId('dep-panel')).toHaveTextContent('lib (kerne) · 1 fil');
  });
});

describe('DepGraph — fold ud i filer', () => {
  it('dobbeltklik på pages: filerne står i egen blok med etiket, kun nabogrupperne vises, og fladen siger, at ingen af siderne importerer hinanden', () => {
    render(<DepGraph graf={GRAF} />);
    fireEvent.doubleClick(kasse('pages'));
    expect(filKasse('src/pages/A.jsx')).toBeDefined();
    expect(filKasse('src/pages/B.jsx')).toBeDefined();
    expect(filKasse('src/pages/A.jsx').textContent).toContain('A.jsx');
    expect(screen.getByTestId('dep-blok-etiket')).toHaveTextContent('pages');
    // Nabogrupper: app-skal, games, lib — IKKE firebase (rører ikke pages), og IKKE pages selv.
    expect(kasser().sort()).toEqual(['app-skal', 'features/games', 'lib (kerne)']);
    // Kanter fil↔gruppe.
    expect(Object.keys(fremhaevede()).sort()).toEqual([
      'src/App.jsx→src/pages/A.jsx', 'src/App.jsx→src/pages/B.jsx',
      'src/pages/A.jsx→features/games', 'src/pages/A.jsx→lib (kerne)', 'src/pages/B.jsx→lib (kerne)',
    ].map((k) => k.replace('src/App.jsx', 'app-skal')).sort());
    expect(screen.getByTestId('dep-interne')).toHaveTextContent('Ingen af filerne i pages importerer hinanden');
    expect(screen.getByTestId('dep-panel')).toHaveTextContent('pages · foldet ud i 2 filer, 3 nabogrupper');
    // «Fold sammen» går tilbage til gruppen i fokus.
    fireEvent.click(screen.getByTestId('dep-fold-sammen'));
    expect(screen.queryAllByTestId('dep-fil-kasse')).toHaveLength(0);
    expect(screen.getByTestId('dep-panel')).toHaveTextContent('pages · 2 filer');
  });

  it('games foldet ud tegner den INTERNE kant G → H, og klik på en fil viser dens naboer på fil-niveau', () => {
    render(<DepGraph graf={GRAF} />);
    fireEvent.click(kasse('features/games'));
    fireEvent.click(screen.getByTestId('dep-fold-ud')); // knappen — ikke kun dobbeltklik
    expect(kant('src/features/games/G.jsx→src/features/games/H.jsx')).toBeDefined();
    expect(screen.getByTestId('dep-interne')).toHaveTextContent('1 interne forbindelser');
    // Mest forbundne fil først: G (4 kanter) før H (3).
    expect(screen.getAllByTestId('dep-fil-kasse').map((k) => k.dataset.id)).toEqual(['src/features/games/G.jsx', 'src/features/games/H.jsx']);
    fireEvent.click(filKasse('src/features/games/G.jsx'));
    const panel = screen.getByTestId('dep-panel');
    expect(panel).toHaveTextContent('G.jsx · src/features/games/G.jsx');
    expect(panel).toHaveTextContent('Importerer (2)');
    expect(panel).toHaveTextContent('l.js (lib (kerne), 2)');
    expect(panel).toHaveTextContent('H.jsx (games)');
    expect(panel).toHaveTextContent('Importeres af (1)');
    expect(panel).toHaveTextContent('A.jsx (pages)');
    // Fokus på en fil dæmper H? Nej — H er nabo. lib er nabo. firebase er ikke.
    expect(filKasse('src/features/games/H.jsx').dataset.daempet).toBe('false');
    expect(kasse('firebase').dataset.daempet).toBe('true');
    // Peg på en fil-kant: titlen bruger filnavne.
    fireEvent.mouseEnter(hit('src/features/games/G.jsx→lib (kerne)'));
    expect(screen.getByTestId('dep-hover')).toHaveTextContent('G.jsx → lib (kerne): 2 imports');
  });

  it('et gammelt øjebliksbillede uden fil-niveau: fokus virker, men udfoldning kan ikke — og panelet siger hvorfor', () => {
    const gammel = { generatedAt: GRAF.generatedAt, nodes: GRAF.nodes, edges: GRAF.edges };
    render(<DepGraph graf={gammel} />);
    fireEvent.doubleClick(kasse('pages'));
    expect(screen.queryAllByTestId('dep-fil-kasse')).toHaveLength(0);
    fireEvent.click(kasse('pages'));
    expect(screen.getByTestId('dep-panel')).toHaveTextContent('Fil-niveauet mangler i dette øjebliksbillede');
    expect(screen.getByTestId('dep-panel')).toHaveTextContent('Opdatér test-rapporten');
  });
});

describe('hjælperne', () => {
  it('naboGrupper, filKanterFor, udfoldning, filNaboer, navnAf', () => {
    expect([...naboGrupper(GRAF, 'pages')].sort()).toEqual(['app-skal', 'features/games', 'lib (kerne)']);
    expect(filKanterFor(GRAF, 'features/games', 'lib (kerne)')).toEqual([
      { fra: 'src/features/games/G.jsx', til: 'src/lib/l.js', antal: 2 },
      { fra: 'src/features/games/H.jsx', til: 'src/lib/l.js', antal: 1 },
    ]);
    const u = udfoldning(GRAF, 'features/games');
    expect(u.filer).toEqual(['src/features/games/G.jsx', 'src/features/games/H.jsx']);
    expect(u.interne).toEqual([{ from: 'src/features/games/G.jsx', to: 'src/features/games/H.jsx', antal: 1 }]);
    expect(u.ud).toEqual(expect.arrayContaining([{ from: 'src/features/games/G.jsx', to: 'lib (kerne)', antal: 2 }, { from: 'src/features/games/H.jsx', to: 'firebase', antal: 1 }]));
    expect(u.ind).toEqual([{ from: 'pages', to: 'src/features/games/G.jsx', antal: 1 }]);
    expect(udfoldning({ ...GRAF, filer: [] }, 'pages')).toBeNull();
    expect(filNaboer(GRAF, 'src/lib/l.js').ind.map((x) => `${x.id}:${x.antal}`)).toEqual(['src/features/games/G.jsx:2', 'src/features/games/H.jsx:1', 'src/pages/A.jsx:1', 'src/pages/B.jsx:1']);
    expect(navnAf('features/games')).toBe('games');
    expect(navnAf('src/pages/A.jsx')).toBe('A.jsx');
    expect(navnAf('lib (kerne)')).toBe('lib (kerne)');
  });

  it('layoutBlokke: en etiketteret blok får egne rækker og venstre margen; lag stables med det højeste øverst', () => {
    const l = layoutBlokke([
      { layer: 3, items: ['f1', 'f2', 'f3'], w: 96, perRow: 2, label: 'pages' },
      { layer: 3, items: ['g'], w: 116, perRow: 7 },
      { layer: 0, items: ['lib'], w: 116, perRow: 7 },
    ]);
    expect(l.etiketter).toEqual([{ label: 'pages', x: 8, y: expect.any(Number) }]);
    expect(l.pos.f1.y).toBe(l.pos.f2.y);
    expect(l.pos.f3.y).toBeGreaterThan(l.pos.f1.y);   // ombrudt til række 2
    expect(l.pos.g.y).toBeGreaterThan(l.pos.f3.y);    // egen række efter filerne
    expect(l.pos.lib.y).toBeGreaterThan(l.pos.g.y);   // lavere lag = længere nede
    expect(l.pos.f1.x).toBeGreaterThan(96);           // margen til etiketten
    expect(l.height).toBeGreaterThan(l.pos.lib.y);
  });
});

describe('den RIGTIGE depGraph.json i komponenten', () => {
  it('rendrer alle grupper, og app-skal er præcis App.jsx og main.jsx (fallback-vagt)', () => {
    render(<DepGraph graf={rigtig} />);
    expect(kasser()).toHaveLength(rigtig.nodes.length);
    expect(rigtig.filer.filter((f) => f.gruppe === 'app-skal').map((f) => f.id).sort()).toEqual(['src/App.jsx', 'src/main.jsx']);
    // Udfoldning af pages: filerne står der, og ingen interne kanter (målt 4/9 2026).
    fireEvent.doubleClick(kasse('pages'));
    expect(screen.getAllByTestId('dep-fil-kasse').length).toBe(rigtig.nodes.find((n) => n.id === 'pages').files);
    expect(screen.getByTestId('dep-interne')).toHaveTextContent('Ingen af filerne i pages importerer hinanden');
  });
});
