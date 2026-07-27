import { NextResponse } from 'next/server'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { costPolicyValues } from '../cost-policy-input'

const SELECT='id,fee_type,name,vehicle_type,province_code,calculation_type,value,effective_from,effective_to,is_active,version,created_at,updated_at'
type Context={params:Promise<{policyId:string}>}
function authError(error:unknown){if(error instanceof ApiAuthError)return authErrorResponse(error);throw error}
export async function PATCH(request:Request,context:Context){try{await authorizeAdminCatalogRequest(request)}catch(error){return authError(error)}try{const{policyId}=await context.params;const{data,error}=await getSupabaseAdmin().from('on_road_fee_policies').update(costPolicyValues(await request.json())).eq('id',policyId).select(SELECT).maybeSingle();if(error)return NextResponse.json({error:error.code==='23505'?'Phạm vi và phiên bản chính sách đã tồn tại.':'Không thể cập nhật chính sách.'},{status:error.code==='23505'?409:400});if(!data)return NextResponse.json({error:'Không tìm thấy chính sách.'},{status:404});return NextResponse.json(data)}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Dữ liệu không hợp lệ.'},{status:400})}}
export async function DELETE(request:Request,context:Context){try{await authorizeAdminCatalogRequest(request)}catch(error){return authError(error)}const{policyId}=await context.params;const{data,error}=await getSupabaseAdmin().from('on_road_fee_policies').delete().eq('id',policyId).select('id').maybeSingle();if(error)return NextResponse.json({error:'Không thể xóa chính sách.'},{status:400});if(!data)return NextResponse.json({error:'Không tìm thấy chính sách.'},{status:404});return new Response(null,{status:204})}