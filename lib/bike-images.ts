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
    'den bong': `${SHOP_LIBRARY}dw962b3335/images/PDP-XMD/flazz/img-flazz-black.webp`,
    'do tuoi': `${SHOP_LIBRARY}dw29fad4c1/images/PDP-XMD/flazz/img-flazz-red.webp`,
    'do tuoi den nham': `${SHOP_LIBRARY}dw29fad4c1/images/PDP-XMD/flazz/img-flazz-red.webp`,
    'xanh reu': `${SHOP_LIBRARY}dwaf3ef2ca/images/PDP-XMD/flazz/img-flazz-blue.webp`,
    'trang ngoc trai': `${SHOP_LIBRARY}dwbd6e7bfa/images/PDP-XMD/flazz/img-flazz-white.webp`,
  },
  'flazz-max': {
    den: `${SHOP_MASTER}FLAZZMAX/BAUVN.png`,
    xanh: `${SHOP_MASTER}FLAZZMAX/BUZVN.png`,
    'do den': `${SHOP_MASTER}FLAZZMAX/REQVN.png`,
    'trang cam': `${SHOP_MASTER}FLAZZMAX/WHRVN.png`,
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
  amio: [
    {
      colorName: 'Xám',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw6bfb1c9b/images/AMIO/GRC.png',
      swatchUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw309dec48/images/XMD/AMIO/GRC.png',
    },
    {
      colorName: 'Đen Bóng',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dwb65eff0f/images/AMIO/BAU.png',
      swatchUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dwfe4277ce/images/XMD/AMIO/BAU.png',
    },
    {
      colorName: 'Đỏ Tươi',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dwd571bd90/images/AMIO/REQ.png',
      swatchUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw6fe7c438/images/XMD/AMIO/REQ.png',
    },
    {
      colorName: 'Xanh Ngọc',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw09bbb441/images/AMIO/BUW.png',
      swatchUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw82c23602/images/XMD/AMIO/BUW.png',
    },
    {
      colorName: 'Trắng Ngọc Trai',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw4710981f/images/AMIO/WHR.png',
      swatchUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dweae83896/images/XMD/AMIO/WHR.png',
    },
  ],
  'amio-s': [
    {
      colorName: 'Trắng Ngọc Trai',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw30baeb3a')}AMIOS/WHR.png`,
      swatchUrl: `${SHOP_LIBRARY}dw96656368/images/XMD/AMIOS/WHR.png`,
    },
    {
      colorName: 'Đen Bóng',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dwd94fdb45')}AMIOS/BAU.png`,
      swatchUrl: `${SHOP_LIBRARY}dwc03b603c/images/XMD/AMIOS/BAU.png`,
    },
    {
      colorName: 'Xanh Ngọc',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw2968b7a5')}AMIOS/BUW.png`,
      swatchUrl: `${SHOP_LIBRARY}dw89643329/images/XMD/AMIOS/BUW.png`,
    },
    {
      colorName: 'Xám',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw456930a6')}AMIOS/GRC.png`,
      swatchUrl: `${SHOP_LIBRARY}dw34c29db9/images/XMD/AMIOS/GRC.png`,
    },
    {
      colorName: 'Đỏ Tươi',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw21a1da0f')}AMIOS/REQ.png`,
      swatchUrl: `${SHOP_LIBRARY}dw7f462880/images/XMD/AMIOS/REQ.png`,
    },
  ],
  'amio-s2': [
    {
      colorName: 'Đỏ Tươi',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw947c41f7')}AMIOS2/REQ2.png`,
      swatchUrl: `${SHOP_LIBRARY}dw7d3efc0c/images/XMD/AMIOS2/REQ2.png`,
    },
    {
      colorName: 'Trắng Tím',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw8b96114c')}AMIOS2/WHRY2.png`,
      swatchUrl: `${SHOP_LIBRARY}dw3c50083a/images/XMD/AMIOS2/WHRY2.png`,
    },
    {
      colorName: 'Trắng Đen',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dwe752518a')}AMIOS2/WHRX2.png`,
      swatchUrl: `${SHOP_LIBRARY}dw64ed4e30/images/XMD/AMIOS2/WHRX2.png`,
    },
    {
      colorName: 'Xanh Ngọc',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw91df0e66')}AMIOS2/BUW2.png`,
      swatchUrl: `${SHOP_LIBRARY}dwf33920e5/images/XMD/AMIOS2/BUW2.png`,
    },
    {
      colorName: 'Đen Bóng',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw2916e066')}AMIOS2/BAU2.png`,
      swatchUrl: `${SHOP_LIBRARY}dw8547efe0/images/XMD/AMIOS2/BAU2.png`,
    },
  ],
  zgoo: [
    {
      colorName: 'Xanh Oliu',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dwf7bf4981')}ZGOO/GNV.webp`,
      swatchUrl: `${SHOP_LIBRARY}dw26f88e83/images/XMD/ZGOO/GNV.png`,
    },
    {
      colorName: 'Đỏ Tươi',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw80bd769f')}ZGOO/REQ.webp`,
      swatchUrl: `${SHOP_LIBRARY}dw0d589bfb/images/XMD/ZGOO/REQ.png`,
    },
    {
      colorName: 'Trắng Ngọc Trai',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw0acd4199')}ZGOO/WHR.webp`,
      swatchUrl: `${SHOP_LIBRARY}dwf9875d4b/images/XMD/ZGOO/WHR.png`,
    },
    {
      colorName: 'Đen Bóng',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dwe60529cb')}ZGOO/BAU.webp`,
      swatchUrl: `${SHOP_LIBRARY}dw76e02c1c/images/XMD/ZGOO/BAU.png`,
    },
  ],
  'evo-lite': [
    {
      colorName: 'Đen',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw38d330a7')}EVOLITE/HPBAR.png`,
      swatchUrl: `${SHOP_LIBRARY}dwc8957a32/images/XMD/EVOLITE/HPBAR.png`,
    },
    {
      colorName: 'Đỏ Tươi',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dwb02b2fac')}EVOLITE/REQ.png`,
      swatchUrl: `${SHOP_LIBRARY}dw9fdd1e80/images/XMD/EVOLITE/REQ.png`,
    },
    {
      colorName: 'Xanh Oliu',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dwca3b86e6')}EVOLITE/GNV.png`,
      swatchUrl: `${SHOP_LIBRARY}dw35e08fa0/images/XMD/EVOLITE/GNV.png`,
    },
    {
      colorName: 'Trắng Ngọc Trai',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw4f1c1a98')}EVOLITE/WHR.png`,
      swatchUrl: `${SHOP_LIBRARY}dw60333d23/images/XMD/EVOLITE/WHR.png`,
    },
  ],
  evo: [
    {
      colorName: 'Trắng Ngọc Trai',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw4b5d84e8/images/EVO/WHR1.png',
      swatchUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw8fee860b/images/XMD/EVO/WHR1.png',
    },
    {
      colorName: 'Xanh Oliu',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw828718ab/images/EVO/GNV1.png',
      swatchUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw8dcea793/images/XMD/EVO/GNV1.png',
    },
    {
      colorName: 'Đỏ Tươi',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw4f0f0610/images/EVO/REQ1.png',
      swatchUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw577ff483/images/XMD/EVO/REQ1.png',
    },
    {
      colorName: 'Đen Bóng',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw201415e9/images/EVO/BAU1.png',
      swatchUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw2a6589ac/images/XMD/EVO/BAU1.png',
    },
  ],
  'evo-grand': [
    {
      colorName: 'Đen nhám',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw31a70006')}EVOGRAND/BAR2.png`,
      swatchUrl: `${SHOP_LIBRARY}dwcf3d4b1b/images/XMD/EVOGRAND/BAR2.png`,
    },
    {
      colorName: 'Đỏ tươi',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw86d8839d')}EVOGRAND/REQ1.png`,
      swatchUrl: `${SHOP_LIBRARY}dw8ad706fc/images/XMD/EVOGRAND/REQ1.png`,
    },
    {
      colorName: 'Trắng Ngọc Trai',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw0d888ce5')}EVOGRAND/WHR1.png`,
      swatchUrl: `${SHOP_LIBRARY}dwc01ecba9/images/XMD/EVOGRAND/WHR1.png`,
    },
    {
      colorName: 'Vàng cát',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw99dd9858')}EVOGRAND/YES1.png`,
      swatchUrl: `${SHOP_LIBRARY}dw0e7707d9/images/XMD/EVOGRAND/YES1.png`,
    },
    {
      colorName: 'Xanh Oliu',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw1cced0c4')}EVOGRAND/GNV1.png`,
      swatchUrl: `${SHOP_LIBRARY}dwaf718d4e/images/XMD/EVOGRAND/GNV1.png`,
    },
  ],
  'evo-grand-lite': [
    {
      colorName: 'Vàng',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dwd7f8a0ca')}EVOGRANDLITE/YES1.png`,
      swatchUrl: `${SHOP_LIBRARY}dw42f0dd05/images/XMD/EVOGRANDLITE/YES1.png`,
    },
    {
      colorName: 'Trắng Ngọc Trai',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw728ca924')}EVOGRANDLITE/WHR1.png`,
      swatchUrl: `${SHOP_LIBRARY}dw819fbd3f/images/XMD/EVOGRANDLITE/WHR1.png`,
    },
    {
      colorName: 'Lavender Sữa',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw927ad8f8')}EVOGRANDLITE/PUL1.png`,
      swatchUrl: `${SHOP_LIBRARY}dw983ee5f2/images/XMD/EVOGRANDLITE/PUL1.png`,
    },
    {
      colorName: 'Đen nhám',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw962d65e1')}EVOGRANDLITE/BAR2.png`,
      swatchUrl: `${SHOP_LIBRARY}dw1f2cb61a/images/XMD/EVOGRANDLITE/BAR2.png`,
    },
  ],
  'evo-lite-neo': [
    {
      colorName: 'Đen nhám',
      imageUrl: `${SHOP_LIBRARY}dw25ba0f5d/images/PDP-XMD/evoliteneo/img-top-evoliteneo-black.webp`,
      swatchUrl: `${SHOP_LIBRARY}dw5b7d4ede/images/PDP-XMD/color/evo-black.png`,
    },
    {
      colorName: 'Đỏ tươi',
      imageUrl: `${SHOP_LIBRARY}dwff05400c/images/PDP-XMD/evoliteneo/img-top-evoliteneo-red.webp`,
      swatchUrl: `${SHOP_LIBRARY}dwda679f8f/images/PDP-XMD/color/evo-red.png`,
    },
    {
      colorName: 'Xanh tím than',
      imageUrl: `${SHOP_LIBRARY}dwea30c14b/images/PDP-XMD/evoliteneo/img-top-evoliteneo-blue.webp`,
      swatchUrl: `${SHOP_LIBRARY}dw4c44a070/images/PDP-XMD/color/evo-blue.png`,
    },
    {
      colorName: 'Xanh rêu',
      imageUrl: `${SHOP_LIBRARY}dw8f4cd014/images/PDP-XMD/evoliteneo/img-top-evoliteneo-green.webp`,
      swatchUrl: `${SHOP_LIBRARY}dwfea9c516/images/PDP-XMD/color/evo-green.png`,
    },
    {
      colorName: 'Trắng ngọc trai',
      imageUrl: `${SHOP_LIBRARY}dw69cf1811/images/PDP-XMD/evoliteneo/img-top-evoliteneo-white.webp`,
      swatchUrl: `${SHOP_LIBRARY}dwd52b0fb5/images/PDP-XMD/color/evo-white.png`,
    },
  ],
  'evo-neo': [
    {
      colorName: 'Đen nhám',
      imageUrl: `${SHOP_MASTER}EVONEO/BAR.png`,
      swatchUrl: `${SHOP_LIBRARY}dw5b7d4ede/images/PDP-XMD/color/evo-black.png`,
    },
    {
      colorName: 'Đỏ tươi',
      imageUrl: `${SHOP_MASTER}EVONEO/REQ.png`,
      swatchUrl: `${SHOP_LIBRARY}dwda679f8f/images/PDP-XMD/color/evo-red.png`,
    },
    {
      colorName: 'Xanh tím than',
      imageUrl: `${SHOP_MASTER}EVONEO/BUR.png`,
      swatchUrl: `${SHOP_LIBRARY}dw4c44a070/images/PDP-XMD/color/evo-blue.png`,
    },
    {
      colorName: 'Xanh rêu',
      imageUrl: `${SHOP_MASTER}EVONEO/GNQ.png`,
      swatchUrl: `${SHOP_LIBRARY}dwfea9c516/images/PDP-XMD/color/evo-green.png`,
    },
    {
      colorName: 'Trắng ngọc trai',
      imageUrl: `${SHOP_MASTER}EVONEO/WHR.png`,
      swatchUrl: `${SHOP_LIBRARY}dwd52b0fb5/images/PDP-XMD/color/evo-white.png`,
    },
  ],
  'feliz-2025': [
    {
      colorName: 'Vàng Cát',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw740865fe')}FELIZ/YES.png`,
      swatchUrl: `${SHOP_LIBRARY}dw1ee71eba/images/XMD/FELIZ/YES.png`,
    },
    {
      colorName: 'Xanh rêu',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw728dbc8c')}FELIZ/GNQ.png`,
      swatchUrl: `${SHOP_LIBRARY}dwe349543a/images/XMD/FELIZ/GNQ.png`,
    },
    {
      colorName: 'Xanh Oliu',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dwc9b0cb19')}FELIZ/GNV.png`,
      swatchUrl: `${SHOP_LIBRARY}dw6637c856/images/XMD/FELIZ/GNV.png`,
    },
    {
      colorName: 'Trắng Ngọc Trai',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw0dbe34c9')}FELIZ/WHR.png`,
      swatchUrl: `${SHOP_LIBRARY}dw8df15111/images/XMD/FELIZ/WHR.png`,
    },
    {
      colorName: 'Đen Bóng',
      imageUrl: `${SHOP_MASTER}FELIZ/BAU.png`,
      swatchUrl: `${SHOP_LIBRARY}dwfea26326/images/XMD/FELIZ/BAU.png`,
    },
  ],
  'feliz-ii': [
    {
      colorName: 'Trắng Ngọc Trai',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw021c8021')}FELIZII/WHR.png`,
      swatchUrl: `${SHOP_LIBRARY}dw659f6baa/images/XMD/FELIZII/WHR.png`,
    },
    {
      colorName: 'Đen Bóng',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw0e52ff42')}FELIZII/BAU.png`,
      swatchUrl: `${SHOP_LIBRARY}dwe94ee603/images/XMD/FELIZII/BAU.png`,
    },
    {
      colorName: 'Đỏ Tươi',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw708fe59f')}FELIZII/REQ.png`,
      swatchUrl: `${SHOP_LIBRARY}dw5217bbfa/images/XMD/FELIZII/REQ.png`,
    },
    {
      colorName: 'Xanh Oliu',
      imageUrl: `${SHOP_MASTER.replace('dw2f846374', 'dw8c21d03d')}FELIZII/GNV.png`,
      swatchUrl: `${SHOP_LIBRARY}dw96b7db2a/images/XMD/FELIZII/GNV.png`,
    },
  ],
  kinet: [
    {
      colorName: 'Đen Bóng',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw8fe35f6f/images/KINET/BAUVN.png',
      swatchUrl: `${SHOP_LIBRARY}dwc9e08ce9/images/XMD/KINET/BAUVN.png`,
    },
    {
      colorName: 'Trắng Ngọc Trai',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw352b0e26/images/KINET/WHRVN.png',
      swatchUrl: `${SHOP_LIBRARY}dw2618206a/images/XMD/KINET/WHRVN.png`,
    },
    {
      colorName: 'Xám Xi Măng',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw17ea08a7/images/KINET/GRCVN.png',
      swatchUrl: `${SHOP_LIBRARY}dwbb8ed54d/images/XMD/KINET/GRCVN.png`,
    },
    {
      colorName: 'Đỏ Đen',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw0bdfbb94/images/KINET/REQVN.png',
      swatchUrl: `${SHOP_LIBRARY}dw403de5bd/images/XMD/KINET/REQVN.png`,
    },
    {
      colorName: 'Nâu Ánh Kim',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw5990a94d/images/KINET/BRQVN.png',
      swatchUrl: `${SHOP_LIBRARY}dw4d630d91/images/XMD/KINET/BRQVN.png`,
    },
  ],
  kyo: [
    {
      colorName: 'Nâu Ánh Kim',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dwe9e8a96e/images/KYO/BRQVN.png',
      swatchUrl: `${SHOP_LIBRARY}dwabb414a6/images/XMD/KYO/BRQVN.png`,
    },
    {
      colorName: 'Trắng Ngọc Trai',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw52bce347/images/KYO/WHRVN.png',
      swatchUrl: `${SHOP_LIBRARY}dwf926d65f/images/XMD/KYO/WHRVN.png`,
    },
    {
      colorName: 'Xanh Oliu',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw6ef43be1/images/KYO/GNVVN.png',
      swatchUrl: `${SHOP_LIBRARY}dwac87e2fc/images/XMD/KYO/GNVVN.png`,
    },
    {
      colorName: 'Đen Bóng',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dwbc987a72/images/KYO/BAUVN.png',
      swatchUrl: `${SHOP_LIBRARY}dw0526b17e/images/XMD/KYO/BAUVN.png`,
    },
    {
      colorName: 'Đỏ',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw5d893d5d/images/KYO/REQVN.png',
      swatchUrl: `${SHOP_LIBRARY}dwf3416186/images/XMD/KYO/REQVN.png`,
    },
  ],
  flazz: [
    {
      colorName: 'Đỏ tươi - Đen nhám',
      imageUrl: BIKE_COLOR_IMAGES.flazz['do tuoi den nham'],
      swatchUrl: `${SHOP_LIBRARY}dw45bfc087/images/PDP-XMD/flazz/color/red.png`,
    },
    {
      colorName: 'Đen bóng',
      imageUrl: BIKE_COLOR_IMAGES.flazz['den bong'],
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
  'flazz-max': [
    {
      colorName: 'Đỏ Đen',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw99cf4ce9/images/FLAZZMAX/REQVN.png',
      swatchUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw59dddeb7/images/XMD/FLAZZMAX/REQVN.png',
    },
    {
      colorName: 'Trắng Cam',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw5aa49368/images/FLAZZMAX/WHRVN.png',
      swatchUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw3a0ad6c7/images/XMD/FLAZZMAX/WHRVN.png',
    },
    {
      colorName: 'Xanh',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw24cc2114/images/FLAZZMAX/BUZVN.png',
      swatchUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dwe9568dcb/images/XMD/FLAZZMAX/BUZVN.png',
    },
    {
      colorName: 'Đen',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dwb0f372c5/images/FLAZZMAX/BAUVN.png',
      swatchUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw0d2ef4ee/images/XMD/FLAZZMAX/BAUVN.png',
    },
  ],
  viper: [
    {
      colorName: 'Đỏ Tươi',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw64b3fd5b/images/VIPER/REQ.png',
      swatchUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw0a71f8b3/images/XMD/VIPER/REQ.png',
    },
    {
      colorName: 'Vàng Cát',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw6a9b6df7/images/VIPER/YES.png',
      swatchUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw5af30945/images/XMD/VIPER/YES.png',
    },
    {
      colorName: 'Xám',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dwa2a6e3a3/images/VIPER/GRC.png',
      swatchUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw0d2221f8/images/XMD/VIPER/GRC.png',
    },
    {
      colorName: 'Trắng Ngọc Trai',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw3870f710/images/VIPER/WHR.png',
      swatchUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw003be7a9/images/XMD/VIPER/WHR.png',
    },
    {
      colorName: 'Đen Bóng',
      imageUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw54d11c00/images/VIPER/BAU.png',
      swatchUrl: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw61e981c4/images/XMD/VIPER/BAU.png',
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

