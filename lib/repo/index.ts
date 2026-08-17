/**
 * The data access layer.
 *
 * Every Supabase call in this app lives behind this barrel. No component
 * imports `@/lib/supabase` directly — that rule is what keeps the storage
 * layer swappable and the business logic testable without a network.
 *
 *   repo.trips.list()
 *   repo.expenses.create(...)
 *   repo.balances.forTrip(tripId)
 */

import { authRepo } from './auth';
import { balancesRepo } from './balances';
import { currenciesRepo } from './currencies';
import { expensesRepo } from './expenses';
import { fxRepo } from './fx';
import { membersRepo } from './members';
import { profileRepo } from './profile';
import { settlementsRepo } from './settlements';
import { tripsRepo } from './trips';

export const repo = {
  auth: authRepo,
  balances: balancesRepo,
  currencies: currenciesRepo,
  expenses: expensesRepo,
  fx: fxRepo,
  members: membersRepo,
  profile: profileRepo,
  settlements: settlementsRepo,
  trips: tripsRepo,
};

export type Repo = typeof repo;

export type { TripSummary } from './trips';
export type { TripPreview } from './members';
export type { ExpenseWriteInput, ExpenseSplitInput } from './expenses';
export type { AuthSession, AuthUser } from './auth';
