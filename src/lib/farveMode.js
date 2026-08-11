// ---------------------------------------------------------------------------
// HVILKET BASISTEMA STÅR VI I — lyst eller mørkt?
//
// Spørgsmålet blev aldrig stillet i JavaScript før, fordi temaerne lå i CSS og
// dermed selv kunne skifte med `[data-theme='dark']`. Nu regnes accentfarverne
// ud i koden, og så SKAL koden vide det: den samme klubfarve giver to
// forskellige temaer (dyb i lyst, lys i mørkt), og et tema beregnet for det
// forkerte basistema er ikke bare grimt — det er ulæseligt.
//
// Svaret læses samme sted, som `ThemeToggle` skriver det. Rækkefølgen er
// bevidst: attributten først, fordi den er sandheden på skærmen lige nu;
// localStorage dernæst, fordi `main.jsx` anvender temaet FØR React har kørt
// togglens effekt; og OS-indstillingen til sidst for en ny bruger.
// ---------------------------------------------------------------------------

/** @returns {'lyst'|'moerkt'} */
export function laesFarveMode() {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark') return 'moerkt';
    if (attr === 'light') return 'lyst';
  }
  try {
    const gemt = localStorage.getItem('theme');
    if (gemt) return gemt === 'dark' ? 'moerkt' : 'lyst';
  } catch {
    /* privat browsertilstand — fald videre til OS-indstillingen */
  }
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'moerkt' : 'lyst';
  }
  return 'lyst';
}

/**
 * Abonnér på skift af basistema. Kalder `naar` hver gang `data-theme` ændrer
 * sig på <html>. Returnerer en opsigelse.
 *
 * DEN ER NØDVENDIG, og det er ikke teoretisk: skifter man til mørkt tema, mens
 * man står inde i et spil, ville spillets accentfarve blive stående i sin lyse
 * udgave oven på den mørke baggrund — altså præcis den kombination, hele
 * udregningen findes for at undgå.
 */
export function lytTilFarveMode(naar) {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return () => {};
  const obs = new MutationObserver(() => naar(laesFarveMode()));
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => obs.disconnect();
}
