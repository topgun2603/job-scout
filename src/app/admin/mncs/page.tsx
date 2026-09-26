import { redirect } from "next/navigation";
import { TopBar } from "@/components/app/top-bar";
import { MncBoard } from "@/components/mnc/mnc-board";
import { currentUser } from "@/lib/auth";
import { toMe } from "@/lib/me";

export const dynamic = "force-dynamic";

export default async function AdminMncPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/mncs");
  return (
    <>
      <TopBar me={toMe(user)} />
      <MncBoard isAdmin />
    </>
  );
}
