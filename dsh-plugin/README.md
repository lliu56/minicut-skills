# MiniCut for DeepSeek Harness

Make multi-shot AI short films from DeepSeek Harness with the [MiniCut](https://minicut.ai) CLI: story, shot sheet, character and location pictures, video takes on models such as Seedance, Kling and Wan, voice lines, music and an edited cut. The CLI keeps the film as files in a project folder and runs a check after every step.

## Tools

| Tool | What it runs | Cost |
| --- | --- | --- |
| `minicut_status` | `minicut status`: installed, signed in | Free |
| `minicut_next` | `minicut loop next` in the project folder: the next command and why | Free |
| `minicut_run` | one `minicut` command, for example `login --json`, `new my-film --title "My film"` | Paid only on a `--yes` line |

## Paid jobs

A paid MiniCut command without `--yes` sends nothing to any model. It prints the price and the exact `--yes` line, and exits 3. `minicut_run` refuses any `--yes` line unless the call sets `user_approved_price: true`, which the agent sets only after the user says yes to that price. The printed line carries `--max-credits`, so a higher price is refused by the CLI too.

## Install

1. Install the MiniCut CLI. Download [install.sh](https://minicut.ai/install.sh), read it, then run `sh install.sh --region global` (Windows: `install.cmd` from the same site).
2. Add the plugin: `dsh plugin add` with this folder.
3. In a session, ask for a short film. The agent runs `minicut_status`, signs you in with `minicut login --json` if needed, and follows `minicut_next`.

## Notes

- The plugin holds no key. Sign-in is stored by the CLI.
- Commands run with an argument list, never through a shell.
- `minicut uninstall` is refused here; run it yourself.
- MiniCut is a paid service with a free sign-up. The CLI is closed source.

## License

MIT
