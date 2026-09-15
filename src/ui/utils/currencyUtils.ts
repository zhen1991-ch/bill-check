/**
 * Utility functions for currency conversion.
 * Input: Amount, Source Currency, Target Currency
 * Output: Converted Amount
 */
import { Currency } from '../types';

const EXCHANGE_RATES: Record<Currency, number> = {
  USD: 1,
  EUR: 0.95,
  GBP: 0.79,
  CNY: 7.25,
  JPY: 150.0
};

export const convertCurrency = (amount: number, from: string, to: Currency): number => {
  // Default to USD if currency not found (though from should usually be valid)
  const fromRate = EXCHANGE_RATES[from as Currency] || 1; 
  const toRate = EXCHANGE_RATES[to] || 1;

  if (from === to) return amount;

  // Convert to Base (USD) then to Target
  const amountInBase = amount / fromRate;
  return amountInBase * toRate;
};

export const formatCurrency = (amount: number, currency: Currency): string => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
    }).format(amount);
};
