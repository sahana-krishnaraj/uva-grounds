/**
 * Unread count on #nav-activity-badge + Supabase Realtime refresh.
 */
import { supabase } from "./supabase.js";

export async function initNavActivityBadge() {
  var badge = document.getElementById("nav-activity-badge");
  if (!badge) return;

  var {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  async function tick() {
    var q = await supabase
      .from("app_notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .eq("read", false);
    if (q.error) return;
    var n = q.count || 0;
    badge.textContent = n > 9 ? "9+" : n > 0 ? String(n) : "";
    badge.hidden = n === 0;
  }

  await tick();

  supabase
    .channel("nav-activity-" + user.id)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "app_notifications",
        filter: "recipient_id=eq." + user.id,
      },
      function () {
        tick();
      }
    )
    .subscribe();
}
