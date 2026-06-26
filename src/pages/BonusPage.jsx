// ---------------------------------------------------------------------------
// BonusPage – bonus-spørgsmål (topscorer, gruppevinder).
// Brugeren kan svare inden deadline; derefter vises facit + point.
// ---------------------------------------------------------------------------
import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBonusQuestions, useMyBonusBets } from '../features/bonus/useBonusData';
import BonusQuestion from '../features/bonus/BonusQuestion';
import { isBonusLocked, sortBonusQuestions } from '../features/bonus/bonusHelpers';
import { useStandings } from '../features/leaderboard/useStandings';
import { useLeagues } from '../features/leagues/useLeagues';
import { collectVisibleUids } from '../features/leaderboard/standingsUtils';
import { POINTS } from '../lib/scoring';

export default function BonusPage() {
  const { user, isGlobalAdmin } = useAuth();
  const { questions: rawQuestions, loading, error } = useBonusQuestions();
  const questions = sortBonusQuestions(rawQuestions);
  const { bonusBets, loading: betsLoading } = useMyBonusBets(user?.uid ?? null);

  // Til at vise hvem der har svaret (navne/avatarer) + liga-afgrænsning.
  const { standings } = useStandings();
  const { leagues } = useLeagues(user?.uid);
  const usersByUid = useMemo(
    () => Object.fromEntries((standings || []).map((u) => [u.uid, u])),
    [standings],
  );
  const visibleUids = useMemo(
    () => new Set(collectVisibleUids(leagues, user?.uid)),
    [leagues, user?.uid],
  );

  const uid = user?.uid ?? '';
  const isLoading = loading || betsLoading;

  // Opsummer optjente bonus-point
  const totalBonusPoints = [...bonusBets.values()].reduce(
    (sum, b) => sum + (b.points ?? 0),
    0,
  );

  // Antal åbne spørgsmål
  const openCount = questions.filter((q) => !isBonusLocked(q.deadline)).length;
  // Antal besvarede (åbne) spørgsmål
  const answeredOpenCount = questions.filter(
    (q) => !isBonusLocked(q.deadline) && bonusBets.has(q.id),
  ).length;

  if (isLoading) {
    return (
      <div className="container">
        <div className="spinner" aria-label="Henter bonusspørgsmål…" />
      </div>
    );
  }

  return (
    <div className="container">
      {/* Overskrift */}
      <div style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.4rem' }}>🎁 Bonus</h1>
        <p style={{ margin: 0, color: 'var(--c-muted)', fontSize: '0.88rem' }}>
          Korrekt bonus-svar giver {POINTS.BONUS} point pr. spørgsmål.
        </p>
      </div>

      {/* Statistik-banner */}
      <div
        className="card"
        style={{
          marginBottom: '1.25rem',
          display: 'flex',
          gap: '1.5rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--c-pitch)' }}
            data-testid="total-bonus-points"
          >
            {totalBonusPoints}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', fontWeight: 600 }}>
            Bonus-point
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--c-text)' }}>
            {answeredOpenCount}/{openCount}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', fontWeight: 600 }}>
            Besvaret (åbne)
          </div>
        </div>
      </div>

      {/* Fejl */}
      {error && (
        <div className="card" style={{ borderColor: 'var(--c-err)', marginBottom: '1rem' }}>
          <p style={{ color: 'var(--c-err)', margin: 0 }}>
            Kunne ikke hente bonusspørgsmål. Prøv at genindlæse siden.
          </p>
        </div>
      )}

      {/* Tom tilstand */}
      {!error && questions.length === 0 && (
        <div className="empty-state">
          <div className="empty-state__icon">🎁</div>
          <div className="empty-state__title">Ingen bonusspørgsmål endnu</div>
          <p>Tjek igen når turneringen nærmer sig.</p>
        </div>
      )}

      {/* Spørgsmål – åbne først */}
      {questions.length > 0 && (
        <>
          {/* Åbne spørgsmål */}
          {questions.filter((q) => !isBonusLocked(q.deadline)).length > 0 && (
            <section style={{ marginBottom: '1.5rem' }}>
              <h2
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: 'var(--c-pitch)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  margin: '0 0 0.75rem',
                }}
              >
                Åbne spørgsmål
              </h2>
              {questions
                .filter((q) => !isBonusLocked(q.deadline))
                .map((q) => (
                  <BonusQuestion
                    key={q.id}
                    question={q}
                    uid={uid}
                    existingBet={bonusBets.get(q.id) ?? null}
                    isAdmin={isGlobalAdmin}
                    usersByUid={usersByUid}
                    visibleUids={visibleUids}
                  />
                ))}
            </section>
          )}

          {/* Låste/afgjorte spørgsmål */}
          {questions.filter((q) => isBonusLocked(q.deadline)).length > 0 && (
            <section>
              <h2
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: 'var(--c-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  margin: '0 0 0.75rem',
                }}
              >
                Låste spørgsmål
              </h2>
              {questions
                .filter((q) => isBonusLocked(q.deadline))
                .map((q) => (
                  <BonusQuestion
                    key={q.id}
                    question={q}
                    uid={uid}
                    existingBet={bonusBets.get(q.id) ?? null}
                    isAdmin={isGlobalAdmin}
                    usersByUid={usersByUid}
                    visibleUids={visibleUids}
                  />
                ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
