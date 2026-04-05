/**
 * Redirect unauthenticated users to the landing page.
 */
import { supabase } from "./supabase.js";

export async function requireAuth() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    window.location.href = "index.html";
    return null;
  }
  return data.user;
}
