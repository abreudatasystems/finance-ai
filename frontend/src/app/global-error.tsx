'use client';

// Substitui o layout raiz quando é ele próprio a falhar: tem de trazer o seu
// <html>/<body> e os estilos globais.

import { useEffect } from 'react';
import './globals.css';
import { Button, Card } from '@/components/ui';
import { reportError } from '@/lib/report-error';

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
    reportError(error, 'global');
  }, [error]);

  return (
    <html lang="pt">
      <body className="min-h-screen bg-neutral-50 antialiased">
        <title>Erro — Finance AI</title>
        <div className="min-h-screen flex items-center justify-center p-6">
          <Card role="alert" className="w-full max-w-md p-6 text-center">
            <h2 className="text-sm font-bold text-neutral-900">A aplicação encontrou um erro</h2>
            <p className="text-xs text-neutral-500 mt-1">
              Não foi possível carregar a aplicação. Tente novamente dentro de instantes.
            </p>
            {error.digest && (
              <p className="text-2xs text-neutral-400 font-mono mt-2">Referência: {error.digest}</p>
            )}
            <div className="mt-5 flex justify-center">
              <Button onClick={() => retry()}>Tentar novamente</Button>
            </div>
          </Card>
        </div>
      </body>
    </html>
  );
}
