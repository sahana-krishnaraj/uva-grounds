/**
 * Ensures every club created_by this user has a matching club_members owner row.
 * Fixes cases where a club row exists without membership (manual SQL, failed insert, etc.).
 */
export async function ensureClubOwnerMembership(supabase, userId) {
  if (!userId) return;
  const { data: owned, error: oErr } = await supabase.from("clubs").select("id").eq("created_by", userId);
  if (oErr || !owned?.length) return;

  for (const c of owned) {
    const { data: mem } = await supabase
      .from("club_members")
      .select("club_id")
      .eq("club_id", c.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (mem) continue;
    const { error: insErr } = await supabase.from("club_members").insert({
      club_id: c.id,
      user_id: userId,
      role: "owner",
    });
    if (insErr) console.warn("HoosOut: could not repair club_members for club", c.id, insErr.message);
  }
}

/**
 * Load club ids where the user can post (owner / admin / editor).
 */
export async function fetchMyClubPostMemberships(supabase, userId) {
  const mem = await supabase
    .from("club_members")
    .select("club_id, role")
    .eq("user_id", userId)
    .in("role", ["owner", "admin", "editor"]);

  if (mem.error) {
    return { rows: [], error: mem.error };
  }
  const memberships = mem.data || [];
  const ids = memberships.map((m) => m.club_id).filter(Boolean);
  if (!ids.length) {
    return { rows: [], error: null };
  }
  const clubsRes = await supabase.from("clubs").select("id, name").in("id", ids);
  if (clubsRes.error) {
    return { rows: [], error: clubsRes.error };
  }
  const nameById = Object.fromEntries((clubsRes.data || []).map((c) => [c.id, c.name]));
  const rows = memberships.map((m) => ({
    club_id: m.club_id,
    role: m.role,
    name: nameById[m.club_id] || "Club",
  }));
  return { rows, error: null };
}
