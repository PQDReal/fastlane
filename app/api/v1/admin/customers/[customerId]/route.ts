import { NextResponse } from 'next/server'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { Auth0ManagementError, deleteAuth0UsersByEmail, updateAuth0UsersByEmail, verifyAuth0UsersByEmail } from '@/lib/auth0-management'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type Context={params:Promise<{customerId:string}>}
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/,PHONE=/^\+?[0-9]{9,15}$/
const SELECT='id,auth0_subject,email,full_name,phone_number,role,status,email_verified,created_at,updated_at'
const PUBLIC='id,email,full_name,phone_number,role,status,email_verified,created_at,updated_at'
async function guard(request:Request){try{await authorizeAdminCatalogRequest(request);return null}catch(error){if(error instanceof ApiAuthError)return authErrorResponse(error);throw error}}
function managementError(error:unknown,fallback:string){return NextResponse.json({error:error instanceof Auth0ManagementError?error.message:fallback},{status:error instanceof Auth0ManagementError?error.status:502})}

export async function PATCH(request:Request,context:Context){
 const denied=await guard(request);if(denied)return denied
 const body:unknown=await request.json().catch(()=>null);if(!body||typeof body!=='object'||Array.isArray(body))return NextResponse.json({error:'Dữ liệu không hợp lệ.'},{status:400})
 const input=body as Record<string,unknown>,{customerId}=await context.params,supabase=getSupabaseAdmin()
 const existing=await supabase.from('users').select(SELECT).eq('id',customerId).maybeSingle()
 if(existing.error)return NextResponse.json({error:'Không thể tải khách hàng.'},{status:500});if(!existing.data)return NextResponse.json({error:'Không tìm thấy khách hàng.'},{status:404})
 const verifyEmail=input.emailVerified===true
 if(input.emailVerified!==undefined&&input.emailVerified!==true)return NextResponse.json({error:'Chỉ hỗ trợ xác thực email.'},{status:400})
 const updates:Record<string,string|boolean|null>={updated_at:new Date().toISOString()},auth0Updates:{email?:string;fullName?:string;phoneNumber?:string|null;blocked?:boolean;role?:'ADMIN'|'CUSTOMER'}={}
 if(input.email!==undefined){const value=typeof input.email==='string'?input.email.trim().toLowerCase():'';if(!EMAIL.test(value))return NextResponse.json({error:'Email không hợp lệ.'},{status:400});if(value!==existing.data.email)return NextResponse.json({error:'Không thể thay đổi email của tài khoản.'},{status:400})}
 if(input.fullName!==undefined){const value=typeof input.fullName==='string'?input.fullName.trim():'';if(!value||value.length>255)return NextResponse.json({error:'Họ và tên không hợp lệ.'},{status:400});updates.full_name=value;auth0Updates.fullName=value}
 if(input.phoneNumber!==undefined){const value=input.phoneNumber===null||input.phoneNumber===''?null:typeof input.phoneNumber==='string'?input.phoneNumber.trim():'';if(value!==null&&!PHONE.test(value))return NextResponse.json({error:'Số điện thoại không hợp lệ.'},{status:400});updates.phone_number=value;auth0Updates.phoneNumber=value}
 if(input.status!==undefined){if(input.status!=='ACTIVE'&&input.status!=='INACTIVE')return NextResponse.json({error:'Trạng thái không hợp lệ.'},{status:400});updates.status=input.status;auth0Updates.blocked=input.status==='INACTIVE'}
 if(input.role!==undefined){if(input.role!=='ADMIN'&&input.role!=='CUSTOMER')return NextResponse.json({error:'Vai trò không hợp lệ.'},{status:400});updates.role=input.role;auth0Updates.role=input.role}
 if(Object.keys(updates).length===1&&!verifyEmail)return NextResponse.json({error:'Không có thay đổi.'},{status:400})
 if(verifyEmail){try{await verifyAuth0UsersByEmail(existing.data.email,existing.data.auth0_subject)}catch(error){return managementError(error,'Không thể xác thực email trên Auth0.')}}
 if(verifyEmail)updates.email_verified=true
 if(Object.keys(auth0Updates).length>0){try{await updateAuth0UsersByEmail(existing.data.email,existing.data.auth0_subject,auth0Updates)}catch(error){return managementError(error,'Không thể cập nhật tài khoản trên Auth0.')}}
 const updated=await supabase.from('users').update(updates).eq('id',customerId).select(PUBLIC).maybeSingle()
 if(updated.error||!updated.data){await updateAuth0UsersByEmail(existing.data.email,existing.data.auth0_subject,{email:existing.data.email,fullName:existing.data.full_name,phoneNumber:existing.data.phone_number,blocked:existing.data.status==='INACTIVE',role:existing.data.role}).catch(()=>undefined);return NextResponse.json({error:updated.error?.code==='23505'?'Email đã tồn tại.':'Không thể cập nhật database.'},{status:updated.error?.code==='23505'?409:500})}
 return NextResponse.json(updated.data)
}

export async function DELETE(request:Request,context:Context){
 const denied=await guard(request);if(denied)return denied
 const {customerId}=await context.params,supabase=getSupabaseAdmin(),existing=await supabase.from('users').select(SELECT).eq('id',customerId).eq('role','CUSTOMER').maybeSingle()
 if(existing.error)return NextResponse.json({error:'Không thể tải khách hàng.'},{status:500});if(!existing.data)return NextResponse.json({error:'Không tìm thấy khách hàng.'},{status:404})
 const removed=await supabase.from('users').delete().eq('id',customerId).eq('role','CUSTOMER');if(removed.error)return NextResponse.json({error:'Không thể xóa tài khoản khỏi database.'},{status:500})
 try{await deleteAuth0UsersByEmail(existing.data.email,existing.data.auth0_subject)}catch(error){await supabase.from('users').insert(existing.data);return managementError(error,'Không thể xóa tài khoản trên Auth0.')}
 return new NextResponse(null,{status:204})
}