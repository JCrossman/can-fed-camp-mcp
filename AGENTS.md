# AGENTS.md

This repository is **Open State: Camping** — a local MCP that helps a citizen find
and book Parks Canada campsites accessibly. It is an implementation of the **Civic
Access Protocol** and conforms to **The Open State Constitution**
(https://github.com/JCrossman/the-open-state/blob/main/CONSTITUTION.md, tag
`constitution-v1.1`), using `@open-state/kit@1.0.0`. These rules are binding — if
a change conflicts with one, say so and stop, and cite the article.

- **The human decides (Art. 2).** prepare_booking only *prepares* to the payment
  screen; the citizen reviews and pays. Never auto-book, never pay. Use the kit's
  `confirmGated` gate.
- **No stored government credentials (Art. 1).** The citizen signs in themselves;
  the session lives only in the kit vault, on-device. Never expose it to the model.
- **Accessibility is the purpose (Art. 3).** Accessibility attributes first-class
  and filterable; screen-reader-clean, plain-language output; carried through to
  the action.
- **Honesty (Art. 7).** Distinguish verified from assumed; fail visibly; polite
  request rates; the browser-like User-Agent is a documented, honest tension.
- **Assistive technology, not a bot (Art. 10).** Acts only in the citizen's own
  session, at their direction; never defeats human gates.

See CONFORMANCE at https://github.com/JCrossman/the-open-state/blob/main/CONFORMANCE.md.
No citizen should be excluded from what is already theirs.
