const FEE_TYPES=['REGISTRATION_FEE','PLATE_FEE','ROAD_FEE','CTP_INSURANCE']
const VEHICLE_TYPES=['ELECTRIC_CAR','ELECTRIC_MOTORBIKE']
export function costPolicyValues(body:any){
 const feeType=typeof body.feeType==='string'?body.feeType.trim().toUpperCase():''
 const name=typeof body.name==='string'?body.name.trim():''
 const vehicleType=typeof body.vehicleType==='string'?body.vehicleType.trim().toUpperCase():''
 const provinceCode=typeof body.provinceCode==='string'?body.provinceCode.trim().toUpperCase()||null:null
 const calculationType=body.calculationType==='PERCENT'||body.calculationType==='FIXED'?body.calculationType:null
 const value=Number(body.value),version=Number(body.version)
 const effectiveFrom=new Date(body.effectiveFrom),effectiveTo=body.effectiveTo?new Date(body.effectiveTo):null
 if(!FEE_TYPES.includes(feeType))throw new Error('Loại phí không hợp lệ.')
 if(!name||name.length>255||!VEHICLE_TYPES.includes(vehicleType))throw new Error('Tên hoặc loại xe không hợp lệ.')
 if(!calculationType||!Number.isFinite(value)||value<0||(calculationType==='PERCENT'&&value>100))throw new Error('Giá trị chính sách không hợp lệ.')
 if(!Number.isInteger(version)||version<1)throw new Error('Phiên bản phải là số nguyên lớn hơn 0.')
 if(Number.isNaN(effectiveFrom.getTime())||(effectiveTo&&Number.isNaN(effectiveTo.getTime()))||(effectiveTo&&effectiveTo<=effectiveFrom))throw new Error('Thời gian hiệu lực không hợp lệ.')
 return{fee_type:feeType,name,vehicle_type:vehicleType,province_code:provinceCode,calculation_type:calculationType,value,effective_from:effectiveFrom.toISOString(),effective_to:effectiveTo?.toISOString()??null,is_active:body.isActive===true,version}
}