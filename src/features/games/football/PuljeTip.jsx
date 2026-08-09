/**
 * PuljeTip — bonus-tip: forudsig hvilke 6 hold der kommer i mesterskabsspillet
 * (de øvrige 6 = nedrykningsspillet). Afgøres på grundspillets slutstilling.
 * Deadline = før runde 1 (håndhæves også af security rules).
 */
import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase';
import { useAuth } from '../../../context/AuthContext';
import { COL } from '../../../lib/constants';
import { teamsOf } from './teamInfo';
import { PULJE } from '../../../lib/superligaScoring';
import { setPuljeBet } from '../gameActions';
import { toMillis } from './footballRounds';
import ClubBadge from '../../../components/ClubBadge';
import { fmtPoints } from '../../../lib/daNum';
import { formatKickoff, relativeDeadline } from '../../../lib/daDate';

export default function PuljeTip({ game, matches }) {
  const gameId = game?.id;
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [bet, setBet] = useState(undefined); // undefined = indlæser, null = intet tip
  const [picks, setPicks] = useState([]);    // holdnavne valgt (op til 6)
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!gameId || !uid) { setBet(null); return undefined; }
    const ref = doc(db, COL.GAMES, gameId, COL.GAME_PULJE, uid);
    return onSnapshot(ref, (snap) => {
      const data = snap.exists() ? snap.data() : null;
      setBet(data);
      setPicks(Array.isArray(data?.championship) ? data.championship : []);
    }, () => setBet(null));
  }, [gameId, uid]);

  // Deadline styres af admin (game.puljeLockAt). Er den ikke sat endnu, er
  // bonus-tippet åbent — vi låser IKKE automatisk ved runde 1, så der er tid
  // til at få spillere med.
  const lockMs = useMemo(() => toMillis(game?.puljeLockAt), [game]);
  const locked = lockMs != null && Date.now() >= lockMs;

  // Facit fra den OFFICIELLE stilling (vi beregner den ikke selv): de 6 øverste,
  // når hele grundspillet er spillet igennem.
  const actualTop6 = useMemo(() => {
    const st = Array.isArray(game?.standings) ? game.standings : null;
    if (!st || st.length < 12) return null;
    const expectedPlayed = matches.length % 6 === 0 ? matches.length / 6 : null;
    if (expectedPlayed && !st.every((r) => Number(r.played) === expectedPlayed)) return null;
    return st.filter((r) => Number(r.rank) <= PULJE.POOL_SIZE).map((r) => r.teamName);
  }, [game, matches]);
  const seasonDone = actualTop6 != null;

  function toggle(name) {
    setMsg(''); setErr('');
    setPicks((cur) => {
      if (cur.includes(name)) return cur.filter((n) => n !== name);
      if (cur.length >= PULJE.POOL_SIZE) return cur; // maks 6
      return [...cur, name];
    });
  }

  async function save() {
    setBusy(true); setMsg(''); setErr('');
    const res = await setPuljeBet(uid, gameId, picks);
    if (res.ok) setMsg('Pulje-tippet er gemt.');
    else setErr(res.error);
    setBusy(false);
  }

  if (bet === undefined) return <div className="spinner" role="status" aria-label="Indlæser" />;

  const chosen = new Set(picks);
  // Spillets egne hold. Det var det ENESTE sted, der ikke allerede faldt
  // tilbage på game.teams — så et engelsk spil ville have vist tolv danske
  // klubber i vælgeren.
  const teams = teamsOf(game);

  return (
    <div>
      <div className="card mb-2">
        <h3 className="card__title">🏆 Pulje-tip</h3>
        <p style={{ color: 'var(--c-muted)', marginTop: 0 }}>
          Vælg de <strong>{PULJE.POOL_SIZE} hold</strong> du tror kommer i <strong>mesterskabsspillet</strong> efter
          grundspillet. De øvrige 6 havner i nedrykningsspillet. Afgøres på slutstillingen:
          <strong> +{PULJE.PER_TEAM} point</strong> pr. rigtigt hold, og <strong>+{PULJE.PERFECT_BONUS} bonus</strong> hvis
          du rammer alle 6.
        </p>
        {lockMs == null ? (
          <p className="badge badge--blue" style={{ display: 'inline-block' }}>🟢 Åbent — deadline fastsættes af admin.</p>
        ) : locked ? (
          <p className="badge badge--muted" style={{ display: 'inline-block' }}>
            🔒 Deadline passeret ({formatKickoff(lockMs)}) — pulje-tippet er låst.
          </p>
        ) : (
          <p className="badge badge--yellow" style={{ display: 'inline-block' }}>
            Deadline: {formatKickoff(lockMs)} ({relativeDeadline(lockMs)})
          </p>
        )}
      </div>

      {/* Facit når grundspillet er slut */}
      {seasonDone && bet && (
        <div className="card mb-2" style={{ borderLeft: '4px solid var(--c-pitch)' }}>
          <div className="flex items-center justify-between" style={{ gap: '0.5rem' }}>
            <strong>Dit pulje-facit</strong>
            <span className="badge badge--green">{bet.correct ?? 0}/{PULJE.POOL_SIZE} rigtige · +{fmtPoints(bet.points ?? 0)}</span>
          </div>
        </div>
      )}

      {msg && <p className="badge badge--green mb-2" style={{ display: 'block' }}>{msg}</p>}
      {err && <p className="badge badge--red mb-2">{err}</p>}

      <div className="pulje-grid">
        {teams.map((t) => {
          const isChosen = chosen.has(t.name);
          const inActual = actualTop6 ? actualTop6.includes(t.name) : null;
          const hitClass = inActual == null ? '' : (isChosen && inActual ? 'pulje-team--hit' : (isChosen && !inActual ? 'pulje-team--miss' : ''));
          return (
            <button
              key={t.name}
              className={`pulje-team ${isChosen ? 'pulje-team--chosen' : ''} ${hitClass}`}
              disabled={locked || busy || (!isChosen && picks.length >= PULJE.POOL_SIZE)}
              onClick={() => toggle(t.name)}
              aria-pressed={isChosen}
            >
              <ClubBadge
                variant="troeje" code={t.short} color={t.color} size={26}
                color2={t.troejer?.hjemme?.sekundaer} moenster={t.troejer?.hjemme?.moenster}
                aerme={t.troejer?.hjemme?.aerme} title={t.name}
              />
              <span className="pulje-team__name">{t.name}</span>
              {isChosen && <span className="pulje-team__check">✓</span>}
              {inActual === true && <span className="pulje-team__actual" title="Kom i mesterskabsspillet">🏆</span>}
            </button>
          );
        })}
      </div>

      {!locked && (
        <div className="flex items-center mt-2" style={{ gap: '0.6rem' }}>
          <button className="btn" disabled={busy || picks.length !== PULJE.POOL_SIZE} onClick={save}>
            {busy ? 'Gemmer…' : 'Gem pulje-tip'}
          </button>
          <span style={{ color: 'var(--c-muted)', fontSize: '0.85rem' }}>{picks.length}/{PULJE.POOL_SIZE} valgt</span>
        </div>
      )}
    </div>
  );
}
