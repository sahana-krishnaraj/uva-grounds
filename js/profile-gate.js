/**
 * Require a non-empty public.profiles display name before using main app pages.
 */
import { supabase } from "./supabase.js";

function profileRowLooksComplete(row) {
  if (!row) return false;
  const fn = String(row.first_name || "").trim();
  const ln = String(row.last_name || "").trim();
  const pn = String(row.preferred_name || "").trim();
  return !!(fn || ln || pn);
}

/**
 * @returns {Promise<boolean>} true if redirect was triggered
 */
export async function redirectIfProfileIncomplete(user) {
  if (!user || !user.id) return false;
  const path = typeof location !== "undefined" ? location.pathname || "" : "";
  if (
    /profile\.html|settings\.html|signup\.html|signup-welcome\.html|login\.html|verify\.html|index\.html|activity\.html|profile-view\.html|events-uva\.html$/i.test(
      path
    )
  ) {
    return false;
  }

  const { data: row, error } = await supabase
    .from("profiles")
    .select("first_name,last_name,preferred_name")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("HoosOut: profile gate", error.message);
    return false;
  }

  if (!profileRowLooksComplete(row)) {
    window.location.href = "profile.html";
    return true;
  }
  return false;
}
