/**
 * LeagueBonus — ligaens egne bonusspørgsmål: opret (manager), besvar (medlem),
 * sæt facit (manager) og se point. Point tæller kun i denne liga.
 *
 * Samme opsætning som de officielle bonusspørgsmål: typerne Fritekst, Hold
 * (vælg ét/flere), Tal, Tidsangivelse og Ja/nej, plus et frit pointfelt.
 * 'Tal' afgøres relativt pr. liga — den/de nærmeste på facit vinder.
 */
import { useState, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import { LEAGUE_BONUS_TYPE, BONUS_ANSWER_TYPES } from '../../lib/constants';
import { TOUR_TEAMS, prettyTeam } from '../../data/tourTeams2026';
import {
  createLeagueBonus, setLeagueBonusFacit, deleteLeagueBonus, saveLeagueBonusAnswer,
  updateLeagueBonus, approveLeagueBonusAnswer, removeLeagueBonusAnswer,
  copyLeagueBonusToLeagues,
} from './leagueBonusActions';
import { scoreLeagueBonus, closestWinners } from './leagueBonusScoring';
import {
  isBonusLocked, formatDeadline, formatBonusAnswer, isBonusAnswerEmpty,
} from '../bonus/bonusHelpers';

/** Firestore Timestamp/Date → 'YYYY-MM-DDTHH:mm' til <input type="datetime-local">. */
function tsToLocalInput(ts) {
  const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
  if (!d || Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TYPE_BADGE = {
  [LEAGUE_BONUS_TYPE.TEXT]: '✍️ Fritekst',
  [LEAGUE_BONUS_TYPE.TEAM]: '🚲 Hold',
  [LEAGUE_BONUS_TYPE.TEAMS]: '🚲 Hold (flere)',
  [LEAGUE_BONUS_TYPE.NUMBER]: '🎯 Tal (nærmest vinder)',
  [LEAGUE_BONUS_TYPE.TIME]: '⏱️ Tid',
  [LEAGUE_BONUS_TYPE.BOOLEAN]: '🔀 Ja/Nej',
};

/** Tom startværdi for en type (array for 'teams', ellers tom streng). */
function emptyFor(type) {
  return type === LEAGUE_BONUS_TYPE.TEAMS ? [] : '';
}

function hasAnswer(value) {
  return !isBonusAnswerEmpty(value);
}

function displayAnswer(value, type) {
  if (isBonusAnswerEmpty(value)) return '—';
  return formatBonusAnswer(value, type);
}

// ── Svar-/facit-input pr. type (samme typer som officiel bonus) ───────────────
function AnswerInput({ type, value, onChange, disabled }) {
  if (type === LEAGUE_BONUS_TYPE.TEAM) {
    return (
      <select className="select" style={{ maxWidth: 300 }} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">– Vælg hold –</option>
        {TOUR_TEAMS.map((t) => <option key={t} value={t}>{prettyTeam(t)}</option>)}
      </select>
    );
  }
  if (type === LEAGUE_BONUS_TYPE.TEAMS) {
    const selected = Array.isArray(value) ? value : [];
    const toggle = (t) => onChange(selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t]);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', maxWidth: 300, maxHeight: 200, overflowY: 'auto' }}>
        {TOUR_TEAMS.map((t) => (
          <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
            <input type="checkbox" checked={selected.includes(t)} disabled={disabled} onChange={() => toggle(t)} />
            {prettyTeam(t)}
          </label>
        ))}
      </div>
    );
  }
  if (type === LEAGUE_BONUS_TYPE.BOOLEAN) {
    return (
      <select className="select" style={{ maxWidth: 300 }} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">– Vælg –</option>
        <option value="ja">Ja</option>
        <option value="nej">Nej</option>
      </select>
    );
  }
  // number / time / text
  return (
    <input
      className="input"
      type={type === LEAGUE_BONUS_TYPE.NUMBER ? 'number' : 'text'}
      style={{ maxWidth: 300 }}
      value={value ?? ''} disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder={type === LEAGUE_BONUS_TYPE.TIME ? 'fx 1:23' : 'Dit svar...'}
    />
  );
}

// ── Redigér-formular (manager) ───────────────────────────────────────────────
function EditForm({ q, onDone }) {
  const [label, setLabel] = useState(q.label ?? '');
  const [type, setType] = useState(q.type ?? LEAGUE_BONUS_TYPE.TEXT);
  const [points, setPoints] = useState(String(Number(q.points) || 5));
  const [deadline, setDeadline] = useState(tsToLocalInput(q.deadline));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await updateLeagueBonus(q.id, {
        label,
        type,
        points: Number(points),
        deadline: deadline ? Timestamp.fromDate(new Date(deadline)) : null,
      });
      onDone();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <input className="input" placeholder="Spørgsmål" value={label} maxLength={140} onChange={(e) => setLabel(e.target.value)} required />
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.82rem' }}>Type
          <select className="select" value={type} onChange={(e) => setType(e.target.value)} style={{ marginLeft: 6, maxWidth: 200 }} aria-label="Type">
            {BONUS_ANSWER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label style={{ fontSize: '0.82rem' }}>Point
          <input className="input" type="number" min={1} value={points} onChange={(e) => setPoints(e.target.value)} style={{ width: 80, marginLeft: 6 }} aria-label="Point" />
        </label>
      </div>
      <label style={{ fontSize: '0.82rem' }}>Svarfrist:
        <input className="input" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} required style={{ marginLeft: 6 }} />
      </label>
      {err && <p className="form-error">{err}</p>}
      <div className="flex gap-1">
        <button className="btn btn--sm" type="submit" disabled={busy}>Gem ændringer</button>
        <button className="btn btn--ghost btn--sm" type="button" onClick={onDone}>Annullér</button>
      </div>
    </form>
  );
}

