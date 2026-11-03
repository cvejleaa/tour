/**
 * 📥 Læg næste fases kampe ind (Admin → 🗓️ Spil-tidsplan) — D9.
 *
 * PLACERING (CLAUDE.md trin 0b): lige efter ✍️ Sæt eller ret facit i hånden.
 * Natten efter en fase er arbejdsgangen «sæt facit → læg næste fase ind», og
 * det er hertil udeblivelses-alarmen (Drift → `faseKampe`) sender ejeren.
 *
 * GATE: forventerFaseKampe(game) — evnen «kalenderen ved, at en fase kommer»
 * (src/lib/facit.js, delt med callablen, Drift-kortet og sweep'et). Ikke
 * sporten og ikke fravær af synk.
 *
 * ORDLYD: «Læg … ind», aldrig «Hent» — knappen henter intet; ejeren taster det,
 * IHF og TV viser. Den bliver til «Hent», når en kilde findes (D9b).
 *
 * FORMULAREN (ejerens valg 3/11): dato, tid i DANSK tid og to rullelister fra
 * spillets egen holdliste. Klienten fortolker intet: den sender felterne, og
 * serveren (functions-platform/faseKampe.js) udleder dagen, validerer hver
 * regel og priser kampen. Gangen er husets tør → skriv:
 *   1. «Vis hvad der oprettes» — serverens tør-kørsel: en tabel med dag,
 *      ugedag, dato og tid i dansk tid (den eneste kontrol af det tastede),
 *      odds, fejl pr. linje og advarsler,
 *   2. først DA, og kun uden fejl, dukker «Opret de N kampe» op — og den
 *      opretter PRÆCIS tør-kørslens plan med dens aftryk. Er noget ændret
 *      imens (et facit, en pris, en kamp), afviser serveren.
 *
 * RET KICKOFF (QC B1): kickoff er tip-låsen. En tastefejl kan rettes her, så
 * længe kampen ikke har facit og ikke er gået i gang — på samme dato.
 */
import { useEffect, useState } from 'react';
import { useGameRounds } from './useGameRounds';
import { callOpretFaseKampe, callRetFaseKampKickoff } from './adminActions';
import { fmtDec } from '../../lib/daNum';
import { formatKickoff } from '../../lib/daDate';
import { rundeEtiket } from '../../lib/faser';

export const KNAP_TEKST = '📥 Læg næste fases kampe ind';
// Står ordret i panelet OG i confirm — testen binder den.
export const ADVARSEL_FORTRYD = 'Oprettede kampe kan ikke fortrydes i appen: de kan hverken slettes eller flyttes til en anden dag. Kun kickoff kan rettes (nedenfor), så længe kampen ikke er gået i gang.';
export const FORKLARING = 'Tast dato og tid i dansk tid (som IHF og TV viser dem), og vælg de to hold. Serveren finder selv dagen i kalenderen, tjekker at holdene var med i fasen før, og priser kampen af den levende Elo.';

// Hver række får sin egen nøgle, så React ikke flytter indtastningen, når en
// række fjernes. Nøglen sendes ikke til serveren (se kampeTilServer).
let naesteNoegle = 1;
const tomRaekke = (dato = '') => ({ noegle: naesteNoegle++, dato, tid: '', hjemme: '', ude: '' });
/** Kun de felter, serveren læser. */
const kampeTilServer = (rs) => rs.map(({ dato, tid, hjemme, ude }) => ({ dato, tid, hjemme, ude }));

function toMs(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v.seconds != null) return v.seconds * 1000;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}
const harFacit = (m) => m.result != null && m.result !== '';

/** Kampe, hvis kickoff kan rettes: uden facit og ikke gået i gang. */
export function retteKandidater(kampe, nowMs) {
  return (kampe || [])
    .filter((m) => !harFacit(m) && toMs(m.kickoff) != null && toMs(m.kickoff) > nowMs)
    .sort((a, b) => toMs(a.kickoff) - toMs(b.kickoff));
}

