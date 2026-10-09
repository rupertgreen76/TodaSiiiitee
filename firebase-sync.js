(function () {
  var KEYS = [
    "todaDrivers",
    "todaDigitalQueue",
    "todaAnnouncements",
    "todaFinancialTransactions",
    "todaVerificationCount",
    "todaRides",
    "todaRatings"
  ];
  var cfg = window.TODA_FIREBASE_CONFIG;
  var nativeSet = Storage.prototype.setItem;
  var nativeGet = Storage.prototype.getItem;
  var TODA = (window.TODA = {});
  var ready = !!(window.firebase && cfg && cfg.apiKey && cfg.apiKey.indexOf("YOUR_") !== 0);
  var db = null;
  var col = null;

  TODA.ready = ready;

  TODA.session = function () {
    try {
      return JSON.parse(sessionStorage.getItem("todaSession"));
    } catch (e) {
      return null;
    }
  };

  TODA.setSession = function (role, name, email) {
    sessionStorage.setItem("todaSession", JSON.stringify({ role: role, name: name, email: email || "" }));
  };

  TODA.logout = function () {
    sessionStorage.removeItem("todaSession");
    var done = function () {
      location.href = "Login.html";
    };
    if (TODA.auth) {
      TODA.auth.signOut().then(done, done);
    } else {
      done();
    }
  };

  TODA.requireRole = function (role) {
    var s = TODA.session();
    if (!s || s.role !== role) {
      location.replace("Login.html");
      return;
    }
    document.addEventListener("DOMContentLoaded", function () {
      var btn = document.createElement("button");
      btn.textContent = "Logout";
      btn.style.cssText =
        "position:fixed;right:16px;bottom:16px;z-index:99999;padding:10px 18px;border:none;border-radius:20px;background:#00a86b;color:#fff;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.4)";
      btn.onclick = TODA.logout;
      document.body.appendChild(btn);
      if (role === "member" && s.name) {
        document.querySelectorAll(".profile").forEach(function (el) {
          el.textContent = "\uD83D\uDC64 " + s.name;
        });
      }
    });
  };

  TODA.update = function (key, mutate) {
    if (!ready) {
      var list = [];
      try {
        list = JSON.parse(nativeGet.call(localStorage, key)) || [];
      } catch (e) {}
      var out = mutate(list);
      nativeSet.call(localStorage, key, JSON.stringify(list));
      return Promise.resolve(out);
    }
    var ref = col.doc(key);
    var result;
    return db
      .runTransaction(function (tx) {
        return tx.get(ref).then(function (snap) {
          var arr = snap.exists ? JSON.parse(snap.data().value) : [];
          result = mutate(arr);
          tx.set(ref, {
            value: JSON.stringify(arr),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          return arr;
        });
      })
      .then(function (arr) {
        nativeSet.call(localStorage, key, JSON.stringify(arr));
        return result;
      });
  };

  TODA.append = function (key, item) {
    return TODA.update(key, function (arr) {
      arr.unshift(item);
      return item;
    });
  };

  TODA.addDriver = function (data) {
    return TODA.update("todaDrivers", function (arr) {
      var max = 0;
      arr.forEach(function (d) {
        var m = /TODA-(\d+)/.exec(d.todaNumber || "");
        if (m) max = Math.max(max, Number(m[1]));
      });
      var next = max + 1;
      var driver = {
        id: Date.now(),
        name: data.name,
        todaNumber: "TODA-" + String(next).padStart(3, "0"),
        plate: "Pending",
        contact: data.contact,
        email: data.email,
        license: "Pending",
        licenseExpiry: new Date().toISOString().slice(0, 10),
        address: "",
        status: "Inactive",
        qrCode: "TODA-QR-" + String(next).padStart(3, "0") + "-" + Math.random().toString(36).substring(2, 7).toUpperCase()
      };
      arr.unshift(driver);
      return driver;
    });
  };

  if (!ready) {
    console.warn("Firebase is not configured. Running on localStorage only.");
    return;
  }

  if (!firebase.apps.length) firebase.initializeApp(cfg);
  db = firebase.firestore();
  col = db.collection("toda_store");
  if (firebase.auth) TODA.auth = firebase.auth();

  var synced = {};
  var pending = {};
  var seen = 0;
  var html = document.documentElement;
  html.style.visibility = "hidden";
  var reveal = function () {
    html.style.visibility = "";
  };
  setTimeout(reveal, 3000);

  var push = function (k, v) {
    col
      .doc(k)
      .set({ value: v, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
      .catch(function (e) {
        console.error(e);
      });
  };

  Storage.prototype.setItem = function (k, v) {
    nativeSet.call(this, k, v);
    if (this === window.localStorage && KEYS.indexOf(k) > -1) {
      v = String(v);
      if (synced[k]) push(k, v);
      else pending[k] = v;
    }
  };

  var reloadSoon = function () {
    var last = Number(sessionStorage.getItem("todaLastReload") || 0);
    if (Date.now() - last < 2000) {
      setTimeout(reloadSoon, 2000);
      return;
    }
    if (document.querySelector(".modal.show,.modal.active")) {
      setTimeout(reloadSoon, 1500);
      return;
    }
    sessionStorage.setItem("todaLastReload", String(Date.now()));
    location.reload();
  };

  KEYS.forEach(function (k) {
    var first = true;
    col.doc(k).onSnapshot(
      function (snap) {
        if (snap.metadata.hasPendingWrites) return;
        var local = nativeGet.call(localStorage, k);
        var changed = false;
        if (!snap.exists) {
          if (!synced[k]) {
            synced[k] = true;
            var v = k in pending ? pending[k] : local;
            delete pending[k];
            if (v !== null && v !== undefined) push(k, v);
          }
        } else {
          var remote = snap.data().value;
          synced[k] = true;
          delete pending[k];
          if (remote !== local) {
            nativeSet.call(localStorage, k, remote);
            changed = true;
          }
        }
        if (first) {
          first = false;
          seen++;
          if (seen >= KEYS.length) reveal();
        }
        if (changed) reloadSoon();
      },
      function (e) {
        console.error(e);
        reveal();
      }
    );
  });
})();
