import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { applyTheme, getStoredTheme } from './theme.js';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import './styles.css';

// Apply the saved theme before the first render to avoid a flash of the wrong theme.
applyTheme(getStoredTheme());

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
