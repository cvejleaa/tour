/**
 * GameReminderTab (kun platform) — per-spil tip-påmindelser. Vælg FØRST spillet,
 * send så en testmail til dig selv, eller udløs den rigtige udsendelse nu til
 * alle deltagere der mangler at tippe på kampe det næste døgn. Der kører også et
 * automatisk dagligt job kl. 09.00 for aktive fodbold-spil.
 */
import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useGames } from '../games/useGames';
import { setGamePaused } from '../games/gameActions';
import { forventerPaamindelser } from '../games/spilEvner';
import {
  callSendGameTipRemindersNow, callSendGameTestReminderToMe, callGamePuljeStatus,
  callGameTipStatus,
} from './adminActions';
import { groupByRound, activeRound } from '../games/football/footballRounds';
import { fraStartRunde, startRundeFor } from '../../lib/startGate';
import { formatKickoff } from '../../lib/daDate';
import { GAME_STATUS } from '../../lib/constants';

export default function GameReminderTab() {
  const { games, loading } = useGames();
  // Kun spil med et kampprogram (fodbold-spil) kan have tip-påmindelser.
  const eligible = useMemo(
    () => (games || []).filter((g) => g.type === 'football' && g.status !== GAME_STATUS.FINISHED),
    [games],
  );

  const [gameId, setGameId] = useState('');
  useEffect(() => {
    if (eligible.length && !eligible.some((g) => g.id === gameId)) setGameId(eligible[0].id);
  }, [eligible, gameId]);

  const [busy, setBusy] = useState(null); // 'test' | 'now' | 'pulje' | 'pulje-remind' | 'tip' | null
  const [msg, setMsg] = useState(null);   // { kind, text }
  const [pauseBusy, setPauseBusy] = useState(false);
  const [pauseFejl, setPauseFejl] = useState(null);
  const [pulje, setPulje] = useState(null);     // resultat fra gamePuljeStatus
  const [puljeMsg, setPuljeMsg] = useState(null); // { kind, text }

  // ── Tip-status (opgave #37) ──────────────────────────────────────────────
  // Kampene hentes ÉN gang pr. spil ved første klik (aldrig ved mount, aldrig
  // onSnapshot — fanen rummer også Send-knapperne, og hvert besøg må ikke
  // koste en kamplæsning; QC-krav på planen). Runden vælges i KLIENTEN med
  // præcis samme kode som Tip-fanen (groupByRound/activeRound + startgaten) —
  // en server-kopi af "aktiv runde" ville være en uspejlet dublet.
  const [tipMatches, setTipMatches] = useState(null); // pr. valgt spil
  const [tipStatus, setTipStatus] = useState(null);   // svar fra gameTipStatus
  const [tipMsg, setTipMsg] = useState(null);
  useEffect(() => { setTipMatches(null); setTipStatus(null); setTipMsg(null); }, [gameId]);

  const valgtSpil = useMemo(() => eligible.find((g) => g.id === gameId) || null, [eligible, gameId]);
  // Fanen viser fodbold-spil uden 'finished'-status (eligible), men det
  // daglige job kører KUN for open/live (forventerPaamindelser). For et spil
  // udenfor jobbets gate (fx uden status) deaktiveres påmindelses-knapperne —
  // fanen må ikke tilbyde en manuel knap, hvis automatiske tvilling er tavs
  // for samme spil. Tip-status og pulje-status er IKKE påmindelser og virker
  // stadig (QC-fund på planen: gaten må ikke tage dem med i faldet).
  const kanPaamindes = forventerPaamindelser(valgtSpil);
  const paused = valgtSpil?.paused === true;

  // Pausen læses direkte af spillet — ikke af en lokal kopi. Knappen skriver
  // med det samme, og badge/etiket vender, når snapshottet kommer tilbage;
  // det ER kvitteringen (samme mønster som synligheds-knappen).
  async function togglePause() {
    setPauseBusy(true); setPauseFejl(null);
    const res = await setGamePaused(gameId, !paused);
    if (!res.ok) setPauseFejl(res.error || 'Kunne ikke ændre pausen.');
    setPauseBusy(false);
  }
  const tipRunder = useMemo(() => {
    if (!tipMatches) return [];
    const synlige = fraStartRunde(tipMatches, startRundeFor(valgtSpil, tipMatches));
    // Kampe uden rundenummer samles af groupByRound som "runde 0" — den kan
    // serveren ikke svare på, så den skal heller ikke kunne vælges.
    return groupByRound(synlige).filter((r) => r.round >= 1);
  }, [tipMatches, valgtSpil]);

  async function tjekTipStatus(runde) {
    setBusy('tip'); setTipMsg(null);
    try {
      let matches = tipMatches;
      if (!matches) {
        const snap = await getDocs(collection(db, 'games', gameId, 'matches'));
        matches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setTipMatches(matches);
      }
      const synlige = fraStartRunde(matches, startRundeFor(valgtSpil, matches));
      const runder = groupByRound(synlige);
      const valgt = runde ?? activeRound(runder, Date.now());
      if (!Number.isFinite(valgt)) {
        setTipMsg({ kind: 'err', text: 'Spillet har ingen runder at vise.' });
        setBusy(null);
        return;
      }
      const res = await callGameTipStatus(gameId, valgt);
      if (res.ok) setTipStatus(res.data);
      else setTipMsg({ kind: 'err', text: res.error });
    } catch (e) {
      setTipMsg({ kind: 'err', text: e?.message || 'Kunne ikke hente tip-status.' });
    }
    setBusy(null);
  }

  async function checkPulje(remind) {
    if (remind && !window.confirm(`Send påmindelses-mail til de ${pulje?.missing?.length ?? '?'} der mangler pulje-tippet?`)) return;
    setBusy(remind ? 'pulje-remind' : 'pulje'); setPuljeMsg(null);
    const res = await callGamePuljeStatus(gameId, { remind });
    if (res.ok) {
      setPulje(res.data);
      if (remind) setPuljeMsg({ kind: 'ok', text: `Påmindelse sendt til ${res.data.reminded} spiller${res.data.reminded === 1 ? '' : 'e'}.` });
    } else {
      setPuljeMsg({ kind: 'err', text: res.error });
    }
    setBusy(null);
  }
  async function sendTest() {
    setBusy('test'); setMsg(null);
    const res = await callSendGameTestReminderToMe(gameId);
    setMsg(res.ok
      ? { kind: 'ok', text: `Testmail sendt til dig (${res.data?.matches ?? '?'} kommende kampe).` }
      : { kind: 'err', text: res.error });
    setBusy(null);
  }
  async function sendNow() {
    if (!window.confirm('Send de rigtige påmindelser nu til alle med manglende tips i dette spil?')) return;
    setBusy('now'); setMsg(null);
    const res = await callSendGameTipRemindersNow(gameId);
    if (res.ok) {
      const d = res.data || {};
      // fejlede SKAL med: "Sendte 0" ved totalt SMTP-nedbrud må ikke ligne
      // "alle har tippet" — samme krav som driftkortets linje (QC-fund).
      if (d.fejlede > 0) {
        setMsg({ kind: 'err', text: `${d.fejlede} af ${d.sent + d.fejlede} påmindelser kunne ikke sendes (${d.sent} sendt) — se functions-loggen.` });
      } else {
        setMsg({ kind: 'ok', text: d.reason
          ? `Sendte 0 — ${d.reason === 'no-matches' ? 'ingen kampe inden for det næste døgn.' : d.reason}`
          : `Sendte ${d.sent} påmindelse${d.sent === 1 ? '' : 'r'} (${d.upcoming} kommende kampe).` });
      }
    } else setMsg({ kind: 'err', text: res.error });
    setBusy(null);
  }

  if (loading) return <div className="spinner" role="status" aria-label="Indlæser" />;

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>🔔 Tip-påmindelser</h3>

      <div className="form-group" style={{ maxWidth: 340 }}>
        <label className="form-label" htmlFor="reminder-game">Spil</label>
        {eligible.length === 0 ? (
          <p style={{ color: 'var(--c-muted)' }}>Ingen aktive fodbold-spil.</p>
        ) : (
          <select id="reminder-game" className="select" value={gameId} onChange={(e) => setGameId(e.target.value)}>
            {eligible.map((g) => <option key={g.id} value={g.id}>{g.emoji ? `${g.emoji} ` : ''}{g.name}</option>)}
          </select>
        )}
      </div>

      {/* Nødstop for det daglige job — pr. SPIL. Badge/etiket læses direkte af
          spillet (live-snapshot = kvitteringen). Vises kun for spil, jobbet
          overhovedet kører for: en pause på et spil uden påmindelser ville
          være en kontakt uden ledning. */}
      {valgtSpil && kanPaamindes && (
        <div className="flex items-center" style={{ gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
          <button className="btn btn--ghost btn--sm" disabled={pauseBusy} onClick={togglePause}>
            {pauseBusy ? 'Ændrer…' : (paused ? '▶ Genoptag påmindelser' : '⏸ Sæt påmindelser på pause')}
          </button>
          <span className={`badge ${paused ? 'badge--red' : 'badge--green'}`}>
            {paused ? '● På pause' : '● Kører'}
          </span>
          {pauseFejl && <span className="badge badge--red">{pauseFejl}</span>}
        </div>
      )}

      {/* Hjælpeteksten skifter med pausen — 09.00-løftet og "På pause" må
          ALDRIG stå som to nabosætninger, der modsiger hinanden (QC-fund). */}
      <p style={{ color: 'var(--c-muted)' }}>
        {paused ? (
          <>
            Den daglige 09.00-mail er <strong>sat på pause for dette spil</strong> — et nødstop, ikke et
            sæsonværktøj: står den glemt, misser deltagerne en deadline uden at vide det, og drift-kortet
            under 🩺 Driftstatus står gult/rødt, til den genoptages. Pausen rører <strong>kun</strong> påmindelserne:
            resultat-synk, pointafregning og Runde-Botten kører videre, og <strong>Send nu</strong> nedenfor
            virker stadig manuelt.
          </>
        ) : (
          <>
            Deltagere får automatisk en mail <strong>kl. 09.00</strong>, hvis de mangler at tippe på kampe
            inden for det næste døgn. <strong>Send testmail</strong> går kun til dig; <strong>Send nu</strong> kører
            den rigtige udsendelse til alle med manglende tips i det valgte spil.
          </>
        )}
      </p>

      {/* Et spil i fanen, som 09-jobbet alligevel springer over (fx uden
          status), må ikke have aktive påmindelses-knapper — så lover fanen en
          udsendelse, automatikken aldrig ville lave. */}
      {valgtSpil && !kanPaamindes && (
        <p className="badge badge--yellow" style={{ display: 'block' }}>
          Spillet er uden for det daglige jobs gate (kræver status Åbent eller I gang) — påmindelses-knapperne
          er slået fra. Sæt status under 🗓️ Spil-tidsplan.
        </p>
      )}

      {/* ── Hvem mangler at tippe? (over Send-knapperne: se → ryk) ──────── */}
      <div className="card mb-2" style={{ padding: '0.75rem 1rem' }} data-testid="tipstatus">
        <h4 style={{ margin: '0 0 0.35rem' }}>🎯 Hvem mangler at tippe?</h4>
        <p style={{ color: 'var(--c-muted)', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
          Her ser du kun, <strong>om</strong> der er tippet — aldrig hvad. Folks 1X2-valg ser du
          i spillet under <em>Se ligaens tips</em>, når kampen er gået i gang. Listen viser
          <strong> alle</strong> spillets deltagere — også dem, du ikke deler liga med.
        </p>

        {tipMsg && (
          <p className={`badge ${tipMsg.kind === 'ok' ? 'badge--green' : 'badge--red'} mb-2`} style={{ display: 'block' }}>
            {tipMsg.text}
          </p>
        )}

        {tipStatus && (
          <div data-testid="tipstatus-resultat">
            <div className="flex items-center" style={{ gap: '0.5rem', flexWrap: 'wrap', marginBottom: 6 }}>
              <label htmlFor="tipstatus-runde" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Runde</label>
              <select
                id="tipstatus-runde" className="select" style={{ width: 'auto' }}
                value={tipStatus.runde} disabled={busy}
                onChange={(e) => tjekTipStatus(Number(e.target.value))}
              >
                {tipRunder.map((r) => <option key={r.round} value={r.round}>{r.round}</option>)}
              </select>
              <span style={{ fontSize: '0.85rem', color: 'var(--c-muted)' }}>
                {tipStatus.kampeIRunden} kampe i runden
              </span>
            </div>
            {/* Knappens EGET tal — kortets runde-tal kan være større, og de to
                må aldrig kunne læses som samme løfte (QC-fund på planen). */}
            <p style={{ fontSize: '0.82rem', margin: '0 0 0.5rem' }} data-testid="tipstatus-knaptal">
              ⚡ <em>Send påmindelser nu</em> rammer lige nu <strong>{tipStatus.rammesAfKnappenNu}</strong>
              {' '}spiller{tipStatus.rammesAfKnappenNu === 1 ? '' : 'e'} — den rykker kun for kampe
              inden for det <strong>næste døgn</strong>, ikke for hele runden.
            </p>
            {tipStatus.spillere.every((s) => s.manglende.length === 0) ? (
              <span className="badge badge--green">Alle har tippet hele runden 🎉</span>
            ) : (
              tipStatus.spillere.map((s) => (
                <div key={s.uid} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center', padding: '0.15rem 0' }}>
                  <span style={{ fontSize: '0.85rem', minWidth: 130 }}>
                    <strong>{s.navn}</strong> {s.tippet}/{s.ialt}
                    {!s.kanRykkes && <span title="Ingen mail eller har slået påmindelser fra" style={{ color: 'var(--c-muted)' }}> · ✉️ kan ikke nås</span>}
                  </span>
                  {s.manglende.map((m) => (
                    <span
                      key={m.id}
                      className={`badge ${m.naaedeDetIkke ? 'badge--muted' : m.haster ? 'badge--yellow' : ''}`}
                      title={m.kickoff != null ? formatKickoff(m.kickoff) : undefined}
                    >
                      {m.kamp}{m.naaedeDetIkke ? ' · nåede det ikke' : m.haster ? ' · haster' : ''}
                    </span>
                  ))}
                </div>
              ))
            )}
          </div>
        )}

        <div style={{ marginTop: '0.5rem' }}>
          <button className="btn btn--ghost btn--sm" disabled={!gameId || busy} onClick={() => tjekTipStatus()} data-testid="tipstatus-tjek">
            {busy === 'tip' ? 'Tjekker…' : '🔎 Tjek tip-status'}
          </button>
        </div>
      </div>

      {msg && (
        <p className={`badge ${msg.kind === 'ok' ? 'badge--green' : 'badge--red'} mb-2`} style={{ display: 'block' }}>
          {msg.text}
        </p>
      )}

      <div className="flex items-center" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="btn btn--ghost" disabled={!gameId || busy || !kanPaamindes} onClick={sendTest}>
          {busy === 'test' ? 'Sender…' : '🧪 Send testmail til mig'}
        </button>
        {/* Pausen deaktiverer IKKE Send nu — den manuelle vej er netop
            udvejen, mens automatikken holder pause (hjælpeteksten lover det). */}
        <button className="btn" disabled={!gameId || busy || !kanPaamindes} onClick={sendNow}>
          {busy === 'now' ? 'Sender…' : 'Send påmindelser nu'}
        </button>
      </div>

      {/* ── Pulje-status ─────────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid var(--c-border)', marginTop: '1.25rem', paddingTop: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>🎖️ Pulje-status</h3>
        <p style={{ color: 'var(--c-muted)' }}>
          Se hvem der har sat deres <strong>pulje-tip</strong> (sæsonens bonusspørgsmål) — og ryk dem,
          der mangler, med én mail.
        </p>

        {puljeMsg && (
          <p className={`badge ${puljeMsg.kind === 'ok' ? 'badge--green' : 'badge--red'} mb-2`} style={{ display: 'block' }}>
            {puljeMsg.text}
          </p>
        )}

        {pulje && (
          <div className="card mb-2" style={{ padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: '0.85rem', marginBottom: 6 }}>
              <strong>{pulje.tipped.length}/{pulje.total}</strong> har tippet puljen
              {pulje.lockAt != null && (
                <span style={{ color: 'var(--c-muted)' }}>
                  {' '}· {pulje.locked ? 'Låst siden' : 'Deadline'} {formatKickoff(pulje.lockAt)}
                </span>
              )}
            </div>
            {pulje.missing.length === 0 ? (
              <span className="badge badge--green">Alle har tippet 🎉</span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--c-muted)', alignSelf: 'center' }}>Mangler:</span>
                {pulje.missing.map((m) => (
                  <span key={m.uid} className="badge badge--yellow">{m.name}</span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
          <button className="btn btn--ghost" disabled={!gameId || busy} onClick={() => checkPulje(false)}>
            {busy === 'pulje' ? 'Tjekker…' : '🔎 Tjek pulje-status'}
          </button>
          {pulje && pulje.missing.length > 0 && !pulje.locked && (
            <button className="btn" disabled={busy} onClick={() => checkPulje(true)}>
              {busy === 'pulje-remind' ? 'Sender…' : `📣 Ryk dem der mangler (${pulje.missing.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
