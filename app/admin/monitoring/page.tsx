import { SentryMonitoringDashboard } from '@/components/admin/sentry-monitoring-dashboard'
import { RedisMonitoringCard } from '@/components/admin/redis-monitoring-card'

export default function MonitoringPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Giám sát hệ thống</h1>
        <p className="mt-1 text-sm text-slate-500">Độ trễ frontend, backend/API và lỗi được tổng hợp từ Sentry.</p>
      </div>
      <RedisMonitoringCard />
      <SentryMonitoringDashboard />
    </div>
  )
}
