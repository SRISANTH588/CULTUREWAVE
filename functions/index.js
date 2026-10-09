const {onDocumentCreated, onDocumentDeleted, onDocumentUpdated} = require('firebase-functions/v2/firestore');
const {defineString, defineSecret} = require('firebase-functions/params');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const {PDFDocument, StandardFonts, rgb} = require('pdf-lib');

initializeApp();
const db = getFirestore();
const emailServiceId = defineString('EMAILJS_SERVICE_ID', {default: 'service_esppdwf'});
const emailPublicKey = defineString('EMAILJS_PUBLIC_KEY', {default: 'PDb2vpOIeLkbZBBFP'});
const waitlistTemplateId = defineString('EMAILJS_WAITLIST_TEMPLATE_ID');
const followerTemplateId = defineString('EMAILJS_FOLLOWER_EVENT_TEMPLATE_ID', {default: ''});
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

// Secure lister onboarding API. No user account is created until approveLister.
const {onRequest} = require('firebase-functions/v2/https');
const {getAuth} = require('firebase-admin/auth');
const {getStorage} = require('firebase-admin/storage');
const {randomBytes, randomInt, createHash, createHmac, timingSafeEqual} = require('node:crypto');
const onboardingOtpTemplate = defineString('EMAILJS_ONBOARDING_OTP_TEMPLATE_ID', {default: 'template_8ho2pwf'});
const onboardingNoticeTemplate = defineString('EMAILJS_ONBOARDING_NOTICE_TEMPLATE_ID', {default: ''});
const onboardingOtpPepper = defineString('ONBOARDING_OTP_PEPPER');
const bucket = getStorage().bucket();
const API_ORIGINS = new Set([
  'https://culturewave.in', 'https://www.culturewave.in',
  'https://srisanth588.github.io', 'http://localhost:3000', 'http://127.0.0.1:3000',
  'http://localhost:5500', 'http://127.0.0.1:5500',
]);
const sha = value => createHash('sha256').update(String(value)).digest('hex');
const randomToken = () => randomBytes(32).toString('base64url');
const clean = (value, max=5000) => String(value ?? '').trim().slice(0, max);
const sendOnboardingMail = async (to, subject, message, name='Lister', actionUrl='') => {
  const templateId = onboardingNoticeTemplate.value();
  if (!templateId) throw new Error('Configure EMAILJS_ONBOARDING_NOTICE_TEMPLATE_ID before sending onboarding emails.');
  const response = await sendEmail(templateId, {
    to_email: to, to_name: name, subject, message, message_html: message.replace(/\n/g, '<br>'), action_url: actionUrl,
    reply_to: 'support.culturewave@gmail.com',
  });
  if (!response.ok) throw new Error(`EmailJS failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
};
const writeActivity = (id, action, performedBy, metadata={}) => db.collection('onboardingActivity').add({applicationId:id, action, performedBy, metadata, timestamp:FieldValue.serverTimestamp()});
async function cors(req, res) {
  const origin = req.get('origin') || '';
  if (API_ORIGINS.has(origin)) res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Max-Age', '3600');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return false; }
  if (req.method !== 'POST') { res.status(405).json({error:'Use POST.'}); return false; }
  return true;
}
async function appSession(req) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '') || req.body?.sessionToken || '';
  if (token.length < 40) throw new Error('Verify your email again to continue.');
  const ref = db.collection('onboardingSessions').doc(sha(token));
  const snap = await ref.get();
  if (!snap.exists || snap.data().expiresAt.toMillis() < Date.now() || snap.data().used) throw new Error('Your verified session expired. Please verify your email again.');
  return {email:snap.data().email, ref, data:snap.data()};
}
async function adminUser(req) {
  const idToken = req.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!idToken) throw new Error('Admin sign-in required.');
  const decoded = await getAuth().verifyIdToken(idToken);
  const user = await db.collection('users').doc(decoded.uid).get();
  if (!user.exists || user.data().role !== 'admin') throw new Error('Administrator access required.');
  return decoded.uid;
}
function endpoint(handler, {admin=false, session=false, secrets=[]}={}) {
  return onRequest({region:'asia-south1', cors:false, maxInstances:10, timeoutSeconds:120, memory:'512MiB', secrets}, async (req,res) => {
    try {
      if (!await cors(req,res)) return;
      const actor = admin ? await adminUser(req) : session ? await appSession(req) : null;
      const result = await handler(req,res,actor);
      if (!res.headersSent) res.status(200).json(result || {ok:true});
    } catch (error) {
      console.error('Onboarding API error:', error);
      if (!res.headersSent) res.status(error.status || 400).json({error:error.message || 'Request failed.'});
    }
  });
}

const razorpayKeyId = defineSecret('RAZORPAY_KEY_ID');
const razorpayKeySecret = defineSecret('RAZORPAY_KEY_SECRET');
const razorpayReceipt = value => clean(value, 40).replace(/[^a-zA-Z0-9_-]/g, '') || `cw_${Date.now()}`;

exports.createRazorpayOrder = endpoint(async req => {
  const amount = Math.round(Number(req.body.amount));
  if (!Number.isSafeInteger(amount) || amount < 100) throw new Error('Payment amount is invalid.');
  const customer = req.body.customer || {};
  const event = req.body.event || {};
  const method = ['upi', 'card', 'netbanking', 'wallet'].includes(customer.method) ? customer.method : 'checkout';
  const receipt = razorpayReceipt(req.body.receipt);
  const auth = Buffer.from(`${razorpayKeyId.value()}:${razorpayKeySecret.value()}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Basic ${auth}`},
    body: JSON.stringify({
      amount,
      currency: 'INR',
      receipt,
      notes: {
        eventId: clean(event.id, 120),
        eventName: clean(event.name, 200),
        customerName: clean(customer.name, 160),
        customerEmail: clean(customer.email, 180),
        customerPhone: clean(customer.phone, 32),
        tickets: String(Math.max(1, Number(customer.tickets) || 1)),
        preferredMethod: method,
      },
    }),
  });
  const order = await response.json();
  if (!response.ok || !order.id) {
    console.error('Razorpay order creation failed:', response.status, order.error?.description || 'Unknown provider error');
    throw new Error('Razorpay could not start this payment. Please try again.');
  }
  await db.collection('razorpayOrders').doc(order.id).set({
    orderId: order.id,
    amount,
    currency: 'INR',
    receipt,
    status: 'created',
    method,
    event: {id: clean(event.id, 120), name: clean(event.name, 200)},
    customer: {
      name: clean(customer.name, 160),
      email: clean(customer.email, 180).toLowerCase(),
      phone: clean(customer.phone, 32),
      tickets: Math.max(1, Number(customer.tickets) || 1),
    },
    createdAt: FieldValue.serverTimestamp(),
  });
  return {success: true, provider: 'razorpay', keyId: razorpayKeyId.value(), razorpayOrderId: order.id, amount, currency: 'INR'};
}, {secrets: [razorpayKeyId, razorpayKeySecret]});

exports.verifyRazorpayPayment = endpoint(async req => {
  const {razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature} = req.body;
  if (!orderId || !paymentId || !signature) throw new Error('Razorpay payment details are incomplete.');
  const expected = createHmac('sha256', razorpayKeySecret.value()).update(`${orderId}|${paymentId}`).digest();
  let received;
  try { received = Buffer.from(signature, 'hex'); } catch (_) { throw new Error('Invalid Razorpay payment signature.'); }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error('Invalid Razorpay payment signature.');

  const orderRef = db.collection('razorpayOrders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) throw new Error('Razorpay order was not found. Contact support before retrying.');
  const savedOrder = orderSnap.data();
  if (savedOrder.status === 'captured' && savedOrder.paymentId === paymentId) return {success: true, verified: true, method: savedOrder.actualMethod || savedOrder.method};

  const auth = Buffer.from(`${razorpayKeyId.value()}:${razorpayKeySecret.value()}`).toString('base64');
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {headers: {Authorization: `Basic ${auth}`}});
  let payment = await response.json();
  if (!response.ok || payment.order_id !== orderId || Number(payment.amount) !== Number(savedOrder.amount)) {
    throw new Error('Razorpay payment does not match this booking order.');
  }
  if (payment.status === 'authorized') {
    const captureResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/capture`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Authorization: `Basic ${auth}`},
      body: JSON.stringify({amount: savedOrder.amount, currency: savedOrder.currency}),
    });
    payment = await captureResponse.json();
    if (!captureResponse.ok) {
      console.error('Razorpay capture failed:', captureResponse.status, payment.error?.description || 'Unknown provider error');
      throw new Error('Payment was authorized but could not be captured. Please contact support.');
    }
  }
  if (payment.status !== 'captured') throw new Error('Razorpay has not confirmed a captured payment for this order.');
  await orderRef.update({status: 'captured', paymentId, actualMethod: payment.method || savedOrder.method, capturedAt: FieldValue.serverTimestamp()});
  return {success: true, verified: true, method: payment.method || savedOrder.method};
}, {secrets: [razorpayKeyId, razorpayKeySecret]});

