/**
 * EmojiPicker — let, afhængighedsfri emoji-vælger.
 * Viser en knap; ved klik åbnes et lille gitter med almindelige emojis.
 * onSelect(emoji) kaldes når en emoji vælges.
 */
import { useEffect, useRef, useState } from 'react';

// Generelt sæt — til kommentarer/beskeder (indsæt emoji i tekst).
const EMOJIS = [
  // Ansigter & følelser
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣',
  '🙂', '😉', '😊', '😇', '😍', '🥰', '😘', '😋',
  '😎', '🤩', '🥳', '😏', '😒', '😔', '😟', '😤',
  '😠', '😡', '🤬', '🤯', '😱', '😨', '😭', '😢',
  '🥺', '😬', '🙄', '😴', '🤔', '🤗', '🤫', '🤭',
  '😐', '🙃', '😜', '😝', '🤪', '🤠', '🥴', '😈',
  // Gestus & hænder
  '👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '✌️',
  '🤞', '🤟', '🤙', '👊', '✊', '👋', '🫶', '👌',
  // Hjerter & symboler
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔',
  '💥', '💯', '✨', '⭐', '🌟', '🔥', '🎉', '🎊',
  // Cykling & sport
  '🚴', '🏆', '🥇', '🥈', '🥉', '🎯', '🚵', '🏔️',
  '🏁', '🟡', '🟢', '🟥', '🟨', '🚩', '📣', '🍀',
  '🐐', '👑',
  // Dyr (gode til avatar)
  '🦁', '🐯', '🐻', '🦊', '🐶', '🐱', '🐵', '🦅',
  '🐺', '🦄', '🐉', '🦈', '🐝', '🐢', '🐬', '🦓',
  // Diverse
  '🍺', '🍻', '🥤', '🍕', '🌭', '🎮', '🚀', '💩',
];

/**
 * Cykling-/Tour-tema — til profil-avataren. Ryttere, trøjer (gul/grøn/prik/
 * ungdom), bjerge, vejr, tilnavne og fransk forplejning.
 */
export const CYCLING_EMOJIS = [
  // Ryttere & cykler
  '🚴', '🚵', '🚲', '🛞', '⚙️', '🔧', '🏁', '🚩',
  // Trøjer & klassementer
  '🟡', '🟢', '⚪', '🔴', '🎽', '🏆', '🥇', '👑',
  // Bjerge, vej & ur
  '🏔️', '⛰️', '🗻', '🧭', '⏱️', '📣', '🗼', '🇫🇷',
  // Vejr & fart
  '☀️', '🌧️', '💨', '⚡', '🔥', '🌪️', '🥵', '🥶',
  // Power & tilnavne
  '💪', '🦵', '🐐', '🦁', '🦅', '🦊', '🐺', '🐉',
  // Forplejning
  '🍌', '🥤', '🧃', '🍷', '🥐', '🥖', '🧀', '☕',
];

export default function EmojiPicker({ onSelect, emojis = EMOJIS, triggerLabel = '😀', label = 'Indsæt emoji' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Luk når man klikker udenfor
  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        aria-label={label}
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        {triggerLabel}
      </button>
      {open && (
        <div
          role="menu"
          data-testid="emoji-grid"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: 0,
            zIndex: 30,
            background: 'var(--c-surface, #fff)',
            border: '1px solid var(--c-border)',
            borderRadius: 10,
            padding: '0.4rem',
            boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
            display: 'grid',
            gridTemplateColumns: 'repeat(8, 1fr)',
            gap: '0.15rem',
            width: 264,
            maxWidth: '80vw',
          }}
        >
          {emojis.map((e) => (
            <button
              key={e}
              type="button"
              role="menuitem"
              aria-label={`Emoji ${e}`}
              onClick={() => { onSelect(e); setOpen(false); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '1.25rem', lineHeight: 1, padding: '0.2rem', borderRadius: 6,
              }}
              onMouseEnter={(ev) => { ev.currentTarget.style.background = 'var(--c-surface-2, #f0f0f0)'; }}
              onMouseLeave={(ev) => { ev.currentTarget.style.background = 'none'; }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
