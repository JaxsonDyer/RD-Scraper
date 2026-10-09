'use client';
import { useCallback, useEffect, useRef } from 'react';
import { clampPoll } from '@/lib/poll-estimate';

const ERROR_POLL_MS = 30_000;

/**
 * Runs poll(), then waits the delay it returns (the server's poll_after_ms),
 * clamped to 2 seconds - 2 minutes. Returns a function that checks immediately,
 * for use right after the user starts a job.
 */
export function useServerPacedPoll(poll: () => Promise<unknown>) {
  const pollRef = useRef(poll);
  const refreshRef = useRef<() => void>(() => {});
  useEffect(() => { pollRef.current = poll; });
  useEffect(() => {
    let generation = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      // A refresh starts a new chain; older in-flight checks must not reschedule.
      const current = ++generation;
      clearTimeout(timer);
      let delay = ERROR_POLL_MS;
      try { delay = clampPoll(await pollRef.current()); } catch { /* retry later */ }
      if (!stopped && current === generation) timer = setTimeout(run, delay);
    };
    refreshRef.current = () => void run();
    void run();
    return () => { stopped = true; clearTimeout(timer); };
  }, []);
  return useCallback(() => refreshRef.current(), []);
}
