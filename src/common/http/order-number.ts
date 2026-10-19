export function formatOrderNumber(number: number): string {
  return `SC-${String(number).padStart(6, '0')}`;
}
