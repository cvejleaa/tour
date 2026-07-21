/**
 * FootballTip — tip-flade for et fodbold-spil (fx Superligaen).
 * Tipper 1X2 pr. kamp i den aktive runde og kan (valgfrit) bruge "Chancen ⚡"
 * på ÉN kamp: sæt point på spil på dit 1X2-valg til elo-lite fair odds.
 */
import { useMemo, useState } from 'react';
import { useGameBets } from '../useGameBets';
import { setBet } from '../betActions';
import { playerBank } from '../GameLayout';
import ClubBadge from '../../../components/ClubBadge';
import { superligaTeamInfo } from '../../../data/superligaTeams2026';
import { colorsClash } from '../../../lib/contrastText';
import { formatKickoff, relativeDeadline, formatDateRange } from '../../../lib/daDate';
import {
  groupByRound, activeRound, isLocked, toMillis,
} from './footballRounds';
import {
  OUTCOME, OUTCOMES, round1, outcomeReward,
  chanceMaxStake, canUseChance, CHANCE, settleChance,
} from '../../../lib/superligaScoring';

const OUTCOME_LABEL = { [OUTCOME.HOME]: '1', [OUTCOME.DRAW]: 'X', [OUTCOME.AWAY]: '2' };

/** Odds for et udfald på en kamp (frosset på kamp-dokumentet). */
function matchOdds(match, outcome) {
  const o = match?.odds?.[outcome];
  return Number.isFinite(o) ? o : null;
}

const GREY = '#5b6b7a';

/**
 * Badge-info for et hold: klub-kortkode + farve + stadion.
 * variant 'home' | 'away' | 'third'. Admin-override (games/{id}.teamStyles)
 * vinder over standardfarven; hver variant falder pænt tilbage.
 */
function badgeFor(name, styles = {}, variant = 'home') {
  const info = superligaTeamInfo(name);
  const ov = styles?.[name] || {};
  let override;
  let fallback;
  if (variant === 'away') {
    override = ov.awayColor;
    fallback = info?.awayColor || info?.color || GREY;
  } else if (variant === 'third') {
    override = ov.thirdColor;
    fallback = info?.thirdColor || info?.awayColor || info?.color || GREY;
  } else {
    override = ov.color;
    fallback = info?.color || GREY;
  }
  const code = info?.short
    || String(name || '').replace(/[^A-Za-zÆØÅæøå]/g, '').slice(0, 3).toUpperCase() || '?';
  return { code, color: override || fallback, venue: info?.venue ?? null };
}

/**
 * Farver til et kamp-kort: hjemmeholdet i hjemmefarve, udeholdet i udefarve —
 * men skift til udeholdets tertiærfarve hvis udefarven clasher med hjemmefarven.
 */
