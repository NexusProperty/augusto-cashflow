# Architecture Decision Records - Augusto

This folder records every meaningful architectural decision for this build. Each ADR is immutable once accepted; superseding decisions get a new ADR that explicitly references the old one.

## How to write an ADR

1. Copy `ADR-template.md` to `ADR-NNNN-<short-slug>.md` (NNNN = next number).
2. Fill in Status (`Proposed` to start), Context, Decision, Consequences.
3. Open a PR titled `adr: ADR-NNNN <title>`.
4. On merge, change Status to `ACCEPTED` and date the change.

## Numbering

- 0001+ allocated in commit order. Never reuse a number.
- A superseded ADR keeps its number and gains a `Status: SUPERSEDED by ADR-NNNN` line.

## Index

| # | Title | Status |
|---|---|---|
| _Add rows as ADRs land._ | | |
