/**
 * MatchTips — udfoldelig liste over alle spilleres tips for en kamp.
 * Vises kun efter kickoff (hvor reglerne tillader at se andres tips), og
 * lader spillere reagere med emoji på hinandens tips.
 */
import { useState } from 'react';
import { useMatchBets } from './useMatchBets';
import Avatar from '../../components/Avatar';
import Reactions from '../reactions/Reactions';
import { COL, ROUNDS } from '../../lib/constants';

export default function MatchTips({ match, meUid, usersByUid = {}, visibleUids = null }) {
  const [open, setOpen] = useState(false);
  const { bets, loading } = useMatchBets(match.id, open);
  const isKnockout = match.round !== ROUNDS.GROUP;

  const nameOf = (uid) => usersByUid[uid]?.displayName || 'Spiller';

  // Vis kun tips fra spillere man deler en liga med (+ ens egne). Uden liste
  // (fald-tilbage) vises alle.
  const visible = visibleUids
    ? bets.filter((b) => b.uid === meUid || visibleUids.has(b.uid))
    : bets;

  // Sortér: flest point øverst (når afgjort), ellers efter navn
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
        data-testid="reveal-tips-btn"
      >
        {open ? 'Skjul alles tips' : '👀 Se alles tips'}
      </button>

      {open && (
        loading ? (
          <div className="spinner" role="status" aria-label="Indlæser" />
        ) : sorted.length === 0 ? (
          <p style={{ fontSize: '0.83rem', color: 'var(--c-muted)', marginTop: '0.4rem' }}>
            Ingen tips på denne kamp.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {sorted.map((b) => {
              const u = usersByUid[b.uid];
              const mine = b.uid === meUid;
              return (
                <li
                  key={b.id}
                  data-testid="match-tip-row"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--c-border)', paddingBottom: '0.35rem' }}
                >
                  <Avatar uid={b.uid} name={nameOf(b.uid)} emoji={u?.avatarEmoji} favoriteTeam={u?.favoriteTeam} size={24} />
                  <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>
                    {nameOf(b.uid)}{mine && <span className="badge badge--blue" style={{ marginLeft: '0.3rem' }}>dig</span>}
                  </span>
                  <span style={{ fontSize: '0.86rem' }}>
                    {b.home}–{b.away}
                    {isKnockout && b.advance ? ` · ▶ ${b.advance}` : ''}
                  </span>
                  {typeof b.points === 'number' && (
                    <span className={`badge ${b.points > 0 ? 'badge--green' : 'badge--muted'}`} style={{ fontSize: '0.7rem' }}>
                      +{b.points}
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto' }}>
                    <Reactions collectionName={COL.BETS} docId={b.id} reactions={b.reactions} meUid={meUid} />
                  </span>
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}
