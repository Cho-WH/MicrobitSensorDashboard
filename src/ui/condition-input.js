export function parseCondition(text) {
  const value = text.trim();
  if (!value) return null;
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value)))
    throw new Error('numberInvalid');
  return Number(value);
}
