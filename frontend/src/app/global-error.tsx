'use client';

// Substitui o layout raiz quando é ele próprio a falhar: tem de trazer o seu
// <html>/<body> e os estilos globais.

import { useEffect } from 'react';
import './globals.css';

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="pt">
      <body className="min-h-screen bg-[#F8FAFC] antialiased">
        <title>Erro — Finance AI</title>
        <div className="min-h-screen flex items-center justify-center p-6">
          <div role="alert" className="w-full max-w-md p-6 bg-white rounded-xl border border-slate-200/80 shadow-xs text-center">
            <h2 className="text-sm font-bold text-slate-900">A aplicação encontrou um erro</h2>
            <p className="text-xs text-slate-500 mt-1">
              Não foi possível carregar a aplicação. Tente novamente dentro de instantes.
            </p>
            {error.digest && (
              <p className="text-[10px] text-slate-400 font-mono mt-2">Referência: {error.digest}</p>
            )}
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => retry()}
                className="px-4 py-2 bg-black hover:bg-neutral-800 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-xs cursor-pointer border border-neutral-900"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
