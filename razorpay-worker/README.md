# Razorpay backend without Firebase Blaze

This Worker provides the order creation and captured-payment verification endpoints used by `booking.html` and `stall-create.html`. Cloudflare Workers can store the Razorpay credentials as encrypted Worker secrets, so the Key Secret does not go into the website or repository.

After Razorpay confirms capture, the Worker writes a `verifiedPayments/{paymentId}` proof and a transaction record directly to Firestore. For stall payments, it also atomically closes the selected slot before allowing the application to be saved; only one captured payment can claim a stall. These writes use the existing Spark Firestore database; this flow does not deploy Firebase Cloud Functions.

## Deploy

1. Install Wrangler and authenticate to the Cloudflare account that will host the Worker:

   ```sh
   npm install --global wrangler
   wrangler login
   ```

2. From this folder, add the credentials at the secure prompts:

   ```sh
   wrangler secret put RAZORPAY_KEY_ID
   wrangler secret put RAZORPAY_KEY_SECRET
   wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
   ```

   `FIREBASE_SERVICE_ACCOUNT_JSON` must contain a service account JSON key for `ogshootsluxe-36740`. Grant that service account the **Cloud Datastore User** role on the Firebase project so it can read event stall slots and write payment records and verification proofs. Keep the key in Cloudflare secrets only; never commit it or paste it into chat.

3. Deploy:

   ```sh
   wrangler deploy
   ```

Wrangler prints the Worker URL (usually `https://culturewave-razorpay.<account-subdomain>.workers.dev`). Set that URL as `razorpayFunctionsUrl` in `booking.html`, then publish the site.

The Worker allows requests from `https://culturewave.in` and `https://www.culturewave.in`. Add any other production origin to `ALLOWED_ORIGINS` in `wrangler.toml` before deployment.

Both website pages already use the Worker URL `https://culturewave-razorpay.culturewaveindia.workers.dev`; deploy this Worker after making changes so the Spark-compatible payment updates take effect. Use Razorpay Live Mode credentials only after the account and payment methods are enabled for live payments. Never commit a secret or paste it into a public chat.
