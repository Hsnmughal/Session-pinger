import {createSessionPing} from './mod.ts';
import type {ModLike} from './types.ts';

// Command Code calls this factory with its full `ModApi`; `ModLike` is the exact
// subset this mod touches, so nothing here depends on `@commandcode/harness` at
// runtime or at typecheck time. jiti compiles the TypeScript at load time, so
// there is no build step.
export default function (cmd: ModLike): void {
	createSessionPing(cmd, {env: process.env});
}
