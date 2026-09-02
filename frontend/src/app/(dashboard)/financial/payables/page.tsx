/**
 * Contas a pagar — dobrada no fluxo de caixa.
 *
 * A página fazia, pior, o que o separador "Em aberto" do fluxo de caixa faz
 * ao lado de quem liquida: os mesmos documentos, os mesmos prazos, sem a
 * previsão nem a liquidação em lote. Fica o encaminhamento para que
 * marcadores, alertas e ligações antigas continuem a chegar ao sítio certo.
 */

import { redirect } from 'next/navigation';

export default function PayablesPage() {
  redirect('/financial/cash-flow?tab=open&dir=expense');
}
