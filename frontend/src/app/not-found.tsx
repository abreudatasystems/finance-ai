import Link from 'next/link';
import { FileQuestion, ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-5 text-center">
        <div className="mx-auto size-9 rounded-lg bg-neutral-100 text-neutral-600 flex items-center justify-center mb-3">
          <FileQuestion className="size-4" aria-hidden="true" />
        </div>
        <p className="text-xs font-medium text-neutral-500">Erro 404</p>
        <h2 className="text-13 font-semibold text-neutral-900 mt-1">Página não encontrada</h2>
        <p className="text-xs text-neutral-500 mt-1">
          O endereço que abriu não existe ou foi mudado de sítio.
        </p>
        <div className="mt-4 flex justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 h-8 px-3 bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-13 rounded-md border border-neutral-900 shadow-xs transition-colors"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Voltar ao Painel
          </Link>
        </div>
      </Card>
    </div>
  );
}
