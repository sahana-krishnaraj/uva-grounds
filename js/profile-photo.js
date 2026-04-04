/**
 * Profile photo — stored as a compressed JPEG data URL in localStorage (demo).
 */
(function () {
  var KEY = "hoosout_profile_photo_v1";
  var MAX_DIM = 384;
  var MAX_CHARS = 480000;

  function get() {
    try {
      return localStorage.getItem(KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function set(dataUrl) {
    try {
      if (dataUrl) localStorage.setItem(KEY, dataUrl);
      else localStorage.removeItem(KEY);
    } catch (e) {
      if (dataUrl) {
        alert("Could not save photo — try a smaller image.");
      }
    }
  }

  function clear() {
    set("");
  }

  function fileToDataUrl(file, cb) {
    if (!file || !/^image\//.test(file.type)) {
      cb(new Error("Please choose an image file."));
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var url = reader.result;
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth;
        var h = img.naturalHeight;
        if (!w || !h) {
          cb(new Error("Invalid image."));
          return;
        }
        var scale = Math.min(1, MAX_DIM / Math.max(w, h));
        var cw = Math.round(w * scale);
        var ch = Math.round(h * scale);
        var canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, cw, ch);
        var q = 0.88;
        var out = canvas.toDataURL("image/jpeg", q);
        while (out.length > MAX_CHARS && q > 0.45) {
          q -= 0.08;
          out = canvas.toDataURL("image/jpeg", q);
        }
        if (out.length > MAX_CHARS * 1.2) {
          cb(new Error("Image is too large — try another photo."));
          return;
        }
        cb(null, out);
      };
      img.onerror = function () {
        cb(new Error("Could not read this image."));
      };
      img.src = url;
    };
    reader.onerror = function () {
      cb(new Error("Could not read file."));
    };
    reader.readAsDataURL(file);
  }

  function refreshTargets(root) {
    root = root || document;
    var dataUrl = get();
    root.querySelectorAll("[data-hoosout-profile-avatar]").forEach(function (container) {
      var img = container.querySelector(".js-hoosout-avatar-img");
      var fb = container.querySelector(".js-hoosout-avatar-fallback");
      container.classList.toggle("has-profile-photo", !!dataUrl);
      if (img) {
        if (dataUrl) {
          img.src = dataUrl;
          img.removeAttribute("hidden");
        } else {
          img.removeAttribute("src");
          img.setAttribute("hidden", "");
        }
      }
      if (fb) {
        fb.hidden = !!dataUrl;
      }
    });
  }

  function initMeEditor(root) {
    root = root || document;
    var fileInput = root.querySelector(".js-profile-photo-file");
    if (!fileInput) return;
    var changeBtn = root.querySelector(".js-profile-photo-change");
    var removeBtn = root.querySelector(".js-profile-photo-remove");

    function sync() {
      refreshTargets(root);
      refreshTargets(document);
    }

    if (changeBtn) {
      changeBtn.addEventListener("click", function () {
        fileInput.click();
      });
    }
    fileInput.addEventListener("change", function () {
      var f = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (!f) return;
      fileToDataUrl(f, function (err, url) {
        if (err) {
          alert(err.message);
          return;
        }
        set(url);
        sync();
      });
    });
    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        clear();
        sync();
      });
    }
    sync();
  }

  window.HoosOutProfilePhoto = {
    get: get,
    set: set,
    clear: clear,
    fileToDataUrl: fileToDataUrl,
    refreshTargets: refreshTargets,
    initMeEditor: initMeEditor,
  };
})();
