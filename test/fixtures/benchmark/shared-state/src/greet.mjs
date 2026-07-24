import { settings } from './settings.mjs';

export function greet(name) {
  return `${settings.greeting}, ${name}`;
}
