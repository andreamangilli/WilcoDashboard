import { PageHeader } from "@/components/page-header";
import { SyncButton } from "./sync-button";
import { SettingsTabs } from "./settings-tabs";

export default function SettingsPage() {
  return (
    <div>
      <PageHeader title="Impostazioni" description="Gestione integrazioni e sincronizzazione">
        <SyncButton />
      </PageHeader>
      <SettingsTabs />
    </div>
  );
}
