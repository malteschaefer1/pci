# PCI Circularity Calculator – Browser-based Tool

This repository contains a pure HTML/CSS/JavaScript tool that replicates the Product Circularity Indicator (PCI), Component Circularity Indicator (CCI), and Circularity Impact Indicator (CII) calculations from **PCI_paper_V2.pdf** (Sections 3–4 and Appendix A). Open `index.html` in any modern browser to load the interface, enter or import Bill of Materials (BoM) data, and calculate the indicators alongside simple charts.

## Background

The workflow is adapted from Müller et al., *Assessing Product Circularity and Carbon Footprint: Electromagnetic Guard Locking System Case Study* (PCI_paper_V2.pdf). The tool follows:

- Section 3: Six-step integrated procedure for PCI + PCF assessments (v1 focuses on PCI/CCI/CII only).
- Section 4: Case study structure for handling components and hotspots.
- Appendix A: Equations 3–23 for PCI, CCI, CII, LFI, and all intermediate mass flows.

All variable names in the UI map directly to the notation from Appendix A (e.g., `Fu`, `Fr`, `Efp`, `Ecp`). Percentages are entered as 0–100 in the UI but stored internally as fractions between 0 and 1.

## Features

- 🔌 **Zero-install**: double-click `index.html`; no build tools or servers.
- 📥 **CSV templates** for BoM and circularity parameters plus CSV export of working data and results.
- 🧮 **Built-in data grid** for manual entry with validation and sample components.
- 📊 **Chart.js visualizations** for CCI and CII per component.
- 🧠 **Defensive math layer** (`assets/js/circularity.js`) that implements Equations 3–23 with extensive JSDoc comments and optional debug logging.
- ⚠️ **Friendly status messages** and per-cell highlighting for invalid data (missing IDs, duplicate IDs, negative mass, out-of-range efficiencies, etc.).

## Quick start

1. Clone or download this repository.
2. Open `index.html` in a modern browser (Chrome, Edge, Firefox, Safari desktop or tablet).
3. Use the example data or import your own CSVs.
4. Click **Compute circularity indicators** to obtain PCI/CCI/CII and the charts.
5. Export BoM, factors, or results as CSV for documentation.

The interface is fully client-side, so no data leaves your machine.

## Workflow walkthrough

1. **Step 1 – Product parameters**: enter `Fu`, `Cu`, `Cr`, and the lifetime/use intensity pairs (`L`, `Ld`, `I`, `Id`). These drive the use factor \(X = \frac{I \cdot L}{Id \cdot Ld}\) (Eq. 8).
2. **Step 2 – BoM & input factors**: either download the CSV templates or work directly in the Manual table. Columns map to the component inputs defined in Section 3.2.
3. **Step 3 – Calculation**: validates the grid and runs all equations from Appendix A, exposing per-component warnings (e.g., when CCI gets clamped to zero).
4. **Step 4 – Visualizations**: displays two bar charts (CCI and CII by component) using Chart.js.
5. **Step 5 – Export**: download your BoM, factor table, or the enriched results (CCI, CII, LFI, V/W/R flows).

## CSV formats

### BoM template

```csv
component_id,component_name,material,process,mass_kg
C1,Housing,Polyamide,Injection-molding,0.16
```

### Input-factor template

```csv
component_id,Fr_percent,Efp_percent,Ecp_percent,Cfp_percent,Ccp_percent,Ems_percent,Erfp_percent
C1,0,100,95,0,100,30,30
```

- Percent inputs are provided as 0–100 in the CSV, matching the UI. They are converted to fractions internally.
- Both templates can be downloaded directly from the UI and re-uploaded after editing in Excel, Sheets, or similar.

## Calculation details

- **PCI (Eq. 3 & 5)**: mass-weighted average of component CCIs plus the use-factor adjustment \(PCI = 1 - \frac{LFI}{X}\). Negative PCI values are clamped to 0 as suggested in Appendix A.
- **CCI (Eq. 6)**: per-component version of PCI using the same \(X\).
- **CII (Eq. 4)**: \( CII_i = 100 \cdot \frac{PCI/CCI_i}{\sum_j PCI/CCI_j} \). When a CCI approaches zero the UI reports a warning and sets CII to zero to avoid divide-by-zero artifacts.
- **Linear Flow Index (Eq. 7)**: implemented exactly with helper functions for:
  - Virgin feedstock mass \(V\) (Eq. 9)
  - Waste mass terms \(W_{fp}, W_{cp}, W_u, W_{ms}, W_{rfp}\) (Eq. 10–15)
  - Recycling flows \(R_{in}, R_{out}\) incl. \(R_{fp}, R_{cp}, R_{EoL}\) (Eq. 16–21)
  - Reused component mass \(C\) (Eq. 22)
  - Linear reference flows \(V_{linear}, W_{linear}\) (Eq. 23)
- **Debugging**: set `DEBUG_LOG` in `assets/js/app.js` to `true` to print intermediate flows (V, W, Rin/Rout, LFI) to the console for each component.

Variable naming aligns with the paper: `Fu`, `Cu`, `Cr`, `Fr`, `Efp`, `Ecp`, `Cfp`, `Ccp`, `Ems`, `Erfp`, `M`, and so on.

## Limitations & scope

- v1 focuses solely on PCI/CCI/CII. Hooks for PCF/LCA integration are not implemented yet but can be added in `app.js`.
- The UI assumes positive component masses and efficiency values within [0, 1]. Values outside that range are clamped or trigger validation errors.
- CSV parsing relies on Papa Parse when available; a lightweight fallback handles basic comma-separated files. Exotic quoting/encoding scenarios may require preprocessing.
- Charts and downloads run entirely client-side, so extremely large BoMs may feel slower on low-power devices.

## Development notes

- **Structure**
  - `index.html` – single-page layout with five steps.
  - `assets/css/styles.css` – responsive styling, table layout, status states.
  - `assets/js/app.js` – UI orchestration, validation, event handling, CSV wiring, and chart updates.
  - `assets/js/circularity.js` – pure math layer (no DOM), fully documented with the equation references.
  - `assets/js/csv-utils.js` – CSV template generation, parsing, and export helpers (using Papa Parse if present).
  - `assets/js/charts.js` – Chart.js wrapper for the two bar charts.
- **Extending the UI**: Add tabs/sections in `index.html`, style via `styles.css`, and wire new controls in `app.js`.
- **Adding metrics**: expand `circularity.js` with additional pure functions and import them into `app.js`. Keep new math functions pure and well-commented.
- **Debugging**: toggle `DEBUG_LOG` in `app.js` or inspect the `debug` object returned by `computeCircularityIndicators`.

## License

The project is released under the MIT License (see `LICENSE`). All methodology details remain credited to the authors of PCI_paper_V2.pdf.