exports.sendOnboardingOtp = endpoint(async req => {
  const email = clean(req.body.email, 180).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  const ip=(req.headers['x-forwarded-for']||req.ip||'unknown').toString().split(',')[0].trim();
  const rateRef=db.collection('onboardingRateLimits').doc(sha(ip));
  await db.runTransaction(async tx=>{const snap=await tx.get(rateRef),now=Date.now(),data=snap.exists?snap.data():{};if(data.windowStart&&now-data.windowStart.toMillis()<60*60_000&&data.count>=8)throw new Error('Too many verification emails were requested. Please try again later.');const fresh=!data.windowStart||now-data.windowStart.toMillis()>=60*60_000;tx.set(rateRef,{windowStart:fresh?new Date(now):data.windowStart,count:fresh?1:(data.count||0)+1});});
  const id = sha(email), ref = db.collection('onboardingOtp').doc(id), now = Date.now();
  const old = await ref.get();
  if (old.exists && old.data().lastSentAt && now - old.data().lastSentAt.toMillis() < 60_000) throw new Error('Please wait one minute before requesting another code.');
  const code = String(randomInt(100000,1000000));
  await ref.set({email, codeHash:sha(`${onboardingOtpPepper.value()}:${code}`), expiresAt:new Date(now+10*60_000), attempts:0, lastSentAt:new Date(now)});
  const response = await sendEmail(onboardingOtpTemplate.value(), {to_email:email, to_name:'New Lister', otp_code:code, reply_to:'support.culturewave@gmail.com'});
  if (!response.ok) { await ref.delete(); throw new Error(`Could not send verification email (${response.status}).`); }
  return {ok:true};
});

