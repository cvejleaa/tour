// Arkitektur-/afhængighedsdiagram tegnet som SVG ud fra de faktiske imports
// i koden (src/data/depGraph.json, genereret af scripts/build-dep-graph.mjs).
//
// INTERAKTIVT (ejerens ønske 4/9 2026): peg på en kasse, og dens forbindelser
// tegnes op; klik på en kant, og de konkrete fil-imports listes; klik på en
// kasse, og diagrammet vises med fokus ud fra den; dobbeltklik (eller knappen
// «Fold ud i filer»), og kassen brydes ned i sine filer med afhængighederne
// tegnet ind — også de interne (features/games har 106 fil-kanter indbyrdes;
// pages har nul, og det siger fladen selv).
//
// TRE BESLUTNINGER FRA QC PÅ PLANEN:
// - Fokus OMBEREGNER IKKE layoutet. Kasserne bliver, hvor de står; ikke-naboer
//   tømmes for tekst og kanter. Ellers hoppede hele billedet ved hvert klik på
//   en nabo — og «tegnet med fokus ud fra den» kræver, at man kan følge med.
// - Udfoldning INDEBÆRER fokus: der vises kun den udfoldede gruppes filer og
//   de grupper, den rører. Udfoldet i fuld visning gav 185–214 streger.
// - Fil-kasser får hele rækker for sig selv med gruppenavnet i venstre margen.
//
// MÅLINGEN AF KLIK: fladevagten (scripts/flade-vagt.mjs) ser click/input/
// change/submit — ikke hover og ikke dobbeltklik. Testene rører derfor
// dobbeltklik-grenen eksplicit, og panelets knapper er den vej, en test (og
// en finger) kan gå. Kanter har et usynligt, bredt hit-område bag stregen,
// fordi en 1–3 px bezier ikke kan rammes med en finger.
import { useMemo, useState } from 'react';
import graph from '../../data/depGraph.json';

const W = 1120;
const TOP = 40;
const NODE_W = 116;
const FIL_W = 96;
const NODE_H = 44;
const PER_ROW = 7;      // maks. gruppekasser pr. række i et lag
const FIL_PER_ROW = 9;  // fil-kasser er smallere — 10 gav 93 px centerafstand mod 96 px bredde (QC)
const SUB_GAP = 34;     // lodret afstand mellem rækker i samme lag
const BAND_GAP = 78;    // lodret afstand mellem lag
const MARGEN = 96;      // venstre margen til gruppenavn ved en udfoldet blok

const FARVE_UD = '#3b6fd6';   // det, kassen importerer (pil nedad)
const FARVE_IND = '#e8a317';  // det, der importerer kassen (pil oppefra)

// Farve pr. kategori
function colorFor(id, layer) {
  if (id === 'firebase' || id.startsWith('Cloud Functions')) return { fill: '#fff4e6', stroke: '#e8a317', text: '#9a6a00' };
  if (id === 'lib (kerne)') return { fill: '#f3eaff', stroke: '#8b5cf6', text: '#5b21b6' };
  if (id === 'context') return { fill: '#e9f0ff', stroke: '#3b6fd6', text: '#1e40af' };
  if (id === 'components') return { fill: '#e6fbf6', stroke: '#0d9488', text: '#0f766e' };
  if (id === 'pages') return { fill: '#fff7e0', stroke: '#d6a700', text: '#7a5a00' };
  if (id === 'app-skal') return { fill: '#eef2f6', stroke: '#475569', text: '#334155' };
  // Afhængighedsgrafen tegner sine egne lag-farver og skal IKKE følge et
  // holdtema: den er et diagram, ikke en flade i spillet.
  if (layer === 2) return { fill: 'rgba(11,110,79,.1)', stroke: '#0b6e4f', text: '#074b36' }; // features
  return { fill: 'var(--c-bg)', stroke: 'var(--c-border)', text: 'var(--c-text)' };
}

export function shortLabel(id) {
  return id.startsWith('features/') ? id.slice('features/'.length) : id;
}

/** Filnavn uden mappe: 'src/pages/GamePage.jsx' → 'GamePage.jsx'. */
export function filNavn(id) {
  return id.slice(id.lastIndexOf('/') + 1);
}

/** Navnet på en kasse eller fil, som det står i diagrammet. */
export function navnAf(id) {
  return id.includes('/') && !id.startsWith('features/') ? filNavn(id) : shortLabel(id);
}

