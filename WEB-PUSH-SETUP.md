# Website push notifications

The homepage has an **Enable notifications** opt-in. Visitors can subscribe without opening the customer dashboard; the site creates an anonymous Firebase Auth session when needed. Newly published events are pushed to subscribed devices, and inactive endpoints are removed after the push service reports them as expired.

## Configure VAPID

Generate a VAPID key pair with `web-push generate-vapid-keys` in a trusted environment. Keep the private key secret.

1. Set `window.CULTUREWAVE_PUSH_PUBLIC_KEY` in `push-config.js` to the public key.
2. Add the same public key to the ignored project environment file `.env.ogshootsluxe-36740`:

   ```sh
   WEB_PUSH_PUBLIC_KEY=YOUR_PUBLIC_KEY
   ```

3. Store the private key as a Firebase Functions secret:

   ```sh
   firebase functions:secrets:set WEB_PUSH_PRIVATE_KEY --project ogshootsluxe-36740
   ```

4. Install the Functions dependency and deploy the Functions, Hosting files, and Firestore rules:

   ```sh
   cd functions && npm install
   cd ..
   firebase deploy --only functions:sendWebPushForNotification,functions:notifyFollowersOfPublishedEvent,hosting,firestore:rules --project ogshootsluxe-36740
   ```

Do not commit either key. `.env.*` is already ignored by Git. Push requires HTTPS (localhost is supported for development), a supported browser, and permission granted by the visitor. Each device subscribes separately.