exports.verifyOnboardingOtp = endpoint(async req => {
  const email = clean(req.body.email,180).toLowerCase(), code = clean(req.body.code,6);
  const ref = db.collection('onboardingOtp').doc(sha(email)), snap = await ref.get();
  if (!snap.exists) throw new Error('Request a new verification code.');
  const data = snap.data();
  if (data.expiresAt.toMillis() < Date.now()) { await ref.delete(); throw new Error('That code expired. Request a new one.'); }
  if (data.attempts >= 5) { await ref.delete(); throw new Error('Too many attempts. Request a new code.'); }
  const submitted = Buffer.from(sha(`${onboardingOtpPepper.value()}:${code}`));
  const expected = Buffer.from(data.codeHash);
  if (submitted.length !== expected.length || !timingSafeEqual(submitted,expected)) {
    await ref.update({attempts:FieldValue.increment(1)}); throw new Error('That code is incorrect.');
  }
  await ref.delete();
  const sessionToken=randomToken();
  await db.collection('onboardingSessions').doc(sha(sessionToken)).set({email,createdAt:FieldValue.serverTimestamp(),expiresAt:new Date(Date.now()+24*60*60_000),used:false});
  return {sessionToken};
});

exports.submitVendorApplication = endpoint(async (req,res,session) => {
  const p=req.body.application||{};
  if (clean(p.contact?.email,180).toLowerCase()!==session.email) throw new Error('Verified email does not match this application.');
  const contactName=clean(p.contact?.name,120), businessName=clean(p.vendor?.registeredName,180), phone=clean(p.contact?.phone,32);
  const required=[contactName,businessName,phone,clean(p.vendor?.businessType,80),clean(p.vendor?.category,100),clean(p.address?.line1,600),clean(p.address?.city,80),clean(p.address?.state,80),clean(p.address?.pincode,16),clean(p.bank?.accountNumber,30),clean(p.bank?.ifsc,11),clean(p.bank?.beneficiaryName,140),clean(p.bank?.accountType,20)];
  if (required.some(value=>!value)) throw new Error('Complete all required vendor, address, payout, and listing fields.');
  if(typeof p.vendor?.hasGst!=='boolean'||!['yes','no'].includes(p.vendor?.itrFiledResponse))throw new Error('Provide your GST and ITR answers.');
  if(p.vendor.hasGst&&!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(clean(p.vendor.gstin,15).toUpperCase()))throw new Error('Enter a valid GSTIN or select No GSTIN.');
  if(!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(clean(p.identity?.pan,10).toUpperCase())||!/^\d{12}$/.test(clean(p.identity?.aadhaar,12)))throw new Error('Enter valid PAN and Aadhaar numbers.');
  if(!/^[0-9]{9,24}$/.test(clean(p.bank?.accountNumber,30))||!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(clean(p.bank?.ifsc,11).toUpperCase()))throw new Error('Enter a valid bank account number and IFSC.');
  if (!p.consent) throw new Error('Please accept the onboarding consent.');
  const files=Array.isArray(req.body.files)?req.body.files:[];
  const requiredKinds=['pan','aadhaar'];
  for (const kind of requiredKinds) if(!files.some(f=>f.kind===kind)) throw new Error(`Upload the ${kind.toUpperCase()} document.`);
  if(files.length>12)throw new Error('You can upload up to 12 documents.');
  const now=new Date(), counter=db.collection('onboardingCounters').doc(String(now.getUTCFullYear()));
  const applicationId=await db.runTransaction(async tx=>{const snap=await tx.get(counter);const next=(snap.exists?snap.data().last:0)+1;tx.set(counter,{last:next});return `ONB-${now.getUTCFullYear()}-${String(next).padStart(6,'0')}`;});
  const stored=[];
  for(const f of files){
    const mime=clean(f.mime,50), data=String(f.dataUrl||'');
    if(!['image/png','image/jpeg'].includes(mime)||!/^data:image\/(png|jpeg);base64,/.test(data))throw new Error('Documents must be PNG or JPEG images.');
    const bytes=Buffer.from(data.split(',')[1]||'','base64');
    if(!bytes.length||bytes.length>1024*1024)throw new Error('Each document must be smaller than 1 MB.');
    const validPng=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const validJpeg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
    if((mime==='image/png'&&!validPng)||(mime==='image/jpeg'&&!validJpeg))throw new Error('An uploaded image has an invalid file format.');
    const path=`vendor-onboarding/${applicationId}/${randomBytes(18).toString('hex')}`;
    await bucket.file(path).save(bytes,{metadata:{contentType:mime,metadata:{applicationId,documentType:clean(f.kind,80),originalName:clean(f.name,120)}}});
    stored.push({type:clean(f.kind,80),name:clean(f.name,120),path,contentType:mime,size:bytes.length,uploadedAt:now.toISOString()});
  }
  const ref=db.collection('vendorOnboarding').doc(applicationId);
  const application={applicationId,email:session.email,name:contactName,contact:p.contact||{},vendor:p.vendor||{},business:p.business||{},address:p.address||{},listing:p.listing||{},bank:p.bank||{},identity:{pan:clean(p.identity?.pan,10).toUpperCase(),aadhaar:clean(p.identity?.aadhaar,12)},documents:stored,status:'NEW',agreementStatus:'NOT_SENT',submittedAt:FieldValue.serverTimestamp(),createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),consentAt:FieldValue.serverTimestamp(),userId:null};
  await ref.set(application); await session.ref.update({used:true,applicationId}); await writeActivity(applicationId,'Application Submitted','applicant');
  return {applicationId,status:'NEW'};
},{session:true});

