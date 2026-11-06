/**
 * Sends transactional email through Resend (https://resend.com) when RESEND_API_KEY is set.
 * Without a key the app runs in "demo mode": the email is printed to the server console
 * and the caller can show the code on screen. Assessors can then try sign-up with zero setup.
 *
 * Note: with Resend's shared test sender (onboarding@resend.dev) mail is only delivered to the
 * Resend account owner's address. Verify your own domain in Resend to email anyone.
 */
export class EmailService {
  constructor({ apiKey, from }) {
    this.apiKey = apiKey;
    this.from = from;
  }

  get enabled() {
    return Boolean(this.apiKey);
  }

  /** Returns 'email' when sent through Resend, 'demo' when only logged. Throws on delivery failure. */
  async send({ to, subject, text, html }) {
    if (!this.enabled) {
      console.log(`\n  [demo email] To: ${to}\n  Subject: ${subject}\n  ${text.replace(/\n/g, '\n  ')}\n`);
      return 'demo';
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(10_000),
    }).catch((err) => ({ ok: false, status: 0, text: async () => err.message }));

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(`[email] Resend failed (${response.status}): ${detail}`);
      throw new Error('EMAIL_DELIVERY_FAILED');
    }
    return 'email';
  }

  verificationEmail(name, code) {
    const text = `Hi ${name},\n\nYour LeaveDesk verification code is: ${code}\n\nIt expires in 10 minutes. If you didn't sign up, you can ignore this email.`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px">
      <h2 style="color:#4338ca;margin:0 0 12px">Verify your email</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Your LeaveDesk verification code is:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#eef0ff;padding:12px 16px;border-radius:8px;text-align:center">${code}</p>
      <p style="color:#5d6481;font-size:13px">It expires in 10 minutes. If you didn't sign up, you can ignore this email.</p>
    </div>`;
    return { subject: `${code} is your LeaveDesk verification code`, text, html };
  }
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
