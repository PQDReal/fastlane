const SHOP_LIBRARY =
  'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/'
const SHOP_MASTER =
  'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw2f846374/images/'

export const BIKE_LISTING_IMAGES: Record<string, string> = {
  amio: 'https://i.postimg.cc/Hs9T68jB/Amio.png',
  'amio-s': 'https://i.postimg.cc/RFn2YhQG/Amio-S.png',
  'amio-s2': 'https://i.postimg.cc/FzQQZhvr/Amio-S2.png',
  evo: 'https://i.postimg.cc/9XG2fwPH/Evo.png',
  'evo-grand': 'https://i.postimg.cc/XJShMxzy/Evo-Grand.png',
  'evo-grand-lite': 'https://i.postimg.cc/NjKP5Wh8/Evo-Grand-Lite.png',
  'evo-lite': 'https://i.postimg.cc/MK587krr/Evo-Lite.png',
  'evo-lite-neo': 'https://i.postimg.cc/5thc4f6S/Evo-Lite-Neo.png',
  'evo-neo': 'https://i.postimg.cc/fb0Fg152/Evo-Neo.png',
  'feliz-2025': 'https://i.postimg.cc/MGRPYVpJ/Feliz-2025.png',
  'feliz-ii': 'https://i.postimg.cc/nzJdSrXY/Feliz-II.png',
  flazz: 'https://i.postimg.cc/W3w5BVr3/Flazz.png',
  'flazz-max': 'https://i.postimg.cc/QNS6SXhf/Flazz-Max.png',
  'vero-x': 'https://i.postimg.cc/5twgzJsv/Vero-X.png',
  viper: 'https://i.postimg.cc/HsVt2XSg/Viper.png',
  zgoo: 'https://i.postimg.cc/kgSvr93v/ZGoo.png',
}

const BIKE_HERO_IMAGES: Record<string, string> = {
  amio: 'https://static-cms-prod.vinfastauto.com/pdp/amio/amio-fullview.webp',
  'evo-grand': `${SHOP_LIBRARY}dw997effec/landingpage/lp-xmd/evo-grand/hero.webp`,
  'evo-grand-lite': `${SHOP_LIBRARY}dw1cb815c5/landingpage/lp-xmd/evo-grand-lite/hero.webp`,
  'evo-lite': `${SHOP_LIBRARY}dw54db00e4/landingpage/lp-xmd/img-sale-evolite.webp`,
  'evo-lite-neo': `${SHOP_LIBRARY}dw315440cf/images/PDP-XMD/evoliteneo/img-banner-info-sp.webp`,
  'feliz-2025': `${SHOP_LIBRARY}dwd78a9097/images/PDP-XMD/feliz/2025/img-top-feliz-light-green.webp`,
  flazz: `${SHOP_LIBRARY}dwdc2a54bc/images/PDP-XMD/flazz/img-banner-info.webp`,
  'vero-x': `${SHOP_LIBRARY}dw90ac0a73/images/PDP-XMD/verox/img-top-verox-green.webp`,
  zgoo: `${SHOP_LIBRARY}dwa628ce34/images/PDP-XMD/zgoo/img-zgoo-green.webp`,
}

