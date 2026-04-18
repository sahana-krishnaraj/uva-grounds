/**
 * Demo sign-in flag (localStorage). Set on signup/profile; cleared on Home log out.
 */
(function () {
  var SESSION_KEY = "hoosout_signed_in_v1";

  function applyTheme() {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", "dark");
  }

  applyTheme();

  window.HoosOutSession = {
    signIn: function () {
      try {
        localStorage.setItem(SESSION_KEY, "1");
      } catch (e) {}
    },
    signOut: function () {
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch (e) {}
    },
    isSignedIn: function () {
      try {
        return localStorage.getItem(SESSION_KEY) === "1";
      } catch (e) {
        return false;
      }
    },
  };
})();
