/*
 * culturewave-features.js
 * Shared client-side logic for CultureWave platform features:
 *   - Platform commission calculation
 *   - Organizer settlement helpers
 *   - Refund request creation
 *   - Loyalty points accrual / redemption
 *   - Referral code generation / redemption
 *   - Waitlist join
 *
 * Uses the Firebase compat SDK that the HTML pages already load
 * (firebase.firestore(), firebase.auth()). Attaches everything to
 * window.CWFeatures so plain <script> pages can call it.
 */
(function (global) {
  "use strict";

  // ── PLATFORM CONFIG ──────────────────────────────────────────
  // Commission the platform keeps from each paid booking.
  var PLATFORM_COMMISSION_RATE = 0.10; // 10%
  // Loyalty: points earned per ₹ spent, and value of 1 point in ₹ on redemption.
  var LOYALTY_EARN_PER_RUPEE = 0.01; // 1 point per ₹100 spent
  var LOYALTY_POINT_VALUE = 1;       // 1 point = ₹1 when redeemed
  // Referral reward (loyalty points) granted to referrer on a referee's first paid booking.
  var REFERRAL_REWARD_POINTS = 100;

  function db() {
    if (!global.firebase || !global.firebase.firestore) {
      throw new Error("Firebase compat SDK not loaded before culturewave-features.js");
    }
    return global.firebase.firestore();
  }

  function serverTimestamp() {
    return global.firebase.firestore.FieldValue.serverTimestamp();
  }

  function currentUser() {
    try {
      return (global.firebase.auth && global.firebase.auth().currentUser) || null;
    } catch (_) {
      return null;
    }
  }

  // ── COMMISSION ───────────────────────────────────────────────
  // Given a gross amount (₹), split it into platform commission and
  // organizer net payout. Returns integers (rounded rupees).
  function computeCommission(grossAmount, rate) {
    var gross = Math.max(0, Number(grossAmount) || 0);
    var r = typeof rate === "number" ? rate : PLATFORM_COMMISSION_RATE;
    var commission = Math.round(gross * r);
    var organiserNet = gross - commission;
    return {
      gross: gross,
      rate: r,
      commission: commission,
      organiserNet: organiserNet,
    };
  }

  // Build the commission fields to merge onto a booking/payment doc.
  function commissionFields(grossAmount, organiserId, rate) {
    var c = computeCommission(grossAmount, rate);
    return {
      grossAmount: c.gross,
      commissionRate: c.rate,
      platformCommission: c.commission,
      organiserNet: c.organiserNet,
      organiserId: organiserId || null,
      settlementStatus: c.organiserNet > 0 ? "pending" : "not_applicable",
    };
  }

  // Persist commission info onto an existing booking (and its payments mirror).
  async function recordCommission(bookingId, grossAmount, organiserId, rate) {
    var fields = commissionFields(grossAmount, organiserId, rate);
    var d = db();
    await d.collection("bookings").doc(bookingId).set(fields, { merge: true });
    try { await d.collection("payments").doc(bookingId).set(fields, { merge: true }); } catch (_) {}
    return fields;
  }

  // ── SETTLEMENTS ──────────────────────────────────────────────
  // Aggregate all bookings by organiser to compute what each is owed.
  // Returns [{ organiserId, gross, commission, net, pendingNet, paidNet, bookingCount }]
  async function computeSettlements() {
    var d = db();
    var snap = await d.collection("bookings").get();
    var byOrg = {};
    snap.forEach(function (doc) {
      var b = doc.data();
      var org = b.organiserId || b.ownerId || "unknown";
      if (!byOrg[org]) {
        byOrg[org] = { organiserId: org, gross: 0, commission: 0, net: 0, pendingNet: 0, paidNet: 0, bookingCount: 0 };
      }
      var gross = Number(b.grossAmount != null ? b.grossAmount : b.amount) || 0;
      if (gross <= 0) return; // skip free bookings
      var c = computeCommission(gross, b.commissionRate);
      var entry = byOrg[org];
      entry.gross += c.gross;
      entry.commission += c.commission;
      entry.net += c.organiserNet;
      entry.bookingCount += 1;
      if (b.settlementStatus === "paid") entry.paidNet += c.organiserNet;
      else entry.pendingNet += c.organiserNet;
    });
    return Object.values(byOrg).sort(function (a, b) { return b.net - a.net; });
  }

  // Mark all pending bookings for an organiser as settled, and log the payout.
  async function settleOrganiser(organiserId, note) {
    var d = db();
    var snap = await d.collection("bookings").where("organiserId", "==", organiserId).get();
    var batch = d.batch();
    var total = 0;
    var count = 0;
    snap.forEach(function (doc) {
      var b = doc.data();
      if (b.settlementStatus === "pending" && (Number(b.organiserNet) || 0) > 0) {
        total += Number(b.organiserNet) || 0;
        count += 1;
        batch.set(doc.ref, { settlementStatus: "paid", settledAt: serverTimestamp() }, { merge: true });
        try { batch.set(d.collection("payments").doc(doc.id), { settlementStatus: "paid", settledAt: serverTimestamp() }, { merge: true }); } catch (_) {}
      }
    });
    var payoutRef = d.collection("settlements").doc();
    batch.set(payoutRef, {
      organiserId: organiserId,
      amount: total,
      bookingCount: count,
      note: note || "",
      status: "paid",
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    return { organiserId: organiserId, amount: total, bookingCount: count, payoutId: payoutRef.id };
  }

  // ── REFUNDS ──────────────────────────────────────────────────
  // Customer creates a refund request against a booking.
  async function requestRefund(bookingId, reason) {
    var d = db();
    var bookingSnap = await d.collection("bookings").doc(bookingId).get();
    if (!bookingSnap.exists) throw new Error("Booking not found");
    var b = bookingSnap.data();
    if (b.checkedIn) throw new Error("Ticket already checked in — not eligible for refund");
    var user = currentUser();
    var ref = d.collection("refundRequests").doc();
    var payload = {
      bookingId: bookingId,
      eventId: b.eventId || null,
      eventName: b.eventName || null,
      organiserId: b.organiserId || b.ownerId || null,
      amount: Number(b.amount) || 0,
      customerName: b.customerName || null,
      customerEmail: b.customerEmail || null,
      userId: (user && user.uid) || b.userId || null,
      reason: reason || "",
      status: "requested", // requested -> approved -> processed | rejected
      createdAt: serverTimestamp(),
    };
    await ref.set(payload);
    await d.collection("bookings").doc(bookingId).set({ refundStatus: "requested" }, { merge: true });
    return Object.assign({ id: ref.id }, payload);
  }

  // ── LOYALTY ──────────────────────────────────────────────────
  function pointsForSpend(amount) {
    return Math.floor((Number(amount) || 0) * LOYALTY_EARN_PER_RUPEE);
  }

  // Accrue loyalty points for a user after a paid booking.
  async function accrueLoyalty(userId, amount, bookingId) {
    if (!userId) return null;
    var pts = pointsForSpend(amount);
    if (pts <= 0) return null;
    var d = db();
    var ref = d.collection("loyalty").doc(userId);
    await d.runTransaction(async function (tx) {
      var snap = await tx.get(ref);
      var cur = snap.exists ? (Number(snap.data().points) || 0) : 0;
      tx.set(ref, {
        points: cur + pts,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      var histRef = ref.collection("history").doc();
      tx.set(histRef, { type: "earn", points: pts, bookingId: bookingId || null, createdAt: serverTimestamp() });
    });
    return pts;
  }

  async function getLoyaltyBalance(userId) {
    if (!userId) return 0;
    var snap = await db().collection("loyalty").doc(userId).get();
    return snap.exists ? (Number(snap.data().points) || 0) : 0;
  }

  // Redeem points for a discount (₹). Returns the rupee value applied.
  async function redeemLoyalty(userId, points) {
    if (!userId || points <= 0) return 0;
    var d = db();
    var ref = d.collection("loyalty").doc(userId);
    var applied = 0;
    await d.runTransaction(async function (tx) {
      var snap = await tx.get(ref);
      var cur = snap.exists ? (Number(snap.data().points) || 0) : 0;
      var use = Math.min(cur, points);
      applied = use * LOYALTY_POINT_VALUE;
      tx.set(ref, { points: cur - use, updatedAt: serverTimestamp() }, { merge: true });
      var histRef = ref.collection("history").doc();
      tx.set(histRef, { type: "redeem", points: -use, value: applied, createdAt: serverTimestamp() });
    });
    return applied;
  }

  // ── REFERRALS ────────────────────────────────────────────────
  function makeReferralCode(seed) {
    var base = (seed || "CW").toString().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "CW";
    var rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return base + rand;
  }

  // Ensure the current user has a referral code; create one if missing.
  async function ensureReferralCode(userId, seed) {
    if (!userId) throw new Error("Sign in to get a referral code");
    var d = db();
    var ref = d.collection("referrals").doc(userId);
    var snap = await ref.get();
    if (snap.exists && snap.data().code) return snap.data().code;
    var code = makeReferralCode(seed);
    await ref.set({ code: code, userId: userId, referredCount: 0, createdAt: serverTimestamp() }, { merge: true });
    return code;
  }

  // Redeem a referral code for a new user (records the link; rewards on first paid booking).
  async function applyReferralCode(newUserId, code) {
    if (!newUserId || !code) return null;
    var d = db();
    var q = await d.collection("referrals").where("code", "==", code.toUpperCase()).limit(1).get();
    if (q.empty) throw new Error("Invalid referral code");
    var referrer = q.docs[0];
    if (referrer.data().userId === newUserId) throw new Error("You can't refer yourself");
    await d.collection("referralClaims").doc(newUserId).set({
      referrerId: referrer.data().userId,
      code: code.toUpperCase(),
      rewarded: false,
      createdAt: serverTimestamp(),
    }, { merge: true });
    return referrer.data().userId;
  }

  // Called after a referee's first paid booking to reward the referrer.
  async function rewardReferralIfPending(newUserId) {
    if (!newUserId) return null;
    var d = db();
    var claimRef = d.collection("referralClaims").doc(newUserId);
    var claim = await claimRef.get();
    if (!claim.exists || claim.data().rewarded) return null;
    var referrerId = claim.data().referrerId;
    await accrueLoyaltyRaw(referrerId, REFERRAL_REWARD_POINTS, null, "referral");
    await claimRef.set({ rewarded: true, rewardedAt: serverTimestamp() }, { merge: true });
    await d.collection("referrals").doc(referrerId).set({
      referredCount: global.firebase.firestore.FieldValue.increment(1),
    }, { merge: true });
    return REFERRAL_REWARD_POINTS;
  }

  async function accrueLoyaltyRaw(userId, pts, bookingId, type) {
    if (!userId || pts <= 0) return null;
    var d = db();
    var ref = d.collection("loyalty").doc(userId);
    await d.runTransaction(async function (tx) {
      var snap = await tx.get(ref);
      var cur = snap.exists ? (Number(snap.data().points) || 0) : 0;
      tx.set(ref, { points: cur + pts, updatedAt: serverTimestamp() }, { merge: true });
      var histRef = ref.collection("history").doc();
      tx.set(histRef, { type: type || "earn", points: pts, bookingId: bookingId || null, createdAt: serverTimestamp() });
    });
    return pts;
  }

  // ── WAITLIST ─────────────────────────────────────────────────
  async function joinWaitlist(eventId, info) {
    if (!eventId) throw new Error("Missing event");
    var d = db();
    var user = currentUser();
    var ref = d.collection("waitlist").doc();
    var payload = {
      eventId: eventId,
      eventName: (info && info.eventName) || null,
      name: (info && info.name) || (user && user.displayName) || null,
      email: (info && info.email) || (user && user.email) || null,
      phone: (info && info.phone) || null,
      userId: (user && user.uid) || null,
      status: "waiting", // waiting -> notified -> converted
      createdAt: serverTimestamp(),
    };
    await ref.set(payload);
    return Object.assign({ id: ref.id }, payload);
  }

  // ── EXPORT ───────────────────────────────────────────────────
  global.CWFeatures = {
    config: {
      PLATFORM_COMMISSION_RATE: PLATFORM_COMMISSION_RATE,
      LOYALTY_EARN_PER_RUPEE: LOYALTY_EARN_PER_RUPEE,
      LOYALTY_POINT_VALUE: LOYALTY_POINT_VALUE,
      REFERRAL_REWARD_POINTS: REFERRAL_REWARD_POINTS,
    },
    computeCommission: computeCommission,
    commissionFields: commissionFields,
    recordCommission: recordCommission,
    computeSettlements: computeSettlements,
    settleOrganiser: settleOrganiser,
    requestRefund: requestRefund,
    pointsForSpend: pointsForSpend,
    accrueLoyalty: accrueLoyalty,
    getLoyaltyBalance: getLoyaltyBalance,
    redeemLoyalty: redeemLoyalty,
    makeReferralCode: makeReferralCode,
    ensureReferralCode: ensureReferralCode,
    applyReferralCode: applyReferralCode,
    rewardReferralIfPending: rewardReferralIfPending,
    joinWaitlist: joinWaitlist,
  };
})(window);
