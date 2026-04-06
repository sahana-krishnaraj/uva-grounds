/**
 * Display name for nav/composer — prefers public.profiles over auth metadata (no clobbering).
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

function displayNameFromProfileRow(row) {
  if (!row) return "";
  var pref = String(row.preferred_name || "").trim();
  if (pref) return pref;
  var fn = String(row.first_name || "").trim();
  var ln = String(row.last_name || "").trim();
  if (fn || ln) return [fn, ln].filter(Boolean).join(" ");
  return String(row.computing_id || "").trim();
}

export async function syncHoosOutDisplayName() {
  window.HoosOutUserDisplayName = "You";
  try {
    var res = await supabase.auth.getSession();
    var session = res && res.data ? res.data.session : null;
    if (!session || !session.user) return window.HoosOutUserDisplayName;

    var fromMeta = displayNameFromUser(session.user);
    var pr = await supabase
      .from("profiles")
      .select("first_name, last_name, preferred_name, computing_id")
      .eq("id", session.user.id)
      .maybeSingle();
    var fromRow = displayNameFromProfileRow(pr.data);
    if (fromRow) {
      window.HoosOutUserDisplayName = fromRow;
      return fromRow;
    }
    window.HoosOutUserDisplayName = fromMeta;
    return fromMeta;
  } catch (e) {
    return window.HoosOutUserDisplayName;
  }
}

/**
 * Backfill profiles from auth metadata only where the row still has empty names
 * (never overwrite names the user saved during setup or settings).
 */
export async function upsertMyProfileRow() {
  try {
    var res = await supabase.auth.getSession();
    var session = res && res.data ? res.data.session : null;
    if (!session || !session.user) return;
    var u = session.user;
    var m = u.user_metadata || {};
    var metaFn = String(m.first_name || "").trim();
    var metaLn = String(m.last_name || "").trim();
    var metaCid = String(m.computing_id || "").trim();

    var exRes = await supabase.from("profiles").select("*").eq("id", u.id).maybeSingle();
    var ex = exRes.data;

    if (!ex) {
      await supabase.from("profiles").insert({
        id: u.id,
        first_name: metaFn || null,
        last_name: metaLn || null,
        computing_id: metaCid || null,
      });
      return;
    }

    var patch = {};
    if (!String(ex.first_name || "").trim() && metaFn) patch.first_name = metaFn;
    if (!String(ex.last_name || "").trim() && metaLn) patch.last_name = metaLn;
    if (!String(ex.computing_id || "").trim() && metaCid) patch.computing_id = metaCid;
    if (Object.keys(patch).length) {
      await supabase.from("profiles").update(patch).eq("id", u.id);
    }
  } catch (e) {
    console.warn("HoosOut: profiles backfill", e);
  }
}
