import { Stack, useLocalSearchParams } from 'expo-router';
import { ExpenseForm } from '@/components/ExpenseForm';
import { Screen } from '@/components/Screen';
import { useExpense } from '@/lib/queries';

export default function NewExpenseScreen() {
  // `from` is set when duplicating: it seeds the form from an existing expense
  // while still creating a new one, so the date resets to today and the FX rate
  // is pinned fresh rather than inherited.
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const template = useExpense(from);

  if (from && template.isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Duplicate expense' }} />
        <Screen loading />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: from ? 'Duplicate expense' : 'New expense' }} />
      <ExpenseForm tripId={id} template={from ? template.data : null} />
    </>
  );
}
