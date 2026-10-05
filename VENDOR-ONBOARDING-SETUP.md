# Vendor onboarding on Firebase Spark

This agreement email and signature flow uses the EmailJS browser SDK, so it does not require Firebase Functions or a Blaze upgrade.

## Setup

1. In the EmailJS template used by `admin-dashboard.html`, set the recipient to `{{to_email}}`, subject to `{{subject}}`, body to `{{message_html}}` (or `{{message}}`), and reply-to to `{{reply_to}}`.
2. The admin composer asks for a public HTTPS URL for the agreement PDF. The agreement PDF is linked in the email and previewed on the signing page. Public URLs are visible to anyone who gets the link, so use a dedicated PDF without government ID, bank details or another applicant's private information.
3. Create a separate EmailJS template for `sign-agreement.html`, with recipient `{{to_email}}`, subject `{{subject}}`, body `{{message_html}}` (or `{{message}}`), and reply-to `{{reply_to}}`.
4. Add a **Variable Attachment** for the signer image with parameter `signature_image` and filename `{{signature_filename}}` if your EmailJS plan and template support dynamic attachments.
5. Put the new signature receipt template ID in `emailjs-agreement-config.js` in place of `REPLACE_WITH_SIGNATURE_RECEIPT_TEMPLATE_ID`.
6. Keep the EmailJS account's allowed origins and send limits configured in the EmailJS dashboard. These browser calls use a public key; never place an EmailJS private key in client code.

## Manual agreement steps

1. Host the final PDF at a public HTTPS URL before sending. Anyone with that URL can view the PDF, so do not use a document containing unrelated personal or banking data.
2. Send the agreement from the vendor application modal. EmailJS sends the message directly and the link opens `/sign-agreement` without login.
3. The signer reviews the PDF, enters name/address/date, draws a signature, accepts the terms, and submits. EmailJS sends the details and signature image to `support.culturewave@gmail.com`.
4. An administrator verifies the email, manually combines the signature with the agreement PDF, and updates the application after review. The app does not create a locked signed PDF or prevent repeat submissions on Spark.

This browser signature is not Aadhaar eSign or a certificate from a licensed digital-signature provider.
