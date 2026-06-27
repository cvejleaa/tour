import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import { getInitialTeamTheme, applyTeamTheme } from './features/profile/TeamThemePicker';
import './styles/theme.css';

// Anvend gemt holdfarve-tema tidligt (mirror af lyst/mørkt-init) før render.
applyTeamTheme(getInitialTeamTheme());

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
