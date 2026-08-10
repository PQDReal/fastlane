import { createHash } from 'node:crypto'
import { SupabaseClient } from '@supabase/supabase-js'
import { notifyCustomerContractIssued } from '@/lib/notifications/server'
import { getAutoIssueReadiness } from '@/lib/deposit/contract-workflow'
import {
  canonicalJsonStringify,
  CAR_SALES_DOCUMENT_TYPE,
  CAR_SALES_DOCUMENT_VERSION,
  MOTORBIKE_SALES_DOCUMENT_TYPE,
  MOTORBIKE_SALES_DOCUMENT_VERSION,
  CONTRACT_SIGNATURE_WINDOW_HOURS,
  createCarSalesContractSnapshot,
  createMotorbikeSalesContractSnapshot,
} from '@/lib/deposit/contract-snapshot'

type AutoIssueResult =
  | { success: true; reason: 'ISSUED' | 'ALREADY_ISSUED'; data: Record<string, unknown> }
  | { success: false; reason: 'NOT_READY' | 'ISSUE_FAILED'; error?: string }

type ContractIssueActor =
  | { actorType: 'SYSTEM'; actorUserId: null; eventKeySuffix?: string }
  | { actorType: 'ADMIN'; actorUserId: string; eventKeySuffix?: string }

async function retryIssuedNotification(order: {
  id: string
  order_number: string
  customer_id: string | null
  vehicle_type: string | null
}, signatureDueAt: string | null) {
  if (!order.customer_id || !signatureDueAt) return
  const dueAt = new Date(signatureDueAt)
  const formattedDueDate = dueAt.toLocaleTimeString('vi-VN', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
  }) + ' ngày ' + dueAt.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
  await notifyCustomerContractIssued({
    customerId: order.customer_id,
    orderId: order.id,
    orderNumber: order.order_number,
    dueDateFormatted: formattedDueDate,
    documentMode: order.vehicle_type === 'motorbike'
      ? 'MOTORBIKE_PURCHASE_TERMS'
      : 'CAR_CONTRACT',
  }).catch((error) => console.error(
    'Contract notification failed',
    error instanceof Error ? error.message : 'unknown error',
  ))
}

/**
 * Evaluates the approval/KYC join and issues one immutable contract snapshot.
 * The database RPC remains the concurrency authority; this read is only an
 * eligibility/read-model optimization and must never be treated as a lock.
 */
