import { formatCurrency, formatNumber, formatPercent } from "../format";

describe("formatCurrency", () => {
  it("formats EUR currency in Italian locale", () => {
    const result = formatCurrency(12345.67);
    expect(result).toContain("12.345,67");
    expect(result).toContain("€");
  });
});

describe("formatPercent", () => {
  it("adds + prefix for positive values", () => {
    expect(formatPercent(12.345)).toBe("+12.3%");
  });
  it("keeps - prefix for negative values", () => {
    expect(formatPercent(-5.1)).toBe("-5.1%");
  });
});
