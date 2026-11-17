import type { Vehicle } from "@/types/database";

const fmt = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

export default function Certificate({ vehicle }: { vehicle: Vehicle }) {
  const authority =
    process.env.NEXT_PUBLIC_AUTHORITY_NAME ?? "Vehicle Fitness Inspection Authority";
  const subtitle = process.env.NEXT_PUBLIC_AUTHORITY_SUBTITLE ?? "";
  const months = Number(process.env.NEXT_PUBLIC_CERT_VALIDITY_MONTHS ?? "12");

  const issued = new Date(vehicle.verified_at ?? vehicle.created_at);
  const expiry = new Date(issued);
  expiry.setMonth(expiry.getMonth() + months);

  const rows: [string, string][] = [
    ["Vehicle No", vehicle.registration_no],
    ["Original Documents Submitted", vehicle.document_status],
    ["Date of Entry", fmt(new Date(`${vehicle.date_of_entry}T00:00:00`))],
    ["District", vehicle.district ?? "—"],
    ["Traffic Station", vehicle.traffic_station ?? "—"],
    ["Collected By", vehicle.collected_by_or_operator_name || "—"],
    ["Date of Verification", fmt(issued)],
    ["Valid Until", fmt(expiry)],
  ];

  return (
    <div className="certificate-sheet mx-auto bg-white p-[14mm] shadow-lg">
      <div className="flex min-h-[269mm] flex-col border-[3px] border-double border-blue-900 p-[10mm]">
        <header className="text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-blue-900">{subtitle}</p>
          <h1 className="mt-1 text-2xl font-bold uppercase text-blue-900">{authority}</h1>
          <div className="mx-auto mt-4 h-px w-40 bg-blue-900" />
          <h2 className="mt-6 text-4xl font-bold tracking-wide text-gray-900">
            Vehicle Fitness Certificate
          </h2>
          <p className="mt-2 text-sm text-gray-600">E-Certificate of Roadworthiness</p>
        </header>

        <section className="mt-10 text-center">
          <p className="text-xs uppercase tracking-widest text-gray-500">Certificate No.</p>
          <p className="font-mono text-3xl font-bold text-blue-900">{vehicle.certificate_no}</p>
        </section>

        <p className="mt-10 text-center text-base leading-relaxed text-gray-800">
          This is to certify that the vehicle described below has been verified and found
          <strong> FIT </strong>
          for road use as of the date of verification.
        </p>

        <table className="mt-8 w-full border-collapse text-base">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th className="w-1/2 border border-gray-400 bg-gray-50 px-4 py-2.5 text-left font-medium text-gray-700">
                  {label}
                </th>
                <td className="border border-gray-400 px-4 py-2.5 font-semibold uppercase">
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-auto grid grid-cols-2 items-end gap-10 pt-16">
          <div>
            <div className="border-b border-gray-700 pb-1 text-lg">
              {vehicle.verified_by_name ?? "—"}
            </div>
            <p className="mt-1 text-xs uppercase tracking-wide text-gray-600">
              Verifying Officer
            </p>
          </div>
          <div className="text-right text-xs text-gray-500">
            <p>Issued electronically on {fmt(issued)}</p>
            <p>Verify using certificate no. {vehicle.certificate_no}</p>
          </div>
        </div>

        <footer className="mt-8 border-t pt-3 text-center text-[10px] text-gray-500">
          This is a computer-generated certificate. Any alteration renders it invalid.
        </footer>
      </div>
    </div>
  );
}
