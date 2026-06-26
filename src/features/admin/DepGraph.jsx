// Arkitektur-/afhængighedsdiagram tegnet som SVG ud fra de faktiske imports
// i koden (src/data/depGraph.json, genereret af scripts/build-dep-graph.mjs).
import graph from '../../data/depGraph.json';

const W = 1120;
const TOP = 40;
const NODE_W = 116;
const NODE_H = 44;
const PER_ROW = 7;     // maks. noder pr. visuel under-række i et lag
const SUB_GAP = 34;    // lodret afstand mellem under-rækker i samme lag
const BAND_GAP = 78;   // lodret afstand mellem lag

// Farve pr. kategori
function colorFor(id, layer) {
  if (id === 'firebase' || id === 'Cloud Functions') return { fill: '#fff4e6', stroke: '#e8a317', text: '#9a6a00' };
  if (id === 'lib (kerne)') return { fill: '#f3eaff', stroke: '#8b5cf6', text: '#5b21b6' };
  if (id === 'context') return { fill: '#e9f0ff', stroke: '#3b6fd6', text: '#1e40af' };
  if (id === 'components') return { fill: '#e6fbf6', stroke: '#0d9488', text: '#0f766e' };
  if (id === 'pages') return { fill: '#fff7e0', stroke: '#d6a700', text: '#7a5a00' };
  if (id === 'app-skal') return { fill: '#eef2f6', stroke: '#475569', text: '#334155' };
  if (layer === 2) return { fill: 'rgba(11,110,79,0.10)', stroke: '#0b6e4f', text: '#074b36' }; // features
  return { fill: 'var(--c-bg)', stroke: 'var(--c-border)', text: 'var(--c-text)' };
}

function shortLabel(id) {
  return id.startsWith('features/') ? id.slice('features/'.length) : id;
}

// Beregn positioner: lag stables lodret (højt lag øverst); brede lag ombrydes
// til flere under-rækker, så etiketter ikke overlapper.
function computeLayout(nodes) {
  const layers = [...new Set(nodes.map((n) => n.layer))].sort((a, b) => b - a); // top → bund
  const pos = {};
  let y = TOP;

  for (const layer of layers) {
    const inLayer = nodes.filter((n) => n.layer === layer);
    const rows = Math.ceil(inLayer.length / PER_ROW);
    const perRow = Math.ceil(inLayer.length / rows);

    inLayer.forEach((n, i) => {
      const r = Math.floor(i / perRow);
      const idxInRow = i % perRow;
      const isLastRow = r === rows - 1;
      const countInRow = isLastRow ? inLayer.length - perRow * (rows - 1) : perRow;
      pos[n.id] = {
        x: ((idxInRow + 1) / (countInRow + 1)) * W,
        y: y + r * (NODE_H + SUB_GAP) + NODE_H / 2,
      };
    });

    const bandHeight = rows * NODE_H + (rows - 1) * SUB_GAP;
    y += bandHeight + BAND_GAP;
  }

  return { pos, height: y - BAND_GAP + TOP };
}

export default function DepGraph() {
  const { pos, height: H } = computeLayout(graph.nodes);
  const maxCount = Math.max(...graph.edges.map((e) => e.count), 1);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 760, display: 'block' }} role="img"
        aria-label="Afhængighedsdiagram over kodemodulerne">
        <defs>
          <marker id="dep-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--c-muted)" />
          </marker>
        </defs>

        {/* Kanter (importer → importeret) */}
        {graph.edges.map((e, i) => {
          const a = pos[e.from], b = pos[e.to];
          if (!a || !b) return null;
          const x1 = a.x, y1 = a.y + NODE_H / 2;       // bund af importer
          const x2 = b.x, y2 = b.y - NODE_H / 2;        // top af importeret
          const my = (y1 + y2) / 2;
          const d = `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
          const sw = Math.max(0.8, Math.min(3.5, e.count / (maxCount / 4)));
          return (
            <path key={i} d={d} fill="none" stroke="var(--c-muted)"
              strokeWidth={sw} strokeOpacity={0.22} markerEnd="url(#dep-arrow)" />
          );
        })}

        {/* Noder */}
        {graph.nodes.map((n) => {
          const p = pos[n.id];
          const c = colorFor(n.id, n.layer);
          return (
            <g key={n.id} transform={`translate(${p.x - NODE_W / 2}, ${p.y - NODE_H / 2})`}>
              <rect width={NODE_W} height={NODE_H} rx="9" fill={c.fill} stroke={c.stroke} strokeWidth="1.5" />
              <text x={NODE_W / 2} y={NODE_H / 2 - 2} textAnchor="middle" fontSize="12.5" fontWeight="700" fill={c.text}>
                {shortLabel(n.id)}
              </text>
              <text x={NODE_W / 2} y={NODE_H / 2 + 13} textAnchor="middle" fontSize="9.5" fill="var(--c-muted)">
                {n.files} fil{n.files === 1 ? '' : 'er'}
              </text>
            </g>
          );
        })}
      </svg>
      <p style={{ fontSize: '0.78rem', color: 'var(--c-muted)', marginTop: '0.4rem' }}>
        Pilene viser hvilke moduler der importerer hvilke (nederst = fundament, øverst = app-skal).
        Tykkere pile = flere imports. Brede lag er fordelt på flere rækker for læsbarhed.
      </p>
    </div>
  );
}
