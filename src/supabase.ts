import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const syncEnabled = Boolean(url && anon);
export const supabase = createClient(url || 'https://placeholder.supabase.co', anon || 'placeholder-anon-key');