export async function tryAutoIssueContract(
  supabase: SupabaseClient,
  orderId: string,
  actor: ContractIssueActor = { actorType: 'SYSTEM', actorUserId: null },
): Promise<AutoIssueResult> {
  const { data: order, error: fetchError } = await supabase
    .from('deposit_orders')
    .select('id,order_number,customer_id,status,kyc_status,kyc_session_id,vehicle_type,full_name,id_card_number,email,phone_number,province,ward,showroom,car_model,car_variant,exterior_color,subtotal,discount_amount,promotion_code,total_estimated_price,deposit_amount,created_at')
    .eq('id', orderId)
    .maybeSingle()

  if (fetchError) {
    return { success: false, reason: 'ISSUE_FAILED', error: fetchError.message }
  }
  if (!order) return { success: false, reason: 'ISSUE_FAILED', error: 'Không tìm thấy đơn' }

  if (order.status === 'PENDING_CONTRACT') {
    const { data: pendingDocument, error: pendingError } = await supabase
      .from('deposit_order_documents')
      .select('id, status, issued_at, signature_due_at, content_hash, issue_sequence')
      .eq('deposit_order_id', orderId)
      .in('document_type', [CAR_SALES_DOCUMENT_TYPE, MOTORBIKE_SALES_DOCUMENT_TYPE])
      .eq('status', 'PENDING_SIGNATURE')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (pendingError) return { success: false, reason: 'ISSUE_FAILED', error: pendingError.message }
    if (!pendingDocument) {
      if (actor.actorType === 'ADMIN') {
        const { data: requeued, error: requeueError } = await supabase.rpc(
          'admin_requeue_unissued_deposit_document',
          {
            p_order_id: orderId,
            p_actor_user_id: actor.actorUserId,
            p_event_key: `CONTRACT_ISSUE_REQUEUED:${orderId}:V1`,
          },
        ).single<{ order_status: string; replayed: boolean }>()
        if (!requeueError && requeued?.order_status === 'CONFIRMED') {
          return tryAutoIssueContract(supabase, orderId, {
            ...actor,
            eventKeySuffix: 'REPAIR_V1',
          })
        }
        return {
          success: false,
          reason: 'ISSUE_FAILED',
          error: requeueError?.message || 'Không thể đưa đơn về hàng đợi phát hành tài liệu.',
        }
      }
      return {
        success: false,
        reason: 'ISSUE_FAILED',
        error: `${order.vehicle_type === 'motorbike' ? 'Thỏa thuận đặt mua' : 'Hợp đồng'} chưa được phát hành hợp lệ.`,
      }
    }
    await retryIssuedNotification(order, pendingDocument.signature_due_at)
    return {
      success: true,
      reason: 'ALREADY_ISSUED',
      data: {
        documentId: pendingDocument.id,
        status: 'PENDING_CONTRACT',
        issuedAt: pendingDocument.issued_at,
        dueAt: pendingDocument.signature_due_at,
        contentHash: pendingDocument.content_hash,
        issueSequence: pendingDocument.issue_sequence,
        signatureWindowHours: CONTRACT_SIGNATURE_WINDOW_HOURS,
      },
    }
  }

  if (order.status !== 'CONFIRMED' || order.kyc_status !== 'APPROVED') {
    return { success: false, reason: 'NOT_READY' }
  }
  const { data: paidAttempt, error: paidError } = await supabase
    .from('vnpay_deposit_attempts')
    .select('id')
    .eq('deposit_order_id', orderId)
    .eq('status', 'PAID')
    .limit(1)
    .maybeSingle()
  if (paidError) return { success: false, reason: 'ISSUE_FAILED', error: paidError.message }
  if (getAutoIssueReadiness({
    status: order.status,
    kycStatus: order.kyc_status,
    vehicleType: order.vehicle_type,
    hasPaidDeposit: Boolean(paidAttempt),
  }) !== 'READY') {
    return { success: false, reason: 'NOT_READY', error: !paidAttempt ? 'Khoản cọc chưa được thanh toán' : undefined }
  }

  const isMotorbike = order.vehicle_type === 'motorbike'
  const documentType = isMotorbike ? MOTORBIKE_SALES_DOCUMENT_TYPE : CAR_SALES_DOCUMENT_TYPE
  const documentVersion = isMotorbike ? MOTORBIKE_SALES_DOCUMENT_VERSION : CAR_SALES_DOCUMENT_VERSION
  const documentSnapshot = isMotorbike
    ? createMotorbikeSalesContractSnapshot(order)
    : createCarSalesContractSnapshot(order)
  const contentHash = createHash('sha256')
    .update(canonicalJsonStringify(documentSnapshot))
    .digest('hex')

  const { data: issued, error: issueError } = await supabase.rpc('issue_deposit_order_contract', {
    p_order_id: order.id,
    p_actor_type: actor.actorType,
    p_actor_user_id: actor.actorUserId,
    p_document_type: documentType,
    p_document_version: documentVersion,
    p_title_snapshot: documentSnapshot.title,
    p_content_snapshot: documentSnapshot,
    p_content_hash: contentHash,
    p_signature_window_hours: CONTRACT_SIGNATURE_WINDOW_HOURS,
     p_event_key: `CONTRACT_ISSUED:${order.id}:${actor.eventKeySuffix || 'WORKFLOW_2'}`,
  }).single<{
    document_id: string
    issue_sequence: number
    issued_at: string
    signature_due_at: string
    replayed: boolean
  }>()

  if (issueError || !issued) {
    const message = issueError?.message || 'Lỗi phát hành tài liệu đặt mua'
    // A concurrent trigger may have won the row lock and issued the contract.
    if (message.includes('CONTRACT_NOT_ISSUABLE')) {
      return { success: false, reason: 'NOT_READY', error: message }
    }
    console.error('Failed to issue contract:', message)
    return { success: false, reason: 'ISSUE_FAILED', error: message }
  }

  await retryIssuedNotification(order, issued.signature_due_at)

  return {
    success: true,
    reason: 'ISSUED',
    data: {
      documentId: issued.document_id,
      status: 'PENDING_CONTRACT',
      issueSequence: issued.issue_sequence,
      issuedAt: issued.issued_at,
      dueAt: issued.signature_due_at,
      contentHash,
      signatureWindowHours: CONTRACT_SIGNATURE_WINDOW_HOURS,
    },
  }
}
