/**
 * Serves the static HoosOut site and auth APIs (signup verification, login).
 * Run: cd server && npm install && npm start
 */
var path = require("path");
var crypto = require("crypto");
var express = require("express");
var { createClient } = require("@supabase/supabase-js");
var nodemailer = require("nodemailer");

require("dotenv").config({ path: path.join(__dirname, ".env") });

var SUPABASE_URL =
  process.env.SUPABASE_URL || "https://kwjhxahncliqxcfnwjnz.supabase.co";
var SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3amh4YWhuY2xpcXhjZm53am56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMzU3OTcsImV4cCI6MjA5MDgxMTc5N30.PqpyDz-9cOcGdI7D4GJSjJoVKG-k-tQc-TDcV3C_d1U";
var SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

var CODE_TTL_MS = 10 * 60 * 1000;
var NO_ACCOUNT = "No account found. Please sign up first.";
var BAD_CREDS = "Incorrect email or password.";
var CODE_ERROR =
  "That code is incorrect or has expired. Try again or request a new code.";

/** @type {Map<string, { codeHash: string, expiresAt: number, email: string, computingId: string, password: string, firstName: string, lastName: string }>} */
var pendingSignups = new Map();

var transporterMemo;
function getMailer() {
  if (transporterMemo !== undefined) return transporterMemo;
  if (!process.env.SMTP_HOST) {
    transporterMemo = null;
    return null;
  }
  transporterMemo = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "1",
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
  return transporterMemo;
}

function randomSixDigit() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashToken(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
}

function timingSafeEqHex(a, b) {
  if (a.length !== b.length) return false;
  var out = 0;
  for (var i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function verifyCodeHash(inputCode, storedHash) {
  return timingSafeEqHex(hashToken(String(inputCode).trim()), storedHash);
}

function uvaEmailOk(email) {
  var e = String(email || "").trim().toLowerCase();
  return /^[^@]+@(virginia\.edu|alumni\.virginia\.edu)$/i.test(e);
}

function computingIdOk(id) {
  var s = String(id || "").trim();
  if (s.length < 3 || s.length > 20) return false;
  if (!/^[a-zA-Z0-9-]+$/.test(s)) return false;
  if (!/[a-zA-Z]/.test(s) || !/[0-9]/.test(s)) return false;
  return true;
}

function prunePending() {
  pendingSignups.forEach(function (_v, k) {
    var v = pendingSignups.get(k);
    if (v && v.expiresAt <= Date.now()) pendingSignups.delete(k);
  });
}

setInterval(prunePending, 60 * 1000);

function adminClient() {
  if (!SERVICE_ROLE) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function anonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function sendVerificationEmail(to, code) {
  var fromAddr =
    process.env.MAIL_FROM ||
    process.env.SMTP_FROM ||
    "HoosOut <noreply@localhost>";
  var subject = "Your HoosOut verification code";
  var text =
    "Your verification code is " +
    code +
    ". It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.";
  var t = getMailer();
  if (!t) {
    console.log("[HoosOut] Verification code for " + to + ": " + code);
    return;
  }
  await t.sendMail({ from: fromAddr, to: to, subject: subject, text: text });
}

async function userExistsByEmail(admin, email) {
  var target = String(email).trim().toLowerCase();
  var page = 1;
  var perPage = 200;
  for (var i = 0; i < 50; i++) {
    var res = await admin.auth.admin.listUsers({ page: page, perPage: perPage });
    if (res.error) throw res.error;
    var users = (res.data && res.data.users) || [];
    for (var j = 0; j < users.length; j++) {
      if ((users[j].email || "").toLowerCase() === target) return true;
    }
    if (users.length < perPage) return false;
    page++;
  }
  return false;
}

var ROOT = path.join(__dirname, "..");
var app = express();
app.use(express.json({ limit: "48kb" }));

app.post("/api/signup/send-code", async function (req, res) {
  try {
    var admin = adminClient();
    if (!admin) {
      return res.status(503).json({
        error:
          "Sign-up is unavailable (server missing SUPABASE_SERVICE_ROLE_KEY).",
      });
    }

    var body = req.body || {};
    var email = (body.email || "").trim();
    var computingId = (body.computingId || "").trim();
    var password = body.password || "";
    var confirmPassword = body.confirmPassword || "";
    var firstName = (body.firstName || "").trim();
    var lastName = (body.lastName || "").trim();

    if (!uvaEmailOk(email)) {
      return res.status(400).json({
        error: "Use a @virginia.edu or @alumni.virginia.edu email.",
      });
    }
    if (!computingIdOk(computingId)) {
      return res
        .status(400)
        .json({ error: "Enter a valid UVA computing ID (e.g. abc2de)." });
    }
    if (password.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters." });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match." });
    }
    if (!firstName || !lastName) {
      return res
        .status(400)
        .json({ error: "First and last name are required." });
    }

    var exists = await userExistsByEmail(admin, email);
    if (exists) {
      return res.status(409).json({
        error: "An account already exists for this email. Try logging in.",
      });
    }

    var code = randomSixDigit();
    var key = email.toLowerCase();
    pendingSignups.set(key, {
      codeHash: hashToken(code),
      expiresAt: Date.now() + CODE_TTL_MS,
      email: email,
      computingId: computingId,
      password: password,
      firstName: firstName,
      lastName: lastName,
    });

    await sendVerificationEmail(email, code);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Try again later." });
  }
});

app.post("/api/signup/resend-code", async function (req, res) {
  try {
    var email = ((req.body || {}).email || "").trim();
    if (!uvaEmailOk(email)) {
      return res.status(400).json({ error: "Invalid email." });
    }

    var key = email.toLowerCase();
    var rec = pendingSignups.get(key);
    if (!rec) {
      return res.status(400).json({
        error:
          "No pending sign-up for this email. Go back and submit the form again.",
      });
    }
    if (rec.expiresAt <= Date.now()) {
      pendingSignups.delete(key);
      return res.status(400).json({
        error: "That code has expired. Go back and start sign-up again.",
      });
    }

    var code = randomSixDigit();
    rec.codeHash = hashToken(code);
    rec.expiresAt = Date.now() + CODE_TTL_MS;
    pendingSignups.set(key, rec);

    await sendVerificationEmail(email, code);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Try again later." });
  }
});

app.post("/api/signup/verify", async function (req, res) {
  try {
    var admin = adminClient();
    if (!admin) {
      return res.status(503).json({
        error:
          "Sign-up is unavailable (server missing SUPABASE_SERVICE_ROLE_KEY).",
      });
    }

    var body = req.body || {};
    var email = (body.email || "").trim();
    var code = (body.code || "").trim();

    if (!uvaEmailOk(email)) {
      return res.status(400).json({ error: "Invalid email." });
    }
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: "Enter the 6-digit code." });
    }

    var key = email.toLowerCase();
    var rec = pendingSignups.get(key);
    if (!rec || rec.expiresAt <= Date.now()) {
      if (rec) pendingSignups.delete(key);
      return res.status(400).json({ error: CODE_ERROR });
    }
    if (!verifyCodeHash(code, rec.codeHash)) {
      return res.status(400).json({ error: CODE_ERROR });
    }

    pendingSignups.delete(key);

    var cu = await admin.auth.admin.createUser({
      email: rec.email,
      password: rec.password,
      email_confirm: true,
      user_metadata: {
        computing_id: rec.computingId,
        first_name: rec.firstName,
        last_name: rec.lastName,
      },
    });

    if (cu.error) {
      console.error(cu.error);
      var msg = cu.error.message || "Could not create account.";
      if (/already|registered|exists/i.test(msg)) {
        return res.status(409).json({
          error: "An account already exists for this email. Try logging in.",
        });
      }
      return res.status(400).json({ error: msg });
    }

    var anon = anonClient();
    var si = await anon.auth.signInWithPassword({
      email: rec.email,
      password: rec.password,
    });
    if (si.error || !si.data.session) {
      console.error(si.error);
      return res.status(201).json({
        ok: true,
        partial: true,
        message: "Account created. Please log in.",
      });
    }

    res.json({
      ok: true,
      access_token: si.data.session.access_token,
      refresh_token: si.data.session.refresh_token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Try again later." });
  }
});

