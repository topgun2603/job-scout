import fs from "node:fs";
import path from "node:path";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type CollectionReference, type Firestore, type WriteBatch } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

// Server-side Firebase (Admin SDK). The service account never reaches the browser, and Firestore
// security rules can stay closed: every read and write goes through these API routes.

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "wellness-d3ec9";
const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || "wellness-d3ec9.firebasestorage.app";
/** The Firebase project is shared, so every Job Scout collection carries this prefix. */
const PREFIX = process.env.FIRESTORE_PREFIX ?? "jobscout_";

/** Locally the key file is gitignored; it is never bundled or deployed. */
const LOCAL_KEY_FILE = path.resolve(process.cwd(), "job-scout-service-account.json");

/**
 * The service account comes from FIREBASE_SERVICE_ACCOUNT (the JSON, raw or base64; use this on
 * Vercel), else FIREBASE_SERVICE_ACCOUNT_FILE (a path), else ./job-scout-service-account.json.
 */
function credentials() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (raw) return cert(JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")));
  const file = process.env.FIREBASE_SERVICE_ACCOUNT_FILE || LOCAL_KEY_FILE;
  if (fs.existsSync(file)) return cert(JSON.parse(fs.readFileSync(file, "utf8")));
  throw new Error(
    "No Firebase service account. Set FIREBASE_SERVICE_ACCOUNT (Vercel) or put job-scout-service-account.json in the project folder.",
  );
}

function firebaseApp(): App {
  return getApps()[0] ?? initializeApp({ credential: credentials(), projectId: PROJECT_ID, storageBucket: BUCKET });
}

// Next can load this module more than once per process (pages and routes are bundled separately)
// while firebase-admin hands every copy the same Firestore, whose settings() may only run once.
const shared = globalThis as { __jobScoutFirestore?: Firestore };

export function firestore(): Firestore {
  if (!shared.__jobScoutFirestore) {
    const db = getFirestore(firebaseApp());
    try {
      db.settings({ ignoreUndefinedProperties: true });
    } catch {
      // Already configured by an earlier copy of this module (dev hot reload): same settings.
    }
    shared.__jobScoutFirestore = db;
  }
  return shared.__jobScoutFirestore;
}

export const bucket = () => getStorage(firebaseApp()).bucket();

export type CollectionName =
  | "users"
  | "usernames"
  | "sessions"
  | "access_log"
  | "resumes"
  | "jobs"
  | "user_jobs"
  | "runs"
  | "mnc_companies"
  | "mnc_roles"
  | "counters";

export const col = (name: CollectionName): CollectionReference => firestore().collection(PREFIX + name);

/** Numeric ids keep the URLs and the UI unchanged (/api/admin/users/2). */
export async function nextId(counter: string, count = 1): Promise<number> {
  const ref = col("counters").doc(counter);
  return firestore().runTransaction(async (tx) => {
    const last = ((await tx.get(ref)).get("value") as number | undefined) ?? 0;
    tx.set(ref, { value: last + count });
    return last + 1;
  });
}

/** Firestore batches hold at most 500 writes. */
export async function inBatches<T>(items: T[], write: (batch: WriteBatch, item: T) => void) {
  for (let i = 0; i < items.length; i += 450) {
    const batch = firestore().batch();
    for (const item of items.slice(i, i + 450)) write(batch, item);
    await batch.commit();
  }
}
