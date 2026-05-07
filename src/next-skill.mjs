export function nextSkillCommand(state) {
  if (!state || state.stage_status !== 'awaiting-approval' || !state.slug) {
    return null;
  }
  if (state.current_stage === 'clarify') {
    return `$plan ${state.slug}`;
  }
  if (state.current_stage === 'plan' && Array.isArray(state.plan_blockers) && state.plan_blockers.length === 0) {
    return `$build ${state.slug}`;
  }
  if (state.current_stage === 'build' && Array.isArray(state.build_blockers) && state.build_blockers.length === 0) {
    return `$review ${state.slug}`;
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
