/**
 * Onboarding profile.html — save to Supabase + localStorage, then redirect.
 */
import { supabase } from "./supabase.js";

function fieldTrim(id) {
  var el = document.getElementById(id);
  return el && el.value != null ? String(el.value).trim() : "";
}

function showStatus(el, msg, isErr) {
  if (!el) return;
  el.hidden = !msg;
  el.textContent = msg || "";
  el.style.color = isErr ? "#b91c1c" : "var(--text-muted)";
}

(async function () {
  var {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  var form = document.getElementById("profile-form");
  var statusEl = document.getElementById("profile-setup-status");
  if (!form) return;

  if (window.HoosOutProfilePhoto && typeof window.HoosOutProfilePhoto.initMeEditor === "function") {
    window.HoosOutProfilePhoto.initMeEditor(document.body);
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!form.reportValidity()) return;

    var btn = form.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Saving…";
    }
    showStatus(statusEl, "Saving your profile…", false);

    var firstName = fieldTrim("first-name");
    var lastName = fieldTrim("last-name");
    var preferredName = fieldTrim("preferred-name");
    var photoDataUrl =
      window.HoosOutProfilePhoto && typeof window.HoosOutProfilePhoto.get === "function"
        ? window.HoosOutProfilePhoto.get() || ""
        : "";

    var profileLocal = {
      firstName,
      lastName,
      preferredName,
      pronouns: fieldTrim("pronouns"),
      year: document.getElementById("year") ? document.getElementById("year").value : "",
      location: fieldTrim("location-dorm"),
      interests: fieldTrim("interests"),
      vibe: fieldTrim("vibe"),
      schedule: fieldTrim("schedule"),
      bio: fieldTrim("bio"),
      computingId: "",
      avatarUrl: photoDataUrl || "",
    };

    try {
      localStorage.setItem("hoosout_profile", JSON.stringify(profileLocal));
    } catch (err) {
      showStatus(statusEl, "Could not cache profile on this device.", true);
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Save & Go to Feed";
      }
      return;
    }

    var row = {
      id: user.id,
      first_name: firstName || null,
      last_name: lastName || null,
      preferred_name: preferredName || null,
      pronouns: profileLocal.pronouns || null,
      year: profileLocal.year || null,
      location: profileLocal.location || null,
      interests: profileLocal.interests || null,
      vibe: profileLocal.vibe || null,
      schedule: profileLocal.schedule || null,
      bio: profileLocal.bio || null,
      avatar_url: photoDataUrl || null,
    };

    var up = await supabase.from("profiles").upsert(row, { onConflict: "id" });
    if (up.error) {
      showStatus(statusEl, up.error.message || "Could not save profile.", true);
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Save & Go to Feed";
      }
      return;
    }

    await supabase.auth.updateUser({
      data: {
        first_name: firstName,
        last_name: lastName,
      },
    });

    showStatus(statusEl, "Saved! Taking you to your feed…", false);
    if (window.HoosOutSession) window.HoosOutSession.signIn();
    window.location.href = "home.html";
  });
})();
