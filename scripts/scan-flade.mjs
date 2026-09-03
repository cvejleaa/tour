// Inventar over fladens interaktive elementer: alle knapper, felter,
// formularer og links i src/**/*.{js,jsx}, med fil:linje:kolonne.
//
// HVORFOR AST OG IKKE GREP: `grep '<button[ >/]'` fandt 131 knapper i
// kildekoden; parseren finder 225. Resten er åbningstags, der strækker sig
// over flere linjer (`<button\n  className=…`). Et regex-scan ville have
// meldt 42 % af knapperne som ikke-eksisterende — og dermed aldrig som
// utestede. Målt 3. september 2026 (scan-flade.test.mjs holder fast i, at
// flerlinje-tags tælles).
//
// HVAD DER TÆLLER SOM INTERAKTIVT — og hvad der bevidst ikke gør:
// - Native elementer: button, input (ikke hidden), select, textarea, form,
//   summary, og a med href eller onClick.
// - Ethvert lowercase-element med onClick/onChange/onInput/onSubmit
//   (en <div onClick> er en knap, uanset hvad den hedder).
// - Link/NavLink fra react-router: deres <a> ligger i node_modules og bærer
//   ingen kilde, så det er OS, der ejer klikket — det krediteres via
//   komponentens egen fiber (se fladeDaekning.mjs).
// - Egne komponenter (<FacitInput onChange>, <HoldSelect …>) tælles IKKE på
//   kaldestedet: det native felt inde i komponenten er allerede i inventaret,
//   og et klik dér krediterer det. Kaldestedet ville stå som "aldrig aktiveret"
//   for evigt, fordi tappen kun ser DOM-elementet. Det er et bevidst fravalg,
//   ikke et hul: fanen viser ELEMENTER, ikke kaldesteder.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from '@babel/parser';
import { noegleFraBabel } from './lib/evneNoegle.mjs';

const ROD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const NATIVE = new Set(['button', 'input', 'select', 'textarea', 'form', 'summary']);
const ROUTER_LINKS = new Set(['Link', 'NavLink']);
const HANDLERE = ['onClick', 'onChange', 'onInput', 'onSubmit'];
// Rækkefølgen er den, ejeren kan genkende på skærmen: det oplæste navn, så
// titlen, så pladsholderen, så den tekst, der står på knappen. data-testid er
// sidste udvej — det er et testnavn, ikke noget, der vises.
const TEKST_ATTR = ['aria-label', 'title', 'placeholder'];
const TEKST_ATTR_NOED = ['data-testid', 'name'];
const MAKS_TEKST = 48;

/** Hvilke DOM-hændelser aktiverer elementet? Tappen logger dem alle; fletningen krediterer kun de rigtige. */
export function haendelserFor(tag, type, handlere) {
  const h = new Set();
  if (tag === 'form') h.add('submit');
  else if (tag === 'input') {
    if (type === 'checkbox' || type === 'radio') { h.add('click'); h.add('change'); }
    else if (type === 'submit' || type === 'button' || type === 'file') h.add('click');
    else { h.add('input'); h.add('change'); }
  } else if (tag === 'select' || tag === 'textarea') { h.add('input'); h.add('change'); }
  else if (tag === 'button' || tag === 'a' || tag === 'summary' || ROUTER_LINKS.has(tag)) h.add('click');
  if (handlere.includes('onClick')) h.add('click');
  if (handlere.includes('onChange') || handlere.includes('onInput')) { h.add('input'); h.add('change'); }
  if (handlere.includes('onSubmit')) h.add('submit');
  return [...h].sort();
}

function attrVaerdi(n, navn) {
  const a = n.attributes.find((x) => x.type === 'JSXAttribute' && x.name.name === navn);
  if (!a || !a.value) return null;
  if (a.value.type === 'StringLiteral') return a.value.value;
  if (a.value.type === 'JSXExpressionContainer' && a.value.expression.type === 'StringLiteral') return a.value.expression.value;
  return null;
}

/** Den første tekst, elementet viser (JSXText-barn), forkortet. */
function boernTekst(elem) {
  for (const c of elem.children || []) {
    if (c.type === 'JSXText') {
      const t = c.value.replace(/\s+/g, ' ').trim();
      if (t) return t.length > MAKS_TEKST ? `${t.slice(0, MAKS_TEKST - 1)}…` : t;
    }
  }
  return null;
}

