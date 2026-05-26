export function unitLabelShort(unit?: string | null): string {
  switch (unit) {
    case 'half_kg':
      return '½ kg';
    case 'quarter_kg':
      return '¼ kg';
    case 'half_dozen':
      return '½ dozen';
    default:
      return '';
  }
}
