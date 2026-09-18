export const CAR_SALES_DOCUMENT_TYPE = 'CAR_SALES_CONTRACT'
export const CAR_SALES_DOCUMENT_VERSION = '2026-08-07.1'
export const CAR_SALES_CONSENT_VERSION = 'car-sales-consent-2026-08-07.1'
export const MOTORBIKE_SALES_DOCUMENT_TYPE = 'MOTORBIKE_SALES_CONTRACT'
export const MOTORBIKE_SALES_DOCUMENT_VERSION = '2026-08-07.2'
export const MOTORBIKE_SALES_CONSENT_VERSION = 'motorbike-sales-consent-2026-08-07.2'
export const CONTRACT_WORKFLOW_VERSION = 2
export const CONTRACT_SIGNATURE_WINDOW_HOURS = 72

type ContractOrderSource = {
  order_number: string | null
  created_at: string | null
  full_name: string | null
  id_card_number: string | null
  email: string | null
  phone_number: string | null
  province: string | null
  ward: string | null
  showroom: string | null
  car_model: string | null
  car_variant: string | null
  exterior_color: string | null
  subtotal: number | string | null
  discount_amount: number | string | null
  promotion_code: string | null
  total_estimated_price: number | string | null
  deposit_amount: number | string | null
}

function money(value: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)
}

function date(value: Date) {
  return `${String(value.getUTCDate()).padStart(2, '0')}/${String(value.getUTCMonth() + 1).padStart(2, '0')}/${value.getUTCFullYear()}`
}

