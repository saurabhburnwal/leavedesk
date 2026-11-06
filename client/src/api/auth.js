import { request } from '../api.js';

/** Sign-up, email verification and HOD team management (owner: Claude). */
export const AuthApi = {
  registerOptions: () => request('GET', '/api/auth/register-options'),
  register: (data) => request('POST', '/api/auth/register', data),
  verify: (email, code) => request('POST', '/api/auth/verify', { email, code }),
  resendCode: (email) => request('POST', '/api/auth/resend-code', { email }),
  team: () => request('GET', '/api/users/team'),
  updateMember: (id, data) => request('PATCH', `/api/users/${id}`, data),
};