const BIKE_DETAIL_IMAGES: Record<string, string[]> = {
  amio: [
    'https://static-cms-prod.vinfastauto.com/pdp/amio/feature-0.webp',
    'https://static-cms-prod.vinfastauto.com/pdp/amio/feature-3.webp',
    'https://static-cms-prod.vinfastauto.com/pdp/amio/feature-4.webp',
  ],
  'amio-s': [
    'https://vinfastauto.com/themes/porto/img/pdp-page/amio-s/feature-1.webp',
    'https://vinfastauto.com/themes/porto/img/pdp-page/amio-s/feature-2.webp',
    'https://vinfastauto.com/themes/porto/img/pdp-page/amio-s/feature-3.webp',
  ],
  'amio-s2': [
    'https://static-cms-prod.vinfastauto.com/amio-s2-ngoaithat-p1.png',
    'https://static-cms-prod.vinfastauto.com/amio-s2-ngoaithat-p2.png',
    'https://static-cms-prod.vinfastauto.com/amio-s2-ngoaithat-p3.png',
  ],
  evo: [
    'https://vinfastauto.com/themes/porto/img/pdp-page/evo/img-part.webp',
    'https://vinfastauto.com/themes/porto/img/pdp-page/evo/img-part-1.webp',
    'https://vinfastauto.com/themes/porto/img/pdp-page/evo/img-part-2.webp',
  ],
  'evo-neo': [
    `${SHOP_LIBRARY}images/PDP-XMD/evoneo/img-part-01.webp`,
    `${SHOP_LIBRARY}images/PDP-XMD/evoneo/img-part-02.webp`,
    `${SHOP_LIBRARY}images/PDP-XMD/evoneo/img-part-03.webp`,
  ],
  'evo-grand': [
    `${SHOP_LIBRARY}dwd763e9fe/landingpage/lp-xmd/evo-grand/spec-1.webp`,
    `${SHOP_LIBRARY}dw8452aa12/landingpage/lp-xmd/evo-grand/spec-2.webp`,
    `${SHOP_LIBRARY}dwb3a81469/landingpage/lp-xmd/evo-grand/spec-3.webp`,
  ],
  'evo-grand-lite': [
    `${SHOP_LIBRARY}dw27227dbc/landingpage/lp-xmd/evo-grand-lite/spec-1.webp`,
    `${SHOP_LIBRARY}dw733fbf0c/landingpage/lp-xmd/evo-grand-lite/spec-2.webp`,
    `${SHOP_LIBRARY}dwa8551436/landingpage/lp-xmd/evo-grand-lite/spec-3.webp`,
  ],
  'evo-lite': [
    `${SHOP_LIBRARY}dw3400df9b/landingpage/lp-xmd/img-sale-evolite-01.webp`,
    `${SHOP_LIBRARY}dw6358353f/landingpage/lp-xmd/img-sale-evolite-02.webp`,
    `${SHOP_LIBRARY}dw6855710d/landingpage/lp-xmd/img-sale-evolite-03.webp`,
  ],
  'evo-lite-neo': [
    `${SHOP_LIBRARY}dw4af425ea/images/PDP-XMD/evoliteneo/img-part-01.webp`,
    `${SHOP_LIBRARY}dw3ce0ce72/images/PDP-XMD/evoliteneo/img-part-02.webp`,
    `${SHOP_LIBRARY}dwb20f683e/images/PDP-XMD/evoliteneo/img-part-03.webp`,
  ],
  'feliz-2025': [
    `${SHOP_LIBRARY}dwb0f6b3c3/images/PDP-XMD/feliz/2025/img-part-01.webp`,
    `${SHOP_LIBRARY}dw96609ef2/images/PDP-XMD/feliz/2025/img-part-02.webp`,
    `${SHOP_LIBRARY}dwae438f74/images/PDP-XMD/feliz/2025/img-part-03.webp`,
  ],
  'feliz-ii': [
    'https://vinfastauto.com/themes/porto/img/pdp-page/feliz-ii/feature-1.webp',
    'https://vinfastauto.com/themes/porto/img/pdp-page/feliz-ii/feature-2.webp',
    'https://vinfastauto.com/themes/porto/img/pdp-page/feliz-ii/feature-3.webp',
  ],
  flazz: [
    `${SHOP_LIBRARY}dw4649b914/images/PDP-XMD/flazz/img-part-1.webp`,
    `${SHOP_LIBRARY}dw9c61f4c8/images/PDP-XMD/flazz/img-part-2.webp`,
    `${SHOP_LIBRARY}dwc3252fa8/images/PDP-XMD/flazz/img-part-3.webp`,
  ],
  'flazz-max': [
    'https://vinfastauto.com/themes/porto/img/pdp-page/flazz-max/feature-1.webp',
    'https://vinfastauto.com/themes/porto/img/pdp-page/flazz-max/feature-2.webp',
    'https://vinfastauto.com/themes/porto/img/pdp-page/flazz-max/feature-3.webp',
  ],
  kinet: [
    'https://static-cms-prod.vinfastauto.com/vinfast-kinet-mau-xam-den-sau.webp',
    'https://static-cms-prod.vinfastauto.com/vinfast-kinet-mau-xam-den-cop.webp',
    'https://static-cms-prod.vinfastauto.com/vinfast-kinet-mau-xam-den-banh.webp',
  ],
  kyo: [
    'https://static-cms-prod.vinfastauto.com/vinfast-kyo-mau-nau-sau.webp',
    'https://static-cms-prod.vinfastauto.com/vinfast-kyo-mau-nau-cop.webp',
    'https://static-cms-prod.vinfastauto.com/vinfast-kyo-mau-nau-san.webp',
  ],
  'vero-x': [
    `${SHOP_LIBRARY}dw1db03b3a/images/PDP-XMD/verox/img-part-1.webp`,
    `${SHOP_LIBRARY}dw4deafce9/images/PDP-XMD/verox/img-part-2.webp`,
    `${SHOP_LIBRARY}dwe5b21171/images/PDP-XMD/verox/img-part-3.webp`,
  ],
  viper: [
    'https://vinfastauto.com/themes/porto/img/pdp-page/viper/front-view.webp',
    'https://vinfastauto.com/themes/porto/img/pdp-page/viper/trunk-view.webp',
    'https://vinfastauto.com/themes/porto/img/pdp-page/viper/footrest-view.webp',
  ],
  zgoo: [
    `${SHOP_LIBRARY}dw6a6d2472/images/PDP-XMD/zgoo/img-part-1.webp`,
    `${SHOP_LIBRARY}dwb4a07416/images/PDP-XMD/zgoo/img-part-2.webp`,
    `${SHOP_LIBRARY}dwc08f11c3/images/PDP-XMD/zgoo/img-part-3.webp`,
  ],
}

