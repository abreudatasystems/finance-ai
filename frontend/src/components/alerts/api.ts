/** Data access for the alerts module. */

import { apiGet } from '@/services/api';
import { AlertsPayload } from './types';

export async function fetchAlerts(): Promise<AlertsPayload | null> {
  return apiGet<AlertsPayload>('/alerts/');
}
