// Admin → Tests → Knapper og felter: hvilke interaktive elementer i
// kildekoden mindst én automatisk test rører ved.
//
// Data: src/data/fladeDaekning.json, skrevet af `npm run test:report`
// (scripts/scan-flade.mjs finder elementerne med parseren; tappen i
// src/test/setup.js logger, hvad testene dispatcher på; fladeDaekning.mjs
// fletter). Et ØJEBLIKSBILLEDE som de to andre filer på fanen.
//
// ORDET "TESTET" BRUGES IKKE HER — MED VILJE. Fanen kan kun sige, at en test
// har KLIKKET på eller SKREVET i et element, ikke at opførslen bag er bevist,
// og slet ikke at serveren eller reglerne tillader handlingen. Begge de fejl,
// der nåede produktion 3. september 2026, ville stå grønt her: Forlad-knappen
// blev klikket af fire tests og fejlede alligevel, fordi reglerne afviste
// handlingen — og "Næste kamp låser om" er ikke en knap og står slet ikke på
// listen. Fanen SIGER det selv, over tallet, ikke bag en fold. Ellers er den
// et nyt grønt-suite-selvbedrag oven på det, der kostede de to fejl.
//
// TRE TILSTANDE, ikke to (siden 4/9 2026): rørt / vist men ikke rørt / aldrig
// vist. «Aldrig vist» er den alvorlige: ingen test har nogensinde tegnet
// elementet, så der er ingen vagt overhovedet — heller ikke mod at siden går
// ned (Beskeder-fanen var sådan én i månedsvis). «Vist» betyder kun, at
// elementet kom med i det, en test tegnede — også bag en lukket fold; jsdom
// har ingen layout, så "synlig" kan fanen ikke love. Et gammelt
// øjebliksbillede uden render-måling (renderMaalt: false) vises som før med
// to tilstande og en note — tallene bages ind i bundtet, så fanen skifter
// først, når rapporten er genereret OG platformen deployet.
import { useState } from 'react';
import daekning from '../../data/fladeDaekning.json';

// Grupperne i den rækkefølge, en ejer leder: spillet først, Tour foldet væk.
// 'andet' er en OBLIGATORISK fallback — en tabel uden den taber elementer
// tavst. FladeDaekning.test.jsx holder fast i, at gruppesummen er totalen.
export const GRUPPER = [
  { key: 'platform', label: 'Spil-fladen (Superligaen og Premier League)' },
  { key: 'faelles', label: 'Fælles: login, profil, sider og admin' },
  { key: 'tour', label: 'Kun Tour-appen — afsluttet spil', foldet: true, note: 'Tour de France er slut. Hullerne her er ikke noget at handle på.' },
  { key: 'andet', label: 'Andet' },
];

/** Elementtypen med ejerens ord, ikke tag-navnet. */
export function typeNavn(e) {
  switch (e.tag) {
    case 'button': return 'Knap';
    case 'input':
      if (e.type === 'checkbox') return 'Afkrydsning';
      if (e.type === 'radio') return 'Valgknap';
      if (e.type === 'submit' || e.type === 'button') return 'Knap';
      if (e.type === 'file') return 'Filvalg';
      return 'Indtastningsfelt';
    case 'select': return 'Valgliste';
    case 'textarea': return 'Tekstfelt';
    case 'form': return 'Formular';
    case 'summary': return 'Foldeknap';
    case 'a': case 'Link': case 'NavLink': return 'Link';
    default: return 'Klikbart element';
  }
}

/**
 * Elementets tilstand. Et gammelt øjebliksbillede (uden render-måling) har
 * intet `status`-felt; dér findes kun rørt/urørt, og «urørt» må IKKE læses
 * som «aldrig vist» — det ville være falsk alarm i den alvorlige kategori.
 */
export function statusAf(e, renderMaalt) {
  if (e.aktiveret) return 'roert';
  if (!renderMaalt) return 'uroert';
  return e.status === 'vist' ? 'vist' : 'aldrig';
}
const RANG = { aldrig: 0, uroert: 1, vist: 1, roert: 2 };

