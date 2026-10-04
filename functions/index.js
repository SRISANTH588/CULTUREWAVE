const {onDocumentCreated, onDocumentDeleted, onDocumentUpdated} = require('firebase-functions/v2/firestore');
const {onRequest} = require('firebase-functions/v2/https');
const {defineString} = require('firebase-functions/params');
const {initializeApp} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const crypto = require('crypto');

initializeApp();
const db = getFirestore();
const emailServiceId = defineString('EMAILJS_SERVICE_ID', {default: 'service_esppdwf'});
const emailPublicKey = defineString('EMAILJS_PUBLIC_KEY', {default: 'PDb2vpOIeLkbZBBFP'});
const waitlistTemplateId = defineString('EMAILJS_WAITLIST_TEMPLATE_ID');
const followerTemplateId = defineString('EMAILJS_FOLLOWER_EVENT_TEMPLATE_ID', {default: ''});
const signupOtpTemplateId = defineString('EMAILJS_SIGNUP_OTP_TEMPLATE_ID', {default: 'template_8ho2pwf'});

const signupOrigins = [
  'https://culturewave.in',
  'https://www.culturewave.in',
  'https://srisanth588.github.io',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

function sendJson(res, status, body) {
  res.set('Access-Control-Allow-Origin', res.get('Access-Control-Allow-Origin') || 'https://culturewave.in');
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.status(status).json(body);
}

function allowSignupOrigin(req, res) {
  const origin = req.get('origin');
  if (origin && signupOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return false;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, {error: 'Use POST for this request.'});
    return false;
  }
  if (origin && !signupOrigins.includes(origin)) {
    sendJson(res, 403, {error: 'This website is not allowed to request signup OTPs.'});
    return false;
  }
  return true;
}

function hashKey(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function reserveOtpSend(identifier, ip, subject = 'number') {
  const now = Date.now();
  const targetRef = db.collection('otpRateLimits').doc(`target_${hashKey(identifier)}`);
  const ipRef = db.collection('otpRateLimits').doc(`ip_${hashKey(ip || 'unknown')}`);
  await db.runTransaction(async (transaction) => {
    const [targetSnap, ipSnap] = await Promise.all([transaction.get(targetRef), transaction.get(ipRef)]);
    const targetState = targetSnap.data() || {};
    const ipState = ipSnap.data() || {};
    const targetLast = Number(targetState.lastSentAt || 0);
    const targetStart = Number(targetState.windowStart || 0);
    const targetCount = targetStart > now - 24 * 60 * 60 * 1000 ? Number(targetState.count || 0) : 0;
    const ipStart = Number(ipState.windowStart || 0);
    const ipCount = ipStart > now - 60 * 60 * 1000 ? Number(ipState.count || 0) : 0;
    if (now - targetLast < 60 * 1000) throw new Error('Please wait one minute before requesting another OTP.');
    if (targetCount >= 5) throw new Error(`OTP limit reached for this ${subject} today. Try again tomorrow.`);
    if (ipCount >= 20) throw new Error('Too many OTP requests from this connection. Try again later.');
    transaction.set(targetRef, {lastSentAt: now, windowStart: targetCount ? targetStart : now, count: targetCount + 1});
    transaction.set(ipRef, {windowStart: ipCount ? ipStart : now, count: ipCount + 1});
  });
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

exports.sendListerEmailOtp = onRequest({region: 'asia-south1'}, async (req, res) => {
  if (!allowSignupOrigin(req, res)) return;
  const email = normalizeEmail(req.body?.email);
  if (!email) return sendJson(res, 400, {error: 'Enter a valid email address.'});
  try {
    try {
      await getAuth().getUserByEmail(email);
      return sendJson(res, 409, {error: 'An account already uses this email. Please log in instead.'});
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
    }
    await reserveOtpSend(`email:${email}`, req.ip, 'email address');
    const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const otpRef = db.collection('signupEmailOtps').doc(hashKey(email));
    await otpRef.set({otpHash: hashKey(`${email}:${otp}`), expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0});
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        service_id: emailServiceId.value(),
        template_id: signupOtpTemplateId.value(),
        user_id: emailPublicKey.value(),
        template_params: {to_email: email, to_name: 'New Lister', otp_code: otp, reply_to: 'support.culturewave@gmail.com'},
      }),
    });
    if (!response.ok) {
      await otpRef.delete();
      const details = await response.text();
      console.error('EmailJS signup OTP failed:', response.status, details);
      return sendJson(res, 502, {error: 'EmailJS could not send the code. Check the EmailJS template settings and try again.'});
    }
    return sendJson(res, 200, {ok: true, message: 'Verification code sent.'});
  } catch (error) {
    if (error.message?.startsWith('Please wait') || error.message?.startsWith('OTP limit') || error.message?.startsWith('Too many')) {
      return sendJson(res, 429, {error: error.message});
    }
    console.error('Lister email OTP send error:', error);
    return sendJson(res, 500, {error: 'Could not send the verification code right now. Please try again shortly.'});
  }
});

