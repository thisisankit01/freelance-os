import { createClient } from '@supabase/supabase-js'


// Browser client — uses anon key, respects RLS policies
// This runs in the browser, so it can only do what the user is allowed to do
export const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)