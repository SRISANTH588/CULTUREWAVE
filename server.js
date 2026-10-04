import http from "node:http";
import { readFile, access } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, randomUUID, randomBytes, randomInt, createHash, timingSafeEqual } from "node:crypto";
import * as admin from "firebase-admin";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = __dirname;
const orders = new Map();
const sessions = new Map();

// Load local secrets without adding a runtime dependency. Production should
// provide the same values through the hosting platform environment settings.
try {
  await access(join(__dirname, ".env"));
  const envFile = await readFile(join(__dirname, ".env"), "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
} catch {
  // Missing .env is expected when the host supplies environment variables.
}

if (!admin.getApps().length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
    });
  } else {
    admin.initializeApp();
  }
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

const dashboardFiles = {
  admin: "admin-dashboard.html",
  client: "client-dashboard.html",
};

const clientPages = {
  "": "client-dashboard.html",
  overview: "client-dashboard.html",
  projects: "client-projects.html",
  bookings: "client-bookings.html",
  activity: "client-activity.html",
};

const adminPages = {
  "": "admin-dashboard.html",
  overview: "admin-dashboard.html",
  users: "admin-users.html",
  events: "admin-events.html",
  refunds: "admin-refunds.html",
};

const localDevAccounts = new Map([
  [
    "SRISANTH",
    {
      username: "SRISANTH",
      password: "SASI@2006",
      role: "admin",
      name: "Srisanth",
      email: "srisanth@culturewave.in",
    },
  ],
  [
    "SASI",
    {
      username: "SASI",
      password: "sasi",
      role: "client",
      name: "Sasi",
      email: "sasi@culturewave.in",
      onboardingComplete: false,
    },
  ],
]);

const accountAliases = new Map([
  ["ADMIN", "SRISANTH"],
  ["SRISANTH", "SRISANTH"],
  ["SRISANTH588", "SRISANTH"],
  ["SASI", "SASI"],
  ["CLIENT", "SASI"],
]);

const demoAccounts = new Map();

function send(res, statusCode, payload, headers = {}) {
  const isJson = typeof payload === "object" && !(payload instanceof Buffer);
  res.writeHead(statusCode, {
    "Content-Type": isJson ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    ...headers,
  });
  res.end(isJson ? JSON.stringify(payload) : payload);
}

function readBody(req, maxBytes = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > maxBytes) return;
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (size > maxBytes) return reject(Object.assign(new Error("Request is too large."), { statusCode: 413 }));
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

const sha256 = value => createHash("sha256").update(String(value)).digest("hex");
const onboardingClean = (value, max = 5000) => String(value ?? "").trim().slice(0, max);
const onboardingCorsOrigins = new Set([
  "https://culturewave.in", "https://www.culturewave.in",
  "http://localhost:3000", "http://localhost:5500", "http://127.0.0.1:3000", "http://127.0.0.1:5500",
]);
function prepareOnboardingCors(req, res) {
  const origin = req.headers.origin || "";
  const configuredOrigin = process.env.APP_BASE_URL || "";
  let sameOrigin = false;
  try { sameOrigin = Boolean(origin && new URL(origin).host === req.headers.host); } catch {}
  if (origin && !sameOrigin && origin !== configuredOrigin && !onboardingCorsOrigins.has(origin)) return false;
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Max-Age", "3600");
  return true;
}
function onboardingEmailConfig() {
  const serviceId = process.env.EMAILJS_SERVICE_ID || "service_esppdwf";
  const publicKey = process.env.EMAILJS_PUBLIC_KEY || "PDb2vpOIeLkbZBBFP";
  const templateId = process.env.EMAILJS_ONBOARDING_OTP_TEMPLATE_ID || "template_8ho2pwf";
  const pepper = process.env.ONBOARDING_OTP_PEPPER || process.env.SESSION_SECRET || "";
  if (!pepper || pepper.length < 32) throw new Error("Configure ONBOARDING_OTP_PEPPER with a random secret of at least 32 characters.");
  return { serviceId, publicKey, templateId, pepper };
}
async function sendOnboardingOtpEmail(email, code) {
  const { serviceId, publicKey, templateId } = onboardingEmailConfig();
  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ service_id: serviceId, template_id: templateId, user_id: publicKey,
      template_params: { to_email: email, to_name: "New Lister", otp_code: code, reply_to: "support.culturewave@gmail.com" } }),
  });
  if (!response.ok) throw new Error(`EmailJS could not send the verification code (${response.status}).`);
}

function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").reduce((cookies, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return cookies;
    cookies[key] = decodeURIComponent(rest.join("=") || "");
    return cookies;
  }, {});
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies.culturewave_session;
  if (!sessionId) return null;
  return sessions.get(sessionId) || null;
}

function requireSession(req) {
  const session = getSession(req);
  if (!session) return null;
  return session;
}

function setSessionCookie(res, sessionId) {
  res.setHeader("Set-Cookie", `culturewave_session=${encodeURIComponent(sessionId)}; HttpOnly; Path=/; SameSite=Lax`);
}

function createSession(user) {
  const sessionId = randomUUID();
  const session = {
    sessionId,
    uid: user.uid || `dev_${user.username.toLowerCase()}`,
    email: user.email || "",
    name: user.name || user.username,
    phoneNumber: user.phoneNumber || "",
    emailVerified: Boolean(user.emailVerified ?? true),
    admin: user.role === "admin",
    role: user.role === "admin" ? "admin" : "client",
    provider: user.provider || "password",
    createdAt: Date.now(),
  };
  sessions.set(sessionId, session);
  return session;
}

function getAccountByUsername(username) {
  const key = String(username || "").trim().toUpperCase();
  if (!key) return null;
  const canonicalKey = accountAliases.get(key) || key;
  return demoAccounts.get(canonicalKey) || localDevAccounts.get(canonicalKey) || null;
}

