/**
 * app.js – orchestrates all UI interactions (forms, tables, CSV uploads, charts).
 * Think of it as the glue between the HTML widgets and the pure math helpers.
 */

const Circularity = (typeof window !== 'undefined' && window.PCICircularity) || {};
const CsvUtils = (typeof window !== 'undefined' && window.CsvUtils) || {};
const ChartHelpers = (typeof window !== 'undefined' && window.ChartHelpers) || {};

const { computeCircularityIndicators } = Circularity;
const {
  generateBomTemplateCsv,
  generateInputFactorsTemplateCsv,
  parseBomCsv,
  parseInputFactorsCsv,
  exportComponentsToBomCsv,
  exportComponentsToInputFactorsCsv,
  exportResultsCsv,
} = CsvUtils;
const { renderCciChart, renderCiiChart } = ChartHelpers;

const DEBUG_LOG = false;

const exampleComponents = [
  {
    id: 'C1',
    name: 'Housing',
    material: 'Polyamide',
    process: 'Injection-molding',
    massKg: 0.16,
    Fr: 0,
    Efp: 1,
    Ecp: 0.95,
    Cfp: 0,
    Ccp: 1,
    Ems: 0.3,
    Erfp: 0.3,
  },
  {
    id: 'C2',
    name: 'PCB',
    material: 'FR-4',
    process: 'Electronics assembly',
    massKg: 0.02,
    Fr: 0,
    Efp: 1,
    Ecp: 0.9,
    Cfp: 0,
    Ccp: 0,
    Ems: 0.2,
    Erfp: 0.1,
  },
  {
    id: 'C3',
    name: 'Aluminum bracket',
    material: 'Aluminum',
    process: 'Die-casting',
    massKg: 0.05,
    Fr: 0.5,
    Efp: 0.7,
    Ecp: 0.9,
    Cfp: 0.5,
    Ccp: 0.9,
    Ems: 0.8,
    Erfp: 0.85,
  },
];

const DEFAULT_STATUS_MESSAGE = 'Ready for input.';
const NUMERIC_PATTERN = /^[0-9]*\.?[0-9]*$/;
const TEXT_PATTERN = /^[\w\s\-().,/&+':%]*$/;
const MANUAL_FACTOR_FIELDS = ['Fr', 'Efp', 'Ecp', 'Cfp', 'Ccp', 'Ems', 'Erfp'];
const COMPONENT_PERCENT_DEFAULTS = {
  Fr: 0,
  Efp: 1,
  Ecp: 1,
  Cfp: 0,
  Ccp: 0,
  Ems: 0,
  Erfp: 0,
};

const state = {
  components: [],
  productParams: {
    productName: '',
    Fu: 0,
    Cu: 0.6,
    Cr: 0.56,
    Ld: 1,
    L: 1,
    Id: 1,
    I: 1,
  },
  charts: {
    cci: null,
    cii: null,
  },
  lastComputation: null,
  manualBomRows: [],
  manualFactorRows: [],
  manualFactorsReady: false,
  manualEditorReady: false,
  sortDescending: {
    cci: false,
    cii: false,
  },
};

const elements = {};
let statusTimeoutId = null;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  cacheElements();
  bindEvents();
  state.components = cloneComponents(exampleComponents);
  renderComponentTable();
  hydrateManualTablesFromComponents();
  updateProductParamsFromForm();
  updateComputeButtonState();
  toggleManualFactorsVisibility(state.manualFactorsReady);
  toggleManualEditorVisibility(state.manualEditorReady);
  updateSortButtons();
  setStatus('Ready. Load CSVs or use the example data to get started.', 'info');
}

function cacheElements() {
  elements.statusPanel = document.getElementById('status-panel');
  elements.statusMessage = document.getElementById('status-message');
  elements.productForm = document.getElementById('product-form');
  elements.tabButtons = document.querySelectorAll('.tab-button');
  elements.tabPanels = document.querySelectorAll('.tab-panel');
  elements.componentsTableBody = document.getElementById('components-table-body');
  elements.addRowBtn = document.getElementById('add-row');
  elements.resetExampleBtn = document.getElementById('reset-example');
  elements.computeBtn = document.getElementById('compute-btn');
  elements.resultsSection = document.getElementById('results');
  elements.productNameDisplay = document.getElementById('product-name-display');
  elements.totalMass = document.getElementById('total-mass');
  elements.pciValue = document.getElementById('pci-value');
  elements.pciBar = document.getElementById('pci-bar');
  elements.resultsTableBody = document.getElementById('results-table-body');
  elements.cciChartCanvas = document.getElementById('cci-chart');
  elements.ciiChartCanvas = document.getElementById('cii-chart');
  elements.bomUpload = document.getElementById('bom-upload');
  elements.factorsUpload = document.getElementById('factors-upload');
  elements.manualBomBody = document.getElementById('manual-bom-body');
  elements.manualFactorBody = document.getElementById('manual-factor-body');
  elements.manualFactorsCard = document.getElementById('manual-factors-card');
  elements.manualFactorsPlaceholder = document.getElementById('manual-factors-placeholder');
  elements.manualEditorCard = document.getElementById('manual-editor-card');
  elements.manualEditorPlaceholder = document.getElementById('manual-editor-placeholder');
  elements.sortCciBtn = document.getElementById('sort-cci');
  elements.sortCiiBtn = document.getElementById('sort-cii');
  elements.useFactorValue = document.getElementById('use-factor-value');
  elements.useFactorBar = document.getElementById('use-factor-bar');
  elements.lfiValue = document.getElementById('lfi-value');
  elements.lfiBar = document.getElementById('lfi-bar');
  elements.totalVirgin = document.getElementById('total-virgin');
  elements.totalWaste = document.getElementById('total-waste');
  elements.decimalSeparator = document.getElementById('decimal-separator');
  elements.bomAddRowBtn = document.getElementById('bom-add-row');
  elements.factorsAddRowBtn = document.getElementById('factors-add-row');
  elements.bomCompleteBtn = document.getElementById('bom-complete');
  elements.factorsCompleteBtn = document.getElementById('factors-complete');
  elements.resetProductParamsBtn = document.getElementById('reset-product-params');
  elements.bomSuggestionLists = {
    part: document.getElementById('bom-suggest-part'),
    partName: document.getElementById('bom-suggest-name'),
    material: document.getElementById('bom-suggest-material'),
    massKg: document.getElementById('bom-suggest-mass'),
    process: document.getElementById('bom-suggest-process'),
  };
}

