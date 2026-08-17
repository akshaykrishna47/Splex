import { Stack, useLocalSearchParams } from 'expo-router';
import { ExpenseForm } from '@/components/ExpenseForm';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/ui/Text';
import { useExpense } from '@/lib/queries';

export default function EditExpenseScreen() {
  const { id, expenseId } = useLocalSearchParams<{ id: string; expenseId: string }>();
  const expense = useExpense(expenseId);

  if (expense.isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Edit expense' }} />
        <Screen loading />
      </>
    );
  }

  if (!expense.data || expense.data.deleted_at) {
    return (
      <>
        <Stack.Screen options={{ title: 'Edit expense' }} />
        <Screen>
          <Text variant="heading">This expense is no longer here</Text>
          <Text variant="body" tone="muted">
            It was deleted. Balances were recalculated without it.
          </Text>
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Edit expense' }} />
      {/* Same component as the create screen — one form, two entry points. */}
      <ExpenseForm tripId={id} expense={expense.data} />
    </>
  );
}
