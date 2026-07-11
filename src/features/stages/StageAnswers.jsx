// ---------------------------------------------------------------------------
// StageAnswers – facit + alle spilleres tips + "etapens top" for én afgjort
// etape. Afgrænset til spillere man deler liga med (admin ser alle). Bruges
// udfoldeligt på etape-kortet og i fuld form på etape-siden.
// ---------------------------------------------------------------------------
import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useStageBets } from './useStageBets';
import { stageAnswerRows, stageTop } from './stageAnswerRows';
import { useStandings } from '../leaderboard/useStandings';
import { useLeagues } from '../leagues/useLeagues';
import { collectVisibleUids } from '../leaderboard/standingsUtils';
import { activeQuestionsForStage } from '../../lib/tourScoring';
import Avatar from '../../components/Avatar';
import TeamBadge from '../../components/TeamBadge';

const MEDAL = ['🥇', '🥈', '🥉'];

const QUESTIONS = [
  { key: 'winnerTeam', icon: '🏆', label: () => 'Etapevinder' },
  { key: 'gcTeam', icon: '⏱️', label: (n) => `Bedste hold (første ${n})` },
  { key: 'mountainTeam', icon: '⛰️', label: () => 'Bjergpoint' },
  { key: 'sprintTeam', icon: '🚀', label: () => 'Sprintpoint' },
];

export default function StageAnswers({ stage, points = {}, gcTopN = 10 }) {
  const { user, isGlobalAdmin } = useAuth();
  const meUid = user?.uid ?? '';
  const { bets, loading } = useStageBets(stage?.id ?? null, true);
  const { standings } = useStandings();
  const { leagues } = useLeagues(meUid || null);

  const usersByUid = useMemo(
    () => Object.fromEntries((standings || []).map((u) => [u.uid, u])),
    [standings],
  );
  const visibleUids = useMemo(
    () => new Set(collectVisibleUids(leagues, meUid)),
    [leagues, meUid],
  );
  const nameOf = (uid) => usersByUid[uid]?.displayName || 'Spiller';

  const active = activeQuestionsForStage(stage);
  const shownQ = QUESTIONS.filter((q) => active[q.key]);
  const result = stage?.result || {};
  const podiumOf = (key) => (result.podium?.[key]) || (result[key] ? [result[key]] : []);

  const rows = useMemo(
    () => stageAnswerRows(bets, {
      stage, result, points, visibleUids, isAdmin: isGlobalAdmin, meUid, nameOf,
    }),
    // nameOf afhænger af usersByUid; result/stage er stabile pr. render
    [bets, stage, result, points, visibleUids, isGlobalAdmin, meUid, usersByUid], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Etapens top — uafgjorte placeringer skæres ikke fra (alle lige med den
  // sidste plads kommer med).
  const top = stageTop(rows, 3);

  return (
    <div data-testid="stage-answers" style={{ marginTop: '0.6rem', display: 'grid', gap: '0.8rem' }}>
      {/* Facit */}
      <section data-testid="stage-facit">
        <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.95rem' }}>🎯 Facit</h4>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.3rem' }}>
          {shownQ.map((q) => {
            const pod = podiumOf(q.key);
            return (
              <li key={q.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.86rem' }}>
                <span style={{ minWidth: 168, fontWeight: 600 }}>{q.icon} {q.label(gcTopN)}</span>
                {pod.length ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {pod.map((t, i) => (
                      <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}>
                        {MEDAL[i] || `${i + 1}.`} <TeamBadge name={t} />
                      </span>
                    ))}
                  </span>
                ) : <span style={{ color: 'var(--c-muted)' }}>Ikke afgjort endnu</span>}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Etapens top */}
      {top.length > 0 && (
        <section data-testid="stage-top">
          <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.95rem' }}>🏆 Etapens top</h4>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.25rem' }}>
            {top.map((r) => {
              // Placering = antal spillere med strengt flere point → delt plads
              // giver samme medalje (fx to på 3.-pladsen får begge 🥉).
              const rank = top.filter((x) => x.scored.points > r.scored.points).length;
              return (
              <li key={r.bet.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}>
                <span style={{ width: 22 }}>{MEDAL[rank] || `${rank + 1}.`}</span>
                <Avatar uid={r.bet.uid} name={nameOf(r.bet.uid)} emoji={usersByUid[r.bet.uid]?.avatarEmoji} favoriteTeam={usersByUid[r.bet.uid]?.favoriteTeam} size={22} />
                <span style={{ fontWeight: 700 }}>{nameOf(r.bet.uid)}</span>
                <span className="badge badge--green" style={{ marginLeft: 'auto', fontSize: '0.72rem' }}>+{r.scored.points}</span>
              </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* Alle tips */}
      <section data-testid="stage-all-answers">
        <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.95rem' }}>👀 Alle tips ({rows.length})</h4>
        {loading ? (
          <div className="spinner" role="status" aria-label="Indlæser" />
        ) : rows.length === 0 ? (
          <p style={{ fontSize: '0.83rem', color: 'var(--c-muted)', margin: 0 }}>Ingen tips på denne etape endnu.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
            {rows.map(({ bet, scored }) => {
              const mine = bet.uid === meUid;
              const u = usersByUid[bet.uid];
              return (
                <li
                  key={bet.id}
                  data-testid="stage-answer-row"
                  style={{ borderBottom: '1px solid var(--c-border)', paddingBottom: '0.4rem' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <Avatar uid={bet.uid} name={nameOf(bet.uid)} emoji={u?.avatarEmoji} favoriteTeam={u?.favoriteTeam} size={24} />
                    <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                      {nameOf(bet.uid)}
                      {mine && <span className="badge badge--blue" style={{ marginLeft: '0.3rem' }}>dig</span>}
                    </span>
                    <span
                      className={`badge ${scored.points > 0 ? 'badge--green' : 'badge--muted'}`}
                      style={{ marginLeft: 'auto', fontSize: '0.72rem' }}
                    >
                      {scored.points > 0 ? `+${scored.points}` : `${scored.points}`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem 0.9rem', flexWrap: 'wrap', marginTop: '0.25rem', paddingLeft: '2rem' }}>
                    {shownQ.map((q) => {
                      const pick = bet[q.key];
                      const earned = scored.breakdown?.[q.key] || 0;
                      const correct = earned > 0;
                      return (
                        <span key={q.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.82rem', color: correct ? 'var(--c-ok)' : 'var(--c-muted)' }}>
                          <span title={q.label(gcTopN)}>{q.icon}</span>
                          {pick ? <TeamBadge name={pick} /> : <span>—</span>}
                          {correct ? <span aria-label="rigtigt">✅</span> : null}
                        </span>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
