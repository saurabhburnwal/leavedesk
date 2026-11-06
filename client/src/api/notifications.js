import { request } from '../api.js';

export const notificationsApi = {
  list: (limit = 20) => request('GET', `/api/notifications?limit=${limit}`),
  markRead: (id) => request('POST', `/api/notifications/${id}/read`),
  markAllRead: () => request('POST', '/api/notifications/read-all'),
};
