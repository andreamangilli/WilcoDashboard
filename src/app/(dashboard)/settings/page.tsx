import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SyncButton } from "./sync-button";

export default async function SettingsPage() {
  const supabase = await createClient();

  const { data: syncLogs } = await supabase
    .from("sync_log")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(20);

  const { data: stores } = await supabase.from("stores").select("name, slug");
  const { data: amazonAccounts } = await supabase.from("amazon_accounts").select("name");
  const { data: adAccounts } = await supabase.from("ad_accounts").select("platform, account_name");

  return (
    <div>
      <PageHeader title="Impostazioni" description="Configurazione e stato sincronizzazione">
        <SyncButton />
      </PageHeader>

      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">Connessioni</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border p-4">
            <h3 className="font-medium">Shopify Store</h3>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              {(stores || []).map((s) => (
                <li key={s.slug}>{s.name}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border p-4">
            <h3 className="font-medium">Amazon</h3>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              {(amazonAccounts || []).length > 0
                ? amazonAccounts!.map((a, i) => <li key={i}>{a.name}</li>)
                : <li className="text-gray-400">Nessun account configurato</li>
              }
            </ul>
          </div>
          <div className="rounded-lg border p-4">
            <h3 className="font-medium">Advertising</h3>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              {(adAccounts || []).length > 0
                ? adAccounts!.map((a, i) => <li key={i}>{a.platform}: {a.account_name}</li>)
                : <li className="text-gray-400">Nessun account configurato</li>
              }
            </ul>
          </div>
        </div>
      </div>

      <h2 className="mb-4 text-lg font-semibold">Log Sincronizzazione</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sorgente</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead className="text-right">Record</TableHead>
            <TableHead>Inizio</TableHead>
            <TableHead>Fine</TableHead>
            <TableHead>Errore</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(syncLogs || []).map((log) => (
            <TableRow key={log.id}>
              <TableCell className="font-medium">{log.source}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    log.status === "success" ? "default" :
                    log.status === "error" ? "destructive" :
                    "secondary"
                  }
                >
                  {log.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{log.records_synced || 0}</TableCell>
              <TableCell className="text-sm">
                {log.started_at ? new Date(log.started_at).toLocaleString("it-IT") : "—"}
              </TableCell>
              <TableCell className="text-sm">
                {log.completed_at ? new Date(log.completed_at).toLocaleString("it-IT") : "—"}
              </TableCell>
              <TableCell className="max-w-xs truncate text-sm text-red-600">
                {log.error || "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
