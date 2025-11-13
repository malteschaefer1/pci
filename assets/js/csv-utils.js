(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;

  const BOM_COLUMNS = ['component_id', 'component_name', 'material', 'process', 'mass_kg'];
  const FACTOR_COLUMNS = [
    'component_id',
    'Fr_percent',
    'Efp_percent',
    'Ecp_percent',
    'Cfp_percent',
    'Ccp_percent',
    'Ems_percent',
    'Erfp_percent',
  ];

  const DEFAULT_COMPONENT_PARAMS = {
    Fr: 0,
    Efp: 1,
    Ecp: 1,
    Cfp: 0,
    Ccp: 0,
    Ems: 0,
    Erfp: 0,
  };

/**
 * Generates the BoM template CSV as a string.
 * @returns {string}
 */
  function generateBomTemplateCsv() {
  const header = BOM_COLUMNS.join(',');
  const example = ['C1', 'Housing', 'Polyamide', 'Injection-molding', '0.16'].join(',');
  return `${header}\n${example}\n`;
}

/**
 * Generates the input-factor template CSV as a string.
 * @returns {string}
 */
  function generateInputFactorsTemplateCsv() {
  const header = FACTOR_COLUMNS.join(',');
  const example = ['C1', '0', '100', '95', '0', '100', '30', '30'].join(',');
  return `${header}\n${example}\n`;
}

/**
 * Parses a BoM CSV into component objects.
 * @param {string} csvString
 * @returns {import('./circularity.js').ComponentInput[]}
 */
  function parseBomCsv(csvString) {
  const rows = parseCsv(csvString, BOM_COLUMNS);
  return rows.map((row, index) => {
    const id = (row.component_id || '').trim();
    if (!id) {
      throw new Error(`Row ${index + 2}: component_id is required.`);
    }
    const name = (row.component_name || '').trim();
    const material = (row.material || '').trim();
    const process = (row.process || '').trim();
    const mass = parseRequiredNumber(row.mass_kg, 'mass_kg', index + 2);
    return {
      id,
      name,
      material,
      process,
      massKg: mass,
      ...DEFAULT_COMPONENT_PARAMS,
    };
  });
}

/**
 * Parses input-factor CSV rows into a map keyed by component_id.
 * @param {string} csvString
 * @returns {Map<string, Partial<import('./circularity.js').ComponentInput>>}
 */
  function parseInputFactorsCsv(csvString) {
  const rows = parseCsv(csvString, FACTOR_COLUMNS);
  const map = new Map();
  rows.forEach((row, index) => {
    const id = (row.component_id || '').trim();
    if (!id) {
      throw new Error(`Row ${index + 2}: component_id is required in the factors CSV.`);
    }
    map.set(id, {
      Fr: parsePercent(row.Fr_percent, 'Fr_percent', index + 2),
      Efp: parsePercent(row.Efp_percent, 'Efp_percent', index + 2),
      Ecp: parsePercent(row.Ecp_percent, 'Ecp_percent', index + 2),
      Cfp: parsePercent(row.Cfp_percent, 'Cfp_percent', index + 2),
      Ccp: parsePercent(row.Ccp_percent, 'Ccp_percent', index + 2),
      Ems: parsePercent(row.Ems_percent, 'Ems_percent', index + 2),
      Erfp: parsePercent(row.Erfp_percent, 'Erfp_percent', index + 2),
    });
  });
  return map;
}

/**
 * Serializes the current components into a BoM CSV string.
 * @param {import('./circularity.js').ComponentInput[]} components
 * @returns {string}
 */
  function exportComponentsToBomCsv(components) {
  const header = BOM_COLUMNS.join(',');
  const body = components
    .map((comp) =>
      [comp.id, comp.name, comp.material, comp.process, formatNumber(comp.massKg)].join(',')
    )
    .join('\n');
  return `${header}\n${body}\n`;
}

/**
 * Serializes component parameters into an input-factor CSV string.
 * @param {import('./circularity.js').ComponentInput[]} components
 * @returns {string}
 */
  function exportComponentsToInputFactorsCsv(components) {
  const header = FACTOR_COLUMNS.join(',');
  const body = components
    .map((comp) =>
      [
        comp.id,
        formatPercent(comp.Fr),
        formatPercent(comp.Efp),
        formatPercent(comp.Ecp),
        formatPercent(comp.Cfp),
        formatPercent(comp.Ccp),
        formatPercent(comp.Ems),
        formatPercent(comp.Erfp),
      ].join(',')
    )
    .join('\n');
  return `${header}\n${body}\n`;
}

/**
 * Builds a CSV with the latest results per component.
 * @param {import('./circularity.js').ComponentInput[]} components
 * @returns {string}
 */
  function exportResultsCsv(components) {
  const header = [
    'component_id',
    'component_name',
    'mass_kg',
    'CCI',
    'CII_percent',
    'LFI',
    'V',
    'W',
    'Rin',
    'Rout',
    'absR',
    'C',
  ].join(',');
  const body = components
    .map((comp) =>
      [
        comp.id,
        comp.name,
        formatNumber(comp.massKg),
        formatNumber(comp.CCI, 4),
        formatNumber(comp.CII, 2),
        formatNumber(comp.LFI, 4),
        formatNumber(comp.flows?.V),
        formatNumber(comp.flows?.W),
        formatNumber(comp.flows?.Rin),
        formatNumber(comp.flows?.Rout),
        formatNumber(comp.flows?.absR),
        formatNumber(comp.flows?.C),
      ].join(',')
    )
    .join('\n');
  return `${header}\n${body}\n`;
}

  function parseCsv(csvString, expectedColumns) {
  const trimmed = csvString?.trim();
  if (!trimmed) {
    throw new Error('CSV appears to be empty.');
  }

  if (typeof Papa !== 'undefined') {
    const result = Papa.parse(trimmed, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim(),
    });
    if (result.errors?.length) {
      throw new Error(result.errors[0].message || 'Failed to parse CSV file.');
    }
    ensureColumns(result.meta?.fields || [], expectedColumns);
    return result.data.filter((row) => Object.values(row).some((value) => `${value}`.trim().length));
  }

  const [headerLine, ...lines] = trimmed.split(/\r?\n/);
  const headers = headerLine.split(',').map((col) => col.trim());
  ensureColumns(headers, expectedColumns);
  return lines
    .filter((line) => line.trim().length)
    .map((line) => {
      const cells = line.split(',');
      const row = {};
      headers.forEach((header, index) => {
        row[header] = cells[index]?.trim() ?? '';
      });
      return row;
    });
}

  function ensureColumns(actual, expected) {
  const missing = expected.filter((col) => !actual.includes(col));
  if (missing.length) {
    throw new Error(`CSV is missing required columns: ${missing.join(', ')}`);
  }
}

  function parseRequiredNumber(value, field, rowNumber) {
  const num = Number(value);
  if (!isFinite(num)) {
    throw new Error(`Row ${rowNumber}: ${field} must be a number.`);
  }
  return num;
}

  function parsePercent(value, field, rowNumber) {
  const num = parseRequiredNumber(value, field, rowNumber);
  return clamp01(num / 100);
}

  function clamp01(value) {
  if (!isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

  function formatNumber(value, digits = 3) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '';
  }
  return Number(value).toFixed(digits);
}

  function formatPercent(fraction) {
  return (clamp01(fraction) * 100).toFixed(1);
}

  globalScope.CsvUtils = {
    generateBomTemplateCsv,
    generateInputFactorsTemplateCsv,
    parseBomCsv,
    parseInputFactorsCsv,
    exportComponentsToBomCsv,
    exportComponentsToInputFactorsCsv,
    exportResultsCsv,
  };
})();