/**
 * Scanner én kildefil. Returnerer inventar-poster med babel-positionen
 * konverteret gennem evneNoegle (1-indekseret kolonne).
 */
export function scanKilde(kilde, fil) {
  let ast;
  try {
    ast = parse(kilde, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true });
  } catch (e) {
    throw new Error(`${fil}: kunne ikke parses — ${e.message}`);
  }
  const poster = [];
  // Komponentnavnet er det eneste felt, en ejer kan oversætte til "hvor på
  // skærmen" — linjetallet flytter sig ved første redigering ovenfor. Vi
  // følger stakken af omsluttende funktioner og tager den inderste med stort
  // begyndelsesbogstav (en React-komponent), ellers den inderste navngivne.
  const stak = [];
  const komponentNavn = () => [...stak].reverse().find((n) => /^[A-Z]/.test(n)) || stak[stak.length - 1] || null;
  (function besoeg(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(besoeg); return; }
    let skubbet = false;
    if (n.type === 'FunctionDeclaration' && n.id) { stak.push(n.id.name); skubbet = true; }
    else if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init
      && (n.init.type === 'ArrowFunctionExpression' || n.init.type === 'FunctionExpression')) { stak.push(n.id.name); skubbet = true; }
    if (n.type === 'JSXElement') {
      const aabn = n.openingElement;
      const navn = aabn.name.type === 'JSXIdentifier' ? aabn.name.name : null;
      const attrs = aabn.attributes.filter((a) => a.type === 'JSXAttribute').map((a) => a.name.name);
      const handlere = attrs.filter((a) => HANDLERE.includes(a));
      const type = attrVaerdi(aabn, 'type');
      const erLowercase = navn && /^[a-z]/.test(navn);
      let interaktiv = false;
      if (navn && NATIVE.has(navn)) interaktiv = !(navn === 'input' && type === 'hidden');
      else if (navn === 'a') interaktiv = attrs.includes('href') || handlere.length > 0;
      else if (navn && ROUTER_LINKS.has(navn)) interaktiv = true;
      else if (erLowercase && handlere.length > 0) interaktiv = true;
      if (interaktiv) {
        const tekst = TEKST_ATTR.map((a) => attrVaerdi(aabn, a)).find(Boolean)
          || boernTekst(n)
          || TEKST_ATTR_NOED.map((a) => attrVaerdi(aabn, a)).find(Boolean)
          || null;
        poster.push({
          noegle: noegleFraBabel(fil, aabn.loc.start),
          fil,
          linje: aabn.loc.start.line,
          kolonne: aabn.loc.start.column + 1,
          tag: navn,
          type: type || null,
          tekst,
          komponent: komponentNavn(),
          haendelser: haendelserFor(navn, type, handlere),
        });
      }
    }
    for (const k in n) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments') continue;
      besoeg(n[k]);
    }
    if (skubbet) stak.pop();
  })(ast.program.body);
  return poster;
}

/** Alle kildefiler under src/, minus tests og test-hjælpere. */
export function kildefiler(rod = ROD) {
  const ud = [];
  (function gaa(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'test') gaa(p); }
      else if (/\.jsx?$/.test(e.name) && !/\.(test|spec)\.jsx?$/.test(e.name)) ud.push(p);
    }
  })(path.join(rod, 'src'));
  return ud.sort();
}

/** Hele inventaret, med stier relative til roden. */
export function scanTrae(rod = ROD) {
  return kildefiler(rod).flatMap((abs) => scanKilde(fs.readFileSync(abs, 'utf8'), path.relative(rod, abs)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inv = scanTrae();
  const prTag = {};
  for (const p of inv) prTag[p.tag] = (prTag[p.tag] || 0) + 1;
  console.log(`${inv.length} interaktive elementer i ${new Set(inv.map((p) => p.fil)).size} filer`);
  console.log(Object.entries(prTag).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}=${n}`).join('  '));
  if (process.argv.includes('--json')) console.log(JSON.stringify(inv, null, 1));
}
