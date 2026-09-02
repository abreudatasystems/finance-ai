/** Invoice-line shapes, mirroring app/services/invoice_lines.py. */

export interface InvoiceLine {
  id: string;
  transaction_id: string;
  line_number: number;
  description: string;
  quantity?: number | null;
  unit_price?: number | null;
  net_amount: number;
  vat_rate?: number | null;
  vat_amount: number;
  gross_amount: number;
  vat_exemption_reason?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  /** O artigo do catálogo de onde a linha veio, quando veio de lá. */
  item_id?: string | null;
  item_code?: string | null;
}

export interface RateBreakdown {
  vat_rate: number;
  base_tributavel: number;
  iva: number;
  total: number;
  linhas: number;
}

export interface LinesResponse {
  linhas: InvoiceLine[];
  por_taxa: RateBreakdown[];
  tem_linhas: boolean;
}

/** One row as the editor holds it: strings, because the user is typing. */
export interface LineDraft {
  description: string;
  quantity: string;
  unit_price: string;
  vat_rate: string;
  vat_exemption_reason?: string;
  /** Escolhido no catálogo. O que está escrito na linha continua a mandar. */
  item_id?: string | null;
  item_code?: string | null;
}

/** Um artigo do catálogo, reduzido ao que uma linha precisa de saber. */
export interface CatalogueItem {
  id: string;
  kind: 'product' | 'service';
  code: string;
  description: string;
  family?: string | null;
  unit?: string | null;
  vat_rate?: string | null;
  price_1: number;
  price_includes_vat: boolean;
  active: boolean;
}

/** Uma taxa com nome, e a percentagem que ela vale hoje na região da empresa. */
export interface VatRateOption {
  chave: string;
  label: string;
  taxa: number;
}
