/**
 * BonusAnswers — udfoldelig liste over alle spilleres svar på ét bonusspørgsmål.
 * Vises efter spørgsmålet er låst (hvor reglerne tillader at se andres svar),
 * og altid for admin. Spejler MatchTips for kamp-tips.
 */
import { useState } from 'react';
import { useBonusBets } from './useBonusData';
import { BONUS_TYPE } from '../../lib/constants';
import { teamName } from '../../lib/teams';
import Avatar from '../../components/Avatar';
import Flag from '../../components/Flag';

export default function BonusAnswers({ question, meUid, usersByUid = {}, visibleUids = null, isAdmin = false }) {
  const [open, setOpen] = useState(false);
  const { bets, loading } = useBonusBets(question.id, open);
  const isGroupWinner = question.type === BONUS_TYPE.GROUP_WINNER;

  const nameOf = (uid) => usersByUid[uid]?.displayName || 'Spiller';

  // Admin ser alle. Andre ser kun spillere de deler en liga med (+ sig selv).
  const visible = isAdmin || !visibleUids
    ? bets
    : bets.filter((b) => b.uid === meUid || visibleUids.has(b.uid));

  // Sortér: flest point øverst (når afgjort), ellers efter navn.
  const sorted = [...visible].sort((a, b) => {
    if (typeof a.points === 'number' && typeof b.points === 'number') return b.points - a.points;
    return nameOf(a.uid).localeCompare(nameOf(b.uid), 'da');
  });

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <button
        className="btn btn--ghost btn--sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="reveal-bonus-answers-btn"
      >
        {open ? 'Skjul alles svar' : '👀 Se alles svar'}
        {isAdmin && !open && <span className="badge badge--blue" style={{ marginLeft: '0.4rem', fontSize: '0.65rem' }}>admin</span>}
      </button>

      {open && (
        loading ? (
          <div className="spinner" role="status" aria-label="Indlæser" />
        ) : sorted.length === 0 ? (
          <p style={{ fontSize: '0.83rem', color: 'var(--c-muted)', marginTop: '0.4rem' }}>
            Ingen svar på dette spørgsmål.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {sorted.map((b) => {
              const u = usersByUid[b.uid];
              const mine = b.uid === meUid;
              return (
                <li
                  key={b.id}
                  data-testid="bonus-answer-row"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--c-border)', paddingBottom: '0.35rem' }}
                >
                  <Avatar uid={b.uid} name={nameOf(b.uid)} emoji={u?.avatarEmoji} favoriteTeam={u?.favoriteTeam} size={24} />
                  <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>
                    {nameOf(b.uid)}{mine && <span className="badge badge--blue" style={{ marginLeft: '0.3rem' }}>dig</span>}
                  </span>
                  <span style={{ fontSize: '0.86rem' }}>
                    {isGroupWinner && b.answer && <Flag code={b.answer} size={16} style={{ marginRight: 3 }} />}
                    {isGroupWinner ? teamName(b.answer) : b.answer}
                  </span>
                  {typeof b.points === 'number' && (
                    <span className={`badge ${b.points > 0 ? 'badge--green' : 'badge--muted'}`} style={{ fontSize: '0.7rem', marginLeft: 'auto' }}>
                      {b.points > 0 ? `+${b.points}` : '0'}
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