exports.verifyListerEmailOtp = onRequest({region: 'asia-south1'}, async (req, res) => {
  if (!allowSignupOrigin(req, res)) return;
  const email = normalizeEmail(req.body?.email);
  const otp = String(req.body?.otp || '').trim();
  if (!email) return sendJson(res, 400, {error: 'Enter a valid email address.'});
  if (!/^\d{6}$/.test(otp)) return sendJson(res, 400, {error: 'Enter the 6-digit code from your email.'});
  try {
    try {
      await getAuth().getUserByEmail(email);
      return sendJson(res, 409, {error: 'An account already uses this email. Please log in instead.'});
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
    }
    const otpRef = db.collection('signupEmailOtps').doc(hashKey(email));
    const verified = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(otpRef);
      if (!snapshot.exists) return 'missing';
      const data = snapshot.data();
      if (Number(data.expiresAt) < Date.now()) {
        transaction.delete(otpRef);
        return 'expired';
      }
      if (Number(data.attempts || 0) >= 5) {
        transaction.delete(otpRef);
        return 'locked';
      }
      const suppliedHash = Buffer.from(hashKey(`${email}:${otp}`), 'hex');
      const expectedHash = Buffer.from(String(data.otpHash || ''), 'hex');
      if (suppliedHash.length !== expectedHash.length || !crypto.timingSafeEqual(suppliedHash, expectedHash)) {
        transaction.update(otpRef, {attempts: Number(data.attempts || 0) + 1});
        return 'wrong';
      }
      transaction.delete(otpRef);
      return 'valid';
    });
    if (verified !== 'valid') {
      const message = verified === 'expired' ? 'That code expired. Request a new one.' : verified === 'locked' ? 'Too many incorrect attempts. Request a new code.' : verified === 'missing' ? 'Request a verification code first.' : 'That code is incorrect. Try again.';
      return sendJson(res, 400, {error: message});
    }
    const adminAuth = getAuth();
    const user = await adminAuth.createUser({uid: `email_${hashKey(email).slice(0, 40)}`, email, emailVerified: true});
    const customToken = await adminAuth.createCustomToken(user.uid);
    return sendJson(res, 200, {ok: true, token: customToken, email});
  } catch (error) {
    console.error('Lister email OTP verification error:', error);
    return sendJson(res, 500, {error: 'Could not verify the code right now. Please try again.'});
  }
});

function sendEmail(templateId, templateParams) {
  return fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      service_id: emailServiceId.value(),
      template_id: templateId,
      user_id: emailPublicKey.value(),
      template_params: templateParams,
    }),
  });
}

exports.updateOrganiserFollowerCount = onDocumentCreated({
  document: 'users/{userId}/following/{organiserId}',
  region: 'asia-south1',
}, async (event) => {
  const organiserId = event.params.organiserId;
  await db.collection('organisers').doc(organiserId).update({followers: FieldValue.increment(1)});
});

exports.decreaseOrganiserFollowerCount = onDocumentDeleted({
  document: 'users/{userId}/following/{organiserId}',
  region: 'asia-south1',
}, async (event) => {
  const organiserId = event.params.organiserId;
  await db.collection('organisers').doc(organiserId).update({followers: FieldValue.increment(-1)});
});

