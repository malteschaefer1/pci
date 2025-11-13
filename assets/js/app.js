import {
  computeCircularityIndicators,
} from './circularity.js';
import {
  generateBomTemplateCsv,
  generateInputFactorsTemplateCsv,
  parseBomCsv,
  parseInputFactorsCsv,
  exportComponentsToBomCsv,
  exportComponentsToInputFactorsCsv,
  exportResultsCsv,
} from './csv-utils.js';
import { renderCciChart, renderCiiChart } from './charts.js';

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
};

const elements = {};
let statusTimeoutId = null;

document.addEventListener('DOMContentLoaded', init);

function init() {
  cacheElements();
  bindEvents();
  state.components = cloneComponents(exampleComponents);
  renderComponentTable();
  updateProductParamsFromForm();
  updateComputeButtonState();
  setStatus('Ready. Load CSVs or use the example data to get started.', 'info');
}

function cacheElements() {
  elements.statusPanel = document.getElementById('status-panel');
  elements.productForm = document.getElementById('product-form');
  elements.tabButtons = document.querySelectorAll('.tab-button');
  elements.tabPanels = document.querySelectorAll('.tab-panel');
  elements.componentsTableBody = document.getElementById('components-table-body');
  elements.addRowBtn = document.getElementById('add-row');
  elements.resetExampleBtn = document.getElementById('reset-example');
  elements.computeBtn = document.getElementById('compute-btn');
  elements.resultsSection = document.getElementById('results');
  elements.productNameDisplay = document.getElementById('product-name-display');
  elements.useFactor = document.getElementById('use-factor');
  elements.totalMass = document.getElementById('total-mass');
  elements.pciValue = document.getElementById('pci-value');
  elements.pciBar = document.getElementById('pci-bar');
  elements.resultsTableBody = document.getElementById('results-table-body');
  elements.cciChartCanvas = document.getElementById('cci-chart');
  elements.ciiChartCanvas = document.getElementById('cii-chart');
  elements.bomUpload = document.getElementById('bom-upload');
  elements.factorsUpload = document.getElementById('factors-upload');
}

function bindEvents() {
  elements.productForm.addEventListener('input', () => {
    updateProductParamsFromForm();
  });

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
    switchTab('manual');
    setStatus('Restored the example data set.', 'info');
  });

  elements.componentsTableBody.addEventListener('input', handleTableInput);
  elements.componentsTableBody.addEventListener('click', handleTableClick);

  elements.computeBtn.addEventListener('click', handleComputation);
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

function renderComponentTable() {
  const rows = state.components
    .map((component, index) => renderComponentRow(component, index))
    .join('');
  elements.componentsTableBody.innerHTML = rows;
  clearValidationStyles();
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
    if (type === 'bom') {
      downloadTextFile('bom_current.csv', exportComponentsToBomCsv(state.components));
    } else if (type === 'factors') {
      downloadTextFile('input_factors_current.csv', exportComponentsToInputFactorsCsv(state.components));
    } else if (type === 'results') {
      if (!state.lastComputation) {
        throw new Error('Run a calculation before exporting results.');
      }
      downloadTextFile('circularity_results.csv', exportResultsCsv(state.lastComputation.components));
    }
  } catch (error) {
    setStatus(error.message || 'Failed to export CSV.', 'error');
  }
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
      } else {
        const parsed = parseInputFactorsCsv(event.target.result);
        mergeInputFactors(parsed);
        setStatus(`Parsed ${parsed.size} input-factor rows.`, 'success');
      }
      renderComponentTable();
      updateComputeButtonState();
      switchTab('manual');
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

function mergeInputFactors(factorMap) {
  factorMap.forEach((factorValues, id) => {
    const target = state.components.find((comp) => comp.id === id);
    if (target) {
      Object.assign(target, factorValues);
    } else {
      state.components.push({
        ...createEmptyComponent(),
        id,
        ...factorValues,
      });
    }
  });
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
    updateCharts(result.components);
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
  elements.useFactor.textContent = result.X.toFixed(3);
  elements.totalMass.textContent = `${result.M_total.toFixed(3)} kg`;
  elements.pciValue.textContent = result.PCI.toFixed(3);
  elements.pciBar.style.width = `${Math.max(0, Math.min(1, result.PCI)) * 100}%`;

  const rows = result.components
    .map((component) => {
      const notes = component.warnings?.length ? component.warnings.join(' ') : '';
      return `
        <tr>
          <td>${escapeHtml(component.id)}</td>
          <td>${escapeHtml(component.name)}</td>
          <td>${component.massKg.toFixed(3)}</td>
          <td>${(component.CCI ?? 0).toFixed(3)}</td>
          <td>${(component.CII ?? 0).toFixed(1)}</td>
          <td>${escapeHtml(notes)}</td>
        </tr>`;
    })
    .join('');
  elements.resultsTableBody.innerHTML = rows;
}

function updateCharts(components) {
  state.charts.cci = renderCciChart(elements.cciChartCanvas, components, state.charts.cci);
  state.charts.cii = renderCiiChart(elements.ciiChartCanvas, components, state.charts.cii);
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
  elements.statusPanel.textContent = message;
  elements.statusPanel.className = `status-panel ${type}`;
  if (statusTimeoutId) {
    clearTimeout(statusTimeoutId);
  }
  statusTimeoutId = window.setTimeout(() => {
    elements.statusPanel.textContent = '';
    elements.statusPanel.className = 'status-panel';
  }, 8000);
}
