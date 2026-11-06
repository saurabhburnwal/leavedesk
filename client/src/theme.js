/**
 * Light/dark theme. 'system' (default) follows the OS setting; 'light'/'dark' are explicit
 * choices stored per browser. Applied by setting data-theme on <html> (see styles.css).
 */
const KEY = 'leavedesk-theme';

export function getStoredTheme() {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // storage blocked (private mode): theme still applies for this visit
  }
}

/** The theme actually shown right now (resolves 'system'). */
export function effectiveTheme(theme = getStoredTheme()) {
  if (theme !== 'system') return theme;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
