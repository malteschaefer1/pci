(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;

  const DEFAULT_OPTIONS = {
    responsive: true,
    scales: {
      x: {
        ticks: { color: '#4b5b79' },
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
  function renderCciChart(canvas, components, existingChart = null) {
  return renderBarChart(canvas, components, existingChart, {
    label: 'CCI (0–1)',
    backgroundColor: '#4f46e5',
    dataKey: (comp) => Number((comp.CCI ?? 0).toFixed(4)),
    suggestedMax: 1,
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
  const labels = components.map((comp) => comp.name || comp.id);
  const data = components.map((comp) => config.dataKey(comp));
  const ctx = canvas.getContext('2d');
  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: config.label,
          data,
          backgroundColor: config.backgroundColor,
          borderRadius: 6,
        },
      ],
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
  });
  }

  globalScope.ChartHelpers = {
    renderCciChart,
    renderCiiChart,
  };
})();
