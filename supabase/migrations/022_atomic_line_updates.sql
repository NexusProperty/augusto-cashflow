-- Migration 022 — Atomic batched forecast_line amount updates
--
-- updateLineAmounts (app/(app)/forecast/actions.ts) previously issued one
-- UPDATE per row in a JS loop. If the 47th of 50 failed, rows 1–46 were
-- committed and the client reverted ALL of them (because the grid doesn't
-- know which half committed). Result: user sees their optimistic edits
-- disappear even for cells the server successfully saved.
--
-- This RPC performs all updates in a single statement inside an implicit
-- transaction. Either every row updates, or none do, and the action returns
-- a single error.

begin;

create or replace function update_forecast_line_amounts(
  p_updates jsonb
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_updated integer := 0;
begin
  if jsonb_typeof(p_updates) is distinct from 'array'
     or jsonb_array_length(p_updates) = 0 then
    return jsonb_build_object('updated', 0);
  end if;

  with input as (
    select
      (elem->>'id')::uuid as id,
      (elem->>'amount')::numeric as amount
    from jsonb_array_elements(p_updates) as elem
  )
  update forecast_lines fl
     set amount = input.amount,
         updated_at = now()
    from input
   where fl.id = input.id;

  get diagnostics v_updated = row_count;
  return jsonb_build_object('updated', v_updated);
end;
$$;

grant execute on function update_forecast_line_amounts(jsonb) to authenticated;

commit;
