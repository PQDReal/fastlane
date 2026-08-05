'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { contractStageCopy, getDepositContractMode, type DepositContractMode } from '@/lib/deposit/contract-workflow'

export type ContractViewerProps = {
  order: any
  onSign: () => Promise<void>
}

const formatMoney = (value: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)
}

const formatDateStr = (isoString?: string) => {
  if (!isoString) return '[●]'
  const d = new Date(isoString)
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
}

export function ContractViewer({ order, onSign }: ContractViewerProps) {
  const [agreed, setAgreed] = useState(false)
  const [isSigning, setIsSigning] = useState(false)

  const handleSign = async () => {
    if (!agreed) return
    setIsSigning(true)
    try {
      await onSign()
    } finally {
      setIsSigning(false)
    }
  }

  const productName = order?.vehicle_variants?.product_name || order?.car_model || '[●]'
  const variantName = order?.vehicle_variants?.variant_name || order?.car_variant || '[●]'
  const color = order?.exterior_color || '[●]'
  const contractMode: DepositContractMode = order?.contractMode || getDepositContractMode(order)
  const copy = contractStageCopy(contractMode)
  const batteryType = contractMode === 'BIKE_BATTERY_RENTAL' ? 'Không gồm pin (thuê pin)' : 'Kèm pin'
  
  // Default values assuming these are returned by Supabase
  const customerName = order?.full_name || '[●]'
  const customerIdCard = order?.id_card_number || '[●]'
  const customerPhone = order?.phone_number || '[●]'
  const customerEmail = order?.email || '[●]'
  
  // Calculate prices
  let totalPrice = 0
  let depositAmount = 0

  if (order?.total_estimated_price) {
    totalPrice = Number(order.total_estimated_price)
  } else {
    // Fallback if missing
    const m = String(order?.car_model || '').toUpperCase()
    if (m.includes('VF 7') || m.includes('VF 9')) totalPrice = 1000000000
    else if (m.includes('VF 6') || m.includes('VF 8')) totalPrice = 800000000
    else if (order?.vehicle_type === 'motorbike') totalPrice = 20000000
    else totalPrice = 500000000
  }

  if (order?.deposit_amount) {
    depositAmount = Number(order.deposit_amount)
  } else if (order?.vehicle_variants?.deposit_amount) {
    depositAmount = Number(order.vehicle_variants.deposit_amount)
  } else {
    depositAmount = 15000000 // Default fallback
  }

  const remainingBalance = Math.max(0, totalPrice - depositAmount)
  
  // Use province and ward from deposit order
  let address = '[●]'
  if (order?.province || order?.ward) {
    address = [order.ward, order.province].filter(Boolean).join(', ')
  }

  const contractDate = formatDateStr(order?.created_at)

  return (
    <div className="mx-auto max-w-4xl bg-white p-6 shadow-sm sm:p-10 md:border md:border-slate-200 text-slate-800" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
      {/* HEADER */}
      <div className="text-center">
        <h1 className="text-xl font-bold uppercase sm:text-2xl">{copy.title}</h1>
        <p className="mt-2 text-sm italic">Số: {order?.order_number || order?.id?.substring(0, 8) || '[●]'}/HĐMB</p>
      </div>

      <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-slate-800">
        <p>Hợp đồng này được ký và có hiệu lực ngày <strong>{contractDate}</strong> giữa:</p>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* BÊN BÁN */}
          <div>
            <h2 className="font-bold uppercase">BÊN BÁN: CÔNG TY TNHH KINH DOANH THƯƠNG MẠI VÀ DỊCH VỤ VINFAST</h2>
            <ul className="mt-2 space-y-1">
              <li>Địa chỉ: KCN Đình Vũ, Cát Hải, Hải Phòng, Việt Nam</li>
              <li>MSDN: 0108926276</li>
              <li>Đại diện: Theo ủy quyền - Chức vụ: Giám đốc Kinh doanh</li>
            </ul>
          </div>

          {/* KHÁCH HÀNG */}
          <div>
            <h2 className="font-bold uppercase">KHÁCH HÀNG: {customerName}</h2>
            <ul className="mt-2 space-y-1">
              <li>Địa chỉ: {address}</li>
              <li>Điện thoại: {customerPhone} - Email: {customerEmail}</li>
              <li>CCCD/MSDN: {customerIdCard}</li>
            </ul>
          </div>
        </div>

        {/* ĐIỀU 1 */}
        <div className="mt-6">
          <h2 className="font-bold">Điều 1. Thông tin xe và giá bán</h2>
          <div className="mt-3 overflow-x-auto rounded-md border border-slate-300">
            <table className="w-full text-left">
              <thead className="bg-slate-100 font-semibold text-slate-800">
                <tr>
                  <th className="border-b border-r border-slate-300 p-2 text-center w-12">TT</th>
                  <th className="border-b border-r border-slate-300 p-2">Mô tả xe</th>
                  <th className="border-b border-r border-slate-300 p-2 text-center">Số lượng</th>
                  <th className="border-b border-r border-slate-300 p-2 text-right">Thành tiền (VNĐ)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300 bg-white">
                <tr>
                  <td className="border-r border-slate-300 p-2 text-center align-top">1</td>
                  <td className="border-r border-slate-300 p-2 align-top">
                    <p className="font-semibold">Xe {productName} [{batteryType}]</p>
                    <p className="mt-1 text-xs text-slate-600">Phiên bản: {variantName} - Màu: {color}</p>
                    <p className="mt-1 text-xs text-slate-600">Xe mới 100%, theo tiêu chuẩn của Nhà sản xuất.</p>
                  </td>
                  <td className="border-r border-slate-300 p-2 text-center align-top">1</td>
                  <td className="p-2 text-right align-top font-medium">{formatMoney(totalPrice)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 italic">
            {contractMode === 'CAR_SALES'
              ? 'Giá trị Hợp đồng đã bao gồm thuế tiêu thụ đặc biệt, thuế giá trị gia tăng, nhưng không bao gồm lệ phí trước bạ, chi phí đăng ký, lưu hành, bảo hiểm xe và các chi phí khác.'
              : contractMode === 'BIKE_BATTERY_RENTAL'
                ? 'Thỏa thuận này mô phỏng việc xác nhận thuê pin; phí thuê pin và các điều kiện áp dụng thực hiện theo chính sách VinFast hiện hành.'
                : 'Thỏa thuận này mô phỏng việc xác nhận đặt mua; các khoản phí đăng ký, bảo hiểm và chi phí khác thực hiện theo chính sách VinFast hiện hành.'}
          </p>
        </div>

        {/* ĐIỀU 2 */}
        <div className="mt-6 space-y-2">
          <h2 className="font-bold">Điều 2. Thanh toán và điều kiện áp dụng</h2>
          <p>
            Khách Hàng thanh toán đợt 1 (tiền cọc) số tiền <strong>{formatMoney(depositAmount)}</strong> trong vòng 03 ngày làm việc kể từ ngày ký Hợp đồng này hoặc được chuyển thành thanh toán trước từ Thỏa thuận Đặt cọc trước đó (Đã thanh toán).
          </p>
          <p>
            Khoản tiền còn lại cần thanh toán là: <strong>{formatMoney(remainingBalance)}</strong>. Số tiền này được thanh toán như sau:
          </p>
          <ul className="list-disc pl-5">
            <li>Nếu trả thẳng: Khách Hàng thanh toán số tiền còn lại cho Bên Bán trong vòng 07 ngày làm việc kể từ ngày Bên Bán thông báo xe sẵn sàng để giao.</li>
            <li>Nếu trả góp: Khách Hàng thanh toán vốn tự có và gửi Thông báo tín dụng của Ngân hàng cho số tiền còn lại. Số tiền còn lại sẽ do Ngân hàng giải ngân trong vòng 05 ngày làm việc kể từ ngày Bên Bán và Khách Hàng bàn giao giấy hẹn trả kết quả đăng ký xe cho Ngân hàng. Nếu Ngân hàng không giải ngân, Khách Hàng phải tự thanh toán cho Bên Bán trong vòng 10 ngày làm việc kể từ ngày Bên Bán yêu cầu.</li>
          </ul>
          <p>
            Nếu Khách Hàng không thanh toán đúng hạn, Bên Bán có quyền chỉ định bên thứ ba xử lý xe để thu hồi khoản nợ. Số tiền thu được được ưu tiên thanh toán cho Hợp đồng này. Khách Hàng chịu mọi chi phí xử lý xe và thù lao ủy quyền bằng 10% giá trị xe tại thời điểm xử lý.
          </p>
          <p>
            Khách Hàng chậm thanh toán sẽ phải trả lãi suất quá hạn 15%/năm tương ứng với số tiền và số ngày chậm trả.
          </p>
          <p>
            Phương thức thanh toán: chuyển khoản, tiền mặt (không áp dụng với mua hàng trực tuyến), hoặc thẻ ngân hàng (chỉ áp dụng cho Đợt 1 tại Đại lý phân phối (nếu có)). Phí giao dịch thẻ do Bên Bán chịu.
          </p>
        </div>

        {/* ĐIỀU 3 & 4 & 5 */}
        <div className="mt-6 space-y-2">
          <h2 className="font-bold">Điều 3. Giao nhận xe</h2>
          <p>
            Thời gian giao nhận xe: ngày <strong>{(() => {
              const d = new Date(order?.created_at || new Date())
              d.setDate(d.getDate() + 30) // Giao xe sau 30 ngày
              return d.toLocaleDateString('vi-VN')
            })()}</strong> tại <strong>{order?.showroom || 'Showroom VinFast'}</strong>, hoặc theo thông báo của Bên Bán trước 07 ngày làm việc (đối với mua hàng qua kênh trực tuyến). Nếu chậm nhận xe, Khách Hàng phải thanh toán chi phí lưu giữ xe theo đơn giá Bên Bán thông báo.
          </p>
          <p>
            Bên Bán sẽ cung cấp đầy đủ hóa đơn, chứng từ hợp lệ cho Khách Hàng. Nếu Khách Hàng thanh toán trả thẳng, Bên Bán sẽ giao xe cùng với hóa đơn và đầy đủ giấy tờ cho Khách Hàng sau khi nhận đủ 100% Giá trị Hợp đồng.
          </p>
          <p>
            Trừ trường hợp Hợp đồng này có quy định khác, quyền sở hữu, rủi ro đối với xe được chuyển sang Khách Hàng khi xe được bàn giao cho Khách Hàng hoặc người đại diện hợp pháp của Khách Hàng.
          </p>

          <h2 className="font-bold mt-4">Điều 4. Bảo hành</h2>
          <p>
            Việc bảo hành được thực hiện tại các Trung tâm dịch vụ sửa chữa xe điện VinFast, theo quy định tại sổ bảo hành do Bên Bán cung cấp.
          </p>

          <h2 className="font-bold mt-4">Điều 5. Điều khoản khác</h2>
          <div className="space-y-1">
            <p>- Xe chỉ hoạt động tốt khi được sử dụng với pin và thiết bị sạc chính hãng và được sử dụng đúng theo hướng dẫn sử dụng và sổ bảo hành được cung cấp và/hoặc đăng tải trên Website. Bên Bán/ Nhà sản xuất không chịu trách nhiệm với thiệt hại phát sinh do sử dụng không đúng hướng dẫn.</p>
            <p>- Khách Hàng cần duy trì eSIM (nếu được tích hợp sẵn trên xe) để sử dụng các tính năng thông minh. Mọi thông tin tham khảo tại E-brochure trên Website hoặc Ứng dụng VinFast.</p>
            <p>- Các thông báo của Bên Bán phải bằng văn bản, email, Ứng dụng VinFast, cuộc gọi hoặc tin nhắn.</p>
            <p>- Để thực hiện Hợp đồng này và tuân thủ pháp luật hiện hành, Bên Bán sẽ xử lý dữ liệu cá nhân của Khách Hàng theo Chính sách Bảo vệ Dữ liệu Cá nhân được công bố tại Website và Ứng dụng VinFast.</p>
            <p>- Bên Bán được chấm dứt Hợp Đồng nếu Khách Hàng vi phạm nghĩa vụ mà không khắc phục hoặc không thể khắc phục toàn bộ trong 10 ngày kể từ ngày đến hạn hoặc được thông báo, và Khách Hàng sẽ không được nhận lại khoản tiền thanh toán trước. Trường hợp Hợp đồng chấm dứt không do lỗi của Khách Hàng, Bên Bán phải báo trước cho Khách Hàng ít nhất 07 ngày (trừ trường hợp pháp luật có quy định khác) và phải trả lại toàn bộ khoản tiền thanh toán trước cho Khách Hàng.</p>
            <p>- Bằng việc giao kết Hợp Đồng này, Khách Hàng đồng ý rằng: Bên Bán có thể chuyển giao Hợp Đồng này cho công ty con/liên kết của mình hoặc bên thứ ba khác sau khi thông báo bằng văn bản ít nhất 05 ngày làm việc trước ngày chuyển giao (bao gồm nhưng không giới hạn hình thức thông báo qua Ứng dụng VinFast, tin nhắn SMS, văn bản).</p>
            <p>- Nếu xảy ra sự kiện bất khả kháng sẽ được Các Bên xử lý theo quy định của pháp luật.</p>
            <p>- Nếu không thương lượng được, các tranh chấp về Hợp Đồng sẽ được giải quyết tại tòa án có thẩm quyền.</p>
          </div>
        </div>

        {/* CHỮ KÝ */}
        <div className="mt-12 mb-8">
          <div className="flex flex-col items-center justify-between gap-8 sm:flex-row sm:items-start sm:px-12">
            <div className="text-center">
              <p className="font-bold uppercase">Khách Hàng</p>
              <p className="mt-1 text-xs italic text-slate-500">(Ký điện tử bằng tài khoản định danh)</p>
              <div className="mt-12 text-sm font-semibold text-slate-800">{customerName}</div>
            </div>
            <div className="text-center">
              <p className="font-bold uppercase">Bên Bán</p>
              <p className="mt-1 text-xs italic text-slate-500">(Ký tên và đóng dấu)</p>
              <div className="mt-12 text-sm font-semibold text-slate-800">CÔNG TY VINFAST</div>
            </div>
          </div>
        </div>
      </div>

      {/* Hành động Ký hợp đồng */}
      <div className="mt-8 flex flex-col items-center space-y-6 border-t border-slate-200 pt-8 sm:px-6 font-sans">
        <label className="flex cursor-pointer items-start space-x-3 rounded-lg border border-transparent p-3 transition-colors hover:bg-slate-50">
          <input 
            type="checkbox"
            id="agree-contract" 
            checked={agreed} 
            onChange={(e) => setAgreed(e.target.checked)} 
            className="mt-1 h-5 w-5 rounded border-gray-300 text-[#1e4d2b] focus:ring-[#1e4d2b]"
          />
          <div className="leading-snug">
            <p className="font-medium text-slate-900">{copy.consent}</p>
            <p className="mt-1 text-xs text-slate-500">Giao dịch này tương đương chữ ký số có giá trị pháp lý.</p>
          </div>
        </label>
        
        <Button 
          onClick={handleSign} 
          disabled={!agreed || isSigning} 
          size="default" 
          className="w-full sm:w-auto sm:px-16 bg-[#1e4d2b] hover:bg-[#1e4d2b]/90 text-white"
        >
          {isSigning ? 'Đang xử lý...' : contractMode === 'CAR_SALES' ? 'Ký Hợp Đồng' : 'Xác nhận thỏa thuận'}
        </Button>
      </div>
    </div>
  )
}
