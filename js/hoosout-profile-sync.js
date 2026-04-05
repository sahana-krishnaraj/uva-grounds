/**
 * Sync display name from Supabase Auth + upsert public.profiles for the feed directory.
 */
import { supabase } from "./supabase.js";

function displayNameFromUser(user) {
  if (!user) return "You";
  var m = user.user_metadata || {};
  var fn = String(m.first_name || "").trim();
  var ln = String(m.last_name || "").trim();
  var cid = String(m.computing_id || "").trim();
  var combined = [fn, ln].filter(Boolean).join(" ");
  if (combined) return combined;
  if (cid) return cid;
  var em = String(user.email || "").trim();
  if (em && em.indexOf("@") > 0) return em.split("@")[0];
  return "You";
}

export async function syncHoosOutDisplayName() {
  window.HoosOutUserDisplayName = "You";
  try {
    var res = await supabase.auth.getSession();
    var session = res && res.data ? res.data.session : null;
    if (!session || !session.user) return window.HoosOutUserDisplayName;
    var name = displayNameFromUser(session.user);
    window.HoosOutUserDisplayName = name;
    return name;
  } catch (e) {
    return window.HoosOutUserDisplayName;
  }
}

export async function upsertMyProfileRow() {
  try {
    var res = await supabase.auth.getSession();
    var session = res && res.data ? res.data.session : null;
    if (!session || !session.user) return;
    var u = session.user;
    var m = u.user_metadata || {};
    var row = {
      id: u.id,
      first_name: String(m.first_name || "").trim() || null,
      last_name: String(m.last_name || "").trim() || null,
      computing_id: String(m.computing_id || "").trim() || null,
    };
    var up = await supabase.from("profiles").upsert(row, { onConflict: "id" });
    if (up.error) console.warn("HoosOut: profiles upsert", up.error.message);
  } catch (e) {
    console.warn("HoosOut: profiles upsert", e);
  }
}
