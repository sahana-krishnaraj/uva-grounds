/**
 * Load profiles row into localStorage (hoosout_profile) for existing me.html UI.
 */
import { supabase } from "./supabase.js";

export async function syncProfileToLocalStorage() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;

  const { data: row, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) {
    console.warn("HoosOut: profile load", error.message);
    return;
  }
  if (!row) return;

  const p = {
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    preferredName: row.preferred_name || row.first_name || "",
    pronouns: row.pronouns || "",
    year: row.year || "",
    bio: row.bio || "",
    location: row.location || "",
    interests: row.interests || "",
    vibe: row.vibe || "",
    schedule: row.schedule || "",
    computingId: row.computing_id || "",
    avatarUrl: row.avatar_url || "",
  };
  try {
    localStorage.setItem("hoosout_profile", JSON.stringify(p));
  } catch (e) {
    console.warn("HoosOut: could not cache profile", e);
  }
}

/** Update me.html hero + bio from cached profile (same keys as legacy hoosout_profile). */
export function applyCachedProfileToMeDom() {
  const raw = localStorage.getItem("hoosout_profile");
  if (!raw) return;
  let p;
  try {
    p = JSON.parse(raw);
  } catch (err) {
    return;
  }
  const fullName = [p.firstName, p.lastName].filter(Boolean).join(" ");
  const handle =
    "@" +
    String(p.preferredName || p.firstName || "you")
      .toLowerCase()
      .replace(/\s+/g, "");

  const nameEl = document.querySelector(".me-hero-name");
  const handleEl = document.querySelector(".me-hero-handle");
  if (nameEl) nameEl.textContent = fullName || "Your HoosOut";
  if (handleEl) {
    const meta = [handle];
    if (p.year) meta.push(p.year);
    if (p.pronouns) meta.push(p.pronouns);
    handleEl.textContent = meta.join(" · ");
  }

  const fallbackEl = document.querySelector(".me-hero .js-hoosout-avatar-fallback");
  if (fallbackEl && p.firstName) {
    fallbackEl.textContent = (p.firstName[0] + (p.lastName ? p.lastName[0] : "")).toUpperCase();
  }

  const fields = [
    { key: "bio", selector: ".js-bio-bio" },
    { key: "interests", selector: ".js-bio-interests" },
    { key: "vibe", selector: ".js-bio-vibe" },
    { key: "location", selector: ".js-bio-location" },
    { key: "schedule", selector: ".js-bio-schedule" },
  ];
  fields.forEach((f) => {
    if (!p[f.key]) return;
    const item = document.querySelector(f.selector);
    if (!item) return;
    const val = item.querySelector(".me-bio-value");
    if (val) val.textContent = p[f.key];
    item.removeAttribute("hidden");
  });
}
