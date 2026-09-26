import { redirect } from "next/navigation";
import { AccessEnded } from "@/components/app/access-ended";
import { TopBar } from "@/components/app/top-bar";
import { Dashboard } from "@/components/dashboard/dashboard";
import { currentUser } from "@/lib/auth";
import { toMe } from "@/lib/me";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const me = toMe(user);
  return (
    <>
      <TopBar me={me} />
      {user.access.active ? <Dashboard isAdmin={user.role === "admin"} /> : <AccessEnded me={me} />}
    </>
  );
}
