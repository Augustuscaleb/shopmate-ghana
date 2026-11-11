-- Stage 1 server functions: idempotency helpers, create_business, register_device.
-- Business features (sales, purchases, credit, closing...) are later stages.

-- ---------------------------------------------------------------------------
-- Idempotency (09 §4.3)
-- Returns NULL when this call should proceed, or the stored result of an
-- earlier identical request. A concurrent duplicate waits on the unique index
-- until the first transaction ends, then sees its stored result.
-- ---------------------------------------------------------------------------
create or replace function private.claim_request(p_request_id uuid, p_function text, p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.request_log%rowtype;
begin
  if p_request_id is null then
    raise exception 'request_id_required' using errcode = '22023';
  end if;

  insert into public.request_log (request_id, business_id, user_id, function_name)
  values (p_request_id, p_business_id, auth.uid(), p_function)
  on conflict (request_id) do nothing;

  if found then
    return null;  -- first time: caller proceeds
  end if;

  select * into v_row from public.request_log where request_id = p_request_id;
  if v_row.user_id is distinct from auth.uid() or v_row.function_name <> p_function then
    raise exception 'request_id_reused' using errcode = '22023';
  end if;
  return v_row.result;
end;
$$;

create or replace function private.complete_request(p_request_id uuid, p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.request_log set result = p_result where request_id = p_request_id;
  return p_result;
end;
$$;

revoke all on function private.claim_request(uuid, text, uuid) from public;
revoke all on function private.complete_request(uuid, jsonb) from public;

-- Device code from a zero-based index: 0 -> A, 25 -> Z, 26 -> AA, ...
create or replace function private.device_code(p_index integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_n integer := p_index;
  v_code text := '';
begin
  loop
    v_code := chr(65 + (v_n % 26)) || v_code;
    v_n := v_n / 26 - 1;
    exit when v_n < 0;
  end loop;
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_business: owner creates their shop (owner-only MVP, decision 7)
-- ---------------------------------------------------------------------------
create or replace function public.create_business(
  p_request_id uuid,
  p_name text,
  p_type text,
  p_town text default null,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_prior jsonb;
  v_business_id uuid;
  v_ref text;
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  v_prior := private.claim_request(p_request_id, 'create_business', null);
  if v_prior is not null then
    return v_prior;
  end if;

  v_ref := 'SM-' || lpad(nextval('private.business_reference_seq')::text, 4, '0');

  insert into public.businesses (name, type, town, phone, reference_code, created_by)
  values (btrim(p_name), p_type, nullif(btrim(p_town), ''), nullif(btrim(p_phone), ''), v_ref, v_user)
  returning id into v_business_id;

  insert into public.business_members (business_id, user_id, role) values (v_business_id, v_user, 'owner');

  -- Pilot plan: all features free (approved pilot arrangement)
  insert into public.subscriptions (business_id, plan, status) values (v_business_id, 'pilot', 'pilot');

  -- Default expense categories (03 S-51). Stock purchases are deliberately absent (05 §12.1).
  insert into public.expense_categories (business_id, name)
  select v_business_id, n
  from unnest(array['Rent','Electricity (ECG)','Water','Transport','Wages','Stock transport',
                    'Repairs','Phone/data','Tax/levies','Other']) as n;

  insert into public.audit_log (business_id, user_id, action, entity, entity_id, after)
  values (v_business_id, v_user, 'create_business', 'business', v_business_id,
          jsonb_build_object('name', btrim(p_name), 'type', p_type, 'reference_code', v_ref));

  v_result := jsonb_build_object('business_id', v_business_id, 'reference_code', v_ref);
  update public.request_log set business_id = v_business_id where request_id = p_request_id and result is null;
  return private.complete_request(p_request_id, v_result);
end;
$$;

-- ---------------------------------------------------------------------------
-- register_device: unique device code per business (06 SY-70)
-- ---------------------------------------------------------------------------
create or replace function public.register_device(
  p_request_id uuid,
  p_business_id uuid,
  p_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_prior jsonb;
  v_count integer;
  v_code text;
  v_device_id uuid;
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not private.is_member(p_business_id) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  v_prior := private.claim_request(p_request_id, 'register_device', p_business_id);
  if v_prior is not null then
    return v_prior;
  end if;

  -- Serialise device registration per business so codes never collide
  perform 1 from public.businesses where id = p_business_id for update;

  select count(*) into v_count from public.devices where business_id = p_business_id;
  v_code := private.device_code(v_count);

  insert into public.devices (business_id, user_id, device_code, label)
  values (p_business_id, v_user, v_code, nullif(btrim(p_label), ''))
  returning id into v_device_id;

  insert into public.audit_log (business_id, user_id, device_id, action, entity, entity_id, after)
  values (p_business_id, v_user, v_device_id, 'register_device', 'device', v_device_id,
          jsonb_build_object('device_code', v_code));

  v_result := jsonb_build_object('device_id', v_device_id, 'device_code', v_code);
  return private.complete_request(p_request_id, v_result);
end;
$$;

revoke all on function public.create_business(uuid, text, text, text, text) from public, anon;
revoke all on function public.register_device(uuid, uuid, text) from public, anon;
grant execute on function public.create_business(uuid, text, text, text, text) to authenticated;
grant execute on function public.register_device(uuid, uuid, text) to authenticated;