/** Grupperer og sorterer: filer efter antal aldrig viste, så urørte (faldende); aldrig → vist → rørt i filen. */
export function grupper(elementer, renderMaalt = true) {
  const kendte = new Set(GRUPPER.map((g) => g.key));
  return GRUPPER.map((g) => {
    const mine = elementer.filter((e) => (kendte.has(e.app) ? e.app : 'andet') === g.key);
    const prFil = new Map();
    for (const e of mine) {
      if (!prFil.has(e.fil)) prFil.set(e.fil, []);
      prFil.get(e.fil).push(e);
    }
    const st = (e) => statusAf(e, renderMaalt);
    const filer = [...prFil.entries()].map(([fil, liste]) => ({
      fil,
      elementer: [...liste].sort((a, b) => RANG[st(a)] - RANG[st(b)] || a.linje - b.linje),
      uroerte: liste.filter((e) => !e.aktiveret).length,
      aldrig: liste.filter((e) => st(e) === 'aldrig').length,
    })).sort((a, b) => b.aldrig - a.aldrig || b.uroerte - a.uroerte || a.fil.localeCompare(b.fil));
    return {
      ...g, filer, antal: mine.length,
      roerte: mine.filter((e) => e.aktiveret).length,
      viste: mine.filter((e) => st(e) === 'vist').length,
      aldrig: mine.filter((e) => st(e) === 'aldrig').length,
    };
  });
}

/** Filtrene — den midterste tekst citeres ORDRET i .claude/commands/saesoneftersyn.md (paritetstest). */
export const FILTRE = [
  { key: 'alle', label: 'Vis alle', testid: 'flade-filter-alle' },
  { key: 'uroerte', label: 'Vis kun det, ingen test rører', testid: 'flade-kun-uroerte' },
  { key: 'aldrig', label: 'Vis kun det, ingen test viser', testid: 'flade-kun-aldrig', kraeverRender: true },
];

function passerFilter(e, filter, renderMaalt) {
  const st = statusAf(e, renderMaalt);
  if (filter === 'uroerte') return st !== 'roert';
  if (filter === 'aldrig') return st === 'aldrig';
  return true;
}

const S_BADGE = { fontSize: '0.72rem' };

/** Badge-tekst og -farve pr. tilstand. Gul, ikke rød, for «aldrig vist»: en arbejdsliste, ikke en falliterklæring. */
export function badgeFor(e, renderMaalt) {
  const st = statusAf(e, renderMaalt);
  const n = e.tests.length;
  const r = e.renderAntal || 0;
  if (st === 'roert') return { klasse: 'badge--blue', tekst: `rørt af ${n} ${n === 1 ? 'test' : 'tests'}` };
  if (st === 'vist') return { klasse: 'badge--muted', tekst: `vist i ${r} ${r === 1 ? 'test' : 'tests'}, men ingen rører den` };
  if (st === 'aldrig') return { klasse: 'badge--yellow', tekst: 'ingen test viser den' };
  return { klasse: 'badge--muted', tekst: 'ingen test rører den' };
}