function makeQrSvg(payload) {
  const text = payload.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
  <rect width="100%" height="100%" rx="28" fill="#08101e"/>
  <rect x="24" y="24" width="272" height="272" rx="18" fill="#ffffff"/>
  <g fill="#08101e">
    <rect x="44" y="44" width="68" height="68" rx="10"/>
    <rect x="208" y="44" width="68" height="68" rx="10"/>
    <rect x="44" y="208" width="68" height="68" rx="10"/>
    <rect x="132" y="44" width="20" height="20"/>
    <rect x="160" y="44" width="20" height="20"/>
    <rect x="132" y="72" width="20" height="20"/>
    <rect x="160" y="72" width="20" height="20"/>
    <rect x="132" y="132" width="20" height="20"/>
    <rect x="160" y="132" width="20" height="20"/>
    <rect x="132" y="160" width="20" height="20"/>
    <rect x="188" y="160" width="20" height="20"/>
    <rect x="216" y="160" width="20" height="20"/>
    <rect x="132" y="188" width="20" height="20"/>
    <rect x="160" y="188" width="20" height="20"/>
    <rect x="188" y="188" width="20" height="20"/>
    <rect x="160" y="216" width="20" height="20"/>
  </g>
  <text x="160" y="305" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#a9b6cf">${text}</text>
</svg>`;
}

function makeUpiIntent({ pa, pn, am, tn, tr }) {
  const params = new URLSearchParams({
    pa,
    pn,
    am,
    tn,
    tr,
    cu: "INR",
  });
  return `upi://pay?${params.toString()}`;
}

function getPaymentUrl(orderId) {
  return `/pay/${orderId}`;
}

function getCashfreeConfig() {
  const appId = process.env.CASHFREE_APP_ID || process.env.CF_APP_ID || "";
  const secretKey = process.env.CASHFREE_SECRET_KEY || process.env.CF_SECRET_KEY || "";
  const environment = String(process.env.CASHFREE_ENV || "sandbox").toLowerCase() === "production" ? "production" : "sandbox";
  return { appId, secretKey, environment };
}

function getRazorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.RZP_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || process.env.RZP_KEY_SECRET || "";
  const mode = String(process.env.RAZORPAY_ENV || "test").toLowerCase() === "live" ? "live" : "test";
  return { keyId, keySecret, mode };
}

