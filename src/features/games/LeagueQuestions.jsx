/**
 * LeagueQuestions — liga-ejerens egne spørgsmål i en spil-liga.
 * Medlemmer svarer indtil deadline; ejeren sætter facit bagefter, og pointene
 * lægges til ligaens INTERNE stilling (ikke spillets hovedstilling).
 */
import { useState } from 'react';
import {
  createLeagueQuestion, setLeagueQuestionFacit, deleteLeagueQuestion,
  saveLeagueQuestionAnswer, callLeagueQuestionStatus, callLeagueQuestionRecapNow,
  LEAGUE_Q_LABEL_MAX,
} from './gameLeagueActions';
import { scoreLeagueQuestion, lqSettled, lqPoints } from './leagueQuestionScoring';
import { teamsOf, visOf } from './football/teamInfo';
import { formatKickoff } from '../../lib/daDate';
import { shareText } from '../../lib/share';

const TYPE_LABEL = { text: 'Tekst', yesno: 'Ja/Nej', number: 'Tal (nærmest vinder)', team: 'Hold' };

// Bottens nej-grunde oversat — 'internal' fra serveren har allerede dansk tekst.
const BOT_AARSAG = {
  'too-few-answers': 'Botten poster først ved mindst 2 svar fra ligaens medlemmer.',
  already: 'Afsløringen er allerede postet på væggen.',
  disabled: 'AI-opslag er slået fra for spillet.',
  'not-settled': 'Sæt facit først — botten afslører ved facit.',
  'no-text': 'Botten kunne ikke skrive teksten — prøv igen om lidt.',
  cooldown: 'Vent lidt — der er lige postet en afsløring af det spørgsmål (spam-værn: 10 minutter).',
};

function deadlinePassed(q, nowMs) {
  return q.deadline != null && Number(q.deadline) <= nowMs;
}

// Spillets EGNE hold. GATEN tjekker rå game.teams — med vilje ikke
// teamsOf(game), som falder tilbage på Superligaens holdliste, så et cykel-
// eller useedet spil ville få 12 danske klubber i dropdown'en. Men LISTEN
// hentes gennem teamsOf, for det er dér `vis` (visningsnavnet) lægges på.
// Ingen hold = typen findes ikke i det spil.
function holdAf(game) {
  return Array.isArray(game?.teams) && game.teams.length > 0 ? teamsOf(game) : null;
}

/** Select over spillets hold — kanonisk navn som værdi, visningsnavn som label. */
function HoldSelect({ hold, value, onChange, ariaLabel }) {
  return (
    <select className="select" value={value} onChange={onChange} aria-label={ariaLabel} style={{ maxWidth: 220 }}>
      <option value="">– vælg hold –</option>
      {hold.map((t) => (
        <option key={t.name} value={t.name}>{visOf(hold, t.name)}</option>
      ))}
    </select>
  );
}

