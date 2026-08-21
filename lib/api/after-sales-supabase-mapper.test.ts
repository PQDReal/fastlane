import { describe, expect, it } from 'vitest'
import {
  mapPublishedAfterSalesData,
  type PublishedAfterSalesFactRow,
  type PublishedAfterSalesLocationRow,
  type PublishedAfterSalesReleaseRow,
} from './after-sales-supabase-mapper'

const release: PublishedAfterSalesReleaseRow = {
  release_id: 'after_sales_test_release',
  published_at: '2026-08-20T09:47:14.577957+00:00',
  counts: { facts: 1, serviceLocations: 1 },
}

function fact(
  overrides: Partial<PublishedAfterSalesFactRow> &
    Pick<PublishedAfterSalesFactRow, 'fact_id' | 'service_type' | 'vehicle_type' | 'fact_type'>,
): PublishedAfterSalesFactRow {
  return {
    release_id: release.release_id,
    powertrain: 'electric',
    model: null,
    subject: 'vehicle',
    policy_entity: 'vehicle',
    battery_chemistry: 'not_applicable',
    usage_condition: 'general',
    applicability: 'general',
    action: null,
    value_numeric: null,
    value_text: null,
    unit: null,
    qualifier: null,
    interval_relation: null,
    interval_group_id: null,
    interval_group_distance_policy: null,
    distance_policy: 'not_stated',
    ...overrides,
  }
}

function warrantyPair(model: string, prefix: string): PublishedAfterSalesFactRow[] {
  return [
    fact({
      fact_id: `${prefix}-vehicle-duration`,
      service_type: 'warranty',
      vehicle_type: 'car',
      model,
      subject: 'vehicle',
      usage_condition: 'standard_use',
      applicability: 'original_vehicle',
      action: 'warranty_coverage',
      fact_type: 'vehicle_warranty_duration',
      value_numeric: 10,
      value_text: '10 năm',
      unit: 'year',
      qualifier: 'whichever_comes_first',
      interval_relation: 'or',
    }),
    fact({
      fact_id: `${prefix}-vehicle-distance`,
      service_type: 'warranty',
      vehicle_type: 'car',
      model,
      subject: 'vehicle',
      usage_condition: 'standard_use',
      applicability: 'original_vehicle',
      action: 'warranty_coverage',
      fact_type: 'vehicle_warranty_distance',
      value_numeric: 200000,
      value_text: '200.000 km',
      unit: 'km',
      qualifier: 'whichever_comes_first',
      interval_relation: 'or',
      distance_policy: 'limited',
    }),
    fact({
      fact_id: `${prefix}-battery-duration`,
      service_type: 'warranty',
      vehicle_type: 'car',
      model,
      subject: 'battery',
      policy_entity: 'battery',
      battery_chemistry: 'unspecified',
      usage_condition: 'standard_use',
      applicability: 'original_equipment',
      action: 'warranty_coverage',
      fact_type: 'battery_warranty_duration',
      value_numeric: 10,
      value_text: '10 năm',
      unit: 'year',
      qualifier: 'whichever_comes_first',
      interval_relation: 'or',
    }),
    fact({
      fact_id: `${prefix}-battery-distance`,
      service_type: 'warranty',
      vehicle_type: 'car',
      model,
      subject: 'battery',
      policy_entity: 'battery',
      battery_chemistry: 'unspecified',
      usage_condition: 'standard_use',
      applicability: 'original_equipment',
      action: 'warranty_coverage',
      fact_type: 'battery_warranty_distance',
      value_numeric: 200000,
      value_text: '200.000 km',
      unit: 'km',
      qualifier: 'whichever_comes_first',
      interval_relation: 'or',
      distance_policy: 'limited',
    }),
    fact({
      fact_id: `${prefix}-battery-threshold`,
      service_type: 'warranty',
      vehicle_type: 'car',
      model,
      subject: 'battery',
      policy_entity: 'battery',
      battery_chemistry: 'unspecified',
      usage_condition: 'general',
      applicability: 'original_equipment',
      action: 'warranty_coverage',
      fact_type: 'battery_capacity_threshold',
      value_numeric: 70,
      value_text: '70%',
      unit: 'percent',
      qualifier: 'minimum',
    }),
  ]
}

function location(
  overrides: Partial<PublishedAfterSalesLocationRow> = {},
): PublishedAfterSalesLocationRow {
  return {
    location_id: 'vinfast-workshop-test',
    release_id: release.release_id,
    name: 'VinFast Test',
    location_category: 'official_car_workshop',
    vehicle_types: ['car'],
    service_types: ['general_after_sales'],
    bookable_service_types: ['maintenance'],
    capability_granularity: 'location_category_only',
    address: {
      province: 'Hà Nội',
      district: 'Cầu Giấy',
      fullAddress: '1 Đường Kiểm Thử, Hà Nội',
      latitude: 21.03,
      longitude: 105.8,
    },
    contact: { servicePhone: '19001234' },
    service_hours: { opensAt: '08h00', closesAt: '18h00' },
    operational_status: 'active',
    ...overrides,
  }
}

