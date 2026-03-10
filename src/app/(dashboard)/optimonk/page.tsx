export const dynamic = "force-dynamic";

import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOptimonkOverview, getOptimonkCampaigns } from "@/lib/queries/optimonk";
import { OptimonkCampaignsTable } from "./optimonk-campaigns-table";

export default async function OptimonkPage() {
  const [overview, campaigns] = await Promise.all([
    getOptimonkOverview(),
    getOptimonkCampaigns(),
  ]);

  return (
    <div>
      <PageHeader title="OptiMonk" description="Popup e conversion optimization" />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          title="Campagne Totali"
          value={overview.totalCampaigns}
          format="number"
        />
        <KpiCard
          title="Campagne Attive"
          value={overview.activeCampaigns}
          format="number"
          variant="green"
        />
        <KpiCard
          title="Impressioni"
          value={overview.totalImpressions}
          format="number"
          variant="blue"
        />
        <KpiCard
          title="Conversioni"
          value={overview.totalConversions}
          format="number"
          variant="violet"
        />
        <KpiCard
          title="Tasso Conversione"
          value={overview.avgConversionRate * 100}
          format="percent"
          variant="amber"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Campagne ({overview.activeCampaigns} attive su {overview.totalCampaigns})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OptimonkCampaignsTable campaigns={campaigns} />
        </CardContent>
      </Card>
    </div>
  );
}