const BIKE_COLOR_IMAGES: Record<string, Record<string, string>> = {
  amio: {
    xam: 'https://static-cms-prod.vinfastauto.com/pdp/amio/amio-dark-mint.webp',
    'den nham': 'https://static-cms-prod.vinfastauto.com/pdp/amio/amio-black.webp',
    'do tuoi': 'https://static-cms-prod.vinfastauto.com/pdp/amio/amio-red.webp',
    'xanh reu': 'https://static-cms-prod.vinfastauto.com/pdp/amio/amio-mint.webp',
    'trang ngoc trai': 'https://static-cms-prod.vinfastauto.com/pdp/amio/amio-white.webp',
  },
  'amio-s': {
    xam: `${SHOP_MASTER}AMIO/GRC.png`,
    'den nham': `${SHOP_MASTER}AMIO/BAU.png`,
    'do tuoi': `${SHOP_MASTER}AMIO/REQ.png`,
    'xanh reu': 'https://vinfastauto.com/themes/porto/img/pdp-page/amio-s/amio-s-mint.webp',
    'trang ngoc trai': `${SHOP_MASTER}AMIO/WHR.png`,
  },
  'amio-s2': {
    xam: `${SHOP_MASTER}AMIO/GRC.png`,
    'den nham': `${SHOP_MASTER}AMIO/BAU.png`,
    'do tuoi': `${SHOP_MASTER}AMIO/REQ.png`,
    'xanh reu': 'https://static-cms-prod.vinfastauto.com/amio-s2-herobanner-xanh.png',
    'trang ngoc trai': `${SHOP_MASTER}AMIO/WHR.png`,
  },
  evo: {
    'xanh oliu': `${SHOP_MASTER}EVO/GNV.png`,
    'do tuoi': `${SHOP_MASTER}EVO/REQ.png`,
    'den nham': `${SHOP_MASTER}EVO/BAU.png`,
    'trang ngoc trai': `${SHOP_MASTER}EVO/WHR.png`,
  },
  'evo-lite': {
    'xanh oliu': `${SHOP_MASTER}EVO/GNV.png`,
    'do tuoi': `${SHOP_MASTER}EVO/REQ.png`,
    'den nham': `${SHOP_MASTER}EVO/BAU.png`,
    'trang ngoc trai': `${SHOP_MASTER}EVO/WHR.png`,
  },
  'evo-neo': {
    'do tuoi': `${SHOP_MASTER}EVONEO/REQ.png`,
    'trang ngoc trai': `${SHOP_MASTER}EVONEO/WHR.png`,
  },
  'evo-grand': {
    'trang ngoc trai': `${SHOP_MASTER}EVOGRAND/WHR.png`,
    'xanh oliu': `${SHOP_MASTER}EVOGRAND/GNV.png`,
    'do tuoi': `${SHOP_MASTER}EVOGRAND/REQ.png`,
    'vang cat': `${SHOP_MASTER}EVOGRAND/YES.png`,
  },
  'evo-grand-lite': {
    'trang ngoc trai': `${SHOP_LIBRARY}dw31cb705e/landingpage/lp-xmd/evo-grand-lite/color/1.webp`,
    vang: `${SHOP_LIBRARY}dwaddc75d3/landingpage/lp-xmd/evo-grand-lite/color/4.webp`,
  },
  'evo-lite-neo': {
    'do tuoi': `${SHOP_MASTER}EVONEO/REQ.png`,
    'trang ngoc trai': `${SHOP_MASTER}EVONEO/WHR.png`,
  },
  'feliz-2025': {
    'den bong': `${SHOP_LIBRARY}dwc8c0d3f5/images/PDP-XMD/feliz/2025/img-top-feliz-black.webp`,
    'vang cat': `${SHOP_LIBRARY}dw78959a27/images/PDP-XMD/feliz/2025/img-top-feliz-sand.webp`,
    'xanh oliu': `${SHOP_LIBRARY}dwb9888ace/images/PDP-XMD/feliz/2025/img-top-feliz-green.webp`,
    'trang ngoc trai': `${SHOP_LIBRARY}dwcfa58eb3/images/PDP-XMD/feliz/2025/img-top-feliz-white.webp`,
  },
  'feliz-ii': {
    'trang ngoc trai': `${SHOP_MASTER}FELIZ/WHR.png`,
    'den nham': `${SHOP_MASTER}FELIZ/BAU.png`,
  },
  flazz: {
    'den nham': `${SHOP_LIBRARY}dw962b3335/images/PDP-XMD/flazz/img-flazz-black.webp`,
    'do tuoi': `${SHOP_LIBRARY}dw29fad4c1/images/PDP-XMD/flazz/img-flazz-red.webp`,
    'xanh reu': `${SHOP_LIBRARY}dwaf3ef2ca/images/PDP-XMD/flazz/img-flazz-blue.webp`,
    'trang ngoc trai': `${SHOP_LIBRARY}dwbd6e7bfa/images/PDP-XMD/flazz/img-flazz-white.webp`,
  },
  'flazz-max': {
    'den nham': 'https://vinfastauto.com/themes/porto/img/pdp-page/flazz-max/flazz-max-black.webp',
    'do tuoi': 'https://vinfastauto.com/themes/porto/img/pdp-page/flazz-max/flazz-max-red.webp',
    'trang ngoc trai': 'https://vinfastauto.com/themes/porto/img/pdp-page/flazz-max/flazz-max-white.webp',
  },
  'vero-x': {
    'xanh reu': `${SHOP_LIBRARY}dwd220e20e/images/PDP-XMD/verox/img-top-verox-blue.webp`,
    'xanh oliu': `${SHOP_LIBRARY}dw90ac0a73/images/PDP-XMD/verox/img-top-verox-green.webp`,
    'den nham': `${SHOP_LIBRARY}dwbd62324c/images/PDP-XMD/verox/img-top-verox-black.webp`,
    'trang ngoc trai': `${SHOP_LIBRARY}dwc4efb443/images/PDP-XMD/verox/img-top-verox-white.webp`,
  },
  viper: {
    'den nham': `${SHOP_MASTER}VIPER/BAU.png`,
    'do tuoi': `${SHOP_MASTER}VIPER/REQ.png`,
    'xanh reu': `${SHOP_MASTER}VIPER/GRC.png`,
    'trang ngoc trai': `${SHOP_MASTER}VIPER/WHR.png`,
  },
}