app.post("/api/auth/login", async function (req, res) {
  try {
    var admin = adminClient();
    if (!admin) {
      return res.status(503).json({
        error: "Login is unavailable (server missing SUPABASE_SERVICE_ROLE_KEY).",
      });
    }

    var body = req.body || {};
    var email = (body.email || "").trim();
    var password = body.password || "";

    if (!uvaEmailOk(email)) {
      return res.status(400).json({
        error: "Use a @virginia.edu or @alumni.virginia.edu email.",
      });
    }
    if (!password) {
      return res.status(401).json({ error: BAD_CREDS });
    }

    var exists = await userExistsByEmail(admin, email);
    if (!exists) {
      return res.status(401).json({ error: NO_ACCOUNT });
    }

    var anon = anonClient();
    var si = await anon.auth.signInWithPassword({
      email: email,
      password: password,
    });
    if (si.error || !si.data.session) {
      return res.status(401).json({ error: BAD_CREDS });
    }

    res.json({
      ok: true,
      access_token: si.data.session.access_token,
      refresh_token: si.data.session.refresh_token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Try again later." });
  }
});

app.use(express.static(ROOT));

var PORT = Number(process.env.PORT || 3000);
app.listen(PORT, function () {
  console.log("HoosOut: http://localhost:" + PORT);
  console.log("Static files + /api/* from:", ROOT);
  if (!SERVICE_ROLE) {
    console.warn(
      "HoosOut: SUPABASE_SERVICE_ROLE_KEY is not set — /api/signup/* and /api/auth/login will return 503."
    );
  }
  if (!getMailer()) {
    console.warn(
      "HoosOut: SMTP not configured — verification codes are logged to this console only."
    );
  }
});
