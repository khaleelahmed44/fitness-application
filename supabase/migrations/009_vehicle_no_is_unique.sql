-- "Jumper No" is now simply "Vehicle No": the single unique identifier of a record.
-- Existing rows take their vehicle number as the unique value (duplicates get "-<id>").
update public.vehicles v set jumper_no = case
  when (select count(*) from public.vehicles x where upper(x.registration_no) = upper(v.registration_no)) > 1
  then upper(v.registration_no) || '-' || v.id else upper(v.registration_no) end;
update public.vehicles_trash t set jumper_no = upper(t.registration_no) || '-' || t.id;