exports.createAgreementRequest = endpoint(async (req,res,uid) => {
  const id=clean(req.body.applicationId,40), subject=clean(req.body.subject,200), body=clean(req.body.message,8000), terms='', serviceFeePercent=Number(req.body.serviceFeePercent), agreementPdf=req.body.agreementPdf||{};
  if(!subject||!body)throw new Error('Provide an email subject and message.');
  if(!Number.isFinite(serviceFeePercent)||serviceFeePercent<0||serviceFeePercent>100)throw new Error('Enter an agreed service fee from 0 to 100 percent.');
  const pdfName=clean(agreementPdf.name,160), pdfData=String(agreementPdf.dataUrl||'');
  if(!pdfName.toLowerCase().endsWith('.pdf')||!/^data:application\/pdf;base64,/.test(pdfData))throw new Error('Upload the agreement as a PDF before sending.');
  const pdfBytes=Buffer.from(pdfData.split(',')[1]||'','base64');
  if(!pdfBytes.length||pdfBytes.length>8*1024*1024||!pdfBytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw new Error('The agreement PDF is invalid or exceeds the 8 MB limit.');
  const parsedPdf=await PDFDocument.load(pdfBytes,{ignoreEncryption:false});
  if(parsedPdf.getPageCount()>100)throw new Error('The agreement PDF can contain up to 100 pages.');
  const ref=db.collection('vendorOnboarding').doc(id), snap=await ref.get();if(!snap.exists)throw new Error('Application not found.');
  const a=snap.data();if(['APPROVED','REJECTED','SIGNED'].includes(a.status))throw new Error('This application is already closed for agreement requests.');
  const agreementPath=`vendor-onboarding/${id}/AGREEMENT_${randomBytes(10).toString('hex')}.pdf`;
  await bucket.file(agreementPath).save(pdfBytes,{metadata:{contentType:'application/pdf',metadata:{applicationId:id,private:'true',originalName:pdfName}}});
  const previous=await db.collection('onboardingSigningTokens').where('applicationId','==',id).where('used','==',false).get();
  if(!previous.empty){const batch=db.batch();previous.docs.forEach(d=>batch.delete(d.ref));await batch.commit();}
  const signingToken=randomToken(), tokenHash=sha(signingToken), signingUrl=`https://culturewave.in/sign-agreement?token=${encodeURIComponent(signingToken)}`;
  const tokenRef=db.collection('onboardingSigningTokens').doc(tokenHash);
  await tokenRef.set({applicationId:id,email:a.email,expiresAt:new Date(Date.now()+7*24*60*60_000),used:false});
  const message=`${body}\n\nApplication ID: ${id}\n\nReview & sign the agreement: ${signingUrl}\n\nSigning page: https://culturewave.in/sign-agreement`;
  await ref.update({status:'SIGNUP_REQUEST_SENT',agreementStatus:'SENT',agreementPdf:{path:agreementPath,name:pdfName,pageCount:parsedPdf.getPageCount()},agreementServiceFeePercent,agreementVersion:'CultureWave-PDF-v1',agreementRequestedAt:FieldValue.serverTimestamp(),agreementRequestedBy:uid,updatedAt:FieldValue.serverTimestamp()});
  try { await sendOnboardingMail(a.email,subject,message,a.name,signingUrl); }
  catch(error) {
    const rollback={status:a.status||'NEW',agreementStatus:a.agreementStatus||'NOT_SENT',updatedAt:FieldValue.serverTimestamp()};
    for(const key of ['agreementTerms','agreementServiceFeePercent','agreementVersion','agreementRequestedAt','agreementRequestedBy','agreementPdf'])rollback[key]=Object.prototype.hasOwnProperty.call(a,key)?a[key]:FieldValue.delete();
    await Promise.all([ref.update(rollback),tokenRef.delete(),bucket.file(agreementPath).delete().catch(()=>{})]);
    throw error;
  }
  await writeActivity(id,'Signup Request Sent',uid);
  return {ok:true};
},{admin:true});

exports.getSigningData = endpoint(async req => {
  const token=clean(req.body.token,200);if(token.length<40)throw new Error('Signing link is invalid.');
  const ref=db.collection('onboardingSigningTokens').doc(sha(token)), snap=await ref.get();
  if(!snap.exists||snap.data().expiresAt.toMillis()<Date.now())throw new Error('This signing link is expired.');
  const aSnap=await db.collection('vendorOnboarding').doc(snap.data().applicationId).get();if(!aSnap.exists)throw new Error('Application not found.');
  const a=aSnap.data(),signed=a.status==='SIGNED'||a.agreementStatus==='SIGNED';
  if(snap.data().used&&!signed)throw new Error('This signing link has already been used.');
  if(!signed&&a.status==='SIGNUP_REQUEST_SENT')await aSnap.ref.update({status:'AWAITING_SIGNATURE',updatedAt:FieldValue.serverTimestamp()});
  if(!signed)await writeActivity(aSnap.id,'Agreement Opened','applicant');
  let agreementPdfUrl=null;
  if(a.agreementPdf?.path){const [url]=await bucket.file(a.agreementPdf.path).getSignedUrl({action:'read',expires:Date.now()+10*60_000,responseDisposition:'inline; filename="CULTUREWAVE_AGREEMENT.pdf"'});agreementPdfUrl=url;}
  return {applicationId:a.applicationId,email:a.email,name:a.name,vendor:a.vendor,business:a.business,address:a.address,contact:a.contact,terms:a.agreementTerms,agreementPdfUrl,agreementPdfName:a.agreementPdf?.name||null,signed,signedAt:a.signedAgreement?.signedAt?.toDate?.()?.toISOString()||null};
});

// The one-time signing token remains read-only until its original seven-day expiry
// so the signer can reopen the completed agreement. It can never sign a second time.
exports.getSignedAgreement = endpoint(async req => {
  const token=clean(req.body.token,200);if(token.length<40)throw new Error('Signing link is invalid.');
  const tokenSnap=await db.collection('onboardingSigningTokens').doc(sha(token)).get();
  if(!tokenSnap.exists||tokenSnap.data().expiresAt.toMillis()<Date.now())throw new Error('This agreement link has expired.');
  const aSnap=await db.collection('vendorOnboarding').doc(tokenSnap.data().applicationId).get();
  if(!aSnap.exists)throw new Error('Application not found.');
  const a=aSnap.data();if(!tokenSnap.data().used||a.status!=='SIGNED'||a.agreementStatus!=='SIGNED'||!a.signedAgreement?.path)throw new Error('The agreement has not been signed yet.');
  const file=bucket.file(a.signedAgreement.path),expires=Date.now()+10*60_000;
  const [previewUrl]=await file.getSignedUrl({action:'read',expires,responseDisposition:'inline; filename="SIGNED_VENDOR_AGREEMENT.pdf"'});
  const [downloadUrl]=await file.getSignedUrl({action:'read',expires,responseDisposition:'attachment; filename="SIGNED_VENDOR_AGREEMENT.pdf"'});
  return {previewUrl,downloadUrl,signedAt:a.signedAgreement.signedAt?.toDate?.()?.toISOString()||null,signingReference:a.signedAgreement.signingReference};
});

exports.signAgreement = endpoint(async req => {
  const token=clean(req.body.token,200), signature=String(req.body.signature||''), signerName=clean(req.body.signerName,180), signerAddress=clean(req.body.signerAddress,600), signingDate=clean(req.body.signingDate,10);
  if(!/^data:image\/png;base64,/.test(signature))throw new Error('Capture your signature before submitting.');
  if(!signerName||!signerAddress||!/^(\d{4})-(\d{2})-(\d{2})$/.test(signingDate)||Number(signingDate.slice(5,7))<1||Number(signingDate.slice(5,7))>12||Number(signingDate.slice(8,10))<1||Number(signingDate.slice(8,10))>31||signingDate>new Date().toISOString().slice(0,10))throw new Error('Enter your full name, address, and a valid signing date no later than today.');
  const tokenRef=db.collection('onboardingSigningTokens').doc(sha(token));
  const tokenSnap=await tokenRef.get();if(!tokenSnap.exists||tokenSnap.data().used||tokenSnap.data().expiresAt.toMillis()<Date.now())throw new Error('This signing link is expired or already used.');
  if(!req.body.accepted)throw new Error('Accept the agreement terms to sign.');
  const id=tokenSnap.data().applicationId, ref=db.collection('vendorOnboarding').doc(id), snap=await ref.get();if(!snap.exists)throw new Error('Application not found.');
  const a=snap.data();if(a.status==='SIGNED'||a.agreementStatus==='SIGNED'||a.signedAgreement?.path)throw new Error('This agreement has already been signed and is locked.');
  const claim=await db.runTransaction(async tx=>{const latest=await tx.get(tokenRef);if(!latest.exists||latest.data().used||latest.data().expiresAt.toMillis()<Date.now())return false;const state=latest.data(),locked=state.signing&&(state.signingStartedAt?.toMillis?.()||Date.now())>Date.now()-5*60_000;if(locked)return false;tx.update(tokenRef,{signing:true,signingStartedAt:FieldValue.serverTimestamp()});return true;});
  if(!claim)throw new Error('This agreement is already being signed or has already been signed. Refresh the page to view the signed copy.');
  try {
  const signedAt=new Date(`${signingDate}T12:00:00+05:30`).toISOString(), signingReference=randomBytes(12).toString('hex');
  const sourceBytes=a.agreementPdf?.path?(await bucket.file(a.agreementPdf.path).download())[0]:null;
  if(!sourceBytes)throw new Error('The agreement PDF is unavailable. Ask CultureWave to resend the agreement.');
  const pdf=await PDFDocument.load(sourceBytes), page=pdf.addPage([612,792]);const font=await pdf.embedFont(StandardFonts.Helvetica), bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const pdfText=value=>String(value||'').replace(/₹/g,'INR ').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[–—]/g,'-').normalize('NFKD').replace(/[^\x20-\x7E]/g,'?');
  const draw=(text,x,y,size=10,f=font)=>page.drawText(pdfText(text),{x,y,size,font:f,color:rgb(.12,.16,.23),maxWidth:510});
  draw('MERCHANT ELECTRONIC SIGNATURE',50,746,16,bold);draw('The lister identified below signed the attached CultureWave agreement electronically.',50,721,10);
  draw(`Application ID: ${id}`,50,683,10,bold);draw(`Merchant / business: ${a.vendor?.registeredName||a.name}`,50,660);draw(`Authorized signatory: ${signerName}`,50,641);draw(`Address: ${signerAddress}`,50,622,9);draw(`Email: ${a.email}`,50,602);draw(`Signing date: ${signingDate}`,50,583);draw('Digital signature',50,548,11,bold);const img=await pdf.embedPng(Buffer.from(signature.split(',')[1],'base64'));const scale=Math.min(220/img.width,70/img.height);page.drawImage(img,{x:50,y:448,width:img.width*scale,height:img.height*scale});
  draw(`Signed by: ${signerName}`,300,522,9,bold);draw(`Signed on: ${new Date(signedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'medium'})} IST`,300,504,9);draw('Signing status: SIGNED',300,486,9,bold);draw(`Signing reference: ${signingReference}`,300,468,8);
  const path=`vendor-onboarding/${id}/SIGNED_VENDOR_AGREEMENT.pdf`, pdfBytes=await pdf.save();await bucket.file(path).save(Buffer.from(pdfBytes),{metadata:{contentType:'application/pdf',metadata:{applicationId:id,private:'true'}}});
  await ref.update({status:'SIGNED',agreementStatus:'SIGNED',signedAgreement:{path,name:'SIGNED_VENDOR_AGREEMENT.pdf',signedAt:FieldValue.serverTimestamp(),signingReference,signerName,signerAddress,signingDate,agreementVersion:a.agreementVersion||'PDF-v1'},updatedAt:FieldValue.serverTimestamp()});
  await tokenRef.update({used:true,signing:false,usedAt:FieldValue.serverTimestamp()});await writeActivity(id,'Agreement Signed','applicant');await writeActivity(id,'PDF Generated','system');return {ok:true};
  } catch(error) { await tokenRef.update({signing:false}).catch(()=>{}); throw error; }
});

