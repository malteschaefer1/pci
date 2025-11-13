(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;

  /**
   * Represents one BoM line plus circularity parameters.
   * Percentages are stored as fractions between 0 and 1.
   * @typedef {Object} ComponentInput
   * @property {string} id
   * @property {string} name
   * @property {string} material
   * @property {string} process
   * @property {number} massKg
   * @property {number} Fr
   * @property {number} Efp
   * @property {number} Ecp
   * @property {number} Cfp
   * @property {number} Ccp
   * @property {number} Ems
   * @property {number} Erfp
   * @property {number|null} [LFI]
   * @property {number|null} [CCI]
   * @property {number|null} [CII]
   * @property {string[]} [warnings]
   */

/**
 * Product-level parameters shared by all components.
 * Percentages are stored as fractions between 0 and 1.
 * @typedef {Object} ProductParams
 * @property {number} Fu
 * @property {number} Cu
 * @property {number} Cr
 * @property {number} Ld
 * @property {number} L
 * @property {number} Id
 * @property {number} I
 */

  const EPSILON = 1e-9;

/**
 * Computes PCI, CCI and CII for all components.
 * @param {ComponentInput[]} components
 * @param {ProductParams} productParams
 * @returns {{ components: ComponentInput[], PCI: number, X: number, M_total: number, debug: Record<string, any> }}
 */
function computeCircularityIndicators(components, productParams) {
  if (!Array.isArray(components) || components.length === 0) {
    throw new Error('At least one component is required to compute circularity indicators.');
  }

  const sanitizedComponents = components.map((comp) => sanitizeComponent(comp));
  const totalMass = sanitizedComponents.reduce((sum, comp) => sum + comp.massKg, 0);
  if (totalMass <= 0) {
    throw new Error('Total product mass must be greater than zero.');
  }

  const X = computeUseFactorX(productParams);
  if (!isFinite(X) || X <= 0) {
    throw new Error('Use factor X (Eq. 8) must be positive. Check L, Ld, I, and Id.');
  }

  const perComponent = sanitizedComponents.map((component) =>
    computeComponentIndicators(component, productParams, X)
  );

  const PCI = computePCI(perComponent);
  const withCii = computeCIIForComponents(perComponent, PCI);

  return {
    components: withCii,
    PCI,
    X,
    M_total: totalMass,
    debug: buildDebugSnapshot(withCii),
  };
}

/**
 * Computes the use factor X per Eq. 8.
 * @param {ProductParams} productParams
 * @returns {number}
 */
function computeUseFactorX(productParams) {
  const { I, L, Id, Ld } = productParams;
  if ([I, L, Id, Ld].some((value) => value === undefined)) {
    throw new Error('Missing lifetime or intensity input needed for Eq. 8.');
  }
  const denominator = Id * Ld;
  if (denominator <= 0) {
    throw new Error('Expected lifetime (Ld) and intensity (Id) must be positive numbers.');
  }
  return (I * L) / denominator;
}

/**
 * Mass-weighted PCI per Eq. 3.
 * @param {ComponentInput[]} components
 * @returns {number}
 */
function computePCI(components) {
  const totalMass = components.reduce((sum, comp) => sum + comp.massKg, 0);
  if (totalMass <= 0) {
    return 0;
  }
  const weighted = components.reduce((sum, comp) => sum + comp.massKg * (comp.CCI ?? 0), 0);
  return clamp01(weighted / totalMass);
}

/**
 * Component-level Circularity Impact Indicator per Eq. 4.
 * @param {ComponentInput[]} components
 * @param {number} PCI
 * @returns {ComponentInput[]}
 */
function computeCIIForComponents(components, PCI) {
  const safePCI = clamp01(PCI);
  if (safePCI <= EPSILON) {
    return components.map((component) => ({
      ...component,
      CII: 0,
      warnings: [...(component.warnings || []), 'PCI equals 0, so CII defaults to 0 (Eq. 4).'],
    }));
  }
  const denominator = components.reduce((sum, comp) => {
    const cci = comp.CCI ?? 0;
    return cci > EPSILON ? sum + safePCI / cci : sum;
  }, 0);

  return components.map((component) => {
    const cci = component.CCI ?? 0;
    const warnings = [...(component.warnings || [])];
    let CII = 0;
    if (cci > EPSILON && denominator > EPSILON) {
      CII = clampPercentage((safePCI / cci) / denominator * 100);
    } else {
      warnings.push('CCI too low to derive CII (Eq. 4).');
    }
    return { ...component, CII, warnings };
  });
}

function computeComponentIndicators(component, productParams, X) {
  const { massKg } = component;
  const flows = deriveMassFlows(massKg, component, productParams);
  const linearDenominator = flows.linear.V + flows.linear.W;
  const numerator = flows.V + flows.W + 0.5 * flows.absR + 0.5 * Math.abs(flows.C);
  const LFI = linearDenominator > 0 ? numerator / linearDenominator : 0;
  const ratio = X > 0 ? LFI / X : Infinity;
  const CCI = clamp01(1 - ratio);
  const warnings = [];
  if (!isFinite(ratio)) {
    warnings.push('Use factor X caused a division by zero.');
  }
  if (CCI <= 0) {
    warnings.push('CCI clipped to 0 per Eq. 6.');
  }

  return {
    ...component,
    LFI,
    CCI,
    flows,
    warnings,
  };
}

function deriveMassFlows(M, component, productParams) {
  const { Fu, Cu, Cr } = productParams;
  const { Fr, Efp, Ecp, Cfp, Ccp, Ems, Erfp } = component;
  if ([Efp, Ecp].some((value) => value <= 0)) {
    throw new Error(`Component ${component.id || ''} must have positive Efp and Ecp values.`);
  }

  const V = computeVirginFeedstockMass(M, Fu, Ecp, Efp, Fr);
  const waste = computeWasteMass(M, {
    Fu,
    Efp,
    Ecp,
    Cfp,
    Ccp,
    Cu,
    Cr,
    Ems,
    Erfp,
  });
  const recycling = computeRecyclingFlows(M, { Fu, Efp, Ecp, Cfp, Ccp, Cr, Ems, Erfp });
  const C = computeReusedComponentMass(M, Fu, Cu);
  const linear = computeLinearMassFlows(M, Ecp, Efp);

  return {
    V,
    W: waste.total,
    wasteBreakdown: waste.breakdown,
    Rin: recycling.Rin,
    Rout: recycling.Rout,
    absR: recycling.absR,
    recyclingBreakdown: recycling.breakdown,
    C,
    linear,
  };
}

  function computeVirginFeedstockMass(M, Fu, Ecp, Efp, Fr) {
  const denominator = Ecp * Efp;
  if (denominator <= 0) {
    throw new Error('Ecp and Efp must be positive to compute Eq. 9.');
  }
  const reusedShare = 1 - clamp01(Fu);
  const recycledShare = 1 - clamp01(Fr);
  return (reusedShare * M / denominator) * recycledShare;
}

  function computeWasteMass(M, params) {
  const { Fu, Efp, Ecp, Cfp, Ccp, Cu, Cr, Ems, Erfp } = params;
  const reusedShare = 1 - clamp01(Fu);
  const baseFeedstock = reusedShare * M;
  const denomFeedstock = Efp * Ecp;

  if (denomFeedstock <= 0 || Ecp <= 0) {
    throw new Error('Efficiencies must be positive to compute waste masses.');
  }

  const effFp = clamp01(Efp);
  const effCp = clamp01(Ecp);
  const recycleCu = clamp01(Cu);
  const recycleCr = clamp01(Cr);
  const Wfp = (baseFeedstock / denomFeedstock) * (1 - effFp) * (1 - clamp01(Cfp));
  const Wcp = (baseFeedstock / Ecp) * (1 - effCp) * (1 - clamp01(Ccp));
  const Wu = M * Math.max(0, 1 - recycleCu - recycleCr);
  const Wms = M * (1 - clamp01(Ems)) * recycleCr;
  const Wrfp = M * clamp01(Ems) * (1 - clamp01(Erfp));

  return {
    total: Wfp + Wcp + Wu + Wms + Wrfp,
    breakdown: { Wfp, Wcp, Wu, Wms, Wrfp },
  };
}

  function computeRecyclingFlows(M, params) {
  const { Fu, Efp, Ecp, Cfp, Ccp, Cr, Ems, Erfp } = params;
  const reusedShare = 1 - clamp01(Fu);
  const denom = Efp * Ecp;
  if (denom <= 0) {
    throw new Error('Efp and Ecp must be positive to compute recycling flows.');
  }
  const Rin = (reusedShare * M) / denom;
  const scrapBase = Rin * (1 - clamp01(Efp));
  const Rfp = scrapBase * clamp01(Cfp);
  const Rcp = (reusedShare * M) / Ecp * (1 - clamp01(Ecp)) * clamp01(Ccp);
  const REoL = clamp01(Erfp) * clamp01(Ems) * clamp01(Cr) * M;
  const Rout = Rfp + Rcp + REoL;
  const absR = Math.abs(Rin - Rout);

  return {
    Rin,
    Rout,
    absR,
    breakdown: { Rfp, Rcp, REoL },
  };
}

  function computeReusedComponentMass(M, Fu, Cu) {
  return M * (clamp01(Fu) - clamp01(Cu));
}

  function computeLinearMassFlows(M, Ecp, Efp) {
  const denominator = Ecp * Efp;
  if (denominator <= 0) {
    throw new Error('Ecp and Efp must be positive to compute linear reference flows.');
  }
  const linearValue = M / denominator;
  return { V: linearValue, W: linearValue };
}

  function sanitizeComponent(component) {
  const mass = Number(component.massKg);
  if (!isFinite(mass) || mass <= 0) {
    throw new Error(`Component ${component.id || ''} must have a positive mass in kg.`);
  }
  const clone = { ...component, massKg: mass };
  ['Fr', 'Efp', 'Ecp', 'Cfp', 'Ccp', 'Ems', 'Erfp'].forEach((key) => {
    const value = Number(component[key]);
    clone[key] = clamp01(isFinite(value) ? value : 0);
  });
  return clone;
}

  function clamp01(value) {
  if (!isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

  function clampPercentage(value) {
  if (!isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, value));
}

  function buildDebugSnapshot(components) {
    return components.map((comp) => ({
      id: comp.id,
      V: comp.flows?.V ?? null,
      W: comp.flows?.W ?? null,
      Rin: comp.flows?.Rin ?? null,
      Rout: comp.flows?.Rout ?? null,
      absR: comp.flows?.absR ?? null,
      C: comp.flows?.C ?? null,
      LFI: comp.LFI ?? null,
      CCI: comp.CCI ?? null,
    }));
  }

  globalScope.PCICircularity = {
    computeCircularityIndicators,
    computeUseFactorX,
    computePCI,
    computeCIIForComponents,
  };
})();