function bindEvents() {
  elements.productForm.addEventListener('input', (event) => {
    if (event.target instanceof HTMLInputElement) {
      event.target.dataset.dirty = 'true';
      validateFormField(event.target);
    }
    updateProductParamsFromForm();
  });

  elements.productForm.addEventListener(
    'focusout',
    (event) => {
      if (event.target instanceof HTMLInputElement) {
        event.target.dataset.dirty = 'true';
        validateFormField(event.target);
      }
    },
    true
  );

  elements.tabButtons.forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });

  document.querySelectorAll('[data-download]').forEach((button) => {
    button.addEventListener('click', () => handleTemplateDownload(button.dataset.download));
  });

  document.querySelectorAll('[data-export]').forEach((button) => {
    button.addEventListener('click', () => handleExport(button.dataset.export));
  });

  elements.bomUpload.addEventListener('change', (event) => handleCsvUpload('bom', event.target.files?.[0]));
  elements.factorsUpload.addEventListener('change', (event) => handleCsvUpload('factors', event.target.files?.[0]));

  elements.addRowBtn.addEventListener('click', () => {
    state.components.push(createEmptyComponent());
    renderComponentTable();
    updateComputeButtonState();
    switchTab('manual');
  });

  elements.resetExampleBtn.addEventListener('click', () => {
    state.components = cloneComponents(exampleComponents);
    renderComponentTable();
    updateComputeButtonState();
    hydrateManualTablesFromComponents();
    switchTab('manual');
    setStatus('Restored the example data set.', 'info');
  });

  elements.componentsTableBody.addEventListener('input', handleTableInput);
  elements.componentsTableBody.addEventListener('click', handleTableClick);

  elements.computeBtn.addEventListener('click', handleComputation);

  elements.resetProductParamsBtn?.addEventListener('click', () => {
    resetProductParams();
    setStatus('Product parameters reset to defaults.', 'info');
  });

  elements.manualBomBody?.addEventListener('input', handleManualBomInput);
  elements.manualBomBody?.addEventListener('click', handleManualBomClick);
  elements.manualFactorBody?.addEventListener('input', handleManualFactorInput);
  elements.manualFactorBody?.addEventListener('click', handleManualFactorClick);
  elements.bomAddRowBtn?.addEventListener('click', () => {
    addManualBomRow();
    setStatus('Added a BoM row (copied from previous entry).', 'info');
  });
  elements.factorsAddRowBtn?.addEventListener('click', () => {
    addManualFactorRow();
    setStatus('Added an input-factor row (copied from previous entry).', 'info');
  });
  elements.bomCompleteBtn?.addEventListener('click', handleBomComplete);
  elements.factorsCompleteBtn?.addEventListener('click', handleFactorsComplete);
  elements.sortCciBtn?.addEventListener('click', () => toggleChartSorting('cci'));
  elements.sortCiiBtn?.addEventListener('click', () => toggleChartSorting('cii'));
}

function switchTab(name) {
  elements.tabButtons.forEach((btn) => {
    const active = btn.dataset.tab === name;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active);
  });
  elements.tabPanels.forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.tabPanel !== name);
  });
}

function updateProductParamsFromForm() {
  const formData = new FormData(elements.productForm);
  state.productParams.productName = formData.get('productName')?.toString().trim() || '';
  state.productParams.Fu = percentToFraction(formData.get('Fu'));
  state.productParams.Cu = percentToFraction(formData.get('Cu'));
  state.productParams.Cr = percentToFraction(formData.get('Cr'));
  state.productParams.Ld = toPositiveNumber(formData.get('Ld'));
  state.productParams.L = toPositiveNumber(formData.get('L'));
  state.productParams.Id = toPositiveNumber(formData.get('Id'));
  state.productParams.I = toPositiveNumber(formData.get('I'));
}

