import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function applyReference(repoDir) {
  await writeFile(join(repoDir, 'src/runner.mjs'), `export class JobRunner {
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
      throw new Error(\`job \${id} not pending\`);
    }
    job.status = 'running';
    job.version += 1;
    const expectedVersion = job.version;

    const result = await workFn();

    if (job.status !== 'running' || job.version !== expectedVersion) {
      return job;
    }
    job.status = 'completed';
    job.version += 1;
    job.result = result;
    this.finalize(job);
    return job;
  }

  cancel(id) {
    const job = this.jobs.get(id);
    if (!job) throw new Error(\`unknown job \${id}\`);
    if (job.status === 'completed') {
      throw new Error(\`cannot cancel completed job \${id}\`);
    }
    job.status = 'cancelled';
    job.cancelledAt = Date.now();
    job.version += 1;
    return job;
  }

  finalize(job) {
    if (job.cancelledAt) {
      throw new Error(\`Consumer failure: cannot finalize cancelled job \${job.id}\`);
    }
    this.finalized.push(job.id);
  }
}
`);
}
