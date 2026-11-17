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
supabase/migrations/002_notebook_schema.sql v2 register, triggers, RLS, realtime (run after 001)
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

**Export all**: one unified file containing every record (Pending / Not Verified and Verified together, with a Verification Status column) as **PDF**, **Excel (.xlsx)** or **Word (.docx)**. Verified rows also have per-row e-certificate downloads.

## How security works

- Everything is behind sign-in; the `anon` role has no access to `vehicles`. Row-Level Security is enforced in Postgres, not in the browser.
- **View / add**: any signed-in user with a profile (new entries are forced to `pending` and owned by the creator).
- **Edit / delete** (RLS `UPDATE` and `DELETE` policies): **admin** — any record; **pending** — its creator or any inspector; **verified** — the inspector who verified it (admins always).
- **Verification toggle** (Verified / Not Verified): inspectors / admins only (un-verifying a record follows the same edit rule). Certificate number, verifier and timestamp are set — or cleared — by the `vehicles_guard` trigger, so they cannot be forged.
- Date of entry, creator and S.No are immutable. Roles are changed only via SQL, e.g.
  `update public.profiles set role = 'inspector' where email = 'user@example.com';`

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

1. Sign up two accounts at `/login`: `operator@test.com` and `inspector@test.com`.
2. Promote the inspector in the SQL editor:
   ```sql
   update public.profiles
   set role = 'inspector', full_name = 'Inspector Ali'
   where email = 'inspector@test.com';
   ```
   (Use `'admin'` for admins.) Sign out and in again.
3. As **operator**: click **+ New Entry**, add a vehicle. Only the Pending sheet is shown, with no Pass/Fail buttons.
4. As **inspector**: set the vehicle's Documents cell to *Verified*, click **Pass** → certificate is issued and the row moves to **Passed Vehicles**. Click **Print / View Certificate** → print or "Save as PDF".
5. Add another vehicle and click **Fail** with a reason → it appears in **Failed Vehicles** with the remarks.
6. Security check: as operator, run `await supabase.from('vehicles').update({status:'passed'}).eq('status','pending')` in the browser console. It must affect 0 rows or error.

## Deploy for free

1. Push the project to GitHub (`.env.local` is git-ignored).
2. Go to https://vercel.com → Add New Project → import the repo (Hobby plan is free).
3. Add environment variables from `.env.local` (all `NEXT_PUBLIC_*`).
4. Deploy. In Supabase → Authentication → URL Configuration, set Site URL to your Vercel URL.
5. For production, turn "Confirm email" back on.

## Notes / assumptions

- Certificate validity defaults to 12 months (`NEXT_PUBLIC_CERT_VALIDITY_MONTHS`); authority name and subtitle are set in env vars.
- A certificate number looks like `CERT-2026-00001` and is sequential per database.
- Passing requires `Verified` documents; inspectors can toggle this inline on the Pending sheet.
- Prefer a custom role-assignment screen later? Add an admin page that calls a SECURITY DEFINER function; the client currently has no write access to `profiles` by design.