function verifyRazorpaySignature(orderId, paymentId, signature, secret) {
  if (!orderId || !paymentId || !signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return expected === signature;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname.startsWith("/api/onboarding/")) {
    if (!prepareOnboardingCors(req, res)) return send(res, 403, { error: "This website is not allowed to use the onboarding API." });
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    if (req.method !== "POST") return send(res, 405, { error: "Use POST." });

    try {
      if (req.method === "GET") return send(res, 200, { ok: true, service: "onboarding" });

      if (url.pathname === "/api/onboarding/send-otp") {
        const body = await readBody(req, 16 * 1024);
        const email = onboardingClean(body.email, 180).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { error: "Enter a valid email address." });
        const { pepper } = onboardingEmailConfig();
        const db = admin.firestore(), now = Date.now();
        const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
        const rateRef = db.collection("onboardingRateLimits").doc(sha256(ip));
        await db.runTransaction(async tx => {
          const snap = await tx.get(rateRef), data = snap.exists ? snap.data() : {};
          const start = data.windowStart?.toMillis?.() || 0;
          if (start && now - start < 60 * 60_000 && data.count >= 8) throw Object.assign(new Error("Too many verification emails. Please try again later."), { statusCode: 429 });
          const fresh = !start || now - start >= 60 * 60_000;
          tx.set(rateRef, { windowStart: fresh ? new Date(now) : data.windowStart, count: fresh ? 1 : (data.count || 0) + 1 });
        });
        const otpRef = db.collection("onboardingOtp").doc(sha256(email));
        const old = await otpRef.get();
        const lastSent = old.exists ? (old.data().lastSentAt?.toMillis?.() || 0) : 0;
        if (lastSent && now - lastSent < 60_000) return send(res, 429, { error: "Wait one minute before requesting another code." });
        const code = String(randomInt(100000, 1000000));
        await otpRef.set({ email, codeHash: sha256(`${pepper}:${code}`), expiresAt: new Date(now + 10 * 60_000), attempts: 0, lastSentAt: new Date(now) });
        try { await sendOnboardingOtpEmail(email, code); }
        catch (error) { await otpRef.delete(); throw error; }
        return send(res, 200, { ok: true });
      }

      if (url.pathname === "/api/onboarding/verify-otp") {
        const body = await readBody(req, 16 * 1024);
        const email = onboardingClean(body.email, 180).toLowerCase(), code = onboardingClean(body.code, 6);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) return send(res, 400, { error: "Enter your email and the 6-digit code." });
        const { pepper } = onboardingEmailConfig(), db = admin.firestore();
        const otpRef = db.collection("onboardingOtp").doc(sha256(email)), snap = await otpRef.get();
        if (!snap.exists) return send(res, 400, { error: "Request a new verification code." });
        const data = snap.data(), expiresAt = data.expiresAt?.toMillis?.() || new Date(data.expiresAt).getTime();
        if (expiresAt < Date.now()) { await otpRef.delete(); return send(res, 400, { error: "That code expired. Request a new one." }); }
        if ((data.attempts || 0) >= 5) { await otpRef.delete(); return send(res, 429, { error: "Too many attempts. Request a new code." }); }
        const submitted = Buffer.from(sha256(`${pepper}:${code}`)), expected = Buffer.from(String(data.codeHash || ""));
        if (submitted.length !== expected.length || !timingSafeEqual(submitted, expected)) {
          await otpRef.update({ attempts: admin.firestore.FieldValue.increment(1) });
          return send(res, 400, { error: "That code is incorrect." });
        }
        await otpRef.delete();
        const sessionToken = randomBytes(32).toString("base64url");
        await db.collection("onboardingSessions").doc(sha256(sessionToken)).set({ email, createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt: new Date(Date.now() + 24 * 60 * 60_000), used: false });
        return send(res, 200, { ok: true, sessionToken });
      }

      if (url.pathname === "/api/onboarding/submit-application") {
        const body = await readBody(req, 20 * 1024 * 1024), db = admin.firestore();
        const sessionToken = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
        if (sessionToken.length < 40) return send(res, 401, { error: "Your signup verification expired. Verify your email once at signup and try again." });
        const sessionRef = db.collection("onboardingSessions").doc(sha256(sessionToken)), sessionSnap = await sessionRef.get();
        if (!sessionSnap.exists) return send(res, 401, { error: "Your signup verification expired. Verify your email once at signup and try again." });
        const session = sessionSnap.data(), expiresAt = session.expiresAt?.toMillis?.() || new Date(session.expiresAt).getTime();
        if (session.used || expiresAt < Date.now()) return send(res, 401, { error: "Your signup verification expired. Verify your email once at signup and try again." });
        const p = body.application || {};
        if (onboardingClean(p.contact?.email, 180).toLowerCase() !== session.email) return send(res, 400, { error: "Use the same email address you verified at signup." });
        const required = [onboardingClean(p.contact?.name, 120), onboardingClean(p.vendor?.registeredName, 180), onboardingClean(p.contact?.phone, 32), onboardingClean(p.vendor?.businessType, 80), onboardingClean(p.vendor?.category, 100), onboardingClean(p.address?.line1, 600), onboardingClean(p.address?.city, 80), onboardingClean(p.address?.state, 80), onboardingClean(p.address?.pincode, 6), onboardingClean(p.bank?.accountNumber, 30), onboardingClean(p.bank?.ifsc, 11), onboardingClean(p.bank?.beneficiaryName, 140), onboardingClean(p.bank?.accountType, 20)];
        if (required.some(value => !value)) return send(res, 400, { error: "Complete all required vendor, address, tax, contact, and bank details." });
        if (!/^\d{6}$/.test(onboardingClean(p.address?.pincode, 6))) return send(res, 400, { error: "Enter a valid 6-digit pincode." });
        if (typeof p.vendor?.hasGst !== "boolean" || !["yes", "no"].includes(p.vendor?.itrFiledResponse)) return send(res, 400, { error: "Provide your GST and ITR answers." });
        if (p.vendor.hasGst && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(onboardingClean(p.vendor.gstin, 15).toUpperCase())) return send(res, 400, { error: "Enter a valid GSTIN or select No GSTIN." });
        if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(onboardingClean(p.identity?.pan, 10).toUpperCase()) || !/^\d{12}$/.test(onboardingClean(p.identity?.aadhaar, 12))) return send(res, 400, { error: "Enter valid PAN and Aadhaar numbers." });
        if (!/^[0-9]{9,24}$/.test(onboardingClean(p.bank?.accountNumber, 30)) || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(onboardingClean(p.bank?.ifsc, 11).toUpperCase())) return send(res, 400, { error: "Enter a valid bank account number and IFSC." });
        if (!p.consent) return send(res, 400, { error: "Please accept the onboarding consent." });
        const files = Array.isArray(body.files) ? body.files : [];
        for (const kind of ["pan", "aadhaar"]) if (!files.some(file => file.kind === kind)) return send(res, 400, { error: `Upload the ${kind.toUpperCase()} document.` });
        if (files.length > 12) return send(res, 400, { error: "You can upload up to 12 documents." });
        const validatedFiles = [];
        for (const file of files) {
          const mime = onboardingClean(file.mime, 50), data = String(file.dataUrl || "");
          if (!["image/png", "image/jpeg"].includes(mime) || !/^data:image\/(png|jpeg);base64,/.test(data)) return send(res, 400, { error: "Documents must be PNG or JPEG images." });
          const bytes = Buffer.from(data.split(",")[1] || "", "base64");
          if (!bytes.length || bytes.length > 1024 * 1024) return send(res, 400, { error: "Each document must be 1 MB or smaller." });
          const validPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
          const validJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
          if ((mime === "image/png" && !validPng) || (mime === "image/jpeg" && !validJpeg)) return send(res, 400, { error: "An uploaded image has an invalid file format." });
          validatedFiles.push({ file, mime, bytes });
        }
        const now = new Date(), counterRef = db.collection("onboardingCounters").doc(String(now.getUTCFullYear()));
        const applicationId = await db.runTransaction(async tx => { const snap = await tx.get(counterRef); const next = (snap.exists ? snap.data().last : 0) + 1; tx.set(counterRef, { last: next }); return `ONB-${now.getUTCFullYear()}-${String(next).padStart(6, "0")}`; });
        const bucket = admin.storage().bucket(), stored = [];
        for (const { file, mime, bytes } of validatedFiles) {
          const name = onboardingClean(file.name, 120), type = onboardingClean(file.kind, 80), path = `vendor-onboarding/${applicationId}/${randomBytes(18).toString("hex")}`;
          await bucket.file(path).save(bytes, { metadata: { contentType: mime, metadata: { applicationId, documentType: type, originalName: name } } });
          stored.push({ type, name, path, contentType: mime, size: bytes.length, uploadedAt: now.toISOString() });
        }
        const application = { applicationId, email: session.email, name: onboardingClean(p.contact?.name, 120), contact: p.contact || {}, vendor: p.vendor || {}, business: p.business || {}, address: p.address || {}, listing: {}, bank: p.bank || {}, identity: { pan: onboardingClean(p.identity?.pan, 10).toUpperCase(), aadhaar: onboardingClean(p.identity?.aadhaar, 12) }, documents: stored, status: "NEW", agreementStatus: "NOT_SENT", submittedAt: admin.firestore.FieldValue.serverTimestamp(), createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(), consentAt: admin.firestore.FieldValue.serverTimestamp(), userId: null };
        await db.collection("vendorOnboarding").doc(applicationId).set(application);
        await sessionRef.update({ used: true, applicationId });
        await db.collection("onboardingActivity").add({ applicationId, action: "Application Submitted", performedBy: "applicant", metadata: {}, timestamp: admin.firestore.FieldValue.serverTimestamp() });
        return send(res, 200, { applicationId, status: "NEW" });
      }

      return send(res, 404, { error: "Onboarding endpoint not found." });
    } catch (error) {
      console.error("Lister onboarding API error:", error);
      return send(res, error.statusCode || 500, { error: error.message || "Onboarding request failed." });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/auth/verify") {
    try {
      const body = await readBody(req);
      const { idToken, role = "client", onboardingComplete = false } = body;
      if (!idToken) return send(res, 400, { success: false, error: "Missing idToken" });

      const decoded = await admin.auth().verifyIdToken(idToken);
      const sessionId = randomUUID();
      const session = {
        sessionId,
        uid: decoded.uid,
        email: decoded.email || "",
        name: decoded.name || decoded.email || "Guest",
        phoneNumber: decoded.phone_number || "",
        emailVerified: Boolean(decoded.email_verified),
        admin: Boolean(decoded.admin),
        role: role === "admin" ? "admin" : "client",
        onboardingComplete: Boolean(onboardingComplete),
        provider: decoded.firebase?.sign_in_provider || "",
        createdAt: Date.now(),
      };
      sessions.set(sessionId, session);
      setSessionCookie(res, sessionId);
      return send(res, 200, { success: true, user: session });
    } catch (error) {
      return send(res, 401, { success: false, error: "Invalid Firebase token" });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/imagekit/auth") {
    const publicKey = process.env.IMAGEKIT_PUBLIC_KEY || "";
    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY || "";
    if (!publicKey || !privateKey) {
    return send(res, 503, { success: false, error: "ImageKit is not configured on the server." }, { "Access-Control-Allow-Origin": "*" });
    }
    const expire = Math.floor(Date.now() / 1000) + 600;
    const token = randomUUID();
    const signature = createHmac("sha1", privateKey)
      .update(token + expire)
      .digest("hex");
    return send(res, 200, { token, expire, signature, publicKey }, { "Access-Control-Allow-Origin": "*" });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/local-login") {
    try {
      const body = await readBody(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (!username || !password) {
        return send(res, 400, { success: false, error: "Missing username or password" });
      }
      const account = getAccountByUsername(username);
      if (!account || account.password !== password) {
        return send(res, 401, { success: false, error: "Invalid username or password" });
      }
      const session = createSession(account);
      setSessionCookie(res, session.sessionId);
      return send(res, 200, { success: true, user: session });
    } catch (error) {
      return send(res, 500, { success: false, error: "Local login failed" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    try {
      const body = await readBody(req);
      const username = String(body.username || "").trim();
      const fullName = String(body.name || "").trim();
      const password = String(body.password || "");
      if (!username || !fullName || !password) {
        return send(res, 400, { success: false, error: "Missing username, name, or password" });
      }
      if (getAccountByUsername(username)) {
        return send(res, 409, { success: false, error: "Username already exists" });
      }
      const account = {
        username,
        password,
        role: "client",
        name: fullName,
        email: `${username.toLowerCase()}@culturewave.in`,
      };
      demoAccounts.set(username.toUpperCase(), account);
      const session = createSession(account);
      setSessionCookie(res, session.sessionId);
      return send(res, 200, { success: true, user: session });
    } catch (error) {
      return send(res, 500, { success: false, error: "Registration failed" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/onboarding/client") {
    try {
      const session = requireSession(req);
      if (!session) return send(res, 401, { success: false, error: "Not signed in" });
      const body = await readBody(req);
      const uid = session.uid;
      const onboarding = {
        brandDetails: {
          brandName: String(body.brandDetails?.brandName || body.companyName || session.name || "").trim(),
          website: String(body.brandDetails?.website || body.website || "").trim(),
          category: String(body.brandDetails?.category || "").trim(),
          tagline: String(body.brandDetails?.tagline || "").trim(),
          description: String(body.brandDetails?.description || "").trim(),
          email: String(body.brandDetails?.email || session.email || "").trim(),
          phone: String(body.brandDetails?.phone || session.phoneNumber || "").trim(),
        },
        bankDetails: {
          accountHolderName: String(body.bankDetails?.accountHolderName || "").trim(),
          bankName: String(body.bankDetails?.bankName || "").trim(),
          accountNumber: String(body.bankDetails?.accountNumber || "").trim(),
          ifsc: String(body.bankDetails?.ifsc || "").trim(),
          branch: String(body.bankDetails?.branch || "").trim(),
        },
        panDetails: {
          panNumber: String(body.panDetails?.panNumber || "").trim(),
          panHolderName: String(body.panDetails?.panHolderName || "").trim(),
          dateOfBirth: String(body.panDetails?.dateOfBirth || "").trim(),
        },
        instagramDetails: {
          handle: String(body.instagramDetails?.handle || "").trim(),
          pageName: String(body.instagramDetails?.pageName || "").trim(),
          connected: Boolean(body.instagramDetails?.connected),
          connectedAt: body.instagramDetails?.connectedAt || null,
        },
        onboardingComplete: true,
        completedAt: Date.now(),
        updatedAt: Date.now(),
      };

      if (!admin.apps.length) {
        return send(res, 500, { success: false, error: "Firebase admin not initialized" });
      }

      await admin
        .firestore()
        .collection("users")
        .doc(uid)
        .set(
          {
            uid,
            role: session.role || "client",
            name: onboarding.brandDetails.brandName || session.name || "",
            email: session.email || onboarding.brandDetails.email || "",
            phoneNumber: onboarding.brandDetails.phone || session.phoneNumber || "",
            onboarding,
            onboardingComplete: true,
            updatedAt: Date.now(),
          },
          { merge: true },
        );

      session.onboardingComplete = true;
      session.onboarding = onboarding;
      session.name = onboarding.brandDetails.brandName || session.name;
      session.phoneNumber = onboarding.brandDetails.phone || session.phoneNumber;
      return send(res, 200, { success: true, onboarding, user: session });
    } catch (error) {
      return send(res, 400, { success: false, error: error.message || "Could not save onboarding" });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const session = requireSession(req);
    if (!session) return send(res, 401, { success: false, error: "Not signed in" });
    return send(res, 200, { success: true, user: session });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies.culturewave_session;
    if (sessionId) sessions.delete(sessionId);
    res.setHeader("Set-Cookie", "culturewave_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
    return send(res, 200, { success: true });
  }

  if (req.method === "GET" && url.pathname === "/logout") {
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Logging out</title></head><body style="font-family:system-ui;background:#f6f8ff;color:#10203f;display:grid;place-items:center;min-height:100vh;margin:0">Signing out...</body></html>`;
    return send(res, 200, html, { "Content-Type": "text/html; charset=utf-8" });
  }

  if (req.method === "GET" && url.pathname === "/") {
    const html = await readFile(join(publicDir, "index.html"), "utf8");
    return send(res, 200, html, { "Content-Type": "text/html; charset=utf-8" });
  }

  // Public attendee access is deliberately served by the server: the browser
  // never receives the bookings collection or other guests' personal data.
  if (req.method === "GET" && url.pathname === "/api/guest/playlist") {
    try {
      if (!admin.apps.length) return send(res, 503, { success: false, error: "Playlists are unavailable." });
      const eventId = String(url.searchParams.get("eventId") || "").trim();
      let playlists = eventId
        ? await admin.firestore().collection("playlists").where("eventId", "==", eventId).limit(1).get()
        : { empty: true };
      if (playlists.empty) playlists = await admin.firestore().collection("playlists").where("isDefault", "==", true).limit(1).get();
      if (playlists.empty) return send(res, 404, { success: false, error: "No playlist has been published yet." });
      const playlist = playlists.docs[0].data();
      return send(res, 200, { success: true, playlist: { title: playlist.title || "Event Playlist", description: playlist.description || "", songs: Array.isArray(playlist.songs) ? playlist.songs : [] } });
    } catch (error) {
      console.error("Public playlist request failed:", error);
      return send(res, 500, { success: false, error: "We could not load this playlist right now." });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/guest/playlist-access") {
    try {
      if (!admin.apps.length) return send(res, 503, { success: false, error: "Booking verification is unavailable." });
      const body = await readBody(req);
      const phone = String(body.phone || "").replace(/\D/g, "");
      if (phone.length < 10) return send(res, 400, { success: false, error: "Enter a valid mobile number." });
      const matchesPhone = (value) => String(value || "").replace(/\D/g, "").slice(-10) === phone.slice(-10);
      const snap = await admin.firestore().collection("bookings").limit(5000).get();
      const bookingDoc = snap.docs.find((entry) => {
        const b = entry.data();
        const status = String(b.status || "").toLowerCase();
        return !["cancelled", "failed", "refunded"].includes(status) && matchesPhone(b.customerPhone || b.customer?.phone || b.buyerPhone || b.buyer?.phone || b.phone);
      });
      if (!bookingDoc) return send(res, 404, { success: false, error: "No active booking was found for this number." });
      const booking = bookingDoc.data();
      const eventId = booking.eventId || booking.event?.id || booking.event?.eventId || null;
      let playlist = null;
      if (eventId) {
        const playlists = await admin.firestore().collection("playlists").where("eventId", "==", eventId).limit(1).get();
        if (!playlists.empty) playlist = { id: playlists.docs[0].id, ...playlists.docs[0].data() };
      }
      if (!playlist) {
        const playlists = await admin.firestore().collection("playlists").where("isDefault", "==", true).limit(1).get();
        if (!playlists.empty) playlist = { id: playlists.docs[0].id, ...playlists.docs[0].data() };
      }
      return send(res, 200, {
        success: true,
        guestName: booking.customerName || booking.customer?.name || booking.buyerName || "Guest",
        eventName: booking.eventName || booking.event?.name || booking.event?.title || "your event",
        playlist: playlist ? { title: playlist.title || "Event Playlist", description: playlist.description || "", songs: Array.isArray(playlist.songs) ? playlist.songs : [] } : null,
      });
    } catch (error) {
      console.error("Guest playlist access failed:", error);
      return send(res, 500, { success: false, error: "We could not verify this booking right now." });
    }
  }

  const profileHandleMatch = url.pathname.match(/^\/([a-z0-9](?:[a-z0-9._-]{0,58}[a-z0-9])?)\/?$/i);
  if (req.method === "GET" && profileHandleMatch && !["api", "logout", "dashboard", "onboarding", "pay"].includes(profileHandleMatch[1].toLowerCase())) {
    try {
      const profiles = await admin.firestore().collection("organisers").where("handle", "==", profileHandleMatch[1].toLowerCase()).limit(1).get();
      if (!profiles.empty) {
        const html = await readFile(join(publicDir, "client-profile.html"), "utf8");
        return send(res, 200, html, { "Content-Type": "text/html; charset=utf-8" });
      }
    } catch (error) {
      console.error("Public profile route lookup failed:", error);
    }
  }

  if (req.method === "GET" && extname(url.pathname)) {
    try {
      const filePath = join(publicDir, url.pathname.slice(1));
      let file = await readFile(filePath, "utf8");
      if (!file.includes('firebase-config.js') && !file.includes('from "./firebase.js"') && !file.includes("from './firebase.js'") && file.includes('</head>')) {
        file = file.replace(
          '</head>',
          '<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script><script src="firebase-config.js"></script></head>'
        );
      }
      const contentType = mimeTypes[extname(url.pathname)] || "text/plain; charset=utf-8";
      return send(res, 200, file, { "Content-Type": contentType });
    } catch {
      return send(res, 404, "Not found");
    }
  }

  if (req.method === "POST" && url.pathname === "/api/payments/create-order") {
    try {
      const body = await readBody(req);
      const amount = Math.max(1, Number(body.amount || 0));
      const receipt = body.receipt || `rcpt_${Date.now()}`;
      const orderId = `order_${Math.random().toString(36).slice(2, 10)}`;
      const paymentId = `pay_${Math.random().toString(36).slice(2, 10)}`;
      const upiId = body.upiId || "merchant@upi";
      const merchantName = body.merchantName || "Cashfree";
      const qrPayload = `upi:${merchantName}:${orderId}:${amount}`;
      const order = {
        id: orderId,
        paymentId,
        amount,
        currency: "INR",
        status: "created",
        receipt,
        customer: body.customer || {},
        event: body.event || {},
        qrSvg: makeQrSvg(qrPayload),
        upiIntent: makeUpiIntent({
          pa: upiId,
          pn: merchantName,
          am: (amount / 100).toFixed(2),
          tn: body.note || `Payment for ${body.event?.name || "event tickets"}`,
          tr: orderId,
        }),
      };

      const { appId, secretKey, environment } = getCashfreeConfig();
      if (appId && secretKey) {
        const apiUrl = environment === "production" ? "https://api.cashfree.com/pg/orders" : "https://sandbox.cashfree.com/pg/orders";
        const cfResponse = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-version": "2025-01-01",
            "x-client-id": appId,
            "x-client-secret": secretKey,
            "x-request-id": randomUUID(),
            "x-idempotency-key": randomUUID(),
          },
          body: JSON.stringify({
            order_id: orderId,
            order_amount: Number((amount / 100).toFixed(2)),
            order_currency: "INR",
            customer_details: {
              customer_id: body.customer?.id || body.customer?.email || body.customer?.phone || `guest_${orderId}`,
              customer_name: body.customer?.name || "Guest",
              customer_email: body.customer?.email || "",
              customer_phone: body.customer?.phone || "",
            },
            order_note: body.note || `Payment for ${body.event?.name || "event tickets"}`,
            order_meta: {
              return_url: `${body.returnUrl || "http://127.0.0.1:3000/booking.html"}?order_id={order_id}`,
            },
          }),
        });
        if (cfResponse.ok) {
          const cfData = await cfResponse.json();
          order.status = "pending";
          order.cashfree = cfData;
          orders.set(orderId, order);
          return send(res, 200, {
            success: true,
            orderId,
            paymentId: cfData.payment_session_id || paymentId,
            payment_session_id: cfData.payment_session_id,
            cf_order_id: cfData.cf_order_id || orderId,
            amount,
            currency: "INR",
            status: order.status,
            checkoutUrl: getPaymentUrl(orderId),
            receipt,
          });
        }
      }

      orders.set(orderId, order);
      return send(res, 200, {
        success: true,
        orderId,
        paymentId,
        amount,
        currency: "INR",
        status: order.status,
        checkoutUrl: getPaymentUrl(orderId),
        upiIntent: order.upiIntent,
        qrSvg: order.qrSvg,
        receipt,
      });
    } catch (error) {
      return send(res, 400, { success: false, error: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/bookings/checkout") {
    try {
      const body = await readBody(req);
      const amount = Math.max(1, Number(body.amount || 0));
      const receipt = body.receipt || `rcpt_${Date.now()}`;
      const orderId = `order_${Math.random().toString(36).slice(2, 10)}`;
      const paymentId = `pay_${Math.random().toString(36).slice(2, 10)}`;
      const upiId = body.upiId || "merchant@upi";
      const merchantName = body.merchantName || "Cashfree";
      const qrPayload = `upi:${merchantName}:${orderId}:${amount}`;
      const order = {
        id: orderId,
        paymentId,
        amount,
        currency: "INR",
        status: "created",
        receipt,
        customer: body.customer || {},
        event: body.event || {},
        qrSvg: makeQrSvg(qrPayload),
        upiIntent: makeUpiIntent({
          pa: upiId,
          pn: merchantName,
          am: (amount / 100).toFixed(2),
          tn: body.note || `Payment for ${body.event?.name || "event tickets"}`,
          tr: orderId,
        }),
      };

      const { keyId, keySecret, mode } = getRazorpayConfig();
      if (keyId && keySecret) {
        const rpResponse = await fetch("https://api.razorpay.com/v1/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
          },
          body: JSON.stringify({
            amount,
            currency: "INR",
            receipt,
            notes: {
              eventName: body.event?.name || "event tickets",
              customerName: body.customer?.name || "Guest",
              customerEmail: body.customer?.email || "",
              seats: String(body.seats || 1),
            },
          }),
        });
        if (rpResponse.ok) {
          const rpData = await rpResponse.json();
          order.status = "pending";
          order.razorpay = rpData;
          orders.set(orderId, order);
          return send(res, 200, {
            success: true,
            provider: "razorpay",
            keyId,
            mode,
            orderId,
            razorpayOrderId: rpData.id,
            amount,
            currency: rpData.currency || "INR",
            status: rpData.status || "created",
            receipt,
            customer: order.customer,
            event: order.event,
            notes: rpData.notes || {},
          });
        }
      }

      orders.set(orderId, order);
      return send(res, 200, {
        success: true,
        provider: "demo",
        orderId,
        paymentId,
        amount,
        currency: "INR",
        status: order.status,
        checkoutUrl: getPaymentUrl(orderId),
        upiIntent: order.upiIntent,
        qrSvg: order.qrSvg,
        receipt,
      });
    } catch (error) {
      return send(res, 400, { success: false, error: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/bookings/free") {
    try {
      const body = await readBody(req);
      const name = String(body.customer?.name || "").trim();
      const email = String(body.customer?.email || "").trim();
      const phone = String(body.customer?.phone || "").trim();
      const bookingId = `bk_${randomUUID().slice(0, 8)}`;
      const booking = {
        bookingId,
        eventId: body.eventId || null,
        orderId: null,
        razorpayOrderId: null,
        paymentId: null,
        status: "confirmed",
        event: body.event || {},
        customer: {
          id: email || name || "guest",
          name: name || "Guest",
          email,
          phone,
          ticket: body.ticketName || "General Admission",
        },
        amount: 0,
        currency: "INR",
        seats: Number(body.seats || 1),
        method: "free",
        createdAt: Date.now(),
        source: "free",
      };
      try {
        if (admin.apps.length) {
          await admin.firestore().collection("bookings").doc(bookingId).set(booking, { merge: true });
        }
      } catch (writeError) {
        console.warn("Free booking Firestore write skipped:", writeError.message);
      }
      return send(res, 200, { success: true, bookingId });
    } catch (error) {
      return send(res, 400, { success: false, error: error.message || "Could not create free booking" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/bookings/verify") {
    try {
      const body = await readBody(req);
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
      const { keySecret } = getRazorpayConfig();
      if (!keySecret) {
        return send(res, 400, { success: false, error: "Missing Razorpay secret key" });
      }
      const valid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature, keySecret);
      if (!valid) return send(res, 401, { success: false, error: "Invalid payment signature" });
      const matchingOrder = Array.from(orders.values()).find((entry) => entry.razorpay?.id === razorpay_order_id || entry.id === razorpay_order_id);
      const booking = matchingOrder
        ? {
            bookingId: `bk_${randomUUID().slice(0, 8)}`,
            orderId: matchingOrder.id,
            razorpayOrderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
            status: "confirmed",
            event: matchingOrder.event || {},
            customer: matchingOrder.customer || {},
            amount: matchingOrder.amount || 0,
            currency: matchingOrder.currency || "INR",
            seats: Number(matchingOrder.customer?.tickets || matchingOrder.seats || 1),
            method: matchingOrder.customer?.method || "upi",
            createdAt: Date.now(),
            source: "razorpay",
          }
        : null;
      if (matchingOrder) {
        matchingOrder.status = "paid";
        matchingOrder.paymentId = razorpay_payment_id;
        matchingOrder.verifiedAt = Date.now();
      }
      if (booking && admin.apps.length) {
        await admin.firestore().collection("bookings").doc(booking.bookingId).set(booking, { merge: true });
      }
      return send(res, 200, { success: true, verified: true, bookingId: booking?.bookingId || null });
    } catch (error) {
      return send(res, 400, { success: false, error: error.message || "Verification failed" });
    }
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/payments/")) {
    const orderId = url.pathname.split("/").pop();
    const order = orders.get(orderId);
    if (!order) return send(res, 404, { success: false, error: "Order not found" });
    return send(res, 200, order);
  }

  if (req.method === "POST" && url.pathname === "/api/payments/confirm") {
    try {
      const body = await readBody(req);
      const order = orders.get(body.orderId);
      if (!order) return send(res, 404, { success: false, error: "Order not found" });
      const outcome = body.status === "failed" ? "failed" : "paid";
      order.status = outcome;
      order.paymentId = `pay_${Math.random().toString(36).slice(2, 10)}`;
      return send(res, 200, { success: true, orderId: order.id, status: order.status, paymentId: order.paymentId });
    } catch (error) {
      return send(res, 400, { success: false, error: error.message });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/payments/confirm") {
    const orderId = url.searchParams.get("orderId");
    const status = url.searchParams.get("status");
    const order = orders.get(orderId);
    if (!order) return send(res, 404, "Order not found");
    order.status = status === "failed" ? "failed" : "paid";
    order.paymentId = `pay_${Math.random().toString(36).slice(2, 10)}`;
    const next = `/api/payments/${order.id}`;
    const html = `<!doctype html><html><head><meta http-equiv="refresh" content="0;url=${next}"></head><body>Redirecting...</body></html>`;
    return send(res, 200, html, { "Content-Type": "text/html; charset=utf-8" });
  }

  if (req.method === "GET" && url.pathname.startsWith("/pay/")) {
    const orderId = url.pathname.split("/").pop();
    const order = orders.get(orderId);
    if (!order) return send(res, 404, "Order not found");
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pay ${order.id}</title>
<style>body{font-family:system-ui;background:#08101e;color:#edf4ff;display:grid;place-items:center;min-height:100vh;margin:0}.card{background:#101c32;border:1px solid rgba(255,255,255,.1);padding:24px;border-radius:24px;max-width:520px;width:calc(100% - 32px)}button,a{display:block;width:100%;margin-top:12px;padding:14px 16px;border-radius:999px;border:0;text-decoration:none;text-align:center}.ok{background:#7ee0c7;color:#041019}.bad{background:#ff8b8b;color:#041019}.muted{color:#a9b6cf}</style>
</head><body><div class="card"><h1>Complete payment</h1><p class="muted">Order ${order.id} for ₹${(order.amount / 100).toFixed(2)}</p><a class="ok" href="/api/payments/confirm?orderId=${order.id}&status=paid">Mark success</a><a class="bad" href="/api/payments/confirm?orderId=${order.id}&status=failed">Mark failed</a></div></body></html>`;
    return send(res, 200, html, { "Content-Type": "text/html; charset=utf-8" });
  }

  // ── WHATSAPP OTP ──
  if (req.method === "POST" && url.pathname === "/api/whatsapp/send-otp") {
    try {
      const body = await readBody(req);
      const phone = String(body.phone || "").trim();
      const name  = String(body.name  || "User").trim();
      if (!phone) return send(res, 400, { success: false, error: "Phone number required" });
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = Date.now() + 10 * 60 * 1000;
      if (admin.apps.length) {
        await admin.firestore().collection("whatsappOtps").doc(phone).set({ otp, expiresAt, name, createdAt: Date.now() });
      }
      // Send via WhatsApp Business API if configured, else log for manual send
      const waToken   = process.env.WHATSAPP_TOKEN || "";
      const waPhoneId = process.env.WHATSAPP_PHONE_ID || "";
      if (waToken && waPhoneId) {
        const to = phone.replace(/\D/g, "");
        await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${waToken}` },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body: `Hi ${name}! Your CultureWave OTP is *${otp}*. Valid for 10 minutes. Do not share this with anyone.` }
          })
        });
      } else {
        console.log(`[WhatsApp OTP] To: ${phone} | Name: ${name} | OTP: ${otp}`);
      }
      return send(res, 200, { success: true });
    } catch (error) {
      return send(res, 500, { success: false, error: error.message });
    }
  }

  // ── WHATSAPP BOOKING CONFIRMATION ──
  if (req.method === "POST" && url.pathname === "/api/whatsapp/booking-confirm") {
    try {
      const body = await readBody(req);
      const { phone, name, eventName, date, bookingId, amount } = body;
      if (!phone) return send(res, 400, { success: false, error: "Phone required" });
      const msg = `Hi ${name||'there'}! 🎉 Your booking is confirmed!\n\n🎟 *${eventName||'Event'}*\n📅 ${date||''}\n🔖 Booking ID: ${bookingId||''}\n💰 Amount: ${amount?'₹'+amount:'Free'}\n\nSee you there! — CultureWave`;
      const waToken   = process.env.WHATSAPP_TOKEN || "";
      const waPhoneId = process.env.WHATSAPP_PHONE_ID || "";
      if (waToken && waPhoneId) {
        const to = phone.replace(/\D/g, "");
        await fetch(`https://graph.facebook.com/v19.0/${waPhoneId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${waToken}` },
          body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: msg } })
        });
      } else {
        console.log(`[WhatsApp Booking] To: ${phone} | ${msg}`);
      }
      return send(res, 200, { success: true });
    } catch (error) {
      return send(res, 500, { success: false, error: error.message });
    }
  }

  // ── INSTAGRAM OAUTH ──
  if (req.method === "GET" && url.pathname === "/api/instagram/connect") {
    const session = requireSession(req);
    if (!session) return send(res, 401, { success: false, error: "Not signed in" });
    const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID || "";
    const redirectUri = encodeURIComponent(`${process.env.APP_BASE_URL || "http://127.0.0.1:3000"}/api/instagram/callback`);
    if (!appId) {
      // No app ID configured — show setup instructions
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Instagram Setup</title>
<style>body{font-family:system-ui;background:#f8f9fa;display:grid;place-items:center;min-height:100vh;margin:0}
.card{background:#fff;border:1px solid #e9ecef;border-radius:16px;padding:2rem;max-width:480px;width:calc(100%-2rem);text-align:center}
h2{margin:0 0 .5rem;font-size:1.1rem}p{color:#868e96;font-size:.88rem;line-height:1.6;margin:.5rem 0 1.25rem}
a{display:inline-block;padding:.6rem 1.4rem;border-radius:8px;background:#833ab4;color:#fff;text-decoration:none;font-weight:700;font-size:.88rem}</style>
</head><body><div class="card">
<div style="font-size:2.5rem;margin-bottom:.75rem">📸</div>
<h2>Instagram App Not Configured</h2>
<p>Set the <strong>INSTAGRAM_APP_ID</strong> and <strong>INSTAGRAM_APP_SECRET</strong> environment variables to enable Instagram OAuth.</p>
<a href="/premium-client-dashboard.html">Go Back</a>
</div></body></html>`;
      return send(res, 200, html, { "Content-Type": "text/html; charset=utf-8" });
    }
    const state = Buffer.from(JSON.stringify({ uid: session.uid, ts: Date.now() })).toString("base64url");
    const oauthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=instagram_basic,instagram_manage_comments,instagram_manage_messages,pages_show_list,pages_read_engagement&response_type=code&state=${state}`;
    return send(res, 302, "", { Location: oauthUrl });
  }

  if (req.method === "GET" && url.pathname === "/api/instagram/callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    if (error) {
      return send(res, 302, "", { Location: "/premium-client-dashboard.html?ig_error=" + encodeURIComponent(error) });
    }
    if (!code || !state) {
      return send(res, 302, "", { Location: "/premium-client-dashboard.html?ig_error=missing_code" });
    }
    try {
      const stateData = JSON.parse(Buffer.from(state, "base64url").toString());
      const uid = stateData.uid;
      const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID || "";
      const appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET || "";
      const redirectUri = `${process.env.APP_BASE_URL || "http://127.0.0.1:3000"}/api/instagram/callback`;
      // Exchange code for short-lived token
      const tokenRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`);
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) throw new Error(tokenData.error?.message || "Token exchange failed");
      // Exchange for long-lived token
      const llRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`);
      const llData = await llRes.json();
      const longToken = llData.access_token || tokenData.access_token;
      // Get connected Instagram Business Account
      const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${longToken}`);
      const pagesData = await pagesRes.json();
      const page = pagesData.data?.[0];
      let igUserId = null, igUsername = null, igFollowers = 0;
      if (page) {
        const igRes = await fetch(`https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token || longToken}`);
        const igData = await igRes.json();
        igUserId = igData.instagram_business_account?.id;
        if (igUserId) {
          const profileRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}?fields=username,followers_count,media_count&access_token=${page.access_token || longToken}`);
          const profileData = await profileRes.json();
          igUsername = profileData.username;
          igFollowers = profileData.followers_count || 0;
        }
      }
      // Save to Firestore
      if (admin.apps.length) {
        await admin.firestore().collection("organisers").doc(uid).set({
          igConnected: true,
          igToken: longToken,
          igPageToken: page?.access_token || longToken,
          igUserId,
          igUsername: igUsername || "",
          igFollowers,
          igConnectedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
      return send(res, 302, "", { Location: "/premium-client-dashboard.html?ig_connected=1&ig_user=" + encodeURIComponent(igUsername || "") });
    } catch (err) {
      return send(res, 302, "", { Location: "/premium-client-dashboard.html?ig_error=" + encodeURIComponent(err.message) });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/instagram/disconnect") {
    const session = requireSession(req);
    if (!session) return send(res, 401, { success: false, error: "Not signed in" });
    if (admin.apps.length) {
      await admin.firestore().collection("organisers").doc(session.uid).set({
        igConnected: false, igToken: "", igPageToken: "", igUserId: null, igUsername: "",
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }
    return send(res, 200, { success: true });
  }

  if (req.method === "GET" && url.pathname === "/api") {
    return send(res, 200, {
      endpoints: [
        "POST /api/onboarding/send-otp",
        "POST /api/onboarding/verify-otp",
        "POST /api/onboarding/submit-application",
        "POST /api/auth/verify",
        "GET /api/auth/me",
        "POST /api/auth/logout",
        "POST /api/payments/create-order",
        "GET /api/payments/:orderId",
        "POST /api/payments/confirm",
      ],
    });
  }

  if (req.method === "GET" && url.pathname === "/dashboard") {
    const session = requireSession(req);
    if (!session) return send(res, 401, "Unauthorized");
    return send(res, 302, "", { Location: `/dashboard/${session.role || "client"}` });
  }

  if (req.method === "GET" && url.pathname === "/onboarding") {
    const session = requireSession(req);
    if (!session) return send(res, 401, "Unauthorized");
    return send(res, 302, "", { Location: "/onboarding/client" });
  }

  if (req.method === "GET" && url.pathname === "/onboarding/client") {
    const session = requireSession(req);
    if (!session) {
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Client Onboarding</title></head><body style="font-family:system-ui;background:#f6f8ff;color:#10203f;display:grid;place-items:center;min-height:100vh;margin:0"><div style="background:#fff;border:1px solid #dbe5ff;border-radius:24px;padding:24px;max-width:480px;width:calc(100% - 32px)"><h1>Sign in required</h1><p>Please login first to continue to onboarding.</p><a href="/login.html">Go to login</a></div></body></html>`;
      return send(res, 401, html, { "Content-Type": "text/html; charset=utf-8" });
    }
    const html = await readFile(join(publicDir, "client-onboarding.html"), "utf8");
    return send(res, 200, html, { "Content-Type": "text/html; charset=utf-8" });
  }

  if (req.method === "GET" && url.pathname.startsWith("/dashboard/")) {
    const session = requireSession(req);
    if (!session) {
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CultureWave Dashboard</title></head><body style="font-family:system-ui;background:#f6f8ff;color:#10203f;display:grid;place-items:center;min-height:100vh;margin:0"><div style="background:#fff;border:1px solid #dbe5ff;border-radius:24px;padding:24px;max-width:480px;width:calc(100% - 32px)"><h1>Sign in required</h1><p>Please go back to the login page and sign in with Firebase first.</p><a href="/login.html">Go to login</a></div></body></html>`;
      return send(res, 401, html, { "Content-Type": "text/html; charset=utf-8" });
    }
    const parts = url.pathname.split("/").filter(Boolean);
    const requestedRole = parts[1] || "client";
    const requestedPage = parts[2] || "";
    if (requestedRole !== session.role && requestedRole !== "client" && requestedRole !== "admin") {
      return send(res, 404, "Not found");
    }
    if (requestedRole !== session.role) {
      return send(res, 302, "", { Location: `/dashboard/${session.role || "client"}` });
    }
    const fileName =
      requestedRole === "admin"
        ? adminPages[requestedPage] || adminPages[""]
        : clientPages[requestedPage] || clientPages[""];
    const html = await readFile(join(publicDir, fileName), "utf8");
    return send(res, 200, html, { "Content-Type": "text/html; charset=utf-8" });
  }

  return send(res, 404, "Not found");
});

const port = Number(process.env.PORT || 3000);
server.listen(port, "0.0.0.0", () => {
  console.log(`CultureWave running on port ${port}`);
});
