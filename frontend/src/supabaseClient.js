import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://dwfqpaepmymzntluymgw.supabase.co";
const supabaseAnonKey = "sb_publishable_yTl98pqnsbvT8BrAIU_t0g_TGfVEZ_s";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
