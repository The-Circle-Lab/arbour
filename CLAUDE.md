@AGENTS.md

# TypeScript rules

Do not use the `as` casting operator anywhere in this repo (this includes `as const`). If a value's type needs narrowing, write a runtime type guard (a function returning `value is T`) and branch on it, or fix the type at its source (e.g. type a function's return value correctly) instead of asserting it downstream.

Do not use the non-null assertion operator (`!`) unless there is genuinely no other way to satisfy the type checker. Prefer an explicit runtime check that narrows the type through control flow instead — e.g. `if (!row) throw new Error(...)` when a value is structurally guaranteed but TypeScript can't see it (such as after an upsert's `RETURNING`), or a proper guard/early-return when it isn't guaranteed at all. Only reach for `!` when a runtime check would be genuine dead code with no way to express the invariant otherwise.
