-- Assistants may delete their own entries while they are still in Working (not yet requested for verification).
-- Admin / inspector keep full delete. Every delete is archived in the recycle bin by a trigger.
drop policy if exists "vehicles_delete_admin_inspector" on public.vehicles;
drop policy if exists "vehicles_delete_workflow" on public.vehicles;
create policy "vehicles_delete_workflow" on public.vehicles for delete to authenticated
  using (public.app_role() in ('admin', 'inspector')
         or (public.app_role() = 'assistant' and status = 'draft' and created_by = auth.uid()));
