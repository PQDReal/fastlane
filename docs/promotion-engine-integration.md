# Tích hợp Promotion Rule Engine vào cart/checkout

## Trạng thái

`lib/promotions/engine.ts` là domain engine thuần. Luồng báo giá đặt cọc đã gọi
engine qua `quoteProductPromotion()`; luồng phụ kiện cũ vẫn giữ adapter riêng
cho đến khi người phụ trách checkout chuyển đổi.

Engine:

- không đọc Supabase;
- không đọc Auth0/session;
- không gọi API;
- không thay đổi promotion, cart hoặc inventory;
- nhận input và trả kết quả xác định theo cùng input và `now`.

## Contract đầu vào

```ts
import {
  evaluatePromotion,
  type PromotionCartLine,
  type PromotionDefinition,
} from '@/lib/promotions/engine'
```

### Promotion

Chuyển record `promotions` thành `PromotionDefinition`:

```ts
const definition: PromotionDefinition = {
  id: row.id,
  code: row.code,
  type: row.type, // PERCENT | FIXED
  value: Number(row.value),
  applicableProductTypes: row.applicable_product_types,
  maxDiscountAmount:
    row.max_discount_amount === null
      ? null
      : Number(row.max_discount_amount),
  minimumOrderAmount: Number(row.minimum_order_amount),
  usageLimit: row.usage_limit,
  usedCount: row.used_count,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  isActive: row.is_active,
}
```

Nếu database cũ chỉ có `applicable_product_type`, dùng
`productTypesFromLegacy()` trước khi gọi engine.

### Cart lines

Checkout phải tính `lineTotal` từ giá authoritative phía server, bao gồm giá
variant, option và số lượng. Không dùng subtotal/discount do client gửi lên.

```ts
const lines: PromotionCartLine[] = selectedItems.map((item) => ({
  id: item.id,
  productType: item.productType, // CAR | BIKE | ACCESSORY
  lineTotal: Number(item.lineTotal),
}))
```

Mọi giá trị tiền truyền vào engine là số nguyên VND không âm và nằm trong
`Number.MAX_SAFE_INTEGER`.

## Gọi engine

Luôn truyền cùng một mốc `now` do server sở hữu cho toàn bộ lần định giá:

```ts
const pricedAt = new Date()
const evaluation = evaluatePromotion(definition, lines, { now: pricedAt })

if (!evaluation.applicable) {
  const primaryViolation = evaluation.violations[0]
  // Chuyển primaryViolation.code thành ApiRouteError phù hợp.
}

const pricing = {
  subtotal: evaluation.subtotal,
  discountTotal: evaluation.discountAmount,
  grandTotal: evaluation.grandTotal,
  pricedAt: pricedAt.toISOString(),
}
```

Kết quả gồm:

- `subtotal`: tổng toàn bộ line;
- `eligibleSubtotal`: tổng các line thuộc loại sản phẩm promotion hỗ trợ;
- `discountAmount`: số tiền giảm, không vượt eligible subtotal;
- `grandTotal`: subtotal trừ discount;
- `violations`: các rule không đạt.

Minimum order và discount được tính trên `eligibleSubtotal`. Vì vậy promotion
chỉ dành cho phụ kiện không giảm giá phần xe trong mixed cart.

## Rule mặc định

Engine chạy các rule sau:

1. Cart không rỗng.
2. Promotion đang active.
3. `now >= startsAt`.
4. `endsAt` là null hoặc `now < endsAt`.
5. Usage limit chưa hết.
6. Cart có ít nhất một line thuộc loại sản phẩm được áp dụng.
7. Eligible subtotal đạt minimum order.

Mốc kết thúc là exclusive: promotion hết hiệu lực đúng tại `endsAt`.

Sau khi rule đạt:

- `PERCENT`: làm tròn half-up đến một VND bằng `Math.round`;
- `FIXED`: dùng số tiền cố định;
- áp `maxDiscountAmount` nếu có;
- clamp discount trong khoảng từ 0 đến eligible subtotal.

Có thể thêm rule thuần mà không sửa engine:

```ts
const customerSegmentRule: PromotionRule = {
  name: 'customer-segment',
  evaluate(context) {
    return eligibleCustomer
      ? null
      : {
          code: 'PROMOTION_INACTIVE',
          message: 'Khuyến mãi không áp dụng cho nhóm khách hàng này.',
        }
  },
}

const engine = createPromotionRuleEngine([
  ...defaultPromotionRules,
  customerSegmentRule,
])
```

Khi bổ sung rule nghiệp vụ mới, nên mở rộng `PromotionRuleCode` bằng mã riêng
thay vì dùng lại mã trong ví dụ.

