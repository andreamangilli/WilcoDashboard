import { PageHeader } from "@/components/page-header";
import { getAmazonPnl } from "@/lib/queries/amazon";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";

export default async function AmazonPnlPage() {
  const pnl = await getAmazonPnl();

  return (
    <div>
      <PageHeader title="Amazon P&L" description="Profitto e perdita per ASIN" />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ASIN</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead className="text-right">Fatturato</TableHead>
            <TableHead className="text-right">Unita</TableHead>
            <TableHead className="text-right">Fee Amazon</TableHead>
            <TableHead className="text-right">Fee FBA</TableHead>
            <TableHead className="text-right">Storage</TableHead>
            <TableHead className="text-right">Costo Prod.</TableHead>
            <TableHead className="text-right">Ads</TableHead>
            <TableHead className="text-right">Profitto</TableHead>
            <TableHead className="text-right">Margine</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pnl.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-mono text-sm">{row.asin}</TableCell>
              <TableCell>{row.sku || "—"}</TableCell>
              <TableCell className="text-right">{formatCurrency(row.revenue || 0)}</TableCell>
              <TableCell className="text-right">{row.units_sold}</TableCell>
              <TableCell className="text-right">{formatCurrency(row.amazon_fees || 0)}</TableCell>
              <TableCell className="text-right">{formatCurrency(row.fba_fees || 0)}</TableCell>
              <TableCell className="text-right">{formatCurrency(row.storage_fees || 0)}</TableCell>
              <TableCell className="text-right">{formatCurrency(row.product_cost || 0)}</TableCell>
              <TableCell className="text-right">{formatCurrency(row.ad_spend || 0)}</TableCell>
              <TableCell className="text-right font-medium">
                <span className={(row.net_profit || 0) >= 0 ? "text-green-600" : "text-red-600"}>
                  {formatCurrency(row.net_profit || 0)}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <Badge variant={(row.margin_pct || 0) >= 0 ? "default" : "destructive"}>
                  {(row.margin_pct || 0).toFixed(1)}%
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