exports.adminOnboardingAction = endpoint(async (req,res,uid) => {
  const id=clean(req.body.applicationId,40), action=clean(req.body.action,40), ref=db.collection('vendorOnboarding').doc(id), snap=await ref.get();
  if(!snap.exists)throw new Error('Application not found.');const a=snap.data();
  if(action==='review'){
    if(a.status==='NEW'){await ref.update({status:'UNDER_REVIEW',reviewedAt:FieldValue.serverTimestamp(),reviewedBy:uid,updatedAt:FieldValue.serverTimestamp()});await writeActivity(id,'Admin Reviewed',uid);}
    return {ok:true};
  }
  if(action==='documentUrl'){
    const path=clean(req.body.path,500);if(!a.documents?.some(d=>d.path===path)&&a.signedAgreement?.path!==path)throw new Error('Document does not belong to this application.');
    const file=bucket.file(path), download=Boolean(req.body.download), name=clean(req.body.name,120).replace(/[\r\n"\\]/g,'_');
    const [url]=await file.getSignedUrl({action:'read',expires:Date.now()+5*60_000,responseDisposition:download?`attachment; filename="${name||'onboarding-document'}"`:'inline'});return {url};
  }
  if(action==='resendApprovalEmail'){
    if(a.status!=='APPROVED'||!a.userId)throw new Error('This application has no approved lister account.');
    const link=await getAuth().generatePasswordResetLink(a.email,{url:'https://culturewave.in/login.html'});
    await sendOnboardingMail(a.email,'Your Lister Account Has Been Approved',`Dear ${a.name},\n\nYour application ${id} is approved and your lister account is active. Set your password and sign in here: ${link}\n\nCultureWave Vendor Onboarding Team`,a.name,link);
    await writeActivity(id,'Approval Email Sent',uid,{resent:true});return {ok:true,emailSent:true};
  }
  if(action==='approve'){
    if(a.status!=='SIGNED'||a.agreementStatus!=='SIGNED'||!a.signedAgreement?.path)throw new Error('A signed agreement is required before approval.');
    if(!onboardingNoticeTemplate.value())throw new Error('Configure the EmailJS onboarding notice template before approving listers.');
    const required=['pan','aadhaar'];for(const kind of required)if(!a.documents?.some(d=>d.type===kind))throw new Error(`The ${kind.toUpperCase()} document is missing.`);
    const auth=getAuth();let user;try{user=await auth.getUserByEmail(a.email);if(user.disabled)throw new Error('This email already belongs to a disabled account.');}catch(e){if(e.code!=='auth/user-not-found')throw e;user=await auth.createUser({email:a.email,emailVerified:true,displayName:a.name,disabled:false});}
    const userRef=db.collection('users').doc(user.uid);await userRef.set({uid:user.uid,name:a.name,email:a.email,phone:a.contact?.phone||'',role:'lister',status:'active',emailVerified:true,createdAt:FieldValue.serverTimestamp(),onboardingApplicationId:id},{merge:true});
    await db.collection('organisers').doc(user.uid).set({ownerId:user.uid,name:a.listing?.name||a.vendor?.registeredName||a.name,businessName:a.vendor?.registeredName||'',email:a.email,phone:a.contact?.phone||'',status:'active',createdAt:FieldValue.serverTimestamp()},{merge:true});
    await ref.update({status:'APPROVED',approvedAt:FieldValue.serverTimestamp(),approvedBy:uid,userId:user.uid,updatedAt:FieldValue.serverTimestamp()});await writeActivity(id,'Admin Approved',uid);await writeActivity(id,'Account Created','system',{userId:user.uid});
    const link=await auth.generatePasswordResetLink(a.email,{url:'https://culturewave.in/login.html'});
    try{await sendOnboardingMail(a.email,'Your Lister Account Has Been Approved',`Dear ${a.name},\n\nCongratulations! Your application ${id} is approved and your lister account is active. Set your password and sign in here: ${link}\n\nCultureWave Vendor Onboarding Team`,a.name,link);await writeActivity(id,'Approval Email Sent','system');return {ok:true,userId:user.uid,emailSent:true};}
    catch(error){await writeActivity(id,'Approval Email Failed','system',{error:error.message});return {ok:true,userId:user.uid,emailSent:false,emailError:'Account was approved, but the approval email could not be sent. Check the EmailJS onboarding email template configuration.'};}
  }
  if(action==='reject'){
    const reason=clean(req.body.reason,2000);if(reason.length<5)throw new Error('Enter a rejection reason.');if(a.status==='APPROVED')throw new Error('An approved application cannot be rejected.');
    await ref.update({status:'REJECTED',rejectedAt:FieldValue.serverTimestamp(),rejectedBy:uid,rejectionReason:reason,updatedAt:FieldValue.serverTimestamp()});await writeActivity(id,'Admin Rejected',uid,{reason});
    try{await sendOnboardingMail(a.email,'Update Regarding Your Lister Application',`Dear ${a.name},\n\nWe reviewed your lister application ${id}. Unfortunately, it could not be approved at this time.\n\nReason: ${reason}\n\nPlease contact support.culturewave@gmail.com if you need clarification.`,a.name);await writeActivity(id,'Rejection Email Sent','system');return {ok:true,emailSent:true};}
    catch(error){await writeActivity(id,'Rejection Email Failed','system',{error:error.message});return {ok:true,emailSent:false,emailError:'Application was rejected, but the email could not be sent. Check the EmailJS onboarding email template configuration.'};}
  }
  throw new Error('Unknown admin action.');
},{admin:true});
