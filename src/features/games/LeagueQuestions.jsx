/**
 * LeagueQuestions — liga-ejerens egne spørgsmål i en spil-liga.
 * Medlemmer svarer indtil deadline; ejeren sætter facit bagefter, og pointene
 * lægges til ligaens INTERNE stilling (ikke spillets hovedstilling).
 */
import { useState } from 'react';
import {
  createLeagueQuestion, setLeagueQuestionFacit, deleteLeagueQuestion,
  saveLeagueQuestionAnswer, LEAGUE_Q_LABEL_MAX,
} from './gameLeagueActions';
import { scoreLeagueQuestion, lqSettled, lqPoints } from './leagueQuestionScoring';
import { formatKickoff } from '../../lib/daDate';

const TYPE_LABEL = { text: 'Tekst', yesno: 'Ja/Nej', number: 'Tal (nærmest vinder)' };

function deadlinePassed(q, nowMs) {
  return q.deadline != null && Number(q.deadline) <= nowMs;
}

/** Ét spørgsmål: svar-input (før deadline), status og facit/vindere (efter). */
function QuestionRow({ q, gameId, leagueId, meUid, isOwner, answers, byUid }) {
  const nowMs = Date.now();
  const locked = deadlinePassed(q, nowMs);
  const settled = lqSettled(q);
  const mine = answers.find((a) => a.uid === meUid);
  const [draft, setDraft] = useState(mine?.answer ?? '');
  const [facitDraft, setFacitDraft] = useState('');
  const [accepted, setAccepted] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { kind, text }

  async function saveAnswer(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await saveLeagueQuestionAnswer({ uid: meUid, gameId, leagueId, questionId: q.id, answer: draft });
    setMsg(res.ok ? { kind: 'ok', text: 'Svar gemt ✓' } : { kind: 'err', text: res.error });
    setBusy(false);
  }
  async function saveFacit(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await setLeagueQuestionFacit({
      gameId, leagueId, questionId: q.id, facit: facitDraft,
      acceptedAnswers: accepted.split(',').map((s) => s.trim()).filter(Boolean),
    });
    setMsg(res.ok ? { kind: 'ok', text: 'Facit gemt — pointene tæller nu i liga-stillingen.' } : { kind: 'err', text: res.error });
    setBusy(false);
  }
  async function remove() {
    if (!window.confirm(`Slet spørgsmålet "${q.label}"?`)) return;
    setBusy(true);
    const res = await deleteLeagueQuestion({ gameId, leagueId, questionId: q.id });
    if (!res.ok) { setMsg({ kind: 'err', text: res.error }); setBusy(false); }
  }

  const per = settled ? scoreLeagueQuestion(q, answers) : {};
  const winners = Object.keys(per);

  return (
    <li style={{ borderTop: '1px solid var(--c-border)', padding: '0.6rem 0' }}>
      <div className="flex items-center justify-between" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600 }}>{q.label}</span>
        <span style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
          <span className="badge badge--muted">{lqPoints(q)} point · {TYPE_LABEL[q.type] || 'Tekst'}</span>
          {isOwner && (
            <button className="btn--icon" title="Slet spørgsmål" disabled={busy} onClick={remove}
              style={{ background: 'none', border: 'none', color: 'var(--c-err)', cursor: 'pointer', padding: 0 }}>
              ✕
            </button>
          )}
        </span>
      </div>
      <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', marginTop: 2 }}>
        {q.deadline != null
          ? (locked ? `Deadline passeret (${formatKickoff(Number(q.deadline))})` : `Svar inden ${formatKickoff(Number(q.deadline))}`)
          : 'Ingen deadline'}
        {` · ${answers.length} svar`}
      </div>

      {msg && (
        <p className={`badge ${msg.kind === 'ok' ? 'badge--green' : 'badge--red'}`} style={{ marginTop: '0.35rem' }}>
          {msg.text}
        </p>
      )}

      {/* Eget svar — indtil deadline (og før facit). */}
      {!locked && !settled && (
        <form onSubmit={saveAnswer} className="flex" style={{ gap: '0.4rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
          {q.type === 'yesno' ? (
            <select value={draft} onChange={(e) => setDraft(e.target.value)} className="select" style={{ maxWidth: 120 }}>
              <option value="">– svar –</option>
              <option value="ja">Ja</option>
              <option value="nej">Nej</option>
            </select>
          ) : (
            <input
              type={q.type === 'number' ? 'text' : 'text'} inputMode={q.type === 'number' ? 'decimal' : undefined}
              value={draft} onChange={(e) => setDraft(e.target.value)}
              placeholder={q.type === 'number' ? 'fx 42' : 'Dit svar'} style={{ maxWidth: 220 }}
            />
          )}
          <button className="btn btn--sm" type="submit" disabled={busy || !String(draft).trim()}>
            {mine ? 'Ret svar' : 'Svar'}
          </button>
          {mine && <span style={{ fontSize: '0.78rem', color: 'var(--c-muted)', alignSelf: 'center' }}>Dit svar: {mine.answer}</span>}
        </form>
      )}

      {/* Efter deadline: vis svarene; efter facit: vis vinderne. */}
      {(locked || settled) && answers.length > 0 && (
        <div style={{ marginTop: '0.4rem', fontSize: '0.85rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          {answers.map((a) => (
            <span key={a.uid} className={`badge ${settled && per[a.uid] ? 'badge--green' : 'badge--muted'}`}>
              {(byUid[a.uid]?.name) || 'Spiller'}: {a.answer}{settled && per[a.uid] ? ` (+${per[a.uid]})` : ''}
            </span>
          ))}
        </div>
      )}
      {settled && (
        <div style={{ marginTop: '0.35rem', fontSize: '0.85rem' }}>
          Facit: <strong>{q.facit}</strong>
          {winners.length === 0 && <span style={{ color: 'var(--c-muted)' }}> · ingen ramte rigtigt</span>}
        </div>
      )}

      {/* Ejer: sæt facit når deadline er passeret (eller når som helst uden deadline). */}
      {isOwner && !settled && (locked || q.deadline == null) && (
        <form onSubmit={saveFacit} className="flex" style={{ gap: '0.4rem', marginTop: '0.45rem', flexWrap: 'wrap' }}>
          <input
            type="text" value={facitDraft} onChange={(e) => setFacitDraft(e.target.value)}
            placeholder="Facit" style={{ maxWidth: 180 }}
          />
          {q.type === 'text' && (
            <input
              type="text" value={accepted} onChange={(e) => setAccepted(e.target.value)}
              placeholder="Også godkendt (komma-adskilt)" style={{ maxWidth: 240 }}
            />
          )}
          <button className="btn btn--sm" type="submit" disabled={busy || !facitDraft.trim()}>Gem facit</button>
        </form>
      )}
    </li>
  );
}

