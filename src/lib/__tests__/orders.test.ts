import { mergeAndSortOrders } from "../queries/orders";

describe("mergeAndSortOrders", () => {
  it("merges shopify and amazon orders sorted by date descending", () => {
    const shopify = [
      {
        id: "s1",
        source: "shopify" as const,
        storeName: "Vitaminity",
        date: "2025-03-02T10:00:00Z",
        orderNumber: "1001",
        customerEmail: "a@b.com",
        lineItems: [],
        total: 50,
        status: "paid",
        fulfillmentStatus: "fulfilled",
      },
    ];
    const amazon = [
      {
        id: "a1",
        source: "amazon" as const,
        accountName: "Amazon IT",
        date: "2025-03-03T08:00:00Z",
        orderNumber: "AMZ-001",
        asin: "B08XXX",
        sku: "SKU1",
        total: 30,
        status: "Shipped",
        fulfillmentChannel: "AFN",
      },
    ];
    const result = mergeAndSortOrders(shopify, amazon);
    expect(result).toHaveLength(2);
    expect(result[0].source).toBe("amazon"); // newer date first
    expect(result[1].source).toBe("shopify");
  });

  it("returns empty array when both inputs are empty", () => {
    expect(mergeAndSortOrders([], [])).toEqual([]);
  });
});
