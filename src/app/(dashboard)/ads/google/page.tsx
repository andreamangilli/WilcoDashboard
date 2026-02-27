import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { getAdsCampaigns, getAdsDailySpend } from "@/lib/queries/ads";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { SpendChart } from "../spend-chart";

interface Props {
  searchParams: Promise<{ period?: string }>;
}

export default async function GoogleAdsPage({ searchParams }: Props) {
  const { period = "30d" } = await searchParams;
  const [campaigns, dailySpend] = await Promise.all([
    getAdsCampaigns("google"),
    getAdsDailySpend("google", period),
  ]);

  return (
    <div>
      <PageHeader title="Google Ads" description="Campagne e performance">
        <DateRangePicker />
      </PageHeader>

      <div className="mb-8">
        <SpendChart data={dailySpend} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campagna</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead className="text-right">Budget Giorn.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.campaign_name}</TableCell>
              <TableCell>
                <Badge variant={c.status === "ENABLED" ? "default" : "secondary"}>
                  {c.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{c.daily_budget ? formatCurrency(c.daily_budget) : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
