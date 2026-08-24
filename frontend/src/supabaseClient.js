import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase config. Copy frontend/.env.example to frontend/.env " +
      "and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart " +
      "the dev server (Vite only reads .env at startup).",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
