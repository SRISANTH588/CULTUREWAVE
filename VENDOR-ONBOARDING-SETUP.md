# Vendor onboarding deployment setup

The browser pages are configured for Firebase project `ogshootsluxe-36740`, Functions region `asia-south1`. The secure flow will not work on the live site until the Functions and rules are deployed.

## Firebase requirements

1. Upgrade the Firebase project from Spark to Blaze. Cloud Functions deployment requires billing to be enabled. Set a budget alert in Google Cloud before deploying.
2. Create the EmailJS **onboarding notice** template. Configure its recipient as `{{to_email}}`, subject as `{{subject}}`, body as `{{message_html}}` (or `{{message}}`), and reply-to as `{{reply_to}}`. The signing and password setup links are included in the message/action URL.
3. Confirm the existing OTP template `template_8ho2pwf` accepts `to_email`, `to_name`, and `otp_code`.
4. From the repository root, install the Functions dependencies with `npm --prefix functions install`.
5. Create the project environment file `functions/.env.ogshootsluxe-36740` with:

   ```env
   EMAILJS_ONBOARDING_OTP_TEMPLATE_ID=template_8ho2pwf
   EMAILJS_ONBOARDING_NOTICE_TEMPLATE_ID=your_onboarding_notice_template_id
   ONBOARDING_OTP_PEPPER=use_a_long_random_secret_at_least_32_characters
   ```

   Generate a fresh random pepper locally. Never commit the project `.env` file or paste its value into a public issue/chat.
6. Deploy the endpoints and access rules:

   ```sh
   firebase deploy --only functions,firestore:rules,storage
   ```

## EmailJS template variables

The OTP email must render `{{otp_code}}` and be addressed to `{{to_email}}`. The onboarding notice template should include `{{message_html}}`, with recipient and subject variables above. Test both templates from the EmailJS dashboard before accepting live applications.

## Important notes

- Do not use Firebase client SDK calls to create lister users. Account provisioning is restricted to the admin approval Function.
- The generated agreement PDF records the terms shown, applicant details, signature image, signing time, and reference. This in-app signature is not Aadhaar eSign or a certificate from a licensed digital-signature provider. If the agreement requires certified eSign, integrate an approved signing provider before treating it as such.
- PAN, Aadhaar, and bank information are sensitive. Keep admin access limited, do not create public download URLs, and set a document-retention policy. Admin document links expire after five minutes.
- `firebase-debug.log` and the existing uncommitted `firebase.js` changes were present before this work; review them separately before committing.