exports.emailFollowersAboutNewEvent = onDocumentCreated({
  document: 'events/{eventId}',
  region: 'asia-south1',
  retry: true,
}, async (event) => {
  const data = event.data.data();
  if (!['published', 'live', 'active'].includes(String(data.status || '').toLowerCase())) return;
  const templateId = followerTemplateId.value();
  if (!templateId) {
    console.warn('Follower event emails are disabled: EMAILJS_FOLLOWER_EVENT_TEMPLATE_ID is not configured.');
    return;
  }
  const ownerId = data.ownerId || data.organiserId;
  if (!ownerId) return;
  const organiser = await db.collection('organisers').doc(ownerId).get();
  const followers = await db.collectionGroup('following').where('organiserId', '==', ownerId).limit(500).get();
  if (followers.empty) return;
  const userIds = [...new Set(followers.docs.map((doc) => doc.ref.parent.parent.id))];
  const users = await Promise.all(userIds.map((uid) => db.collection('users').doc(uid).get()));
  const eventName = data.name || data.title || 'New event';
  const eventUrl = `https://culturewave.in/event-detail.html?eventId=${encodeURIComponent(event.params.eventId)}`;
  for (const user of users) {
    const email = user.data()?.email;
    if (!email) continue;
    const response = await sendEmail(templateId, {
      to_email: email,
      to_name: user.data()?.name || user.data()?.displayName || 'CultureWave member',
      organiser_name: organiser.data()?.name || 'An organiser you follow',
      event_name: eventName,
      event_url: eventUrl,
      reply_to: 'support.culturewave@gmail.com',
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(`Follower event email failed for ${user.id}: ${response.status} ${body}`);
      throw new Error(`EmailJS failed to send a follower event email: ${response.status}`);
    }
  }
});

function availableSpots(event) {
  if (!['published', 'live', 'active'].includes(String(event.status || '').toLowerCase())) return 0;
  if (event.soldOut === true) return 0;
  const totalBooked = Math.max(0, Number(event.totalBooked) || 0);
  const capacity = Math.max(0, Number(event.capacity) || 0);
  if (capacity > 0) return Math.max(0, capacity - totalBooked);
  const tickets = Array.isArray(event.tickets) ? event.tickets : [];
  if (!tickets.length) return 0;
  return tickets.reduce((sum, ticket) => {
    const available = ticket.available ?? ticket.remaining;
    if (available != null) return sum + Math.max(0, Number(available) || 0);
    const qty = Math.max(0, Number(ticket.qty || ticket.inventory) || 0);
    return sum + (qty ? Math.max(0, qty - (Number(ticket.booked) || 0)) : 0);
  }, 0);
}

exports.notifyWaitlistWhenSpotsOpen = onDocumentUpdated({
  document: 'events/{eventId}',
  region: 'asia-south1',
  retry: true,
  timeoutSeconds: 540,
}, async (change) => {
  const before = change.data.before.data();
  const after = change.data.after.data();
  if (after.notifyWaitlist !== true || after.allowWaitlist !== true) return;

  const afterAvailable = availableSpots(after);
  const afterTickets = Array.isArray(after.tickets) ? after.tickets : [];
  const unlimited = !(Number(after.capacity) > 0) &&
    (!afterTickets.length || afterTickets.every(ticket => !(Number(ticket.qty || ticket.inventory) > 0)));
  const reopenedManually = before.soldOut === true && after.soldOut !== true && (afterAvailable > 0 || unlimited);
  const opened = Math.max(
    0,
    afterAvailable - availableSpots(before),
    reopenedManually ? 1 : 0,
  );
  if (opened <= 0) return;

  const waiting = await db.collection('waitlist')
    .where('eventId', '==', change.params.eventId)
    .where('status', '==', 'waiting')
    .limit(200)
    .get();
  if (waiting.empty) return;

  const templateId = waitlistTemplateId.value();
  const eventName = after.name || 'Event';
  const bookingUrl = `https://srisanth588.github.io/CULTUREWAVE/event-detail.html?eventId=${encodeURIComponent(change.params.eventId)}`;
  for (const [index, entry] of waiting.docs.entries()) {
    const attendee = entry.data();
    if (!attendee.email) {
      await entry.ref.update({status: 'invalid', notificationError: 'No email address'});
      continue;
    }
    if (index > 0) await new Promise(resolve => setTimeout(resolve, 1100));
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        service_id: emailServiceId.value(),
        template_id: templateId,
        user_id: emailPublicKey.value(),
        template_params: {
          to_email: attendee.email,
          to_name: attendee.name || 'Guest',
          event_name: eventName,
          available_spots: opened,
          booking_url: bookingUrl,
          reply_to: 'support.culturewave@gmail.com',
        },
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(`Waitlist email failed for ${entry.id}: ${response.status} ${body}`);
      throw new Error(`EmailJS failed to send the waitlist notice: ${response.status}`);
    }
    await entry.ref.update({
      status: 'notified',
      notifiedAt: FieldValue.serverTimestamp(),
      notifiedSpots: opened,
    });
  }
});
