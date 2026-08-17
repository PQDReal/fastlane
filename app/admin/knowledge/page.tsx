import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current-user'
import { listKnowledgeDocuments } from '@/lib/sales-agent/knowledge/repository'
import { AiManagementHub } from './ai-hub'

export const metadata = {
  title: 'Quản Lý AI (Tri Thức & Router Provider) - FASTLANE Admin',
  description: 'Trung tâm quản lý tri thức và cấu hình Router đa nhà cung cấp cho AI Sales Agent',
}

export default async function AdminKnowledgePage() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'ADMIN') {
    redirect('/403')
  }

  const { documents, total } = await listKnowledgeDocuments({ limit: 50 })

  return <AiManagementHub initialDocuments={documents} initialTotal={total} />
}
