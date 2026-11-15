export function formatTermografiaReportNumber(date: Date, sequence: number) {
  const year = date.getFullYear();
  const ordinal = String(sequence).padStart(3, '0');

  return `RT-${year}-${ordinal}`;
}
