# Pi coding agent

`jupyternaut-pi` runs the [pi coding agent](https://pi.dev)
(`@earendil-works/pi-coding-agent`) in the browser, in JupyterLab and in
JupyterLite. Pi is available in two places, with the same tools, settings,
credentials and sessions:

- in the chats, as a second persona next to Jupyternaut;
- in the JupyterLite terminal, as the `pi` command, with the interactive
  interface of pi itself (with `jupyternaut-terminal`).

Pi brings its own agent loop: sessions saved to files, automatic retries,
context compaction, skills, prompt templates, steering and follow-up messages,
and the model providers of `@earendil-works/pi-ai`.

## Install

```bash
pip install jupyternaut-pi
```

For the `pi` command in the JupyterLite terminal, also install
`jupyternaut-terminal` (it installs `jupyterlite-terminal` and JupyterLite
0.8.6 or later) and enable the terminals in `jupyter-lite.json`:

```json
{
  "jupyter-lite-schema-version": 0,
  "jupyter-config-data": {
    "terminalsAvailable": true
  }
}
```

The chat persona needs the persona manager of Jupyter AI, which
`jupyternaut-persona` installs. To select Jupyternaut by default when the chat
opens, set the default persona in the page configuration (`jupyter-lite.json`
for JupyterLite):

```json
{
  "jupyter-config-data": {
    "jupyter_ai_default_persona": "jupyternaut-frontend"
  }
}
```

In JupyterLab, the persona manager sets this option from the server
configuration (for example in `jupyter_server_config.py`):

```python
c.PersonaManager.default_persona_id = "jupyternaut-frontend"
```

## Choose a model

Pi has its own model configuration, separate from the Jupyternaut settings. Pi
knows the models of many providers; it needs an API key for one of them, an
OpenRouter sign-in, or an OpenAI-compatible endpoint.

- In the command palette, run **Pi: Add a Model Provider**. In the dialog,
  select the provider and paste its API key. For OpenRouter, you can also
  click **Sign In with OpenRouter** to create a key with your account in a new
  window (this needs a secure page: HTTPS or localhost). For Ollama, LM
  Studio, vLLM or a proxy, select **OpenAI-compatible endpoint** and enter the
  base URL (for example `http://localhost:11434/v1` for Ollama) and the model
  ids. The saved endpoints are in the same list, as "name (endpoint)", to
  change them; **Remove** deletes a saved key, the OpenRouter sign-in or an
  endpoint.
- In a chat, a message to pi with no model opens the same dialog; pi then
  answers the message.
- In the terminal, run `pi`, then `/login` to add a key or sign in with
  OpenRouter, and `/model` to select the model. In the model list, Enter
  selects the model for the session, `ctrl+s` also makes it the default model
  of the new sessions.

With OpenRouter, pi also lists the models of the OpenRouter API that support
tool calls and that its own model list does not have yet.

The browser calls the provider directly, so the provider must accept requests
from a web page (CORS). Anthropic, OpenAI, Google, Mistral, OpenRouter, Groq,
xAI, DeepSeek, Together and Hugging Face do. For Ollama, allow the origin of
the site with the `OLLAMA_ORIGINS` environment variable.

## Chat

1. Open a chat.
2. In the persona menu of the input toolbar, select **Pi**.
3. Send a message.

The model menu next to the persona lists the models that have credentials; the
thinking level appears for the models that can reason. A model or thinking
level selected in these menus also becomes the default of the new pi sessions,
in the chats and in the terminal. Each chat has its own pi session, which is
restored when the chat opens again.

| Message         | Effect                                                                     |
| --------------- | -------------------------------------------------------------------------- |
| `/new`          | Start a new pi session in this chat                                        |
| `/compact`      | Summarize the conversation to save context                                 |
| `/reload`       | Load the extensions, skills, prompts and context files (`AGENTS.md`) again |
| `/name <name>`  | Set the name of the session                                                |
| `/session`      | Show the session file and its statistics                                   |
| `/skill:<name>` | Run a skill                                                                |
| `/<template>`   | Expand a prompt template                                                   |
| `/<command>`    | Run a command of an extension, for example `/mcp`                          |

The other commands of pi's terminal interface (`/model`, `/thinking`,
`/resume`, `/tree`...) do not go to the model: the chat shows where to find
them. A message sent while pi works steers the run: pi reads it after its
current step, as Enter does in the terminal. Stop also cancels the messages
that wait. Questions of the extensions open JupyterLab dialogs, and their
messages show in the chat (as a notification when the chat is idle).

