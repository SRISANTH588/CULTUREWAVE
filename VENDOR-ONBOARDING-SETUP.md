# Vendor onboarding on Firebase Spark

This agreement email and signature flow uses the EmailJS browser SDK, so it does not require Firebase Functions or a Blaze upgrade.

## Setup

1. The agreement request and signature receipt both use `template_q90dxqn` in `emailjs-agreement-config.js`. Set recipient `{{to_email}}`, subject `{{subject}}`, From Name `{{name}}`, and Reply To `{{reply_to}}`. Use body `Dear {{to_name}},\n\n{{{message_html}}}\n\nRegards,\nCultureWave Vendor Onboarding Team` so the signing URL appears as a short labeled link in the request and the receipt details appear correctly. Do not use the booking confirmation template `template_caj3zqw`.
2. The admin composer includes the agreement fee and a compact signing link. The signing page displays the agreement text; no PDF upload or attachment is used.
3. Add a **Variable Attachment** for the signer image with parameter `signature_image` and filename `{{signature_filename}}` if your EmailJS plan and template support dynamic attachments.
4. Keep the EmailJS account's allowed origins and send limits configured in the EmailJS dashboard. These browser calls use a public key; never place an EmailJS private key in client code.

## Manual agreement steps

1. Send the agreement from the vendor application modal. EmailJS sends the message directly; its short “Review and sign the agreement” link opens `/sign-agreement` without login.
2. The signer reviews the agreement text, enters name/address/date, draws a signature, accepts the terms, and submits. EmailJS sends the details and signature image to `support.culturewave@gmail.com`.
3. An administrator reviews the signature receipt and application. The app does not create a locked signed PDF or prevent repeat submissions on Spark.

This browser signature is not Aadhaar eSign or a certificate from a licensed digital-signature provider.
