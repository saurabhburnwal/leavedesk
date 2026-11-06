import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { PasswordInput } from '../components/PasswordInput.jsx';
import { useAuth, useToast } from '../context.jsx';
import { Field } from '../components/ui.jsx';

const DEMO_ACCOUNTS = [
  { email: 'employee@example.com', name: 'John Doe', role: 'Employee', note: 'Engineering' },
  { email: 'ananya@example.com', name: 'Ananya Iyer', role: 'Employee', note: 'Has an info request' },
  { email: 'manager@example.com', name: 'Rahul Verma', role: 'Manager', note: 'Approves Engineering' },
  { email: 'hod@example.com', name: 'Meera Nair', role: 'HOD', note: 'Level 2 + audit log' },
  { email: 'ops.manager@example.com', name: 'Sneha Kapoor', role: 'Manager', note: 'Operations' },
  { email: 'ops.employee@example.com', name: 'Karan Mehta', role: 'Employee', note: 'Operations' },
];
const DEMO_PASSWORD = 'Password@123';

export function LoginPage() {
  const { user, login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from ?? '/'} replace />;

  async function signIn(email, password) {
    const fieldErrors = {};
    if (!email.trim()) fieldErrors.email = 'Email is required.';
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) fieldErrors.email = 'Enter a valid email address.';
    if (!password) fieldErrors.password = 'Password is required.';
    setErrors(fieldErrors);
    setFormError('');
    if (Object.keys(fieldErrors).length) return;

    setBusy(true);
    try {
      const signedIn = await login(email.trim(), password);
      toast.success(`Welcome back, ${signedIn.name.split(' ')[0]}!`);
      navigate(location.state?.from ?? '/', { replace: true });
    } catch (err) {
      if (err.code === 'EMAIL_NOT_VERIFIED') {
        toast.info(err.message);
        navigate(`/verify?email=${encodeURIComponent(email.trim().toLowerCase())}`);
        return;
      }
      setErrors(err.fields ?? {});
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-hero">
        <div className="brand brand-lg">
          <span className="brand-mark" aria-hidden="true">
            ▤
          </span>
          LeaveDesk
        </div>
        <h1>Leave requests, approved without the email chains.</h1>
        <ul className="hero-points">
          <li>Apply in under a minute with live working-day count</li>
          <li>Manager → HOD approval for leave longer than 3 working days</li>
          <li>Comments, document review and a full audit trail</li>
        </ul>
      </section>

      <section className="login-panel">
        <form
          className="card login-card"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            signIn(form.email, form.password);
          }}
        >
          <h2>Sign in</h2>
          {formError && (
            <div className="alert alert-error" role="alert">
              {formError}
            </div>
          )}
          <Field label="Work email" htmlFor="email" error={errors.email}>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              aria-invalid={!!errors.email}
            />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password}>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              aria-invalid={!!errors.password}
            />
          </Field>
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="center-text small">
            New here? <Link to="/register">Create an account</Link>
          </p>
        </form>

        <div className="card demo-card">
          <h3>Demo accounts</h3>
          <p className="muted small">
            One click to sign in. Password for all: <code>{DEMO_PASSWORD}</code>
          </p>
          <div className="demo-grid">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                type="button"
                className="demo-account"
                disabled={busy}
                onClick={() => {
                  setForm({ email: acc.email, password: DEMO_PASSWORD });
                  signIn(acc.email, DEMO_PASSWORD);
                }}
              >
                <span className={`role-pill role-${acc.role.toLowerCase()}`}>{acc.role}</span>
                <span className="demo-name">{acc.name}</span>
                <span className="muted small">{acc.note}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
