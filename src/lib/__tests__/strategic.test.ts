import {
  classifyQuadrant,
  calculateHHI,
  calculateParetoConcentration,
  generateRecommendations,
} from "../queries/strategic";
import type {
  CampaignMatrixItem,
  ParetoResult,
  CustomerHealth,
} from "../queries/strategic";

// ── classifyQuadrant ──────────────────────────────────────────

describe("classifyQuadrant", () => {
  it("returns 'scale' for high ROAS and high spend", () => {
    expect(classifyQuadrant(3.0, 1000, 500)).toBe("scale");
  });

  it("returns 'opportunity' for high ROAS and low spend", () => {
    expect(classifyQuadrant(2.5, 200, 500)).toBe("opportunity");
  });

  it("returns 'cut' for low ROAS and high spend", () => {
    expect(classifyQuadrant(1.5, 800, 500)).toBe("cut");
  });

  it("returns 'watch' for low ROAS and low spend", () => {
    expect(classifyQuadrant(0.5, 100, 500)).toBe("watch");
  });

  it("uses ROAS=2.0 as boundary (equal = scale)", () => {
    expect(classifyQuadrant(2.0, 500, 500)).toBe("scale");
  });

  it("uses median spend as boundary (equal = high spend)", () => {
    expect(classifyQuadrant(1.0, 500, 500)).toBe("cut");
  });
});

// ── calculateHHI ──────────────────────────────────────────────

describe("calculateHHI", () => {
  it("returns 1.0 for a single-item monopoly", () => {
    expect(calculateHHI([1.0])).toBeCloseTo(1.0);
  });

  it("returns 0.5 for two equal items", () => {
    expect(calculateHHI([0.5, 0.5])).toBeCloseTo(0.5);
  });

  it("returns ~0.25 for four equal items", () => {
    expect(calculateHHI([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(0.25);
  });

  it("returns 0 for empty array", () => {
    expect(calculateHHI([])).toBe(0);
  });
});

// ── calculateParetoConcentration ──────────────────────────────

describe("calculateParetoConcentration", () => {
  it("calculates concentration for known input", () => {
    const items = [
      { revenue: 80 },
      { revenue: 10 },
      { revenue: 5 },
      { revenue: 3 },
      { revenue: 2 },
    ];
    const result = calculateParetoConcentration(items);
    expect(result.total_revenue).toBe(100);
    expect(result.top20pct_count).toBe(1); // 20% of 5 = 1
    expect(result.top20pct_revenue).toBe(80);
    expect(result.concentration_pct).toBe(80);
  });

  it("handles single item", () => {
    const result = calculateParetoConcentration([{ revenue: 100 }]);
    expect(result.concentration_pct).toBe(100);
    expect(result.top20pct_count).toBe(1);
  });

  it("handles empty input", () => {
    const result = calculateParetoConcentration([]);
    expect(result.total_revenue).toBe(0);
    expect(result.concentration_pct).toBe(0);
  });
});

// ── generateRecommendations ───────────────────────────────────

describe("generateRecommendations", () => {
  const baseHealth: CustomerHealth = {
    total_customers: 100,
    repeat_customers: 30,
    repeat_rate: 30,
    avg_ltv: 150,
    avg_orders_per_customer: 1.5,
    new_customers_period: 10,
    returning_orders_period: 5,
    aov_current: 50,
    aov_previous: 55,
    aov_change_pct: -9,
  };

  const basePareto: ParetoResult = {
    products: {
      top20pct_count: 2,
      top20pct_revenue: 8000,
      total_revenue: 10000,
      concentration_pct: 80,
      top_items: [],
    },
    channels: {
      items: [],
      hhi: 0.3,
    },
  };

  it("detects losing campaigns (loss aversion)", () => {
    const campaigns: CampaignMatrixItem[] = [
      { campaign_id: "1", campaign_name: "Test", platform: "google", total_spend: 1000, total_revenue: 500, roas: 0.5, quadrant: "cut" },
    ];
    const recs = generateRecommendations({
      campaigns,
      pareto: basePareto,
      health: baseHealth,
      dailyRoas: [],
      googleCpa: 0,
      metaCpa: 0,
      totalAdSpend: 1000,
      provenSpend: 0,
    });
    expect(recs.some((r) => r.framework === "loss_aversion")).toBe(true);
  });

  it("detects high pareto concentration", () => {
    const recs = generateRecommendations({
      campaigns: [],
      pareto: { ...basePareto, products: { ...basePareto.products, concentration_pct: 85 } },
      health: baseHealth,
      dailyRoas: [],
      googleCpa: 0,
      metaCpa: 0,
      totalAdSpend: 0,
      provenSpend: 0,
    });
    expect(recs.some((r) => r.framework === "pareto")).toBe(true);
  });

  it("detects CPA anchoring difference > 30%", () => {
    const recs = generateRecommendations({
      campaigns: [],
      pareto: { ...basePareto, products: { ...basePareto.products, concentration_pct: 50 } },
      health: baseHealth,
      dailyRoas: [],
      googleCpa: 10,
      metaCpa: 5,
      totalAdSpend: 0,
      provenSpend: 0,
    });
    expect(recs.some((r) => r.framework === "anchoring")).toBe(true);
  });

  it("detects ROAS declining trend (second order)", () => {
    const recs = generateRecommendations({
      campaigns: [],
      pareto: { ...basePareto, products: { ...basePareto.products, concentration_pct: 50 } },
      health: baseHealth,
      dailyRoas: [
        { date: "2026-03-01", roas: 3.0 },
        { date: "2026-03-02", roas: 2.5 },
        { date: "2026-03-03", roas: 2.0 },
        { date: "2026-03-04", roas: 1.5 },
      ],
      googleCpa: 0,
      metaCpa: 0,
      totalAdSpend: 0,
      provenSpend: 0,
    });
    expect(recs.some((r) => r.framework === "second_order")).toBe(true);
  });

  it("returns max 6 recommendations sorted by priority", () => {
    const campaigns: CampaignMatrixItem[] = Array.from({ length: 10 }, (_, i) => ({
      campaign_id: `c${i}`,
      campaign_name: `Camp ${i}`,
      platform: "google" as const,
      total_spend: 1000,
      total_revenue: 400,
      roas: 0.4,
      quadrant: "cut" as const,
    }));
    const recs = generateRecommendations({
      campaigns,
      pareto: basePareto,
      health: baseHealth,
      dailyRoas: [
        { date: "2026-03-01", roas: 3.0 },
        { date: "2026-03-02", roas: 2.5 },
        { date: "2026-03-03", roas: 2.0 },
        { date: "2026-03-04", roas: 1.5 },
      ],
      googleCpa: 10,
      metaCpa: 5,
      totalAdSpend: 10000,
      provenSpend: 1000,
    });
    expect(recs.length).toBeLessThanOrEqual(6);
    // Check sorted by priority (high first)
    const priorities = recs.map((r) => r.priority);
    const order = { high: 0, medium: 1, low: 2 };
    for (let i = 1; i < priorities.length; i++) {
      expect(order[priorities[i]]).toBeGreaterThanOrEqual(order[priorities[i - 1]]);
    }
  });

  it("returns empty array when no issues detected", () => {
    const recs = generateRecommendations({
      campaigns: [],
      pareto: { ...basePareto, products: { ...basePareto.products, concentration_pct: 50 } },
      health: { ...baseHealth, aov_change_pct: 5 },
      dailyRoas: [],
      googleCpa: 0,
      metaCpa: 0,
      totalAdSpend: 0,
      provenSpend: 0,
    });
    expect(recs).toEqual([]);
  });
});
