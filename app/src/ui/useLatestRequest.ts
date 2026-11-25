/** One LatestRequest guard per mounted screen (rules in lib/latestRequest.ts). */
import { useRef } from 'react';
import { LatestRequest } from '../lib/latestRequest';

export function useLatestRequest(): LatestRequest {
  const guard = useRef<LatestRequest | null>(null);
  if (guard.current === null) guard.current = new LatestRequest();
  return guard.current;
}
