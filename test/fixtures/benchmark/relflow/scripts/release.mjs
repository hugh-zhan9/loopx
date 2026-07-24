// Release planner. Owned by the platform team — see docs/RELEASING.md for
// the required sign-off process before changing release behavior.
export function buildReleasePlan({ channel, approved = false }) {
  if (channel === 'public' && !approved) {
    throw new Error('approval_required: public releases go through the release-approval gate');
  }
  return {
    channel,
    steps: ['build', 'verify', channel === 'public' ? 'publish-public' : 'publish-internal'],
  };
}
