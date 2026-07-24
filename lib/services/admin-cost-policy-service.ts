import 'server-only'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
export type FeeType='REGISTRATION_FEE'|'PLATE_FEE'|'ROAD_FEE'|'CTP_INSURANCE'
export type VehicleType='ELECTRIC_CAR'|'ELECTRIC_MOTORBIKE'
export type OnRoadFeePolicy={id:string;fee_type:FeeType;name:string;vehicle_type:VehicleType;province_code:string|null;calculation_type:'PERCENT'|'FIXED';value:number;effective_from:string;effective_to:string|null;is_active:boolean;version:number;created_at:string;updated_at:string}
export async function listCostPolicies(){const{data,error}=await getSupabaseAdmin().from('on_road_fee_policies').select('*').order('effective_from',{ascending:false});return{fees:(data??[])as OnRoadFeePolicy[],error:error?'Chưa thể tải chính sách chi phí.':null}}