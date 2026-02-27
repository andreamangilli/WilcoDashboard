import { createServiceClient } from "@/lib/supabase/server";

export async function logSyncStart(source: string) {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("sync_log")
    .insert({ source, status: "running" })
    .select("id")
    .single();
  return data!.id;
}

export async function logSyncSuccess(id: string, recordsSynced: number) {
  const supabase = await createServiceClient();
  await supabase
    .from("sync_log")
    .update({
      status: "success",
      records_synced: recordsSynced,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function logSyncError(id: string, error: string) {
  const supabase = await createServiceClient();
  await supabase
    .from("sync_log")
    .update({
      status: "error",
      error,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
