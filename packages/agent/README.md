# @jupyterlite/agent

AI agent implementation for Jupyter using AI SDK.

This package provides the core agent functionality including:

- Agent manager and factory
- Tool registry and tool implementations
- Provider registry and model management
- MCP server integration
- Skills registry

## Installation

```bash
npm install @jupyterlite/agent
```

## Usage

```typescript
import {
  AgentManagerFactory,
  IProviderRegistry,
  IToolRegistry
} from '@jupyterlite/agent';

// Create a provider registry
const providerRegistry = new ProviderRegistry();

// Create a tool registry
const toolRegistry = new ToolRegistry();

// Create settings model (you'll need to implement IAISettingsModel)
const settingsModel = {
  /* ... */
};

// Create agent manager factory
const agentManagerFactory = new AgentManagerFactory({
  settingsModel,
  token: null
});

// Create an agent
const agentManager = agentManagerFactory.createAgent({
  settingsModel,
  providerRegistry,
  toolRegistry
});

// Use the agent
const userMessage = 'Hello, how can you help me?';
await agentManager.generateResponse(userMessage);
```

## License

BSD-3-Clause
