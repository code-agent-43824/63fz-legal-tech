# 63fz Legal Tech

MVP legal-tech CMS for structured reading and expert commenting of Federal Law 63-FZ "On Electronic Signature".

Production target: `https://mescheryakov.pro/63fz`.

## Development Principles

- Keep implementation simple and observable.
- Make small, reviewable commits for each meaningful change.
- Do not mix original law text with explanations, comments, issues, or proposed revisions.
- Do not invent law text or expert comments.
- Mark all fixture content as `DEMO DATA` until a verified source is imported.
- Do not commit secrets, `.env` files, passwords, private keys, or tokens.
- Protect every write endpoint.
- Do not change the existing `mescheryakov.pro` site outside the `/63fz` route.

## Current Status

Planning and scaffolding.

See:

- [Development Plan](docs/PLAN.md)
- [Progress Log](docs/PROGRESS.md)

