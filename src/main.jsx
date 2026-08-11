import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import { getInitialTeamTheme, applyTeamTheme } from './features/profile/TeamThemePicker';
import { anvendFarveMode } from './lib/farveMode';
import { PLATFORM_MODE } from './lib/platform';
import './styles/theme.css';

// Browser-fanens titel efter tilstand (index.html har en platform-standard,
// men Tour-bygget skal vise sit eget navn).
document.title = PLATFORM_MODE ? 'Vejleaa Tip — fodbold-tipping med vennerne' : 'Tour de France Tip';

// LYST/MØRKT FØRST — og for BEGGE apps. `data-theme` blev før kun sat af
// knappen på Min profil, så et gemt mørkt tema slog slet ikke igennem ved en
// frisk indlæsning. Linjen her skal stå FØR `applyTeamTheme`, som læser
// attributten for at vide, hvilket basistema accenten skal udledes for.
anvendFarveMode();

// Anvend gemt holdfarve-tema tidligt (mirror af lyst/mørkt-init) før render.
// På platformen bruges holdfarver ikke, så det springes over.
if (!PLATFORM_MODE) applyTeamTheme(getInitialTeamTheme());

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
