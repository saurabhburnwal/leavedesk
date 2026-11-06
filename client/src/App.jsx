import { Component } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, PolicyProvider, ToastProvider, useAuth } from './context.jsx';
import { Layout } from './components/Layout.jsx';
import { Spinner, EmptyState } from './components/ui.jsx';
import { LoginPage } from './pages/Login.jsx';
import { DashboardPage } from './pages/Dashboard.jsx';
import { ApplyLeavePage, EditLeavePage } from './pages/LeaveFormPages.jsx';
import { MyLeavesPage } from './pages/MyLeaves.jsx';
import { LeaveDetailPage } from './pages/LeaveDetail.jsx';
import { ApprovalsPage } from './pages/Approvals.jsx';
import { AuditLogsPage } from './pages/AuditLogs.jsx';
import { HolidaysPage } from './pages/Holidays.jsx'; // Codex
import { TeamPage } from './pages/Team.jsx'; // Claude
import { RegisterPage, VerifyEmailPage } from './pages/Register.jsx'; // Claude

/** Redirects to /login when signed out, and to / when the role may not open the page. */
function RequireAuth({ roles, children }) {
  const { user, ready, signedOut } = useAuth();
  const location = useLocation();
  if (!ready) return <Spinner label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={signedOut ? undefined : { from: location.pathname + location.search }} />;
  if (roles && !roles.includes(user.role)) {
    return (
      <EmptyState icon="🔒" title="This page isn't available for your role" action={<Link to="/" className="btn btn-primary">Go to dashboard</Link>}>
        Ask your administrator if you think you should have access.
      </EmptyState>
    );
  }
  return children;
}

function NotFound() {
  return (
    <EmptyState icon="🧭" title="Page not found" action={<Link to="/" className="btn btn-primary">Go to dashboard</Link>}>
      The page you're looking for doesn't exist.
    </EmptyState>
  );
}

/** Catches rendering errors so one broken component never shows a blank screen. */
class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="container">
          <EmptyState icon="⚠️" title="Something went wrong" action={<button className="btn btn-primary" onClick={() => window.location.assign('/')}>Reload</button>}>
            An unexpected error occurred while showing this page.
          </EmptyState>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <PolicyProvider>
            <AuthProvider>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/verify" element={<VerifyEmailPage />} />
                <Route
                  element={
                    <RequireAuth>
                      <Layout />
                    </RequireAuth>
                  }
                >
                  <Route index element={<DashboardPage />} />
                  <Route path="apply" element={<RequireAuth roles={['EMPLOYEE', 'MANAGER']}><ApplyLeavePage /></RequireAuth>} />
                  <Route path="leaves" element={<MyLeavesPage />} />
                  <Route path="leaves/:id" element={<LeaveDetailPage />} />
                  <Route path="leaves/:id/edit" element={<EditLeavePage />} />
                  <Route path="approvals" element={<RequireAuth roles={['MANAGER', 'HOD']}><ApprovalsPage /></RequireAuth>} />
                  <Route path="audit" element={<RequireAuth roles={['HOD']}><AuditLogsPage /></RequireAuth>} />
                  <Route path="holidays" element={<HolidaysPage />} />
                  <Route path="team" element={<RequireAuth roles={['HOD']}><TeamPage /></RequireAuth>} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </AuthProvider>
          </PolicyProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
