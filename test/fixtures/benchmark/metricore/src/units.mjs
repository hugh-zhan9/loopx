// Human formatting for millisecond durations.
export function formatDuration(ms) {
  if (typeof ms !== 'number' || !isFinite(ms)) {
    throw new RangeError('duration must be a finite number of milliseconds');
  }
  if (ms < 0) {
    return '-' + formatDuration(-ms);
  }
  if (ms < 1000) {
    return Math.round(ms) + 'ms';
  }
  if (ms < 60000) {
    var tenths = Math.round(ms / 100) / 10;
    return tenths + 's';
  }
  if (ms < 3600000) {
    var minutes = Math.floor(ms / 60000);
    var seconds = Math.floor((ms % 60000) / 1000);
    return minutes + 'm' + seconds + 's';
  }
  var hours = Math.floor(ms / 3600000);
  var mins = Math.round((ms % 3600000) / 60000);
  return hours + 'h' + mins + 'm';
}
