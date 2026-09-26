/**
 *   npm run create-admin -- <username> <password>
 * Creates the admin account, or resets its password if it already exists.
 */
import "dotenv/config";
import { createUser, MIN_PASSWORD, resetAdmin, USERNAME_RE } from "@/lib/users";

const [username = "", password = ""] = process.argv.slice(2);

if (!USERNAME_RE.test(username.toLowerCase()) || password.length < MIN_PASSWORD) {
  console.error(`Usage: npm run create-admin -- <username> <password>   (password at least ${MIN_PASSWORD} characters)`);
  process.exit(1);
}

if (await resetAdmin(username, password)) {
  console.log(`Updated admin "${username}".`);
} else {
  await createUser(username, password, "admin", { fullName: username });
  console.log(`Created admin "${username}".`);
}
process.exit(0);
