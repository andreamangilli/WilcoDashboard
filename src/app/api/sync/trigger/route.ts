import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runAllSyncs } from "@/lib/sync/orchestrator";

export const maxDuration = 300;

export async function POST() {
  // Verify the user is authenticated
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runAllSyncs();

  // Invalidate dashboard cache so pages show fresh data immediately
  revalidateTag("dashboard-data", "max");

  return NextResponse.json({ success: true, results });
}
