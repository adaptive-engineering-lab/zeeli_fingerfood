-- Atomic item save — specs/002-admin-menu-management (T060)
--
-- Every other catalogue write is a single statement and can be a straight
-- supabase call. This one cannot: saving an item that sells in sizes writes
-- menu_items AND reconciles that item's menu_item_variants, and from the browser
-- those are two round trips with no transaction around them.
--
-- The failure between them is not bookkeeping. Switch an item to sizes-mode —
-- which clears its base price — and lose the connection before the sizes land,
-- and customers are looking at an item with NO PRICE AT ALL that is still
-- is_available. SC-007 promises zero invalid items reach customers; two client
-- calls cannot promise it. FR-032 says a customer must never see a partially
-- saved item, and this is the only place that can be made true.
--
-- SECURITY DEFINER, so it re-checks is_admin() ITSELF. Definer rights bypass RLS
-- entirely: the nine policies protecting these tables do NOT protect this
-- function. Feature 001 learned this with place_order. Removing the check below
-- would hand catalogue write to every anonymous visitor.
--
-- EXPECTED LINTER WARNINGS — 0028 / 0029, as with place_order. Same reason: the
-- function is deliberately callable and deliberately definer-rights, and its
-- boundary is the is_admin() check plus `npm run verify:permissions`.

create or replace function public.save_menu_item(
  p_id             uuid,
  p_name           text,
  p_category_id    uuid,
  p_description    text,
  p_price          numeric,
  p_is_available   boolean,
  p_image_url      text,
  p_image_card_url text,
  p_sizes          jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_id           uuid := p_id;
  v_sizes        jsonb := coalesce(p_sizes, '[]'::jsonb);
  v_has_variants boolean;
  v_keep         uuid[];
  v_size         jsonb;
  v_index        int := 0;
  v_size_id      uuid;
begin
  -- The boundary. Not decoration: without it this function is a public
  -- catalogue write endpoint.
  if not public.is_admin() then
    raise exception 'Only the vendor may change the menu.'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(v_sizes) <> 'array' then
    raise exception 'Sizes must be a list.' using errcode = 'invalid_parameter_value';
  end if;

  v_has_variants := jsonb_array_length(v_sizes) > 0;

  -- Priced one way or the other, never both. The client validates this too, so
  -- the vendor sees all their errors at once (FR-010) rather than the first one
  -- Postgres raises — but this is what makes it true.
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'An item needs a name.' using errcode = 'check_violation';
  end if;

  if p_category_id is null then
    raise exception 'An item needs a category.' using errcode = 'check_violation';
  end if;

  if not v_has_variants and (p_price is null or p_price <= 0) then
    raise exception 'An item that does not sell in sizes needs a price above zero.'
      using errcode = 'check_violation';
  end if;

  -- 1. The item itself ------------------------------------------------------

  if v_id is null then
    insert into public.menu_items
      (category_id, name, description, price, image_url, image_card_url,
       is_available, has_variants, sort_order)
    values
      (p_category_id, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''),
       case when v_has_variants then null else p_price end,
       p_image_url, p_image_card_url,
       coalesce(p_is_available, true), v_has_variants,
       coalesce((select max(sort_order) + 1
                 from public.menu_items
                 where category_id = p_category_id and removed_at is null), 0))
    returning id into v_id;
  else
    update public.menu_items set
      category_id    = p_category_id,
      name           = btrim(p_name),
      description    = nullif(btrim(coalesce(p_description, '')), ''),
      price          = case when v_has_variants then null else p_price end,
      image_url      = p_image_url,
      image_card_url = p_image_card_url,
      is_available   = coalesce(p_is_available, true),
      has_variants   = v_has_variants,
      updated_at     = now()
    where id = v_id;

    if not found then
      raise exception 'That item no longer exists.' using errcode = 'no_data_found';
    end if;
  end if;

  -- 2. Its sizes ------------------------------------------------------------
  --
  -- Reconciled rather than deleted-and-reinserted: a past order's order_items
  -- row points at variant_id, and although that FK is ON DELETE SET NULL (so
  -- history survives either way, carried by 001's snapshots), needlessly
  -- churning ids would strip the link from orders that could have kept it.

  select coalesce(array_agg((s->>'id')::uuid), '{}')
    into v_keep
  from jsonb_array_elements(v_sizes) s
  where s->>'id' is not null;

  delete from public.menu_item_variants
  where menu_item_id = v_id
    and not (id = any (v_keep));

  for v_size in select * from jsonb_array_elements(v_sizes)
  loop
    v_size_id := nullif(v_size->>'id', '')::uuid;

    if btrim(coalesce(v_size->>'label', '')) = '' then
      raise exception 'Every size needs a label.' using errcode = 'check_violation';
    end if;

    if (v_size->>'price')::numeric is null or (v_size->>'price')::numeric <= 0 then
      raise exception 'Every size needs a price above zero.' using errcode = 'check_violation';
    end if;

    if v_size_id is null then
      insert into public.menu_item_variants
        (menu_item_id, label, price, is_available, sort_order)
      values
        (v_id, btrim(v_size->>'label'), (v_size->>'price')::numeric,
         coalesce((v_size->>'is_available')::boolean, true), v_index);
    else
      update public.menu_item_variants set
        label        = btrim(v_size->>'label'),
        price        = (v_size->>'price')::numeric,
        is_available = coalesce((v_size->>'is_available')::boolean, true),
        sort_order   = v_index
      where id = v_size_id and menu_item_id = v_id;
    end if;

    v_index := v_index + 1;
  end loop;

  return v_id;
end;
$$;

comment on function public.save_menu_item is
  'The only write path for a menu item and its sizes. Both land in one '
  'transaction or neither does (FR-032). Re-checks is_admin() in its own body '
  'because SECURITY DEFINER bypasses RLS.';

revoke execute on function public.save_menu_item(
  uuid, text, uuid, text, numeric, boolean, text, text, jsonb) from public;
grant execute on function public.save_menu_item(
  uuid, text, uuid, text, numeric, boolean, text, text, jsonb) to authenticated;
