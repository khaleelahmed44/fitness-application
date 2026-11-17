import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TeamPanel from "@/components/TeamPanel";
import type { Profile } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (!profile || profile.role !== "inspector") redirect("/");

  return <TeamPanel name={profile.full_name || profile.username} />;
}