function afkort(s, n = 14) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// ---------------------------------------------------------------------------
// Rene hjælpere over grafen (eksporteret til tests)
// ---------------------------------------------------------------------------

/** Nabogrupper til en gruppe (kant i en af retningerne). */
export function naboGrupper(graf, gruppe) {
  const s = new Set();
  for (const e of graf.edges) {
    if (e.from === gruppe) s.add(e.to);
    if (e.to === gruppe) s.add(e.from);
  }
  return s;
}

/**
 * De konkrete fil-imports bag en gruppekant, dedupleret med antal:
 * [{ fra, til, antal }], sorteret. `fra`/`til` er fulde fil-id'er.
 */
export function filKanterFor(graf, from, to) {
  const filer = graf.filer || [];
  const m = new Map();
  for (const [i, j] of graf.filKanter || []) {
    const a = filer[i], b = filer[j];
    if (!a || !b || a.gruppe !== from || b.gruppe !== to) continue;
    const k = `${a.id}→${b.id}`;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].map(([k, antal]) => { const [fra, til] = k.split('→'); return { fra, til, antal }; })
    .sort((x, y) => x.fra.localeCompare(y.fra) || x.til.localeCompare(y.til));
}

/**
 * Alt, der skal tegnes, når en gruppe foldes ud: dens filer (mest forbundne
 * først), de interne kanter, kanter fil→gruppe og gruppe→fil (aggregeret pr.
 * fil) og nabogrupperne. Uden fil-niveau i dataen returneres null.
 */
export function udfoldning(graf, gruppe) {
  const filer = graf.filer || [];
  if (!filer.length) return null;
  const mine = filer.map((f, i) => ({ ...f, i })).filter((f) => f.gruppe === gruppe);
  const erMin = new Set(mine.map((f) => f.i));
  const interne = new Map();   // "i→j" → antal
  const ud = new Map();        // "filId→gruppe" → antal
  const ind = new Map();       // "gruppe→filId" → antal
  const grad = new Map();      // filId → antal kanter
  const tael = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  for (const [i, j] of graf.filKanter || []) {
    const a = filer[i], b = filer[j];
    if (!a || !b) continue;
    if (erMin.has(i) && erMin.has(j)) { tael(interne, `${a.id}→${b.id}`); tael(grad, a.id); tael(grad, b.id); }
    else if (erMin.has(i)) { tael(ud, `${a.id}→${b.gruppe}`); tael(grad, a.id); }
    else if (erMin.has(j)) { tael(ind, `${a.gruppe}→${b.id}`); tael(grad, b.id); }
  }
  const split = (m) => [...m.entries()].map(([k, antal]) => { const [from, to] = k.split('→'); return { from, to, antal }; });
  return {
    filer: mine.map((f) => f.id).sort((a, b) => (grad.get(b) || 0) - (grad.get(a) || 0) || a.localeCompare(b)),
    interne: split(interne),
    ud: split(ud),
    ind: split(ind),
    naboer: naboGrupper(graf, gruppe),
  };
}

