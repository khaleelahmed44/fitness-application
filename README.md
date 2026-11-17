# Vehicle Fitness Inspection & E-Certificate System

Excel-style vehicle inspection tool: operators log vehicles, inspectors Pass/Fail them, passing issues a printable A4 fitness certificate.

**Stack:** Next.js 15 (App Router, TypeScript) · Tailwind CSS · TanStack Table · Supabase (Postgres + Auth + RLS) · Vercel

## Register format (notebook columns)

| Column | Meaning |
|---|---|
| S.No (`id`) | Auto-incrementing serial number |
| Vehicle No (`registration_no`) | Number plate (upper-cased) |
| Documents Original Submitted (`document_status`) | Free text, e.g. `CNIC, Original Registration Book, Fitness Form`; past entries are suggested as you type |
| Date of Entry (`date_of_entry`) | Captured automatically on creation (Asia/Karachi), immutable |
| District, Traffic Station | Free text with one-click history suggestions |
| Name (`collected_by_or_operator_name`) | Who collected the vehicle / entered it (defaults to the signed-in user) |

Workflow columns: `status` (pending / passed), `certificate_no`, `verified_by(_name)`, `verified_at`, `created_by`.

## Project structure

```
supabase/migrations/001_init.sql            v1 tables, role helper, profiles
supabase/migrations/002–005                 notebook schema, free-text documents, verification toggle, super admin + user mgmt + recycle bin (run in order after 001)
src/
  middleware.ts                             Session refresh + redirect to /login
  types/database.ts                         Vehicle / Profile / Role types, canModify()
  lib/
    supabase/{client,server,middleware}.ts
    vehicle-actions.ts                      add / update / delete / verify / import
    suggestions.ts                          History suggestions per field
    import/parse.ts                         .xlsx / .csv parser
    export/*                                PDF / Excel / Word exporters
  components/
    Dashboard.tsx                           Sidebar, animated counters, tabs, live updates
    VehicleGrid.tsx, columns.tsx            TanStack Table notebook grid
    EntryModal.tsx, SuggestInput.tsx        New / edit form with autocomplete + recent chips
    ImportModal.tsx, ExportMenu.tsx, ConfirmModal.tsx, Modal.tsx, AnimatedNumber.tsx
    Certificate.tsx, PrintButton.tsx        A4 printable certificate
  app/  layout, page, login, certificate/[id]
```

## Import & export

**Import Excel**: upload `.xlsx` / `.csv` with a header row: *Vehicle No* (required), *Document* (Yes/No),
*Date of Entry* (DD/MM/YYYY, optional), *District*, *Traffic Station*, *Name*. A preview shows valid and skipped rows
(missing vehicle no, duplicates, already pending). Limits: 5 MB, 2,000 rows. "Download template" gives a sample.

**Export toolbar** (Excel `.xlsx`, Word `.docx`, PDF): *Export all* (one unified file, Verification Status column), *Verified only*, *Non-verified only*. Every row also has its own PDF / Excel / Word download button (verified rows download the e-certificate).

## Roles & security (3 tiers, username + password, no email OTP)

- **Super Admin** (exactly one, enforced by a unique index; cannot be removed): opens the Admin Panel (`/admin`), adds / removes inspectors, resets passwords, monitors all data and users, and is the only role that can **delete** records (they go to a recycle bin: restore or purge).
- **Inspector** (created by the Admin): sees every record, edits any field, toggles **Verify / Unverify** (certificate number issued on Verify, withdrawn on Unverify), and manages their own Assistants at `/team`.
- **Assistant / Data Entry** (created by an Inspector): manual entries, edits their own pending rows, Import and Export.
- **Login** is a plain username + password. Internally a username maps to a never-mailed address `<username>@vehicle.local` (spaces become dots). Users are created pre-confirmed, so no email is ever sent.
- **No self-registration**: accounts exist only through the `create_user` RPC (Admin creates Inspectors, Inspectors create Assistants). Anyone calling the raw Auth API gets no profile and no data access.
- Everything is enforced in Postgres (RLS + `SECURITY DEFINER` functions + triggers), not only in the browser.
- **Super Admin seed / password**: not stored in this repo. Reset it in the Supabase SQL editor:
  `update auth.users set encrypted_password = extensions.crypt('NEW-PASSWORD', extensions.gen_salt('bf')) where email = 'khaleel.ahmed@vehicle.local';`

## Database setup

Run `supabase/migrations/001` … `006` in order in the SQL editor (006 = three-tier roles and username login). Then seed the single admin by creating an auth user and setting `profiles.role = 'admin'`.

## Run locally

1. **Create a Supabase project** (free tier) at https://supabase.com.
2. **Run the SQL:** Dashboard → SQL Editor → New query → paste `supabase/migrations/001_init.sql` → Run.
3. **Auth settings (for testing):** Authentication → Providers → Email → turn off "Confirm email" so sign-ups log in immediately.
4. **Configure env:** copy `.env.local.example` to `.env.local` and fill in the Project URL and anon key (Project Settings → API).
5. **Install and start:**
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000.

## Create roles and test

1. Log in as the Super Admin → **Admin Panel → Inspectors & Users** → create an Inspector (username + password).
2. Log in as that Inspector → **My Team** → create an Assistant.
3. As the Assistant: **+ New Entry** or **Import**; the row appears under Pending / Not Verified.
4. As the Inspector: click **Verify** (enter who collected) → the row moves to Verified with a certificate; **Unverify** moves it back.
5. Use **Export** for All / Verified only / Non-verified only in Excel, Word or PDF.
6. Security check: as the Assistant, `await supabase.from('vehicles').update({status:'passed'}).eq('status','pending')` in the console must affect 0 rows or error.

## Deploy for free

1. Push the project to GitHub (`.env.local` is git-ignored).
2. Go to https://vercel.com → Add New Project → import the repo (Hobby plan is free).
3. Add environment variables from `.env.local` (all `NEXT_PUBLIC_*`).
4. Deploy. No email settings are needed: login is username + password.

## Notes / assumptions

- Certificate validity defaults to 12 months (`NEXT_PUBLIC_CERT_VALIDITY_MONTHS`); authority name and subtitle are set in env vars.
- A certificate number looks like `CERT-2026-00001` and is sequential per database.
- Passing requires `Verified` documents; inspectors can toggle this inline on the Pending sheet.
- Prefer a custom role-assignment screen later? Add an admin page that calls a SECURITY DEFINER function; the client currently has no write access to `profiles` by design.
