const protectSpreadsheetCell = value => {
  const text = String(value ?? '');
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
};

const csvCell = value => `"${protectSpreadsheetCell(value).replace(/"/g, '""')}"`;

const csvRow = values => values.map(csvCell).join(',');

module.exports = {
  csvCell,
  csvRow,
  protectSpreadsheetCell
};
