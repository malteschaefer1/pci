/**
 * charts.js – small wrapper around Chart.js that renders CCI/CII bar charts
 * and draws the PCI reference line. All DOM interaction happens in app.js.
 */

(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  let linkedHoverCounter = 0;

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

/**
 * Renders the stacked composition chart comparing mass and CII shares.
 * @param {HTMLCanvasElement} canvas
 * @param {import('./circularity.js').ComponentInput[]} components
 * @param {Chart|null} existingChart
 * @returns {Chart|null}
 */
function renderCompositionChart(canvas, components, existingChart = null) {
  if (!canvas) {
    return null;
  }
  if (existingChart) {
    existingChart.destroy();
  }
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js is not loaded; skip rendering composition chart.');
    return null;
  }
  if (!components.length) {
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    return null;
  }
  const rowLabels = ['Mass share', 'CII share'];
  const totalMass = components.reduce((sum, comp) => sum + Math.max(0, comp.massKg || 0), 0);
  const totalCii = components.reduce((sum, comp) => sum + Math.max(0, comp.CII || 0), 0);
  const massShares = components.map((comp) =>
    totalMass > 0 ? Math.max(0, comp.massKg || 0) / totalMass : 0
  );
  const ciiShares = components.map((comp) => (totalCii > 0 ? Math.max(0, comp.CII || 0) / totalCii : 0));
  const massColors = createHueScale(massShares, { hue: 32, saturation: 90, lightMin: 35, lightMax: 78 });
  const ciiColors = createHueScale(ciiShares, { hue: 150, saturation: 50, lightMin: 32, lightMax: 72 });
  const datasets = components.map((comp, index) => {
    const massPercent = Number((massShares[index] * 100).toFixed(2));
    const ciiPercent = Number((ciiShares[index] * 100).toFixed(2));
    const legendLabel = formatLegendLabel(comp);
    return {
      label: legendLabel,
      data: [massPercent, ciiPercent],
      backgroundColor: [massColors[index], ciiColors[index]],
      hoverBackgroundColor: [massColors[index], ciiColors[index]],
      borderWidth: 1,
      borderColor: '#ffffff',
      massKg: Math.max(0, comp.massKg || 0),
    };
  });
  let hoverState = null;
  const hoverPlugin = createHoverLinkPlugin(() => hoverState);
  const ctx = canvas.getContext('2d');
  const targetHeight = 260;
  const parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 800;
  canvas.width = parentWidth;
  canvas.height = targetHeight;
  canvas.style.height = `${targetHeight}px`;
  const syncHoverState = (chart, state, event) => {
    hoverState = state;
    if (state) {
      const pairIndex = state.index === 0 ? 1 : 0;
      const active = [
        { datasetIndex: state.datasetIndex, index: state.index },
        { datasetIndex: state.datasetIndex, index: pairIndex },
      ];
      chart.setActiveElements(active);
      chart.tooltip?.setActiveElements(
        [{ datasetIndex: state.datasetIndex, index: state.index }],
        getEventPosition(event)
      );
    } else {
      chart.setActiveElements([]);
      chart.tooltip?.setActiveElements([], { x: 0, y: 0 });
    }
    chart.draw();
  };
  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rowLabels,
      datasets,
    },
    options: {
      ...DEFAULT_OPTIONS,
      interaction: {
        mode: 'nearest',
        axis: 'y',
        intersect: true,
      },
      indexAxis: 'y',
      plugins: {
        ...DEFAULT_OPTIONS.plugins,
        legend: { display: false },
        tooltip: {
          callbacks: {
            title(context) {
              const labelIndex = context[0]?.dataIndex ?? 0;
              return rowLabels[labelIndex] || '';
            },
            label(context) {
              const datasetLabel = Array.isArray(context.dataset.label)
                ? context.dataset.label.join(' ')
                : context.dataset.label || '';
              const value = Number(context.parsed.x ?? context.parsed.y ?? 0).toFixed(2);
              if (context.dataIndex === 0) {
                const massKg = context.dataset.massKg ?? 0;
                return `${datasetLabel}: ${value}% (${massKg.toFixed(3)} kg)`;
              }
              return `${datasetLabel}: ${value}%`;
            },
          },
        },
      },
      scales: {
        x: {
          ...DEFAULT_OPTIONS.scales.x,
          stacked: true,
          max: 100,
          min: 0,
          ticks: {
            ...DEFAULT_OPTIONS.scales.x.ticks,
            callback: (value) => `${value}%`,
          },
          grid: { color: '#eef2ff' },
        },
        y: {
          ...DEFAULT_OPTIONS.scales.y,
          stacked: true,
        },
      },
      onHover(event, elements, chart) {
        if (!elements.length) {
          if (hoverState) {
            syncHoverState(chart, null, event);
          }
          return;
        }
        const { datasetIndex, index } = elements[0];
        if (hoverState && hoverState.datasetIndex === datasetIndex && hoverState.index === index) {
          return;
        }
        syncHoverState(chart, { datasetIndex, index }, event);
      },
      onLeave(_event, chart) {
        if (hoverState) {
          syncHoverState(chart, null, _event);
        }
      },
    },
    plugins: [hoverPlugin],
  });
}

