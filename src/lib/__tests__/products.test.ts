import { aggregateLineItems, aggregateAmazonProducts } from "../queries/products";

describe("aggregateLineItems", () => {
  it("aggregates line items from multiple orders by title", () => {
    const orders = [
      {
        line_items: [
          { title: "Shampoo", sku: "SH1", quantity: 2, price: "15.00" },
          { title: "Conditioner", sku: "CO1", quantity: 1, price: "12.00" },
        ],
        total: "42.00",
      },
      {
        line_items: [
          { title: "Shampoo", sku: "SH1", quantity: 1, price: "15.00" },
        ],
        total: "15.00",
      },
    ];
    const result = aggregateLineItems(orders, "Vitaminity");
    const shampoo = result.find((r) => r.title === "Shampoo");
    expect(shampoo).toBeDefined();
    expect(shampoo!.units).toBe(3);
    expect(shampoo!.revenue).toBeCloseTo(45, 1);
    expect(shampoo!.ordersCount).toBe(2); // appears in 2 separate orders
    expect(result).toHaveLength(2);
  });
});

describe("aggregateAmazonProducts", () => {
  it("groups orders by asin", () => {
    const orders = [
      { asin: "B08A", sku: "SKU1", quantity: 2, item_price: 30, amazon_fees: 3, fba_fees: 2 },
      { asin: "B08A", sku: "SKU1", quantity: 1, item_price: 15, amazon_fees: 1.5, fba_fees: 1 },
      { asin: "B09B", sku: "SKU2", quantity: 1, item_price: 20, amazon_fees: 2, fba_fees: 1.5 },
    ];
    const result = aggregateAmazonProducts(orders);
    expect(result).toHaveLength(2);
    const b08a = result.find((r) => r.asin === "B08A")!;
    expect(b08a.units).toBe(3);
    expect(b08a.revenue).toBeCloseTo(45, 1);
    expect(b08a.totalFees).toBeCloseTo(7.5, 1);
    expect(b08a.netMargin).toBeCloseTo(37.5, 1);
  });
});