export default function LeagueQuestions({ gameId, leagueId, meUid, isOwner, questions, answersByQid, byUid }) {
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState('');
  const [type, setType] = useState('text');
  const [points, setPoints] = useState(5);
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function create(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    const res = await createLeagueQuestion({
      uid: meUid, gameId, leagueId, label, type, points: Number(points), deadline: deadline || null,
    });
    if (res.ok) { setLabel(''); setDeadline(''); setShowForm(false); }
    else setErr(res.error);
    setBusy(false);
  }

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <div className="flex items-center justify-between" style={{ gap: '0.5rem' }}>
        <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>❓ Liga-spørgsmål</div>
        {isOwner && (
          <button className="btn btn--ghost btn--sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Luk' : '+ Nyt spørgsmål'}
          </button>
        )}
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--c-muted)', margin: '0.2rem 0 0' }}>
        Ligaens egne sidevæddemål — pointene tæller kun i liga-stillingen her.
      </p>

      {err && <p className="badge badge--red" style={{ marginTop: '0.4rem' }}>{err}</p>}

      {isOwner && showForm && (
        <form onSubmit={create} style={{ marginTop: '0.5rem', display: 'grid', gap: '0.4rem' }}>
          <input
            type="text" value={label} maxLength={LEAGUE_Q_LABEL_MAX}
            placeholder='fx "Hvem af os kommer sidst på ranglisten i oktober?"'
            onChange={(e) => setLabel(e.target.value)}
          />
          <div className="flex" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
            <select className="select" value={type} onChange={(e) => setType(e.target.value)} style={{ maxWidth: 180 }}>
              <option value="text">Tekst</option>
              <option value="yesno">Ja/Nej</option>
              <option value="number">Tal (nærmest vinder)</option>
            </select>
            <input
              type="number" min={1} max={100} value={points}
              onChange={(e) => setPoints(e.target.value)} style={{ width: 90 }} aria-label="Point"
            />
            <input
              type="datetime-local" value={deadline}
              onChange={(e) => setDeadline(e.target.value)} aria-label="Deadline (valgfri)"
            />
            <button className="btn btn--sm" type="submit" disabled={busy || label.trim().length < 3}>Opret</button>
          </div>
        </form>
      )}

      {questions.length === 0 ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--c-muted)', margin: '0.5rem 0 0' }}>
          Ingen spørgsmål endnu{isOwner ? ' — opret det første.' : '.'}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>
          {questions.map((q) => (
            <QuestionRow
              key={q.id} q={q} gameId={gameId} leagueId={leagueId} meUid={meUid}
              isOwner={isOwner} answers={answersByQid[q.id] || []} byUid={byUid}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