function createHueScale(values, options) {
  const { hue, saturation, lightMin, lightMax } = options;
  if (!values.length) {
    return [];
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min;
  return values.map((value) => {
    const ratio = range === 0 ? 0.5 : (value - min) / (range || 1);
    const lightness = lightMax - ratio * (lightMax - lightMin);
    return `hsl(${hue}, ${saturation}%, ${lightness.toFixed(1)}%)`;
  });
}

function getEventPosition(event) {
  if (!event) {
    return { x: 0, y: 0 };
  }
  const nativeEvent = event.native || event;
  if (typeof nativeEvent?.offsetX === 'number' && typeof nativeEvent?.offsetY === 'number') {
    return { x: nativeEvent.offsetX, y: nativeEvent.offsetY };
  }
  return { x: 0, y: 0 };
}

function createHoverLinkPlugin(getHoverState) {
  linkedHoverCounter += 1;
  const pluginId = `compositionHover${linkedHoverCounter}`;
  return {
    id: pluginId,
    afterDatasetsDraw(chart) {
      const hoverState = getHoverState();
      if (!hoverState) {
        return;
      }
      const meta = chart.getDatasetMeta(hoverState.datasetIndex);
      if (!meta || !meta.data) {
        return;
      }
      const massElement = meta.data[0];
      const ciiElement = meta.data[1];
      if (!massElement || !ciiElement) {
        return;
      }
      const ctx = chart.ctx;
      const massPoint = getBarAnchor(massElement, 'bottom');
      const ciiPoint = getBarAnchor(ciiElement, 'top');
      ctx.save();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(massPoint.x, massPoint.y);
      ctx.lineTo(ciiPoint.x, ciiPoint.y);
      ctx.stroke();
      ctx.restore();
    },
  };
}

function getBarAnchor(element, verticalPosition) {
  const props = element.getProps(['x', 'base', 'y', 'height'], true);
  const centerX = props.base + (props.x - props.base) / 2;
  let y = props.y;
  if (verticalPosition === 'top') {
    y = props.y - props.height / 2;
  } else if (verticalPosition === 'bottom') {
    y = props.y + props.height / 2;
  }
  return { x: centerX, y };
}

function formatLegendLabel(component) {
  const id = component.id || '—';
  const name = component.name || 'Component';
  const lines = wrapLabel(`${id} – ${name}`, 18);
  if (!lines.length) {
    return `${id} – ${name}`;
  }
  return lines.join('\n');
}

function wrapLabel(text, max = 18) {
  const words = `${text}`.split(/\s+/);
  const lines = [];
  let current = '';
  words.forEach((word) => {
    if (!current) {
      current = word;
      return;
    }
    if (`${current} ${word}`.length <= max) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  });
  if (current) {
    lines.push(current);
  }
  return lines;
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
    renderCompositionChart,
  };
})();
