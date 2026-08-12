export type DepositVehicleVariantSelection = {
  vehicleVariant: string
  exteriorColor: string
}

export type DepositVehicleVariantCandidate = {
  version?: string | null
  variant_name?: string | null
  color?: string | null
}

export function vehicleSelectionKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi-VN')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '')
}

export function matchesDepositVehicleVariant(
  candidate: DepositVehicleVariantCandidate,
  selection: DepositVehicleVariantSelection,
): boolean {
  if (
    vehicleSelectionKey(candidate.color) !==
    vehicleSelectionKey(selection.exteriorColor)
  ) {
    return false
  }

  const requestedVersion = vehicleSelectionKey(selection.vehicleVariant)
  const version = vehicleSelectionKey(candidate.version)
  const fullName = vehicleSelectionKey(candidate.variant_name)
  return Boolean(
    version && (
      requestedVersion === version ||
      requestedVersion.endsWith(version) ||
      version.endsWith(requestedVersion)
    )
  ) || fullName.includes(requestedVersion)
}
