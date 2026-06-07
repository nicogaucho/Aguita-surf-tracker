/** Centralised env access so the app degrades gracefully when Supabase isn't configured yet. */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** True when public Supabase credentials are present (auth features can be used). */
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
