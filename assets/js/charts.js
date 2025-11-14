/**
 * charts.js – small wrapper around Chart.js that renders CCI/CII bar charts
 * and draws the PCI reference line. All DOM interaction happens in app.js.
 */

(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;

const DEFAULT_OPTIONS = {
  responsive: false,
  maintainAspectRatio: false,
  animation: false,
  layout: {
    padding: { top: 16, right: 16, bottom: 32, left: 8 },
  },
  scales: {
    x: {
      ticks: {
        color: '#4b5b79',
        maxRotation: 45,
        minRotation: 45,
      },
      grid: { display: false },
    },
    y: {
      beginAtZero: true,
      ticks: { color: '#4b5b79' },
      grid: { color: '#eef2ff' },
    },
  },
  plugins: {
    legend: { display: false },
  },
};

/**
 * Renders the CCI bar chart.
 * @param {HTMLCanvasElement} canvas
 * @param {import('./circularity.js').ComponentInput[]} components
 * @param {Chart|null} existingChart
 * @returns {Chart|null}
 */
function renderCciChart(canvas, components, existingChart = null, pciValue = null) {
  return renderBarChart(canvas, components, existingChart, {
    label: 'CCI (0–1)',
    backgroundColor: '#4f46e5',
    dataKey: (comp) => Number((comp.CCI ?? 0).toFixed(4)),
    suggestedMax: 1,
    pciLine: pciValue,
  });
}

/**
 * Renders the CII bar chart.
 * @param {HTMLCanvasElement} canvas
 * @param {import('./circularity.js').ComponentInput[]} components
 * @param {Chart|null} existingChart
 * @returns {Chart|null}
 */
  function renderCiiChart(canvas, components, existingChart = null) {
  return renderBarChart(canvas, components, existingChart, {
    label: 'CII (%)',
    backgroundColor: '#10b981',
    dataKey: (comp) => Number((comp.CII ?? 0).toFixed(2)),
    suggestedMax: 100,
  });
}

function renderBarChart(canvas, components, existingChart, config) {
  if (!canvas) {
    return null;
  }
  if (existingChart) {
    existingChart.destroy();
  }
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js is not loaded; skip rendering chart.');
    return null;
  }
  const labels = components.map((comp) => formatComponentLabel(comp));
  const targetHeight = 360;
  const parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 600;
  canvas.width = parentWidth;
  canvas.height = targetHeight;
  canvas.style.height = `${targetHeight}px`;
  const data = components.map((comp) => config.dataKey(comp));
  const ctx = canvas.getContext('2d');
  const datasets = [
    {
      label: config.label,
      data,
      backgroundColor: config.backgroundColor,
      borderRadius: 6,
    },
  ];
  const plugins = [];
  if (config.pciLine !== undefined && config.pciLine !== null && !Number.isNaN(config.pciLine)) {
    plugins.push(createPciLabelPlugin(config.pciLine));
  }
  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets,
    },
    options: {
      ...DEFAULT_OPTIONS,
      scales: {
        ...DEFAULT_OPTIONS.scales,
        y: {
          ...DEFAULT_OPTIONS.scales.y,
          suggestedMax: config.suggestedMax,
        },
      },
    },
    plugins,
  });
}

function createPciLabelPlugin(value) {
  return {
    id: 'pciLabel',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      const y = scales.y.getPixelForValue(value);
      if (!Number.isFinite(y)) {
        return;
      }
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#f97316';
      ctx.font = '12px "Inter", "Segoe UI", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('PCI', chartArea.left + 4, y - 4);
      ctx.restore();
    },
  };
}

function formatComponentLabel(component) {
  const id = component.id || '—';
  const name = truncate(component.name || 'n/a');
  const material = truncate(component.material || 'n/a');
  const process = truncate(component.process || 'n/a');
  return [`${id} - ${name}`, `${material} - ${process}`];
}

function truncate(value, max = 14) {
  const str = `${value}`;
  if (str.length <= max) {
    return str;
  }
  return `${str.slice(0, max - 1)}…`;
}

  globalScope.ChartHelpers = {
    renderCciChart,
    renderCiiChart,
  };
})();
