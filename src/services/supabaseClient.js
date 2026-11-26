import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://bztspepijnvskcwjwjeb.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_WmVF8jHtS-OYJd6OnhD6wQ_KjU63bf6';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