function Plan({ plan }) {
  return (
    <div style={{ marginTop: '0.5rem' }}>
      {plan.nye.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.85rem' }} aria-label="Kampe, der oprettes">
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th style={{ padding: '0.15rem 0.4rem' }}>Dag</th>
                <th style={{ padding: '0.15rem 0.4rem' }}>Kamp</th>
                <th style={{ padding: '0.15rem 0.4rem' }}>Spilles (dansk tid)</th>
                <th style={{ padding: '0.15rem 0.4rem' }}>Odds (1/X/2)</th>
              </tr>
            </thead>
            <tbody>
              {plan.nye.map((n) => (
                <tr key={n.id} style={{ borderTop: '1px solid var(--c-border, #eee)' }}>
                  <td style={{ padding: '0.15rem 0.4rem' }}>{n.etiket}</td>
                  <td style={{ padding: '0.15rem 0.4rem' }}>{n.home} – {n.away}</td>
                  <td style={{ padding: '0.15rem 0.4rem' }}><strong>{n.tid}</strong></td>
                  <td style={{ padding: '0.15rem 0.4rem' }}>
                    {fmtDec(n.odds['1'], 2)} / {fmtDec(n.odds.X, 2)} / {fmtDec(n.odds['2'], 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {plan.fejl.length > 0 && (
        <ul className="badge--red" style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem', fontSize: '0.85rem' }} aria-label="Fejl">
          {plan.fejl.map((f) => (
            <li key={`${f.linje}-${f.tekst}`}>{f.linje ? `Kamp ${f.linje}: ` : ''}{f.tekst}</li>
          ))}
        </ul>
      )}
      {plan.advarsler.length > 0 && (
        <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem', fontSize: '0.85rem' }} aria-label="Advarsler">
          {plan.advarsler.map((a) => <li key={a}>⚠ {a}</li>)}
        </ul>
      )}
    </div>
  );
}

function RetKickoff({ game, onSkrevet }) {
  const { kampe, henter, fejl } = useGameRounds(game.id);
  const [matchId, setMatchId] = useState('');
  const [tid, setTid] = useState('');
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  if (fejl) return <span className="badge badge--red">{fejl}</span>;
  if (henter) return <span style={{ color: 'var(--c-muted)', fontSize: '0.85rem' }}>Henter kampene…</span>;
  const kandidater = retteKandidater(kampe, Date.now());
  if (!kandidater.length) {
    return <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--c-muted)' }}>Ingen kampe uden facit, der ikke er gået i gang — der er intet kickoff at rette.</p>;
  }
  const nulstil = () => { setPlan(null); setMsg(null); };
  async function vis() {
    setBusy(true); nulstil();
    const res = await callRetFaseKampKickoff({ gameId: game.id, matchId, tid, dryRun: true });
    setBusy(false);
    if (!res.ok) { setMsg({ kind: 'err', text: res.error }); return; }
    setPlan(res.data);
  }
  async function skriv() {
    if (!window.confirm(`Ret kickoff for ${plan.kamp.home} – ${plan.kamp.away}?\n\n${plan.foer.tid} → ${plan.efter.tid} (dansk tid). Tip-låsen flytter med.${plan.advarsler.length ? `\n\n${plan.advarsler.join('\n')}` : ''}`)) return;
    setBusy(true); setMsg(null);
    const res = await callRetFaseKampKickoff({
      gameId: game.id, matchId: plan.kamp.id, tid, aftryk: plan.aftryk, dryRun: false,
    });
    setBusy(false);
    if (!res.ok) { setPlan(null); setMsg({ kind: 'err', text: res.error }); return; }
    if (res.data?.dryRun === false && res.data?.skrevet === true) {
      onSkrevet({ kind: 'ok', text: `Kickoff rettet: ${res.data.kamp.home} – ${res.data.kamp.away} spilles ${res.data.efter.tid}.` });
    } else {
      setMsg({ kind: 'err', text: 'Serveren skrev INTET. Vis rettelsen igen.' });
    }
  }
  return (
    <div style={{ marginTop: '0.4rem' }}>
      <div className="flex items-center" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
        <select
          className="select" aria-label={`Kamp at rette kickoff på i ${game.name}`} value={matchId}
          onChange={(e) => { setMatchId(e.target.value); nulstil(); }}
        >
          <option value="">– Vælg kamp –</option>
          {kandidater.map((m) => (
            <option key={m.id} value={m.id}>
              {rundeEtiket(game, m.round)} · {m.home} – {m.away} · {formatKickoff(toMs(m.kickoff))}
            </option>
          ))}
        </select>
        <input
          type="time" aria-label="Nyt kickoff (dansk tid)" value={tid}
          onChange={(e) => { setTid(e.target.value); nulstil(); }}
        />
        <button className="btn btn--ghost btn--sm" onClick={vis} disabled={busy || !matchId || !tid}>Vis rettelsen</button>
        {plan && <button className="btn btn--sm" onClick={skriv} disabled={busy}>Ret kickoff</button>}
      </div>
      {plan && (
        <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem', fontSize: '0.85rem' }}>
          <li>{plan.kamp.home} – {plan.kamp.away}: {plan.foer.tid} → <strong>{plan.efter.tid}</strong> (dansk tid).</li>
          {plan.advarsler.map((a) => <li key={a}>⚠ {a}</li>)}
        </ul>
      )}
      {msg && <p className={`badge ${msg.kind === 'ok' ? 'badge--green' : 'badge--red'}`} style={{ marginTop: '0.4rem' }}>{msg.text}</p>}
    </div>
  );
}

function Panel({ game, onSkrevet }) {
  const [status, setStatus] = useState(null);
  const [raekker, setRaekker] = useState([tomRaekke()]);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [visRet, setVisRet] = useState(false);
  const hold = (Array.isArray(game.teams) ? game.teams : [])
    .map((t) => t?.name).filter((n) => typeof n === 'string').sort((a, b) => a.localeCompare(b, 'da'));

  // Serverens status (hvilke dage mangler kampe og kan stadig få dem) — en
  // tør-kørsel uden kampe. Klienten tæller ikke selv.
  useEffect(() => {
    let afbrudt = false;
    (async () => {
      const res = await callOpretFaseKampe({ gameId: game.id, kampe: [], dryRun: true });
      if (afbrudt) return;
      if (!res.ok) { setMsg({ kind: 'err', text: res.error }); return; }
      setStatus(res.data.status);
      const forste = res.data.status?.aabneDage?.[0]?.dato || '';
      setRaekker([tomRaekke(forste)]);
    })();
    return () => { afbrudt = true; };
  }, [game.id]);

  const nulstil = () => { setPlan(null); setMsg(null); };
  const ret = (i, felt, v) => {
    setRaekker((rs) => rs.map((r, j) => (j === i ? { ...r, [felt]: v } : r)));
    nulstil();
  };
  const udfyldt = raekker.length > 0 && raekker.every((r) => r.dato && r.tid && r.hjemme && r.ude);

  async function vis() {
    setBusy(true); nulstil();
    const res = await callOpretFaseKampe({ gameId: game.id, kampe: kampeTilServer(raekker), dryRun: true });
    setBusy(false);
    if (!res.ok) { setMsg({ kind: 'err', text: res.error }); return; }
    setPlan({ ...res.data, raekker });
  }

  async function opret() {
    if (!window.confirm(
      `Opret ${plan.nye.length} ${plan.nye.length === 1 ? 'kamp' : 'kampe'} i "${game.name}"?\n\n`
      + `${plan.nye.map((n) => `${n.etiket}: ${n.home} – ${n.away}, ${n.tid}`).join('\n')}\n\n`
      + `${plan.advarsler.length ? `${plan.advarsler.join('\n')}\n\n` : ''}${ADVARSEL_FORTRYD}`,
    )) return;
    setBusy(true); setMsg(null);
    // PLANEN oprettes — de rækker, tør-kørslen så — med dens aftryk.
    const res = await callOpretFaseKampe({
      gameId: game.id, kampe: kampeTilServer(plan.raekker), aftryk: plan.aftryk, dryRun: false,
    });
    setBusy(false);
    if (!res.ok) { setPlan(null); setMsg({ kind: 'err', text: res.error }); return; }
    if (res.data?.dryRun === false && res.data?.skrevet === true) {
      const afregnet = res.data.puljeAfregnet;
      const pulje = !afregnet ? ''
        : afregnet.fejl ? ` Puljen kunne IKKE afregnes (${afregnet.fejl}) — tryk 🎖️ Afregn puljen.`
          : ` Puljen er afgjort og afregnet (${afregnet.settled} tip).`;
      onSkrevet({ kind: 'ok', text: `${res.data.nye.length} ${res.data.nye.length === 1 ? 'kamp' : 'kampe'} oprettet.${pulje}` });
    } else {
      setMsg({ kind: 'err', text: 'Serveren oprettede INTET. Vis igen.' });
    }
  }

  const kanOprette = plan && plan.fejl.length === 0 && plan.nye.length > 0;
  return (
    <div style={{ marginTop: '0.5rem', padding: '0.6rem', border: '1px solid var(--c-border, #ddd)', borderRadius: '0.5rem' }}>
      <p role="note" style={{ margin: '0 0 0.4rem', fontSize: '0.85rem' }}><strong>{ADVARSEL_FORTRYD}</strong></p>
      <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', color: 'var(--c-muted)' }}>{FORKLARING}</p>
      {status && (
        <ul style={{ margin: '0 0 0.5rem', paddingLeft: '1.2rem', fontSize: '0.85rem' }} aria-label="Status">
          {status.linjer.map((l) => <li key={l}>{l}</li>)}
        </ul>
      )}
      {raekker.map((r, i) => (
        <div key={r.noegle} className="flex items-center" style={{ gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
          <input type="date" aria-label={`Dato, kamp ${i + 1}`} value={r.dato} onChange={(e) => ret(i, 'dato', e.target.value)} />
          <input type="time" aria-label={`Tid (dansk tid), kamp ${i + 1}`} value={r.tid} onChange={(e) => ret(i, 'tid', e.target.value)} />
          <select className="select" aria-label={`Hjemmehold, kamp ${i + 1}`} value={r.hjemme} onChange={(e) => ret(i, 'hjemme', e.target.value)}>
            <option value="">– Hjemme –</option>
            {hold.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <span>–</span>
          <select className="select" aria-label={`Udehold, kamp ${i + 1}`} value={r.ude} onChange={(e) => ret(i, 'ude', e.target.value)}>
            <option value="">– Ude –</option>
            {hold.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          {raekker.length > 1 && (
            <button className="btn btn--ghost btn--sm" aria-label={`Fjern kamp ${i + 1}`} onClick={() => { setRaekker((rs) => rs.filter((_, j) => j !== i)); nulstil(); }}>✕</button>
          )}
        </div>
      ))}
      <div className="flex items-center" style={{ gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
        <button className="btn btn--ghost btn--sm" onClick={() => { setRaekker((rs) => [...rs, tomRaekke(rs[rs.length - 1]?.dato || '')]); nulstil(); }}>
          ＋ Tilføj kamp
        </button>
        <button className="btn btn--ghost btn--sm" onClick={vis} disabled={busy || !udfyldt}>
          {busy ? 'Regner…' : 'Vis hvad der oprettes'}
        </button>
        {kanOprette && (
          <button className="btn btn--sm" onClick={opret} disabled={busy}>
            Opret de {plan.nye.length} {plan.nye.length === 1 ? 'kamp' : 'kampe'}
          </button>
        )}
      </div>
      {plan && <Plan plan={plan} />}
      {msg && <p className={`badge ${msg.kind === 'ok' ? 'badge--green' : 'badge--red'}`} style={{ marginTop: '0.4rem' }}>{msg.text}</p>}

      <div style={{ marginTop: '0.6rem' }}>
        <button className="btn btn--ghost btn--sm" onClick={() => setVisRet((x) => !x)} aria-expanded={visRet}>
          🕒 Ret kickoff på en kamp
        </button>
        {visRet && <RetKickoff game={game} onSkrevet={onSkrevet} />}
      </div>
    </div>
  );
}

export default function FaseKampe({ game }) {
  const [aaben, setAaben] = useState(false);
  // Efter en skrivning monteres panelet forfra (ny status, ny kampliste) —
  // kvitteringen står herude og overlever det.
  const [version, setVersion] = useState(0);
  const [kvittering, setKvittering] = useState(null);
  return (
    <div style={{ marginTop: '0.6rem' }}>
      <div className="flex items-center" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="btn btn--ghost btn--sm" onClick={() => { setAaben((x) => !x); setKvittering(null); }} aria-expanded={aaben}>
          {KNAP_TEKST}
        </button>
        {kvittering && (
          <span className={`badge ${kvittering.kind === 'ok' ? 'badge--green' : 'badge--red'}`}>{kvittering.text}</span>
        )}
      </div>
      {aaben && (
        <Panel
          key={version} game={game}
          onSkrevet={(k) => { setKvittering(k); setVersion((v) => v + 1); }}
        />
      )}
    </div>
  );
}
