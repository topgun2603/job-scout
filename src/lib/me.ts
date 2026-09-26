import type { AccessState } from "./access";
import type { PublicUser } from "./users";

/** What the browser needs to know about the signed-in user. Serializable, client-safe. */
export interface Me {
  id: number;
  username: string;
  fullName: string;
  role: "admin" | "applicant";
  hasResume: boolean;
  access: AccessState;
}

export function toMe(u: PublicUser): Me {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    hasResume: u.resumes.length > 0,
    // Infinity does not survive JSON; admins simply never expire.
    access: u.role === "admin" ? { ...u.access, msLeft: 0 } : u.access,
  };
}