function Element({ e, renderMaalt }) {
  const b = badgeFor(e, renderMaalt);
  return (
    <li style={{ fontSize: '0.84rem', padding: '0.2rem 0', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'baseline' }} data-testid="flade-element" data-status={statusAf(e, renderMaalt)}>
      <span className={`badge ${b.klasse}`} style={S_BADGE}>{b.tekst}</span>
      <span><strong>{typeNavn(e)}</strong>{' '}
        {e.tekst ? `«${e.tekst}»` : <span style={{ color: 'var(--c-muted)' }}>(teksten dannes i koden)</span>}
      </span>
      <span style={{ color: 'var(--c-muted)' }}>i {e.komponent || '?'}</span>
      <code style={{ fontSize: '0.74rem', color: 'var(--c-muted)' }}>{e.fil.replace(/^src\//, '')}:{e.linje}</code>
      {e.aktiveret && (
        <details style={{ flexBasis: '100%', fontSize: '0.78rem' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--c-muted)' }}>hvilke tests</summary>
          <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1.2rem' }}>
            {e.tests.map((t) => <li key={t}><code>{t}</code></li>)}
          </ul>
        </details>
      )}
    </li>
  );
}

function Gruppe({ g, filter, renderMaalt }) {
  const filer = filter === 'alle'
    ? g.filer
    : g.filer.map((f) => ({ ...f, elementer: f.elementer.filter((e) => passerFilter(e, filter, renderMaalt)) })).filter((f) => f.elementer.length);
  const krop = (
    <>
      {g.note && <p style={{ fontSize: '0.82rem', color: 'var(--c-muted)', margin: '0 0 0.4rem' }}>{g.note}</p>}
      {g.antal > 0 && g.roerte === g.antal && (
        <p style={{ fontSize: '0.84rem', margin: '0 0 0.4rem' }}>
          Alle {g.antal} knapper og felter her bliver rørt af mindst én test. Det siger ikke, at de virker rigtigt — se forklaringen øverst.
        </p>
      )}
      {g.antal > 0 && filer.length === 0 && g.roerte !== g.antal && (
        <p style={{ fontSize: '0.84rem', color: 'var(--c-muted)', margin: 0 }}>Ingen knapper eller felter matcher filteret.</p>
      )}
      {filer.map((f) => (
        <details key={f.fil} style={{ borderBottom: '1px solid var(--c-border)', padding: '0.35rem 0' }}>
          <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className={`badge ${f.uroerte ? 'badge--muted' : 'badge--blue'}`} style={S_BADGE}>
              {f.uroerte ? `${f.uroerte} urørt${f.uroerte === 1 ? '' : 'e'}` : 'alle rørt'}
            </span>
            {f.aldrig > 0 && <span className="badge badge--yellow" style={S_BADGE}>{f.aldrig} aldrig vist</span>}
            <code style={{ fontSize: '0.82rem' }}>{f.fil.replace(/^src\//, '')}</code>
          </summary>
          <ul style={{ margin: '0.4rem 0 0.2rem', paddingLeft: '0.5rem', listStyle: 'none' }}>
            {f.elementer.map((e) => <Element key={`${e.fil}:${e.linje}:${e.kolonne}`} e={e} renderMaalt={renderMaalt} />)}
          </ul>
        </details>
      ))}
    </>
  );
  const overskrift = (
    <>
      {g.label}{' '}
      <span style={{ fontWeight: 400, color: 'var(--c-muted)', fontSize: '0.82rem' }}>
        · {g.roerte} af {g.antal} rørt{renderMaalt && g.aldrig > 0 ? ` · ${g.aldrig} aldrig vist` : ''}
      </span>
    </>
  );
  if (g.foldet) {
    return (
      <details style={{ marginTop: '1rem' }} data-testid={`flade-gruppe-${g.key}`}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem' }}>{overskrift}</summary>
        {krop}
      </details>
    );
  }
  if (g.antal === 0) return null;
  return (
    <div style={{ marginTop: '1rem' }} data-testid={`flade-gruppe-${g.key}`}>
      <h4 style={{ margin: '0 0 0.4rem', fontSize: '0.95rem' }}>{overskrift}</h4>
      {krop}
    </div>
  );
}

export default function FladeDaekning({ data = daekning }) {
  const [filter, setFilter] = useState('alle');
  const totals = data?.totals;
  const renderMaalt = data?.renderMaalt === true;
  if (!totals || !totals.elementer) {
    // Vagten fejler ÅBENT, som erForaeldet: en tom fil er en fejl i
    // scanningen, ikke et bevis på, at appen ingen knapper har.
    return (
      <p className="badge badge--yellow" style={{ display: 'block' }} data-testid="flade-tom">
        Der er ingen måling af knapper og felter i dette øjebliksbillede. Det betyder, at scanningen ikke er kørt
        eller er slået fejl — ikke at appen ingen knapper har. Kør <strong>Actions → «Opdatér test-rapporten»</strong> og
        deploy derefter platformen.
      </p>
    );
  }
  const g = grupper(data.elementer, renderMaalt);
  const pct = Math.round((totals.aktiverede / totals.elementer) * 100);
  const viste = g.reduce((n, x) => n + x.viste, 0);
  const aldrig = g.reduce((n, x) => n + x.aldrig, 0);
  const aldrigTour = g.find((x) => x.key === 'tour')?.aldrig || 0;
  const pctVist = Math.round((viste / totals.elementer) * 100);
  return (
    <div>
      <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>Hvilke knapper og felter rører testene ved?</h4>

      <p style={{ margin: '0 0 0.35rem', fontSize: '0.95rem' }} data-testid="flade-tal">
        <strong>{data.e2eMedregnet ? '' : 'Mindst '}{totals.aktiverede} af {totals.elementer}</strong> knapper, felter, valglister og
        formularer bliver klikket eller udfyldt af mindst én automatisk test — fordelt på {totals.filer} filer.
      </p>
      {renderMaalt && (
        <p style={{ margin: '0 0 0.35rem', fontSize: '0.9rem' }} data-testid="flade-tre">
          Af de {totals.elementer}: <strong>{totals.aktiverede} rørt</strong>, <strong>{viste} vist, men ikke rørt</strong>, og{' '}
          <strong>{aldrig} aldrig vist</strong> af nogen test{aldrigTour > 0 ? ` — heraf ${aldrigTour} i Tour-appen, som er afsluttet` : ''}.
        </p>
      )}
      <div style={{ height: 10, background: 'var(--c-bg)', borderRadius: 99, border: '1px solid var(--c-border)', overflow: 'hidden', marginBottom: '0.75rem', display: 'flex' }} aria-hidden="true">
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--c-pitch)' }} />
        {renderMaalt && <div style={{ width: `${pctVist}%`, height: '100%', background: 'var(--c-pitch)', opacity: 0.35 }} />}
      </div>

      {!renderMaalt && (
        <p className="badge badge--yellow" style={{ display: 'block', marginBottom: '0.75rem' }} data-testid="flade-render-forbehold">
          ⚠️ Dette øjebliksbillede skelner ikke mellem «ingen test viser siden» og «testen viser siden uden at røre
          elementet» — det kræver en nyere rapport. Kør <strong>Actions → «Opdatér test-rapporten»</strong> og deploy
          derefter platformen.
        </p>
      )}

      {!data.e2eMedregnet && (
        <p className="badge badge--yellow" style={{ display: 'block', marginBottom: '0.75rem' }} data-testid="flade-e2e-forbehold">
          ⚠️ Klik fra E2E-testene (Playwright) tælles endnu ikke med. Elementer, der kun klikkes dér — bl.a. 1X2-knapperne
          på tip-siden — står som ikke rørt, selv om de er dækket. Tallet er derfor et minimum.
        </p>
      )}

      <div style={{ fontSize: '0.84rem', lineHeight: 1.5 }} data-testid="flade-forklaring">
        <p style={{ margin: '0 0 0.5rem' }}>
          <strong>Hvad det betyder.</strong> Listen tæller hvert sted i koden, hvor der står en knap, et indtastningsfelt,
          en valgliste eller en formular — i hele kodebasen, uanset hvilken app du står i. Et element er <em>rørt</em>, når
          mindst én automatisk test har klikket på det eller skrevet i det. At det er rørt, betyder, at testene kommer
          forbi det — ikke at de kontrollerer, at det rigtige sker.
        </p>
        <p style={{ margin: '0 0 0.5rem' }}>
          <strong>Tre tilstande.</strong> <em>Rørt</em>: en test klikkede eller skrev. <em>Vist, men ikke rørt</em>: elementet
          kom med i det, en test tegnede — også hvis det lå bag en lukket fold; ingen test har set på det, men siden ville
          i det mindste være gået ned i testen, hvis den ikke kunne tegnes. <em>Aldrig vist</em>: ingen test har
          nogensinde tegnet det. Det er den alvorlige tilstand — dér er ingen vagt overhovedet, heller ikke mod at siden
          går ned.
        </p>
        <p style={{ margin: '0 0 0.5rem' }}>
          <strong>Hvad listen ikke kan se.</strong> Den måler kun fladen. Om en knaps handling også bliver godkendt af
          serveren og Firestore-reglerne, måles ikke her — og heller ikke om et tal på skærmen er rigtigt. Begge de fejl,
          der nåede produktion 3. september 2026, ville stå rørt her: Forlad-knappen blev klikket af fire tests og
          fejlede alligevel, fordi reglerne afviste handlingen — og «Næste kamp låser om …» er ikke en knap og står slet
          ikke på listen. <strong>100 % her ville betyde, at ingen knap står helt urørt. Ikke at intet kan gå galt.</strong>
          {' '}De 100 % på Oversigt betyder, at alle tests består — ikke at alt er testet.
        </p>
      </div>

      <fieldset style={{ border: 0, padding: 0, margin: '0.5rem 0', display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.84rem' }} data-testid="flade-filter">
        {FILTRE.filter((f) => !f.kraeverRender || renderMaalt).map((f) => (
          <label key={f.key} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <input type="radio" name="flade-filter" value={f.key} checked={filter === f.key} onChange={() => setFilter(f.key)} data-testid={f.testid} />
            {f.label}
          </label>
        ))}
      </fieldset>

      <p style={{ fontSize: '0.84rem', margin: '0.75rem 0 0' }}>
        <strong>Ingen test rører disse.</strong> Det er ikke en fejlliste. Nogle er knapper, der i praksis altid er
        deaktiverede, og nogle hører til Tour-spillet, som er afsluttet. Det er stedet at kigge, når du vil vide, hvor
        der ikke står en automatisk vagt.
      </p>

      {g.map((gr) => <Gruppe key={gr.key} g={gr} filter={filter} renderMaalt={renderMaalt} />)}
    </div>
  );
}
