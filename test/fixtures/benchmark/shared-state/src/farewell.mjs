import { settings } from './settings.mjs';

export function farewell(name) {
  return `${settings.farewell}, ${name}`;
}
