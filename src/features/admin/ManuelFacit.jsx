/**
 * ✍️ Sæt eller ret facit i hånden — NØDBREMSEN (Admin → 🗓️ Spil-tidsplan).
 *
 * PLACERING (CLAUDE.md trin 0b): lige under "⬇️ Synk resultater nu", fordi
 * det er dér, en administrator leder, når et facit mangler eller er forkert —
 * og det er dér, strandede-alarmen og admin-guiden sender ham hen. Vises for
 * ALLE kampspil, ikke kun spil med synk: et spil uden kilde har MEST brug for
 * den, for der er ingen synk, der kan redde en glemt kamp.
 *
 * Gangen er husets tør → skriv:
 *   1. vælg kampen (holdnavne og tid — aldrig dokument-id'et),
 *   2. tast mål efter ORDINÆR tid (det, der tippes på; ved knockout også
 *      slutresultatet og hvordan kampen blev afgjort),
 *   3. "Vis hvad der ændrer sig" — serverens tør-kørsel: 1/X/2 før → efter,
 *      de point, der flytter sig, og om Runde-Botten poster,
 *   4. først DA dukker "Skriv facit" op — og den skriver PRÆCIS tør-kørslens
 *      plan (kamp, mål, slut) med tør-kørslens aftryk, ikke felternes aktuelle
 *      indhold. Har kampen ændret sig siden, afviser serveren skrivningen.
 * Serveren er eneste autoritet: fladen viser facit-kontraktens fejl live
 * (src/lib/facit.js), men serveren validerer igen med sin egen kopi.
 *
 * Kamplisten hentes FØRST, når knappen trykkes (useGameRounds) — fanen viser
 * alle spil på én gang, og et opslag pr. spil ved hver indlæsning ville koste
 * hundredvis af læsninger.
 */
import { useState } from 'react';
import { useGameRounds } from './useGameRounds';
import { callSaetFacitManuelt, callFrigivFacitTilSynk } from './adminActions';
import {
  AFGJORT, AFGJORT_NAVN, erKnockoutRunde, erManuelFacit, facitFejl,
} from '../../lib/facit';
import { formatKickoff } from '../../lib/daDate';
import { fmtSignedDec } from '../../lib/daNum';

// De to advarsler, ejeren skal have læst, før han skriver. Eksporteret, så
// testen binder PRÆCIS denne tekst — og så dialogen og confirm siger det samme.
export const ADVARSEL_SYNK = 'Synken overskriver ikke denne kamp herefter. En tastefejl rettes kun her.';
export const ADVARSEL_BOT = 'Er det rundens sidste kamp, skriver Runde-Botten straks på alle ligavægge. Det kan ikke trækkes tilbage.';

function toMs(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v.seconds != null) return v.seconds * 1000;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

const harFacit = (m) => m.result != null && m.result !== '';
const maal = (h, a) => (h == null || a == null ? '—' : `${h}-${a}`);

/** Kampen, som den står i listen: holdnavne, runde, tid og facit. */
export function kampEtiket(m) {
  const ko = toMs(m.kickoff);
  const dele = [
    m.round != null ? `Rd ${m.round}` : null,
    `${m.home ?? '?'} – ${m.away ?? '?'}`,
    ko != null ? formatKickoff(ko) : 'uden kickoff',
    harFacit(m) ? `facit ${maal(m.homeGoals, m.awayGoals)}` : 'mangler facit',
    erManuelFacit(m) ? '✍️ sat i hånden' : null,
  ];
  return dele.filter(Boolean).join(' · ');
}

/**
 * Kampe, der KAN få facit: kickoff passeret (serveren afviser resten).
 * Dem uden facit først (ældste øverst — dem har alarmen meldt), derefter dem
 * med facit, nyeste først (det er dem, man retter).
 */
export function facitKandidater(kampe, nowMs) {
  const spillet = kampe.filter((m) => { const k = toMs(m.kickoff); return k != null && k <= nowMs; });
  const uden = spillet.filter((m) => !harFacit(m)).sort((a, b) => toMs(a.kickoff) - toMs(b.kickoff));
  const med = spillet.filter(harFacit).sort((a, b) => toMs(b.kickoff) - toMs(a.kickoff));
  return [...uden, ...med];
}

/** Heltal ud af et input-felt, eller null (tomt/ugyldigt). */
function tal(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}


