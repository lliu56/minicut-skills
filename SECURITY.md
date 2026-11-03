# Security

## Reporting a vulnerability

Email li@minicut.ai with the details. Please do not open a public issue for a security problem.

## What these skills do

- `miniapi-video` reads your key from the `MINIAPI_KEY` environment variable and sends it only to https://api.minicut.ai. It never writes the key to disk or prints it.
- Every paid job is quoted first. The script submits a job only after the user says yes (`--yes`).
- `minicut-film-studio` installs the MiniCut CLI from https://minicut.ai/install.sh and signs in through the browser. It stores no keys of its own.
- No telemetry is sent by these skills.
