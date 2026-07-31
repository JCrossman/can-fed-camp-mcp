# Contributing

Contributions are welcome under the [MIT license](LICENSE). Participation is
governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

1. Open an issue before a large behavioral change.
2. Fork the repository and branch from `main`.
3. Install Node.js 22 and pnpm 10.34.3, then run `pnpm install --frozen-lockfile`.
4. Make focused changes with offline tests. Do not commit live captures,
   credentials, cookies, personal data, or generated packages.
5. Run `pnpm check:pii && pnpm -r build && pnpm -r test`.
6. Open a pull request explaining behavior and privacy/security effects.

The Open State
[Constitution](https://github.com/JCrossman/the-open-state/blob/main/CONSTITUTION.md)
is a binding design constraint. In particular, the model cannot approve a
consequential action, payment must remain with the citizen, and credentials must
stay on the citizen's device. Report vulnerabilities privately as described in
[`SECURITY.md`](SECURITY.md), not in an issue.