function resetProductParams() {
  if (!elements.productForm) {
    return;
  }
  const defaults = {
    productName: '',
    Fu: 0,
    Cu: 60,
    Cr: 56,
    Ld: 1,
    L: 1,
    Id: 1,
    I: 1,
  };
  Object.entries(defaults).forEach(([key, value]) => {
    const input = elements.productForm.querySelector(`[name="${key}"]`);
    if (input) {
      input.value = typeof value === 'number' ? value.toString() : value;
      input.dataset.dirty = 'false';
      setFieldFeedback(input, '');
    }
  });
  updateProductParamsFromForm();
}

function renderComponentTable() {
  const rows = state.components
    .map((component, index) => renderComponentRow(component, index))
    .join('');
  elements.componentsTableBody.innerHTML = rows;
  clearValidationStyles();
}

function hydrateManualTablesFromComponents() {
  if (state.components.length) {
    state.manualBomRows = state.components.map((comp, index) => ({
      part: comp.id || comp.name || `Component ${index + 1}`,
      partName: comp.name || '',
      material: comp.material || '',
      process: comp.process || '',
      massKg: comp.massKg ?? '',
    }));
  } else {
    state.manualBomRows = [createDefaultBomRow()];
  }
  state.manualFactorsReady = false;
  state.manualEditorReady = false;
  state.manualFactorRows = [createDefaultFactorRow()];
  toggleManualFactorsVisibility(false);
  toggleManualEditorVisibility(false);
  renderManualTables();
}

function renderManualTables() {
  renderManualBomTable();
  renderManualFactorTable();
}

function renderManualBomTable() {
  if (!elements.manualBomBody) {
    return;
  }
  if (!state.manualBomRows.length) {
    state.manualBomRows = [createDefaultBomRow()];
  }
  const rows = state.manualBomRows
    .map(
      (row, index) => `
        <tr data-index="${index}">
          <td><input type="text" data-field="part" list="bom-suggest-part" value="${escapeHtml(row.part || '')}" placeholder="e.g., Housing" /></td>
          <td><input type="text" data-field="partName" list="bom-suggest-name" value="${escapeHtml(row.partName || '')}" placeholder="Cover plate" /></td>
          <td><input type="text" data-field="material" list="bom-suggest-material" value="${escapeHtml(row.material || '')}" placeholder="Polyamide" /></td>
          <td><input type="number" step="0.0001" min="0" data-field="massKg" list="bom-suggest-mass" value="${row.massKg ?? ''}" placeholder="0.000" /></td>
          <td><input type="text" data-field="process" list="bom-suggest-process" value="${escapeHtml(row.process || '')}" placeholder="Injection-molding" /></td>
          <td><button type="button" class="secondary manual-delete" data-action="delete-bom" aria-label="Delete BoM row">✕</button></td>
        </tr>`
    )
    .join('');
  elements.manualBomBody.innerHTML = rows;
  updateBomSuggestions();
}

function renderManualFactorTable() {
  if (!elements.manualFactorBody) {
    return;
  }
  if (!state.manualFactorsReady) {
    elements.manualFactorBody.innerHTML = '';
    return;
  }
  if (!state.manualFactorRows.length) {
    state.manualFactorRows = [createDefaultFactorRow()];
  }
  const rows = state.manualFactorRows
    .map((row, index) => {
      const percentInputs = MANUAL_FACTOR_FIELDS.map(
        (field) =>
          `<td><input type="number" min="0" max="100" step="0.1" data-field="${field}" value="${row[field] ?? ''}" placeholder="0.0 - 100.0" /></td>`
      ).join('');
      return `
        <tr data-index="${index}">
          <td><input type="text" data-field="material" value="${escapeHtml(row.material || '')}" placeholder="Polyamide" /></td>
          <td><input type="text" data-field="process" value="${escapeHtml(row.process || '')}" placeholder="Injection-molding" /></td>
          ${percentInputs}
          <td><button type="button" class="secondary manual-delete" data-action="delete-factor" aria-label="Delete factor row">✕</button></td>
        </tr>`;
    })
    .join('');
  elements.manualFactorBody.innerHTML = rows;
}

function toggleManualFactorsVisibility(show) {
  if (elements.manualFactorsCard) {
    elements.manualFactorsCard.hidden = !show;
  }
  if (elements.manualFactorsPlaceholder) {
    elements.manualFactorsPlaceholder.classList.toggle('hidden', show);
  }
}

function toggleManualEditorVisibility(show) {
  if (elements.manualEditorCard) {
    elements.manualEditorCard.hidden = !show;
  }
  if (elements.manualEditorPlaceholder) {
    elements.manualEditorPlaceholder.classList.toggle('hidden', show);
  }
}

function toggleChartSorting(metric) {
  if (!state.lastComputation) {
    setStatus('Run a calculation before sorting charts.', 'error');
    return;
  }
  state.sortDescending[metric] = !state.sortDescending[metric];
  updateSortButtons();
  updateCharts({
    data: state.lastComputation.components,
    pci: state.lastComputation.PCI,
  });
}

function updateSortButtons() {
  if (elements.sortCciBtn) {
    elements.sortCciBtn.textContent = state.sortDescending.cci ? 'Reset order' : 'Sort high \u2192 low';
  }
  if (elements.sortCiiBtn) {
    elements.sortCiiBtn.textContent = state.sortDescending.cii ? 'Reset order' : 'Sort high \u2192 low';
  }
}

