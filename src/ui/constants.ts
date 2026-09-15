import { Collection, Bill } from './types';

// Used to seed a new local workspace.
export const INITIAL_COLLECTIONS: Collection[] = [
  { id: 'col_tax_2025', name: '2025 Tax Return', description: 'Expenses deductible for 2025' },
  { id: 'col_trip_ny', name: 'Business Trip', description: 'Reimbursable expenses' },
  { id: 'col_family', name: 'Household', description: 'Shared expenses' },
];

export const MOCK_USER = {
  id: 'u1',
  name: 'Demo User',
  email: 'demo@example.com',
  avatarUrl: 'https://ui-avatars.com/api/?name=Demo'
};

// Seed data is no longer used directly because the Local context loads SQLite records,
// but kept here for reference if needed for testing.
export const SEED_BILLS: Bill[] = [];