## Terminal

Open a terminal in JupyterLite and type `pi` (alias: `ai`). Pi starts its
interactive interface: type a message, `/` for the commands (`/model`,
`/login`, `/resume`, `/new`, `/tree`, `/settings`, `/hotkeys`...), `!command`
to run a shell command, `escape` to interrupt, `ctrl+d` to exit.

| Command                                       | Effect                                                        |
| --------------------------------------------- | ------------------------------------------------------------- |
| `pi`                                          | Start a new session in the current directory (under `/drive`) |
| `pi -c`                                       | Continue the most recent session of the current directory     |
| `pi -r`                                       | Select a session to resume                                    |
| `pi --session <file or id>`                   | Open a session (also a `.jsonl` file of the drive)            |
| `pi --no-session`                             | Do not save the session                                       |
| `pi <message> [<message>...]`                 | Start a session with messages; `@file` adds a drive file      |
| `pi --model <id>`, `--provider`, `--thinking` | Select the model and the thinking level                       |
| `pi -n <name>`                                | Name the new session                                          |
| `pi -v`, `pi -h`                              | Show the version or the help                                  |

The options that need a real process (`-p`, `--mode`, `-e`...) stop with a
message. The sessions of the chats have a folder of their own: `pi -c` does
not continue them, and the **All** list of `/resume` shows them.

`@` suggests the files of the drive and Tab completes their paths, as on a
computer. `/export` writes an HTML or JSONL file to the drive, and `/import`
reads one. Paste an image with Ctrl+V on macOS or Alt+V on the other systems
(the browser asks for the clipboard permission).

## Tools

| Tool                                     | Description                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `read`, `write`, `edit`, `ls`, `find`    | The pi file tools, on the JupyterLab files (`/drive`)                   |
| `grep`                                   | Search the files with a regular expression                              |
| `bash`                                   | Run a command in `cockle`, the shell of the JupyterLite terminal        |
| `discover_commands`, `execute_command`   | Drive JupyterLab: open files, create and run notebooks, run kernel code |
| `browser_fetch` and other registry tools | The tools of the Jupyternaut tool registry                              |
| `mcp__<server>__<tool>`                  | The tools of the HTTP MCP servers of the MCP settings                   |

The JupyterLab files appear under `/drive`, as in the terminal. Only `/drive`
is shared between the file tools, `bash`, the kernels and JupyterLab: files at
other paths (for example `/tmp`) stay in the memory of the page. `bash` is
available only in JupyterLite, where the terminal provides the shell. When pi
changes a file that is open in JupyterLab without unsaved changes (with
`write`, `edit` or `bash`), the open document reloads. The `defaultTools`
setting of pi also applies to these tools, and a long tool result keeps its
start and its end.

Pi connects to the MCP servers in the background and follows the changes of
the MCP settings; it does not read `mcp.json`. `/mcp` shows the state of the
servers, in the terminal and in the chat. Servers that
need an OAuth sign-in do not work, and their tools must keep the `direct`
exposure. Servers with resources also add the `list_mcp_resources`,
`list_mcp_resource_templates` and `read_mcp_resource` tools, which only read.

