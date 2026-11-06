import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Api } from '../api.js';
import { useAuth, useToast } from '../context.jsx';
import { ROLE_LABEL, isApproverRole } from '../utils.js';
import { Avatar } from './ui.jsx';
import { NotificationBell } from './NotificationBell.jsx'; // Copilot

export function Layout() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const approver = isApproverRole(user.role);

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
    { to: '/', label: 'Dashboard', end: true },
    user.role !== 'HOD' && { to: '/apply', label: 'Apply leave' },
    user.role !== 'HOD' && { to: '/leaves', label: 'My leaves', end: true },
    approver && { to: '/approvals', label: 'Approvals', badge: pendingCount },
    user.role === 'HOD' && { to: '/team', label: 'Team' },
    { to: '/holidays', label: 'Holidays' },
    user.role === 'HOD' && { to: '/audit', label: 'Audit log' },
  ].filter(Boolean);

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand">
            <span className="brand-mark" aria-hidden="true">
              ▤
            </span>
            LeaveDesk
          </NavLink>

          <button
            className="menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="main-nav"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="visually-hidden">Menu</span>
            <span aria-hidden="true">{menuOpen ? '✕' : '☰'}</span>
          </button>

          <nav id="main-nav" className={`nav ${menuOpen ? 'open' : ''}`} aria-label="Main">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className="nav-link">
                {link.label}
                {link.badge > 0 && <span className="nav-badge">{link.badge}</span>}
              </NavLink>
            ))}
            <NotificationBell />
            <div className="user-chip">
              <Avatar name={user.name} size="sm" />
              <span className="user-meta">
                <span className="user-name">{user.name}</span>
                <span className="user-role">
                  {ROLE_LABEL[user.role]} · {user.department}
                </span>
              </span>
              <button className="btn btn-sm btn-ghost" onClick={handleLogout}>
                Sign out
              </button>
            </div>
          </nav>
        </div>
      </header>

      <main id="main" className="container">
        <Outlet />
      </main>
    </div>
  );
}