// ── Manager: godkend indsendte stavemåder (fritekst, efter deadline) ──────────
function ApprovalList({ q, submissions }) {
  const [busy, setBusy] = useState('');
  const accepted = q.acceptedAnswers ?? [];

  // Distinct svar + antal
  const counts = new Map();
  for (const s of submissions) {
    const a = (s.answer ?? '').trim();
    if (a) counts.set(a, (counts.get(a) || 0) + 1);
  }
  const rows = [...counts.entries()].sort((x, y) => y[1] - x[1]);
  if (rows.length === 0) return null;

  async function toggle(answer, isApproved) {
    setBusy(answer);
    try {
      if (isApproved) await removeLeagueBonusAnswer(q.id, answer);
      else await approveLeagueBonusAnswer(q.id, answer);
    } catch (e) { window.alert(e.message); }
    finally { setBusy(''); }
  }

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', marginBottom: '0.3rem' }}>Indsendte svar (godkend stavemåder):</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {rows.map(([answer, count]) => {
          const ok = scoreLeagueBonus(q, answer) > 0;
          const manual = accepted.includes(answer);
          return (
            <div key={answer} className="flex items-center" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
              <span className="badge badge--muted">{count}×</span>
              <span style={{ fontSize: '0.88rem' }}>{answer}</span>
              <span className={`badge ${ok ? 'badge--green' : 'badge--muted'}`} style={{ fontSize: '0.7rem' }}>{ok ? '✓ Tæller' : 'Tæller ikke'}</span>
              {manual ? (
                <button className="btn btn--ghost btn--sm" disabled={busy === answer} onClick={() => toggle(answer, true)}>Fjern godkendelse</button>
              ) : (!ok && (
                <button className="btn btn--sm" disabled={busy === answer} onClick={() => toggle(answer, false)}>Godkend</button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Afsløring: alles svar (efter låsning for alle; altid for manager) ─────────
function AllAnswers({ q, meUid, submissions, usersByUid, isManager }) {
  const [open, setOpen] = useState(false);
  const isFinished = q.facit != null && q.facit !== '';
  const nameOf = (uid) => usersByUid[uid]?.displayName || 'Spiller';

  // NUMBER afgøres relativt: find vinder-uid'erne (de nærmeste) én gang.
  const numberWinners = (q.type === LEAGUE_BONUS_TYPE.NUMBER && isFinished)
    ? closestWinners(q.facit, submissions) : null;
  const pointsOf = (q2) => Number(q2.points) || 0;
  const ptsOf = (s) => {
    if (!isFinished) return null;
    if (q.type === LEAGUE_BONUS_TYPE.NUMBER) return numberWinners.has(s.uid) ? pointsOf(q) : 0;
    return scoreLeagueBonus(q, s.answer);
  };

  const sorted = [...submissions].sort((a, b) => {
    if (isFinished) {
      const diff = ptsOf(b) - ptsOf(a);
      if (diff !== 0) return diff;
    }
    return nameOf(a.uid).localeCompare(nameOf(b.uid), 'da');
  });

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <button
        className="btn btn--ghost btn--sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="reveal-league-bonus-answers-btn"
      >
        {open ? 'Skjul alles svar' : '👀 Se alles svar'}
        {isManager && !open && <span className="badge badge--blue" style={{ marginLeft: '0.4rem', fontSize: '0.65rem' }}>manager</span>}
      </button>
      {open && (
        sorted.length === 0 ? (
          <p style={{ fontSize: '0.83rem', color: 'var(--c-muted)', marginTop: '0.4rem' }}>Ingen svar på dette spørgsmål.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {sorted.map((s) => {
              const mine = s.uid === meUid;
              const pts = ptsOf(s);
              return (
                <li
                  key={s.uid}
                  data-testid="league-bonus-answer-row"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--c-border)', paddingBottom: '0.35rem' }}
                >
                  <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>
                    {nameOf(s.uid)}{mine && <span className="badge badge--blue" style={{ marginLeft: '0.3rem' }}>dig</span>}
                  </span>
                  <span style={{ fontSize: '0.86rem' }}>{displayAnswer(s.answer, q.type)}</span>
                  {pts !== null && (
                    <span className={`badge ${pts > 0 ? 'badge--green' : 'badge--muted'}`} style={{ fontSize: '0.7rem', marginLeft: 'auto' }}>
                      {pts > 0 ? `+${pts}` : '0'}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}

// ── Global admin: kopiér spørgsmålet til alle andre (godkendte) ligaer ────────
function CopyToAllButton({ q, meUid, allLeagues }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // Mål: alle godkendte ligaer undtagen denne. (status mangler på ældre ligaer
  // → behandl manglende status som godkendt.)
  const targets = allLeagues.filter(
    (l) => l.id !== q.leagueId && (l.status ?? 'approved') === 'approved',
  );

  async function handleCopy() {
    if (!targets.length) { setMsg('Ingen andre ligaer at kopiere til.'); return; }
    if (!window.confirm(
      `Kopiér «${q.label}» til ${targets.length} andre ligaer? ` +
      'Hver liga afgøres for sig (den nærmeste i ligaen vinder).',
    )) return;
    setBusy(true); setMsg('');
    try {
      const res = await copyLeagueBonusToLeagues(q, targets.map((l) => l.id), meUid);
      const skip = res.skipped ? ` (${res.skipped} havde den allerede)` : '';
      setMsg(res.errors.length
        ? `Kopieret til ${res.created}${skip} — ${res.errors.length} fejlede.`
        : `✓ Kopieret til ${res.created} ligaer${skip}.`);
    } catch (e) {
      setMsg('Fejl: ' + e.message);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <button
        className="btn btn--ghost btn--sm" disabled={busy} onClick={handleCopy}
        data-testid="copy-league-bonus-all"
      >
        {busy ? 'Kopierer…' : `📋 Kopiér til alle ligaer (${targets.length})`}
      </button>
      {msg && (
        <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: msg.startsWith('Fejl') ? 'var(--c-err)' : 'var(--c-ok)' }}>
          {msg}
        </span>
      )}
    </div>
  );
}

// ── Ét spørgsmål ──────────────────────────────────────────────────────────────
function QuestionCard({ q, meUid, isManager, isAdmin = false, allLeagues = [], initialAnswer, submissions = [], usersByUid = {} }) {
  const [editing, setEditing] = useState(false);
  const locked = isBonusLocked(q.deadline);
  const empty = emptyFor(q.type);
  const [answer, setAnswer] = useState(initialAnswer ?? empty);
  const [facit, setFacit] = useState(q.facit ?? empty);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [facitMsg, setFacitMsg] = useState('');

  // Synkroniser eksternt svar (fx ved load)
  useEffect(() => { setAnswer(initialAnswer ?? empty); }, [initialAnswer]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFinished = !isBonusAnswerEmpty(q.facit);
  const isAnswered = hasAnswer(initialAnswer);
  const points = Number(q.points) || 0;
  // NUMBER afgøres relativt mod ligaens øvrige svar (nærmeste vinder).
  const earnedPoints = !isFinished
    ? null
    : q.type === LEAGUE_BONUS_TYPE.NUMBER
      ? (closestWinners(q.facit, submissions).has(meUid) ? points : 0)
      : scoreLeagueBonus(q, initialAnswer);

  async function handleSave() {
    if (!hasAnswer(answer) || locked) return;
    setSaving(true); setError('');
    try {
      const value = Array.isArray(answer) ? answer : String(answer).trim();
      await saveLeagueBonusAnswer({ questionId: q.id, leagueId: q.leagueId, uid: meUid, answer: value });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Kunne ikke gemme. Prøv igen.');
    } finally { setSaving(false); }
  }
  async function saveFacit() {
    setSaving(true); setFacitMsg('');
    try {
      const value = Array.isArray(facit) ? facit : String(facit).trim();
      await setLeagueBonusFacit(q.id, value);
      setFacitMsg('✓ Facit gemt!'); setTimeout(() => setFacitMsg(''), 3000);
    } catch (e) { setFacitMsg('Fejl: ' + e.message); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!window.confirm('Slet spørgsmålet?')) return;
    try { await deleteLeagueBonus(q.id); } catch (e) { window.alert(e.message); }
  }

  const isNumber = q.type === LEAGUE_BONUS_TYPE.NUMBER;

  return (
    <li className="card" style={{ marginBottom: '0.75rem' }}>
      {/* Spørgsmålstekst + status */}
      <div style={{ marginBottom: '0.6rem' }}>
        <span className="badge badge--blue" style={{ marginBottom: '0.4rem', display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
          {TYPE_BADGE[q.type] ?? '✍️ Fritekst'}
          {isManager && (
            <>
              <button type="button" title="Redigér spørgsmål" onClick={() => setEditing((v) => !v)}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1 }}>✎</button>
              <button type="button" title="Slet spørgsmål" onClick={remove}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
            </>
          )}
        </span>
        <p style={{ margin: 0, fontWeight: 600, fontSize: '1rem' }}>{q.label}</p>
        <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--c-muted)' }}>
          {points > 0 && <>{points} point · </>}
          Deadline: {formatDeadline(q.deadline)}
          <span className={`badge ${locked ? 'badge--red' : 'badge--blue'}`} style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>
            {locked ? 'Låst' : 'Åben'}
          </span>
        </p>
      </div>

      {/* Manager: redigér spørgsmål */}
      {isManager && editing && <EditForm q={q} onDone={() => setEditing(false)} />}

      {/* Facit og point hvis afgjort */}
      {isFinished && (
        <div style={{ background: 'rgba(31,157,85,0.07)', borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: '0.5rem', fontSize: '0.88rem' }}>
          <strong>Facit:</strong> {displayAnswer(q.facit, q.type)}
          {earnedPoints !== null && (
            <span className={`badge ${earnedPoints > 0 ? 'badge--green' : 'badge--muted'}`} style={{ marginLeft: '0.75rem' }}>
              {earnedPoints > 0 ? `+${earnedPoints} point` : '0 point'}
            </span>
          )}
        </div>
      )}

      {/* Svar-felt */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <AnswerInput type={q.type} value={answer} disabled={locked} onChange={(v) => { setAnswer(v); setSaved(false); }} />
        {!locked && (
          <button className="btn" onClick={handleSave} disabled={saving || !hasAnswer(answer)} style={{ whiteSpace: 'nowrap' }}>
            {saving ? 'Gemmer…' : 'Gem svar'}
          </button>
        )}
      </div>

      {/* Feedback */}
      {saved && <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem', color: 'var(--c-ok)' }}>✓ Svar gemt!</p>}
      {error && <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem', color: 'var(--c-err)' }}>{error}</p>}

      {/* Hjælpetekst */}
      {!locked && q.type === LEAGUE_BONUS_TYPE.TEXT && (
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: 'var(--c-muted)' }}>
          Store/små bogstaver, accenter og ekstra mellemrum er ligegyldige.
        </p>
      )}
      {!locked && isNumber && (
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: 'var(--c-muted)' }}>
          Den/de der kommer tættest på i ligaen vinder{points > 0 ? ` ${points} point` : ''}.
        </p>
      )}

      {/* Vis brugerens eget svar */}
      {isAnswered && (
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.83rem', color: 'var(--c-muted)' }}>
          Dit svar: <strong style={{ color: 'var(--c-text)' }}>{displayAnswer(initialAnswer, q.type)}</strong>
        </p>
      )}

      {/* Alle svar — efter låsning for alle, altid for manager */}
      {(locked || isManager) && (
        <AllAnswers q={q} meUid={meUid} submissions={submissions} usersByUid={usersByUid} isManager={isManager} />
      )}

      {/* Manager: sæt facit */}
      {isManager && (
        <div style={{ marginTop: '0.6rem', padding: '0.5rem 0.75rem', background: 'var(--c-surface-2, rgba(0,0,0,0.04))', borderRadius: 8 }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', marginBottom: '0.3rem' }}>Facit (kun managere):</div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <AnswerInput type={q.type} value={facit} onChange={setFacit} />
            <button className="btn btn--ghost" onClick={saveFacit} disabled={saving} style={{ whiteSpace: 'nowrap' }}>Gem facit</button>
          </div>
          {facitMsg && <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem', color: facitMsg.startsWith('Fejl') ? 'var(--c-err)' : 'var(--c-ok)' }}>{facitMsg}</p>}
          {/* Global admin: kopiér spørgsmålet (m. evt. facit) til alle andre ligaer */}
          {isAdmin && allLeagues.length > 0 && (
            <CopyToAllButton q={q} meUid={meUid} allLeagues={allLeagues} />
          )}
          {/* Godkend stavemåder (fritekst, når svar er synlige efter deadline) */}
          {q.type === LEAGUE_BONUS_TYPE.TEXT && locked && isFinished && (
            <ApprovalList q={q} submissions={submissions} />
          )}
        </div>
      )}
    </li>
  );
}

// ── Opret-formular (manager) ────────────────────────────────────────────────
function CreateForm({ leagueId, meUid }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(LEAGUE_BONUS_TYPE.TEXT);
  const [label, setLabel] = useState('');
  const [points, setPoints] = useState('5');
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await createLeagueBonus({
        leagueId, createdBy: meUid, type, label,
        points: Number(points),
        deadline: deadline ? Timestamp.fromDate(new Date(deadline)) : null,
      });
      setLabel(''); setDeadline(''); setPoints('5'); setType(LEAGUE_BONUS_TYPE.TEXT); setOpen(false);
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  if (!open) {
    return <button className="btn btn--sm mt-1" onClick={() => setOpen(true)}>+ Nyt bonusspørgsmål</button>;
  }
  return (
    <form onSubmit={submit} style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <input className="input" placeholder="Spørgsmål" value={label} maxLength={140} onChange={(e) => setLabel(e.target.value)} required />
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.82rem' }}>Type
          <select className="select" value={type} onChange={(e) => setType(e.target.value)} style={{ marginLeft: 6, maxWidth: 200 }} aria-label="Type">
            {BONUS_ANSWER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label style={{ fontSize: '0.82rem' }}>Point
          <input className="input" type="number" min={1} value={points} onChange={(e) => setPoints(e.target.value)} style={{ width: 80, marginLeft: 6 }} aria-label="Point" />
        </label>
      </div>
      <label style={{ fontSize: '0.82rem' }}>Svarfrist:
        <input className="input" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} required style={{ marginLeft: 6 }} />
      </label>
      {err && <p className="form-error">{err}</p>}
      <div className="flex gap-1">
        <button className="btn btn--sm" type="submit" disabled={busy}>Opret</button>
        <button className="btn btn--ghost btn--sm" type="button" onClick={() => setOpen(false)}>Annullér</button>
      </div>
    </form>
  );
}

export default function LeagueBonus({ leagueId, meUid, isManager, isAdmin = false, allLeagues = [], questions, myAnswers, answersByQid = {}, usersByUid = {} }) {
  // #6: hvor mange åbne spørgsmål mangler jeg at svare på?
  const unanswered = questions.filter(
    (q) => !isBonusLocked(q.deadline) && !hasAnswer(myAnswers[q.id]),
  ).length;

  return (
    <div className="card mt-2">
      <h3 className="card__title mb-2" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        🎲 Liga-bonus
        {unanswered > 0 && (
          <span className="badge badge--red" style={{ fontSize: '0.72rem' }}>
            Du mangler at svare på {unanswered}
          </span>
        )}
      </h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--c-muted)', marginTop: '-0.3rem' }}>
        Ligaens egne bonusspørgsmål. Point tæller kun i denne liga.
      </p>

      {questions.length === 0 ? (
        <p style={{ color: 'var(--c-muted)', fontSize: '0.9rem' }}>Ingen bonusspørgsmål endnu.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {questions.map((q) => (
            <QuestionCard
              key={q.id} q={q} meUid={meUid} isManager={isManager}
              isAdmin={isAdmin} allLeagues={allLeagues}
              initialAnswer={myAnswers[q.id]} submissions={answersByQid[q.id] ?? []}
              usersByUid={usersByUid}
            />
          ))}
        </ul>
      )}

      {isManager && <CreateForm leagueId={leagueId} meUid={meUid} />}
    </div>
  );
}