function matchBadges(home, away, styles) {
  const h = badgeFor(home, styles, 'home');
  let a = badgeFor(away, styles, 'away');
  if (colorsClash(a.color, h.color)) {
    const third = badgeFor(away, styles, 'third');
    // Brug kun tertiær hvis den faktisk er mindre clash end udefarven.
    if (!colorsClash(third.color, h.color)) a = third;
  }
  return { h, a };
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

  // Runde-header-data: datospænd, næste deadline, hvor mange kampe tippet.
  const kickoffs = roundMatches.map((m) => toMillis(m.kickoff)).filter((x) => x != null);
  const rangeFrom = kickoffs.length ? Math.min(...kickoffs) : null;
  const rangeTo = kickoffs.length ? Math.max(...kickoffs) : null;
  const upcoming = roundMatches.filter((m) => !isLocked(m, nowMs))
    .map((m) => toMillis(m.kickoff)).filter((x) => x != null);
  const nextDeadline = upcoming.length ? Math.min(...upcoming) : null;
  const deadlineSoon = nextDeadline != null && nextDeadline - nowMs < 2 * 3600 * 1000;
  const tipped = roundMatches.filter((m) => betsByMatch[m.id]?.pick).length;
  const total = roundMatches.length;

  return (
    <div>
      {/* Runde-header */}
      <div className="flex items-center justify-between mb-2" style={{ gap: '0.5rem' }}>
        <button className="btn btn--ghost btn--sm" disabled={idx <= 0}
          onClick={() => setRoundNo(rounds[idx - 1].round)} aria-label="Forrige runde">←</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div className="round-head__title">
            {current?.round ? `Runde ${current.round}` : 'Kampe'}
            {rangeFrom && <span className="round-head__meta" style={{ marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}>{formatDateRange(rangeFrom, rangeTo)}</span>}
          </div>
          {nextDeadline != null && (
            <div className={`round-head__meta ${deadlineSoon ? 'round-head__deadline--soon' : ''}`}>
              Deadline {relativeDeadline(nextDeadline, new Date(nowMs))}
            </div>
          )}
        </div>
        <button className="btn btn--ghost btn--sm" disabled={idx >= rounds.length - 1}
          onClick={() => setRoundNo(rounds[idx + 1].round)} aria-label="Næste runde">→</button>
      </div>

      <div className="flex items-center justify-between mb-2" style={{ gap: '0.5rem' }}>
        <span className={`badge ${tipped >= total && total > 0 ? 'badge--green' : 'badge--yellow'}`}>
          {tipped}/{total} tippet
        </span>
        <span style={{ color: 'var(--c-muted)', fontSize: '0.78rem' }}>
          Point følger oddsene — jo større overraskelse, jo flere point.
        </span>
      </div>

      {error && <p className="badge badge--red mb-2">{error}</p>}

      {/* Kampe */}
      {roundMatches.map((m) => {
        const bet = betsByMatch[m.id];
        const locked = isLocked(m, nowMs);
        const isChance = m.id === chanceMatchId;
        const { h, a } = matchBadges(m.home, m.away, game?.teamStyles);
        const hit = m.result && bet?.pick ? bet.pick === m.result : null;
        return (
          <div className={`card match-card mb-2 ${isChance ? 'match-card--chance' : ''}`} key={m.id}>
            <div className="match-card__meta">
              <span className="match-card__kickoff">{formatKickoff(m.kickoff)}</span>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.5rem', minWidth: 0 }}>
                {h.venue && <span className="match-card__venue">{h.venue}</span>}
                {m.result ? (
                  hit === true ? <span className="badge badge--green">Ramt +{outcomeReward(m.result, m.odds).toFixed(1)}</span>
                    : hit === false ? <span className="badge badge--red">Ikke ramt</span>
                      : <span className="badge">Spillet</span>
                ) : isChance ? (
                  <span className="chance-pill">⚡ Chancen</span>
                ) : locked ? (
                  <span className="badge badge--muted">Låst</span>
                ) : null}
              </span>
            </div>

            <div className="match-card__lineup">
              <div className="match-card__side">
                <ClubBadge code={h.code} color={h.color} size={34} title={m.home} />
                <span className="match-card__side-name">{m.home}</span>
              </div>
              <div className="match-card__dash" aria-hidden="true">–</div>
              <div className="match-card__side">
                <ClubBadge code={a.code} color={a.color} size={34} title={m.away} />
                <span className="match-card__side-name">{m.away}</span>
              </div>
            </div>

            <div className="pick-grid">
              {OUTCOMES.map((o) => {
                const selected = bet?.pick === o;
                const odds = matchOdds(m, o);
                const pts = odds ? round1(odds) : null;
                return (
                  <button
                    key={o}
                    className={`pick ${selected ? 'pick--selected' : ''}`}
                    disabled={locked || busy === m.id}
                    onClick={() => pick(m, o)}
                    title={pts != null ? `${pts.toFixed(1)} point hvis rigtigt (= odds)` : 'Odds mangler endnu'}
                  >
                    <span className="pick__label">{OUTCOME_LABEL[o]}</span>
                    <span className="pick__odds">{pts != null ? pts.toFixed(1) : '—'}</span>
                    <span className="pick__pts">point</span>
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
