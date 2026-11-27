// The session that shows the bug: the player holds right from T = 1/30 and lets go at T = 1/4, standing on the
// first level's exit; at about T = 1 they nudge the cave's roughness slider from 45 to 46; at about T = 1.2 the
// editor saves the glue with no change, and the host rebuilds the cave from it.

import { play } from "./host.js";

/** @param {number} T @param {boolean} right */
const pad = (T, right) => ({ kind: "in", T, part: "game", name: "pad", value: { up: false, down: false, left: false, right } });

/** The scripted pad, in log order. */
export const inputs = () => [pad(1 / 30, true), pad(1 / 4, false)];

/** What the person does in the page, as the host sees it between chunks. */
export const actions = () => [{ T: 1, slider: "roughness", value: 46 }, { T: 1.2, save: true }];

/** Plays the session to T = 1.5 s, the host advancing the run 1/10 s at a time. @param {{ chunk?: { n: number, d: number } }} [o] */
export const session = (o = {}) => play({ inputs: inputs(), actions: actions(), until: 1.5, ...o });
