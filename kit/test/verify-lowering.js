// Preloaded by `npm test` and `npm run test:prerelease` (`--import`): every kernel lowered
// under test goes through the IR verifier, so a broken invariant fails the test that made it.
import { switches } from "../lower/index.js";

switches.verify = true;
