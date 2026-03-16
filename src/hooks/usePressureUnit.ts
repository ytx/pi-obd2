export function convertPressure(kPa: number, unit: 'kPa' | 'psi' | 'bar'): number {
  switch (unit) {
    case 'psi': return kPa / 6.89476;
    case 'bar': return kPa / 100;
    default: return kPa;
  }
}

export function formatPressure(kPa: number, unit: 'kPa' | 'psi' | 'bar'): string {
  const value = convertPressure(kPa, unit);
  switch (unit) {
    case 'kPa': return Math.round(value).toString();
    case 'psi': return value.toFixed(1);
    case 'bar': return value.toFixed(2);
    default: return value.toFixed(1);
  }
}

export function pressureUnitLabel(unit: 'kPa' | 'psi' | 'bar'): string {
  return unit;
}
