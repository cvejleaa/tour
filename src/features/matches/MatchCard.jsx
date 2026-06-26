// ---------------------------------------------------------------------------
// MatchCard – viser én kamp med tip-formular, låst-tilstand og resultat.
// Håndterer både gruppespil og knockout (advance-felt).
// ---------------------------------------------------------------------------
import { useState, useEffect, useCallback } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL, MATCH_STATUS, ROUNDS } from '../../lib/constants';
import { scoreMatch, scoreKnockout, POINTS } from '../../lib/scoring';
import {
  isMatchLocked,
  formatKickoffTime,
  roundLabel,
  liveMinuteLabel,
} from './matchHelpers';
import { teamName } from '../../lib/teams';
import Flag from '../../components/Flag';
import TeamLink from '../../components/TeamLink';
import ScoreInput from './ScoreInput';
import Countdown from './Countdown';
import MatchTips from './MatchTips';
import MatchDetails from './MatchDetails';

// Maksimale mulige point pr. kamp (til info-tekst)
const MAX_MATCH_POINTS = POINTS.EXACT; // 5
const MAX_KNOCKOUT_POINTS = POINTS.EXACT + POINTS.KNOCKOUT_ADVANCE; // 7

/**
 * @param {{
 *   match: object,
 *   uid: string,
 *   bet: object|null,
 * }} props
 */
