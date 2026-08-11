/**
 * TeamThemePicker – vælg et holdfarve-tema der efterligner dit yndlingsholds
 * farver. Sætter `data-team` på <html> og gemmer valget i localStorage.teamTheme.
 * "Standard (grøn)" fjerner attributten + nøglen (app-grøn).
 *
 * Vises på Min profil under "Tema". Initialiseres også ved app-start
 * (se applyInitialTeamTheme i main.jsx).
 */
import { useState, useEffect } from 'react';
import { TEAM_THEMES, teamThemeByKey } from '../../data/teamThemes';
import { accentTema, temaStil, TEMA_VARIABLE } from '../../lib/accentTema';
import { laesFarveMode } from '../../lib/farveMode';

const STORAGE_KEY = 'teamTheme';

/** Læs gemt holdtema-key (eller '' for Standard). */
export function getInitialTeamTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved && teamThemeByKey(saved) ? saved : '';
}

/**
 * Anvend et holdtema på <html> (eller fjern for tom key).
 *
 * FARVERNE STOD FØR I THEME.CSS — 23 rækker `[data-team='…']`, som var en
 * håndskrevet kopi af `teamThemes.js` uden en test til at holde de to filer i
 * takt. `scripts/accent-tema.mjs --foer` måler dem: 36 af de 46 kombinationer
 * (23 hold × lyst/mørkt) faldt på mindst ét kontrastkrav, værst Movistar i
 * mørkt tema med 1,37:1 som tekst. Nu regnes de ud af `accentTema`, som ved
 * hvilket basistema vi står i.
 *
 * Attributten bliver stående: den bruges ikke længere til at vælge farver, men
 * den fortæller, HVILKET hold der er valgt — til tests og til fejlsøgning.
 */
export function applyTeamTheme(key) {
  const root = document.documentElement;
  const tema = key ? teamThemeByKey(key) : null;
  if (!tema) {
    root.removeAttribute('data-team');
    for (const variabel of Object.values(TEMA_VARIABLE)) root.style.removeProperty(variabel);
    return;
  }
  root.setAttribute('data-team', key);
  const stil = temaStil(accentTema(tema.primary, laesFarveMode()));
  for (const [variabel, vaerdi] of Object.entries(stil)) root.style.setProperty(variabel, vaerdi);
}

export default function TeamThemePicker() {
  const [teamKey, setTeamKey] = useState(getInitialTeamTheme);

  useEffect(() => {
    applyTeamTheme(teamKey);
    if (teamKey) localStorage.setItem(STORAGE_KEY, teamKey);
    else localStorage.removeItem(STORAGE_KEY);
  }, [teamKey]);

  const selected = teamThemeByKey(teamKey);
  const swatch = selected ? selected.primary : 'var(--c-pitch)';

  return (
    <div className="flex gap-1" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <span
        aria-hidden="true"
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          background: swatch,
          border: '1px solid var(--c-border)',
          flexShrink: 0,
        }}
      />
      <select
        className="select"
        aria-label="Holdfarve-tema"
        value={teamKey}
        onChange={(e) => setTeamKey(e.target.value)}
        style={{ maxWidth: 280 }}
      >
        <option value="">Standard (grøn)</option>
        {TEAM_THEMES.map((t) => (
          <option key={t.key} value={t.key}>{t.label}</option>
        ))}
      </select>
    </div>
  );
}
