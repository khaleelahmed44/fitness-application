import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Certificate from "@/components/Certificate";
import PrintButton from "@/components/PrintButton";
import type { Vehicle } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function CertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS: only signed-in users can read; the middleware redirects everyone else to /login.
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("*")
    .eq("id", id)
    .eq("status", "passed")
    .maybeSingle<Vehicle>();

  if (!vehicle || !vehicle.certificate_no) notFound();

  return (
    <div className="min-h-screen bg-gray-300 print:bg-white">
      <PrintButton />
      <div className="py-6 print:py-0">
        <Certificate vehicle={vehicle} />
      </div>
    </div>
  );
}