/** Ét spørgsmål: svar-input (før deadline), status og facit/vindere (efter). */
function QuestionRow({ q, gameId, game, leagueId, meUid, isOwner, answers, byUid, status }) {
  const nowMs = Date.now();
  const locked = deadlinePassed(q, nowMs);
  const settled = lqSettled(q);
  const mine = answers.find((a) => a.uid === meUid);
  const [draft, setDraft] = useState(mine?.answer ?? '');
  const [facitDraft, setFacitDraft] = useState('');
  const [accepted, setAccepted] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { kind, text }
  const [botTekst, setBotTekst] = useState(null); // forhåndsvisning af afsløringen

  // Runde-Bottens afsløring: botten poster SELV via trigger, når facit
  // sættes — knapperne her er den bevidste start (recovery), hvis opslaget
  // mangler. Der er et lille kapløbs-vindue, hvis ejeren poster manuelt,
  // sekunder efter facit er gemt (triggeren er stadig i gang) — derfor siger
  // hjælpeteksten, at knappen kun er til når opslaget MANGLER.
  async function botKald(dryRun, tvingNy = false) {
    setBusy(true); setMsg(null);
    const res = await callLeagueQuestionRecapNow(gameId, leagueId, q.id, { dryRun, tvingNy });
    if (!res.ok) setMsg({ kind: 'err', text: res.error });
    else if (res.data?.dryRun) setBotTekst(res.data.text || '');
    else if (res.data?.posted) { setMsg({ kind: 'ok', text: 'Afsløringen er postet på væggen 🤖' }); setBotTekst(null); }
    else setMsg({ kind: 'err', text: BOT_AARSAG[res.data?.reason] || `Botten postede ikke (${res.data?.reason || 'ukendt'}).` });
    setBusy(false);
  }

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

  // Hold-spørgsmål gemmer det KANONISKE holdnavn — men fladen skal vise
  // visningsnavnet, ellers siger dropdown'en "Brighton" og badgen ved siden
  // af "Brighton and Hove Albion" (samme regel som visningsnavnFlader.test).
  // Mangler holdlisten (typen oprettet, holdene senere fjernet), falder alt
  // tilbage til rå tekst — aldrig en tom dropdown.
  const hold = q.type === 'team' ? holdAf(game) : null;
  const visSvar = (s) => (hold ? visOf(hold, s) : s);

  return (
    <li style={{ borderTop: '1px solid var(--c-border)', padding: '0.6rem 0' }}>
      <div className="flex items-center justify-between" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600 }}>{q.label}</span>
        <span style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
          <span className="badge badge--muted">{lqPoints(q)} point · {TYPE_LABEL[q.type] || 'Tekst'}</span>
          {/* Slet kun mens spørgsmålet er U-ÅBNET — rules afviser sletning
              efter facit/deadline (slet-og-genopret med samme doc-id var en
              omvej uden om "kortene kan ikke lukkes igen"; Security-fund).
              Knappen skal følge reglen, ellers står den og fejler. */}
          {isOwner && !locked && !settled && (
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
        {/* På et ÅBENT spørgsmål kan klienten kun læse sit EGET svar, så
            `answers.length` var reelt altid "1 svar" — misvisende (QC-fund).
            Ærligt: din egen status + hvornår svarene vises. Tallet er sandt
            igen efter lukning, hvor alle svar kan læses. */}
        {(locked || settled)
          ? ` · ${answers.length} svar`
          : ` · ${mine ? 'Du har svaret ✓' : 'Du mangler at svare'} · svarene vises ${q.deadline != null ? 'ved deadline' : 'når facit sættes'}`}
      </div>

      {/* Hvem mangler? — hentet via knappen (serveren afslører KUN hvem, aldrig
          hvad). Renderes i rækken, så ejeren ser mangler-listen, FØR facit
          sættes — facit kan aldrig nulstilles (QC-fund). */}
      {status && (
        <div style={{ fontSize: '0.82rem', marginTop: 4 }} data-testid={`lq-status-${q.id}`}>
          <strong>{status.besvaret} af {status.ialt}</strong> har svaret
          {status.mangler.length > 0 && (
            <>
              {' '}· mangler: {status.mangler.map((m) => (m.uid === meUid ? 'dig' : m.navn)).join(', ')}
              {/* shareText: del-dialog på mobil (direkte til chatten), ellers
                  kopiering — og ALTID en synlig kvittering: en kopiering, der
                  fejler tavst på http/gammel browser, var QC-fundet. */}
              <button
                type="button" className="btn--icon" title="Del eller kopiér navnene (til at rykke i chatten)"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0.25rem' }}
                onClick={async () => {
                  const res = await shareText(status.mangler.map((m) => m.navn).join(', '));
                  if (res.ok) setMsg({ kind: 'ok', text: res.method === 'copy' ? 'Navne kopieret — sæt dem ind i chatten.' : 'Delt!' });
                  else if (res.error || res.method === 'none') setMsg({ kind: 'err', text: 'Kunne ikke kopiere navnene.' });
                }}
              >
                📋
              </button>
            </>
          )}
        </div>
      )}

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
          ) : hold ? (
            <HoldSelect hold={hold} value={draft} onChange={(e) => setDraft(e.target.value)} ariaLabel="Dit svar" />
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
          {mine && <span style={{ fontSize: '0.78rem', color: 'var(--c-muted)', alignSelf: 'center' }}>Dit svar: {visSvar(mine.answer)}</span>}
        </form>
      )}

      {/* Efter deadline: vis svarene; efter facit: vis vinderne. */}
      {(locked || settled) && answers.length > 0 && (
        <div style={{ marginTop: '0.4rem', fontSize: '0.85rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          {answers.map((a) => (
            <span key={a.uid} className={`badge ${settled && per[a.uid] ? 'badge--green' : 'badge--muted'}`}>
              {(byUid[a.uid]?.name) || 'Spiller'}: {visSvar(a.answer)}{settled && per[a.uid] ? ` (+${per[a.uid]})` : ''}
            </span>
          ))}
        </div>
      )}
      {settled && (
        <div style={{ marginTop: '0.35rem', fontSize: '0.85rem' }}>
          Facit: <strong>{visSvar(q.facit)}</strong>
          {winners.length === 0 && <span style={{ color: 'var(--c-muted)' }}> · ingen ramte rigtigt</span>}
        </div>
      )}

      {/* Ejer: Runde-Bottens afsløring på væggen. Botten poster selv ved
          facit — dette er den bevidste start, hvis opslaget mangler. */}
      {settled && isOwner && (
        <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--c-muted)' }} data-testid={`lq-bot-${q.id}`}>
          {q.botFacitAt ? (
            <>
              🤖 Afsløringen er postet på væggen ✓{' '}
              <button
                type="button" className="btn--icon" disabled={busy}
                style={{ background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', color: 'inherit', padding: 0 }}
                onClick={() => {
                  if (window.confirm('Post afsløringen IGEN på væggen? Det gamle opslag forsvinder ikke — det skal du selv slette på væggen bagefter.')) botKald(false, true);
                }}
              >
                post igen
              </button>
            </>
          ) : (
            <>
              {/* Ærlig for BEGGE tilfælde: nye facit poster triggeren selv,
                  men spørgsmål afgjort FØR udrulningen fik aldrig en trigger
                  — for dem er knappen den eneste vej (QC-fund). */}
              🤖 Botten har ikke postet afsløringen endnu. (Nye facit poster den selv efter et øjeblik — ældre spørgsmål postes med knappen.)
              {' '}
              <button type="button" className="btn btn--sm" disabled={busy} onClick={() => botKald(true)}>Forhåndsvis</button>
              {' '}
              <button type="button" className="btn btn--sm" disabled={busy} onClick={() => botKald(false)}>Post på væggen</button>
            </>
          )}
          {botTekst != null && (
            <div style={{ marginTop: '0.35rem', padding: '0.5rem', border: '1px solid var(--c-border)', borderRadius: 8, color: 'var(--c-text)' }} data-testid={`lq-bot-udkast-${q.id}`}>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{botTekst}</p>
              <button type="button" className="btn btn--sm" disabled={busy} style={{ marginTop: '0.4rem' }} onClick={() => botKald(false)}>
                Post på væggen
              </button>
            </div>
          )}
        </div>
      )}

      {/* Ejer: sæt facit når deadline er passeret (eller når som helst uden deadline). */}
      {isOwner && !settled && (locked || q.deadline == null) && (
        <form onSubmit={saveFacit} className="flex" style={{ gap: '0.4rem', marginTop: '0.45rem', flexWrap: 'wrap' }}>
          {hold ? (
            <HoldSelect hold={hold} value={facitDraft} onChange={(e) => setFacitDraft(e.target.value)} ariaLabel="Facit" />
          ) : (
            <input
              type="text" value={facitDraft} onChange={(e) => setFacitDraft(e.target.value)}
              placeholder="Facit" style={{ maxWidth: 180 }}
            />
          )}
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

export default function LeagueQuestions({ gameId, game, leagueId, meUid, isOwner, questions, answersByQid, byUid }) {
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState('');
  const [type, setType] = useState('text');
  const [points, setPoints] = useState(5);
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Hvem mangler at svare? — SYMMETRISK (spilfører-krav): alle medlemmer må
  // se dækningen, ikke kun ejeren. Bag knappen (aldrig auto-hent), og
  // serveren afslører kun HVEM — aldrig hvad (rules-grænsen består).
  const [spStatus, setSpStatus] = useState(null);  // { pr. qId } + hentetKl
  const [spBusy, setSpBusy] = useState(false);
  const [spErr, setSpErr] = useState('');

  async function tjekHvemMangler() {
    setSpBusy(true); setSpErr('');
    const res = await callLeagueQuestionStatus(gameId, leagueId);
    if (res.ok) {
      const prQ = {};
      for (const q of res.data.spoergsmaal || []) prQ[q.id] = q;
      setSpStatus({ prQ, hentetKl: new Date() });
    } else setSpErr(res.error);
    setSpBusy(false);
  }

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
              {/* Kun i spil med egne hold — se holdAf. "Hvem vinder ligaen?"
                  skal vælges, ikke staves. */}
              {holdAf(game) && <option value="team">Hold (vælg fra listen)</option>}
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

      {questions.length > 0 && (
        <div style={{ marginTop: '0.4rem' }}>
          <button className="btn btn--ghost btn--sm" disabled={spBusy} onClick={tjekHvemMangler} data-testid="lq-hvem-mangler">
            {spBusy ? 'Henter…' : '🔎 Hvem mangler at svare?'}
          </button>
          {spStatus && (
            <span style={{ fontSize: '0.75rem', color: 'var(--c-muted)', marginLeft: 8 }}>
              Viser kun spørgsmål, der stadig kan besvares · hentet {formatKickoff(spStatus.hentetKl)}
            </span>
          )}
          {spErr && <p className="badge badge--red" style={{ marginTop: '0.3rem' }}>{spErr}</p>}
        </div>
      )}

      {questions.length === 0 ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--c-muted)', margin: '0.5rem 0 0' }}>
          Ingen spørgsmål endnu{isOwner ? ' — opret det første.' : '.'}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>
          {questions.map((q) => (
            <QuestionRow
              key={q.id} q={q} gameId={gameId} game={game} leagueId={leagueId} meUid={meUid}
              isOwner={isOwner} answers={answersByQid[q.id] || []} byUid={byUid}
              status={spStatus?.prQ[q.id] || null}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
