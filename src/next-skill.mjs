function shellQuoteArg(value) {
  const text = String(value ?? '');
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`;
}

function clarifyHandoffArg(state) {
  return shellQuoteArg(state.intake_package_path || state.requirements_path || state.spec_artifact_path || state.slug);
}

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
    if (state.handoff_decision === 'needs_spec') {
      return `$spec ${clarifyHandoffArg(state)}`;
    }
    if (state.handoff_decision === 'direct_to_plan') {
      return `$plan2exec ${clarifyHandoffArg(state)}`;
    }
    return null;
  }
  if (state.current_stage === 'done'
    && state.completion_confirmed === true) {
    return '$finish';
  }
  if (state.current_stage === 'review'
    && state.review_verdict === 'request-changes'
    && state.rollback_target === 'plan') {
    return `$plan2exec ${state.slug}`;
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
