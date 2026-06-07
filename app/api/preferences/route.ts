import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Read the caller's surf preferences (creating defaults if missing). */
export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "auth not configured" }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("surf_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!data) {
    const { data: created, error: upErr } = await supabase
      .from("surf_preferences")
      .upsert({ user_id: user.id }, { onConflict: "user_id" })
      .select("*")
      .single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json(created);
  }
  return NextResponse.json(data);
}

const NUM = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Update the caller's surf preferences. Only known fields are accepted. */
export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "auth not configured" }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = {
    user_id: user.id,
    updated_at: new Date().toISOString(),
  };
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (NUM(body.min_wave_m) !== undefined) patch.min_wave_m = body.min_wave_m;
  if (NUM(body.max_wave_m) !== undefined) patch.max_wave_m = body.max_wave_m;
  if (NUM(body.low_tide_window_h) !== undefined) patch.low_tide_window_h = body.low_tide_window_h;
  if (NUM(body.max_wind_kmh) !== undefined) patch.max_wind_kmh = body.max_wind_kmh;
  if (NUM(body.hour_start) !== undefined) patch.hour_start = body.hour_start;
  if (NUM(body.hour_end) !== undefined) patch.hour_end = body.hour_end;
  if (NUM(body.notify_hour) !== undefined) patch.notify_hour = body.notify_hour;

  const { data, error } = await supabase
    .from("surf_preferences")
    .upsert(patch, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
