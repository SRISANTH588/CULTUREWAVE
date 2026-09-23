const {onDocumentUpdated} = require('firebase-functions/v2/firestore');
const {defineString} = require('firebase-functions/params');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();
const emailServiceId = defineString('EMAILJS_SERVICE_ID', {default: 'service_esppdwf'});
const emailPublicKey = defineString('EMAILJS_PUBLIC_KEY', {default: 'PDb2vpOIeLkbZBBFP'});
const waitlistTemplateId = defineString('EMAILJS_WAITLIST_TEMPLATE_ID');

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
