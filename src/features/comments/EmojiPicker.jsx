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

// Et element er enten en emoji-streng eller et objekt { value, label, node }
// (fx en tegnet trøje). Disse hjælpere normaliserer begge former.
const itemValue = (it) => (typeof it === 'string' ? it : it.value);
const itemLabel = (it) => (typeof it === 'string' ? `Emoji ${it}` : (it.label || `Emoji ${it.value}`));
const itemNode = (it) => (typeof it === 'string' ? it : (it.node ?? it.value));

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
          {emojis.map((it) => (
            <button
              key={itemValue(it)}
              type="button"
              role="menuitem"
              aria-label={itemLabel(it)}
              onClick={() => { onSelect(itemValue(it)); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '1.25rem', lineHeight: 1, padding: '0.2rem', borderRadius: 6,
              }}
              onMouseEnter={(ev) => { ev.currentTarget.style.background = 'var(--c-surface-2, #f0f0f0)'; }}
              onMouseLeave={(ev) => { ev.currentTarget.style.background = 'none'; }}
            >
              {itemNode(it)}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
