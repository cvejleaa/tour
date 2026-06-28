/**
 * Avatar-sæt til profilen: et cykling-/Tour-tema.
 *
 * Hvert element er enten en emoji-streng eller et objekt
 * { value, label, node } (til de tegnede Tour-trøjer). EmojiPicker forstår
 * begge former; den valgte værdi gemmes som brugerens avatar.
 */
import { JERSEY_AVATARS, JerseyIcon } from './jerseyAvatars';

// De fire klassementstrøjer som tegnede valg (først, så de er nemme at finde).
const JERSEY_ITEMS = JERSEY_AVATARS.map((j) => ({
  value: j.value,
  label: j.label,
  node: <JerseyIcon kind={j.kind} size={22} title={j.label} />,
}));

export const AVATAR_SET = [
  // Trøjer (tegnet) + medaljer
  ...JERSEY_ITEMS, '🎽', '🏆', '🥇', '👑',
  // Ryttere & cykler
  '🚴', '🚵', '🚲', '🛞', '⚙️', '🔧', '🏁', '🚩',
  // Bjerge, vej & ur
  '🏔️', '⛰️', '🗻', '🧭', '⏱️', '📣', '🗼', '🇫🇷',
  // Vejr & fart
  '☀️', '🌧️', '💨', '⚡', '🔥', '🌪️', '🥵', '🥶',
  // Power & tilnavne (🐂 oksen, 🐐 GOAT'en …)
  '🐂', '🐐', '🦁', '🦅', '🦊', '🐺', '💪', '🦵',
  // Forplejning
  '🍌', '🥤', '🧃', '🍷', '🥐', '🥖', '🧀', '☕',
];
