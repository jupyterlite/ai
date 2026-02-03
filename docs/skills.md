# Agent Skills

JupyterLite AI supports [Agent Skills](https://agentskills.io), a standard way to extend AI agent capabilities with reusable, shareable instructions.

Skills let you teach the AI agent new behaviors — like how to perform data analysis, write code reviews, or follow team conventions — by placing markdown files in your workspace. The agent discovers and activates skills automatically when they are relevant to a task.

## How it works

Skills follow the [agentskills.io specification](https://agentskills.io/specification). Each skill is a directory containing a `SKILL.md` file with YAML frontmatter (metadata) and a markdown body (instructions).

The AI agent uses **progressive disclosure** to work with skills efficiently:

1. **Discovery**: The agent calls `discover_commands` with query `"skills"` to see a list of available skills with short descriptions (~100 tokens each).
2. **Activation**: When a skill is relevant, the agent executes the corresponding `skills:<name>` command to load the full instructions.
3. **Execution**: The agent follows the loaded instructions to complete the task.

Skills are registered as JupyterLab commands with a `skills:` prefix. No additional tools or UI are needed — the agent discovers and uses skills through the existing command system.

## Creating a skill

### Directory structure

Place skills in the `.jupyter/skills/` directory at the root of your JupyterLab workspace:

```
.jupyter/
  skills/
    data-analysis/
      SKILL.md
      references/
        REFERENCE.md
      scripts/
        analyze.py
    code-review/
      SKILL.md
```

Each skill lives in its own subdirectory. Only the top-level subdirectories of the skills directory are scanned — nested subdirectories are not traversed for additional skills.

### SKILL.md format

Every skill directory must contain a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: data-analysis
description: Analyze datasets using pandas, generate summary statistics, and create visualizations.
---

## Instructions

When the user asks you to analyze data:

1. Load the dataset using pandas
2. Generate summary statistics with `df.describe()`
3. Identify missing values and data types
4. Create relevant visualizations using matplotlib
5. Provide a written summary of findings

## Guidelines

- Always show your code in notebook cells
- Use clear, descriptive variable names
- Add comments explaining each analysis step
```

The frontmatter fields:

| Field         | Required | Description                                                               |
| ------------- | -------- | ------------------------------------------------------------------------- |
| `name`        | Yes      | A short identifier for the skill (used in the command ID `skills:<name>`) |
| `description` | Yes      | A brief description of what the skill does and when to use it             |

The markdown body after the closing `---` is the full instructions content that the agent loads when it activates the skill.

### Resource files

Skills can include additional files (references, scripts, templates) alongside `SKILL.md`. The agent can access these by executing the skill command with a `resource` argument:

```
execute_command({ commandId: "skills:data-analysis", args: { resource: "references/REFERENCE.md" } })
```

This reads the file at `.jupyter/skills/data-analysis/references/REFERENCE.md` and returns its content.

## Configuring the skills directory

By default, skills are loaded from `.jupyter/skills` relative to the server root. You can change this path in the JupyterLite AI settings:

1. Open **Settings** > **Settings Editor**
2. Search for **JupyterLite AI**
3. Change the **Skills Path** setting to your preferred directory

This is useful if you keep skills in a different location, such as `.claude/skills/` for compatibility with Claude Code.

### Server configuration note

If you use a path under `.jupyter/`, make sure your Jupyter server allows reading hidden directories and that the server root is the workspace that contains the `.jupyter/skills` folder. A minimal `jupyter_server_config.py` example:

```python
c.ContentsManager.allow_hidden = True
c.ServerApp.root_dir = "/path/to/your/workspace"
```

## Providing skills from a JupyterLab extension

In addition to loading skills from the filesystem, JupyterLab extensions can register skills programmatically. The only convention required is the `skills:` command prefix. Any extension can call `app.commands.addCommand` to register a skill command:

```typescript
// Bundled resource files (scripts, references, templates)
const resources: Record<string, string> = {
  'scripts/analyze.py': 'import pandas as pd\n...',
  'references/REFERENCE.md': '# Reference\n...'
};

app.commands.addCommand('skills:my-custom-skill', {
  label: 'my-custom-skill',
  caption: 'Description of what this skill does.',
  usage: 'Agent skill: Description of what this skill does.',
  describedBy: {
    args: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description:
            'Optional path to a resource file bundled inside the skill directory (e.g. references or templates shipped with the skill). Do NOT use this for user workspace files — read those directly instead.'
        }
      }
    }
  },
  execute: async (args: any) => {
    // When a resource is requested, return its content
    if (args.resource) {
      const content = resources[args.resource];
      if (!content) {
        return {
          name: 'my-custom-skill',
          resource: args.resource,
          error: `Resource not found: ${args.resource}`
        };
      }
      return { name: 'my-custom-skill', resource: args.resource, content };
    }

    // Otherwise return skill metadata + instructions.
    // List resource paths (not content) for progressive disclosure —
    // the agent loads each resource individually when needed.
    return {
      name: 'my-custom-skill',
      description: 'Description of what this skill does.',
      instructions: 'Full instructions for the agent...',
      resources: Object.keys(resources)
    };
  }
});
```

The execute handler follows progressive disclosure: on activation it returns instructions and a list of resource **paths**, and the agent loads individual resources on demand via the `resource` argument. This keeps token usage low for skills with large bundled files.

This makes it possible to bundle skills as part of a JupyterLab extension and distribute them via PyPI or conda-forge, without requiring users to place files in their workspace manually.

## Compatibility

Skills follow the [agentskills.io specification](https://agentskills.io/specification), so skill directories can be shared across tools that support the standard. A skill created for JupyterLite AI can also be used with other compatible agents, and vice versa.
