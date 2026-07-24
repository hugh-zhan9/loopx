// CSV writer used by report exports.
export function toCsv(rows, columns) {
  if (!Array.isArray(rows)) {
    throw new TypeError('rows must be an array');
  }
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new TypeError('columns must be a non-empty array');
  }
  var out = '';
  var line = '';
  var i;
  for (i = 0; i < columns.length; i++) {
    if (i > 0) {
      line += ',';
    }
    line += escapeField(columns[i]);
  }
  out += line + '\r\n';
  for (i = 0; i < rows.length; i++) {
    var row = rows[i];
    line = '';
    for (var j = 0; j < columns.length; j++) {
      if (j > 0) {
        line += ',';
      }
      line += escapeField(fieldValue(row[columns[j]]));
    }
    out += line + '\r\n';
  }
  return out;
}

function fieldValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function escapeField(text) {
  text = String(text);
  var needsQuotes = text.indexOf(',') !== -1
    || text.indexOf('"') !== -1
    || text.indexOf('\n') !== -1
    || text.indexOf('\r') !== -1
    || text !== text.trim();
  if (!needsQuotes) {
    return text;
  }
  return '"' + text.split('"').join('""') + '"';
}
