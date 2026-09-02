/** Onboarding shapes, mirroring app/services/onboarding.py. */

export interface OnboardingStep {
  chave: string;
  titulo: string;
  /** Why it matters — a checklist without reasons gets clicked through. */
  porque: string;
  feito: boolean;
  onde: string;
  accao: string | null;
  /** Without an essential step, figures are wrong rather than merely absent. */
  essencial: boolean;
}

export interface OnboardingStatus {
  passos: OnboardingStep[];
  concluidos: number;
  total: number;
  progresso: number;
  completo: boolean;
  pronto: boolean;
  proximo: OnboardingStep | null;
  mensagem: string;
  dados: {
    documentos: number;
    pagamentos: number;
    recorrencias: number;
    entidades: number;
    contas: number;
    membros: number;
  };
}

export interface BankAccountRow {
  id: string;
  name: string;
  bank_name: string | null;
  iban: string | null;
  currency: string;
  opening_balance: number;
  current_balance: number | null;
  is_default: boolean;
  active: boolean;
}
