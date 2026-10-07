# Vendor onboarding on Firebase Spark

This agreement email and signature flow uses the EmailJS browser SDK, so it does not require Firebase Functions or a Blaze upgrade.

## Setup

1. The agreement request and signed notification use `template_q90dxqn` in `emailjs-agreement-config.js`. Set recipient `{{to_email}}`, subject `{{subject}}`, From Name `{{name}}`, and Reply To `{{reply_to}}`. Use body `Dear {{to_name}},\n\n{{{message_html}}}\n\nRegards,\nCultureWave Vendor Onboarding Team` so the signing URL appears as a labeled link. The signed PDF is saved in Firestore rather than copied into EmailJS variables, staying within EmailJS's 50 KB variable limit. Do not use the booking confirmation template `template_caj3zqw`.
2. The admin composer includes the agreed fee and an **Agreement text** box after the email message. Paste or edit the text there; it is saved with a random one-use signing token and displayed on the signing page. There is no PDF upload. The signing page updates merchant name, address, email and signing date in the text while the signer fills the form.
3. Enable Anonymous sign-in in Firebase Authentication and publish `firestore.rules`. On submit, the signing page atomically locks the token, marks the application signed and stores the completed signed PDF (including the signature and signer details) in the Firestore `signedAgreement/final` document. Firestore storage is limited to PDFs below 670 KB so it stays within the Firestore document limit; this flow does not use Cloud Functions or Firebase Storage.
4. The vendor can reopen the same signing link to download or share the saved PDF. The admin can preview, download or share it from the vendor application in Admin Dashboard. EmailJS sends a small signed notification; the PDF itself is kept in the dashboard and signing link, avoiding the 50 KB EmailJS variable limit.
5. Keep the EmailJS account's allowed origins and send limits configured in the EmailJS dashboard. These browser calls use a public key; never place an EmailJS private key in client code.

## Manual agreement steps

1. Send the agreement from the vendor application modal. EmailJS sends the message directly; its short “Review and sign the agreement” link opens `/sign-agreement` without login.
2. The signer reviews the agreement text, enters name/address/date, draws a signature, accepts the terms, and submits. The signed PDF is saved in Firestore and EmailJS sends a short notification to `support.culturewave@gmail.com`.
3. An administrator reviews the signed PDF and application in Admin Dashboard before approval. Firestore's one-use token and atomic write prevent repeat signatures, including simultaneous submissions from multiple tabs.

The admin composer starts with `CULTUREWAVE_AGREEMENT` from `agreement-template.js`; you can edit or replace it for each request. Keep the placeholders `{{SERVICE_FEE_PERCENT}}`, `{{MERCHANT_NAME}}`, `{{BUSINESS_NAME}}`, `{{REGISTERED_ADDRESS}}`, `{{MERCHANT_EMAIL}}` and `{{SIGNING_DATE}}` where those values should appear. New links contain only a random one-use token; agreement text is stored in Firestore. Older links that predate one-use tokens must be resent by an administrator.

This browser signature is not Aadhaar eSign or a certificate from a licensed digital-signature provider.
