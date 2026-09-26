import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(user.role === "admin" ? "/admin" : "/");
  return <LoginForm />;
}
