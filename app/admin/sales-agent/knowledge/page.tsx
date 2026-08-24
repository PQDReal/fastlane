import { listKnowledgeDocuments } from '@/lib/sales-agent/knowledge/versioned-admin-repository'
import { AiManagementHub } from '@/app/admin/knowledge/ai-hub'

export const metadata = {
  title: 'Quản Lý Tri Thức AI (Sales Agent Knowledge) - FASTLANE Admin',
  description: 'Trung tâm quản lý tri thức, ấn bản sổ tay hướng dẫn và cấu hình Router đa nhà cung cấp cho AI Sales Agent',
}

export default async function AdminSalesAgentKnowledgePage() {
  const { documents, total } = await listKnowledgeDocuments({ limit: 50 })

  return (
    <AiManagementHub
      initialDocuments={documents}
      initialTotal={total}
      visualKnowledgeEnabled={process.env.SALES_AGENT_VISUAL_KNOWLEDGE_ADMIN_ENABLED === 'true'}
    />
  )
}
