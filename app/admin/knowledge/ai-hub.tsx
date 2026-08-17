'use client'

import { useState } from 'react'
import { BookOpen, Cpu, Sparkles } from 'lucide-react'
import { KnowledgeManager } from './knowledge-manager'
import { SalesAgentProviderManager } from './sales-agent-provider-manager'
import type { KnowledgeDocument } from '@/lib/sales-agent/knowledge/types'

type Props = {
  initialDocuments: KnowledgeDocument[]
  initialTotal: number
}

export function AiManagementHub({ initialDocuments, initialTotal }: Props) {
  const [activeTab, setActiveTab] = useState<'knowledge' | 'providers'>('knowledge')

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Quản Lý AI (AI Management Hub)</h1>
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 border border-brand-200/60">
              Sales Agent 2.0
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Trung tâm điều hành AI: Quản lý cơ sở tri thức CMS và cấu hình Router đa nhà cung cấp, xoay vòng API Keys.
          </p>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="flex border-b border-slate-200 bg-white px-2 rounded-xl shadow-sm border">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'knowledge'}
          onClick={() => setActiveTab('knowledge')}
          className={`flex items-center gap-2.5 border-b-2 py-3.5 px-4 text-sm font-semibold transition-all ${
            activeTab === 'knowledge'
              ? 'border-brand-600 text-brand-600 bg-brand-50/40 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
          }`}
        >
          <BookOpen size={18} className={activeTab === 'knowledge' ? 'text-brand-600' : 'text-slate-400'} />
          <span>Tri Thức AI (Knowledge Base CMS)</span>
          <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">
            {initialTotal}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'providers'}
          onClick={() => setActiveTab('providers')}
          className={`flex items-center gap-2.5 border-b-2 py-3.5 px-4 text-sm font-semibold transition-all ${
            activeTab === 'providers'
              ? 'border-brand-600 text-brand-600 bg-brand-50/40 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
          }`}
        >
          <Cpu size={18} className={activeTab === 'providers' ? 'text-brand-600' : 'text-slate-400'} />
          <span>Nhà Cung Cấp & Router (Providers & Keys)</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'knowledge' ? (
        <KnowledgeManager initialDocuments={initialDocuments} initialTotal={initialTotal} />
      ) : (
        <SalesAgentProviderManager />
      )}
    </div>
  )
}
