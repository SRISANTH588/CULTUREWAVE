# Apple Wallet and Google Wallet tickets

The booking confirmation page now offers both wallet buttons for new, confirmed event tickets. A random 256-bit ticket token is included in the confirmation link; only its SHA-256 hash is stored with the booking. The wallet endpoints verify that token and the booking status before issuing a pass. Restaurant reservations and older bookings without a wallet token do not show the buttons.

## Provider setup

Apple requires an Apple Developer Pass Type ID and its Pass Type ID signing certificate. Google requires a Google Wallet issuer account, the Wallet API enabled in Google Cloud, and a service account authorized by that issuer. Google demo mode can show a `[TEST ONLY]` marker until the issuer receives publishing access. See [Apple's pass signing guide](https://developer.apple.com/documentation/walletpasses/building-a-pass) and [Google's event ticket web flow](https://developers.google.com/wallet/tickets/events/web).

Add the non-secret identifiers to `.env.ogshootsluxe-36740`:

```sh
APPLE_WALLET_PASS_TYPE_ID=pass.com.yourcompany.culturewave
APPLE_WALLET_TEAM_ID=YOUR_APPLE_TEAM_ID
APPLE_WALLET_ORGANIZATION=CultureWave
GOOGLE_WALLET_ISSUER_ID=YOUR_GOOGLE_ISSUER_ID
GOOGLE_WALLET_CLASS_SUFFIX=culturewave_event_tickets_v1
```

Store credentials as Firebase Functions secrets. Export the Pass Type ID certificate as PEM, export its private key as an unencrypted PEM, and convert the Apple WWDR intermediate certificate to PEM if Apple supplied a DER `.cer` file. For a DER certificate, `openssl x509 -inform DER -in certificate.cer -out certificate.pem` converts it. Convert each PEM file to one-line base64 (on macOS, `base64 -i file.pem | tr -d '\n'`), then paste each value when prompted:

```sh
firebase functions:secrets:set APPLE_WALLET_SIGNER_CERT_B64 --project ogshootsluxe-36740
firebase functions:secrets:set APPLE_WALLET_SIGNER_KEY_B64 --project ogshootsluxe-36740
firebase functions:secrets:set APPLE_WALLET_WWDR_CERT_B64 --project ogshootsluxe-36740
firebase functions:secrets:set GOOGLE_WALLET_SERVICE_ACCOUNT_JSON --project ogshootsluxe-36740
```

The Apple signing key must be PEM encoded before base64 conversion. The Google secret is the full JSON key file for the service account. Keep all private keys out of the repository.

Install the Functions dependency and deploy the wallet endpoints and updated pages:

```sh
cd functions && npm install
cd ..
firebase deploy --only functions:createAppleWalletPass,functions:createGoogleWalletSaveLink,hosting --project ogshootsluxe-36740
```

Google's signed save link is designed to open in a Google account session. Apple's pass is generated as a signed `.pkpass` file and downloaded from the confirmation page.
