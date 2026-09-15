export const CLOUD_EDITIONS_ENABLED = false;

export class CloudApiError extends Error {
  code?: string;
  status?: number;
}

export async function downloadOriginals(_workspaceId?: string, _billIds?: string[]): Promise<never> {
  throw new CloudApiError('Cloud downloads are unavailable in the Local edition.');
}
