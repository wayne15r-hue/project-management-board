begin;

-- Read ownership from the row being checked so INSERT ... RETURNING can see
-- a new board before a STABLE helper's query can see it in the table.
-- Keep team lookup inside the SECURITY DEFINER helper: an inline board_teams
-- query can recurse through its policies back into boards (including deployed
-- policy variants with an incorrectly correlated id).
alter policy "Board select" on public.boards
  using (owner_id = auth.uid() or public.user_has_board_access(id));

commit;
