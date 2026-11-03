// Public Supabase settings. Only the publishable (anon) key belongs here - it is safe in the
// browser because Row Level Security and the FastAPI admin check guard the data.
// Never add the service-role/secret key to a NEXT_PUBLIC_ variable.
export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return { url, key };
}
