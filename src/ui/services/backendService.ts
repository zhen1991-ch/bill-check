import { Bill, Budget, Category, ChatMessage, Collection } from '../types';

export async function analyzeReceiptImage(_base64Image: string): Promise<Partial<Bill>> {
  return {
    merchantName: 'New receipt',
    date: new Date().toLocaleDateString('en-CA'),
    amount: 0,
    currency: 'EUR',
    category: Category.Other,
    items: [],
    isTaxRelevant: false,
    collectionIds: []
  };
}

export async function chatWithFinancialData(
  query: string,
  _history: ChatMessage[],
  context: { bills: Bill[]; collections: Collection[]; budget: Budget | null; activeCollectionId: string | null }
): Promise<string> {
  const visibleBills = context.activeCollectionId
    ? context.bills.filter(bill => bill.collectionIds.includes(context.activeCollectionId!))
    : context.bills;
  const normalized = query.toLowerCase();
  if (normalized.includes('recurring') || normalized.includes('subscription')) {
    const recurring = visibleBills.filter(bill => bill.recurring && bill.recurring !== 'none');
    return recurring.length
      ? `You have **${recurring.length} recurring bill${recurring.length === 1 ? '' : 's'}**:\n\n${recurring.map(bill => `- ${bill.merchantName}: ${bill.currency} ${bill.amount.toFixed(2)} (${bill.recurring})`).join('\n')}`
      : 'No recurring bills are saved in this Billspace.';
  }
  const totals = visibleBills.reduce<Record<string, number>>((result, bill) => {
    result[bill.currency] = (result[bill.currency] ?? 0) + bill.amount;
    return result;
  }, {});
  const summary = Object.entries(totals).map(([currency, amount]) => `- ${currency} ${amount.toFixed(2)}`).join('\n');
  return `This Local Billspace contains **${visibleBills.length} receipt${visibleBills.length === 1 ? '' : 's'}**.${summary ? `\n\n${summary}` : ''}\n\nFor open-ended agent work, connect your MCP client to BillCheck Local.`;
}
