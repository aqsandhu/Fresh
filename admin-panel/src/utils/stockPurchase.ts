// Stock-purchase weight balancing — extracted from pages/Expenses.tsx so the
// page file only exports components (react-refresh) and the logic is testable
// without mounting the page.

export type NumericInput = string | number | null | undefined;

const parseWeightInput = (value: NumericInput): number => {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundWeight = (value: number): number => Math.round(value * 1000) / 1000;

export function getStockPurchaseBalance(
  rawWeight: NumericInput,
  gradeA: NumericInput,
  gradeB: NumericInput,
  gradeC: NumericInput,
  waste: NumericInput
) {
  const raw = parseWeightInput(rawWeight);
  const gradedTotal = roundWeight(
    parseWeightInput(gradeA) + parseWeightInput(gradeB) + parseWeightInput(gradeC) + parseWeightInput(waste)
  );
  const remaining = roundWeight(raw - gradedTotal);

  return {
    raw,
    gradedTotal,
    remaining,
    balanced: raw > 0 && Math.abs(remaining) < 0.001,
  };
}
