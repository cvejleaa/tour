/**
 * GameLeagues — private mini-ligaer i ét spil: se dine ligaer + intern stilling,
 * opret/deltag, omdøb (ejer), slet/forlad, og en liga-væg med beskeder.
 */
import { ligaRanking } from './gameStandings';
import { ligaPoint, harRundeVektor, puljenTaeller, PULJE_MAKS_STARTRUNDE } from '../../lib/ligaPoint';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Avatar from '../../components/Avatar';
import { useAuth } from '../../context/AuthContext';
import { useGameLeagues } from './useGameLeagues';
import { useGameStandings } from './useGameStandings';
import { useLeagueMessages } from './useLeagueMessages';
import { useLeagueQuestions } from './useLeagueQuestions';
import { leagueQuestionPointsByUid, leagueRankingWithQuestions } from './leagueQuestionScoring';
import LeagueQuestions from './LeagueQuestions';
import { formatPoints } from './GameLayout';
import { useKlubFarver } from './football/useKlubFarver';
import { relativeTime } from '../../lib/daDate';
import {
  createLeague, joinLeagueByCode, leaveLeague, renameLeague, deleteLeague,
  setLeagueStartRound,
  postLeagueMessage, LEAGUE_MSG_MAX,
} from './gameLeagueActions';

