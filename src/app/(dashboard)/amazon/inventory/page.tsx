import { PageHeader } from "@/components/page-header";
import { getAmazonInventory } from "@/lib/queries/amazon";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber } from "@/lib/format";

export default async function AmazonInventoryPage() {
  const inventory = await getAmazonInventory();

  return (
    <div>
      <PageHeader title="Inventario Amazon" description="Disponibilita FBA/FBM" />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ASIN</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>Canale</TableHead>
            <TableHead className="text-right">Disponibile</TableHead>
            <TableHead className="text-right">In Entrata</TableHead>
            <TableHead className="text-right">Storage Fee/mese</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {inventory.map((inv) => (
            <TableRow key={inv.id}>
              <TableCell className="font-mono text-sm">{inv.asin}</TableCell>
              <TableCell>{inv.sku || "—"}</TableCell>
              <TableCell>
                <Badge variant={inv.fulfillment === "fba" ? "default" : "secondary"}>
                  {inv.fulfillment?.toUpperCase()}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{formatNumber(inv.qty_available || 0)}</TableCell>
              <TableCell className="text-right">{formatNumber(inv.qty_inbound || 0)}</TableCell>
              <TableCell className="text-right">{formatCurrency(inv.storage_fees_monthly || 0)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