/** Naboer på fil-niveau: hvad en fil importerer, og hvem der importerer den (dedupleret med antal). */
export function filNaboer(graf, filId) {
  const filer = graf.filer || [];
  const ud = new Map(), ind = new Map();
  for (const [i, j] of graf.filKanter || []) {
    const a = filer[i], b = filer[j];
    if (!a || !b) continue;
    if (a.id === filId) ud.set(b.id, (ud.get(b.id) || 0) + 1);
    if (b.id === filId) ind.set(a.id, (ind.get(a.id) || 0) + 1);
  }
  const liste = (m) => [...m.entries()].map(([id, antal]) => ({ id, antal })).sort((x, y) => y.antal - x.antal || x.id.localeCompare(y.id));
  return { ud: liste(ud), ind: liste(ind) };
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/**
 * Placerer "blokke" pr. lag (top = højeste lag). En blok er en liste af
 * kasser med egen bredde og rækkelængde — en udfoldet gruppes filer er én
 * blok med etiket i venstre margen, de øvrige kasser i laget en anden.
 * @param {Array<{layer:number, items:string[], w:number, perRow:number, label?:string}>} blokke
 */
export function layoutBlokke(blokke) {
  const lag = [...new Set(blokke.map((b) => b.layer))].sort((a, b) => b - a);
  const pos = {};
  const etiketter = [];
  let y = TOP;
  for (const l of lag) {
    const iLag = blokke.filter((b) => b.layer === l && b.items.length);
    let bandRows = 0;
    for (const b of iLag) {
      const rows = Math.ceil(b.items.length / b.perRow);
      const perRow = Math.ceil(b.items.length / rows);
      const x0 = b.label ? MARGEN : 0;
      const bredde = W - x0;
      b.items.forEach((id, i) => {
        const r = Math.floor(i / perRow);
        const idx = i % perRow;
        const sidste = r === rows - 1;
        const iRaekke = sidste ? b.items.length - perRow * (rows - 1) : perRow;
        pos[id] = { x: x0 + ((idx + 1) / (iRaekke + 1)) * bredde, y: y + (bandRows + r) * (NODE_H + SUB_GAP) + NODE_H / 2, w: b.w };
      });
      if (b.label) etiketter.push({ label: b.label, x: 8, y: y + bandRows * (NODE_H + SUB_GAP) + NODE_H / 2 });
      bandRows += rows;
    }
    y += bandRows * NODE_H + Math.max(0, bandRows - 1) * SUB_GAP + BAND_GAP;
  }
  return { pos, etiketter, height: y - BAND_GAP + TOP };
}

/** Fuld visning: hver gruppe én kasse, ombrudt pr. lag som før. */
function blokkeFuld(graf) {
  const lag = [...new Set(graf.nodes.map((n) => n.layer))];
  return lag.map((l) => ({ layer: l, items: graf.nodes.filter((n) => n.layer === l).map((n) => n.id), w: NODE_W, perRow: PER_ROW }));
}

/**
 * Udfoldet visning: gruppens filer i egen blok + nabogrupperne. Returnerer
 * også `grupper` — de nabogrupper, der blev placeret — og komponenten tegner
 * PRÆCIS dem: ét filter, ét sted (Test Managers mutation viste, at to
 * ens filtre kunne drive fra hinanden, uden at nogen test så det).
 */
function blokkeUdfoldet(graf, gruppe, u) {
  const lagAf = Object.fromEntries(graf.nodes.map((n) => [n.id, n.layer]));
  const grupper = graf.nodes.filter((n) => u.naboer.has(n.id));
  const lag = [...new Set([lagAf[gruppe], ...grupper.map((n) => n.layer)])];
  const blokke = [];
  for (const l of lag) {
    if (l === lagAf[gruppe]) blokke.push({ layer: l, items: u.filer, w: FIL_W, perRow: FIL_PER_ROW, label: shortLabel(gruppe) });
    blokke.push({ layer: l, items: grupper.filter((n) => n.layer === l).map((n) => n.id), w: NODE_W, perRow: PER_ROW });
  }
  return { blokke, grupper };
}

/** Kant-kurve: importer (bund) → importeret (top); i samme lag en bue nedenunder. */
function kantSti(a, b) {
  const x1 = a.x, x2 = b.x;
  if (Math.abs(a.y - b.y) < 1) {
    const y0 = a.y + NODE_H / 2;
    const dip = 22 + Math.abs(x1 - x2) / 10;
    return `M ${x1} ${y0} C ${x1} ${y0 + dip}, ${x2} ${y0 + dip}, ${x2 + (x2 > x1 ? -6 : 6)} ${y0 + 2}`;
  }
  const y1 = a.y + NODE_H / 2, y2 = b.y - NODE_H / 2;
  const my = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
}

// ---------------------------------------------------------------------------
// Komponenten
// ---------------------------------------------------------------------------

/**
 * Visningen: { udfoldet: gruppe|null, fokus: { type:'gruppe'|'fil', id }|null }.
 * `historik` er stakken af tidligere visninger — «← Tilbage».
 */
export default function DepGraph({ graf = graph }) {
  const [visning, setVisning] = useState({ udfoldet: null, fokus: null });
  const [historik, setHistorik] = useState([]);
  const [hover, setHover] = useState(null);      // { type: 'kasse'|'kant', id }
  const [valgtKant, setValgtKant] = useState(null); // { from, to, fil: boolean }

  const harFiler = (graf.filer || []).length > 0;
  const u = useMemo(() => (visning.udfoldet ? udfoldning(graf, visning.udfoldet) : null), [graf, visning.udfoldet]);

  // Kasser og kanter i den aktuelle visning. En kant er { id, from, to, antal, fil }.
  const { kasser, kanter, layout } = useMemo(() => {
    if (u) {
      const { blokke, grupper } = blokkeUdfoldet(graf, visning.udfoldet, u);
      const kasser = [
        ...u.filer.map((id) => ({ id, type: 'fil', gruppe: visning.udfoldet, label: afkort(filNavn(id)), fuldt: filNavn(id) })),
        ...grupper.map((n) => ({ id: n.id, type: 'gruppe', layer: n.layer, label: shortLabel(n.id), files: n.files })),
      ];
      const kanter = [
        ...u.interne.map((k) => ({ id: `${k.from}→${k.to}`, from: k.from, to: k.to, antal: k.antal, fil: true })),
        ...u.ud.map((k) => ({ id: `${k.from}→${k.to}`, from: k.from, to: k.to, antal: k.antal, fil: true })),
        ...u.ind.map((k) => ({ id: `${k.from}→${k.to}`, from: k.from, to: k.to, antal: k.antal, fil: true })),
      ];
      return { kasser, kanter, layout: layoutBlokke(blokke) };
    }
    const kasser = graf.nodes.map((n) => ({ id: n.id, type: 'gruppe', layer: n.layer, label: shortLabel(n.id), files: n.files }));
    const kanter = graf.edges.map((e) => ({ id: `${e.from}→${e.to}`, from: e.from, to: e.to, antal: e.count, fil: false }));
    return { kasser, kanter, layout: layoutBlokke(blokkeFuld(graf)) };
  }, [graf, u, visning.udfoldet]);

  const { pos, etiketter, height: H } = layout;
  const maxAntal = Math.max(...kanter.map((k) => k.antal), 1);

  // Fokus: naboer af den fokuserede kasse i DENNE visning.
  const fokusId = visning.fokus?.id || null;
  const fokusNaboer = useMemo(() => {
    if (!fokusId) return null;
    const s = new Set([fokusId]);
    for (const k of kanter) { if (k.from === fokusId) s.add(k.to); if (k.to === fokusId) s.add(k.from); }
    return s;
  }, [fokusId, kanter]);

  const hoverId = hover?.type === 'kasse' ? hover.id : null;
  /** 'ud' | 'ind' | 'ja' | 'nej' — hvordan en kant tegnes lige nu. */
  const fremhaevning = (k) => {
    const centrum = hoverId || fokusId;
    if (hover?.type === 'kant' && hover.id === k.id) return 'ja';
    if (!centrum) return valgtKant && valgtKant.id === k.id ? 'ja' : 'normal';
    if (k.from === centrum) return 'ud';
    if (k.to === centrum) return 'ind';
    return 'nej';
  };
  const kasseDaempet = (id) => {
    if (fokusNaboer && !fokusNaboer.has(id)) return true;
    if (hoverId && hoverId !== id) {
      return !kanter.some((k) => (k.from === hoverId && k.to === id) || (k.to === hoverId && k.from === id));
    }
    return false;
  };

  const gaaTil = (ny) => { setHistorik((h) => [...h, visning]); setVisning(ny); setValgtKant(null); setHover(null); };
  const tilbage = () => { setHistorik((h) => { const n = [...h]; const forrige = n.pop(); setVisning(forrige || { udfoldet: null, fokus: null }); return n; }); setValgtKant(null); };
  const visAlt = () => { setHistorik([]); setVisning({ udfoldet: null, fokus: null }); setValgtKant(null); setHover(null); };
  const fokuser = (kasse) => gaaTil({ udfoldet: visning.udfoldet, fokus: { type: kasse.type, id: kasse.id } });
  const foldUd = (gruppe) => { if (!harFiler) return; gaaTil({ udfoldet: gruppe, fokus: null }); };
  const foldSammen = () => gaaTil({ udfoldet: null, fokus: visning.udfoldet ? { type: 'gruppe', id: visning.udfoldet } : null });

  // Esc håndteres ÉT sted — på <svg>, som hændelsen bobler op til (én vagt pr. regel).
  const onKasseKey = (e, kasse) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fokuser(kasse); }
  };

  const kantTitel = (k) => `${navnAf(k.from)} → ${navnAf(k.to)}: ${k.antal} import${k.antal === 1 ? '' : 's'}`;

  const fokusKasse = fokusId ? kasser.find((k) => k.id === fokusId) : null;

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 760, display: 'block' }} role="img"
          aria-label="Afhængighedsdiagram over kodemodulerne" data-testid="dep-svg" onKeyDown={(e) => { if (e.key === 'Escape') visAlt(); }}>
          <defs>
            <marker id="dep-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--c-muted)" />
            </marker>
            <marker id="dep-arrow-ud" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={FARVE_UD} />
            </marker>
            <marker id="dep-arrow-ind" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={FARVE_IND} />
            </marker>
          </defs>

          {etiketter.map((e) => (
            <text key={e.label} x={e.x} y={e.y + 4} fontSize="12" fontWeight="700" fill="var(--c-muted)" data-testid="dep-blok-etiket">{e.label}</text>
          ))}

          {/* Kanter (importer → importeret) */}
          {kanter.map((k) => {
            const a = pos[k.from], b = pos[k.to];
            if (!a || !b) return null;
            const f = fremhaevning(k);
            if (f === 'nej' && fokusNaboer) return null; // fokus: ikke-naboers kanter tegnes slet ikke
            const d = kantSti(a, b);
            const sw = Math.max(0.8, Math.min(3.5, k.antal / (maxAntal / 4)));
            const farve = f === 'ud' ? FARVE_UD : f === 'ind' ? FARVE_IND : 'var(--c-muted)';
            const marker = f === 'ud' ? 'url(#dep-arrow-ud)' : f === 'ind' ? 'url(#dep-arrow-ind)' : 'url(#dep-arrow)';
            const opacity = f === 'nej' ? 0.06 : f === 'normal' ? 0.22 : 0.95;
            return (
              <g key={k.id} data-testid="dep-kant" data-id={k.id} data-fremhaevet={f}>
                <path d={d} fill="none" stroke={farve} strokeWidth={f === 'normal' || f === 'nej' ? sw : sw + 1.2}
                  strokeOpacity={opacity} markerEnd={marker} style={{ pointerEvents: 'none' }} />
                {/* Usynligt, bredt hit-område: en 1–3 px streg kan ikke rammes med en finger. */}
                <path d={d} fill="none" stroke="transparent" strokeWidth="12" style={{ cursor: 'pointer' }}
                  data-testid="dep-kant-hit" data-id={k.id}
                  onMouseEnter={() => setHover({ type: 'kant', id: k.id })} onMouseLeave={() => setHover(null)}
                  onClick={() => setValgtKant(k)}>
                  <title>{kantTitel(k)}</title>
                </path>
              </g>
            );
          })}

          {/* Kasser */}
          {kasser.map((kasse) => {
            const p = pos[kasse.id];
            if (!p) return null;
            const c = kasse.type === 'fil' ? colorFor(kasse.gruppe, 2) : colorFor(kasse.id, kasse.layer);
            const w = p.w || NODE_W;
            const daempet = kasseDaempet(kasse.id);
            const erFokus = kasse.id === fokusId;
            return (
              <g key={kasse.id} transform={`translate(${p.x - w / 2}, ${p.y - NODE_H / 2})`}
                data-testid={kasse.type === 'fil' ? 'dep-fil-kasse' : 'dep-kasse'} data-id={kasse.id} data-daempet={daempet ? 'true' : 'false'}
                role="button" tabIndex={daempet ? -1 : 0}
                aria-label={kasse.type === 'fil' ? `${kasse.fuldt} i ${shortLabel(kasse.gruppe)}` : `${kasse.label}, ${kasse.files} fil${kasse.files === 1 ? '' : 'er'}`}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHover({ type: 'kasse', id: kasse.id })} onMouseLeave={() => setHover(null)}
                onClick={() => fokuser(kasse)}
                onDoubleClick={() => { if (kasse.type === 'gruppe') foldUd(kasse.id); }}
                onKeyDown={(e) => onKasseKey(e, kasse)}>
                <rect width={w} height={NODE_H} rx="9" fill={daempet ? 'var(--c-bg)' : c.fill} stroke={c.stroke}
                  strokeWidth={erFokus ? 3 : 1.5} strokeOpacity={daempet ? 0.25 : 1} strokeDasharray={daempet ? '3 3' : undefined} />
                {!daempet && (
                  <>
                    <text x={w / 2} y={NODE_H / 2 - 2} textAnchor="middle" fontSize={kasse.type === 'fil' ? 11 : 12.5} fontWeight="700" fill={c.text}>
                      {kasse.label}
                      {kasse.type === 'fil' && <title>{kasse.fuldt}</title>}
                    </text>
                    <text x={w / 2} y={NODE_H / 2 + 13} textAnchor="middle" fontSize="9.5" fill="var(--c-muted)">
                      {kasse.type === 'fil' ? 'fil' : `${kasse.files} fil${kasse.files === 1 ? '' : 'er'}`}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Hover-titel som synlig tekst (SVG-<title> ses kun på desktop) */}
      <p style={{ fontSize: '0.8rem', minHeight: '1.2em', margin: '0.3rem 0 0', color: 'var(--c-muted)' }} data-testid="dep-hover">
        {hover?.type === 'kant' ? kantTitel(kanter.find((k) => k.id === hover.id) || { from: '', to: '', antal: 0 }) : hover?.type === 'kasse' ? `${kasser.find((k) => k.id === hover.id)?.label ?? ''}: blå = det den importerer, orange = det der importerer den` : ''}
      </p>

      <Panel
        graf={graf} visning={visning} u={u} fokusKasse={fokusKasse} valgtKant={valgtKant} harFiler={harFiler}
        kanTilbage={historik.length > 0}
        paa={{ visAlt, tilbage, foldUd, foldSammen, fokuser }}
      />

      <p style={{ fontSize: '0.78rem', color: 'var(--c-muted)', marginTop: '0.6rem' }} data-testid="dep-forklaring">
        {visning.udfoldet
          ? 'Filerne i den udfoldede gruppe er ordnet efter, hvor forbundne de er — ikke efter lag — så en pil mellem to filrækker kan pege opad; pilespidsen viser retningen (importer → importeret). Tykkere pile = flere imports.'
          : 'Pilene viser hvilke moduler der importerer hvilke (nederst = fundament, øverst = app-skal). Tykkere pile = flere imports.'}
        <strong> Peg</strong> på en kasse, og dens forbindelser tegnes op — blå er det, kassen importerer, orange er det, der importerer den.
        <strong> Klik</strong> på en pil for at se de konkrete filer bag den, eller på en kasse for at se diagrammet med fokus ud fra den.
        <strong> Dobbeltklik</strong> på en kasse (eller «Fold ud i filer») for at bryde den ned i sine filer med afhængighederne tegnet ind.
        «Vis hele diagrammet» og Esc går tilbage til det fulde billede.
      </p>
    </div>
  );
}

function Panel({ graf, visning, u, fokusKasse, valgtKant, harFiler, kanTilbage, paa }) {
  const S = { fontSize: '0.84rem', marginTop: '0.6rem', padding: '0.6rem 0.8rem', border: '1px solid var(--c-border)', borderRadius: 10, background: 'var(--c-surface, var(--c-bg))' };
  const knapper = (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
      {kanTilbage && <button type="button" className="btn btn--ghost" onClick={paa.tilbage} data-testid="dep-tilbage">← Tilbage</button>}
      {(visning.udfoldet || visning.fokus) && <button type="button" className="btn btn--ghost" onClick={paa.visAlt} data-testid="dep-vis-alt">Vis hele diagrammet</button>}
      {fokusKasse?.type === 'gruppe' && !visning.udfoldet && (
        <button type="button" className="btn" onClick={() => paa.foldUd(fokusKasse.id)} disabled={!harFiler} data-testid="dep-fold-ud">Fold ud i filer</button>
      )}
      {visning.udfoldet && <button type="button" className="btn" onClick={paa.foldSammen} data-testid="dep-fold-sammen">Fold sammen</button>}
    </div>
  );

  if (!harFiler && (fokusKasse || valgtKant || visning.udfoldet)) {
    return (
      <div style={S} data-testid="dep-panel">
        <p style={{ margin: 0 }} className="badge badge--yellow">Fil-niveauet mangler i dette øjebliksbillede — kør Actions → «Opdatér test-rapporten» og deploy derefter platformen.</p>
        {knapper}
      </div>
    );
  }

  // Valgt kant: de konkrete fil-imports bag den.
  if (valgtKant) {
    const liste = valgtKant.fil
      ? [{ fra: valgtKant.from, til: valgtKant.to, antal: valgtKant.antal }]
      : filKanterFor(graf, valgtKant.from, valgtKant.to);
    const navn = navnAf;
    return (
      <div style={S} data-testid="dep-panel">
        <strong>{navn(valgtKant.from)} → {navn(valgtKant.to)}</strong>{' '}
        <span style={{ color: 'var(--c-muted)' }}>· {valgtKant.antal} import{valgtKant.antal === 1 ? '' : 's'}</span>
        <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1.2rem' }} data-testid="dep-kant-liste">
          {liste.map((k) => (
            <li key={`${k.fra}→${k.til}`}><code>{navn(k.fra)}</code> → <code>{navn(k.til)}</code>{k.antal > 1 ? ` (${k.antal})` : ''}</li>
          ))}
        </ul>
        {knapper}
      </div>
    );
  }

  // Fokus på en fil (i en udfoldet gruppe).
  if (fokusKasse?.type === 'fil') {
    const n = filNaboer(graf, fokusKasse.id);
    const gruppeAf = (id) => graf.filer.find((f) => f.id === id)?.gruppe;
    const linje = (x) => <li key={x.id}><code>{filNavn(x.id)}</code> <span style={{ color: 'var(--c-muted)' }}>({shortLabel(gruppeAf(x.id) || '?')}{x.antal > 1 ? `, ${x.antal}` : ''})</span></li>;
    return (
      <div style={S} data-testid="dep-panel">
        <strong>{filNavn(fokusKasse.id)}</strong> <span style={{ color: 'var(--c-muted)' }}>· {fokusKasse.id}</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem', marginTop: '0.3rem' }}>
          <div><em>Importerer</em> ({n.ud.length}){n.ud.length ? <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1.2rem' }}>{n.ud.map(linje)}</ul> : <p style={{ margin: 0, color: 'var(--c-muted)' }}>ingenting i kodebasen</p>}</div>
          <div><em>Importeres af</em> ({n.ind.length}){n.ind.length ? <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1.2rem' }}>{n.ind.map(linje)}</ul> : <p style={{ margin: 0, color: 'var(--c-muted)' }}>ingen</p>}</div>
        </div>
        {knapper}
      </div>
    );
  }

  // Udfoldet gruppe (uden fil-fokus).
  if (visning.udfoldet && u) {
    const g = visning.udfoldet;
    return (
      <div style={S} data-testid="dep-panel">
        <strong>{shortLabel(g)}</strong> <span style={{ color: 'var(--c-muted)' }}>· foldet ud i {u.filer.length} fil{u.filer.length === 1 ? '' : 'er'}, {u.naboer.size} nabogrupper</span>
        <p style={{ margin: '0.3rem 0 0' }} data-testid="dep-interne">
          {u.interne.length
            ? `${u.interne.length} interne forbindelser: filerne i ${shortLabel(g)} importerer hinanden. Klik på en fil for at se dens naboer.`
            : `Ingen af filerne i ${shortLabel(g)} importerer hinanden — hver fil står alene og henter kun fra andre grupper.`}
        </p>
        {knapper}
      </div>
    );
  }

  // Fokus på en gruppe.
  if (fokusKasse?.type === 'gruppe') {
    const id = fokusKasse.id;
    const ud = graf.edges.filter((e) => e.from === id).sort((a, b) => b.count - a.count);
    const ind = graf.edges.filter((e) => e.to === id).sort((a, b) => b.count - a.count);
    const filer = (graf.filer || []).filter((f) => f.gruppe === id).map((f) => filNavn(f.id)).sort();
    return (
      <div style={S} data-testid="dep-panel">
        <strong>{shortLabel(id)}</strong> <span style={{ color: 'var(--c-muted)' }}>· {fokusKasse.files} fil{fokusKasse.files === 1 ? '' : 'er'}</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem', marginTop: '0.3rem' }}>
          <div><em>Importerer</em> ({ud.length} grupper)
            <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1.2rem' }}>{ud.map((e) => <li key={e.to}>{shortLabel(e.to)} <span style={{ color: 'var(--c-muted)' }}>({e.count})</span></li>)}</ul>
          </div>
          <div><em>Importeres af</em> ({ind.length} grupper)
            <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1.2rem' }}>{ind.map((e) => <li key={e.from}>{shortLabel(e.from)} <span style={{ color: 'var(--c-muted)' }}>({e.count})</span></li>)}</ul>
          </div>
          {filer.length > 0 && (
            <div><em>Filer</em> ({filer.length})
              <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1.2rem', columns: 2 }}>{filer.map((f) => <li key={f}><code>{f}</code></li>)}</ul>
            </div>
          )}
        </div>
        {knapper}
      </div>
    );
  }

  return null;
}
