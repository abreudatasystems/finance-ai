'use client';

import React, { useEffect, useState } from 'react';
import { fetchAuditLogs } from '@/services/data';
import { AuditLogItem } from '@/types';
import { History, ShieldCheck, User, Sparkles, Clock, Filter } from 'lucide-react';

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);

  useEffect(() => {
    async function load() {
      const data = await fetchAuditLogs();
      setLogs(data);
    }
    load();
  }, []);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">
            Auditoria &amp; Activity Log
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Histórico cronológico de todas as ações executadas por utilizadores e pelo motor autónomo de IA
          </p>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-6">
        <div className="relative border-l-2 border-slate-200 pl-6 space-y-6">
          {logs.map((item) => {
            const isAiAction = item.user.includes('AI') || item.user.includes('Engine');
            return (
              <div key={item.id} className="relative group">
                {/* Bullet node */}
                <div className={`absolute -left-[31px] top-0.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${
                  isAiAction ? 'bg-indigo-600' : 'bg-slate-800'
                }`}>
                  {isAiAction ? <Sparkles className="w-2.5 h-2.5 text-white" /> : <User className="w-2.5 h-2.5 text-white" />}
                </div>

                <div className="p-4 bg-slate-50 hover:bg-slate-100/80 transition-colors rounded-xl border border-slate-200/70 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{item.user}</span>
                      <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-bold rounded">
                        {item.action}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">{item.timestamp}</span>
                  </div>

                  <p className="text-slate-700 font-medium">{item.description}</p>
                  
                  <div className="pt-1 text-[10px] text-slate-400 font-mono">
                    Módulo: {item.module} {item.entity_id && `• Entity ID: ${item.entity_id}`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
