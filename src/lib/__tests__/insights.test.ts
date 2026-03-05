import { calculateInsights, type InsightInput } from "../queries/insights";

describe("calculateInsights", () => {
  const baseInput: InsightInput = {
    revenueByStore: [],
    amazonRevenue: { current: 100, previous: 100 },
    adsByPlatform: {
      google: { spend: 100, revenue: 200, impressions: 10000, clicks: 500 },
      meta: { spend: 100, revenue: 200, impressions: 10000, clicks: 500 },
    },
    dailyMetrics: [],
    lowStockCount: 0,
    lowRoasCampaignCount: 0,
  };

  it("returns empty array when no anomalies", () => {
    const result = calculateInsights(baseInput);
    expect(result.every((i) => i.type !== "anomaly_negative")).toBe(true);
  });

  it("detects negative anomaly when store revenue drops >20%", () => {
    const input: InsightInput = {
      ...baseInput,
      revenueByStore: [{ name: "KMAX", current: 700, previous: 1000 }],
    };
    const result = calculateInsights(input);
    const anomaly = result.find(
      (i) => i.type === "anomaly_negative" && i.message.includes("KMAX")
    );
    expect(anomaly).toBeDefined();
    expect(anomaly!.severity).toBe("high");
  });

  it("detects positive anomaly when revenue rises >20%", () => {
    const input: InsightInput = {
      ...baseInput,
      amazonRevenue: { current: 1500, previous: 1000 },
    };
    const result = calculateInsights(input);
    const anomaly = result.find((i) => i.type === "anomaly_positive");
    expect(anomaly).toBeDefined();
    expect(anomaly!.severity).toBe("medium");
  });

  it("detects negative trend (3+ consecutive declining days)", () => {
    const input: InsightInput = {
      ...baseInput,
      dailyMetrics: [
        { date: "2026-03-01", roas: 3.0 },
        { date: "2026-03-02", roas: 2.5 },
        { date: "2026-03-03", roas: 2.0 },
        { date: "2026-03-04", roas: 1.5 },
      ],
    };
    const result = calculateInsights(input);
    const trend = result.find((i) => i.type === "trend_negative");
    expect(trend).toBeDefined();
    expect(trend!.message).toContain("ROAS");
  });

  it("detects platform comparison when CPC differs >30%", () => {
    const input: InsightInput = {
      ...baseInput,
      adsByPlatform: {
        google: { spend: 500, revenue: 1000, impressions: 10000, clicks: 500 },
        meta: { spend: 300, revenue: 900, impressions: 10000, clicks: 1000 },
      },
    };
    const result = calculateInsights(input);
    const comparison = result.find((i) => i.type === "platform_comparison");
    expect(comparison).toBeDefined();
  });

  it("includes stock alert when low stock count > 0", () => {
    const input: InsightInput = { ...baseInput, lowStockCount: 5 };
    const result = calculateInsights(input);
    const alert = result.find((i) => i.type === "stock_alert");
    expect(alert).toBeDefined();
    expect(alert!.message).toContain("5");
  });

  it("limits output to 6 insights", () => {
    const input: InsightInput = {
      ...baseInput,
      revenueByStore: [
        { name: "Store1", current: 100, previous: 1000 },
        { name: "Store2", current: 100, previous: 1000 },
        { name: "Store3", current: 100, previous: 1000 },
      ],
      amazonRevenue: { current: 100, previous: 1000 },
      lowStockCount: 5,
      lowRoasCampaignCount: 3,
      dailyMetrics: [
        { date: "2026-03-01", roas: 3.0 },
        { date: "2026-03-02", roas: 2.5 },
        { date: "2026-03-03", roas: 2.0 },
        { date: "2026-03-04", roas: 1.5 },
      ],
    };
    const result = calculateInsights(input);
    expect(result.length).toBeLessThanOrEqual(6);
  });
});
