import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Parse a root session JSONL file and its subagent directory into
 * a structured session object consumed by normalizeClaudeSession
 * and extractClaudeLeafFinalMessage.
 */
async function readJsonl(path) {
  const text = await readFile(path, 'utf8');
  return text.split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function timestampMs(record) {
  const value = Date.parse(record.timestamp ?? '');
  return Number.isFinite(value) ? value : null;
}

export async function findClaudeSession(sessionsRoot, sessionId) {
  const rootPath = join(sessionsRoot, `${sessionId}.jsonl`);
  const agentsDir = join(sessionsRoot, sessionId, 'subagents');

  const rootRecords = await readJsonl(rootPath);
  const subagentPaths = [];
  try {
    for (const entry of await readdir(agentsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        subagentPaths.push(join(agentsDir, entry.name));
      }
    }
  } catch {
    // No subagents directory — leaf-only or controller-only session
  }

  const subagentRecords = new Map(); // agentId → records[]
  const agentIdByFile = new Map();
  for (const path of subagentPaths) {
    const records = await readJsonl(path);
    // Derive agentId from filename so we can link it regardless of
    // whether every record carries it on a consistent field.
    const agentId = records.reduce((id, r) => r.agentId ?? id, null)
      ?? path.replace(/.*\/agent-|\.jsonl$/g, '');
    agentIdByFile.set(path, agentId);
    if (!subagentRecords.has(agentId)) {
      subagentRecords.set(agentId, []);
    }
    subagentRecords.get(agentId).push(...records);
  }

  return {
    sessionId,
    rootRecords,
    subagentRecords,
    agentIdByFile,
  };
}

function findAgentSpawns(rootRecords) {
  const spawns = []; // { toolUseId, agentId?, subagentType, prompt, promptId }
  const toolToPromptId = new Map();

  for (const record of rootRecords) {
    const content = record.message?.content;
    if (!Array.isArray(content)) continue;

    for (const item of content) {
      if (item.type === 'tool_use' && item.name === 'Agent') {
        const toolUseId = item.id;
        spawns.push({
          toolUseId,
          agentId: null, // resolved from TaskOutput task_id or Agent tool_result
          subagentType: item.input?.subagent_type ?? 'general-purpose',
          description: item.input?.description ?? '',
          prompt: item.input?.prompt ?? '',
          promptId: record.promptId ?? null,
          timestamp: record.timestamp ?? null,
          // For print mode: tool_result directly contains agent response
          toolResultContent: null,
          toolResultIsError: false,
        });
        toolToPromptId.set(toolUseId, record.promptId ?? null);
      }

      if (item.type === 'tool_use' && item.name === 'TaskOutput') {
        const taskId = item.input?.task_id;
        for (let i = spawns.length - 1; i >= 0; i--) {
          if (!spawns[i].agentId) {
            spawns[i].agentId = taskId;
            spawns[i].taskOutputToolUseId = item.id;
            break;
          }
        }
      }

      if (item.type === 'tool_result') {
        const toolUseId = item.tool_use_id;
        const spawn = spawns.find((s) => s.toolUseId === toolUseId);
        if (spawn) {
          const text = typeof item.content === 'string'
            ? item.content
            : JSON.stringify(item.content ?? '');
          spawn.toolResultContent = text;
          spawn.toolResultIsError = item.is_error === true;
          // Extract agentId from agent result text
          const agentIdMatch = text.match(/agentId:\s*(\S+)/);
          if (agentIdMatch) {
            spawn.agentId = agentIdMatch[1];
          }
          // Extract usage from result text
          const usageMatch = text.match(/subagent_tokens:\s*(\d+)/);
          if (usageMatch) {
            spawn.subagentTokens = parseInt(usageMatch[1], 10);
          }
        }
      }
    }
  }

  return spawns;
}

function toolCallsFromSubagent(records) {
  const events = [];

  for (const record of records) {
    const content = record.message?.content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (item.type === 'tool_use') {
        events.push({
          event: 'tool_call',
          toolName: item.name,
          timestamp: record.timestamp ?? null,
        });
      }
    }
  }

  return events;
}

