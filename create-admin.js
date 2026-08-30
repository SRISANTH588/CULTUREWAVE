import * as admin from "firebase-admin";

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) { console.error("Missing FIREBASE_SERVICE_ACCOUNT_JSON."); process.exit(1); }

if (!admin.getApps().length) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountJson)) });
}

const auth = admin.auth();
const db = admin.firestore();

const ACCOUNTS = [
  { email: "srisanth@cityvibe.local", password: "SASI@2006", name: "Srisanth", role: "admin" },
  { email: "sasi@cityvibe.local",     password: "sasi",      name: "Sasi",     role: "client" },
];

async function upsertAccount({ email, password, name, role }) {
  let uid;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    console.log(`[exists] ${email} → ${uid}`);
  } catch {
    const created = await auth.createUser({ email, password, displayName: name, emailVerified: true });
    uid = created.uid;
    console.log(`[created] ${email} → ${uid}`);
  }
  await db.collection("users").doc(uid).set({ name, email, role, createdAt: Date.now() }, { merge: true });
  console.log(`[firestore] users/${uid} role=${role}`);
}

async function main() {
  for (const account of ACCOUNTS) await upsertAccount(account);
  console.log("\nDone. Credentials:");
  ACCOUNTS.forEach(a => console.log(`  ${a.role.padEnd(6)} → ${a.email} / ${a.password}`));
}

main().catch(e => { console.error(e); process.exit(1); });
