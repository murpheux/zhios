/** "INTERNAL_TRANSFER" -> "internal transfer" — for showing GraphQL enum values in the UI. */
export function humanizeEnum(value: string): string {
  return value.toLowerCase().replace(/_/g, " ");
}