export type BikeColorFallback = {
  colorName: string
  imageUrl: string
  swatchUrl: string
}

const BIKE_COLOR_FALLBACKS: Record<string, BikeColorFallback[]> = {
  flazz: [
    {
      colorName: 'Đỏ tươi',
      imageUrl: BIKE_COLOR_IMAGES.flazz['do tuoi'],
      swatchUrl: `${SHOP_LIBRARY}dw45bfc087/images/PDP-XMD/flazz/color/red.png`,
    },
    {
      colorName: 'Đen nhám',
      imageUrl: BIKE_COLOR_IMAGES.flazz['den nham'],
      swatchUrl: `${SHOP_LIBRARY}dwcee15d11/images/PDP-XMD/flazz/color/black.png`,
    },
    {
      colorName: 'Xanh rêu',
      imageUrl: BIKE_COLOR_IMAGES.flazz['xanh reu'],
      swatchUrl: `${SHOP_LIBRARY}dwa4335c6e/images/PDP-XMD/flazz/color/blue.png`,
    },
    {
      colorName: 'Trắng ngọc trai',
      imageUrl: BIKE_COLOR_IMAGES.flazz['trang ngoc trai'],
      swatchUrl: `${SHOP_LIBRARY}dwc8e83325/images/PDP-XMD/flazz/color/white.png`,
    },
  ],
  'vero-x': [
    {
      colorName: 'Xanh rêu',
      imageUrl: BIKE_COLOR_IMAGES['vero-x']['xanh reu'],
      swatchUrl: `${SHOP_LIBRARY}dwf7e16145/images/PDP-XMD/verox/green.png`,
    },
    {
      colorName: 'Xanh Oliu',
      imageUrl: BIKE_COLOR_IMAGES['vero-x']['xanh oliu'],
      swatchUrl: `${SHOP_LIBRARY}dw5c8f2353/images/PDP-XMD/verox/light-green.png`,
    },
    {
      colorName: 'Đen nhám',
      imageUrl: BIKE_COLOR_IMAGES['vero-x']['den nham'],
      swatchUrl: `${SHOP_LIBRARY}dw41160ba1/images/PDP-XMD/verox/black.png`,
    },
    {
      colorName: 'Trắng Ngọc Trai',
      imageUrl: BIKE_COLOR_IMAGES['vero-x']['trang ngoc trai'],
      swatchUrl: `${SHOP_LIBRARY}dw4bd6c6a1/images/PDP-XMD/verox/white.png`,
    },
  ],
}

