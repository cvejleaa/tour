/**
 * Reactions — viser emoji-reaktioner med antal og lader brugeren slå sine egne til/fra.
 */
import { useState, useRef, useEffect } from 'react';
import { QUICK_REACTIONS, toggleReaction } from './reactionActions';

export default function Reactions({ collectionName, docId, reactions = {}, meUid }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Aktive reaktioner (dem med mindst én bruger)
  const active = Object.entries(reactions || {})
    .map(([emoji, uids]) => [emoji, (uids || []).filter(Boolean)])
    .filter(([, uids]) => uids.length > 0);

  async function react(emoji) {
    if (busy) return;
    setBusy(true);
    try {
      const hasReacted = (reactions?.[emoji] || []).includes(meUid);
      await toggleReaction(collectionName, docId, emoji, meUid, hasReacted);
    } catch (e) {
      alert('Kunne ikke reagere: ' + e.message);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <span style={{ display: 'inline-flex', gap: '0.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
      {active.map(([emoji, uids]) => {
        const mine = uids.includes(meUid);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => react(emoji)}
            data-testid="reaction-chip"
            title={mine ? 'Fjern din reaktion' : 'Reagér'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.15rem',
              fontSize: '0.78rem', cursor: 'pointer', padding: '0.05rem 0.4rem',
              borderRadius: 99,
              border: `1px solid ${mine ? 'var(--c-pitch, #16a34a)' : 'var(--c-border)'}`,
              background: mine ? 'rgba(22,163,74,0.12)' : 'transparent',
            }}
          >
            <span>{emoji}</span><span>{uids.length}</span>
          </button>
        );
      })}

      <span ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Tilføj reaktion"
          aria-expanded={open}
          title="Tilføj reaktion"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--c-muted)', padding: '0 0.2rem' }}
        >
          ＋😊
        </button>
        {open && (
          <span
            role="menu"
            data-testid="reaction-menu"
            style={{
              position: 'absolute', bottom: 'calc(100% + 4px)', left: 0, zIndex: 30,
              background: 'var(--c-surface, #fff)', border: '1px solid var(--c-border)',
              borderRadius: 10, padding: '0.25rem', boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
              display: 'flex', gap: '0.1rem',
            }}
          >
            {QUICK_REACTIONS.map((e) => (
              <button
                key={e}
                type="button"
                role="menuitem"
                onClick={() => react(e)}
                aria-label={`Reagér ${e}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0.15rem', borderRadius: 6 }}
              >
                {e}
              </button>
            ))}
          </span>
        )}
      </span>
    </span>
  );
}
