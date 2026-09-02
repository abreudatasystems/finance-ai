/**
 * Contas a receber — dobrada no fluxo de caixa (ver contas a pagar).
 */

import { redirect } from 'next/navigation';

export default function ReceivablesPage() {
  redirect('/financial/cash-flow?tab=open&dir=income');
}
