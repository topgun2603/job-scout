import { z } from "zod";
import { MIN_PASSWORD, USERNAME_RE } from "./users";

const list = z.array(z.string().trim().min(1).max(40)).max(40).transform((a) => [...new Set(a)]);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s || null)
    .nullish();

export const profileFields = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(80).optional(),
  email: optText(120),
  phone: optText(30),
  graduationYear: z.number().int().min(2000).max(2040).nullish(),
  locations: list.optional(),
  coreSkills: list.optional(),
  bonusSkills: list.optional(),
  notes: optText(1000),
});

export const createUserBody = profileFields.extend({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_RE, "Username: 3-32 characters, letters, digits, dot, dash or underscore"),
  password: z.string().min(MIN_PASSWORD, `Password must be at least ${MIN_PASSWORD} characters`).max(200),
  fullName: z.string().trim().min(1, "Full name is required").max(80),
});

export const updateUserBody = profileFields.extend({
  password: z.string().min(MIN_PASSWORD, `Password must be at least ${MIN_PASSWORD} characters`).max(200).optional(),
  disabled: z.boolean().optional(),
});

export function firstIssue(e: z.ZodError): string {
  return e.issues[0]?.message ?? "Invalid input";
}
