// Platform-tilstand. Når VITE_PLATFORM_MODE === 'true' kører koden som den
// SAMLEDE platform (tip.vejleaa.dk / spil-89af9): forsiden er spiloversigten
// ("vælg dit spil"), ikke ét enkelt spils dashboard. Er flaget slået fra
// (standard), opfører appen sig præcis som det enkeltstående Tour-spil —
// så den kørende tour-app er 100% uændret.
export const PLATFORM_MODE = import.meta.env.VITE_PLATFORM_MODE === 'true';

// Hvor en godkendt bruger lander efter login. På platformen: spiloversigten.
export const HOME_PATH = PLATFORM_MODE ? '/spil' : '/';

// Appens navn. Neutralt på den samlede platform, Tour-branding i enkelt-spil.
export const APP_NAME = PLATFORM_MODE ? 'Vejleaa Tip' : 'Tour de France Tip';
