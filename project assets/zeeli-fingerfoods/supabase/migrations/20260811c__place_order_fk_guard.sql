-- place_order FK guard — specs/002-admin-menu-management (T010)
--
-- A repair to feature 001, required before this feature ships discard.
--
-- place_order inserted order_items.menu_item_id straight against the foreign key.
-- Once the vendor can discard an item, a customer holding that item in their cart
-- would have their WHOLE ORDER REJECTED — not the line, the order. Nothing
-- recorded, and constitution Principle II broken by a vendor action that looked
-- entirely routine.
--
-- The fix resolves each id instead of asserting it, storing null when it no
-- longer exists. That is already how the function treats sample-menu ids. 001's
-- snapshots (name, size label, unit price) mean the line still reads exactly as
-- the customer saw it.
--
-- Everything else is byte-identical to 20260810__place_order_rpc.sql.
-- See research D9.

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
    -- Resolve, don't assert. A catalogue id that no longer exists must record as
    -- null rather than raise: the vendor may have discarded the item while it sat
    -- in this customer's cart, and the FK would otherwise reject the ENTIRE order.
    -- The snapshots below keep the line complete either way (spec 002, FR-031).
    (select mi.id from public.menu_items mi
      where mi.id = nullif(l ->> 'menu_item_id', '')::uuid),
    (select mv.id from public.menu_item_variants mv
      where mv.id = nullif(l ->> 'variant_id', '')::uuid),
    btrim(l ->> 'item_name'),
    nullif(btrim(coalesce(l ->> 'variant_label', '')), ''),
    (l ->> 'unit_price')::numeric,
    (l ->> 'quantity')::int,
    round((l ->> 'unit_price')::numeric * (l ->> 'quantity')::int, 2)
  from jsonb_array_elements(p_lines) as l;

  return v_short_ref;
end;
$$;
