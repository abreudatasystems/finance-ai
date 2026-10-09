'use client';

// Fronteira de erro das rotas: mostra uma mensagem em vez de um ecrã em branco
// e deixa voltar a tentar (o erro pode ser momentâneo, ex. o servidor a reiniciar).

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { reportError } from '@/lib/report-error';

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
    reportError(error, 'route');
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <Card role="alert" className="w-full max-w-md p-5 text-center">
        <div className="mx-auto size-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
          <AlertTriangle className="size-4" aria-hidden="true" />
        </div>
        <h2 className="text-13 font-semibold text-neutral-900">Ocorreu um erro inesperado</h2>
        <p className="text-xs text-neutral-500 mt-1">
          Não foi possível mostrar esta página. Pode tentar novamente; se o problema continuar, verifique a ligação ao servidor.
        </p>
        {error.digest && (
          <p className="text-2xs text-neutral-400 font-mono mt-2">Referência: {error.digest}</p>
        )}
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button onClick={() => retry()} icon={<RotateCcw />}>
            Tentar novamente
          </Button>
          <Link
            href="/dashboard"
            className="inline-flex items-center h-8 px-3 bg-white hover:bg-neutral-50 text-neutral-800 font-medium text-13 rounded-md border border-neutral-200 shadow-xs transition-colors"
          >
            Ir para o Painel
          </Link>
        </div>
      </Card>
    </div>
  );
}
