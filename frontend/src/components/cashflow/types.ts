/** Forecast shapes, mirroring app/services/cash_forecast.py. */

export interface ForecastMovement {
  date: string;
  kind: 'in' | 'out';
  label: string;
  amount: number;
  /** Where the number came from — a figure with no source cannot be argued with. */
  origin: 'documento' | 'recorrência' | 'IVA';
  reference?: string | null;
  certainty: 'confirmado' | 'previsto' | 'vencido';
}

export interface ForecastWeek {
  inicio: string;
  fim: string;
  semana: number;
  saldo_inicial: number;
  entradas: number;
  saidas: number;
  saldo_final: number;
  movimentos: ForecastMovement[];
}

export interface CashForecast {
  hoje: string;
  horizonte: string;
  semanas: ForecastWeek[];
  saldo_inicial: number;
  saldo_final: number;
  total_entradas: number;
  total_saidas: number;
  ponto_baixo: { balance: number; date: string };
  fica_negativo_em: string | null;
  resumo: {
    aperta: boolean;
    /** Nothing to project yet — the flat line at zero is not good news. */
    sem_dados: boolean;
    recebimentos_vencidos: number;
    saidas_previstas_sem_documento: number;
    mensagem: string;
  };
}

export interface SettleResult {
  status: 'success' | 'partial';
  liquidados: number;
  falhados: number;
  total: number;
  erros: Array<{ transaction_id: string; detail: string }>;
}
