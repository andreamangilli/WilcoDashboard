export const dynamic = 'force-dynamic';

import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getKlaviyoOverview, getKlaviyoCampaigns } from "@/lib/queries/klaviyo";
import { KlaviyoCampaignsTable } from "./klaviyo-campaigns-table";

export default async function KlaviyoPage() {
  const [overview, campaigns] = await Promise.all([
    getKlaviyoOverview(),
    getKlaviyoCampaigns(),
  ]);

  const e = overview.email;
  const sentCampaigns = campaigns.filter((c) => c.status === "Sent");

  return (
    <div>
      <PageHeader title="Klaviyo" description="Email marketing e campagne" />

      {/* Overview KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-8">
        <KpiCard title="Campagne Inviate" value={overview.total.campaigns} format="number" />
        <KpiCard title="Revenue Totale" value={overview.total.revenue} format="currency" variant="green" />
        <KpiCard title="Conversioni" value={overview.total.conversions} format="number" variant="rose" />
        <KpiCard title="Destinatari" value={e.recipients} format="number" />
        <KpiCard title="Aperture" value={e.opens} format="number" />
        <KpiCard title="Open Rate" value={e.open_rate * 100} format="percent" variant="violet" />
        <KpiCard title="Click" value={e.clicks} format="number" />
        <KpiCard title="Click Rate" value={e.click_rate * 100} format="percent" variant="amber" />
      </div>

      {/* Revenue per email */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-xs uppercase">Rev/Email Inviata</p>
            <p className="text-2xl font-bold">
              €{e.recipients > 0 ? (e.revenue / e.recipients).toFixed(3) : "0"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-xs uppercase">Rev/Campagna</p>
            <p className="text-2xl font-bold">
              €{e.count > 0 ? (e.revenue / e.count).toFixed(2) : "0"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-xs uppercase">Conv. Rate</p>
            <p className="text-2xl font-bold">
              {e.clicks > 0 ? ((e.conversions / e.clicks) * 100).toFixed(1) : "0"}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-muted-foreground text-xs uppercase">Unsub Rate</p>
            <p className="text-2xl font-bold">
              {e.recipients > 0 ? ((e.unsubscribes / e.recipients) * 100).toFixed(2) : "0"}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Campaigns Table */}
      <Card>
        <CardHeader>
          <CardTitle>Campagne ({sentCampaigns.length} inviate)</CardTitle>
        </CardHeader>
        <CardContent>
          <KlaviyoCampaignsTable campaigns={campaigns} />
        </CardContent>
      </Card>
    </div>
  );
}
