export const dynamic = "force-dynamic";

import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTextyessOverview, getTextyessCampaigns, getTextyessOrders } from "@/lib/queries/textyess";
import { TextyessCampaignsTable } from "./textyess-campaigns-table";
import { TextyessOrdersTable } from "./textyess-orders-table";

export default async function TextyessPage() {
  const [overview, campaigns, orders] = await Promise.all([
    getTextyessOverview(),
    getTextyessCampaigns(),
    getTextyessOrders(),
  ]);

  return (
    <div>
      <PageHeader title="TextYess" description="WhatsApp Marketing & Conversational Commerce" />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          title="Ordini Attribuiti"
          value={overview.totalOrders}
          format="number"
        />
        <KpiCard
          title="Revenue Totale"
          value={overview.totalRevenue}
          format="currency"
          variant="green"
        />
        <KpiCard
          title="Campagne"
          value={overview.totalCampaigns}
          format="number"
          variant="blue"
        />
        <KpiCard
          title="Automazioni"
          value={overview.totalAutomations}
          format="number"
          variant="violet"
        />
        <KpiCard
          title="ROAS Medio"
          value={overview.avgRoas}
          format="number"
          variant="amber"
        />
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Campagne WhatsApp ({campaigns.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <TextyessCampaignsTable campaigns={campaigns} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ordini Attribuiti ({overview.totalOrders})</CardTitle>
          </CardHeader>
          <CardContent>
            <TextyessOrdersTable orders={orders} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
