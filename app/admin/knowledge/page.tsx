import { listKnowledgeDocuments } from '@/lib/sales-agent/knowledge/versioned-admin-repository'
import { AiManagementHub } from './ai-hub'

export const metadata = {
  title: 'Quản Lý AI (Tri Thức & Router Provider) - FASTLANE Admin',
  description: 'Trung tâm quản lý tri thức và cấu hình Router đa nhà cung cấp cho AI Sales Agent',
}

export default async function AdminKnowledgePage() {
  const { documents, total } = await listKnowledgeDocuments({ limit: 50 })

  return (
    <AiManagementHub
      initialDocuments={documents}
      initialTotal={total}
      visualKnowledgeEnabled={process.env.SALES_AGENT_VISUAL_KNOWLEDGE_ADMIN_ENABLED === 'true'}
    />
  )
}
