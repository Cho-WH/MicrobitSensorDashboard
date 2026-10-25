import { createUuid } from '../domain/uuid.js';
// Adapted from Cho-WH/bme280 gay-lussac/analysis/calculations.js at 59c5c149450f970bace2deaa183857c275595853.
import { validateCalculatedColumns } from '../domain/contracts.js';
import { getSourceColumns, readCell } from '../domain/columns.js';

const invalid = reason => ({ value: null, reason });
export function calculateValue(a, op, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return invalid('입력값을 계산할 수 없습니다.');
  if (op === '/' && b === 0) return invalid('0으로 나눌 수 없습니다.');
  if (op === '^') {
    if (a === 0 && b === 0) return invalid('0의 0제곱은 계산하지 않습니다.');
    if (a === 0 && b < 0) return invalid('0의 음수 거듭제곱은 계산할 수 없습니다.');
    if (a < 0 && !Number.isInteger(b)) return invalid('음수의 거듭제곱은 정수 지수만 지원합니다.');
  }
  const value = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b
    : op === '/' ? a / b : op === '^' ? a ** b : NaN;
  return Number.isFinite(value) ? { value, reason: null } : invalid('계산 가능한 숫자 범위를 벗어났습니다.');
}

export const columnLabel = c => c.name + (c.unit ? ` (${c.unit})` : '');
export const calculationInputs = (columns, imported = [], context) => [...getSourceColumns(context).filter(c => c.calculable), ...imported, ...columns];
export const formatCalculated = value => value == null ? '—' : Number(value.toPrecision(6)).toString();

// Compile once per definition change; all rows, previews and future exports share this evaluator.
export function createCalculator(definitions, imported = [], context) {
  const columns = validateCalculatedColumns(definitions, imported, context), byId = new Map(columns.map(c => [c.id, c]));
  const labels = new Map(calculationInputs(columns, imported, context).map(c => [c.id, c.name]));
  const importedIds = new Set(imported.map(c => c.id));
  return sample => {
    const values = {};
    function read(operand) {
      if (operand.kind === 'constant') return { value: operand.value, reason: null };
      const id = operand.columnId;
      if (byId.has(id)) return evaluate(id);
      if (importedIds.has(id)) return sample.importedValues?.[id] ?? invalid(`${labels.get(id)} 값이 없습니다.`);
      const cell = readCell(sample, id);
      return Number.isFinite(cell.value) && !cell.reason ? cell : invalid(`${labels.get(id)} 값이 없거나 유효하지 않습니다.`);
    }
    function evaluate(id) {
      if (Object.hasOwn(values, id)) return values[id];
      const c = byId.get(id), a = read(c.lhs), b = read(c.rhs);
      return values[id] = a.reason ? invalid(a.reason) : b.reason ? invalid(b.reason) : calculateValue(a.value, c.op, b.value);
    }
    columns.forEach(c => evaluate(c.id));
    return values;
  };
}

// Activity templates use the same expressions as manually created columns.
// Substitute fresh IDs and reuse matching prerequisite expressions, never sensor branches.
export function presetColumns(kind, existing, nextId = () => 'calc-' + createUuid(), templates = []) {
  const template = templates.find(t => t.id === kind);
  if (!template?.columns?.length) throw new Error('이 활동에서 사용할 계산 예시를 선택하세요.');
  const remap = new Map(), added = [];
  const sameOperand = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const sameExpression = (a, b) => a.op === b.op && (
    (sameOperand(a.lhs, b.lhs) && sameOperand(a.rhs, b.rhs)) ||
    (['+', '*'].includes(a.op) && sameOperand(a.lhs, b.rhs) && sameOperand(a.rhs, b.lhs)));
  for (const [index, source] of template.columns.entries()) {
    const definition = structuredClone(source);
    for (const side of ['lhs', 'rhs']) if (definition[side].kind === 'column' && remap.has(definition[side].columnId))
      definition[side].columnId = remap.get(definition[side].columnId);
    // Final draft stays editable even when a matching expression already exists.
    const match = index < template.columns.length - 1 && [...existing, ...added].find(c => sameExpression(c, definition));
    definition.id = match ? match.id : nextId();
    remap.set(source.id, definition.id);
    if (!match) added.push(definition);
  }
  return added;
}