function LeagueTable({ rows, meUid, klubFarver }) {
  if (rows.length === 0) {
    return <p style={{ color: 'var(--c-muted)', margin: '0.5rem 0' }}>Ingen medlemmer med point endnu.</p>;
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
      <tbody>
        {rows.map((r) => (
          <tr key={r.uid} style={{ borderTop: '1px solid var(--c-border, #eee)', fontWeight: r.uid === meUid ? 700 : 400 }}>
            <td style={{ padding: '0.35rem 0.4rem', width: 32, fontVariantNumeric: 'tabular-nums' }}>{r.rank}</td>
            <td style={{ padding: '0.35rem 0.4rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <Avatar
                  uid={r.uid} name={r.name} emoji={r.emoji} favoriteTeam={r.favoriteTeam}
                  klubFarver={klubFarver(r.favoriteTeam)} size={22}
                />
                {r.name}{r.uid === meUid && <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}> (dig)</span>}
              </span>
            </td>
            <td style={{ padding: '0.35rem 0.4rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {formatPoints(r.totalPoints)}
              {r.lqPoints > 0 && (
                <span style={{ color: 'var(--c-muted)', fontSize: '0.75rem' }} title="Heraf liga-spørgsmål"> (+{formatPoints(r.lqPoints)}❓)</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Liga-væg: seneste beskeder + skrivefelt. */
function LeagueWall({ gameId, leagueId, meUid, byUid, klubFarver }) {
  const { messages, loading } = useLeagueMessages(gameId, leagueId);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function send(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    const res = await postLeagueMessage({
      uid: meUid, gameId, leagueId, text,
    });
    if (res.ok) setText('');
    else setErr(res.error);
    setBusy(false);
  }

  return (
    <div className="wall">
      <div className="wall__title">💬 Liga-væg</div>
      <form className="wall__form" onSubmit={send}>
        <input
          type="text" value={text} maxLength={LEAGUE_MSG_MAX} placeholder="Skriv til ligaen…"
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn btn--sm" type="submit" disabled={busy || !text.trim()}>Send</button>
      </form>
      {err && <p className="badge badge--red" style={{ marginTop: '0.4rem' }}>{err}</p>}
      {loading ? (
        <p style={{ color: 'var(--c-muted)', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>Indlæser…</p>
      ) : messages.length === 0 ? (
        <p style={{ color: 'var(--c-muted)', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>Ingen beskeder endnu — vær den første.</p>
      ) : (
        <ul className="wall__list">
          {messages.map((m) => {
            // System-/bot-beskeder (fx Runde-Botten) bærer selv navn og emoji —
            // afsenderen findes ikke i spillets deltagerliste.
            const u = byUid[m.uid] || { name: m.displayName, emoji: m.avatarEmoji };
            return (
              <li key={m.id} className="wall__msg">
                <Avatar
                  uid={m.uid} name={u.name} emoji={u.emoji} favoriteTeam={u.favoriteTeam}
                  klubFarver={klubFarver(u.favoriteTeam)} size={22}
                />
                <div className="wall__body">
                  <div className="wall__meta">
                    <strong>{u.name || 'Spiller'}{m.uid === meUid ? ' (dig)' : ''}</strong>
                    <span className="wall__time">{relativeTime(m.createdAt)}</span>
                  </div>
                  <div className="wall__text">{m.text}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function LeagueCard({ league, standings, byUid, meUid, gameId, forvalgt, klubFarver }) {
  // Kommer man fra "Åbn ligaen →" i stillingen, skal DEN liga stå åben. Ellers
  // lander man på en liste, hvor alt er foldet sammen — og linket lovede mere,
  // end klikket gav.
  const [open, setOpen] = useState(!!forvalgt);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(league.name);
  const [err, setErr] = useState('');
  const isOwner = league.ownerUid === meUid;

  // Liga-spørgsmål (kun når kortet er åbent — null skipper lytterne).
  const { questions, answersByQid } = useLeagueQuestions(gameId, open ? league.id : null);
  const lqByUid = useMemo(() => leagueQuestionPointsByUid(questions, answersByQid), [questions, answersByQid]);
  // Intern stilling = ligaens point + liga-spørgsmåls-point (kun i ligaen).
  //
  // BASEN ER LIGAENS EGEN. Har ligaen en startrunde, regnes hver spillers
  // total forfra af runde-vektoren (ligaRanking → ligaPoint) — runder før
  // starten tæller ikke, og puljen følger sin egen regel. Uden startrunde er
  // basen spillets tal, som altid.
  const rows = useMemo(
    () => leagueRankingWithQuestions(
      ligaRanking(standings, league, ligaPoint, harRundeVektor),
      league.memberUids,
      lqByUid,
    ),
    [standings, league, lqByUid],
  );

  const [vaelgerRunde, setVaelgerRunde] = useState(false);
  const [rundeDraft, setRundeDraft] = useState(
    Number.isFinite(league.startRound) ? String(league.startRound) : '',
  );

  async function gemStartRunde() {
    setBusy(true); setErr('');
    const res = await setLeagueStartRound({
      gameId, leagueId: league.id, startRound: rundeDraft === '' ? null : Number(rundeDraft),
    });
    if (res.ok) setVaelgerRunde(false);
    else setErr(res.error);
    setBusy(false);
  }

  async function handleLeave() {
    if (!window.confirm(`Forlad "${league.name}"?`)) return;
    setBusy(true);
    const res = await leaveLeague({ uid: meUid, gameId, leagueId: league.id });
    if (!res.ok) setErr(res.error);
    setBusy(false);
  }
  async function handleDelete() {
    if (!window.confirm(`Slet ligaen "${league.name}" for alle? Dette kan ikke fortrydes.`)) return;
    setBusy(true);
    const res = await deleteLeague({ gameId, leagueId: league.id });
    if (!res.ok) { setErr(res.error); setBusy(false); }
  }
  async function saveName() {
    setBusy(true); setErr('');
    const res = await renameLeague({ gameId, leagueId: league.id, name: nameDraft });
    if (res.ok) setEditing(false);
    else setErr(res.error);
    setBusy(false);
  }

  return (
    <div className="card mb-2">
      <div className="flex items-center justify-between" style={{ gap: '0.5rem' }}>
        {editing ? (
          <span style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="text" value={nameDraft} maxLength={40} onChange={(e) => setNameDraft(e.target.value)} />
            <button className="btn btn--sm" disabled={busy || nameDraft.trim().length < 2} onClick={saveName}>Gem</button>
            <button className="btn btn--ghost btn--sm" onClick={() => { setEditing(false); setNameDraft(league.name); }}>Fortryd</button>
          </span>
        ) : (
          <span style={{ fontWeight: 600 }}>
            {league.name}
            <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}> · {league.memberUids?.length ?? 0} medlemmer</span>
          </span>
        )}
        <button className="btn btn--ghost btn--sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Skjul' : 'Åbn'}
        </button>
      </div>

      {err && <p className="badge badge--red" style={{ marginTop: '0.5rem' }}>{err}</p>}

      {open && (
        <>
          <LeagueTable rows={rows} meUid={meUid} klubFarver={klubFarver} />

          <div className="flex items-center justify-between" style={{ gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--c-muted)' }}>
              Invitationskode: <strong style={{ letterSpacing: '1px', color: 'var(--c-text, inherit)' }}>{league.code}</strong>
              {isOwner && ' (del den med vennerne)'}
            </span>
            {/* STARTRUNDEN SKAL STÅ PÅ KORTET, IKKE KUN I EN DIALOG. En liga,
                der tæller fra runde 20, viser andre tal end spillet — står det
                ikke her, ligner ligaens stilling en fejl. Og puljereglen skal
                siges DÉR, hvor den rammer: medlemmer efter runde 3 kunne ikke
                have tippet puljen, så den tæller ikke med. */}
            {Number.isFinite(league.startRound) && (
              <span className="badge badge--muted" data-testid="liga-startrunde">
                Tæller fra runde {league.startRound}
                {!puljenTaeller(league.startRound) && ' · puljen tæller ikke'}
              </span>
            )}
          </div>

          {vaelgerRunde && isOwner && (
            <div className="flex items-center" style={{ gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <label htmlFor={`liga-runde-${league.id}`} style={{ fontSize: '0.85rem', color: 'var(--c-muted)' }}>
                Ligaen tæller fra runde
              </label>
              <input
                id={`liga-runde-${league.id}`} type="number" min={1} step={1}
                value={rundeDraft} placeholder="alle"
                onChange={(e) => setRundeDraft(e.target.value)}
                style={{ width: 90 }}
              />
              <button className="btn btn--sm" disabled={busy} onClick={gemStartRunde}>Gem</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setVaelgerRunde(false)}>Fortryd</button>
              {/* Konsekvensen skal stå VED valget, ikke opdages i stillingen:
                  runder før tæller ikke, og puljen har sin egen grænse. */}
              <span style={{ flexBasis: '100%', fontSize: '0.78rem', color: 'var(--c-muted)' }}>
                Runder før den valgte tæller ikke i ligaens stilling. Tomt felt = hele spillet.
                Starter ligaen efter runde {PULJE_MAKS_STARTRUNDE}, tæller puljebonussen ikke med
                — den blev tippet før sæsonen.
              </span>
            </div>
          )}

          <div className="flex items-center justify-between" style={{ gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', gap: '0.4rem' }}>
              {isOwner ? (
                <>
                  {!editing && <button className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>Omdøb</button>}
                  <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setVaelgerRunde((v) => !v)}>
                    Startrunde…
                  </button>
                  <button className="btn btn--ghost btn--sm" disabled={busy} onClick={handleDelete}>Slet liga</button>
                </>
              ) : (
                <button className="btn btn--ghost btn--sm" disabled={busy} onClick={handleLeave}>Forlad</button>
              )}
            </span>
          </div>

          <LeagueQuestions
            gameId={gameId} leagueId={league.id} meUid={meUid} isOwner={isOwner}
            questions={questions} answersByQid={answersByQid} byUid={byUid}
          />

          <LeagueWall
            gameId={gameId} leagueId={league.id} meUid={meUid} byUid={byUid}
            klubFarver={klubFarver}
          />
        </>
      )}
    </div>
  );
}

export default function GameLeagues({ gameId, game = null }) {
  // ?liga=<id> forvælger ét kort — sat af "Åbn ligaen →" i stillingen.
  const [ligaParams] = useSearchParams();
  const valgtLigaId = ligaParams.get('liga');
  const { user } = useAuth();
  const meUid = user?.uid;
  const { leagues, loading, error } = useGameLeagues(gameId);
  const { standings } = useGameStandings(gameId);
  // Yndlingsholdets farver som ring om avataren — se useKlubFarver.
  const klubFarver = useKlubFarver(game);

  const byUid = useMemo(() => {
    const m = {};
    for (const s of standings) m[s.uid] = { name: s.name, emoji: s.emoji, favoriteTeam: s.favoriteTeam };
    return m;
  }, [standings]);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleCreate(e) {
    e.preventDefault();
    setMsg(''); setErr(''); setBusy(true);
    const res = await createLeague({ uid: meUid, gameId, name });
    if (res.ok) { setMsg(`Ligaen "${name.trim()}" er oprettet! Del koden ${res.code} med dine venner.`); setName(''); }
    else setErr(res.error);
    setBusy(false);
  }

  async function handleJoin(e) {
    e.preventDefault();
    setMsg(''); setErr(''); setBusy(true);
    const res = await joinLeagueByCode({ gameId, code });
    if (res.ok) { setMsg(res.already ? `Du er allerede med i "${res.name}".` : `Du er nu med i "${res.name}"!`); setCode(''); }
    else setErr(res.error);
    setBusy(false);
  }

  return (
    <div>
      {msg && <p className="badge mb-2" style={{ display: 'block' }}>{msg}</p>}
      {err && <p className="badge badge--red mb-2">{err}</p>}

      {loading ? (
        <div className="spinner" role="status" aria-label="Indlæser" />
      ) : error ? (
        <p className="badge badge--red">{error}</p>
      ) : leagues.length === 0 ? (
        <div className="empty-state" style={{ paddingBottom: '0.5rem' }}>
          <div className="empty-state__icon">👥</div>
          <div className="empty-state__title">Du er ikke med i nogen ligaer endnu.</div>
          <p style={{ color: 'var(--c-muted)' }}>Opret en liga og inviter dine venner, eller deltag med en kode.</p>
        </div>
      ) : (
        leagues.map((l) => (
          <LeagueCard
            key={l.id}
            league={l}
            standings={standings}
            byUid={byUid}
            meUid={meUid}
            gameId={gameId}
            forvalgt={l.id === valgtLigaId}
            klubFarver={klubFarver}
          />
        ))
      )}

      <div className="grid-2" style={{ gap: '0.75rem', marginTop: '0.5rem' }}>
        <form className="card" onSubmit={handleCreate}>
          <h3 className="card__title">Opret liga</h3>
          <input
            type="text" value={name} maxLength={40} placeholder="Ligaens navn"
            onChange={(e) => setName(e.target.value)}
            style={{ width: '100%', marginBottom: '0.5rem' }}
          />
          <button className="btn btn--sm" disabled={busy || name.trim().length < 2} type="submit">Opret</button>
        </form>

        <form className="card" onSubmit={handleJoin}>
          <h3 className="card__title">Deltag med kode</h3>
          <input
            type="text" value={code} maxLength={8} placeholder="F.eks. X4KR2M"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            style={{ width: '100%', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '1px' }}
          />
          <button className="btn btn--sm" disabled={busy || code.trim().length < 4} type="submit">Deltag</button>
        </form>
      </div>
    </div>
  );
}
