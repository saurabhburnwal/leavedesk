import { request } from '../api.js';

let cachedHolidays;
let pending;

export function listHolidays() {
  if (cachedHolidays) return Promise.resolve(cachedHolidays);
  if (!pending) pending = request('GET', '/api/holidays').then((data) => {
    cachedHolidays = data.items;
    return cachedHolidays;
  }).finally(() => { pending = null; });
  return pending;
}

export async function addHoliday(value) {
  const result = await request('POST', '/api/holidays', value);
  cachedHolidays = undefined;
  return result.holiday;
}

export async function deleteHoliday(id) {
  const result = await request('DELETE', `/api/holidays/${id}`);
  cachedHolidays = undefined;
  return result.holiday;
}

export function clearHolidayCache() { cachedHolidays = undefined; }