export function getBikeColorFallbacks(
  slug: string,
): BikeColorFallback[] {
  return BIKE_COLOR_FALLBACKS[slug] ?? []
}

const IMAGE_EXTENSION = /\.(?:avif|gif|jpe?g|png|svg|webp)(?:\?.*)?$/i
const LEGACY_BROKEN_IMAGE =
  /^https:\/\/vinfastauto\.com\/themes\/porto\/img\/pdp-page\//i
const SMALL_SWATCH_IMAGE =
  /\/Sites-app_vinfast_vn-Library\/default\/[^/]+\/images\/XMD\/[^/]+\/[^/]+\.png(?:\?.*)?$/i
const DETAIL_IMAGE =
  /\/(?:feature|spec|img-part)[-_]?(?:0?[1-3])\.(?:avif|jpe?g|png|webp)(?:\?.*)?$/i
export function isRenderableBikeImage(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false
  const url = value.trim()
  if (LEGACY_BROKEN_IMAGE.test(url)) return false
  return url.startsWith('data:image/') || url.startsWith('/') || IMAGE_EXTENSION.test(url)
}

export function getBikeListingImage(
  slug: string,
  imageUrls: unknown,
  fallback: string,
): string {
  const configured = BIKE_LISTING_IMAGES[slug]
  if (configured) return configured

  if (Array.isArray(imageUrls)) {
    const first = imageUrls.find(isRenderableBikeImage)
    if (first) return first
  }

  return fallback
}

export function getBikeHeroImage(
  slug: string,
  bannerImages: unknown,
  listingImage: string,
): { src: string; contain: boolean } {
  const configured = BIKE_HERO_IMAGES[slug]
  if (configured) return { src: configured, contain: false }

  if (Array.isArray(bannerImages)) {
    const banner = bannerImages.find(isRenderableBikeImage)
    if (banner) {
      return {
        src: banner,
        contain: slug === 'kinet' || slug === 'kyo',
      }
    }
  }

  return { src: listingImage, contain: true }
}

export function getBikeDetailImages(
  slug: string,
  candidates: unknown[],
): string[] {
  const configured = BIKE_DETAIL_IMAGES[slug]
  if (configured) return configured

  return [...new Set(candidates.filter(isRenderableBikeImage))]
    .filter((url) => DETAIL_IMAGE.test(url))
    .slice(0, 3)
}
function normalizeColorName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function isBikeSwatchImage(value: string): boolean {
  return SMALL_SWATCH_IMAGE.test(value)
}

export function getBikeColorImage(
  slug: string,
  colorName: string,
  candidate: string,
): string | null {
  const normalizedColorName = normalizeColorName(colorName)
  const configured =
    BIKE_COLOR_IMAGES[slug]?.[normalizedColorName]
  if (configured) return configured

  if (!isRenderableBikeImage(candidate) || isBikeSwatchImage(candidate)) {
    return null
  }

  return candidate
}

