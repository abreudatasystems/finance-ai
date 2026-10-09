import React from 'react';
import { Zap } from 'lucide-react';
import { Card } from '@/components/ui';

/** Moldura comum das páginas públicas de autenticação. */
export function AuthShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex items-center justify-center p-4 font-sans">
      <div className={`w-full ${wide ? 'max-w-lg' : 'max-w-md'} space-y-4`}>
        <div className="text-center space-y-2">
          <div className="size-9 rounded-lg bg-neutral-900 flex items-center justify-center mx-auto">
            <Zap className="size-4 fill-emerald-400 text-emerald-400" aria-hidden="true" />
          </div>
          <p className="text-lg font-semibold tracking-tight">
            Finance <span className="text-emerald-600">AI</span>
          </p>
        </div>
        <Card className="p-5 space-y-4">{children}</Card>
      </div>
    </div>
  );
}
