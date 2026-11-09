/**
 * The app's data layer. Screens and components get data only from the
 * modules in this folder (events, crews, profiles, ...), never from a
 * backend SDK directly; scripts/data-layer.test.mjs enforces it.
 *
 * Today the modules call Supabase. As the API takes over (see the Dev
 * Discussions doc, "Migration plan"), each module switches to calling the
 * API, one area at a time, and no screen has to change.
 *
 * This file is the only one in the folder that knows which backend is used.
 */
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/** True once the app has backend credentials (else screens show sample data). */
export const isBackendConfigured = isSupabaseConfigured;

/** For the data modules only. */
export const db = supabase;