function extractSubagentFinalText(records) {
  // Walk records in reverse to find the final response from the subagent
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i];
    const content = record.message?.content;

    // If content is a string, that's the final message
    if (typeof content === 'string') return content;

    // If content is an array, collect text blocks
    if (Array.isArray(content)) {
      const texts = content
        .filter((item) => item.type === 'text')
        .map((item) => item.text)
        .join('\n');
      if (texts.trim()) return texts;
    }
  }

  return '';
}

function subagentUsage(records) {
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let outputTokens = 0;
  let found = false;

  for (const record of records) {
    const usage = record.message?.usage;
    if (!usage) continue;
    found = true;
    inputTokens += usage.input_tokens ?? 0;
    cachedInputTokens += (usage.cache_creation_input_tokens ?? usage.cache_read_input_tokens ?? 0);
    outputTokens += usage.output_tokens ?? 0;
  }

  return found ? { inputTokens, cachedInputTokens, outputTokens } : null;
}

function subagentModel(records) {
  for (const record of records) {
    const model = record.message?.model;
    if (model) return model;
  }
  return null;
}

export function normalizeClaudeSession(session, options = {}) {
  const { sessionId } = session;
  const runId = options.runId ?? sessionId;
  const caseId = options.caseId ?? 'unknown';
  const variant = options.variant ?? 'unknown';
  const model = options.model ?? null;
  const reasoningEffort = options.reasoningEffort ?? null;
  const platform = 'claude';

  // Collect all timestamps to compute at_ms offsets
  const times = session.rootRecords.map(timestampMs).filter(Number.isFinite);
  for (const [, records] of session.subagentRecords) {
    times.push(...records.map(timestampMs).filter(Number.isFinite));
  }
  const startedAt = times.length > 0 ? Math.min(...times) : Date.now();
  const at = (record) => {
    const t = timestampMs(record);
    return t === null ? 0 : t - startedAt;
  };

  const events = [];
  let firstRecord = session.rootRecords[0];

  events.push({
    event: 'run_start',
    run_id: runId,
    case_id: caseId,
    variant,
    model,
    reasoning_effort: reasoningEffort,
    platform,
    root_thread_id: sessionId,
    at_ms: 0,
  });

  // Map Agent spawns → agent_spawn events
  const spawns = findAgentSpawns(session.rootRecords);
  const spawnedAgentIds = new Set();
  const failedAgentIds = new Set();
  const spawnedAgentWithUsage = new Map(); // agentId → { tokens, tool_uses }

  // Identify failed agents from spawn tool results and extract usage
  for (const spawn of spawns) {
    if (spawn.agentId && spawn.toolResultContent) {
      if (spawn.toolResultIsError || /400|Error from provider|Upstream request failed/i.test(spawn.toolResultContent)) {
        failedAgentIds.add(spawn.agentId);
      }
      // Extract usage from result text
      const usageMatch = spawn.toolResultContent.match(/subagent_tokens:\s*(\d+)/);
      if (usageMatch) {
        spawnedAgentWithUsage.set(spawn.agentId, {
          tokens: parseInt(usageMatch[1], 10),
          toolUses: parseInt(spawn.toolResultContent.match(/tool_uses:\s*(\d+)/)?.[1] ?? '0', 10),
        });
      }
    }
  }

  // Identify failed agents from spawn tool results
  for (const spawn of spawns) {
    if (spawn.agentId && spawn.toolResultContent) {
      if (spawn.toolResultIsError || /400|Error from provider|Upstream request failed/i.test(spawn.toolResultContent)) {
        failedAgentIds.add(spawn.agentId);
      }
    }
  }

  // Also check root tool_result-based errors for TaskOutput-based spawns
  for (const record of session.rootRecords) {
    const content = record.message?.content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (item.type === 'tool_result') {
        const text = typeof item.content === 'string'
          ? item.content
          : JSON.stringify(item.content ?? '');
        if (/400|Error from provider|Upstream request failed/i.test(text)) {
          const toolUseId = item.tool_use_id;
          const spawn = spawns.find(
            (s) => s.taskOutputToolUseId === toolUseId
          );
          if (spawn?.agentId) {
            failedAgentIds.add(spawn.agentId);
          }
        }
      }
    }
  }

  for (const spawn of spawns) {
    const agentId = spawn.agentId;
    if (!agentId) continue;
    spawnedAgentIds.add(agentId);

    // Find the spawning record's timestamp
    const spawnRecord = session.rootRecords.find(
      (r) => Array.isArray(r.message?.content) && r.message.content.some(
        (c) => c.type === 'tool_use' && c.id === spawn.toolUseId
      )
    );

    const isFailed = failedAgentIds.has(agentId);

    // For replacement detection: label parent of this spawn
    // If a previous spawn for the same description already existed and failed,
    // the parent is still 'controller' — Claude handles replacements at
    // the controller level, not nested
    events.push({
      event: 'agent_spawn',
      run_id: runId,
      actor_id: agentId,
      parent_actor_id: 'controller',
      at_ms: spawnRecord ? at(spawnRecord) : 0,
      subagent_type: spawn.subagentType,
      description: spawn.description,
      is_failed: isFailed,
    });

    // Emit agent_end for failed agents (they didn't complete naturally)
    if (isFailed) {
      events.push({
        event: 'agent_end',
        run_id: runId,
        actor_id: agentId,
        at_ms: (spawnRecord ? at(spawnRecord) : 0) + 1,
        outcome: 'failed',
      });
    }
  }

  // Find TaskOutput waits
  for (const record of session.rootRecords) {
    const content = record.message?.content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (item.type === 'tool_use' && item.name === 'TaskOutput') {
        const taskId = item.input?.task_id;
        if (taskId && spawnedAgentIds.has(taskId)) {
          events.push({
            event: 'agent_wait',
            run_id: runId,
            actor_id: 'controller',
            target_actor_id: taskId,
            at_ms: at(record),
          });
        }
      }
    }
  }

  // Subagent records: tool_calls, usage, final message, release
  let totalInputTokens = 0;
  let totalCachedInputTokens = 0;
  let totalOutputTokens = 0;
  let tokenEvidence = false;

  for (const [agentId, records] of session.subagentRecords) {
    if (failedAgentIds.has(agentId)) continue;

    // Tool calls
    for (const tc of toolCallsFromSubagent(records)) {
      events.push({
        event: 'tool_call',
        run_id: runId,
        actor_id: agentId,
        tool: tc.toolName,
        at_ms: tc.timestamp ? (Date.parse(tc.timestamp) - startedAt) : 0,
      });
    }

    // Usage
    const usage = subagentUsage(records);
    if (usage) {
      tokenEvidence = true;
      totalInputTokens += usage.inputTokens;
      totalCachedInputTokens += usage.cachedInputTokens;
      totalOutputTokens += usage.outputTokens;
    }

    // Agent release — last record timestamp
    const lastRecord = records.reduce((latest, r) => {
      const t = timestampMs(r);
      return t && t > (latest.t ?? 0) ? { t, r } : latest;
    }, { t: 0, r: null });
    if (lastRecord.r) {
      events.push({
        event: 'agent_release',
        run_id: runId,
        actor_id: agentId,
        at_ms: lastRecord.t - startedAt,
      });
    }
  }

  // Root tool calls (non-Agent, non-TaskOutput)
  for (const record of session.rootRecords) {
    const content = record.message?.content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (item.type === 'tool_use' && item.name !== 'Agent' && item.name !== 'TaskOutput') {
        events.push({
          event: 'tool_call',
          run_id: runId,
          actor_id: 'controller',
          tool: item.name,
          at_ms: at(record),
        });
      }
    }
  }

  // Determine outcome
  const anyFailed = failedAgentIds.size > 0;
  const completedAgents = [...session.subagentRecords.keys()]
    .filter((id) => !failedAgentIds.has(id));

  // For print mode: check if any spawn's tool_result has content
  const printModeHasContent = spawns.some((s) => {
    if (s.toolResultContent && !failedAgentIds.has(s.agentId)) {
      try {
        const parsed = JSON.parse(s.toolResultContent);
        if (Array.isArray(parsed)) {
          return parsed.some((item) => item.type === 'text' && item.text.trim() && !item.text.includes('agentId:'));
        }
      } catch {
        return s.toolResultContent.trim().length > 0;
      }
    }
    return false;
  });

  // A successful run has at least one non-failed subagent that returned content
  const hasContent = printModeHasContent || completedAgents.some((id) =>
    extractSubagentFinalText(session.subagentRecords.get(id)).trim()
  );
  const outcome = hasContent ? 'passed' : (anyFailed ? 'failed' : 'passed');
  const endedAt = times.length > 0 ? Math.max(...times) : startedAt;

  events.push({
    event: 'run_end',
    run_id: runId,
    outcome,
    tests_passed: null,
    input_tokens: tokenEvidence ? totalInputTokens : null,
    cached_input_tokens: tokenEvidence ? totalCachedInputTokens : null,
    output_tokens: tokenEvidence ? totalOutputTokens : null,
    latency_ms: endedAt - startedAt,
    at_ms: endedAt - startedAt,
  });

  return events.sort((a, b) => a.at_ms - b.at_ms);
}

