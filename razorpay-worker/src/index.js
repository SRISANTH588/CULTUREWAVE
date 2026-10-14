const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
});

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function clean(value, max = 160) {
  return String(value ?? "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, max);
}

function basicAuth(env) {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay credentials are not configured on the payment service.");
  }
  return `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`;
}

async function razorpayRequest(env, path, options = {}) {
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    ...options,
    headers: {
      Authorization: basicAuth(env),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Razorpay API request failed", response.status, result.error?.code || "unknown");
    throw new Error("Razorpay could not process this payment. Please try again.");
  }
  return result;
}

function hexToBytes(value) {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g), byte => parseInt(byte, 16));
}

async function hasValidSignature(orderId, paymentId, signature, secret) {
  const received = hexToBytes(signature);
  if (!received) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const expected = new Uint8Array(await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(`${orderId}|${paymentId}`)
  ));
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ received[index];
  return difference === 0;
}

async function createOrder(request, env) {
  const body = await request.json();
  const amount = Number(body.amount);
  if (!Number.isSafeInteger(amount) || amount < 100 || amount > 500000000) {
    return json({ success: false, error: "Payment amount is invalid." }, 400);
  }
  const customer = body.customer || {};
  const event = body.event || {};
  const receipt = clean(body.receipt, 40).replace(/[^a-zA-Z0-9_-]/g, "") || `cw_${Date.now()}`;
  const order = await razorpayRequest(env, "orders", {
    method: "POST",
    body: JSON.stringify({
      amount,
      currency: "INR",
      receipt,
      notes: {
        eventId: clean(event.id, 120),
        eventName: clean(event.name, 200),
        customerName: clean(customer.name),
        customerEmail: clean(customer.email, 180).toLowerCase(),
        customerPhone: clean(customer.phone, 32),
        tickets: String(Math.max(1, Number(customer.tickets) || 1)),
      },
    }),
  });
  if (!order.id) throw new Error("Razorpay did not return a payment order.");
  return json({
    success: true,
    provider: "razorpay",
    keyId: env.RAZORPAY_KEY_ID,
    razorpayOrderId: order.id,
    amount: order.amount,
    currency: order.currency,
  });
}

async function verifyPayment(request, env) {
  const body = await request.json();
  const orderId = clean(body.razorpay_order_id, 80);
  const paymentId = clean(body.razorpay_payment_id, 80);
  const signature = clean(body.razorpay_signature, 128);
  if (!orderId || !paymentId || !signature) {
    return json({ success: false, verified: false, error: "Payment details are incomplete." }, 400);
  }
  if (!await hasValidSignature(orderId, paymentId, signature, env.RAZORPAY_KEY_SECRET)) {
    return json({ success: false, verified: false, error: "Payment signature is invalid." }, 400);
  }

  const [order, payment] = await Promise.all([
    razorpayRequest(env, `orders/${encodeURIComponent(orderId)}`),
    razorpayRequest(env, `payments/${encodeURIComponent(paymentId)}`),
  ]);
  if (payment.order_id !== orderId || Number(payment.amount) !== Number(order.amount) || order.currency !== "INR") {
    return json({ success: false, verified: false, error: "Payment does not match this booking order." }, 400);
  }

  let finalPayment = payment;
  if (payment.status === "authorized") {
    finalPayment = await razorpayRequest(env, `payments/${encodeURIComponent(paymentId)}/capture`, {
      method: "POST",
      body: JSON.stringify({ amount: order.amount, currency: order.currency }),
    });
  }
  if (finalPayment.status !== "captured") {
    return json({ success: false, verified: false, error: "Razorpay has not confirmed a captured payment." }, 400);
  }
  const booking = body.booking || {};
  const bookingId = clean(booking.bookingId, 100);
  const eventId = clean(booking.eventId, 120);
  const amountPaise = Number(booking.amountPaise);
  const tickets = Number(booking.tickets);
  const seatIds = Array.isArray(booking.seatIds) ? [...new Set(booking.seatIds.map(value => clean(value, 80)).filter(Boolean))] : [];
  if (bookingId !== paymentId || !eventId || amountPaise !== Number(finalPayment.amount) ||
      !Number.isInteger(tickets) || tickets < 1 || tickets > 20 || Number(order.notes?.tickets) !== tickets ||
      !Array.isArray(booking.seatIds) || seatIds.length !== booking.seatIds.length || seatIds.length > 20) {
    return json({ success: false, verified: false, error: "Booking details do not match the captured payment." }, 400);
  }
  if (clean(order.notes?.eventId, 120) !== eventId) {
    return json({ success: false, verified: false, error: "Payment order does not match this event." }, 400);
  }
  await persistPaymentProof(env, {
    paymentId, orderId, eventId, bookingId, amount: Number(finalPayment.amount), tickets,
    seatIds, status: "captured", method: finalPayment.method || "Razorpay",
  });
  return json({ success: true, verified: true, method: finalPayment.method || "Razorpay" });
}

