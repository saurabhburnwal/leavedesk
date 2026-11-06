import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Api } from '../api.js';
import { useAuth, useToast } from '../context.jsx';
import { ROLE_LABEL, isApproverRole } from '../utils.js';
import { Avatar } from './ui.jsx';
import { NotificationBell } from './NotificationBell.jsx'; // Copilot
import { applyTheme, effectiveTheme } from '../theme.js';

/** Small line icons (inline SVG, no icon library needed). */
const ICONS = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  apply: 'M12 5v14M5 12h14',
  leaves: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  approvals: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  team: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  holidays: 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18',
  audit: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
};

export function Icon({ name, size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [theme, setTheme] = useState(() => effectiveTheme());

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  }
  const approver = isApproverRole(user.role);
  const canApply = user.role !== 'HOD';

  // Keep the approvals badge fresh whenever the user navigates.
  useEffect(() => {
    setMenuOpen(false);
    if (!approver) return;
    Api.pendingApprovals()
      .then((r) => setPendingCount(r.items.length))
      .catch(() => {});
  }, [location.pathname, approver]);

  async function handleLogout() {
    await logout();
    toast.info('You have been signed out.');
    navigate('/login');
  }

  const links = [
    { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
    canApply && { to: '/apply', label: 'Apply', icon: 'apply' },
    canApply && { to: '/leaves', label: 'My leaves', icon: 'leaves', end: true },
    approver && { to: '/approvals', label: 'Requests', icon: 'approvals', badge: pendingCount },
    user.role === 'HOD' && { to: '/team', label: 'Team', icon: 'team' },
    { to: '/holidays', label: 'Holidays', icon: 'holidays' },
    user.role === 'HOD' && { to: '/audit', label: 'Audit log', icon: 'audit' },
  ].filter(Boolean);

  return (
    <div className="app-shell">
      <div className="bg-blobs" aria-hidden="true" />
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <aside id="sidebar" className={`sidebar ${menuOpen ? 'open' : ''}`} aria-label="Main navigation">
        <NavLink to="/" className="sidebar-brand" aria-label="LeaveDesk home">
          <span className="brand-mark" aria-hidden="true">
            ▤
          </span>
          <span className="sidebar-brand-name">LeaveDesk</span>
        </NavLink>
        <nav className="side-nav">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className="side-link">
              <span className="side-icon">
                <Icon name={link.icon} />
                {link.badge > 0 && <span className="side-badge">{link.badge}</span>}
              </span>
              <span className="side-label">{link.label}</span>
            </NavLink>
          ))}
        </nav>
        <button
          className="side-link theme-toggle"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
        >
          <span className="side-icon">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </span>
          <span className="side-label">{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
        <button className="side-link side-logout" onClick={handleLogout}>
          <span className="side-icon">
            <Icon name="logout" />
          </span>
          <span className="side-label">Sign out</span>
        </button>
      </aside>
      {menuOpen && <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <div className="main-col">
        <header className="topbar">
          <button className="menu-toggle" aria-expanded={menuOpen} aria-controls="sidebar" onClick={() => setMenuOpen((o) => !o)}>
            <span className="visually-hidden">Menu</span>
            <span aria-hidden="true">☰</span>
          </button>
          <Link to="/" className="brand topbar-brand">
            <span className="brand-mark" aria-hidden="true">
              ▤
            </span>
            LeaveDesk
          </Link>

          <div className="topbar-actions">
            {canApply && (
              <Link to="/apply" className="btn btn-sm btn-outline-primary new-request">
                + New request
              </Link>
            )}
            <NotificationBell />
            <div className="user-chip" title={`${user.name} · ${ROLE_LABEL[user.role]} · ${user.department}`}>
              <Avatar name={user.name} size="md" />
              <span className="user-meta">
                <span className="user-name">{user.name}</span>
                <span className="user-role">
                  {ROLE_LABEL[user.role]} · {user.department}
                </span>
              </span>
            </div>
            <button className="icon-btn topbar-logout" onClick={handleLogout} aria-label="Sign out" title="Sign out">
              <Icon name="logout" size={18} />
            </button>
          </div>
        </header>

        <main id="main" className="container">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
