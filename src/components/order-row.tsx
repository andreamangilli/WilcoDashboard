"use client";

import { useState } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UnifiedOrder } from "@/lib/queries/orders";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  const s = status.toLowerCase();
  if (s === "paid" || s === "shipped" || s === "unshipped") return "default";
  if (s === "refunded" || s === "cancelled") return "destructive";
  return "secondary";
}

function channelColor(source: string, name: string) {
  if (source === "amazon") return "bg-orange-100 text-orange-800";
  const colors: Record<string, string> = {
    Vitaminity: "bg-green-100 text-green-800",
    KMax: "bg-blue-100 text-blue-800",
    HairShopEurope: "bg-purple-100 text-purple-800",
  };
  return colors[name] ?? "bg-gray-100 text-gray-800";
}

export function OrderRow({ order }: { order: UnifiedOrder }) {
  const [expanded, setExpanded] = useState(false);

  const channelName = order.source === "shopify" ? order.storeName : order.accountName;
  const itemCount = order.source === "shopify" ? order.lineItems.length : 1;
  const dateStr = new Date(order.date).toLocaleDateString("it-IT");

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-gray-50"
        onClick={() => setExpanded((v) => !v)}
      >
        <TableCell className="w-6">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
        </TableCell>
        <TableCell className="text-sm text-gray-500">{dateStr}</TableCell>
        <TableCell className="font-mono text-xs">{order.orderNumber}</TableCell>
        <TableCell>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              channelColor(order.source, channelName)
            )}
          >
            {channelName}
          </span>
        </TableCell>
        <TableCell className="text-sm text-gray-500">
          {order.source === "shopify" ? order.customerEmail ?? "—" : "—"}
        </TableCell>
        <TableCell className="text-sm">{itemCount} {itemCount === 1 ? "item" : "items"}</TableCell>
        <TableCell className="text-right font-medium">{formatCurrency(order.total)}</TableCell>
        <TableCell>
          <Badge variant={statusVariant(order.status)} className="text-xs">
            {order.status}
          </Badge>
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow className="bg-gray-50">
          <TableCell colSpan={8} className="py-0">
            <div className="pl-8 py-3">
              {order.source === "shopify" ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500">
                      <th className="text-left pb-1">Prodotto</th>
                      <th className="text-left pb-1">SKU</th>
                      <th className="text-right pb-1">Qty</th>
                      <th className="text-right pb-1">Prezzo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.lineItems.map((li, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-1">{li.title}</td>
                        <td className="py-1 text-gray-500">{li.sku ?? "—"}</td>
                        <td className="py-1 text-right">{li.quantity}</td>
                        <td className="py-1 text-right">{formatCurrency(li.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500">
                      <th className="text-left pb-1">ASIN</th>
                      <th className="text-left pb-1">SKU</th>
                      <th className="text-left pb-1">Fulfillment</th>
                      <th className="text-right pb-1">Importo</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-gray-100">
                      <td className="py-1 font-mono text-xs">{order.asin}</td>
                      <td className="py-1 text-gray-500">{order.sku ?? "—"}</td>
                      <td className="py-1">{order.fulfillmentChannel}</td>
                      <td className="py-1 text-right">{formatCurrency(order.total)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
