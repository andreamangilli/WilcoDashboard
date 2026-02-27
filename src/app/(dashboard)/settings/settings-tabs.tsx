"use client";

import { useCallback, useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Eye, EyeOff, Loader2, Plus, CheckCircle2, XCircle } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShopifyStore {
  id: string;
  name: string;
  slug: string;
  shopify_domain: string;
  has_credentials: boolean;
  created_at: string;
}

interface AmazonAccount {
  id: string;
  name: string;
  marketplace_id: string;
  seller_id: string | null;
  has_credentials: boolean;
  created_at: string;
}

interface AdAccount {
  id: string;
  platform: "google" | "meta";
  account_id: string;
  account_name: string;
  store_id: string | null;
  has_credentials: boolean;
  created_at: string;
}

interface SyncLog {
  id: string;
  source: string;
  status: string;
  records_synced: number | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Password Input with toggle
// ---------------------------------------------------------------------------

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        onClick={() => setVisible(!visible)}
        tabIndex={-1}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Test Connection Button
// ---------------------------------------------------------------------------

function TestConnectionButton({
  platform,
  getCredentials,
}: {
  platform: string;
  getCredentials: () => Record<string, string>;
}) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [info, setInfo] = useState("");

  async function handleTest() {
    setState("loading");
    setInfo("");
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, credentials: getCredentials() }),
      });
      const data = await res.json();
      if (data.success) {
        setState("success");
        setInfo(data.info || "OK");
      } else {
        setState("error");
        setInfo(data.error || "Connessione fallita");
      }
    } catch {
      setState("error");
      setInfo("Errore di rete");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={handleTest} disabled={state === "loading"}>
        {state === "loading" && <Loader2 className="size-4 animate-spin" />}
        Test Connessione
      </Button>
      {state === "success" && (
        <span className="flex items-center gap-1 text-sm text-green-600">
          <CheckCircle2 className="size-4" /> {info}
        </span>
      )}
      {state === "error" && (
        <span className="flex items-center gap-1 text-sm text-red-600">
          <XCircle className="size-4" /> {info}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account Card
// ---------------------------------------------------------------------------

function AccountCard({
  title,
  subtitle,
  hasCredentials,
  onEdit,
  onDelete,
  onTest,
}: {
  title: string;
  subtitle: string;
  hasCredentials: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-1">{subtitle}</CardDescription>
          </div>
          <Badge variant={hasCredentials ? "default" : "secondary"}>
            {hasCredentials ? "Connesso" : "Non configurato"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onTest}>
            Test
          </Button>
          <Button variant="outline" size="sm" onClick={onEdit}>
            Modifica
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete}>
            Elimina
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shopify Tab
// ---------------------------------------------------------------------------

function ShopifyTab() {
  const [stores, setStores] = useState<ShopifyStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ShopifyStore | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [domain, setDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const fetchStores = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/stores");
      const data = await res.json();
      setStores(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchStores(); }, [fetchStores]);

  function openCreate() {
    setEditing(null);
    setName("");
    setSlug("");
    setDomain("");
    setAccessToken("");
    setDialogOpen(true);
  }

  function openEdit(store: ShopifyStore) {
    setEditing(store);
    setName(store.name);
    setSlug(store.slug);
    setDomain(store.shopify_domain);
    setAccessToken("");
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editing) {
        await fetch("/api/settings/stores", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editing.id,
            name,
            shopify_domain: domain,
            ...(accessToken ? { access_token: accessToken } : {}),
          }),
        });
      } else {
        await fetch("/api/settings/stores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, shopify_domain: domain, access_token: accessToken }),
        });
      }
      setDialogOpen(false);
      await fetchStores();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete(store: ShopifyStore) {
    if (!window.confirm(`Eliminare lo store "${store.name}"?`)) return;
    await fetch("/api/settings/stores", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: store.id }),
    });
    await fetchStores();
  }

  // Auto-generate slug from name
  function handleNameChange(v: string) {
    setName(v);
    if (!editing) {
      setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    }
  }

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Aggiungi Store
        </Button>
      </div>

      {stores.length === 0 ? (
        <EmptyState message="Nessuno store Shopify configurato" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {stores.map((store) => (
            <AccountCard
              key={store.id}
              title={store.name}
              subtitle={store.shopify_domain}
              hasCredentials={store.has_credentials}
              onEdit={() => openEdit(store)}
              onDelete={() => handleDelete(store)}
              onTest={() => {
                // Test opens dialog with test UI
                openEdit(store);
              }}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica Store Shopify" : "Nuovo Store Shopify"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Modifica i dettagli dello store. Lascia i campi credenziali vuoti per mantenerli invariati."
                : "Inserisci i dettagli del nuovo store Shopify."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="shopify-name">Nome</Label>
              <Input id="shopify-name" value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Il Mio Store" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="shopify-slug">Slug</Label>
              <Input id="shopify-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="il-mio-store" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="shopify-domain">Dominio Shopify</Label>
              <Input id="shopify-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="store.myshopify.com" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="shopify-token">Access Token</Label>
              <PasswordInput
                id="shopify-token"
                value={accessToken}
                onChange={setAccessToken}
                placeholder={editing ? "••••••••" : "shpat_..."}
              />
            </div>
            {(domain && accessToken) && (
              <TestConnectionButton
                platform="shopify"
                getCredentials={() => ({ domain, access_token: accessToken })}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleSave} disabled={saving || !name || !domain || (!editing && !accessToken)}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Amazon Tab
// ---------------------------------------------------------------------------

function AmazonTab() {
  const [accounts, setAccounts] = useState<AmazonAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AmazonAccount | null>(null);
  const [saving, setSaving] = useState(false);

  // Form
  const [name, setName] = useState("");
  const [marketplaceId, setMarketplaceId] = useState("APJ6JRA9NG5V4");
  const [sellerId, setSellerId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/amazon");
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  function openCreate() {
    setEditing(null);
    setName("");
    setMarketplaceId("APJ6JRA9NG5V4");
    setSellerId("");
    setClientId("");
    setClientSecret("");
    setRefreshToken("");
    setDialogOpen(true);
  }

  function openEdit(account: AmazonAccount) {
    setEditing(account);
    setName(account.name);
    setMarketplaceId(account.marketplace_id);
    setSellerId(account.seller_id || "");
    setClientId("");
    setClientSecret("");
    setRefreshToken("");
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const creds: Record<string, string> = {};
      if (clientId) creds.client_id = clientId;
      if (clientSecret) creds.client_secret = clientSecret;
      if (refreshToken) creds.refresh_token = refreshToken;

      if (editing) {
        await fetch("/api/settings/amazon", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editing.id,
            name,
            marketplace_id: marketplaceId,
            seller_id: sellerId || undefined,
            ...creds,
          }),
        });
      } else {
        await fetch("/api/settings/amazon", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            marketplace_id: marketplaceId,
            seller_id: sellerId || undefined,
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
          }),
        });
      }
      setDialogOpen(false);
      await fetchAccounts();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete(account: AmazonAccount) {
    if (!window.confirm(`Eliminare l'account "${account.name}"?`)) return;
    await fetch("/api/settings/amazon", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: account.id }),
    });
    await fetchAccounts();
  }

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Aggiungi Account
        </Button>
      </div>

      {accounts.length === 0 ? (
        <EmptyState message="Nessun account Amazon configurato" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              title={account.name}
              subtitle={`Marketplace: ${account.marketplace_id}${account.seller_id ? ` | Seller: ${account.seller_id}` : ""}`}
              hasCredentials={account.has_credentials}
              onEdit={() => openEdit(account)}
              onDelete={() => handleDelete(account)}
              onTest={() => openEdit(account)}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica Account Amazon" : "Nuovo Account Amazon"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Modifica i dettagli dell'account. Lascia i campi credenziali vuoti per mantenerli invariati."
                : "Inserisci i dettagli del nuovo account Amazon."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="amazon-name">Nome</Label>
              <Input id="amazon-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Amazon IT" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="amazon-marketplace">Marketplace ID</Label>
              <Input id="amazon-marketplace" value={marketplaceId} onChange={(e) => setMarketplaceId(e.target.value)} placeholder="APJ6JRA9NG5V4" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="amazon-seller">Seller ID (opzionale)</Label>
              <Input id="amazon-seller" value={sellerId} onChange={(e) => setSellerId(e.target.value)} placeholder="A1BC2DEF3GHI4J" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="amazon-client-id">Client ID</Label>
              <PasswordInput
                id="amazon-client-id"
                value={clientId}
                onChange={setClientId}
                placeholder={editing ? "••••••••" : "amzn1.application-oa2-client..."}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="amazon-client-secret">Client Secret</Label>
              <PasswordInput
                id="amazon-client-secret"
                value={clientSecret}
                onChange={setClientSecret}
                placeholder={editing ? "••••••••" : ""}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="amazon-refresh-token">Refresh Token</Label>
              <PasswordInput
                id="amazon-refresh-token"
                value={refreshToken}
                onChange={setRefreshToken}
                placeholder={editing ? "••••••••" : ""}
              />
            </div>
            {(clientId && clientSecret && refreshToken) && (
              <TestConnectionButton
                platform="amazon"
                getCredentials={() => ({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken })}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !name || !marketplaceId || (!editing && (!clientId || !clientSecret || !refreshToken))}
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Google Ads Tab
// ---------------------------------------------------------------------------

function GoogleAdsTab() {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdAccount | null>(null);
  const [saving, setSaving] = useState(false);

  // Form
  const [accountName, setAccountName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [developerToken, setDeveloperToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [managerId, setManagerId] = useState("");

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/ads");
      const data = await res.json();
      const filtered = (Array.isArray(data) ? data : []).filter(
        (a: AdAccount) => a.platform === "google"
      );
      setAccounts(filtered);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  function openCreate() {
    setEditing(null);
    setAccountName("");
    setAccountId("");
    setDeveloperToken("");
    setClientId("");
    setClientSecret("");
    setRefreshToken("");
    setManagerId("");
    setDialogOpen(true);
  }

  function openEdit(account: AdAccount) {
    setEditing(account);
    setAccountName(account.account_name);
    setAccountId(account.account_id);
    setDeveloperToken("");
    setClientId("");
    setClientSecret("");
    setRefreshToken("");
    setManagerId("");
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const creds: Record<string, string> = {};
      if (developerToken) creds.developer_token = developerToken;
      if (clientId) creds.client_id = clientId;
      if (clientSecret) creds.client_secret = clientSecret;
      if (refreshToken) creds.refresh_token = refreshToken;
      if (managerId) creds.manager_id = managerId;

      if (editing) {
        await fetch("/api/settings/ads", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editing.id,
            platform: "google",
            account_id: accountId,
            account_name: accountName,
            ...creds,
          }),
        });
      } else {
        await fetch("/api/settings/ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: "google",
            account_id: accountId,
            account_name: accountName,
            developer_token: developerToken,
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            ...(managerId ? { manager_id: managerId } : {}),
          }),
        });
      }
      setDialogOpen(false);
      await fetchAccounts();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete(account: AdAccount) {
    if (!window.confirm(`Eliminare l'account "${account.account_name}"?`)) return;
    await fetch("/api/settings/ads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: account.id }),
    });
    await fetchAccounts();
  }

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Aggiungi Account
        </Button>
      </div>

      {accounts.length === 0 ? (
        <EmptyState message="Nessun account Google Ads configurato" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              title={account.account_name}
              subtitle={`Account ID: ${account.account_id}`}
              hasCredentials={account.has_credentials}
              onEdit={() => openEdit(account)}
              onDelete={() => handleDelete(account)}
              onTest={() => openEdit(account)}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica Account Google Ads" : "Nuovo Account Google Ads"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Modifica i dettagli dell'account. Lascia i campi credenziali vuoti per mantenerli invariati."
                : "Inserisci i dettagli del nuovo account Google Ads."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="google-name">Nome Account</Label>
              <Input id="google-name" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Google Ads Principale" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="google-account-id">Account ID</Label>
              <Input id="google-account-id" value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="123-456-7890" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="google-dev-token">Developer Token</Label>
              <PasswordInput
                id="google-dev-token"
                value={developerToken}
                onChange={setDeveloperToken}
                placeholder={editing ? "••••••••" : ""}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="google-client-id">Client ID</Label>
              <PasswordInput
                id="google-client-id"
                value={clientId}
                onChange={setClientId}
                placeholder={editing ? "••••••••" : ""}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="google-client-secret">Client Secret</Label>
              <PasswordInput
                id="google-client-secret"
                value={clientSecret}
                onChange={setClientSecret}
                placeholder={editing ? "••••••••" : ""}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="google-refresh-token">Refresh Token</Label>
              <PasswordInput
                id="google-refresh-token"
                value={refreshToken}
                onChange={setRefreshToken}
                placeholder={editing ? "••••••••" : ""}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="google-manager-id">Manager ID (opzionale)</Label>
              <Input id="google-manager-id" value={managerId} onChange={(e) => setManagerId(e.target.value)} placeholder="123-456-7890" />
            </div>
            {(clientId && clientSecret && refreshToken) && (
              <TestConnectionButton
                platform="google"
                getCredentials={() => ({
                  client_id: clientId,
                  client_secret: clientSecret,
                  refresh_token: refreshToken,
                })}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                saving ||
                !accountName ||
                !accountId ||
                (!editing && (!developerToken || !clientId || !clientSecret || !refreshToken))
              }
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meta Ads Tab
// ---------------------------------------------------------------------------

function MetaAdsTab() {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdAccount | null>(null);
  const [saving, setSaving] = useState(false);

  // Form
  const [accountName, setAccountName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/ads");
      const data = await res.json();
      const filtered = (Array.isArray(data) ? data : []).filter(
        (a: AdAccount) => a.platform === "meta"
      );
      setAccounts(filtered);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  function openCreate() {
    setEditing(null);
    setAccountName("");
    setAccountId("");
    setAccessToken("");
    setDialogOpen(true);
  }

  function openEdit(account: AdAccount) {
    setEditing(account);
    setAccountName(account.account_name);
    setAccountId(account.account_id);
    setAccessToken("");
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editing) {
        await fetch("/api/settings/ads", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editing.id,
            platform: "meta",
            account_id: accountId,
            account_name: accountName,
            ...(accessToken ? { access_token: accessToken } : {}),
          }),
        });
      } else {
        await fetch("/api/settings/ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: "meta",
            account_id: accountId,
            account_name: accountName,
            access_token: accessToken,
          }),
        });
      }
      setDialogOpen(false);
      await fetchAccounts();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete(account: AdAccount) {
    if (!window.confirm(`Eliminare l'account "${account.account_name}"?`)) return;
    await fetch("/api/settings/ads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: account.id }),
    });
    await fetchAccounts();
  }

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Aggiungi Account
        </Button>
      </div>

      {accounts.length === 0 ? (
        <EmptyState message="Nessun account Meta Ads configurato" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              title={account.account_name}
              subtitle={`Account ID: ${account.account_id}`}
              hasCredentials={account.has_credentials}
              onEdit={() => openEdit(account)}
              onDelete={() => handleDelete(account)}
              onTest={() => openEdit(account)}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica Account Meta Ads" : "Nuovo Account Meta Ads"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Modifica i dettagli dell'account. Lascia i campi credenziali vuoti per mantenerli invariati."
                : "Inserisci i dettagli del nuovo account Meta Ads."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="meta-name">Nome Account</Label>
              <Input id="meta-name" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Meta Ads Principale" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="meta-account-id">Account ID</Label>
              <Input id="meta-account-id" value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="act_123456789" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="meta-token">Access Token</Label>
              <PasswordInput
                id="meta-token"
                value={accessToken}
                onChange={setAccessToken}
                placeholder={editing ? "••••••••" : "EAABs..."}
              />
            </div>
            {accessToken && (
              <TestConnectionButton
                platform="meta"
                getCredentials={() => ({ access_token: accessToken })}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !accountName || !accountId || (!editing && !accessToken)}
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sync Log Tab
// ---------------------------------------------------------------------------

function SyncLogTab() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const res = await fetch("/api/settings/sync-log");
        if (res.ok) {
          const data = await res.json();
          setLogs(Array.isArray(data) ? data : []);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    fetchLogs();
  }, []);

  if (loading) return <LoadingState />;

  if (logs.length === 0) {
    return <EmptyState message="Nessun log di sincronizzazione disponibile" />;
  }

  return (
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
        {logs.map((log) => (
          <TableRow key={log.id}>
            <TableCell className="font-medium">{log.source}</TableCell>
            <TableCell>
              <Badge
                variant={
                  log.status === "success"
                    ? "default"
                    : log.status === "error"
                      ? "destructive"
                      : "secondary"
                }
              >
                {log.status}
              </Badge>
            </TableCell>
            <TableCell className="text-right">{log.records_synced || 0}</TableCell>
            <TableCell className="text-sm">
              {log.started_at ? new Date(log.started_at).toLocaleString("it-IT") : "\u2014"}
            </TableCell>
            <TableCell className="text-sm">
              {log.completed_at ? new Date(log.completed_at).toLocaleString("it-IT") : "\u2014"}
            </TableCell>
            <TableCell className="max-w-xs truncate text-sm text-red-600">
              {log.error || "\u2014"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// Shared UI helpers
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <span className="ml-2 text-muted-foreground">Caricamento...</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Tabs Component
// ---------------------------------------------------------------------------

export function SettingsTabs() {
  return (
    <Tabs defaultValue="shopify">
      <TabsList>
        <TabsTrigger value="shopify">Shopify</TabsTrigger>
        <TabsTrigger value="amazon">Amazon</TabsTrigger>
        <TabsTrigger value="google">Google Ads</TabsTrigger>
        <TabsTrigger value="meta">Meta Ads</TabsTrigger>
        <TabsTrigger value="logs">Log Sync</TabsTrigger>
      </TabsList>

      <TabsContent value="shopify" className="mt-6">
        <ShopifyTab />
      </TabsContent>
      <TabsContent value="amazon" className="mt-6">
        <AmazonTab />
      </TabsContent>
      <TabsContent value="google" className="mt-6">
        <GoogleAdsTab />
      </TabsContent>
      <TabsContent value="meta" className="mt-6">
        <MetaAdsTab />
      </TabsContent>
      <TabsContent value="logs" className="mt-6">
        <SyncLogTab />
      </TabsContent>
    </Tabs>
  );
}