const base64url = value => btoa(String.fromCharCode(...new TextEncoder().encode(value)))
  .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

async function firestoreAccessToken(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error("Payment verification storage is not configured.");
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: account.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const pem = account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = Uint8Array.from(atob(pem), char => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", binary, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const assertion = `${unsigned}.${btoa(String.fromCharCode(...signature)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;
  const response = await fetch(account.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) throw new Error("Could not authorize the payment record write.");
  return result.access_token;
}

function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  return { stringValue: String(value) };
}

async function persistPaymentProof(env, proof) {
  const token = await firestoreAccessToken(env);
  const projectId = env.FIREBASE_PROJECT_ID || "ogshootsluxe-36740";
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/verifiedPayments/${encodeURIComponent(proof.paymentId)}?currentDocument.exists=false`;
  const fields = Object.fromEntries(Object.entries({ ...proof, verifiedAt: new Date().toISOString() }).map(([key, value]) => [key, firestoreValue(value)]));
  const response = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (response.ok) return;
  if (response.status === 409 || response.status === 400) {
    const existingResponse = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/verifiedPayments/${encodeURIComponent(proof.paymentId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (existingResponse.ok) {
      const existing = await existingResponse.json();
      const fields = existing.fields || {};
      const existingSeats = (fields.seatIds?.arrayValue?.values || []).map(value => value.stringValue);
      if (fields.status?.stringValue === "captured" && fields.orderId?.stringValue === proof.orderId &&
          fields.eventId?.stringValue === proof.eventId && Number(fields.amount?.integerValue) === proof.amount &&
          Number(fields.tickets?.integerValue) === proof.tickets &&
          existingSeats.length === proof.seatIds.length && existingSeats.every(seat => proof.seatIds.includes(seat))) return;
    }
  }
  console.error("Could not persist captured payment proof", response.status);
  throw new Error("Payment was captured, but its verification record could not be saved. Contact support before retrying.");
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    if (request.method === "OPTIONS") {
      if (!headers["Access-Control-Allow-Origin"]) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers });
    }
    if (!headers["Access-Control-Allow-Origin"]) return json({ error: "Origin is not allowed." }, 403);
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, headers);
    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
      return json({ success: false, error: "Razorpay credentials are not configured." }, 503, headers);
    }

    try {
      const path = new URL(request.url).pathname.replace(/\/+$/, "");
      if (path === "/createRazorpayOrder") return await createOrder(request, env).then(response => withHeaders(response, headers));
      if (path === "/verifyRazorpayPayment") return await verifyPayment(request, env).then(response => withHeaders(response, headers));
      return json({ error: "Not found." }, 404, headers);
    } catch (error) {
      console.error("Razorpay Worker request failed:", error.message);
      return json({ success: false, verified: false, error: error.message || "Payment request failed." }, 400, headers);
    }
  },
};

function withHeaders(response, headers) {
  const merged = new Headers(response.headers);
  Object.entries(headers).forEach(([key, value]) => merged.set(key, value));
  return new Response(response.body, { status: response.status, headers: merged });
}
