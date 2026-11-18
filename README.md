# CFX – Document Verification Portal

A spreadsheet-style web portal where assistants log records, send them for verification, and inspectors approve them.
Stack: Next.js 15 (App Router, TypeScript), Tailwind, TanStack Table, framer-motion, Supabase (Postgres + Auth + RLS), Vercel.

## Workflow

1. **Assistant** logs an entry (*Working Queue*) and clicks **Send for Verification** (per entry, or *Send all*).
2. The entry moves to the **Verification Queue** (Inspector / Admin).
3. Inspector or Admin clicks **Approve** (one click) or **Approve all**; a certificate number is issued and the record moves to the **Verified Queue**. *Unverify* returns it to the queue.
4. **Daily Files**: every record is filed under the date it was logged (`YYYY-MM-DD`). Today's folder is active, earlier days are archived; open a day to see its records.

Every record carries **Collected By** (mandatory: the assistant who received the documents).

## Unique Jumper No

Records are identified by a unique **Jumper No** (the physical token of each visit), **not** by vehicle number. The same vehicle can come back on a later visit with a new jumper without being merged into earlier history. Duplicate jumper numbers are rejected by the database.

## Columns

S.No (auto) · Jumper No · Vehicle No · Documents Original Submitted (free text, with suggestions) · Date of Entry (auto) · District · Traffic Station · Collected By · Status.

## Roles (username + password, no email OTP)

- **Super Admin** (exactly one): everything an Inspector can do, plus the Admin Panel (`/admin`): create / remove inspectors, reset passwords, monitoring, recycle bin (restore / purge).
- **Inspector** (created by the Admin): sees all records, edits any, approves / unverifies, deletes (single or *Delete all*), manages their assistants at `/team`.
- **Assistant** (created by an Inspector): adds and imports entries, edits their own working entries, sends them for verification. Assistants only see their own working entries.
- No self-registration. All rules are enforced in Postgres (RLS + triggers), not only in the browser.
- Login: a username maps internally to `<username>@vehicle.local` (never mailed).
- The Super Admin password is not stored in this repo. Reset it in the Supabase SQL editor:
  `update auth.users set encrypted_password = extensions.crypt('NEW-PASSWORD', extensions.gen_salt('bf')) where email = 'khaleel.ahmed@vehicle.local';`

## Import / export

- **Import** `.xlsx` / `.csv` with a header row. Required columns: **Jumper No**, **Vehicle No**, **Collected By**. Optional: Documents Original Submitted, Date of Entry (DD/MM/YYYY), District, Traffic Station. Imported rows land in the Working Queue. "Download template" gives a sample.
- **Export** (Excel, Word, PDF): *Export all*, *Verified only*, *Non-verified only*; every row also has its own PDF / Excel / Word download (verified rows download the certificate).

## Database setup

Run `supabase/migrations/001` … `008` in order in the Supabase SQL editor (008 = CFX workflow: working queue, jumper number). Then seed the single admin (an auth user + `profiles.role = 'admin'`).

## Run locally

1. Create a free Supabase project and run the migrations.
2. Copy `.env.local.example` to `.env.local` and fill in the Project URL and anon key.
3. `npm install && npm run dev` → http://localhost:3000

## Deploy for free

Push to GitHub, import the repo in Vercel (Hobby plan), add the `NEXT_PUBLIC_*` variables from `.env.local`, deploy. Login is username + password, so no email settings are needed.

## Notes

- Certificate validity defaults to 12 months (`NEXT_PUBLIC_CERT_VALIDITY_MONTHS`). Certificate numbers look like `CERT-2026-00001`.
- Branding is fixed to "CFX"; no organisation or government naming appears in the UI, exports or certificates.