function updateBomSuggestions() {
  const lists = elements.bomSuggestionLists;
  if (!lists) {
    return;
  }
  const suggestionSets = {
    part: new Set(),
    partName: new Set(),
    material: new Set(),
    massKg: new Set(),
    process: new Set(),
  };
  state.manualBomRows.forEach((row) => {
    Object.keys(suggestionSets).forEach((key) => {
      const value = row[key];
      if (value !== undefined && value !== null && `${value}`.trim()) {
        suggestionSets[key].add(`${value}`.trim());
      }
    });
  });
  Object.entries(lists).forEach(([key, datalist]) => {
    if (!datalist) {
      return;
    }
    const options = Array.from(suggestionSets[key] || [])
      .map((value) => `<option value="${escapeHtml(value)}"></option>`)
      .join('');
    datalist.innerHTML = options;
  });
}

function createDefaultBomRow() {
  return { part: '', partName: '', material: '', massKg: '', process: '' };
}

function createDefaultFactorRow() {
  const row = { material: '', process: '' };
  MANUAL_FACTOR_FIELDS.forEach((field) => {
    row[field] = '';
  });
  return row;
}

function addManualBomRow() {
  const last = state.manualBomRows[state.manualBomRows.length - 1] || createDefaultBomRow();
  state.manualBomRows.push({ ...last });
  renderManualBomTable();
  invalidateManualFactors();
}

function addManualFactorRow() {
  const last = state.manualFactorRows[state.manualFactorRows.length - 1] || createDefaultFactorRow();
  state.manualFactorRows.push({ ...last });
  renderManualFactorTable();
}

function handleManualBomInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const row = target.closest('tr');
  if (!row) {
    return;
  }
  const index = Number(row.dataset.index);
  const field = target.dataset.field;
  if (!field || !state.manualBomRows[index]) {
    return;
  }
  state.manualBomRows[index][field] = target.value;
  if (field === 'material' || field === 'process') {
    invalidateManualFactors();
  }
}

function handleManualFactorInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const row = target.closest('tr');
  if (!row) {
    return;
  }
  const index = Number(row.dataset.index);
  const field = target.dataset.field;
  if (!field || !state.manualFactorRows[index]) {
    return;
  }
  state.manualFactorRows[index][field] = target.value;
}

function handleManualBomClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  if (target.dataset.action === 'delete-bom') {
    const row = target.closest('tr');
    if (!row) {
      return;
    }
    const index = Number(row.dataset.index);
    removeManualRow(state.manualBomRows, index, createDefaultBomRow);
    renderManualBomTable();
    invalidateManualFactors();
  }
}

function handleManualFactorClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  if (target.dataset.action === 'delete-factor') {
    const row = target.closest('tr');
    if (!row) {
      return;
    }
    const index = Number(row.dataset.index);
    removeManualRow(state.manualFactorRows, index, createDefaultFactorRow);
    renderManualFactorTable();
  }
}

function removeManualRow(collection, index, factory) {
  if (collection.length <= 1) {
    collection[0] = { ...factory() };
    return;
  }
  collection.splice(index, 1);
}

function invalidateManualFactors() {
  if (!state.manualFactorsReady) {
    return;
  }
  state.manualFactorsReady = false;
  state.manualEditorReady = false;
  toggleManualFactorsVisibility(false);
  toggleManualEditorVisibility(false);
  renderManualFactorTable();
}

function handleBomComplete() {
  const validation = validateManualBomRows();
  if (!validation.valid) {
    setStatus(`Fix BoM rows: ${validation.messages.join(' ')}`, 'error');
    return;
  }
  syncComponentsFromManualTables();
  generateManualFactorsFromBom();
  setStatus('BoM captured. Input factors generated for each material/process combination.', 'success');
}

function handleFactorsComplete() {
  if (!state.manualFactorsReady) {
    setStatus('Complete the BoM first to generate input factors.', 'error');
    return;
  }
  const validation = validateManualFactorRows();
  if (!validation.valid) {
    setStatus(`Fix input-factor rows: ${validation.messages.join(' ')}`, 'error');
    return;
  }
  syncComponentsFromManualTables();
  setStatus('Input factors captured. Components updated with the latest recycling efficiencies.', 'success');
  state.manualEditorReady = true;
  toggleManualEditorVisibility(true);
}

function generateManualFactorsFromBom() {
  state.manualFactorRows = buildManualFactorRowsFromBom(state.manualFactorRows);
  state.manualFactorsReady = true;
  toggleManualFactorsVisibility(true);
  renderManualFactorTable();
}

function validateManualBomRows() {
  const messages = [];
  let allValid = true;
  state.manualBomRows.forEach((row, index) => {
    let rowValid = true;
    if (!row.part?.trim()) {
      rowValid = false;
      messages.push(`row ${index + 1}: Part ID is required.`);
    }
    if (!row.material?.trim()) {
      rowValid = false;
      messages.push(`row ${index + 1}: Material is required.`);
    }
    if (!row.process?.trim()) {
      rowValid = false;
      messages.push(`row ${index + 1}: Process is required.`);
    }
    const mass = Number(row.massKg);
    if (!Number.isFinite(mass) || mass <= 0) {
      rowValid = false;
      messages.push(`row ${index + 1}: Mass must be a positive number.`);
    }
    markManualRowError(elements.manualBomBody, index, !rowValid);
    allValid = allValid && rowValid;
  });
  return { valid: allValid, messages };
}

