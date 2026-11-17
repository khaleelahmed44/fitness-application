import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminPanel from "@/components/AdminPanel";
import type { Profile } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  // Only the super admin may open this page (every action is also re-checked by the database)
  if (!profile || profile.role !== "admin") redirect("/");

  return <AdminPanel adminName={profile.full_name || profile.email || "Admin"} />;
}