export function createCarSalesContractSnapshot(order: ContractOrderSource) {
  const totalPrice = Number(order.total_estimated_price ?? 0)
  const depositAmount = Number(order.deposit_amount ?? 0)
  const subtotal = Number(order.subtotal ?? totalPrice)
  const discountAmount = Number(order.discount_amount ?? 0)
  const createdAt = order.created_at || new Date().toISOString()
  const expectedDelivery = new Date(createdAt)
  expectedDelivery.setUTCDate(expectedDelivery.getUTCDate() + 30)
  const remainingBalance = Math.max(0, totalPrice - depositAmount)

  return {
    schemaVersion: 'FASTLANE_CONTRACT_SNAPSHOT_V1',
    workflowVersion: CONTRACT_WORKFLOW_VERSION,
    documentType: CAR_SALES_DOCUMENT_TYPE,
    documentVersion: CAR_SALES_DOCUMENT_VERSION,
    consentVersion: CAR_SALES_CONSENT_VERSION,
    title: 'HỢP ĐỒNG MUA BÁN XE Ô TÔ',
    contractNumber: `${order.order_number || 'UNKNOWN'}/HĐMB`,
    orderNumber: order.order_number,
    createdAt,
    expectedDeliveryDate: date(expectedDelivery),
    customerName: order.full_name,
    customerIdCard: order.id_card_number,
    customerEmail: order.email,
    customerPhone: order.phone_number,
    province: order.province,
    ward: order.ward,
    showroom: order.showroom,
    carModel: order.car_model,
    carVariant: order.car_variant,
    carColor: order.exterior_color,
    subtotal,
    discountAmount,
    promotionCode: order.promotion_code,
    totalPrice,
    depositAmount,
    remainingBalance,
    seller: {
      legalName: 'CÔNG TY TNHH KINH DOANH THƯƠNG MẠI VÀ DỊCH VỤ VINFAST',
      address: 'KCN Đình Vũ, Cát Hải, Hải Phòng, Việt Nam',
      businessRegistrationNumber: '0108926276',
      representative: 'Theo ủy quyền',
      representativeTitle: 'Giám đốc Kinh doanh',
      signatureName: 'CÔNG TY VINFAST',
    },
    legal: {
      introduction: 'Ngày giao kết Hợp đồng được ghi nhận trong hồ sơ điện tử:',
      vehicleDescription: 'Xe mới 100%, theo tiêu chuẩn của Nhà sản xuất.',
      priceTaxNote: 'Giá trị Hợp đồng đã bao gồm thuế tiêu thụ đặc biệt, thuế giá trị gia tăng, nhưng không bao gồm lệ phí trước bạ, chi phí đăng ký, lưu hành, bảo hiểm xe và các chi phí khác.',
      discountNote: discountAmount > 0
        ? `Giá trước ưu đãi: ${money(subtotal)}; mã ưu đãi ${order.promotion_code || '[●]'} giảm ${money(discountAmount)}. Giá trị sau ưu đãi được dùng làm giá trị Hợp đồng nêu trên.`
        : null,
      payment: {
        heading: 'Điều 2. Thanh toán và điều kiện áp dụng',
        paragraphsBeforeBullets: [
          `Khách Hàng đã thanh toán tiền đặt cọc số tiền ${money(depositAmount)}. Khoản tiền này được chuyển thành khoản thanh toán trước theo Hợp đồng.`,
          `Khoản tiền còn lại cần thanh toán là ${money(remainingBalance)}. Số tiền này được thanh toán như sau:`,
        ],
        bullets: [
          'Nếu trả thẳng: Khách Hàng thanh toán số tiền còn lại cho Bên Bán trong vòng 07 ngày làm việc kể từ ngày Bên Bán thông báo xe sẵn sàng để giao.',
          'Nếu trả góp: Khách Hàng thanh toán vốn tự có và gửi Thông báo tín dụng của Ngân hàng cho số tiền còn lại. Số tiền còn lại sẽ do Ngân hàng giải ngân trong vòng 05 ngày làm việc kể từ ngày Bên Bán và Khách Hàng bàn giao giấy hẹn trả kết quả đăng ký xe cho Ngân hàng. Nếu Ngân hàng không giải ngân, Khách Hàng phải tự thanh toán cho Bên Bán trong vòng 10 ngày làm việc kể từ ngày Bên Bán yêu cầu.',
        ],
        paragraphsAfterBullets: [
          'Nếu Khách Hàng không thanh toán đúng hạn, Bên Bán có quyền chỉ định bên thứ ba xử lý xe để thu hồi khoản nợ. Số tiền thu được được ưu tiên thanh toán cho Hợp đồng này. Khách Hàng chịu mọi chi phí xử lý xe và thù lao ủy quyền bằng 10% giá trị xe tại thời điểm xử lý.',
          'Khách Hàng chậm thanh toán sẽ phải trả lãi suất quá hạn 15%/năm tương ứng với số tiền và số ngày chậm trả.',
          'Phương thức thanh toán: chuyển khoản, tiền mặt (không áp dụng với mua hàng trực tuyến), hoặc thẻ ngân hàng (chỉ áp dụng cho Đợt 1 tại Đại lý phân phối nếu có). Phí giao dịch thẻ do Bên Bán chịu.',
        ],
      },
      delivery: {
        heading: 'Điều 3. Giao nhận xe',
        paragraphs: [
          `Thời gian giao nhận xe dự kiến: ngày ${date(expectedDelivery)} tại ${order.showroom || 'Showroom VinFast'}, hoặc theo thông báo của Bên Bán trước 07 ngày làm việc đối với mua hàng qua kênh trực tuyến. Nếu chậm nhận xe, Khách Hàng phải thanh toán chi phí lưu giữ xe theo đơn giá Bên Bán thông báo.`,
          'Bên Bán sẽ cung cấp đầy đủ hóa đơn, chứng từ hợp lệ cho Khách Hàng. Nếu Khách Hàng thanh toán trả thẳng, Bên Bán sẽ giao xe cùng với hóa đơn và đầy đủ giấy tờ cho Khách Hàng sau khi nhận đủ 100% Giá trị Hợp đồng.',
          'Trừ trường hợp Hợp đồng này có quy định khác, quyền sở hữu, rủi ro đối với xe được chuyển sang Khách Hàng khi xe được bàn giao cho Khách Hàng hoặc người đại diện hợp pháp của Khách Hàng.',
        ],
      },
      warranty: {
        heading: 'Điều 4. Bảo hành',
        paragraphs: [
          'Việc bảo hành được thực hiện tại các Trung tâm dịch vụ sửa chữa xe điện VinFast, theo quy định tại sổ bảo hành do Bên Bán cung cấp.',
        ],
      },
      otherTerms: {
        heading: 'Điều 5. Điều khoản khác',
        paragraphs: [
          'Xe chỉ hoạt động tốt khi được sử dụng với pin và thiết bị sạc chính hãng và được sử dụng đúng theo hướng dẫn sử dụng và sổ bảo hành được cung cấp và/hoặc đăng tải trên Website. Bên Bán/Nhà sản xuất không chịu trách nhiệm với thiệt hại phát sinh do sử dụng không đúng hướng dẫn.',
          'Khách Hàng cần duy trì eSIM (nếu được tích hợp sẵn trên xe) để sử dụng các tính năng thông minh. Mọi thông tin tham khảo tại E-brochure trên Website hoặc Ứng dụng VinFast.',
          'Các thông báo của Bên Bán phải bằng văn bản, email, Ứng dụng VinFast, cuộc gọi hoặc tin nhắn.',
          'Để thực hiện Hợp đồng này và tuân thủ pháp luật hiện hành, Bên Bán sẽ xử lý dữ liệu cá nhân của Khách Hàng theo Chính sách Bảo vệ Dữ liệu Cá nhân được công bố tại Website và Ứng dụng VinFast.',
          'Bên Bán được chấm dứt Hợp đồng nếu Khách Hàng vi phạm nghĩa vụ mà không khắc phục hoặc không thể khắc phục toàn bộ trong 10 ngày kể từ ngày đến hạn hoặc được thông báo, và Khách Hàng sẽ không được nhận lại khoản tiền thanh toán trước. Trường hợp Hợp đồng chấm dứt không do lỗi của Khách Hàng, Bên Bán phải báo trước cho Khách Hàng ít nhất 07 ngày, trừ trường hợp pháp luật có quy định khác, và phải trả lại toàn bộ khoản tiền thanh toán trước cho Khách Hàng.',
          'Bằng việc giao kết Hợp đồng này, Khách Hàng đồng ý rằng Bên Bán có thể chuyển giao Hợp đồng cho công ty con, công ty liên kết hoặc bên thứ ba khác sau khi thông báo bằng văn bản ít nhất 05 ngày làm việc trước ngày chuyển giao.',
          'Nếu xảy ra sự kiện bất khả kháng, các Bên xử lý theo quy định của pháp luật.',
          'Nếu không thương lượng được, các tranh chấp về Hợp đồng sẽ được giải quyết tại tòa án có thẩm quyền.',
        ],
      },
      consentText: 'Tôi đã đọc, hiểu và đồng ý toàn bộ nội dung Hợp đồng mua bán xe ô tô.',
      consentLegalNotice: 'Thao tác xác nhận được ghi nhận cùng phiên bản nội dung, thời gian và bằng chứng điện tử của giao dịch.',
    },
  }
}

