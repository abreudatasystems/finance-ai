/** Collections shapes, mirroring app/services/collections.py. */

export type BucketKey = 'a_vencer' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_mais';

export interface Bucket {
  chave: BucketKey;
  label: string;
  total: number;
  documentos: number;
}

export interface AgingDocument {
  id: string;
  descricao: string;
  documento: string | null;
  entity_id: string | null;
  entidade: string;
  data: string;
  vencimento: string | null;
  em_falta: number;
  dias_vencido: number;
  escalao: BucketKey;
  /** When the money is realistically expected — due date plus the habit. */
  previsao: string;
}

export interface AgingEntity {
  chave: string;
  entity_id: string | null;
  entidade: string;
  total: number;
  vencido: number;
  documentos: number;
  /** Days since the oldest overdue document fell due. */
  mais_antigo: number;
  atraso_medio: number;
  pontualidade: number | null;
  /** How many settled documents the average was learned from. */
  historico: number;
  buckets: Record<BucketKey, { label: string; total: number; documentos: number }>;
}

export interface Aging {
  hoje: string;
  tipo: 'income' | 'expense';
  total: number;
  vencido: number;
  peso_vencido: number;
  escaloes: Bucket[];
  entidades: AgingEntity[];
  documentos: AgingDocument[];
}

export interface CollectionsOverview {
  hoje: string;
  a_receber: Aging;
  a_pagar: Aging;
  mensagem: string;
}

export interface ReminderDraft {
  assunto: string;
  corpo: string;
  destinatario: string;
  total: number;
  documentos: number;
  contacto?: { email?: string | null; telefone?: string | null; nif?: string | null };
}
