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
  if (state.current_stage === 'review'
    && state.review_verdict === 'request-changes'
    && state.rollback_target === 'plan') {
    return `$plan-to-exec ${state.slug}`;
  }
  if (state.current_stage === 'review'
    && state.review_verdict === 'request-changes'
    && state.rollback_target === 'clarify') {
    return `$clarify ${state.slug}`;
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

export function withNextSkill(payload, state) {
  const nextCommand = nextSkillCommand(state);
  return {
    ...payload,
    next_skill_command: nextCommand,
    next_skill_hint: nextCommand ? `Next skill: ${nextCommand}` : null,
  };
}