/**
 * Motorbike purchase terms share the immutable commercial projection used by
 * the viewer, but deliberately rebuild every legal clause. Battery choices are
 * order configuration/price inputs and do not create a battery contract here.
 */
export function createMotorbikeSalesContractSnapshot(order: ContractOrderSource) {
  const carCommercialSnapshot = createCarSalesContractSnapshot(order)
  const { legal: _carLegal, ...commercialSnapshot } = carCommercialSnapshot
  const discountAmount = Number(order.discount_amount ?? 0)

  return {
    ...commercialSnapshot,
    documentType: MOTORBIKE_SALES_DOCUMENT_TYPE,
    documentVersion: MOTORBIKE_SALES_DOCUMENT_VERSION,
    consentVersion: MOTORBIKE_SALES_CONSENT_VERSION,
    title: 'THỎA THUẬN ĐẶT MUA XE MÁY ĐIỆN VINFAST',
    contractNumber: `${order.order_number || 'UNKNOWN'}/TĐM`,
    legal: {
      introduction: 'Ngày xác nhận Thỏa thuận được ghi nhận trong hồ sơ điện tử:',
      vehicleDescription: 'Xe máy điện mới 100%, theo cấu hình được ghi nhận trong đơn đặt mua.',
      priceTaxNote: 'Giá trị đặt mua đã bao gồm VAT theo cấu hình đơn hàng; không bao gồm lệ phí đăng ký, biển số, bảo hiểm và các chi phí phát sinh khác, trừ khi đơn hàng ghi rõ.',
      discountNote: discountAmount > 0
        ? `Giá trước ưu đãi: ${money(commercialSnapshot.subtotal)}; mã ưu đãi ${order.promotion_code || '[●]'} giảm ${money(discountAmount)}. Giá trị sau ưu đãi được dùng làm giá trị đặt mua nêu trên.`
        : null,
      payment: {
        heading: 'Điều 2. Thanh toán và điều kiện áp dụng',
        paragraphsBeforeBullets: [
          `Khách Hàng đã thanh toán tiền đặt cọc số tiền ${money(commercialSnapshot.depositAmount)}. Khoản tiền này được khấu trừ vào giá trị đặt mua khi giao xe.`,
          `Khoản tiền dự kiến còn lại là ${money(commercialSnapshot.remainingBalance)} và được thanh toán trực tiếp theo hướng dẫn chính thức của Bên Bán.`,
        ],
        bullets: [
          'FastLane chỉ thu tiền đặt cọc trên website và không cung cấp chức năng thanh toán toàn bộ giá trị xe.',
          'Thời điểm, phương thức và chứng từ thanh toán phần còn lại do Bên Bán xác nhận với Khách Hàng trước khi bàn giao xe.',
        ],
        paragraphsAfterBullets: [
          'Cấu hình pin thể hiện trên đơn đặt mua chỉ là thành phần cấu hình và giá của xe.',
        ],
      },
      delivery: {
        heading: 'Điều 3. Giao nhận xe',
        paragraphs: [
          `Thời gian giao xe dự kiến: ngày ${commercialSnapshot.expectedDeliveryDate} tại ${order.showroom || 'Showroom VinFast'}, hoặc theo lịch được Bên Bán và Khách Hàng xác nhận lại.`,
          'Bên Bán bàn giao xe, hóa đơn và chứng từ hợp lệ sau khi các nghĩa vụ thanh toán áp dụng cho đơn đặt mua đã hoàn tất.',
          'Quyền sở hữu và rủi ro đối với xe được chuyển sang Khách Hàng khi xe được bàn giao cho Khách Hàng hoặc người đại diện hợp pháp của Khách Hàng.',
        ],
      },
      warranty: {
        heading: 'Điều 4. Bảo hành',
        paragraphs: [
          'Việc bảo hành xe máy điện được thực hiện theo chính sách bảo hành hiện hành của Nhà sản xuất tại hệ thống dịch vụ được ủy quyền.',
        ],
      },
      otherTerms: {
        heading: 'Điều 5. Điều khoản khác',
        paragraphs: [
          'Khách Hàng sử dụng xe, pin, bộ sạc và phụ kiện theo hướng dẫn của Nhà sản xuất để bảo đảm an toàn và điều kiện bảo hành.',
          'Các thông báo liên quan đến đơn đặt mua được gửi bằng văn bản, email, ứng dụng, cuộc gọi hoặc tin nhắn theo thông tin Khách Hàng đã cung cấp.',
          'Bên Bán xử lý dữ liệu cá nhân của Khách Hàng để thực hiện giao dịch và tuân thủ pháp luật theo chính sách bảo vệ dữ liệu cá nhân được công bố.',
          'Nếu xảy ra sự kiện bất khả kháng, các Bên phối hợp xử lý theo quy định của pháp luật.',
          'Tranh chấp phát sinh trước hết được giải quyết bằng thương lượng; nếu không đạt kết quả, tranh chấp được giải quyết tại cơ quan có thẩm quyền.',
        ],
      },
      consentText: 'Tôi đã đọc, hiểu và đồng ý toàn bộ nội dung Thỏa thuận đặt mua xe máy điện VinFast.',
      consentLegalNotice: 'Thao tác xác nhận được ghi nhận cùng phiên bản nội dung, thời gian và bằng chứng điện tử của giao dịch.',
    },
  }
}

/** Stable JSON serialization used as the FASTLANE_JSON_V1 hash contract. */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Contract snapshot contains a non-finite number.')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJsonStringify).join(',')}]`
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJsonStringify(entryValue)}`).join(',')}}`
  }
  throw new TypeError(`Unsupported contract snapshot value: ${typeof value}`)
}

export type CarSalesContractSnapshot = ReturnType<typeof createCarSalesContractSnapshot>
