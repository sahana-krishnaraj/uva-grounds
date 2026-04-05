/**
 * Bell + dropdown; calls syncNotificationsFromSupabase when logged in.
 */
import { supabase } from "./supabase.js";
import { syncNotificationsFromSupabase } from "./notifications-sync.js";

function escapeHtml(s) {
  if (s == null) return "";
  var div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function renderDropdown() {
  var listEl = document.getElementById("nav-notif-dropdown");
  var badge = document.getElementById("nav-notif-badge");
  if (!listEl || !window.HoosOutNotifications) return;

  var list = window.HoosOutNotifications.list();
  var unread = window.HoosOutNotifications.unreadCount();
  if (badge) {
    badge.textContent = unread > 9 ? "9+" : String(unread);
    badge.hidden = unread === 0;
  }

  if (!list.length) {
    listEl.innerHTML =
      '<p class="nav-notif-empty">No notifications yet.</p>';
    return;
  }

  listEl.innerHTML = list
    .slice(0, 25)
    .map(function (n) {
      var unreadCls = n.read ? "" : " nav-notif-item--unread";
      return (
        '<a href="' +
        escapeHtml(n.href || "#") +
        '" class="nav-notif-item' +
        unreadCls +
        '" data-notif-id="' +
        escapeHtml(n.id) +
        '">' +
        "<strong>" +
        escapeHtml(n.title || "") +
        "</strong>" +
        '<span class="nav-notif-body">' +
        escapeHtml(n.body || "") +
        "</span></a>"
      );
    })
    .join("");

  listEl.querySelectorAll(".nav-notif-item").forEach(function (a) {
    a.addEventListener("click", function () {
      var id = a.getAttribute("data-notif-id");
      if (id) window.HoosOutNotifications.markRead(id);
      renderDropdown();
    });
  });
}

export async function initNotificationsUi() {
  var bell = document.getElementById("nav-notif-bell");
  var panel = document.getElementById("nav-notif-panel");
  var wrap = document.querySelector(".nav-notifications-wrap");
  if (!bell || !panel) return;

  var {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await syncNotificationsFromSupabase(user.id);
  renderDropdown();

  setInterval(function () {
    syncNotificationsFromSupabase(user.id).then(renderDropdown);
  }, 60000);

  bell.addEventListener("click", function (e) {
    e.stopPropagation();
    var open = panel.hidden;
    panel.hidden = !open;
    bell.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      syncNotificationsFromSupabase(user.id).then(renderDropdown);
    }
  });

  document.getElementById("nav-notif-mark-read")?.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (window.HoosOutNotifications) window.HoosOutNotifications.markAllRead();
    renderDropdown();
  });

  document.addEventListener("click", function () {
    panel.hidden = true;
    bell.setAttribute("aria-expanded", "false");
  });
  panel.addEventListener("click", function (e) {
    e.stopPropagation();
  });
}