export function extractClaudeLeafFinalMessage(session) {
  const spawns = findAgentSpawns(session.rootRecords);

  // Walk spawns in reverse to find the last successful one
  for (let i = spawns.length - 1; i >= 0; i--) {
    const spawn = spawns[i];
    if (!spawn.agentId) continue;

    // Priority 1: Agent tool_result content (most reliable for -p/print mode).
    // The tool_result is a JSON array [{"type":"text","text":"..."}, ...] where
    // the first text entry is the subagent's actual response.
    if (spawn.toolResultContent && !spawn.toolResultIsError
        && !/400|Error from provider|Upstream request failed/i.test(spawn.toolResultContent)) {
      try {
        const parsed = JSON.parse(spawn.toolResultContent);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item.type === 'text') {
              const t = item.text;
              // Skip metadata items (agentId, usage, and the launch notification)
              if (t.includes('agentId:') && t.includes('subagent_tokens')) continue;
              if (/^Async agent launched/i.test(t)) continue;
              if (t.trim()) {
                return { threadId: spawn.agentId, message: t.trim() };
              }
            }
          }
        }
      } catch { /* fall through */ }
    }

    // Priority 2: subagent trace file (for interactive/safe mode Agent)
    const records = session.subagentRecords.get(spawn.agentId);
    if (records) {
      const message = extractSubagentFinalText(records);
      if (message.trim()) {
        return { threadId: spawn.agentId, message };
      }
    }

    // Priority 3: TaskOutput tool_result content (for background Task mode)
    const taskOutputToolUseId = spawn.taskOutputToolUseId;
    if (taskOutputToolUseId) {
      const result = (() => {
        for (const record of session.rootRecords) {
          const content = record.message?.content;
          if (!Array.isArray(content)) continue;
          for (const item of content) {
            if (item.type === 'tool_result' && item.tool_use_id === taskOutputToolUseId) {
              return {
                rawContent: typeof item.content === 'string' ? item.content : JSON.stringify(item.content ?? ''),
                isError: item.is_error === true,
              };
            }
          }
        }
        return null;
      })();
      if (result?.isError) continue;
      if (result && /400|Error from provider|Upstream request failed/i.test(result.rawContent)) continue;
      // Attempt to extract from TaskOutput content
      if (result?.rawContent) {
        const m = result.rawContent.match(/<output>([\s\S]*?)<\/output>/i);
        if (m && m[1].trim()) {
          return { threadId: spawn.agentId, message: m[1].trim() };
        }
      }
    }
  }

  return { threadId: null, message: '' };
}
