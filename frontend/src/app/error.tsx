'use client';

// Fronteira de erro das rotas: mostra uma mensagem em vez de um ecrã em branco
// e deixa voltar a tentar (o erro pode ser momentâneo, ex. o servidor a reiniciar).

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function Error({
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
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div role="alert" className="w-full max-w-md p-6 bg-white rounded-xl border border-slate-200/80 shadow-xs text-center">
        <div className="mx-auto w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <h2 className="text-sm font-bold text-slate-900">Ocorreu um erro inesperado</h2>
        <p className="text-xs text-slate-500 mt-1">
          Não foi possível mostrar esta página. Pode tentar novamente; se o problema continuar, verifique a ligação ao servidor.
        </p>
        {error.digest && (
          <p className="text-[10px] text-slate-400 font-mono mt-2">Referência: {error.digest}</p>
        )}
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => retry()}
            className="px-4 py-2 bg-black hover:bg-neutral-800 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer border border-neutral-900"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Tentar novamente
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-colors"
          >
            Ir para o Painel
          </Link>
        </div>
      </div>
    </div>
  );
}
