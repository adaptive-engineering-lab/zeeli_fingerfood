-- Guest order persistence — specs/001-guest-order-persistence
--
-- Why this exists: a guest checkout must record its order and every line atomically
-- while holding no read permission on either table. Postgres applies SELECT policies
-- to RETURNING rows, so the old client path (insert order -> read back its id ->
-- insert lines) was rejected outright with 42501 and *nothing* was recorded — not
-- even the order. This function performs both inserts in one transaction and returns
-- only the short reference, so no read permission is ever required.
--
-- The customer's direct INSERT policies are dropped at the bottom: after this, the
-- function is the only write path, and it decides `status`, `subtotal` and
-- `line_total` itself. That is strictly less privilege than before, when
-- `WITH CHECK true` let any crafted request write an order marked 'fulfilled'.
--
-- EXPECTED LINTER WARNINGS — do not "fix" these; doing so breaks guest checkout:
--   0028_anon_security_definer_function_executable
--   0029_authenticated_security_definer_function_executable
-- Both flag that `place_order` is callable by anon/authenticated as SECURITY
-- DEFINER. That is the entire point: guests are unauthenticated, hold no table
-- write permission, and this function is the only way an order can be recorded.
-- Switching it to SECURITY INVOKER or revoking EXECUTE would stop every order.
-- The boundary it guards is verified by `npm run verify:permissions`.

create or replace function public.place_order(
  p_short_ref        text,
  p_customer_name    text,
  p_customer_phone   text,
  p_fulfillment_type public.fulfillment_type,
  p_address          text,
  p_note             text,
  p_lines            jsonb
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id  uuid;
  v_short_ref text;
  v_subtotal  numeric;
  v_attempt   int := 0;
  v_line      jsonb;
begin
  -- Refuse anything that would leave the vendor a record they cannot act on.
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'order must have at least one line' using errcode = '22023';
  end if;

  if coalesce(btrim(p_customer_name), '') = '' then
    raise exception 'customer name is required' using errcode = '22023';
  end if;

  if coalesce(btrim(p_customer_phone), '') = '' then
    raise exception 'customer phone is required' using errcode = '22023';
  end if;

  if p_fulfillment_type = 'delivery' and coalesce(btrim(p_address), '') = '' then
    raise exception 'delivery orders require an address' using errcode = '22023';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if coalesce((v_line ->> 'quantity')::int, 0) <= 0 then
      raise exception 'every line needs a positive quantity' using errcode = '22023';
    end if;
    if coalesce((v_line ->> 'unit_price')::numeric, -1) < 0 then
      raise exception 'every line needs a non-negative unit price' using errcode = '22023';
    end if;
    if coalesce(btrim(v_line ->> 'item_name'), '') = '' then
      raise exception 'every line needs an item name' using errcode = '22023';
    end if;
  end loop;

  -- Money is derived here and never taken from the client. Rounding at each step
  -- matches cartMath.js, so the record agrees with the WhatsApp message digit for digit.
  select sum(round((l ->> 'unit_price')::numeric * (l ->> 'quantity')::int, 2))
    into v_subtotal
    from jsonb_array_elements(p_lines) as l;

  v_short_ref := nullif(btrim(coalesce(p_short_ref, '')), '');

  -- short_ref is UNIQUE. A collision must not cost the customer their record, so
  -- regenerate and retry; the reference actually stored is what we return.
  loop
    v_attempt := v_attempt + 1;
    begin
      insert into public.orders (
        short_ref, customer_name, customer_phone,
        fulfillment_type, address, note, subtotal, status
      ) values (
        -- Regenerated refs keep the customer-facing 'ZF-' shape rather than falling
        -- back to the column default, so the vendor never sees two formats.
        coalesce(v_short_ref, 'ZF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5))),
        btrim(p_customer_name),
        btrim(p_customer_phone),
        p_fulfillment_type,
        case when p_fulfillment_type = 'delivery' then btrim(p_address) end,
        nullif(btrim(coalesce(p_note, '')), ''),
        v_subtotal,
        'new'
      )
      returning id, short_ref into v_order_id, v_short_ref;
      exit;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise;
      end if;
      v_short_ref := null; -- fall back to the column default on the next attempt
    end;
  end loop;

  insert into public.order_items (
    order_id, menu_item_id, variant_id,
    item_name_snapshot, variant_label_snapshot, unit_price_snapshot, quantity, line_total
  )
  select
    v_order_id,
    nullif(l ->> 'menu_item_id', '')::uuid,
    nullif(l ->> 'variant_id', '')::uuid,
    btrim(l ->> 'item_name'),
    nullif(btrim(coalesce(l ->> 'variant_label', '')), ''),
    (l ->> 'unit_price')::numeric,
    (l ->> 'quantity')::int,
    round((l ->> 'unit_price')::numeric * (l ->> 'quantity')::int, 2)
  from jsonb_array_elements(p_lines) as l;

  return v_short_ref;
end;
$$;

comment on function public.place_order is
  'Sole write path for guest orders. Records an order and its lines atomically and '
  'returns the stored short_ref. Callers need no read permission on orders. '
  'See specs/001-guest-order-persistence.';

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default; take it back and grant it deliberately.
revoke all on function public.place_order(
  text, text, text, public.fulfillment_type, text, text, jsonb
) from public;

grant execute on function public.place_order(
  text, text, text, public.fulfillment_type, text, text, jsonb
) to anon, authenticated;

-- The function is now the only write path. Remove the direct-insert permission that
-- let a crafted request set status, subtotal and line prices at will.
drop policy if exists "public can insert orders" on public.orders;
drop policy if exists "public can insert order_items" on public.order_items;