/** Tør-kørslens svar som sætninger — hver for sig, så testen kan binde dem. */
export function prognoseLinjer(d) {
  const linjer = [];
  const udfald = (r) => r ?? 'intet facit';
  linjer.push(`1/X/2: ${udfald(d.foer.result)} → ${d.efter.result}. Mål: ${maal(d.foer.homeGoals, d.foer.awayGoals)} → ${maal(d.efter.homeGoals, d.efter.awayGoals)}.`);
  if (d.efter.slut) {
    linjer.push(`Slutresultat ${d.efter.slut.home}-${d.efter.slut.away} ${AFGJORT_NAVN[d.efter.slut.afgjort] || ''} — vises separat og flytter ingen point.`);
  }
  if (d.ingenAendring) {
    linjer.push('Facit står allerede sådan, sat i hånden. Der er intet at skrive.');
    return linjer;
  }
  if (!d.udfaldSkifter) {
    linjer.push('1X2 er det samme, så ingen point, Elo eller odds flytter sig.');
  } else if (d.gatet) {
    linjer.push('Kampen ligger før spillets start og giver ingen point. Elo og odds på kommende kampe regnes om.');
  } else {
    const p = d.point;
    linjer.push(`${p.tips} tips på kampen. ${p.spillere} spillere får ændret point, i alt ${fmtSignedDec(p.iAlt)}${p.combi ? ` (heraf combi ${fmtSignedDec(p.combi)})` : ''}. Elo og odds på kommende kampe regnes om.`);
    // Spillere UDEN tip på kampen, hvis combi flytter sig. Triggeren
    // genberegner dem ikke (kendt hul, gameScoring.spillereTriggerenGenberegner)
    // — så de er IKKE med i tallet ovenfor, og fladen siger, hvornår de får den.
    const s = d.senere;
    if (s?.spillere > 0) {
      linjer.push(`${s.spillere} spillere uden tip på denne kamp får ændret combi (i alt ${fmtSignedDec(s.combi)}), men ikke nu: serveren genberegner kun dem, der har tippet kampen. De får den, når et af deres egne tips afgøres eller rettes — eller når du trykker 🔄 Genberegn point efter start-ændring.`);
    }
  }
  if (d.botPoster) {
    linjer.push('Det er rundens sidste kamp: Runde-Botten skriver straks på alle ligavægge, når du skriver.');
  }
  return linjer;
}

