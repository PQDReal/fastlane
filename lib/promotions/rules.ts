import type {
  PromotionRule,
  PromotionRuleContext,
  PromotionRuleViolation,
} from '@/lib/promotions/engine'

function violation(
  code: PromotionRuleViolation['code'],
  message: string,
  meta?: PromotionRuleViolation['meta'],
): PromotionRuleViolation {
  return { code, message, ...(meta ? { meta } : {}) }
}

export const cartNotEmptyRule: PromotionRule = {
  name: 'cart-not-empty',
  evaluate(context) {
    return context.lines.length === 0
      ? violation('CART_EMPTY', 'Giỏ hàng không có sản phẩm để áp dụng khuyến mãi.')
      : null
  },
}

export const activePromotionRule: PromotionRule = {
  name: 'promotion-active',
  evaluate(context) {
    return context.promotion.isActive
      ? null
      : violation('PROMOTION_INACTIVE', 'Khuyến mãi đã ngừng áp dụng.')
  },
}

export const promotionTimeWindowRule: PromotionRule = {
  name: 'promotion-time-window',
  evaluate(context) {
    if (context.now < context.startsAt) {
      return violation(
        'PROMOTION_NOT_STARTED',
        'Khuyến mãi chưa đến thời gian áp dụng.',
        { startsAt: context.startsAt },
      )
    }
    if (context.endsAt !== null && context.now >= context.endsAt) {
      return violation(
        'PROMOTION_EXPIRED',
        'Khuyến mãi đã hết hạn.',
        { endsAt: context.endsAt },
      )
    }
    return null
  },
}

export const promotionUsageRule: PromotionRule = {
  name: 'promotion-usage-limit',
  evaluate(context) {
    const { usageLimit, usedCount } = context.promotion
    return usageLimit !== null && usedCount >= usageLimit
      ? violation(
          'PROMOTION_USAGE_LIMIT_REACHED',
          'Khuyến mãi đã hết lượt sử dụng.',
          { usageLimit, usedCount },
        )
      : null
  },
}

export const applicableProductRule: PromotionRule = {
  name: 'promotion-applicable-product',
  evaluate(context) {
    return context.eligibleSubtotal > 0
      ? null
      : violation(
          'PROMOTION_PRODUCT_NOT_APPLICABLE',
          'Khuyến mãi không áp dụng cho sản phẩm trong giỏ hàng.',
        )
  },
}

export const minimumOrderRule: PromotionRule = {
  name: 'promotion-minimum-order',
  evaluate(context) {
    const minimum = context.promotion.minimumOrderAmount
    return context.eligibleSubtotal >= minimum
      ? null
      : violation(
          'PROMOTION_MINIMUM_NOT_MET',
          'Giỏ hàng chưa đạt giá trị tối thiểu để áp dụng khuyến mãi.',
          {
            eligibleSubtotal: context.eligibleSubtotal,
            minimumOrderAmount: minimum,
          },
        )
  },
}

export const defaultPromotionRules: readonly PromotionRule[] = Object.freeze([
  cartNotEmptyRule,
  activePromotionRule,
  promotionTimeWindowRule,
  promotionUsageRule,
  applicableProductRule,
  minimumOrderRule,
])
