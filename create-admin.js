import * as admin from "firebase-admin";

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) { console.error("Missing FIREBASE_SERVICE_ACCOUNT_JSON."); process.exit(1); }

if (!admin.getApps().length) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountJson)) });
}

const auth = admin.auth();
const db = admin.firestore();

const ADMIN_EMAIL = "admin@cityvibe.com";
const ADMIN_PASSWORD = "Admin@1234";

async function main() {
  // 1. Create or get the Auth user
  let uid;
  try {
    const existing = await auth.getUserByEmail(ADMIN_EMAIL);
    uid = existing.uid;
    console.log("Auth user already exists:", uid);
  } catch {
    const created = await auth.createUser({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, displayName: "Cityvibe Admin", emailVerified: true });
    uid = created.uid;
    console.log("Auth user created:", uid);
  }

  // 2. Write/update the Firestore users doc keyed by Auth UID
  await db.collection("users").doc(uid).set({
    name: "Cityvibe Admin",
    email: ADMIN_EMAIL,
    role: "admin",
    emailVerified: true,
    createdAt: Date.now(),
  }, { merge: true });

  console.log(`Done. Login with: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

main().catch(e => { console.error(e); process.exit(1); });
