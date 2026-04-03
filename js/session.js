/**
 * Demo sign-in flag (localStorage). Set on verify/profile; cleared on Home log out.
 */
(function () {
  var SESSION_KEY = "hoosout_signed_in_v1";

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
