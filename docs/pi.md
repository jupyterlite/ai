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

## Choose a model

Pi has its own model configuration, separate from the Jupyternaut settings. Pi
knows the models of many providers; it needs an API key for one of them, an
OpenRouter sign-in, or an OpenAI-compatible endpoint.

- In the command palette, run **Pi: Set a Model Provider API Key**, select the
  provider and enter the key.
- In the command palette, run **Pi: Sign In with an Account** to sign in with
  OpenRouter in a new window. The sign-in needs a secure page (HTTPS or
  localhost).
- In the terminal, run `pi`, then `/login` to add a key or sign in with
  OpenRouter, and `/model` to select the model. In the model list, Enter
  selects the model for the session, `ctrl+s` also makes it the default model
  of the new sessions.
- For Ollama, LM Studio, vLLM or a proxy, run **Pi: Add an OpenAI-Compatible
  Endpoint** in the command palette and enter the base URL (for example
  `http://localhost:11434/v1` for Ollama) and the model ids.

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

| Message         | Effect                                     |
| --------------- | ------------------------------------------ |
| `/new`          | Start a new pi session in this chat        |
| `/compact`      | Summarize the conversation to save context |
| `/skill:<name>` | Run a skill                                |
| `/<template>`   | Expand a prompt template                   |

## Terminal

Open a terminal in JupyterLite and type `pi` (alias: `ai`). Pi starts its
interactive interface: type a message, `/` for the commands (`/model`,
`/login`, `/resume`, `/new`, `/tree`, `/settings`, `/hotkeys`...), `!command`
to run a shell command, `escape` to interrupt, `ctrl+d` to exit.

| Command        | Effect                                                        |
| -------------- | ------------------------------------------------------------- |
| `pi`           | Start a new session in the current directory (under `/drive`) |
| `pi -c`        | Continue the most recent session of the current directory     |
| `pi <message>` | Start a session with a first message                          |

The sessions of the chats have a folder of their own: `pi -c` does not
continue them, and the **All** list of `/resume` shows them.

## Tools

| Tool                                     | Description                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `read`, `write`, `edit`, `ls`, `find`    | The pi file tools, on the JupyterLab files (`/drive`)                   |
| `grep`                                   | Search the files with a regular expression                              |
| `bash`                                   | Run a command in `cockle`, the shell of the JupyterLite terminal        |
| `discover_commands`, `execute_command`   | Drive JupyterLab: open files, create and run notebooks, run kernel code |
| `browser_fetch` and other registry tools | The tools of the Jupyternaut tool registry                              |
| `mcp__<server>__<tool>`                  | The tools of the HTTP MCP servers of the MCP settings                   |

The JupyterLab files appear under `/drive`, as in the terminal. `bash` is
available only in JupyterLite, where the terminal provides the shell. When pi
changes a file that is open in JupyterLab without unsaved changes (with
`write`, `edit` or `bash`), the open document reloads.

Pi connects to the MCP servers in the background and follows the changes of
the MCP settings; it does not read `mcp.json`. In the terminal, `/mcp` shows
the state of the servers (the chat does not show their errors). Servers that
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
starts, and again on `/reload` in the terminal.

On a Jupyter server, the contents API hides dotfiles by default: set
`c.ContentsManager.allow_hidden = True` so that pi can read and write `.pi`,
`.agents` and the other dotfiles (see
[Using skills with JupyterLab](skills.md#using-skills-with-jupyterlab)).

## Where pi keeps its data

The pi settings, credentials (`auth.json`), custom models (`models.json`) and
sessions are kept in the browser (IndexedDB) for the origin of the page: the
sites of one origin (for example the JupyterLite sites of one GitHub Pages
account) share them. They are not written to the JupyterLab files.

The API keys are stored unencrypted: all the code of the origin can read them,
also the JupyterLite kernels. Use keys with a spending limit, and remove them
when you no longer use pi: `/logout` in the terminal removes a provider key or
the OpenRouter sign-in, and the key of an endpoint is in `models.json`. The
OpenRouter sign-in creates a key that you can also revoke in the OpenRouter
key list.

## Limitations

- The `cockle` shell has no Python or Node: pi runs code through the notebook
  and kernel commands.
- Shell commands run one at a time, read an empty input, and show their
  output when they end. They time out after 2 minutes unless pi asks for
  another timeout; stopping a command restarts the shell.
- Of the account sign-ins of `/login`, only OpenRouter works in the browser:
  the providers of the others do not accept requests from a web page (for
  ChatGPT, the model calls). `/share` and `/bug` do not work.
- Pi extensions and packages from files (`.pi/extensions`, the packages of the
  settings) do not load in the browser, and the pi examples are not included.
- `/export` and `/import` do not work with the JupyterLab files, and the `@`
  file suggestions do not list the JupyterLab files.
- xterm.js sends Alt+Up and Alt+Down as Ctrl+Up and Ctrl+Down, so the pi keys
  that use them do not work.
- In chats that a Jupyter server synchronizes, jupyterlab-chat 0.25 drops the
  changes to the rich content of a message and shows the messages of pi as
  messages of the user. Pi posts each tool call when it waits for an approval
  and when it ends, instead of updating it. Jupyternaut has the same issues.
