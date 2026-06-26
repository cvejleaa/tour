/**
 * Hjælpefunktioner til avatars.
 */

// Pæn, dæmpet farvepalet til auto-genererede avatar-baggrunde.
const PALETTE = [
  '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c',
  '#16a34a', '#0891b2', '#4f46e5', '#9333ea', '#0d9488',
  '#ca8a04', '#65a30d',
];

/** Vælg en stabil farve ud fra en streng (fx uid). */
export function avatarColor(seed = '') {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

/** Initialer fra et navn (maks. 2 bogstaver). */
export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