function validateManualFactorRows() {
  const messages = [];
  let allValid = true;
  state.manualFactorRows.forEach((row, index) => {
    let rowValid = true;
    if (!row.material?.trim()) {
      rowValid = false;
      messages.push(`row ${index + 1}: Material is required.`);
    }
    if (!row.process?.trim()) {
      rowValid = false;
      messages.push(`row ${index + 1}: Process is required.`);
    }
    MANUAL_FACTOR_FIELDS.forEach((field) => {
      const raw = row[field];
      if (raw === undefined || raw === null || `${raw}`.trim() === '') {
        rowValid = false;
        messages.push(`row ${index + 1}: ${field} requires a value between 0 and 100%.`);
        return;
      }
      const numericValue = Number(raw);
      if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 100) {
        rowValid = false;
        messages.push(`row ${index + 1}: ${field} must be between 0 and 100%.`);
      }
    });
    markManualRowError(elements.manualFactorBody, index, !rowValid);
    allValid = allValid && rowValid;
  });
  return { valid: allValid, messages };
}

function markManualRowError(container, index, hasError) {
  if (!container) {
    return;
  }
  const row = container.querySelector(`tr[data-index="${index}"]`);
  if (row) {
    row.classList.toggle('row-error', hasError);
  }
}

function syncComponentsFromManualTables() {
  if (!state.manualBomRows.length) {
    setStatus('Add at least one BoM row before syncing.', 'error');
    return;
  }
  const factorLookup = buildFactorLookup();
  const previous = new Map(state.components.map((comp) => [comp.id, comp]));
  const components = state.manualBomRows.map((row, index) => {
    const partId = row.part?.trim() || `C${index + 1}`;
    const partName = row.partName?.trim() || partId;
    const existing = previous.get(partId) || createEmptyComponent();
    const material = row.material?.trim() || '';
    const process = row.process?.trim() || '';
    const factorKey = buildFactorKey(material, process);
    const factor = factorKey ? factorLookup.get(factorKey) : undefined;
    const mass = Number(row.massKg);
    const updated = {
      ...existing,
      id: partId,
      name: partName,
      material,
      process,
      massKg: Number.isFinite(mass) ? mass : 0,
    };
    MANUAL_FACTOR_FIELDS.forEach((field) => {
      const fallback = existing[field] ?? COMPONENT_PERCENT_DEFAULTS[field];
      updated[field] = factor?.[field] ?? fallback;
    });
    return updated;
  });
  state.components = components;
  renderComponentTable();
  updateComputeButtonState();
}

function buildFactorLookup() {
  const lookup = new Map();
  state.manualFactorRows.forEach((row) => {
    const key = buildFactorKey(row.material, row.process);
    if (!key) {
      return;
    }
    const entry = {};
    MANUAL_FACTOR_FIELDS.forEach((field) => {
      const value = Number(row[field]);
      if (Number.isFinite(value)) {
        entry[field] = clamp01(value / 100);
      }
    });
    lookup.set(key, entry);
  });
  return lookup;
}

function buildFactorKey(material, process) {
  const mat = material?.trim().toLowerCase();
  const proc = process?.trim().toLowerCase();
  if (!mat && !proc) {
    return null;
  }
  return `${mat}|${proc}`;
}

function buildManualFactorRowsFromBom(previousRows = []) {
  const previousMap = new Map();
  previousRows.forEach((row) => {
    const key = buildFactorKey(row.material, row.process);
    if (key) {
      previousMap.set(key, row);
    }
  });
  const combos = [];
  const seen = new Set();
  state.manualBomRows.forEach((row) => {
    const key = buildFactorKey(row.material, row.process);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    const previous = previousMap.get(key);
    const newRow = {
      material: row.material || '',
      process: row.process || '',
    };
    MANUAL_FACTOR_FIELDS.forEach((field) => {
      if (previous && previous[field] !== undefined) {
        newRow[field] = previous[field];
      } else {
        newRow[field] = formatPercentInput(getComponentFactorDefault(field, row.material, row.process));
      }
    });
    combos.push(newRow);
  });
  if (!combos.length) {
    combos.push(createDefaultFactorRow());
  }
  return combos;
}

function getComponentFactorDefault(field, material, process) {
  const match = state.components.find(
    (comp) =>
      comp.material?.toLowerCase() === (material || '').toLowerCase() &&
      comp.process?.toLowerCase() === (process || '').toLowerCase()
  );
  if (match && typeof match[field] === 'number') {
    return match[field];
  }
  return COMPONENT_PERCENT_DEFAULTS[field] ?? 0;
}

function formatPercentInput(fraction) {
  if (!Number.isFinite(fraction)) {
    return '';
  }
  return (fraction * 100).toFixed(1);
}

function formatDecimal(value, digits = 3) {
  if (!Number.isFinite(value)) {
    return '–';
  }
  return Number(value).toFixed(digits);
}

