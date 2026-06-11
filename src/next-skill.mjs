export function nextSkillCommand(state) {
  if (!state || !state.slug) {
    return null;
  }
  if (state.current_stage === 'clarify'
    && state.clarify_current_round > 0
    && state.unresolved_ambiguity_count === 0
    && state.clarify_non_goals_resolved === true
    && state.clarify_decision_boundaries_resolved === true
    && state.clarify_pressure_pass_complete === true
  ) {
    return `$plan-to-exec ${state.slug}`;
  }
  if (state.current_stage === 'done'
    && state.completion_confirmed === true) {
    return '$finish';
  }
  if (state.stage_status !== 'awaiting-approval') {
    return null;
  }
  if (state.current_stage === 'plan' && Array.isArray(state.plan_blockers) && state.plan_blockers.length === 0) {
    return `$subagent-exec .loopx/plans/requirements-snapshot-${state.slug}.md`;
  }
  if (state.current_stage === 'build'
    && state.stage_status === 'awaiting-approval'
    && state.pending_user_decision === 'build->review'
    && state.review_status === 'ready-for-review'
    && state.execution_record_status === 'complete'
    && Array.isArray(state.build_blockers)
    && state.build_blockers.length === 0) {
    return `$review .loopx/workflows/${state.slug}/execution-record.md`;
  }
  if (state.current_stage === 'review'
    && state.review_verdict === 'request-changes'
    && state.rollback_target === 'build'
    && (
      state.pending_user_decision === 'review->build'
      || state.requested_transition === 'review->build'
      || state.approval?.build === 'requested'
      || state.approval?.build === 'approved'
    )) {
    return null;
  }
  if (state.current_stage === 'review'
    && state.review_verdict === 'request-changes'
    && state.requested_transition === 'review->build'
    && state.approval?.build === 'approved') {
    return null;
  }
  if (state.current_stage === 'review'
    && state.review_verdict === 'request-changes'
    && state.requested_transition === 'review->plan'
    && state.approval?.rollback === 'approved') {
    return `$plan-to-exec ${state.slug}`;
  }
  if (state.current_stage === 'review'
    && state.review_verdict === 'request-changes'
    && state.requested_transition === 'review->clarify'
    && state.approval?.rollback === 'approved') {
    return `$clarify ${state.slug}`;
  }
  return null;
}

export function nextCliCommand(state) {
  if (!state || !state.slug) {
    return null;
  }
  if (state.stage_status === 'awaiting-approval'
    && state.current_stage === 'plan'
    && Array.isArray(state.plan_blockers)
    && state.plan_blockers.length === 0) {
    return `loopx build .loopx/plans/requirements-snapshot-${state.slug}.md`;
  }
  if (state.current_stage === 'review'
    && state.review_verdict === 'approve'
    && state.pending_user_decision === 'review->done'
    && ['requested', 'approved'].includes(state.approval?.complete)) {
    return `loopx approve ${state.slug} --from review --to done`;
  }
  if (state.current_stage === 'review'
    && state.review_verdict === 'request-changes'
    && state.rollback_target === 'build'
    && (
      state.pending_user_decision === 'review->build'
      || state.requested_transition === 'review->build'
      || state.approval?.build === 'requested'
      || state.approval?.build === 'approved'
    )) {
    return `loopx build --from-review .loopx/workflows/${state.slug}/review-report.md`;
  }
  if (state.current_stage === 'review'
    && state.review_verdict === 'request-changes'
    && state.requested_transition === 'review->build'
    && state.approval?.build === 'approved') {
    return `loopx build --from-review .loopx/workflows/${state.slug}/review-report.md`;
  }
  return null;
}

export function nextSkillHint(state) {
  const command = nextSkillCommand(state);
  if (!command) {
    return null;
  }
  return `Next skill: ${command}`;
}

export function nextCliHint(state) {
  const command = nextCliCommand(state);
  if (!command) {
    return null;
  }
  return `Next CLI: ${command}`;
}

export function withNextSkill(payload, state) {
  const nextCommand = nextSkillCommand(state);
  const nextHint = nextSkillHint(state);
  const cliCommand = nextCliCommand(state);
  const cliHint = nextCliHint(state);
  return {
    ...payload,
    next_skill_command: nextCommand,
    next_skill_hint: nextHint,
    next_cli_command: cliCommand,
    next_cli_hint: cliHint,
  };
}
