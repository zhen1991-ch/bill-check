
import { Bill } from '../types';

// Helper to get local date string YYYY-MM-DD
const getLocalDateString = () => {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return (new Date(d.getTime() - offset)).toISOString().slice(0, 10);
};

/**
 * A recurring occurrence must have the same document ID no matter which
 * signed-in member notices that it is due. Random IDs made simultaneous
 * clients create separate copies for the same occurrence.
 */
export const getRecurringInstanceId = (parentBillId: string, dueDate: string): string => {
  return `rec_${encodeURIComponent(parentBillId)}_${dueDate.replace(/-/g, '')}`;
};

// Helper to calculate next date
export const calculateNextDate = (dateStr: string, frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'): string => {
  const date = new Date(dateStr);
  // Fix: Treat input as noon to avoid timezone shifting on setMonth rollover
  date.setHours(12, 0, 0, 0);

  if (frequency === 'daily') {
    date.setDate(date.getDate() + 1);
  } else if (frequency === 'weekly') {
    date.setDate(date.getDate() + 7);
  } else if (frequency === 'monthly') {
    date.setMonth(date.getMonth() + 1);
  } else if (frequency === 'yearly') {
    date.setFullYear(date.getFullYear() + 1);
  }
  return date.toISOString().split('T')[0];
};

/** Returns the overdue occurrence date for a master bill, if it has one. */
export const getDueRecurringDate = (bill: Bill): string | null => {
  if (!bill.recurring || bill.recurring === 'none' || bill.parentBillId) {
    return null;
  }

  const nextDate = bill.nextRecurringDate || calculateNextDate(bill.date, bill.recurring);
  return nextDate <= getLocalDateString() ? nextDate : null;
};

/**
 * Generates retroactive bill copies from a past date up to today.
 * Returns the list of new bills to create and the computed next due date.
 */
export const generateRetroactiveBills = (baseBill: Bill, frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'): { retroactiveBills: Bill[], nextDueDate: string } => {
  // Use local date for 'today' to ensure we don't miss bills due to UTC lag
  const today = getLocalDateString();
  const retroactiveBills: Bill[] = [];

  let currentDate = calculateNextDate(baseBill.date, frequency);

  // While the calculated date is still in the past or today
  while (currentDate <= today) {
    const newBill: Bill = {
      ...baseBill,
      id: getRecurringInstanceId(baseBill.id, currentDate),
      date: currentDate,
      createdAt: Date.now(),
      recurring: 'none', // The copies are not recurring themselves
      parentBillId: baseBill.id,
      nextRecurringDate: null
    };
    retroactiveBills.push(newBill);

    // Move to next interval
    currentDate = calculateNextDate(currentDate, frequency);
  }

  return { retroactiveBills, nextDueDate: currentDate };
};
