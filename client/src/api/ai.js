import { useEffect, useState } from 'react';
import { request } from '../api.js';

export const AiApi = {
  status: () => request('GET', '/api/ai/status'),
  suggestLeave: (text) => request('POST', '/api/ai/leave-suggestion', { text }),
  ask: (text) => request('POST', '/api/ai/ask', { text }),
  insight: (leaveId) => request('GET', `/api/leaves/${leaveId}/ai-insight`),
};

let statusPromise = null;
/** True when the server has an AI key configured (fetched once per page load). */
export function useAiEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    statusPromise ??= AiApi.status().catch(() => ({ enabled: false }));
    statusPromise.then((s) => setEnabled(Boolean(s.enabled)));
  }, []);
  return enabled;
}