function renderComponentRow(component, index) {
  const percentFields = ['Fr', 'Efp', 'Ecp', 'Cfp', 'Ccp', 'Ems', 'Erfp'];
  return `
    <tr data-index="${index}">
      <td><input type="text" data-field="id" value="${escapeHtml(component.id || '')}" /></td>
      <td><input type="text" data-field="name" value="${escapeHtml(component.name || '')}" /></td>
      <td><input type="text" data-field="material" value="${escapeHtml(component.material || '')}" /></td>
      <td><input type="text" data-field="process" value="${escapeHtml(component.process || '')}" /></td>
      <td><input type="number" step="0.0001" min="0" data-field="massKg" data-type="number" value="${component.massKg ?? ''}" /></td>
      ${percentFields
        .map(
          (field) => `<td><input type="number" min="0" max="100" step="0.1" data-field="${field}" data-type="percent" value="${fractionToPercent(component[field])}" /></td>`
        )
        .join('')}
      <td><button type="button" class="secondary delete-row" aria-label="Delete row">✕</button></td>
    </tr>`;
}

function handleTableInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const field = target.dataset.field;
  if (!field) {
    return;
  }
  const row = target.closest('tr');
  if (!row) {
    return;
  }
  const index = Number(row.dataset.index);
  if (Number.isNaN(index) || !state.components[index]) {
    return;
  }
  if (target.dataset.type === 'percent') {
    state.components[index][field] = percentToFraction(target.value);
  } else if (target.dataset.type === 'number') {
    state.components[index][field] = Number(target.value);
  } else {
    state.components[index][field] = target.value;
  }
  updateComputeButtonState();
}

function handleTableClick(event) {
  const target = event.target;
  if (target instanceof HTMLElement && target.classList.contains('delete-row')) {
    const row = target.closest('tr');
    if (!row) {
      return;
    }
    const index = Number(row.dataset.index);
    state.components.splice(index, 1);
    renderComponentTable();
    updateComputeButtonState();
  }
}

function handleTemplateDownload(type) {
  try {
    if (type === 'bom') {
      downloadTextFile('bom_template.csv', generateBomTemplateCsv());
    } else if (type === 'factors') {
      downloadTextFile('input_factors_template.csv', generateInputFactorsTemplateCsv());
    }
  } catch (error) {
    setStatus(error.message || 'Failed to create template.', 'error');
  }
}

function handleExport(type) {
  try {
    if (!state.components.length) {
      throw new Error('No components available to export.');
    }
    const csvFormat = getCsvFormatting();
    if (type === 'bom') {
      downloadTextFile('bom_current.csv', exportComponentsToBomCsv(state.components, csvFormat));
    } else if (type === 'factors') {
      downloadTextFile('input_factors_current.csv', exportComponentsToInputFactorsCsv(state.components, csvFormat));
    } else if (type === 'results') {
      if (!state.lastComputation) {
        throw new Error('Run a calculation before exporting results.');
      }
      downloadTextFile(
        'circularity_results.csv',
        exportResultsCsv(state.lastComputation.components, csvFormat)
      );
    }
  } catch (error) {
    setStatus(error.message || 'Failed to export CSV.', 'error');
  }
}

function getCsvFormatting() {
  const value = elements.decimalSeparator?.value || 'dot';
  if (value === 'comma') {
    return { decimalSeparator: ',', delimiter: ';' };
  }
  return { decimalSeparator: '.', delimiter: ',' };
}

function handleCsvUpload(type, file) {
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      if (type === 'bom') {
        const parsed = parseBomCsv(event.target.result);
        mergeBomData(parsed);
        setStatus(`Parsed ${parsed.length} BoM rows.`, 'success');
        renderComponentTable();
        updateComputeButtonState();
        hydrateManualTablesFromComponents();
      } else {
        const parsed = parseInputFactorsCsv(event.target.result);
        applyFactorCombosFromCsv(parsed);
        renderComponentTable();
        updateComputeButtonState();
        setStatus(`Parsed ${parsed.size} input-factor rows.`, 'success');
      }
    } catch (error) {
      setStatus(error.message || 'Failed to parse CSV.', 'error');
    }
  };
  reader.readAsText(file);
}

function mergeBomData(newComponents) {
  const existingMap = new Map(state.components.map((comp) => [comp.id, comp]));
  state.components = newComponents.map((comp) => {
    const existing = existingMap.get(comp.id);
    if (!existing) {
      return comp;
    }
    return {
      ...comp,
      Fr: existing.Fr,
      Efp: existing.Efp,
      Ecp: existing.Ecp,
      Cfp: existing.Cfp,
      Ccp: existing.Ccp,
      Ems: existing.Ems,
      Erfp: existing.Erfp,
    };
  });
}

