# Remote MCP Servers

The [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) is an open standard that enables AI assistants to connect to external tools and data sources.

With `jupyterlite-ai`, you can connect to remote MCP servers to extend the AI's capabilities with additional tools.

## Configuring an MCP Server

1. In JupyterLab, open the AI settings panel
2. Go to the **MCP Servers** tab
3. Click on **Add Server**
4. Enter the following details:
   - **Server Name**: A friendly name to identify the server
   - **Server URL**: The URL of the MCP server
5. Enable the server using the toggle switch

Once connected, the MCP server's tools will be available to the AI assistant in the chat.

## Example MCP Servers

Here are some publicly available remote MCP servers you can use with `jupyterlite-ai`:

### DeepWiki

[DeepWiki](https://deepwiki.com) provides AI-generated documentation for open-source repositories.

- **Server URL**: `https://mcp.deepwiki.com/mcp`

The DeepWiki MCP server allows the AI to search and retrieve documentation about open-source projects.

### GitMCP

[GitMCP](https://gitmcp.io) allows you to use any GitHub project as context for your conversations.

- **Server URL**: `https://gitmcp.io/docs`

The GitMCP server enables the AI to fetch and understand code from GitHub repositories.

## Finding More MCP Servers

The MCP ecosystem is growing rapidly, with directories of available servers at places like the [MCP Servers Repository](https://github.com/modelcontextprotocol/servers).

However, be aware that **most MCP servers listed in these directories will not work** with `jupyterlite-ai` due to browser constraints explained below.

## Browser Constraints

Since `jupyterlite-ai` runs entirely in the browser, it can only connect to MCP servers that meet two requirements:

1. **Streamable HTTP transport**: The server must support the [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) defined in the MCP specification. The vast majority of MCP servers are designed to run locally using the stdio transport, which is inaccessible from a browser.

2. **CORS headers**: The server must have proper [CORS (Cross-Origin Resource Sharing)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) headers configured to allow requests from web applications. Without these headers, the browser will block the connection.

In practice, this means most MCP servers will simply not work. Only servers specifically designed for browser-based clients—like the DeepWiki and GitMCP examples above—will be compatible.

:::{tip}
If you encounter connection issues, check your browser's developer console (F12) for CORS-related errors.
:::