## Mapping lỗi đề xuất

| Engine code | API code đề xuất | HTTP |
| --- | --- | --- |
| `CART_EMPTY` | `CART_EMPTY` | 422 |
| `PROMOTION_INACTIVE` | `PROMOTION_INACTIVE` | 422 |
| `PROMOTION_NOT_STARTED` | `PROMOTION_NOT_STARTED` | 422 |
| `PROMOTION_EXPIRED` | `PROMOTION_EXPIRED` | 422 |
| `PROMOTION_USAGE_LIMIT_REACHED` | `PROMOTION_USAGE_LIMIT_REACHED` | 422 |
| `PROMOTION_PRODUCT_NOT_APPLICABLE` | `PROMOTION_INVALID` | 422 |
| `PROMOTION_MINIMUM_NOT_MET` | `PROMOTION_MINIMUM_NOT_MET` | 422 |
| `PROMOTION_NO_DISCOUNT` | `PROMOTION_INVALID` | 422 |

`PromotionEngineInputError` biểu thị dữ liệu server/config không hợp lệ. Không
hiển thị nguyên văn lỗi này cho khách; log request ID và trả lỗi server hoặc lỗi
validation phù hợp.

## Điểm nối vào hệ thống

### Quote tại cart

Trong `lib/promotions/quote.ts`:

1. Đọc cart của user hiện tại.
2. Chỉ lấy những cart item ID được chọn.
3. Đọc promotion theo code.
4. Map record/cart sang contract engine.
5. Gọi engine.
6. Chuyển violation thành `ApiRouteError`.
7. Trả quote; không tăng `used_count`.

### Revalidation tại checkout

Checkout không được tin quote cũ. Trong transaction tạo order:

1. Lock/re-read cart, catalog price, inventory và promotion.
2. Dùng cùng `transactionNow` để chạy engine lại.
3. So sánh total authoritative với total khách đã xác nhận.
4. Tăng usage/ghi promotion usage một cách atomic.
5. Tạo order và lưu snapshot code/type/value/discount.
6. Rollback toàn bộ nếu inventory, promotion usage hoặc order creation lỗi.

Engine chỉ quyết định eligibility và số tiền giảm. Engine không chịu trách nhiệm
lock row, consume quota, idempotency hoặc transaction.

### Luồng đặt cọc xe hiện tại

- `POST /api/deposit/quote` xác thực mẫu xe, phiên bản, màu, package và chạy
  promotion engine. Endpoint này không consume quota.
- `POST /api/deposit` định giá lại toàn bộ phía server, không nhận giá hay
  discount từ browser.
- Đơn đặt cọc lưu `subtotal`, `discount_amount`, `promotion_id`; cột
  `promotion_code` được giữ làm snapshot mã tại thời điểm đặt cọc. Migration
  `038_atomic_deposit_promotion.sql` cài trigger
  `deposit_orders_consume_promotion` để
  lock promotion, kiểm tra lại cửa sổ hiệu lực/quota, tăng `used_count` trong
  cùng transaction với insert đơn.
- `request_hash` ngăn cùng một `Idempotency-Key` bị dùng lại với nội dung khác.
- API trả `createdAt` với offset `+07:00`; PostgreSQL vẫn lưu `timestamptz`
  theo instant chuẩn, không cộng thêm bảy giờ vào dữ liệu gốc.

Showroom vẫn là snapshot hiện tại và payment method mới chỉ là lựa chọn cho
đơn `PENDING_PAYMENT`. Migration/API này không tạo showroom schema và không
gọi payment gateway, để hai phần đó có thể được tích hợp độc lập sau.

### Soft-delete Admin Promotion

`DELETE /api/v1/admin/promotions/{promotionId}` đặt:

```sql
is_active = false
```

Record không bị xóa nên order snapshot và audit history vẫn còn. Quote/checkout
phải re-read record và rule `PROMOTION_INACTIVE` sẽ từ chối promotion đã
deactivate.

## Checklist cho người tích hợp checkout

- [ ] Không nhận discount/subtotal authoritative từ client.
- [ ] Map tiền thành số nguyên VND an toàn.
- [ ] Truyền một mốc `now` duy nhất cho mỗi lần pricing.
- [ ] Quote không consume usage.
- [ ] Checkout chạy engine lại trong transaction.
- [ ] Usage limit được consume atomic và idempotent.
- [ ] Lưu promotion snapshot vào order.
- [ ] Không sửa order cũ khi promotion bị edit/soft-delete.
- [ ] Test price changed, cart changed, expired và exhausted trong checkout.
- [ ] Chạy `npm test`, `npm run typecheck`, `npm run check:openapi` và build.