function applyFactorCombosFromCsv(factorMap) {
  if (!factorMap || !factorMap.size) {
    throw new Error('No input-factor rows were detected in the CSV.');
  }
  const factorLookup = new Map();
  const manualRows = [];
  factorMap.forEach((combo, key) => {
    factorLookup.set(key, combo);
    const manualRow = {
      material: combo.material || '',
      process: combo.process || '',
    };
    MANUAL_FACTOR_FIELDS.forEach((field) => {
      manualRow[field] = formatPercentInput(combo[field]);
    });
    manualRows.push(manualRow);
  });
  state.components = state.components.map((comp) => {
    const key = buildFactorKey(comp.material, comp.process);
    const combo = key ? factorLookup.get(key) : undefined;
    if (!combo) {
      return comp;
    }
    const updated = { ...comp };
    MANUAL_FACTOR_FIELDS.forEach((field) => {
      if (typeof combo[field] === 'number') {
        updated[field] = combo[field];
      }
    });
    return updated;
  });
  state.manualFactorRows = manualRows;
  state.manualFactorsReady = manualRows.length > 0;
  toggleManualFactorsVisibility(state.manualFactorsReady);
  renderManualFactorTable();
  state.manualEditorReady = state.manualFactorsReady;
  toggleManualEditorVisibility(state.manualEditorReady);
}

function createEmptyComponent() {
  return {
    id: '',
    name: '',
    material: '',
    process: '',
    massKg: 0,
    Fr: 0,
    Efp: 1,
    Ecp: 1,
    Cfp: 0,
    Ccp: 0,
    Ems: 0,
    Erfp: 0,
  };
}

function handleComputation() {
  const productValidation = validateAllProductInputs();
  if (!productValidation.valid) {
    setStatus('Fix the highlighted product parameters before computing.', 'error');
    productValidation.firstInvalid?.focus();
    return;
  }
  const validation = validateComponents();
  applyValidationStyles(validation.fieldErrors);
  if (!validation.valid) {
    setStatus('Please resolve the highlighted issues before computing.', 'error');
    switchTab('manual');
    return;
  }

  try {
    const result = computeCircularityIndicators(state.components, state.productParams);
    state.lastComputation = result;
    displayResults(result);
    setStatus(`Computed PCI = ${result.PCI.toFixed(3)} for ${result.components.length} components.`, 'success');
    if (DEBUG_LOG) {
      console.table(result.debug);
    }
  } catch (error) {
    setStatus(error.message || 'Calculation failed.', 'error');
  }
}

function displayResults(result) {
  elements.resultsSection.classList.remove('hidden');
  elements.productNameDisplay.textContent = state.productParams.productName || '—';
  elements.totalMass.textContent = `${formatDecimal(result.M_total)} kg`;
  const flows = result.productFlows || {};
  if (elements.totalVirgin) {
    elements.totalVirgin.textContent = `${formatDecimal(flows.V)} kg`;
  }
  if (elements.totalWaste) {
    elements.totalWaste.textContent = `${formatDecimal(flows.W)} kg`;
  }
  updateMeter(elements.useFactorValue, elements.useFactorBar, result.X || 0, 1);
  updateMeter(elements.lfiValue, elements.lfiBar, result.productLFI ?? computeDerivedLFI(result));
  elements.pciValue.textContent = result.PCI.toFixed(3);
  elements.pciBar.style.width = `${Math.max(0, Math.min(1, result.PCI)) * 100}%`;
  const rows = result.components
    .map((component) => {
      const notes = component.warnings?.length ? component.warnings.join(' ') : '';
      const signature = buildSignature(component);
      return `
        <tr>
          <td>${escapeHtml(signature)}</td>
          <td>${escapeHtml(component.id)}</td>
          <td>${escapeHtml(component.name)}</td>
          <td>${component.massKg.toFixed(3)}</td>
          <td>${escapeHtml(component.material || '')}</td>
          <td>${escapeHtml(component.process || '')}</td>
          <td>${(component.CCI ?? 0).toFixed(3)}</td>
          <td>${(component.CII ?? 0).toFixed(1)}</td>
          <td>${escapeHtml(notes)}</td>
        </tr>`;
    })
    .join('');
  elements.resultsTableBody.innerHTML = rows;
  updateCharts({ data: result.components, pci: result.PCI });
}

function updateMeter(valueEl, barEl, value, max = 1) {
  if (valueEl) {
    valueEl.textContent = Number.isFinite(value) ? value.toFixed(3) : '–';
  }
  if (barEl) {
    const clamped = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
    barEl.style.width = `${clamped * 100}%`;
  }
}

function computeDerivedLFI(result) {
  if (!result) {
    return 0;
  }
  const X = result.X ?? 0;
  const PCI = result.PCI ?? 0;
  if (!isFinite(X) || X <= 0) {
    return 0;
  }
  return Math.max(0, (1 - PCI) * X);
}

function buildSignature(component) {
  const id = component.id || '—';
  const name = component.name || 'n/a';
  const material = component.material || 'n/a';
  const process = component.process || 'n/a';
  return `${id} – ${name} – ${material} – ${process}`;
}

function updateCharts(componentsMeta) {
  const data = Array.isArray(componentsMeta?.data) ? componentsMeta.data : state.lastComputation?.components || [];
  const pciValue = componentsMeta?.pci ?? state.lastComputation?.PCI ?? null;
  const baseCci = data.slice();
  const baseCii = data.slice();
  const cciComponents = state.sortDescending.cci ? [...baseCci].sort((a, b) => (b.CCI ?? 0) - (a.CCI ?? 0)) : baseCci;
  const ciiComponents = state.sortDescending.cii ? [...baseCii].sort((a, b) => (b.CII ?? 0) - (a.CII ?? 0)) : baseCii;
  state.charts.cci = renderCciChart(elements.cciChartCanvas, cciComponents, state.charts.cci, pciValue);
  state.charts.cii = renderCiiChart(elements.ciiChartCanvas, ciiComponents, state.charts.cii);
}

