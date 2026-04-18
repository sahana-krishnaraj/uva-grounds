import { supabase } from "./supabase.js";

export async function getBlockedUserIds(myId) {
  if (!myId) return new Set();
  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocker_id, blocked_id")
    .or("blocker_id.eq." + myId + ",blocked_id.eq." + myId);
  if (error) return new Set();
  const ids = new Set();
  (data || []).forEach((r) => {
    if (r.blocker_id === myId && r.blocked_id) ids.add(r.blocked_id);
    if (r.blocked_id === myId && r.blocker_id) ids.add(r.blocker_id);
  });
  return ids;
}

export async function blockUser(myId, otherId, reason) {
  if (!myId || !otherId || myId === otherId) return { error: new Error("Invalid user.") };
  return supabase.from("user_blocks").upsert({
    blocker_id: myId,
    blocked_id: otherId,
    reason: reason || null,
  });
}

export async function unblockUser(myId, otherId) {
  if (!myId || !otherId) return { error: new Error("Invalid user.") };
  return supabase.from("user_blocks").delete().eq("blocker_id", myId).eq("blocked_id", otherId);
}

export async function submitUserReport(myId, reportedUserId, reason) {
  if (!myId || !reportedUserId || !reason) return { error: new Error("Missing report fields.") };
  return supabase.from("moderation_reports").insert({
    reporter_id: myId,
    reported_user_id: reportedUserId,
    report_type: "user",
    reason: String(reason).trim(),
  });
}

export async function submitEventReport(myId, eventId, reason) {
  if (!myId || !eventId || !reason) return { error: new Error("Missing report fields.") };
  return supabase.from("moderation_reports").insert({
    reporter_id: myId,
    event_id: eventId,
    report_type: "event",
    reason: String(reason).trim(),
  });
}
