-- Fix: deleting a trip failed with
--   update or delete on table "trip_members" violates foreign key constraint
--   "expense_splits_member_id_fkey" on table "expense_splits"
--
-- `trip_members` cascades from `trips`, but expenses, splits and settlements
-- all reference `trip_members` with no ON DELETE behaviour. Deleting a trip
-- therefore tried to remove the member rows while other rows in the same trip
-- still pointed at them, and the whole delete aborted.
--
-- Cascading is the correct behaviour here: every one of these rows belongs to
-- the trip being deleted, so none of them can outlive it.
--
-- This does NOT weaken the soft-delete rule for expenses. Expenses still have
-- no DELETE policy, so no client can remove one; this only governs what happens
-- when the whole trip goes, which only an owner can do.
--
-- Hard-deleting a single member who already has splits still fails, and should:
-- the cascade would remove their share rows, and the deferred balance trigger
-- would then find the expense no longer adding up and reject the transaction.
-- Members are removed with `removed_at`, not DELETE.

alter table public.expenses
  drop constraint expenses_paid_by_fkey,
  add constraint expenses_paid_by_fkey
    foreign key (paid_by) references public.trip_members (id) on delete cascade;

alter table public.expense_splits
  drop constraint expense_splits_member_id_fkey,
  add constraint expense_splits_member_id_fkey
    foreign key (member_id) references public.trip_members (id) on delete cascade;

alter table public.settlements
  drop constraint settlements_from_member_fkey,
  add constraint settlements_from_member_fkey
    foreign key (from_member) references public.trip_members (id) on delete cascade;

alter table public.settlements
  drop constraint settlements_to_member_fkey,
  add constraint settlements_to_member_fkey
    foreign key (to_member) references public.trip_members (id) on delete cascade;
