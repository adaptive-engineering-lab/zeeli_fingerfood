-- Pins the search_path on the pre-existing `set_updated_at` trigger function.
-- Flagged by the Supabase database linter (0011_function_search_path_mutable):
-- without a pinned search_path, a role that can create objects in a schema earlier
-- on the caller's path could shadow what the function body resolves to. Same
-- hardening `place_order` already carries.
--
-- Body is unchanged.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
