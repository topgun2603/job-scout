import { redirect } from "next/navigation";
import { TopBar } from "@/components/app/top-bar";
import { ResumeViewer } from "@/components/resume/resume-viewer";
import { currentUser } from "@/lib/auth";
import { toMe } from "@/lib/me";

export const dynamic = "force-dynamic";

export default async function ResumePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");
  return (
    <>
      <TopBar me={toMe(user)} />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
        <h1 className="mb-6 font-display text-3xl font-extrabold tracking-tight">My resume</h1>
        <ResumeViewer userId={user.id} />
      </main>
    </>
  );
}
