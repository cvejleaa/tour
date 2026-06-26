/**
 * ThemeToggle – knap til at skifte mellem lyst og mørkt tema.
 * Gemmer præferencen i localStorage og sætter data-theme på <html>.
 * Kan bruges fra Leaderboard og Liga-sider.
 */
import { useState, useEffect } from 'react';

function getInitialTheme() {
  // Prioritér gemt præference, ellers brug OS-indstilling
  const saved = localStorage.getItem('theme');
  if (saved) return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
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
