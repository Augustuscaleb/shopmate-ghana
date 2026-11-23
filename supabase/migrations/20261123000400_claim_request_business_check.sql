-- Idempotency fix (09 §4.3): a replayed request ID must belong to the same business.
--
-- Before this migration, private.claim_request (20261111000500_foundation_functions.sql) returned
-- the stored result whenever the same user replayed a request ID for the same function, without
-- comparing the business. An owner who belongs to two shops could therefore reuse a request ID
-- against shop B and receive shop A's earlier result (nothing was written to B, but the caller
-- saw a false "success" carrying shop A's IDs).
--
-- Now a replay is refused with request_id_reused (22023) when the supplied business differs from
-- the stored one. The only exception is create_business replayed with no business: it claims
-- before the shop exists and afterwards sets the row's business_id once, so its retries (always
-- with a null business) must still match. Any other function replayed with a null business against
-- a stored business is refused. Callers and what they pass:
--   create_business                      null  (exempt from the business comparison)
--   register_device, create_product,     always non-null (membership is checked before the claim)
--   update_product, set_product_archived
-- Unchanged: first claims, same-user/same-function/same-business replays, the user and function
-- checks, concurrency (the INSERT ... ON CONFLICT claim), and roll-back of failed requests.
-- Same signature, owner and privileges; the historical migration is not edited.

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
  if v_row.user_id is distinct from auth.uid()
     or v_row.function_name <> p_function
     or (
       not (p_function = 'create_business' and p_business_id is null)
       and v_row.business_id is distinct from p_business_id
     ) then
    raise exception 'request_id_reused' using errcode = '22023';
  end if;
  return v_row.result;
end;
$$;

-- CREATE OR REPLACE keeps the existing privileges; restated so the intent is explicit.
revoke all on function private.claim_request(uuid, text, uuid) from public, anon, authenticated;
