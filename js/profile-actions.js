/**
 * Block feed/post interactions until profile onboarding (incl. year) is finished.
 */
import { supabase } from "./supabase.js";

export function profileRowMeetsActionRequirements(row) {
  if (!row) return false;
  const fn = String(row.first_name || "").trim();
  const ln = String(row.last_name || "").trim();
  const pn = String(row.preferred_name || "").trim();
  const yr = String(row.year || "").trim();
  return !!(fn && ln && pn && yr);
}

/**
 * @returns {Promise<boolean>} true if caller should abort the action
 */
export async function mustAbortForIncompleteProfile() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { data: row, error } = await supabase
    .from("profiles")
    .select("first_name,last_name,preferred_name,year")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (error) {
    console.warn("HoosOut: profile action check", error.message);
    return false;
  }
  if (profileRowMeetsActionRequirements(row)) return false;
  window.alert(
    "Please finish your profile (including first name, last name, username, and year) before liking, commenting, RSVPing, or posting."
  );
  if (window.confirm("Open profile setup now?")) {
    window.location.href = "profile.html";
  }
  return true;
}
