// Simulated async job scheduler with a subtle non-atomic status transition bug.
// Consumer throws "Cannot finalize cancelled job" even though the real bug is
// that dispatch() overwrites a concurrent cancel() after awaiting work.

export class JobRunner {
  constructor() {
    this.jobs = new Map();
    this.finalized = [];
  }

  enqueue(id) {
    this.jobs.set(id, { id, status: 'pending', version: 0 });
  }

  async run(id, workFn) {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'pending') {
      throw new Error(`job ${id} not pending`);
    }
    job.status = 'running';
    job.version += 1;

    const result = await workFn();

    // BUG: Blindly transitions to 'completed' without checking whether cancel()
    // transitioned the job while workFn() was in flight.
    job.status = 'completed';
    job.result = result;
    this.finalize(job);
    return job;
  }

  cancel(id) {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`unknown job ${id}`);
    if (job.status === 'completed') {
      throw new Error(`cannot cancel completed job ${id}`);
    }
    job.status = 'cancelled';
    job.cancelledAt = Date.now();
    job.version += 1;
    return job;
  }

  finalize(job) {
    if (job.cancelledAt) {
      throw new Error(`Consumer failure: cannot finalize cancelled job ${job.id}`);
    }
    this.finalized.push(job.id);
  }
}
