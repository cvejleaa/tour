/**
 * ThemeToggle – knap til at skifte mellem lyst og mørkt tema.
 * Gemmer præferencen i localStorage og sætter data-theme på <html>.
 * Vises på Min profil-siden under "Udseende".
 */
import { useState, useEffect } from 'react';
import { laesFarveMode } from '../../lib/farveMode';
import { getInitialTeamTheme, applyTeamTheme } from '../profile/TeamThemePicker';

function getInitialTheme() {
  // Prioritér gemt præference, ellers OS-indstilling. Selve opslaget deles med
  // accent-temaet, så de to ikke kan blive uenige om, hvad der er valgt.
  return laesFarveMode() === 'moerkt' ? 'dark' : 'light';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    // HOLDTEMAET SKAL REGNES OM. Farverne er ikke længere en CSS-blok, der bare
    // følger med [data-theme] — de er inline-værdier på <html>, udledt for ét
    // bestemt basistema. Uden den her linje ville et skift til mørkt tema lade
    // den lyse udledning stå, altså dyb marineblå tekst på næsten sort.
    applyTeamTheme(getInitialTeamTheme());
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Skift til lyst tema' : 'Skift til mørkt tema'}
      title={theme === 'dark' ? 'Lyst tema' : 'Mørkt tema'}
    >
      {theme === 'dark' ? '☀️ Lyst' : '🌙 Mørkt'}
    </button>
  );
}
