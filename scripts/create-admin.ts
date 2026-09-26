/**
 *   npm run create-admin -- <username> <password>
 * Creates the admin account, or resets its password if it already exists.
 */
import { getDb } from "@/lib/db";
import { createUser, hashPassword, MIN_PASSWORD, USERNAME_RE } from "@/lib/users";

const [username = "", password = ""] = process.argv.slice(2);

if (!USERNAME_RE.test(username.toLowerCase()) || password.length < MIN_PASSWORD) {
  console.error(`Usage: npm run create-admin -- <username> <password>   (password at least ${MIN_PASSWORD} characters)`);
  process.exit(1);
}

const d = getDb();
const existing = d.prepare("SELECT id, role FROM users WHERE username = ?").get(username) as { id: number; role: string } | undefined;
if (existing) {
  d.prepare("UPDATE users SET password_hash = ?, role = 'admin', disabled = 0 WHERE id = ?").run(hashPassword(password), existing.id);
  d.prepare("DELETE FROM sessions WHERE user_id = ?").run(existing.id);
  console.log(`Updated admin "${username}".`);
} else {
  createUser(username, password, "admin", { fullName: username });
  console.log(`Created admin "${username}". Sign in at http://localhost:3000/login`);
}
