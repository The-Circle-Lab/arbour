@AGENTS.md

# TypeScript rules

Do not use the `as` casting operator anywhere in this repo (this includes `as const`). If a value's type needs narrowing, write a runtime type guard (a function returning `value is T`) and branch on it, or fix the type at its source (e.g. type a function's return value correctly) instead of asserting it downstream.
