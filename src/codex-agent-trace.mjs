import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function walkJsonl(root) {
  const results = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...await walkJsonl(path));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      results.push(path);
    }
  }
  return results;
}

async function readRollout(path) {
  const records = (await readFile(path, 'utf8')).split(/\r?\n/).flatMap((line) => line.trim() ? [JSON.parse(line)] : []);
  const ids = records
    .filter((record) => record.type === 'session_meta')
    .map((record) => record.payload?.session_id ?? record.payload?.id)
    .filter(Boolean);
  return { path, records, ids };
}

function timestampMs(record) {
  const value = Date.parse(record.timestamp ?? record.payload?.timestamp ?? '');
  return Number.isFinite(value) ? value : null;
}

export async function findCodexRollouts(sessionsRoot, rootThreadId) {
  const rollouts = [];
  for (const path of await walkJsonl(sessionsRoot)) {
    const rollout = await readRollout(path);
    if (rollout.ids.includes(rootThreadId)) {
      rollouts.push(rollout);
    }
  }
  return rollouts;
}

function finalAgentMessage(records) {
  let message = '';
  for (const record of records) {
    const payload = record.payload ?? {};
    if (payload.type === 'task_complete' && typeof payload.last_agent_message === 'string') {
      message = payload.last_agent_message;
    }
    if (record.type === 'response_item' && payload.type === 'agent_message') {
      const candidate = payload.message ?? payload.text ?? payload.content;
      if (typeof candidate === 'string') {
        message = candidate;
      }
    }
  }
  return message;
}

function embeddedLeafMessages(rollouts) {
  const messages = [];
  for (const rollout of rollouts) {
    for (const record of rollout.records) {
      const payload = record.payload ?? {};
      if (record.type !== 'response_item' || payload.type !== 'agent_message' || payload.recipient !== '/root') {
        continue;
      }
      const text = payload.content
        ?.filter((item) => item.type === 'input_text')
        .map((item) => item.text)
        .join('\n') ?? '';
      if (!text) {
        continue;
      }
      messages.push({
        threadId: payload.author ?? null,
        message: text.replace(/^Message Type: FINAL_ANSWER[\s\S]*?Payload:\n/, ''),
        completedAt: timestampMs(record) ?? -Infinity,
      });
    }
  }
  return messages;
}

export function extractCodexLeafFinalMessage(rollouts, rootThreadId) {
  const children = rollouts.filter((rollout) => rollout.ids[0] && rollout.ids[0] !== rootThreadId);
  const completed = [
    ...embeddedLeafMessages(rollouts),
    ...children
    .map((rollout) => ({
      threadId: rollout.ids[0],
      message: finalAgentMessage(rollout.records),
      completedAt: Math.max(
        ...rollout.records
          .filter((record) => record.payload?.type === 'task_complete')
          .map(timestampMs)
          .filter(Number.isFinite),
        -Infinity,
      ),
    }))
    .filter((result) => result.message),
  ];
  completed.sort((left, right) => right.completedAt - left.completedAt);
  return completed[0] ?? { threadId: null, message: '' };
}

export function normalizeCodexRollouts(rollouts, options) {
  const rootThreadId = options.rootThreadId;
  const runId = options.runId ?? rootThreadId;
  const allRecords = rollouts.flatMap((rollout) => rollout.records);
  const times = allRecords.map(timestampMs).filter(Number.isFinite);
  const startedAt = Math.min(...times);
  const endedAt = Math.max(...times);
  const at = (record) => {
    const value = timestampMs(record);
    return value === null ? 0 : value - startedAt;
  };
  const events = [{
    event: 'run_start',
    run_id: runId,
    case_id: options.caseId,
    variant: options.variant,
    model: options.model ?? null,
    reasoning_effort: options.reasoningEffort ?? null,
    platform: 'codex',
    root_thread_id: rootThreadId,
    at_ms: 0,
  }];

  const childParents = new Map();
  for (const record of allRecords) {
    const payload = record.payload ?? {};
    if (payload.type === 'sub_agent_activity' && payload.kind === 'started' && payload.agent_thread_id) {
      const parentRollout = rollouts.find((rollout) => rollout.records.includes(record));
      const parentId = parentRollout?.ids[0] ?? rootThreadId;
      childParents.set(payload.agent_thread_id, parentId);
      events.push({
        event: 'agent_spawn',
        run_id: runId,
        actor_id: payload.agent_thread_id,
        parent_actor_id: parentId === rootThreadId ? 'controller' : parentId,
        at_ms: at(record),
      });
    }
  }

  let inputTokens = 0;
  let cachedInputTokens = 0;
  let outputTokens = 0;
  let tokenEvidence = false;
  for (const rollout of rollouts) {
    const actorId = rollout.ids[0] ?? rootThreadId;
    let finalUsage = null;
    let completedAt = null;
    for (const record of rollout.records) {
      const payload = record.payload ?? {};
      if (payload.type === 'token_count') {
        finalUsage = payload.info?.total_token_usage ?? finalUsage;
      }
      if (payload.type === 'task_complete') {
        completedAt = at(record);
      }
      if (record.type === 'response_item' && payload.type === 'function_call') {
        if (payload.name === 'wait_agent') {
          events.push({ event: 'agent_wait', run_id: runId, actor_id: actorId === rootThreadId ? 'controller' : actorId, at_ms: at(record) });
        } else if (payload.name !== 'spawn_agent') {
          events.push({ event: 'tool_call', run_id: runId, actor_id: actorId === rootThreadId ? 'controller' : actorId, tool: payload.name, at_ms: at(record) });
        }
      }
      if (record.type === 'response_item' && payload.type === 'custom_tool_call') {
        events.push({ event: 'tool_call', run_id: runId, actor_id: actorId === rootThreadId ? 'controller' : actorId, tool: payload.name, at_ms: at(record) });
      }
    }
    if (finalUsage) {
      tokenEvidence = true;
      inputTokens += finalUsage.input_tokens ?? 0;
      cachedInputTokens += finalUsage.cached_input_tokens ?? 0;
      outputTokens += finalUsage.output_tokens ?? 0;
    }
    if (actorId !== rootThreadId && completedAt !== null) {
      events.push({ event: 'agent_release', run_id: runId, actor_id: actorId, at_ms: completedAt });
    }
  }

  events.push({
    event: 'run_end',
    run_id: runId,
    outcome: allRecords.some((record) => record.payload?.type === 'task_complete') ? 'passed' : 'failed',
    tests_passed: null,
    input_tokens: tokenEvidence ? inputTokens : null,
    cached_input_tokens: tokenEvidence ? cachedInputTokens : null,
    output_tokens: tokenEvidence ? outputTokens : null,
    latency_ms: Number.isFinite(startedAt) && Number.isFinite(endedAt) ? endedAt - startedAt : null,
    at_ms: Number.isFinite(startedAt) && Number.isFinite(endedAt) ? endedAt - startedAt : 0,
  });
  return events.sort((left, right) => left.at_ms - right.at_ms);
}
