const CONTENT_PROFILES = new Map([
  ['vinfast-service-workshops', {
    key: 'service-workshop',
    minimumTextLength: 200,
    expectations: [
      { id: 'showroom_heading', pattern: /Hệ thống Showroom (?:và|&) Trạm sạc/iu },
      { id: 'search_region', pattern: /Khu vực tìm kiếm/iu },
      { id: 'province_selector', pattern: /Tỉnh thành/iu },
    ],
  }],
  ['vinfast-maintenance-car', {
    key: 'maintenance-detail',
    minimumTextLength: 5_000,
    expectations: [
      { id: 'engine_air_filter', pattern: /Bộ lọc không khí/iu },
      { id: 'electric_maintenance_interval', pattern: /12[.]000\s*km/iu },
      { id: 'battery_coolant', pattern: /Nước làm mát pin/iu },
    ],
  }],
])

const DEFAULT_PROFILE = {
  key: 'content',
  minimumTextLength: 120,
  expectations: [],
}

export function captureContentProfile(source) {
  return CONTENT_PROFILES.get(source?.id) || DEFAULT_PROFILE
}

export function evaluateCaptureContent(source, capture) {
  const text = String(`${capture?.title || ''} ${capture?.text || ''}`)
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .trim()
  const profile = captureContentProfile(source)
  return {
    text,
    profile,
    blocked: /\b(?:access denied|request blocked|forbidden|captcha|verify you are human)\b/iu.test(text),
    missing: profile.expectations
      .filter(expectation => !expectation.pattern.test(text))
      .map(expectation => expectation.id),
  }
}
