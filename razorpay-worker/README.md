# Razorpay backend without Firebase Blaze

This Worker provides the same order creation and captured-payment verification endpoints used by `booking.html`. Cloudflare Workers can store the Razorpay credentials as encrypted Worker secrets, so the Key Secret does not go into the website or repository.

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
   ```

3. Deploy:

   ```sh
   wrangler deploy
   ```

Wrangler prints the Worker URL (usually `https://culturewave-razorpay.<account-subdomain>.workers.dev`). Set that URL as `razorpayFunctionsUrl` in `booking.html`, then publish the site.

The Worker allows requests from `https://culturewave.in` and `https://www.culturewave.in`. Add any other production origin to `ALLOWED_ORIGINS` in `wrangler.toml` before deployment.

Use Razorpay Live Mode credentials only after the account and payment methods are enabled for live payments. Never commit a secret or paste it into a public chat.
