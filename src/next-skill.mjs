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
    && typeof state.clarify_ambiguity_score === 'number'
    && typeof state.clarify_target_ambiguity_threshold === 'number'
    && state.clarify_ambiguity_score <= state.clarify_target_ambiguity_threshold) {
    return `$plan ${state.slug}`;
  }
  if (state.current_stage === 'done'
    && state.completion_confirmed === true
    && state.archive_status !== 'archived') {
    return `$archive ${state.slug}`;
  }
  if (state.stage_status !== 'awaiting-approval') {
    return null;
  }
  if (state.current_stage === 'plan' && Array.isArray(state.plan_blockers) && state.plan_blockers.length === 0) {
    return `$build .loopx/plans/prd-${state.slug}.md`;
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
    && state.requested_transition === 'review->build'
    && state.approval?.build === 'approved') {
    return `$build .loopx/plans/prd-${state.slug}.md`;
  }
  if (state.current_stage === 'review'
    && state.review_verdict === 'request-changes'
    && state.requested_transition === 'review->plan'
    && state.approval?.rollback === 'approved') {
    return `$plan ${state.slug}`;
  }
  if (state.current_stage === 'review'
    && state.review_verdict === 'request-changes'
    && state.requested_transition === 'review->clarify'
    && state.approval?.rollback === 'approved') {
    return `$clarify ${state.slug}`;
  }
  return null;
}

export function nextSkillHint(state) {
  const command = nextSkillCommand(state);
  if (!command) {
    return null;
  }
  return `Next: ${command}`;
}

export function withNextSkill(payload, state) {
  const nextCommand = nextSkillCommand(state);
  const nextHint = nextSkillHint(state);
  return {
    ...payload,
    next_skill_command: nextCommand,
    next_skill_hint: nextHint,
  };
}
