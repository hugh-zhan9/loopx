export function formatPrice(cents) {
  var dollars = '' + Math.floor(cents / 100);
  var rem = '' + (cents - Math.floor(cents / 100) * 100);
  if (rem.length === 1) {
    rem = '0' + rem;
  }
  var out = '';
  out = out + '$';
  out = out + dollars;
  out = out + '.';
  out = out + rem;
  return out;
}
