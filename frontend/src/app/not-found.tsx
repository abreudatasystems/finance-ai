import Link from 'next/link';
import { FileQuestion, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md p-6 bg-white rounded-xl border border-slate-200/80 shadow-xs text-center">
        <div className="mx-auto w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
          <FileQuestion className="w-5 h-5" />
        </div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Erro 404</p>
        <h2 className="text-sm font-bold text-slate-900 mt-1">Página não encontrada</h2>
        <p className="text-xs text-slate-500 mt-1">
          O endereço que abriu não existe ou foi mudado de sítio.
        </p>
        <div className="mt-5 flex justify-center">
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-black hover:bg-neutral-800 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 border border-neutral-900"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Painel
          </Link>
        </div>
      </div>
    </div>
  );
}
