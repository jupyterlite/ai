# Terminal agent

`jupyternaut-terminal` adds the Jupyternaut coding agent to the
[JupyterLite terminal](https://github.com/jupyterlite/terminal) as a
`jupyternaut` command (alias: `ai`), similar to running a coding agent such as
Claude Code in a regular terminal.

Everything runs in the browser: the agent talks to the LLM provider configured
in the AI settings, runs shell commands in the in-browser `cockle` shell, and
reads and writes files of the JupyterLite file system.

## Install

```bash
pip install jupyternaut-terminal
```

This also installs `jupyterlite-terminal`. Enable terminals in your JupyterLite
deployment by adding a `jupyter-lite.json` file:

```json
{
  "jupyter-lite-schema-version": 0,
  "jupyter-config-data": {
    "terminalsAvailable": true
  }
}
```

Then build the site with `jupyter lite build`.

## Usage

1. Configure a provider, model and API key in the AI settings panel.
2. Open a terminal from the launcher.
3. Type `jupyternaut` (or `ai`) and press enter.

The agent uses the same providers, tools, skills and MCP servers as the chat.
On top of them it has terminal tools:

| Tool         | Description                                                                |
| ------------ | -------------------------------------------------------------------------- |
| `shell`      | Run a command in a headless `cockle` shell (`ls`, `grep`, `sed`, `git`...) |
| `list_files` | List a directory                                                           |
| `read_file`  | Read a file with line numbers                                              |
| `write_file` | Create or overwrite a file                                                 |
| `edit_file`  | Replace an exact string in a file                                          |

Commands that change files or run shell commands ask for confirmation first.
Choose "don't ask again" to allow a tool for the rest of the session.

### Slash commands and shortcuts

| Input           | Effect                                                |
| --------------- | ----------------------------------------------------- |
| `/help`         | Show the commands and shortcuts                       |
| `/model`        | Switch the provider and model                         |
| `/tools`        | List the tools available to the agent                 |
| `/clear`        | Clear the conversation                                |
| `/settings`     | Open the AI settings panel                            |
| `/exit`         | Leave the agent                                       |
| `/`             | List the commands, `↑↓` select, `tab` or `enter` pick |
| `esc`           | Interrupt the current response                        |
| `ctrl+c`        | Clear the prompt, press twice to exit                 |
| `pgup` / `pgdn` | Scroll the transcript                                 |
| `\` + enter     | Insert a newline in the prompt                        |

The conversation is kept while the terminal stays open, so running
`jupyternaut` again continues where you left off.

## Screen

The agent uses the alternate screen buffer, like `vim`: the transcript scrolls
above a prompt that stays at the bottom. Scroll with the mouse wheel, `pgup`
and `pgdn`; `end` follows the output again. Selecting text needs Option+drag on
macOS or Shift+drag elsewhere because the mouse wheel is tracked. The
transcript is printed back to the terminal when the agent exits.

## Limitations

- The `cockle` shell has no Python or Node: use the notebook and kernel
  commands (`execute_command`) for code execution.
- Running commands cannot be interrupted; they time out after 30 seconds.
