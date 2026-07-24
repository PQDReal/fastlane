import 'server-only'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type ComparableVariant = { id: string; name: string; sku: string; originalPrice: number; salePrice: number | null }
export type ComparableVehicle = { id: string; name: string; slug: string; category: string; description: string; imageUrl: string | null; displayedPrice: number | null; colors: string[]; deposit: string | null; options: string[]; status: string; variants: ComparableVariant[] }
type ProductRow = { id:string; name:string; slug:string; description:string|null; image_urls:unknown; displayed_price:number|null; specifications:unknown; categories:{name:string}|{name:string}[]|null; product_variants:{id:string;name:string;sku:string;original_price:number;sale_price:number|null}[]|null }
type Specs = {
  colors?: unknown
  deposit?: unknown
  options?: unknown
  status?: unknown
  'Màu sắc'?: unknown
  'Tiền đặt cọc'?: unknown
}
const CATEGORIES=new Set(['Ô tô điện','Xe máy điện'])
const strings=(value:unknown):string[]=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'):[]
const colorStrings=(value:unknown):string[]=>{
  if(Array.isArray(value)) return strings(value)
  if(typeof value!=='string') return []
  return value.split(/[;,]/).map((color)=>color.trim()).filter(Boolean)
}

export async function listComparableVehicles():Promise<ComparableVehicle[]> {
  const {data,error}=await getSupabaseAdmin().from('products').select(`id,name,slug,description,image_urls,displayed_price,specifications,categories(name),product_variants(id,name,sku,original_price,sale_price)`).eq('is_active',true).eq('product_type','VEHICLE').eq('product_variants.is_active',true).order('name')
  if(error) throw new Error(`Không thể tải dữ liệu so sánh: ${error.message}`)
  return ((data??[]) as ProductRow[]).map((product)=>{
    const category=Array.isArray(product.categories)?product.categories[0]:product.categories
    const specs=product.specifications&&typeof product.specifications==='object'&&!Array.isArray(product.specifications)?product.specifications as Specs:{}
    const images=strings(product.image_urls)
    const colors=colorStrings(specs.colors).length?colorStrings(specs.colors):colorStrings(specs['Màu sắc'])
    const deposit=typeof specs.deposit==='string'?specs.deposit:typeof specs['Tiền đặt cọc']==='string'&&specs['Tiền đặt cọc']?specs['Tiền đặt cọc']:null
    return { id:product.id,name:product.name,slug:product.slug,category:category?.name??'Chưa phân loại',description:product.description??'Chưa có mô tả',imageUrl:images[0]??null,displayedPrice:product.displayed_price,colors,deposit,options:strings(specs.options),status:typeof specs.status==='string'?specs.status:'Đang kinh doanh',variants:(product.product_variants??[]).map((variant)=>({id:variant.id,name:variant.name,sku:variant.sku,originalPrice:variant.original_price,salePrice:variant.sale_price})) }
  }).filter((product)=>CATEGORIES.has(product.category))
}
