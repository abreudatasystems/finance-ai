import Link from 'next/link';
import { FileQuestion, ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-6 text-center">
        <div className="mx-auto w-10 h-10 rounded-xl bg-neutral-100 text-neutral-600 flex items-center justify-center mb-3">
          <FileQuestion className="w-5 h-5" aria-hidden="true" />
        </div>
        <p className="text-2xs font-bold text-neutral-400 uppercase tracking-wider">Erro 404</p>
        <h2 className="text-sm font-bold text-neutral-900 mt-1">Página não encontrada</h2>
        <p className="text-xs text-neutral-500 mt-1">
          O endereço que abriu não existe ou foi mudado de sítio.
        </p>
        <div className="mt-5 flex justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 h-9 px-4 bg-black hover:bg-neutral-800 text-white font-semibold text-sm rounded-lg border border-black transition-colors"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Voltar ao Painel
          </Link>
        </div>
      </Card>
    </div>
  );
}
