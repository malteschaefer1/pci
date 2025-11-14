/**
 * csv-utils.js – helpers for generating templates, parsing uploads, and exporting
 * CSV files in either dot or comma-decimal locales.
 */

(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;

  const BOM_COLUMNS = ['component_id', 'component_name', 'material', 'process', 'mass_kg'];
  const FACTOR_COLUMNS = [
    'material',
    'process',
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
  const example = ['Polyamide', 'Injection-molding', '0', '100', '95', '0', '100', '30', '30'].join(',');
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
    const material = (row.material || '').trim();
    const process = (row.process || '').trim();
    if (!material && !process) {
      throw new Error(`Row ${index + 2}: material and/or process is required in the factors CSV.`);
    }
    const key = buildFactorKey(material, process);
    map.set(key, {
      material,
      process,
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
  function exportComponentsToBomCsv(components, formatting = defaultFormatting()) {
  const { decimalSeparator, delimiter } = formatting;
  const header = BOM_COLUMNS.join(delimiter);
  const body = components
    .map((comp) =>
      [
        comp.id,
        comp.name,
        comp.material,
        comp.process,
        formatNumber(comp.massKg, 3, decimalSeparator),
      ].join(delimiter)
    )
    .join('\n');
  return `${header}\n${body}\n`;
}

/**
 * Serializes component parameters into an input-factor CSV string.
 * @param {import('./circularity.js').ComponentInput[]} components
 * @returns {string}
 */
  function exportComponentsToInputFactorsCsv(components, formatting = defaultFormatting()) {
  const { decimalSeparator, delimiter } = formatting;
  const header = FACTOR_COLUMNS.join(delimiter);
  const combos = new Map();
  components.forEach((comp) => {
    const key = buildFactorKey(comp.material, comp.process);
    if (!key || combos.has(key)) {
      return;
    }
    combos.set(key, {
      material: comp.material || '',
      process: comp.process || '',
      Fr: comp.Fr,
      Efp: comp.Efp,
      Ecp: comp.Ecp,
      Cfp: comp.Cfp,
      Ccp: comp.Ccp,
      Ems: comp.Ems,
      Erfp: comp.Erfp,
    });
  });
  const rows = Array.from(combos.values()).map((row) =>
    [
      row.material,
      row.process,
      formatPercent(row.Fr, decimalSeparator),
      formatPercent(row.Efp, decimalSeparator),
      formatPercent(row.Ecp, decimalSeparator),
      formatPercent(row.Cfp, decimalSeparator),
      formatPercent(row.Ccp, decimalSeparator),
      formatPercent(row.Ems, decimalSeparator),
      formatPercent(row.Erfp, decimalSeparator),
    ].join(delimiter)
  );
  return `${header}\n${rows.join('\n')}\n`;
}

/**
 * Builds a CSV with the latest results per component.
 * @param {import('./circularity.js').ComponentInput[]} components
 * @returns {string}
 */
  function exportResultsCsv(components, formatting = defaultFormatting()) {
  const { decimalSeparator, delimiter } = formatting;
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
  ].join(delimiter);
  const body = components
    .map((comp) =>
      [
        comp.id,
        comp.name,
        formatNumber(comp.massKg, 3, decimalSeparator),
        formatNumber(comp.CCI, 4, decimalSeparator),
        formatNumber(comp.CII, 2, decimalSeparator),
        formatNumber(comp.LFI, 4, decimalSeparator),
        formatNumber(comp.flows?.V, 3, decimalSeparator),
        formatNumber(comp.flows?.W, 3, decimalSeparator),
        formatNumber(comp.flows?.Rin, 3, decimalSeparator),
        formatNumber(comp.flows?.Rout, 3, decimalSeparator),
        formatNumber(comp.flows?.absR, 3, decimalSeparator),
        formatNumber(comp.flows?.C, 3, decimalSeparator),
      ].join(delimiter)
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

  function formatNumber(value, digits = 3, decimalSeparator = '.') {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '';
  }
  const formatted = Number(value).toFixed(digits);
  if (decimalSeparator === ',') {
    return formatted.replace('.', ',');
  }
  return formatted;
}

  function formatPercent(fraction, decimalSeparator = '.') {
  return formatNumber(clamp01(fraction) * 100, 1, decimalSeparator);
}

  function defaultFormatting() {
  return { decimalSeparator: '.', delimiter: ',' };
}

  function buildFactorKey(material, process) {
  const mat = (material || '').trim().toLowerCase();
  const proc = (process || '').trim().toLowerCase();
  return `${mat}|${proc}`;
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
