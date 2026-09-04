import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, randomUUID } from "node:crypto";
import * as admin from "firebase-admin";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = __dirname;
const orders = new Map();
const sessions = new Map();

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
      email: "srisanth@cityvibe.local",
    },
  ],
  [
    "SASI",
    {
      username: "SASI",
      password: "sasi",
      role: "client",
      name: "Sasi",
      email: "sasi@cityvibe.local",
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
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
  const sessionId = cookies.cityvibe_session;
  if (!sessionId) return null;
  return sessions.get(sessionId) || null;
}

function requireSession(req) {
  const session = getSession(req);
  if (!session) return null;
  return session;
}

function setSessionCookie(res, sessionId) {
  res.setHeader("Set-Cookie", `cityvibe_session=${encodeURIComponent(sessionId)}; HttpOnly; Path=/; SameSite=Lax`);
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
      return send(res, 503, { success: false, error: "ImageKit is not configured on the server." });
    }
    const expire = Math.floor(Date.now() / 1000) + 600;
    const token = randomUUID();
    const signature = createHmac("sha1", privateKey)
      .update(token + expire)
      .digest("hex");
    return send(res, 200, { token, expire, signature, publicKey });
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
        email: `${username.toLowerCase()}@cityvibe.local`,
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
    const sessionId = cookies.cityvibe_session;
    if (sessionId) sessions.delete(sessionId);
    res.setHeader("Set-Cookie", "cityvibe_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
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

  if (req.method === "GET" && extname(url.pathname)) {
    try {
      const filePath = join(publicDir, url.pathname.slice(1));
      const file = await readFile(filePath, "utf8");
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
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cityvibe Dashboard</title></head><body style="font-family:system-ui;background:#f6f8ff;color:#10203f;display:grid;place-items:center;min-height:100vh;margin:0"><div style="background:#fff;border:1px solid #dbe5ff;border-radius:24px;padding:24px;max-width:480px;width:calc(100% - 32px)"><h1>Sign in required</h1><p>Please go back to the login page and sign in with Firebase first.</p><a href="/login.html">Go to login</a></div></body></html>`;
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

server.listen(3000, "127.0.0.1", () => {
  console.log("cityvibe running on http://127.0.0.1:3000");
});
