/** Alert shapes, mirroring app/services/alerts.py. */

export type AlertSeverity = 'danger' | 'warning' | 'info';

export interface Alert {
  kind: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  count: number;
  amount: number;
  /** Where to go to deal with it — an alert without a next step is decoration. */
  action?: string | null;
  action_label?: string | null;
  items: Array<Record<string, string | number | null>>;
}

export interface AlertsPayload {
  data: string;
  alertas: Alert[];
  resumo: {
    total: number;
    criticos: number;
    avisos: number;
    informativos: number;
    tudo_em_dia: boolean;
  };
}
