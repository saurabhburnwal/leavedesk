import { request } from '../api.js';

export const getLeaveBalances = () => request('GET', '/api/leaves/balances').then((data) => data.balances);