function FacitPanel({ game, harSynk, onSkrevet }) {
  const { kampe, henter, fejl } = useGameRounds(game.id);
  const [matchId, setMatchId] = useState('');
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [slutHome, setSlutHome] = useState('');
  const [slutAway, setSlutAway] = useState('');
  const [afgjort, setAfgjort] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { kind, text }
  const [plan, setPlan] = useState(null); // tør-kørslens svar

  if (fejl) return <span className="badge badge--red">{fejl}</span>;
  if (henter) return <span style={{ color: 'var(--c-muted)', fontSize: '0.85rem' }}>Henter kampene…</span>;

  const kandidater = facitKandidater(kampe, Date.now());
  const kamp = kandidater.find((m) => m.id === matchId) || null;
  const knockout = kamp ? erKnockoutRunde(game, kamp.round) : false;
  const h = tal(home);
  const a = tal(away);
  const visSlut = knockout && h != null && h === a;
  const input = {
    home: h,
    away: a,
    slut: visSlut ? { home: tal(slutHome), away: tal(slutAway), afgjort: afgjort || null } : null,
  };
  const udfyldt = kamp && h != null && a != null;
  const valideringsFejl = udfyldt ? facitFejl(input, { knockout }) : null;

  // Hver ændring i felterne gør en gammel tør-kørsel forældet — så skal
  // skrive-knappen væk, ellers skrev man noget andet end det, man så.
  const nulstil = () => { setPlan(null); setMsg(null); };

  function vaelgKamp(id) {
    setMatchId(id);
    const m = kandidater.find((x) => x.id === id);
    // Et eksisterende facit fyldes ind, så en RETTELSE starter fra det, der står.
    setHome(m && harFacit(m) && m.homeGoals != null ? String(m.homeGoals) : '');
    setAway(m && harFacit(m) && m.awayGoals != null ? String(m.awayGoals) : '');
    setSlutHome(m?.slut ? String(m.slut.home) : '');
    setSlutAway(m?.slut ? String(m.slut.away) : '');
    setAfgjort(m?.slut?.afgjort || '');
    nulstil();
  }

  async function visAendring() {
    setBusy(true); nulstil();
    const res = await callSaetFacitManuelt({
      gameId: game.id, matchId, homeGoals: h, awayGoals: a, slut: input.slut, dryRun: true,
    });
    if (!res.ok) { setMsg({ kind: 'err', text: res.error }); setBusy(false); return; }
    setPlan(res.data);
    setBusy(false);
  }

  // Skriver PLANEN — det, tør-kørslen viste — ikke felternes aktuelle
  // indhold. Felterne og planen holdes i takt af nulstil(), men skulle de en
  // dag drive fra hinanden, er det planen, admin har set og sagt ja til.
  async function skriv() {
    const linjer = prognoseLinjer(plan);
    if (!window.confirm(
      `Skriv facit for ${plan.kamp.home} – ${plan.kamp.away} i "${game.name}"?\n\n`
      + `${linjer.join('\n')}\n\n${ADVARSEL_SYNK}\n\n${ADVARSEL_BOT}`,
    )) return;
    setBusy(true); setMsg(null);
    const res = await callSaetFacitManuelt({
      gameId: game.id,
      matchId: plan.kamp.id,
      homeGoals: plan.efter.homeGoals,
      awayGoals: plan.efter.awayGoals,
      slut: plan.efter.slut ?? null,
      aftryk: plan.aftryk,
      dryRun: false,
    });
    setBusy(false);
    // Afvist (fx "Kampen er ændret siden tør-kørslen"): den gamle plan er
    // forældet, så skrive-knappen skal væk med den.
    if (!res.ok) { setPlan(null); setMsg({ kind: 'err', text: res.error }); return; }
    // Svaret bærer sit eget dryRun/skrevet — brug DET, så en tør-kørsel ikke
    // kan melde sig som skrevet (samme fælde som Ompris).
    if (res.data?.dryRun === false && res.data?.skrevet === true) {
      onSkrevet({
        kind: 'ok',
        text: `Facit skrevet: ${res.data.kamp.home} – ${res.data.kamp.away} ${maal(res.data.efter.homeGoals, res.data.efter.awayGoals)} (${res.data.efter.result})${res.data.efter.slut ? `, slutresultat ${res.data.efter.slut.home}-${res.data.efter.slut.away} ${AFGJORT_NAVN[res.data.efter.slut.afgjort] || ''}` : ''}. Point, Elo og odds afregnes nu af serveren${res.data.botPoster ? ', og Runde-Botten poster på ligavæggene' : ''}.`,
      });
    } else {
      setMsg({ kind: 'err', text: 'Serveren skrev INTET. Vis ændringen igen.' });
    }
  }

  async function frigiv() {
    if (!window.confirm(
      `Lad synken overtage ${kamp.home} – ${kamp.away} igen?\n\n`
      + 'Facit bliver stående, men siger kilden noget andet, overskriver synken det ved næste kørsel — og point, Elo og odds afregnes om.',
    )) return;
    setBusy(true); setMsg(null);
    const res = await callFrigivFacitTilSynk({ gameId: game.id, matchId, dryRun: false });
    setBusy(false);
    if (!res.ok) { setMsg({ kind: 'err', text: res.error }); return; }
    if (res.data?.dryRun === false && res.data?.frigivet === true) {
      onSkrevet({ kind: 'ok', text: `${kamp.home} – ${kamp.away} er givet tilbage til synken.` });
    } else {
      setMsg({ kind: 'err', text: 'Serveren ændrede INTET. Prøv igen.' });
    }
  }

  if (!kandidater.length) {
    return <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--c-muted)' }}>Ingen af spillets kampe er begyndt endnu — facit kan først sættes efter kickoff.</p>;
  }

  const felt = { width: '4rem' };
  return (
    <div style={{ marginTop: '0.5rem', padding: '0.6rem', border: '1px solid var(--c-border, #ddd)', borderRadius: '0.5rem' }}>
      <p role="note" style={{ margin: '0 0 0.5rem', fontSize: '0.85rem' }}>
        <strong>{ADVARSEL_SYNK}</strong> {ADVARSEL_BOT}
      </p>
      <select
        className="select" aria-label={`Kamp at sætte facit på i ${game.name}`}
        value={matchId} style={{ width: '100%' }}
        onChange={(e) => vaelgKamp(e.target.value)}
      >
        <option value="">– Vælg kamp –</option>
        {kandidater.map((m) => <option key={m.id} value={m.id}>{kampEtiket(m)}</option>)}
      </select>

      {kamp && (
        <div style={{ marginTop: '0.5rem' }}>
          <div className="flex items-center" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
            {/* TODO(D4/D12): «(60 min)» efter "ordinær tid" for håndbold —
                ordet skal komme fra sportsprofilen (sportProfil(game).ord), ikke
                fra en gate på sport. Udsat til D4/D12. */}
            <span style={{ fontSize: '0.85rem' }}>
              Mål efter ordinær tid{knockout ? ' (uden forlængelse og straffekast — det, der tippes på)' : ''}:
            </span>
            <input type="number" min="0" inputMode="numeric" style={felt} aria-label={`Mål ${kamp.home}`}
              value={home} onChange={(e) => { setHome(e.target.value); nulstil(); }} />
            <span>–</span>
            <input type="number" min="0" inputMode="numeric" style={felt} aria-label={`Mål ${kamp.away}`}
              value={away} onChange={(e) => { setAway(e.target.value); nulstil(); }} />
          </div>
          {visSlut && (
            <div className="flex items-center" style={{ gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
              <span style={{ fontSize: '0.85rem' }}>Slutresultat efter forlængelse/straffekast:</span>
              <input type="number" min="0" inputMode="numeric" style={felt} aria-label={`Slutresultat ${kamp.home}`}
                value={slutHome} onChange={(e) => { setSlutHome(e.target.value); nulstil(); }} />
              <span>–</span>
              <input type="number" min="0" inputMode="numeric" style={felt} aria-label={`Slutresultat ${kamp.away}`}
                value={slutAway} onChange={(e) => { setSlutAway(e.target.value); nulstil(); }} />
              <select className="select" aria-label="Hvordan blev kampen afgjort" value={afgjort}
                onChange={(e) => { setAfgjort(e.target.value); nulstil(); }}>
                <option value="">– Afgjort hvordan? –</option>
                {AFGJORT.map((x) => <option key={x} value={x}>{AFGJORT_NAVN[x]}</option>)}
              </select>
            </div>
          )}
          {valideringsFejl && <p className="badge badge--red" style={{ marginTop: '0.4rem' }}>{valideringsFejl}</p>}

          <div className="flex items-center" style={{ gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            <button className="btn btn--ghost btn--sm" onClick={visAendring} disabled={busy || !udfyldt || Boolean(valideringsFejl)}>
              {busy ? 'Regner…' : 'Vis hvad der ændrer sig'}
            </button>
            {plan && !plan.ingenAendring && (
              <button className="btn btn--sm" onClick={skriv} disabled={busy}>Skriv facit</button>
            )}
            {harSynk && erManuelFacit(kamp) && (
              <button className="btn btn--ghost btn--sm" onClick={frigiv} disabled={busy}>↩️ Lad synken overtage igen</button>
            )}
          </div>
          {plan && (
            <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem', fontSize: '0.85rem' }}>
              {prognoseLinjer(plan).map((l) => <li key={l}>{l}</li>)}
            </ul>
          )}
        </div>
      )}
      {msg && <p className={`badge ${msg.kind === 'ok' ? 'badge--green' : 'badge--red'}`} style={{ marginTop: '0.4rem' }}>{msg.text}</p>}
    </div>
  );
}

export default function ManuelFacit({ game, harSynk }) {
  const [aaben, setAaben] = useState(false);
  // Efter en skrivning monteres panelet forfra, så kamplisten hentes igen og
  // viser det nye facit — kvitteringen står herude og overlever det.
  const [version, setVersion] = useState(0);
  const [kvittering, setKvittering] = useState(null);

  return (
    <div style={{ marginTop: '0.6rem' }}>
      <div className="flex items-center" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="btn btn--ghost btn--sm" onClick={() => { setAaben((x) => !x); setKvittering(null); }} aria-expanded={aaben}>
          ✍️ Sæt eller ret facit i hånden
        </button>
        {kvittering && (
          <span className={`badge ${kvittering.kind === 'ok' ? 'badge--green' : 'badge--red'}`}>{kvittering.text}</span>
        )}
      </div>
      {aaben && (
        <FacitPanel
          key={version} game={game} harSynk={harSynk}
          onSkrevet={(k) => { setKvittering(k); setVersion((v) => v + 1); }}
        />
      )}
    </div>
  );
}
