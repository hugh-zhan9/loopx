import { normalize } from './normalize.mjs';
import { trim } from './trim.mjs';

// Step order == array order. The pipeline runs steps exactly in this
// sequence; the position of a step decides what shape of data it observes.
export const steps = [trim, normalize];
