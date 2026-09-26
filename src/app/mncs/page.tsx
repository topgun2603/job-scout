import { redirect } from "next/navigation";
import { AccessEnded } from "@/components/app/access-ended";
import { TopBar } from "@/components/app/top-bar";
import { MncBoard } from "@/components/mnc/mnc-board";
import { currentUser } from "@/lib/auth";
import { toMe } from "@/lib/me";

export const dynamic = "force-dynamic";

export default async function MncPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin/mncs");
  const me = toMe(user);
  return (
    <>
      <TopBar me={me} />
      {user.access.active ? <MncBoard isAdmin={false} /> : <AccessEnded me={me} />}
    </>
  );
}