function validateComponents() {
  const fieldErrors = new Map();
  const seenIds = new Set();
  state.components.forEach((component, index) => {
    const errors = [];
    const id = (component.id || '').trim();
    if (!id) {
      errors.push('id');
    } else if (seenIds.has(id)) {
      errors.push('id');
    } else {
      seenIds.add(id);
    }
    if (!(component.massKg > 0)) {
      errors.push('massKg');
    }
    ['Fr', 'Efp', 'Ecp', 'Cfp', 'Ccp', 'Ems', 'Erfp'].forEach((key) => {
      const value = component[key];
      if (!isFinite(value) || value < 0 || value > 1) {
        errors.push(key);
      }
    });
    if (errors.length) {
      fieldErrors.set(index, errors);
    }
  });
  return { valid: fieldErrors.size === 0, fieldErrors };
}

function applyValidationStyles(fieldErrors) {
  clearValidationStyles();
  fieldErrors.forEach((fields, index) => {
    const row = elements.componentsTableBody.querySelector(`tr[data-index="${index}"]`);
    if (!row) {
      return;
    }
    row.classList.add('row-error');
    fields.forEach((field) => {
      const input = row.querySelector(`[data-field="${field}"]`);
      if (input) {
        input.classList.add('input-error');
      }
    });
  });
}

function clearValidationStyles() {
  elements.componentsTableBody.querySelectorAll('tr').forEach((row) => row.classList.remove('row-error'));
  elements.componentsTableBody.querySelectorAll('input').forEach((input) => input.classList.remove('input-error'));
}

function updateComputeButtonState() {
  elements.computeBtn.disabled = state.components.length === 0;
}

function cloneComponents(list) {
  return list.map((item) => ({ ...item }));
}

function percentToFraction(value) {
  const num = Number(value);
  if (!isFinite(num)) {
    return 0;
  }
  return Math.max(0, Math.min(1, num / 100));
}

function fractionToPercent(value) {
  if (!isFinite(value)) {
    return 0;
  }
  return (value * 100).toFixed(1);
}

function toPositiveNumber(value) {
  const num = Number(value);
  return num > 0 ? num : 0;
}

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function escapeHtml(value) {
  return value
    ? String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
    : '';
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function setStatus(message, type = 'info') {
  if (!elements.statusPanel) {
    return;
  }
  if (elements.statusMessage) {
    elements.statusMessage.textContent = message;
  } else {
    elements.statusPanel.textContent = message;
  }
  elements.statusPanel.className = `status-panel ${type}`;
  if (statusTimeoutId) {
    clearTimeout(statusTimeoutId);
  }
  statusTimeoutId = window.setTimeout(() => {
    if (elements.statusMessage) {
      elements.statusMessage.textContent = DEFAULT_STATUS_MESSAGE;
    } else {
      elements.statusPanel.textContent = DEFAULT_STATUS_MESSAGE;
    }
    elements.statusPanel.className = 'status-panel';
  }, 8000);
}

function validateFormField(input) {
  const validationType = input.dataset.validate;
  if (!validationType) {
    return true;
  }
  const rawValue = input.value.trim();
  if (!rawValue && input.dataset.dirty !== 'true') {
    setFieldFeedback(input, '');
    return true;
  }

  let message = '';
  if (validationType === 'text') {
    if (!rawValue) {
      message = 'Value required.';
    } else if (!TEXT_PATTERN.test(rawValue)) {
      message = 'Use letters, numbers, spaces, dashes, and basic punctuation only.';
    }
  } else {
    if (!rawValue) {
      message = 'Numeric value required.';
    } else if (!NUMERIC_PATTERN.test(rawValue)) {
      message = 'Use digits and decimal points only.';
    } else {
      const numericValue = Number(rawValue);
      if (Number.isNaN(numericValue)) {
        message = 'Enter a valid number.';
      } else if (validationType === 'percentage') {
        if (numericValue < 0 || numericValue > 100) {
          message = 'Enter a percentage between 0 and 100.';
        }
      } else if (validationType === 'positive') {
        if (numericValue <= 0) {
          message = 'Enter a positive number greater than 0.';
        }
      }
    }
  }

  setFieldFeedback(input, message);
  return !message;
}

function setFieldFeedback(input, message) {
  const feedback = input.parentElement.querySelector('.field-feedback');
  if (feedback) {
    feedback.textContent = message;
  }
  input.classList.toggle('input-error', Boolean(message));
}

function validateAllProductInputs() {
  if (!elements.productForm) {
    return { valid: true, firstInvalid: null };
  }
  const inputs = Array.from(elements.productForm.querySelectorAll('input'));
  let firstInvalid = null;
  let allValid = true;
  inputs.forEach((input) => {
    input.dataset.dirty = 'true';
    const isValid = validateFormField(input);
    if (!isValid) {
      allValid = false;
      if (!firstInvalid) {
        firstInvalid = input;
      }
    }
  });
  return { valid: allValid, firstInvalid };
}