Pi asks before it runs `bash`, `write`, `edit`, the JupyterLab commands listed
in the "Commands requiring approval" setting of Jupyternaut, and the MCP tools
that are not read-only. In the chat the tool call shows **Allow**, **Always
allow** and **Reject**; in the terminal pi shows the same choices. **Always
allow** applies to one tool (for `execute_command`, to one JupyterLab command)
until the session ends. A rejection stops the run: pi does not run the other
tool calls of the same answer, so you can tell pi what to do instead. A call
that ran before the rejection is not undone.

## Context and skills

Pi reads `AGENTS.md` (or `CLAUDE.md`) files of the working directory and its
parents, the project settings in `.pi/` (for example `.pi/APPEND_SYSTEM.md`),
and the skills in `.agents/skills` and `.pi/skills`. The skill folders of the
Jupyternaut settings are added too. Pi reads these files when a session
starts, and again on `/reload`.

As on a computer, pi loads the `.pi` and `.agents` resources of a folder only
when you trust it. The first time, pi asks **Trust project folder?**: in a
dialog for the chat, and in the terminal before its interface starts. `/trust`
changes the saved decision, and the `defaultProjectTrust` setting applies. An
answer "this session only" lasts until the page reloads.

On a Jupyter server, the contents API hides dotfiles by default: set
`c.ContentsManager.allow_hidden = True` so that pi can read and write `.pi`,
`.agents` and the other dotfiles (see
[Using skills with JupyterLab](skills.md#using-skills-with-jupyterlab)).

## Where pi keeps its data

The pi settings, credentials (`auth.json`), custom models (`models.json`) and
sessions are kept in the browser (IndexedDB) for the origin of the page: the
sites of one origin (for example the JupyterLite sites of one GitHub Pages
account) share them. They are not written to the JupyterLab files.

Run **Pi: Open the Agent Folder** to see this folder (`~/.pi/agent`) in a file
browser: edit `settings.json`, `keybindings.json`, `models.json`, a global
`AGENTS.md`, prompts, skills and themes, as on a computer. `auth.json` is not
shown: the provider dialog and `/login` manage the keys. The folder keeps text
files only, and an empty folder is not kept.

The API keys are stored unencrypted: all the code of the origin can read them,
also the JupyterLite kernels. Use keys with a spending limit, and remove them
when you no longer use pi: **Remove** in the provider dialog, or `/logout` in
the terminal. The OpenRouter sign-in creates a key that you can also revoke in
the OpenRouter key list.

## Limitations

- The `cockle` shell has no Python or Node: pi runs code through the notebook
  and kernel commands.
- Shell commands run one at a time, read an empty input, and show their
  output when they end. They time out after 2 minutes unless pi asks for
  another timeout; stopping a command restarts the shell. `#` comments, here
  documents and `exit` work. A command with `&&`, `||` or a TAB character, or
  a here document with text that is not ASCII, stops with a message: pi runs
  the commands one by one, and writes these files with its file tools.
- Of the account sign-ins of `/login`, only OpenRouter works in the browser:
  the providers of the others do not accept requests from a web page (for
  ChatGPT, the model calls). `/share` and `/bug` do not work.
- Pi extensions and packages from files (`.pi/extensions`, the packages of the
  settings) do not load in the browser, and the pi examples are not included.
- The browser keeps some keys (Ctrl+T, Ctrl+N, Ctrl+W), so outside macOS pi
  uses Alt+T, Alt+N, Alt+Q, Alt+P and Shift+Alt+Up/Down for them. This applies
  when pi writes `keybindings.json`, the first time.
- Two fast presses on Escape move the focus out of the terminal in JupyterLab
  4.6: type `/tree` in place of Escape Escape.
- In chats that a Jupyter server synchronizes, jupyterlab-chat 0.25 drops the
  changes to the rich content of a message and shows the messages of pi as
  messages of the user. Pi posts each tool call when it waits for an approval
  and when it ends, instead of updating it. Jupyternaut has the same issues.
