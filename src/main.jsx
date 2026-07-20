import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import { getInitialTeamTheme, applyTeamTheme } from './features/profile/TeamThemePicker';
import { PLATFORM_MODE } from './lib/platform';
import './styles/theme.css';

// Browser-fanens titel: neutral på den samlede platform.
if (PLATFORM_MODE) document.title = 'Vejleaa Tip';

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
