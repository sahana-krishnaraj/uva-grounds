import { supabase } from "./supabase.js";
import { requireAuth } from "./auth-guard.js";
import { initNavActivityBadge } from "./nav-activity-badge.js";
const user = await requireAuth();
if (!user) throw new Error("");
function rowToLocal(row) {
  return {
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    preferredName: row.preferred_name || "",
    pronouns: row.pronouns || "",
    year: row.year || "",
    location: row.location || "",
    interests: row.interests || "",
    schedule: row.schedule || "",
    bio: row.bio || "",
    computingId: row.computing_id || "",
    avatarUrl: row.avatar_url || "",
  };
}
function fillFormFromLocal(p) {
  document.getElementById("first-name").value = p.firstName || "";
  document.getElementById("last-name").value = p.lastName || "";
  document.getElementById("preferred-name").value = p.preferredName || "";
  document.getElementById("pronouns").value = p.pronouns || "";
  document.getElementById("year").value = p.year || "";
  document.getElementById("location-dorm").value = p.location || "";
  document.getElementById("interests").value = p.interests || "";
  document.getElementById("schedule").value = p.schedule || "";
  document.getElementById("bio").value = p.bio || "";
}
const { data: row } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
if (row) {
  try {
    localStorage.setItem("hoosout_profile", JSON.stringify(rowToLocal(row)));
  } catch (e) {}
  fillFormFromLocal(rowToLocal(row));
} else {
  const raw = localStorage.getItem("hoosout_profile");
  if (raw) {
    try {
      fillFormFromLocal(JSON.parse(raw));
    } catch (e) {}
  }
}
if (window.HoosOutProfilePhoto && typeof window.HoosOutProfilePhoto.initMeEditor === "function") {
  window.HoosOutProfilePhoto.initMeEditor(document.body);
}
document.getElementById("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  if (!form.reportValidity()) return;
  const profile = {
    firstName: document.getElementById("first-name").value.trim(),
    lastName: document.getElementById("last-name").value.trim(),
    preferredName: document.getElementById("preferred-name").value.trim(),
    pronouns: document.getElementById("pronouns").value.trim(),
    year: document.getElementById("year").value,
    location: document.getElementById("location-dorm").value.trim(),
    interests: document.getElementById("interests").value.trim(),
    schedule: document.getElementById("schedule").value.trim(),
    bio: document.getElementById("bio").value.trim(),
  };
  var photoDataUrl =
    window.HoosOutProfilePhoto && typeof window.HoosOutProfilePhoto.get === "function"
      ? window.HoosOutProfilePhoto.get() || ""
      : "";
  try {
    localStorage.setItem(
      "hoosout_profile",
      JSON.stringify({ ...profile, avatarUrl: photoDataUrl || "" })
    );
  } catch (err) {}
  const up = {
    id: user.id,
    first_name: profile.firstName || null,
    last_name: profile.lastName || null,
    preferred_name: profile.preferredName || null,
    pronouns: profile.pronouns || null,
    year: profile.year || null,
    location: profile.location || null,
    interests: profile.interests || null,
    schedule: profile.schedule || null,
    bio: profile.bio || null,
    avatar_url: photoDataUrl || null,
  };
  const { error } = await supabase.from("profiles").upsert(up, { onConflict: "id" });
  if (error) {
    alert(error.message);
    return;
  }
  window.location.href = "me.html";
});
await initNavActivityBadge();
