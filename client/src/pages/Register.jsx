import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthApi } from '../api/auth.js';
import { useAuth, useToast } from '../context.jsx';
import { Field, Spinner } from '../components/ui.jsx';
import { PasswordInput, PasswordRules } from '../components/PasswordInput.jsx';
import { HeroIllustration } from '../components/HeroIllustration.jsx';
import '../styles/auth.css';

/** OWNER: Claude. Self sign-up (always as Employee) followed by email verification. */
export function RegisterPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [options, setOptions] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', departmentId: '', managerId: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    AuthApi.registerOptions()
      .then(setOptions)
      .catch((err) => setLoadError(err.message));
  }, []);

  const managers = useMemo(
    () => options?.departments.find((d) => String(d.id) === String(form.departmentId))?.managers ?? [],
    [options, form.departmentId],
  );

  if (user) return <Navigate to="/" replace />;

  const set = (name) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [name]: value, ...(name === 'departmentId' ? { managerId: '' } : {}) }));
    setErrors((er) => ({ ...er, [name]: undefined }));
  };

  function validate() {
    const e = {};
    if (form.name.trim().length < 2) e.name = 'Please enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'Enter a valid email address.';
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) {
      e.password = 'Use at least 8 characters with a letter and a number.';
    }
    if (!form.departmentId) e.departmentId = 'Please choose your department.';
    if (!form.managerId) e.managerId = 'Please choose your reporting manager.';
    return e;
  }

  async function submit(e) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const result = await AuthApi.register({ ...form, email: form.email.trim(), name: form.name.trim() });
      toast.success(result.delivery === 'email' ? `We sent a 6-digit code to ${result.email}.` : 'Account created. Enter the verification code.');
      navigate(`/verify?email=${encodeURIComponent(result.email)}`, { state: result });
    } catch (err) {
      setErrors(err.fields ?? {});
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <form className="card login-card" onSubmit={submit} noValidate>
        <h2>Create your account</h2>
        <p className="muted small" style={{ marginBottom: 16 }}>
          New accounts start as <strong>Employee</strong>. Your HOD can promote you to Manager later.
        </p>
        {loadError && <div className="alert alert-error">{loadError}</div>}
        {!options && !loadError && <Spinner />}
        {options && (
          <>
            <Field label="Full name" htmlFor="reg-name" error={errors.name} required>
              <input id="reg-name" type="text" autoComplete="name" value={form.name} onChange={set('name')} aria-invalid={!!errors.name} />
            </Field>
            <Field label="Work email" htmlFor="reg-email" error={errors.email} required>
              <input id="reg-email" type="email" autoComplete="email" value={form.email} onChange={set('email')} aria-invalid={!!errors.email} />
            </Field>
            <Field label="Password" htmlFor="reg-password" error={errors.password} required>
              <PasswordInput
                id="reg-password"
                autoComplete="new-password"
                value={form.password}
                onChange={set('password')}
                aria-invalid={!!errors.password}
              />
              <PasswordRules value={form.password} />
            </Field>
            <div className="row-2">
              <Field label="Department" htmlFor="reg-dept" error={errors.departmentId} required>
                <select id="reg-dept" value={form.departmentId} onChange={set('departmentId')} aria-invalid={!!errors.departmentId}>
                  <option value="">Select…</option>
                  {options.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Reporting manager" htmlFor="reg-manager" error={errors.managerId} required>
                <select
                  id="reg-manager"
                  value={form.managerId}
                  onChange={set('managerId')}
                  disabled={!form.departmentId}
                  aria-invalid={!!errors.managerId}
                >
                  <option value="">{form.departmentId ? 'Select…' : 'Pick a department first'}</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.role === 'HOD' ? 'HOD' : 'Manager'})
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {options.emailDelivery === 'demo' && (
              <p className="callout callout-info small" style={{ marginTop: 0, marginBottom: 16 }}>
                Demo mode: no email service is configured, so your verification code will be shown on the next screen.
              </p>
            )}
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? 'Creating account…' : 'Create account'}
            </button>
          </>
        )}
        <p className="center-text small">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}

/** Enter the emailed 6-digit code. Signing in happens automatically on success. */
export function VerifyEmailPage() {
  const { user, completeSignIn } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const email = params.get('email') ?? '';
  const [info, setInfo] = useState(location.state ?? null); // { delivery, demoCode } from register/resend
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(location.state ? 30 : 0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (user) return <Navigate to="/" replace />;
  if (!email) return <Navigate to="/register" replace />;

  async function verify(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    setBusy(true);
    try {
      const { user: signedIn } = await AuthApi.verify(email, code);
      completeSignIn(signedIn);
      toast.success(`Email verified. Welcome, ${signedIn.name.split(' ')[0]}!`);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.fields?.code ?? err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    try {
      const result = await AuthApi.resendCode(email);
      setInfo(result);
      setCooldown(30);
      setCode('');
      setError('');
      toast.success(result.delivery === 'email' ? 'A new code is on its way.' : 'New demo code generated.');
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <AuthShell>
      <form className="card login-card" onSubmit={verify} noValidate>
        <h2>{info?.demoCode ? 'Verify your email' : 'Check your email'}</h2>
        <p className="muted">
          Enter the 6-digit code {info?.demoCode ? 'for' : 'we sent to'} <strong>{email}</strong>. It expires in 10 minutes.
        </p>
        {info?.demoCode && (
          <div className="callout callout-info">
            <strong>Demo mode</strong> (no email service configured). Your code is{' '}
            <code className="demo-code">{info.demoCode}</code>
          </div>
        )}
        <Field label="Verification code" htmlFor="otp" error={error}>
          <input
            id="otp"
            className="otp-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="••••••"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
              setError('');
            }}
            aria-invalid={!!error}
            autoFocus
          />
        </Field>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Verifying…' : 'Verify and sign in'}
        </button>
        <p className="center-text small">
          Didn't get it?{' '}
          <button type="button" className="link-btn" onClick={resend} disabled={cooldown > 0}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </button>
          {' · '}
          <Link to="/register">Use a different email</Link>
        </p>
      </form>
    </AuthShell>
  );
}

/** Centered glassy card with blurred color-blob background. */
export function AuthShell({ children }) {
  return (
    <div className="login-page">
      {/* decorative blobs */}
      <div className="auth-blobs" aria-hidden="true">
        <div className="auth-blob auth-blob-1" />
        <div className="auth-blob auth-blob-2" />
      </div>

      {/* mobile brand mark */}
      <div className="login-mobile-brand">
        <span className="brand-mark" aria-hidden="true">▤</span>
        LeaveDesk
      </div>

      {/* desktop hero panel */}
      <section className="login-hero" aria-hidden="true">
        <div className="brand brand-lg">
          <span className="brand-mark">▤</span>
          LeaveDesk
        </div>
        <h1>Leave requests, approved without the email chains.</h1>
        <ul className="hero-points">
          <li>Apply in under a minute with live working-day count</li>
          <li>Manager → HOD approval for leave longer than 3 working days</li>
          <li>Comments, document review and a full audit trail</li>
        </ul>
        <div className="auth-brand-illustration">
          <HeroIllustration style={{ maxWidth: '100%', height: 'auto' }} />
        </div>
      </section>

      {/* glassy form panel */}
      <section className="login-panel">{children}</section>
    </div>
  );
}
