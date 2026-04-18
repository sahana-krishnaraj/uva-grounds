/**
 * Demo sign-in flag (localStorage). Set on verify/profile; cleared on Home log out.
 */
(function () {
  var SESSION_KEY = "hoosout_signed_in_v1";
  var THEME_KEY = "hoosout_theme_v1";

  function applyTheme(theme) {
    if (typeof document === "undefined") return;
    var t = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch (e) {}
  }

  function currentTheme() {
    try {
      var saved = localStorage.getItem(THEME_KEY);
      if (saved === "dark" || saved === "light") return saved;
    } catch (e) {}
    return "light";
  }

  applyTheme(currentTheme());

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
    setTheme: function (theme) {
      applyTheme(theme);
    },
    getTheme: function () {
      return currentTheme();
    },
  };
})();
