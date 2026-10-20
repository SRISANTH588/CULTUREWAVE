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
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

function firestoreBase(env) {
  const projectId = env.FIREBASE_PROJECT_ID || "ogshootsluxe-36740";
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
}

function decodeFirestoreValue(value = {}) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
  if ("mapValue" in value) return decodeFirestoreFields(value.mapValue.fields || {});
  return null;
}

function decodeFirestoreFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]));
}

async function getFirestoreDocument(env, collection, id, token) {
  const response = await fetch(`${firestoreBase(env)}/${collection}/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Could not read the event payment record.");
  const document = await response.json();
  return { name: document.name, updateTime: document.updateTime, ...decodeFirestoreFields(document.fields || {}) };
}

async function patchFirestoreDocument(env, collection, id, values, token) {
  const query = new URLSearchParams();
  Object.keys(values).forEach(field => query.append("updateMask.fieldPaths", field));
  const response = await fetch(`${firestoreBase(env)}/${collection}/${encodeURIComponent(id)}?${query}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, firestoreValue(value)])) }),
  });
  if (!response.ok) throw new Error("Could not save the payment transaction record.");
}

async function createFirestoreDocument(env, collection, id, values, token) {
  const response = await fetch(`${firestoreBase(env)}/${collection}/${encodeURIComponent(id)}?currentDocument.exists=false`, {
    method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, firestoreValue(value)])) }),
  });
  return response.ok;
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
  const walletAmount = Number(body.walletAmount || 0);
  if (!Number.isSafeInteger(walletAmount) || walletAmount < 0 || (walletAmount > 0 && walletAmount * 100 >= amount)) {
    return json({ success: false, error: "One Club balance amount is invalid." }, 400);
  }
  const walletUser = walletAmount ? await authenticatedUser(request, env) : null;
  if (walletAmount && !walletUser) return json({ success: false, error: "Sign in to use your One Club balance." }, 401);
  const stallSlotIndex = body.stallSlotIndex === undefined ? null : Number(body.stallSlotIndex);
  if (stallSlotIndex !== null) {
    if (!Number.isInteger(stallSlotIndex) || stallSlotIndex < 0 || stallSlotIndex > 4 || !event.id) {
      return json({ success: false, error: "Stall slot details are invalid." }, 400);
    }
    const firestoreToken = await firestoreAccessToken(env);
    const eventDoc = await getFirestoreDocument(env, "events", clean(event.id, 120), firestoreToken);
    const slot = eventDoc?.stallSlots?.[stallSlotIndex];
    if (!slot?.open || Math.round(Number(slot.fee) * 100) !== amount) {
      return json({ success: false, error: "This stall is no longer available. Choose another open stall." }, 409);
    }
  }
  if (walletAmount) {
    const token = await firestoreAccessToken(env);
    const wallet = await getFirestoreDocument(env, "wallets", walletUser.uid, token);
    if (!wallet || Number(wallet.balance || 0) < walletAmount) return json({ success: false, error: "Your One Club balance is lower than the selected amount." }, 400);
  }
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
        ...(walletAmount ? { walletAmount: String(walletAmount), walletUid: walletUser.uid, grossAmountPaise: String(amount + walletAmount * 100) } : {}),
        ...(stallSlotIndex !== null ? { stallSlotIndex: String(stallSlotIndex) } : {}),
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
  const walletAmount = Number(order.notes?.walletAmount || 0);
  if (bookingId !== paymentId || !eventId || amountPaise !== Number(finalPayment.amount) + walletAmount * 100 ||
      !Number.isInteger(tickets) || tickets < 1 || tickets > 20 || Number(order.notes?.tickets) !== tickets ||
      !Array.isArray(booking.seatIds) || seatIds.length !== booking.seatIds.length || seatIds.length > 20) {
    return json({ success: false, verified: false, error: "Booking details do not match the captured payment." }, 400);
  }
  if (clean(order.notes?.eventId, 120) !== eventId) {
    return json({ success: false, verified: false, error: "Payment order does not match this event." }, 400);
  }
  const walletUid = clean(order.notes?.walletUid, 128);
  const walletUser = walletAmount > 0 ? await authenticatedUser(request, env) : null;
  if (walletAmount > 0 && (!walletUid || !walletUser || walletUser.uid !== walletUid || Math.round(walletAmount * 100) + Number(finalPayment.amount) !== Number(order.notes?.grossAmountPaise))) {
    return json({ success: false, verified: false, error: "Wallet contribution does not match this booking." }, 400);
  }
  const stallSlotIndex = order.notes?.stallSlotIndex === undefined ? null : Number(order.notes.stallSlotIndex);
  const firestoreToken = await firestoreAccessToken(env);
  const paymentRecord = {
    bookingId, receipt: order.receipt || paymentId, eventId,
    eventName: clean(order.notes?.eventName, 200) || "CultureWave event",
    amount: amountPaise / 100, capturedAmount: Number(finalPayment.amount) / 100, walletAmount, currency: order.currency,
    status: "paid", paymentId, paymentMethod: finalPayment.method || "Razorpay",
    customerName: clean(order.notes?.customerName),
    customerEmail: clean(order.notes?.customerEmail, 180).toLowerCase(),
    customerPhone: clean(order.notes?.customerPhone, 32),
    createdAt: { __firestoreTimestamp: new Date().toISOString() },
    paidAt: { __firestoreTimestamp: new Date().toISOString() },
  };
  await patchFirestoreDocument(env, "payments", paymentId, paymentRecord, firestoreToken);
  if (walletAmount > 0) {
    const wallet = await getFirestoreDocument(env, "wallets", walletUid, firestoreToken);
    if (!wallet || Number(wallet.balance || 0) < walletAmount) {
      await patchFirestoreDocument(env, "payments", paymentId, { status: "review", walletConflict: true, reviewNote: "Insufficient One Club balance at capture." }, firestoreToken);
      throw new Error("Your One Club balance changed during checkout. Contact CultureWave support with payment reference " + paymentId + ".");
    }
    const walletTransaction = await getFirestoreDocument(env, "oneClubTransactions", paymentId, firestoreToken);
    if (!walletTransaction) {
      const response = await fetch(`${firestoreBase(env)}:commit`, { method: "POST",
        headers: { Authorization: `Bearer ${firestoreToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ writes: [{ update: { name: `${firestoreBase(env)}/wallets/${encodeURIComponent(walletUid)}`,
          fields: { balance: firestoreValue(Number(wallet.balance) - walletAmount), lastBookingPaymentId: firestoreValue(paymentId), updatedAt: firestoreValue({ __firestoreTimestamp: new Date().toISOString() }) } },
          updateMask: { fieldPaths: ["balance", "lastBookingPaymentId", "updatedAt"] }, ...(wallet.updateTime ? { currentDocument: { updateTime: wallet.updateTime } } : { currentDocument: { exists: false } }) },
          { update: { name: `${firestoreBase(env)}/oneClubTransactions/${encodeURIComponent(paymentId)}`, fields: { uid: firestoreValue(walletUid), amount: firestoreValue(-walletAmount), type: firestoreValue("ticket_booking"), paymentId: firestoreValue(paymentId), createdAt: firestoreValue({ __firestoreTimestamp: new Date().toISOString() }) } }, currentDocument: { exists: false } }] }) });
      if (!response.ok && !await getFirestoreDocument(env, "oneClubTransactions", paymentId, firestoreToken)) throw new Error("The ticket payment was captured but One Club could not be updated. Contact support with payment reference " + paymentId + ".");
    }
  }
  if (stallSlotIndex !== null) {
    try {
      await claimStallSlot(env, firestoreToken, eventId, stallSlotIndex, paymentId, Number(finalPayment.amount));
    } catch (error) {
      await patchFirestoreDocument(env, "payments", paymentId, {
        status: "review", stallSlotConflict: true, reviewNote: error.message,
      }, firestoreToken);
      throw error;
    }
  }
  await persistPaymentProof(env, {
    paymentId, orderId, eventId, bookingId, amount: amountPaise, tickets,
    seatIds, status: "captured", method: finalPayment.method || "Razorpay",
  });
  return json({ success: true, verified: true, method: finalPayment.method || "Razorpay" });
}

async function authenticatedUser(request, env) {
  const token = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const apiKey = env.FIREBASE_WEB_API_KEY || "AIzaSyBCgNQy8EJL7gE-SA1cMePGetWLOR7WWMI";
  if (!token) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token }),
  });
  const result = await response.json().catch(() => ({}));
  const user = result.users?.[0];
  return response.ok && user?.localId ? { uid: user.localId, email: clean(user.email, 180).toLowerCase() } : null;
}

async function createGiftCardOrder(request, env) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ success: false, error: "Sign in to buy a CultureWave gift card." }, 401);
  const body = await request.json();
  const amount = Number(body.amount);
  if (!Number.isSafeInteger(amount) || amount < 250 || amount > 10000) {
    return json({ success: false, error: "Gift card amount must be between ₹250 and ₹10,000." }, 400);
  }
  const order = await razorpayRequest(env, "orders", {
    method: "POST",
    body: JSON.stringify({ amount: amount * 100, currency: "INR", receipt: `cwgc_${Date.now()}`.slice(0, 40),
      notes: { purchaseType: "culturewave_gift_card", ownerUid: user.uid, amount: String(amount),
        occasion: clean(body.occasion, 32), message: clean(body.message, 240), customerEmail: user.email } }),
  });
  return json({ success: true, provider: "razorpay", keyId: env.RAZORPAY_KEY_ID,
    razorpayOrderId: order.id, amount: order.amount, currency: order.currency });
}

function randomDigits(length) {
  const digits = [];
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (const byte of bytes) digits.push(String(byte % 10));
  return digits.join("");
}

async function digest(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function createGiftCard(request, env) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ success: false, verified: false, error: "Sign in to complete this purchase." }, 401);
  const body = await request.json();
  const orderId = clean(body.razorpay_order_id, 80), paymentId = clean(body.razorpay_payment_id, 80);
  const signature = clean(body.razorpay_signature, 128);
  if (!orderId || !paymentId || !signature || !await hasValidSignature(orderId, paymentId, signature, env.RAZORPAY_KEY_SECRET)) {
    return json({ success: false, verified: false, error: "Payment signature is invalid." }, 400);
  }
  const [order, payment] = await Promise.all([
    razorpayRequest(env, `orders/${encodeURIComponent(orderId)}`),
    razorpayRequest(env, `payments/${encodeURIComponent(paymentId)}`),
  ]);
  const amount = Number(order.notes?.amount);
  if (order.notes?.purchaseType !== "culturewave_gift_card" || order.notes?.ownerUid !== user.uid ||
      order.currency !== "INR" || !Number.isSafeInteger(amount) || amount < 250 || amount > 10000 ||
      Number(order.amount) !== amount * 100 || payment.order_id !== orderId || Number(payment.amount) !== Number(order.amount)) {
    return json({ success: false, verified: false, error: "Payment does not match this CultureWave gift card." }, 400);
  }
  let finalPayment = payment;
  if (payment.status === "authorized") finalPayment = await razorpayRequest(env, `payments/${encodeURIComponent(paymentId)}/capture`, {
    method: "POST", body: JSON.stringify({ amount: order.amount, currency: order.currency }),
  });
  if (finalPayment.status !== "captured") return json({ success: false, verified: false, error: "Payment has not been captured." }, 400);

  const firestoreToken = await firestoreAccessToken(env);
  const purchaseId = `gift_${paymentId}`;
  const existing = await getFirestoreDocument(env, "giftCardPurchases", purchaseId, firestoreToken);
  if (existing) {
    if (existing.ownerUid !== user.uid) return json({ success: false, verified: false, error: "Gift card purchase does not belong to this account." }, 403);
    return json({ success: true, verified: true, giftCard: { code: existing.code, pin: existing.pin, amount: existing.amount } });
  }
  const code = randomDigits(16), pin = randomDigits(6);
  const giftCardId = await digest(`${code}:${pin}`);
  const timestamp = new Date().toISOString();
  const giftCard = { giftCardId, code, pin, amount, status: "unredeemed", ownerUid: user.uid,
    purchaseId, paymentId, occasion: clean(order.notes?.occasion, 32), message: clean(order.notes?.message, 240),
    createdAt: { __firestoreTimestamp: timestamp }, expiresAt: { __firestoreTimestamp: new Date(Date.now() + 365 * 86400000).toISOString() } };
  const cardSaved = await createFirestoreDocument(env, "giftCards", giftCardId, giftCard, firestoreToken);
  if (!cardSaved) throw new Error("The gift card was paid for, but issuance needs retry or support review. Keep your payment reference " + paymentId + ".");
  const saved = await createFirestoreDocument(env, "giftCardPurchases", purchaseId, { ownerUid: user.uid, amount, paymentId,
    giftCardId, code, pin, occasion: giftCard.occasion, message: giftCard.message, status: "issued",
    createdAt: { __firestoreTimestamp: timestamp } }, firestoreToken);
  if (!saved) {
    const concurrent = await getFirestoreDocument(env, "giftCardPurchases", purchaseId, firestoreToken);
    if (concurrent?.ownerUid === user.uid) return json({ success: true, verified: true, giftCard: { code: concurrent.code, pin: concurrent.pin, amount: concurrent.amount } });
    throw new Error("The gift card was paid for, but issuance needs support review. Keep your payment reference " + paymentId + ".");
  }
  return json({ success: true, verified: true, giftCard: { code, pin, amount } });
}

async function redeemGiftCard(request, env) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ success: false, error: "Sign in to add a gift card to One Club." }, 401);
  const body = await request.json();
  const code = String(body.code || "").replace(/\D/g, "").slice(0, 16);
  const pin = String(body.pin || "").replace(/\D/g, "").slice(0, 6);
  if (code.length !== 16 || pin.length !== 6) return json({ success: false, error: "Enter a valid 16-digit code and 6-digit PIN." }, 400);
  const id = await digest(`${code}:${pin}`), token = await firestoreAccessToken(env);
  const card = await getFirestoreDocument(env, "giftCards", id, token);
  if (!card || card.code !== code || card.pin !== pin) return json({ success: false, error: "Gift card code or PIN is incorrect." }, 404);
  if (card.status !== "unredeemed") return json({ success: false, error: "This gift card has already been claimed." }, 409);
  if (Date.parse(card.expiresAt) < Date.now()) return json({ success: false, error: "This gift card has expired." }, 410);
  const walletId = user.uid;
  const wallet = await getFirestoreDocument(env, "wallets", walletId, token);
  const purchase = card.purchaseId ? await getFirestoreDocument(env, "giftCardPurchases", card.purchaseId, token) : null;
  const balance = Number(wallet?.balance || 0), amount = Number(card.amount);
  const writes = [
    { update: { name: `${firestoreBase(env)}/giftCards/${encodeURIComponent(id)}`, fields: { status: firestoreValue("redeemed"), redeemedBy: firestoreValue(user.uid), redeemedAt: firestoreValue({ __firestoreTimestamp: new Date().toISOString() }) } },
      updateMask: { fieldPaths: ["status", "redeemedBy", "redeemedAt"] }, currentDocument: { updateTime: card.updateTime } },
    { update: { name: `${firestoreBase(env)}/wallets/${encodeURIComponent(walletId)}`, fields: { balance: firestoreValue(balance + amount), updatedAt: firestoreValue({ __firestoreTimestamp: new Date().toISOString() }), lastGiftCardId: firestoreValue(id) } },
      updateMask: { fieldPaths: ["balance", "updatedAt", "lastGiftCardId"] }, ...(wallet?.updateTime ? { currentDocument: { updateTime: wallet.updateTime } } : { currentDocument: { exists: false } }) },
    ...(purchase ? [{ update: { name: `${firestoreBase(env)}/giftCardPurchases/${encodeURIComponent(card.purchaseId)}`, fields: { status: firestoreValue("redeemed"), redeemedBy: firestoreValue(user.uid), redeemedAt: firestoreValue({ __firestoreTimestamp: new Date().toISOString() }) } }, updateMask: { fieldPaths: ["status", "redeemedBy", "redeemedAt"] }, currentDocument: { updateTime: purchase.updateTime } }] : []),
  ];
  const response = await fetch(`${firestoreBase(env)}:commit`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ writes }) });
  if (!response.ok) return json({ success: false, error: "Could not claim the card just now. Please retry." }, 409);
  return json({ success: true, balance: balance + amount, amount });
}

async function getOneClub(request, env) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ success: false, error: "Sign in to view One Club." }, 401);
  const token = await firestoreAccessToken(env);
  const wallet = await getFirestoreDocument(env, "wallets", user.uid, token);
  return json({ success: true, balance: Number(wallet?.balance || 0) });
}

async function getGiftCardHistory(request, env) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ success: false, error: "Sign in to view gift card history." }, 401);
  const token = await firestoreAccessToken(env);
  const listFor = async (collection, field) => {
    const response = await fetch(`${firestoreBase(env)}:runQuery`, { method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: user.uid } } }, limit: 50 } }) });
    if (!response.ok) throw new Error("Could not load One Club history.");
    return response.json();
  };
  let purchaseRows, transactionRows;
  try { [purchaseRows, transactionRows] = await Promise.all([listFor("giftCardPurchases", "ownerUid"), listFor("oneClubTransactions", "uid")]); }
  catch (_) { return json({ success: false, error: "Could not load One Club history." }, 502); }
  const purchases = (purchaseRows || []).filter(row => row.document).map(row => {
    const document = row.document;
    return { id: document.name.split("/").pop(), ...decodeFirestoreFields(document.fields || {}) };
  });
  const transactions = (transactionRows || []).filter(row => row.document).map(row => ({ id: row.document.name.split("/").pop(), ...decodeFirestoreFields(row.document.fields || {}) }));
  return json({ success: true, purchases, transactions });
}

async function claimStallSlot(env, token, eventId, slotIndex, paymentId, amountPaise) {
  const base = firestoreBase(env);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const beginResponse = await fetch(`${base}:beginTransaction`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ options: { readWrite: {} } }),
    });
    if (!beginResponse.ok) throw new Error("Could not reserve this stall.");
    const { transaction } = await beginResponse.json();
    const eventUrl = `${base}/events/${encodeURIComponent(eventId)}?transaction=${encodeURIComponent(transaction)}`;
    const eventResponse = await fetch(eventUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!eventResponse.ok) throw new Error("Could not find the event stall.");
    const rawEvent = await eventResponse.json();
    const event = decodeFirestoreFields(rawEvent.fields || {}), slots = Array.isArray(event.stallSlots) ? [...event.stallSlots] : [];
    const slot = slots[slotIndex];
    if (!slot || Math.round(Number(slot.fee) * 100) !== amountPaise) throw new Error("The stall fee does not match this payment.");
    if (!slot.open && slot.applicationPaymentId !== paymentId) throw new Error("This stall was just booked by someone else. Your captured payment has been flagged for review.");
    if (slot.applicationPaymentId === paymentId) return;
    slots[slotIndex] = {...slot, open: false, applicationPaymentId: paymentId, applicationStatus: "pending"};
    const commitResponse = await fetch(`${base}:commit`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        transaction,
        writes: [{
          update: { name: rawEvent.name, fields: { stallSlots: firestoreValue(slots), updatedAt: { timestampValue: new Date().toISOString() } } },
          updateMask: { fieldPaths: ["stallSlots", "updatedAt"] },
          currentDocument: { updateTime: rawEvent.updateTime },
        }],
      }),
    });
    if (commitResponse.ok) return;
    if (![409, 400, 412].includes(commitResponse.status)) throw new Error("Could not reserve this stall.");
  }
  throw new Error("This stall is being booked right now. Refresh and check its availability.");
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
  if (value && typeof value === "object" && value.__firestoreTimestamp) {
    return { timestampValue: value.__firestoreTimestamp };
  }
  if (value === null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, firestoreValue(item)])) } };
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
      if (path === "/createGiftCardOrder") return await createGiftCardOrder(request, env).then(response => withHeaders(response, headers));
      if (path === "/verifyGiftCardPayment") return await createGiftCard(request, env).then(response => withHeaders(response, headers));
      if (path === "/redeemGiftCard") return await redeemGiftCard(request, env).then(response => withHeaders(response, headers));
      if (path === "/oneClubBalance") return await getOneClub(request, env).then(response => withHeaders(response, headers));
      if (path === "/giftCardHistory") return await getGiftCardHistory(request, env).then(response => withHeaders(response, headers));
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
