import { redirect } from "next/navigation";
import { AdminPanel } from "@/components/admin/admin-panel";
import { TopBar } from "@/components/app/top-bar";
import { currentUser } from "@/lib/auth";
import { toMe } from "@/lib/me";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return (
    <>
      <TopBar me={toMe(user)} />
      <AdminPanel />
    </>
  );
}