export default function MatchCard({ match, uid, bet, usersByUid = {}, visibleUids = null }) {
  const locked = isMatchLocked(match.kickoff);
  const isKnockout = match.round !== ROUNDS.GROUP;
  const isPendingTeams = match.status === MATCH_STATUS.PENDING_TEAMS;
  const isFinished = match.status === MATCH_STATUS.FINISHED;
  const isLive = match.status === MATCH_STATUS.LIVE;

  // Holdnavne (fuldt landenavn, eller placeholders for ukendte knockout-hold)
  const homeName = match.homeTeam ? teamName(match.homeTeam) : (match.homePlaceholder ?? 'Hjemmehold');
  const awayName = match.awayTeam ? teamName(match.awayTeam) : (match.awayPlaceholder ?? 'Udehold');

  // Lokalt state for advance-valg
  const [advance, setAdvance] = useState(bet?.advance ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Synkroniser advance når bet loader
  useEffect(() => {
    setAdvance(bet?.advance ?? '');
  }, [bet?.advance]);

  // Beregn brugerens optjente point hvis kampen er afgjort
  const earnedPoints = (() => {
    if (!isFinished || !bet || !match.result) return null;
    if (isKnockout) return scoreKnockout(bet, match.result);
    return scoreMatch(bet, match.result);
  })();

  // Gem tip (score + evt. advance) i Firestore
  const saveBet = useCallback(
    async ({ home, away, advanceVal }) => {
      if (!uid || locked || isPendingTeams) return;
      setSaving(true);
      setError('');
      try {
        const betId = `${uid}_${match.id}`;
        const payload = {
          uid,
          matchId: match.id,
          home,
          away,
          updatedAt: serverTimestamp(),
        };
        // Inkluder advance for knockout-kampe
        if (isKnockout) {
          payload.advance = advanceVal ?? advance ?? null;
        }
        await setDoc(doc(db, COL.BETS, betId), payload, { merge: true });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (e) {
        console.error('Kunne ikke gemme tip:', e);
        setError('Kunne ikke gemme. Prøv igen.');
      } finally {
        setSaving(false);
      }
    },
    [uid, locked, isPendingTeams, match.id, isKnockout, advance],
  );

  // Gem kun score (fra ScoreInput)
  async function handleScoreSave({ home, away }) {
    await saveBet({ home, away, advanceVal: advance || null });
  }

  // Gem advance separat (uden at kræve score-gem)
  async function handleAdvanceSave(newAdvance) {
    if (!bet) return; // kræv at score er gemt først
    await saveBet({
      home: bet.home,
      away: bet.away,
      advanceVal: newAdvance,
    });
  }

  // Beregn mulige point for info-tekst
  const maxPts = isKnockout ? MAX_KNOCKOUT_POINTS : MAX_MATCH_POINTS;

  const hasBet = !!bet;
  // Kantfarve: låst = rød; ellers grøn hvis tippet, orange hvis mangler tip
  const borderColor = locked
    ? 'var(--c-err)'
    : (hasBet ? 'var(--c-pitch)' : 'var(--c-warn)');

  return (
    <div
      className="card"
      data-testid="match-card"
      style={{
        marginBottom: '0.6rem',
        borderLeft: `4px solid ${borderColor}`,
        opacity: isPendingTeams ? 0.7 : 1,
      }}
    >
      {/* Header: runde + kickoff-tid + countdown */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem',
          flexWrap: 'wrap',
          gap: '0.25rem',
        }}
      >
        <span style={{ fontSize: '0.78rem', color: 'var(--c-muted)', fontWeight: 600 }}>
          {roundLabel(match.round)}
          {match.groupName ? ` · Gruppe ${match.groupName}` : ''}
        </span>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* Tydelig markering af om man har tippet */}
          {!isPendingTeams && hasBet && (
            <span className="badge badge--green" style={{ fontSize: '0.72rem' }} data-testid="tipped-badge">
              ✓ Tippet
            </span>
          )}
          {!isPendingTeams && !hasBet && !locked && (
            <span className="badge badge--yellow" style={{ fontSize: '0.72rem' }} data-testid="untipped-badge">
              Mangler tip
            </span>
          )}
          <span style={{ fontSize: '0.82rem', color: 'var(--c-muted)' }}>
            {formatKickoffTime(match.kickoff)}
          </span>
          {locked ? (
            <span
              className="badge badge--red"
              style={{ fontSize: '0.72rem' }}
              data-testid="locked-badge"
            >
              🔒 Låst
            </span>
          ) : (
            <Countdown kickoff={match.kickoff} />
          )}
        </div>
      </div>

      {/* Hold */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '0.65rem',
          flexWrap: 'wrap',
        }}
      >
        {/* Hjemmehold */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flex: 1, minWidth: 90 }}>
          <TeamLink code={match.homeTeam} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
            {match.homeTeam ? <Flag code={match.homeTeam} size={28} /> : <span style={{ fontSize: '1.4rem' }}>❓</span>}
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{homeName}</span>
          </TeamLink>
        </div>

        {/* Resultat (live eller afsluttet) eller "vs" */}
        <div style={{ textAlign: 'center', minWidth: 56 }}>
          {(isFinished || isLive) && match.result ? (
            <>
              <span
                style={{ fontSize: '1.1rem', fontWeight: 800, color: isLive ? 'var(--c-err)' : 'var(--c-text)' }}
                data-testid="match-result"
              >
                {match.result.home}–{match.result.away}
              </span>
              {isLive && (
                <div
                  data-testid="live-minute"
                  style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--c-err)', marginTop: 1, whiteSpace: 'nowrap' }}
                >
                  🔴 {liveMinuteLabel(match)}
                </div>
              )}
            </>
          ) : (
            <span style={{ fontSize: '0.9rem', color: 'var(--c-muted)', fontWeight: 600 }}>
              vs
            </span>
          )}
        </div>

        {/* Udehold */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            flex: 1,
            minWidth: 90,
            justifyContent: 'flex-end',
          }}
        >
          <TeamLink code={match.awayTeam} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{awayName}</span>
            {match.awayTeam ? <Flag code={match.awayTeam} size={28} /> : <span style={{ fontSize: '1.4rem' }}>❓</span>}
          </TeamLink>
        </div>
      </div>

      {/* Advance-resultat for knockout (hvem gik videre) */}
      {isKnockout && isFinished && match.result?.advance && (
        <div
          style={{
            fontSize: '0.82rem',
            color: 'var(--c-muted)',
            marginBottom: '0.4rem',
          }}
          data-testid="advance-result"
        >
          Videre: <strong>{teamName(match.result.advance)}</strong>
        </div>
      )}

      {/* Kampdetaljer fra football-data: mål, kort, opstillinger */}
      <MatchDetails match={match} homeName={homeName} awayName={awayName} />

      {/* Brugerens optjente point */}
      {earnedPoints !== null && (
        <div style={{ marginBottom: '0.5rem' }}>
          <span
            className={`badge ${earnedPoints > 0 ? 'badge--green' : 'badge--muted'}`}
            data-testid="earned-points"
          >
            {earnedPoints > 0 ? `+${earnedPoints} point` : '0 point'}
          </span>
          {bet && (
            <span
              style={{ fontSize: '0.78rem', color: 'var(--c-muted)', marginLeft: '0.5rem' }}
            >
              (Dit tip: {bet.home}–{bet.away}
              {isKnockout && bet.advance ? `, videre: ${bet.advance}` : ''})
            </span>
          )}
        </div>
      )}

      {/* Tip-formular – kun hvis ikke låst og hold er kendte */}
      {!locked && !isPendingTeams && (
        <div>
          <ScoreInput
            home={bet?.home ?? ''}
            away={bet?.away ?? ''}
            onSave={handleScoreSave}
            disabled={saving}
          />

          {/* Advance-valg for knockout */}
          {isKnockout && (
            <div style={{ marginTop: '0.5rem' }}>
              <label
                style={{
                  fontSize: '0.82rem',
                  color: 'var(--c-muted)',
                  fontWeight: 600,
                  display: 'block',
                  marginBottom: '0.25rem',
                }}
              >
                Hvem går videre?
              </label>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {[match.homeTeam ?? homeName, match.awayTeam ?? awayName].map((team) => (
                  <button
                    key={team}
                    onClick={async () => {
                      setAdvance(team);
                      if (bet) await handleAdvanceSave(team);
                    }}
                    className={`btn btn--sm ${advance === team ? '' : 'btn--ghost'}`}
                    data-testid={`advance-${team}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    {match.homeTeam || match.awayTeam ? <Flag code={team} size={18} /> : null}
                    {teamName(team)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Feedback */}
          {saved && (
            <p
              style={{ margin: '0.4rem 0 0', fontSize: '0.82rem', color: 'var(--c-ok)' }}
              data-testid="saved-msg"
            >
              ✓ Tip gemt!
            </p>
          )}
          {error && (
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem', color: 'var(--c-err)' }}>
              {error}
            </p>
          )}

          {/* Mulige point */}
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--c-muted)' }}>
            Op til {maxPts} point muligt
            {isKnockout ? ` (${POINTS.EXACT} for score + ${POINTS.KNOCKOUT_ADVANCE} for videre)` : ''}
          </p>
        </div>
      )}

      {/* Pendingteams-besked */}
      {isPendingTeams && !locked && (
        <p
          style={{ fontSize: '0.83rem', color: 'var(--c-muted)', margin: 0 }}
          data-testid="pending-teams-msg"
        >
          Hold endnu ikke kendte – tip åbner når holdene er afgjort.
        </p>
      )}

      {/* Låst uden resultat: vis brugerens tip */}
      {locked && !isFinished && bet && (
        <div style={{ fontSize: '0.83rem', color: 'var(--c-muted)' }}>
          Dit tip: <strong>{bet.home}–{bet.away}</strong>
          {isKnockout && bet.advance ? ` · Videre: ${bet.advance}` : ''}
        </div>
      )}

      {/* Låst uden tip */}
      {locked && !isFinished && !bet && (
        <div
          style={{ fontSize: '0.83rem', color: 'var(--c-muted)', fontStyle: 'italic' }}
          data-testid="no-bet-msg"
        >
          Intet tip afgivet
        </div>
      )}

      {/* Alles tips + reaktioner (kun efter kickoff, og kun for kampe med kendte hold) */}
      {locked && !isPendingTeams && (
        <MatchTips match={match} meUid={uid} usersByUid={usersByUid} visibleUids={visibleUids} />
      )}
    </div>
  );
}
