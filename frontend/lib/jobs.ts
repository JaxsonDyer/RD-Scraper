export async function queueJob(endpoint: string, payload: Record<string, unknown> = {}) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not queue the job.');
  return data.id as string;
}
export async function waitForJob<T>(id: string): Promise<T> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const response = await fetch(`/api/jobs/${encodeURIComponent(id)}`);
    const job = await response.json();
    if (!response.ok) throw new Error(job.error || 'Could not read job status.');
    if (job.status === 'success') return job.result as T;
    if (job.status === 'error') throw new Error(job.error || 'The job failed.');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('The job is still queued or running. Check its status in Manager.');
}