describe('published after-sales read-model mapper', () => {
  it('maps only approved projection fields into the existing frontend contract', () => {
    const facts = [
      ...warrantyPair('VF 8', 'vf8'),
      fact({
        fact_id: 'maintenance-distance',
        service_type: 'maintenance',
        vehicle_type: 'car',
        powertrain: 'electric',
        subject: 'vehicle',
        action: 'scheduled_service',
        fact_type: 'maintenance_interval_distance',
        value_numeric: 12000,
        value_text: '12.000 km',
        unit: 'km',
        qualifier: 'whichever_comes_first',
        interval_relation: 'or',
        interval_group_id: 'interval-maintenance',
        distance_policy: 'limited',
      }),
      fact({
        fact_id: 'maintenance-time',
        service_type: 'maintenance',
        vehicle_type: 'car',
        powertrain: 'electric',
        subject: 'vehicle',
        action: 'scheduled_service',
        fact_type: 'maintenance_interval_time',
        value_numeric: 1,
        value_text: 'hàng năm',
        unit: 'year',
        qualifier: 'whichever_comes_first',
        interval_relation: 'or',
        interval_group_id: 'interval-maintenance',
      }),
      fact({
        fact_id: 'repair-window',
        service_type: 'repair',
        vehicle_type: 'car',
        subject: 'repair_service',
        action: 'appointment_arrival',
        fact_type: 'appointment_arrival_window',
        value_numeric: 30,
        value_text: '30 phút',
        unit: 'minute',
      }),
      fact({
        fact_id: 'rescue-dispatch',
        service_type: 'rescue',
        vehicle_type: 'car',
        subject: 'emergency_response',
        action: 'request_dispatch',
        fact_type: 'service_response_time',
        value_numeric: 10,
        value_text: '10 phút',
        unit: 'minute',
      }),
    ]

    const data = mapPublishedAfterSalesData({ release, facts, locations: [location()] })

    expect(data).toMatchObject({
      releaseId: release.release_id,
      sourcesSyncedAt: release.published_at,
      dataOrigin: 'supabase_published',
    })
    expect(data.warranties[0]).toMatchObject({
      vehicleType: 'car',
      models: ['VF 8'],
      warrantyTerm: '10 năm hoặc 200.000 km',
    })
    expect(data.warranties[0].batteryWarrantyTerm).toContain('ngưỡng dung lượng tối thiểu 70%')
    expect(data.maintenances[0].intervals[0]).toMatchObject({ mileageKm: 12000, months: 12 })
    expect(data.repairs[0].description).toContain('30 phút')
    expect(data.rescues[0].coverage).toContain('Chuyển yêu cầu đến đơn vị điều phối trong 10 phút.')
    expect(data.workshops[0]).toMatchObject({
      id: 'vinfast-workshop-test',
      city: 'Hà Nội',
      services: ['car'],
      operatingHours: '08h00 - 18h00',
    })
    expect(data.workshops[0].services).not.toContain('charging')
    expect(data.workshops[0].services).not.toContain('quick_service')
  })

  it('groups models with identical terms and never synthesizes bus data', () => {
    const data = mapPublishedAfterSalesData({
      release,
      facts: [...warrantyPair('VF 8', 'vf8'), ...warrantyPair('VF 9', 'vf9')],
      locations: [location()],
    })

    expect(data.warranties).toHaveLength(1)
    expect(data.warranties[0].models).toEqual(['VF 8', 'VF 9'])
    expect(data.warranties.some((item) => item.vehicleType === 'bus')).toBe(false)
  })

  it('filters inactive locations and does not infer detailed workshop capabilities', () => {
    const data = mapPublishedAfterSalesData({
      release,
      facts: [],
      locations: [
        location(),
        location({
          location_id: 'inactive-workshop',
          operational_status: 'inactive',
          vehicle_types: ['car', 'motorbike'],
        }),
      ],
    })

    expect(data.workshops).toHaveLength(1)
    expect(data.workshops[0].services).toEqual(['car'])
  })

  it('keeps a paired motorbike time interval when another fact shares the same mileage', () => {
    const facts = [
      fact({
        fact_id: 'motorbike-brake-distance',
        service_type: 'maintenance',
        vehicle_type: 'motorbike',
        subject: 'brake_fluid',
        action: 'inspect',
        fact_type: 'maintenance_interval_distance',
        value_numeric: 1000,
        value_text: '1.000 km',
        unit: 'km',
        interval_group_id: 'motorbike-brake-interval',
      }),
      fact({
        fact_id: 'motorbike-brake-time',
        service_type: 'maintenance',
        vehicle_type: 'motorbike',
        subject: 'brake_fluid',
        action: 'inspect',
        fact_type: 'maintenance_interval_time',
        value_numeric: 6,
        value_text: '6 tháng',
        unit: 'month',
        interval_group_id: 'motorbike-brake-interval',
      }),
      fact({
        fact_id: 'motorbike-brake-system-distance',
        service_type: 'maintenance',
        vehicle_type: 'motorbike',
        subject: 'brake_system',
        action: 'inspect',
        fact_type: 'maintenance_interval_distance',
        value_numeric: 1000,
        value_text: '1.000 km',
        unit: 'km',
      }),
    ]
    const data = mapPublishedAfterSalesData({ release, facts, locations: [] })

    expect(data.maintenances[0].intervals[0]).toMatchObject({
      mileageKm: 1000,
      months: 6,
    })
    expect(data.maintenances[0].intervals[0].keyItems).toHaveLength(2)
  })
})
