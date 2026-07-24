import { NextResponse } from 'next/server'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { costPolicyValues } from './cost-policy-input'

const SELECT='id,fee_type,name,vehicle_type,province_code,calculation_type,value,effective_from,effective_to,is_active,version,created_at,updated_at'
function authError(error:unknown){if(error instanceof ApiAuthError)return authErrorResponse(error);throw error}
export async function GET(request:Request){try{await authorizeAdminCatalogRequest(request)}catch(error){return authError(error)}const{data,error}=await getSupabaseAdmin().from('on_road_fee_policies').select(SELECT).order('created_at',{ascending:false});if(error)return NextResponse.json({error:'Không thể tải chính sách chi phí.'},{status:500});return NextResponse.json(data??[])}
export async function POST(request:Request){try{await authorizeAdminCatalogRequest(request)}catch(error){return authError(error)}try{const{data,error}=await getSupabaseAdmin().from('on_road_fee_policies').insert(costPolicyValues(await request.json())).select(SELECT).single();if(error)return NextResponse.json({error:error.code==='23505'?'Phạm vi và phiên bản chính sách đã tồn tại.':'Không thể thêm chính sách.'},{status:error.code==='23505'?409:400});return NextResponse.json(data,{status:201})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Dữ liệu không hợp lệ.'},{status:400})}}