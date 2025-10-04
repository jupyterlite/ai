/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Browser-compatible MCP Server implementation
 *
 * This is a custom implementation that works around the limitation in
 * @openai/agents where MCPServerStreamableHttp doesn't work in browsers
 */

// Type definitions matching openai/agents MCPServer interface
interface MCPServer {
  cacheToolsList: boolean;
  toolFilter?: any;
  connect(): Promise<void>;
  readonly name: string;
  close(): Promise<void>;
  listTools(): Promise<MCPTool[]>;
  callTool(
    toolName: string,
    args: Record<string, unknown> | null
  ): Promise<CallToolResultContent>;
  invalidateToolsCache(): Promise<void>;
}

interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
    additionalProperties: boolean;
  };
}

// CallToolResultContent is an array of content items
type CallToolResultContent = Array<{ type: string; text: string }>;

interface MCPServerStreamableHttpOptions {
  url: string;
  cacheToolsList?: boolean;
  clientSessionTimeoutSeconds?: number;
  name?: string;
  logger?: any;
  toolFilter?: any;
  timeout?: number;
  authProvider?: any;
  requestInit?: any;
  fetch?: any;
  reconnectionOptions?: any;
  sessionId?: string;
}

/**
 * Browser-compatible MCP Server implementation that works around limitations
 * in @openai/agents where MCPServerStreamableHttp doesn't work in browsers.
 *
 * This class provides a streamable HTTP client transport for MCP (Model Context Protocol)
 * servers that can be used in browser environments.
 */
export class BrowserMCPServerStreamableHttp implements MCPServer {
  readonly name: string;
  readonly cacheToolsList: boolean;
  readonly toolFilter: any = undefined;

  constructor(options: MCPServerStreamableHttpOptions) {
    this._options = options;
    this.name = options.name || `browser-mcp-server: ${options.url}`;
    this.cacheToolsList = options.cacheToolsList ?? false;
  }

  async connect(): Promise<void> {
    try {
      // Dynamic import to handle cases where MCP SDK isn't available
      const { StreamableHTTPClientTransport } = await import(
        '@modelcontextprotocol/sdk/client/streamableHttp.js'
      );
      const { Client } = await import(
        '@modelcontextprotocol/sdk/client/index.js'
      );

      // Merge CORS-enabled requestInit with user options
      const corsRequestInit = {
        mode: 'cors' as RequestMode,
        credentials: 'omit' as RequestCredentials,
        ...this._options.requestInit
      };

      this._transport = new StreamableHTTPClientTransport(
        new URL(this._options.url),
        {
          authProvider: this._options.authProvider,
          requestInit: corsRequestInit,
          fetch: this._options.fetch || fetch,
          reconnectionOptions: this._options.reconnectionOptions,
          sessionId: this._options.sessionId
        }
      );

      this._session = new Client({
        name: this.name,
        version: '1.0.0'
      });

      await this._session.connect(this._transport);
    } catch (error) {
      console.error('Error initializing MCP server:', error);
      await this.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this._session) {
      try {
        await this._session.close();
      } catch (error) {
        console.error('Error closing MCP server session:', error);
      }
      this._session = null;
    }
    if (this._transport) {
      try {
        await this._transport.close();
      } catch (error) {
        console.error('Error closing MCP server transport:', error);
      }
      this._transport = null;
    }
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this._session) {
      throw new Error('Server not initialized. Call connect() first.');
    }

    if (
      this.cacheToolsList &&
      !this._cacheDirty &&
      this._toolsList.length > 0
    ) {
      return this._toolsList;
    }

    try {
      const { ListToolsResultSchema } = await import(
        '@modelcontextprotocol/sdk/types.js'
      );

      const response = await this._session.listTools();

      const parsedResponse = ListToolsResultSchema.parse(response);

      // Map to openai/agents MCPTool type
      this._toolsList = parsedResponse.tools.map((tool: any) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: {
          type: 'object' as const,
          properties: tool.inputSchema?.properties || {},
          required: tool.inputSchema?.required || [],
          additionalProperties: tool.inputSchema?.additionalProperties ?? false
        }
      }));

      this._cacheDirty = false;

      return this._toolsList;
    } catch (error) {
      console.error(`Error listing tools from ${this.name}:`, error);
      throw error;
    }
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown> | null
  ): Promise<CallToolResultContent> {
    if (!this._session) {
      throw new Error('Server not initialized. Call connect() first.');
    }

    try {
      const { CallToolResultSchema } = await import(
        '@modelcontextprotocol/sdk/types.js'
      );

      const response = await this._session.callTool(
        {
          name: toolName,
          arguments: args ?? {}
        },
        undefined,
        {
          timeout: this._options.timeout ?? 30000
        }
      );

      // Parse and validate using MCP SDK schema
      const parsed = CallToolResultSchema.parse(response);
      const result = parsed.content;

      // Return the content array as expected by openai/agents
      // CallToolResultContent is { type: string; text: string }[]
      return result as CallToolResultContent;
    } catch (error) {
      console.error(`Error calling tool ${toolName}:`, error);
      throw error;
    }
  }

  async invalidateToolsCache(): Promise<void> {
    this._cacheDirty = true;
  }

  private _session: any | null = null;
  private _toolsList: MCPTool[] = [];
  private _cacheDirty = true;
  private _transport: any = null;
  private _options: MCPServerStreamableHttpOptions;
}
