/**
 * FootballTip — tip-flade for et fodbold-spil (fx Superligaen).
 * Tipper 1X2 pr. kamp i den aktive runde og kan (valgfrit) bruge "Chancen ⚡"
 * på ÉN kamp: sæt point på spil på dit 1X2-valg til elo-lite fair odds.
 */
import { useMemo, useState } from 'react';
import { useGameBets } from '../useGameBets';
import { setBet } from '../betActions';
import { playerBank } from '../GameLayout';
import {
  groupByRound, activeRound, isLocked,
} from './footballRounds';
import {
  OUTCOME, OUTCOMES, OUTCOME_POINTS,
  chanceMaxStake, canUseChance, CHANCE, settleChance,
} from '../../../lib/superligaScoring';

const OUTCOME_LABEL = { [OUTCOME.HOME]: '1', [OUTCOME.DRAW]: 'X', [OUTCOME.AWAY]: '2' };

/** Odds for et udfald på en kamp (frosset på kamp-dokumentet). */
function matchOdds(match, outcome) {
  const o = match?.odds?.[outcome];
  return Number.isFinite(o) ? o : null;
}

export default function FootballTip({ game, me, matches }) {
  const gameId = game?.id;
  const { betsByMatch } = useGameBets(gameId);
  const bank = playerBank(me);
  const nowMs = Date.now();

  const rounds = useMemo(() => groupByRound(matches), [matches]);
  const initialRound = useMemo(() => activeRound(rounds, nowMs), [rounds, nowMs]);
  const [roundNo, setRoundNo] = useState(initialRound);
  const [busy, setBusy] = useState(null); // matchId der gemmes
  const [error, setError] = useState('');

  const { current, roundMatches, idx } = useMemo(() => {
    const cur = rounds.find((r) => r.round === roundNo)
      ?? rounds.find((r) => r.round === initialRound)
      ?? rounds[0];
    return {
      current: cur,
      roundMatches: cur?.matches ?? [],
      idx: rounds.findIndex((r) => r.round === cur?.round),
    };
  }, [rounds, roundNo, initialRound]);

  // Hvilken kamp i runden har Chancen aktiv (chanceStake > 0)?
  const chanceMatchId = useMemo(() => {
    for (const m of roundMatches) {
      const b = betsByMatch[m.id];
      if (b && Number(b.chanceStake) > 0) return m.id;
    }
    return null;
  }, [roundMatches, betsByMatch]);

  if (!rounds.length) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">📅</div>
        <div className="empty-state__title">Kampprogrammet er ikke lagt ind endnu.</div>
        <p style={{ color: 'var(--c-muted)' }}>
          Så snart runderne er klar, kan du tippe her.
        </p>
      </div>
    );
  }

  async function pick(match, outcome) {
    if (isLocked(match, nowMs)) return;
    setError('');
    setBusy(match.id);
    const existing = betsByMatch[match.id];
    const res = await setBet({
      uid: me?.uid, gameId, matchId: match.id, pick: outcome,
      chanceStake: Number(existing?.chanceStake) || 0, bank,
    });
    if (!res.ok) setError(res.error);
    setBusy(null);
  }

  return (
    <div>
      {/* Runde-vælger */}
      <div className="flex items-center justify-between mb-2" style={{ gap: '0.5rem' }}>
        <button
          className="btn btn--ghost btn--sm"
          disabled={idx <= 0}
          onClick={() => setRoundNo(rounds[idx - 1].round)}
        >← Forrige</button>
        <strong>{current?.round ? `Runde ${current.round}` : 'Kampe'}</strong>
        <button
          className="btn btn--ghost btn--sm"
          disabled={idx >= rounds.length - 1}
          onClick={() => setRoundNo(rounds[idx + 1].round)}
        >Næste →</button>
      </div>

      {error && <p className="badge badge--red mb-2">{error}</p>}

      {/* Kampe */}
      {roundMatches.map((m) => {
        const bet = betsByMatch[m.id];
        const locked = isLocked(m, nowMs);
        const isChance = m.id === chanceMatchId;
        return (
          <div className="card mb-2" key={m.id}>
            <div className="flex items-center justify-between" style={{ gap: '0.5rem' }}>
              <span style={{ fontWeight: 600 }}>
                {m.home} <span style={{ color: 'var(--c-muted)' }}>–</span> {m.away}
                {isChance && <span title="Chancen aktiv" style={{ marginLeft: 6 }}>⚡</span>}
              </span>
              {locked && <span className="badge badge--muted">Låst</span>}
            </div>
            <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem', marginTop: '0.5rem' }}>
              {OUTCOMES.map((o) => {
                const selected = bet?.pick === o;
                const odds = matchOdds(m, o);
                return (
                  <button
                    key={o}
                    className={selected ? 'btn btn--sm' : 'btn btn--ghost btn--sm'}
                    disabled={locked || busy === m.id}
                    onClick={() => pick(m, o)}
                    style={{ flexDirection: 'column', lineHeight: 1.2 }}
                    title={`${OUTCOME_POINTS[o]} point hvis rigtigt`}
                  >
                    <span style={{ fontWeight: 700 }}>{OUTCOME_LABEL[o]}</span>
                    <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>
                      {odds ? `odds ${odds.toFixed(2)}` : `${OUTCOME_POINTS[o]}p`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Chancen */}
      <ChancePanel
        gameId={gameId}
        me={me}
        bank={bank}
        roundMatches={roundMatches}
        betsByMatch={betsByMatch}
        chanceMatchId={chanceMatchId}
        nowMs={nowMs}
      />
    </div>
  );
}

/** Chancen ⚡: sæt point på spil på ét 1X2-valg i runden. */
function ChancePanel({ gameId, me, bank, roundMatches, betsByMatch, chanceMatchId, nowMs }) {
  const maxStake = chanceMaxStake(bank);
  const usable = canUseChance(bank);

  // Kampe man kan chance på: dem man har tippet, og som ikke er låst.
  const options = roundMatches.filter((m) => betsByMatch[m.id]?.pick && !isLocked(m, nowMs));

  const activeBet = chanceMatchId ? betsByMatch[chanceMatchId] : null;
  const [selMatchId, setSelMatchId] = useState(chanceMatchId || options[0]?.id || '');
  const [stake, setStake] = useState(activeBet ? Number(activeBet.chanceStake) : CHANCE.MIN);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selMatch = roundMatches.find((m) => m.id === selMatchId);
  const selBet = selMatch ? betsByMatch[selMatch.id] : null;
  const pick = selBet?.pick;
  const odds = pick && Number.isFinite(selMatch?.odds?.[pick]) ? selMatch.odds[pick] : null;
  const clampedStake = Math.max(CHANCE.MIN, Math.min(maxStake, Number(stake) || 0));
  const win = odds ? settleChance({ correct: true, stake: clampedStake, fairOdds: odds }).delta : null;

  if (!usable) {
    return (
      <div className="card">
        <h3 className="card__title">Chancen ⚡</h3>
        <p style={{ color: 'var(--c-muted)', marginBottom: 0 }}>
          Du kan bruge Chancen, når du har mindst {Math.ceil(CHANCE.MIN / CHANCE.CAP_FRACTION)} point.
          Sæt point på spil på ét tip og doblér din gevinst — eller mist indsatsen.
        </p>
      </div>
    );
  }

  async function save(newStake) {
    if (!selMatch || !pick) { setError('Vælg først 1, X eller 2 på kampen.'); return; }
    setError('');
    setBusy(true);
    // Én chance pr. runde: nulstil en evt. tidligere chance i runden.
    if (chanceMatchId && chanceMatchId !== selMatch.id) {
      const prev = betsByMatch[chanceMatchId];
      await setBet({
        uid: me?.uid, gameId, matchId: chanceMatchId, pick: prev.pick, chanceStake: 0, bank,
      });
    }
    const res = await setBet({
      uid: me?.uid, gameId, matchId: selMatch.id, pick, chanceStake: newStake, bank,
    });
    if (!res.ok) setError(res.error);
    setBusy(false);
  }

  return (
    <div className="card">
      <h3 className="card__title">Chancen ⚡</h3>
      <p style={{ color: 'var(--c-muted)', marginTop: 0 }}>
        Sæt point på spil på ét af dine tips i runden. Rammer du, ganges indsatsen
        med kampens odds. Rammer du ikke, mister du kun indsatsen (du kan aldrig gå i minus).
      </p>

      {options.length === 0 ? (
        <p className="badge badge--muted">Tip mindst én kamp i runden først.</p>
      ) : (
        <>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            Kamp:
            <select
              value={selMatchId}
              onChange={(e) => { setSelMatchId(e.target.value); }}
              style={{ marginLeft: '0.5rem' }}
            >
              {options.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.home}–{m.away} (dit valg: {OUTCOME_LABEL[betsByMatch[m.id].pick]})
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center" style={{ gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span>Indsats:</span>
            <button className="btn btn--ghost btn--sm" disabled={clampedStake <= CHANCE.MIN}
              onClick={() => setStake(Math.max(CHANCE.MIN, clampedStake - 1))}>−</button>
            <strong style={{ minWidth: 28, textAlign: 'center' }}>{clampedStake}</strong>
            <button className="btn btn--ghost btn--sm" disabled={clampedStake >= maxStake}
              onClick={() => setStake(Math.min(maxStake, clampedStake + 1))}>+</button>
            <span style={{ color: 'var(--c-muted)', fontSize: '0.85rem' }}>af maks {maxStake}</span>
          </div>

          <p style={{ margin: '0.25rem 0' }}>
            {odds ? (
              <>Rammer du: <strong style={{ color: 'var(--c-pitch)' }}>+{win}</strong>
                {'  '}· Rammer du ikke: <strong style={{ color: 'var(--c-red, #c0392b)' }}>−{clampedStake}</strong>
                {'  '}<span style={{ color: 'var(--c-muted)' }}>(odds {odds.toFixed(2)})</span></>
            ) : (
              <span style={{ color: 'var(--c-muted)' }}>Odds er ikke lagt ind på kampen endnu.</span>
            )}
          </p>

          {error && <p className="badge badge--red">{error}</p>}

          <div className="flex items-center" style={{ gap: '0.5rem', marginTop: '0.5rem' }}>
            <button className="btn btn--sm" disabled={busy || !pick} onClick={() => save(clampedStake)}>
              {chanceMatchId === selMatchId ? 'Opdatér Chancen' : 'Aktivér Chancen'}
            </button>
            {chanceMatchId && (
              <button className="btn btn--ghost btn--sm" disabled={busy}
                onClick={() => save(0)}>Fjern</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
