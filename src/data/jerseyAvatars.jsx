/**
 * Tour-trøjer som små SVG-grafikker — bruges som avatar-valg og i klassement-
 * visningen. De fire klassementstrøjer kan ikke gengives med emojis (især
 * prik-trøjen, der er hvid med røde prikker), så de tegnes i stedet.
 *
 * En avatar gemmes som en streng. Trøje-avatarer gemmes som tokens
 * ("jersey:polka" osv.) og genkendes via isJerseyToken().
 */

// Simpel trøje-silhuet (kort ærme + krave), viewBox 0 0 32 32.
const JERSEY_PATH = 'M6,10 L12,5 L16,8 L20,5 L26,10 L22,15 L21,13 L21,27 L11,27 L11,13 L10,15 Z';

// Prikkernes placering på prik-trøjen (inden for kroppen).
const POLKA_DOTS = [
  [13.5, 15], [18, 16], [15.5, 19], [19, 21.5], [13.5, 22.5], [16.5, 24.5], [19.5, 25.5],
];

const FILL = {
  yellow: '#f6c915',
  green: '#1a9c54',
  white: '#ffffff',
  polka: '#ffffff',
};

/**
 * En enkelt Tour-trøje som inline-SVG.
 * @param {{kind:'yellow'|'green'|'white'|'polka', size?:number, title?:string}} props
 */
export function JerseyIcon({ kind, size = 24, title }) {
  const fill = FILL[kind] || '#cccccc';
  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32"
      role="img" aria-label={title || `${kind} trøje`}
    >
      {title ? <title>{title}</title> : null}
      <path d={JERSEY_PATH} fill={fill} stroke="rgba(0,0,0,0.35)" strokeWidth="1" strokeLinejoin="round" />
      {kind === 'polka' && POLKA_DOTS.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="1.4" fill="#e2231a" />
      ))}
    </svg>
  );
}

/** De fire klassementstrøjer som avatar-valg. */
export const JERSEY_AVATARS = [
  { value: 'jersey:yellow', kind: 'yellow', label: 'Gul trøje' },
  { value: 'jersey:green', kind: 'green', label: 'Grøn trøje' },
  { value: 'jersey:polka', kind: 'polka', label: 'Prik-trøje' },
  { value: 'jersey:white', kind: 'white', label: 'Ungdomstrøje' },
];

export const JERSEY_BY_TOKEN = Object.fromEntries(JERSEY_AVATARS.map((j) => [j.value, j]));

/** Er en avatar-værdi en trøje-token (fx "jersey:polka")? */
export function isJerseyToken(value) {
  return typeof value === 'string' && value.startsWith('jersey:');
}
