import { IThemeManager } from '@jupyterlab/apputils';
import { ReactWidget } from '@jupyterlab/ui-components';
import Add from '@mui/icons-material/Add';
import Cable from '@mui/icons-material/Cable';
import CheckCircle from '@mui/icons-material/CheckCircle';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import Delete from '@mui/icons-material/Delete';
import Edit from '@mui/icons-material/Edit';
import Error from '@mui/icons-material/Error';
import ErrorOutline from '@mui/icons-material/ErrorOutline';
import MoreVert from '@mui/icons-material/MoreVert';
import Settings from '@mui/icons-material/Settings';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  Switch,
  Tab,
  Tabs,
  TextField,
  ThemeProvider,
  Typography,
  createTheme
} from '@mui/material';
import { ISecretsManager } from 'jupyter-secrets-manager';
import React, { useEffect, useState } from 'react';
import { AgentManagerFactory } from '../agent';
import {
  AISettingsModel,
  IAIConfig,
  IMCPServerConfig,
  IProviderConfig
} from '../models/settings-model';
import {
  SECRETS_NAMESPACE,
  SECRETS_REPLACEMENT,
  type IProviderRegistry
} from '../tokens';
import { ProviderConfigDialog } from './provider-config-dialog';

/**
 * Create a theme that uses IThemeManager to detect theme
 * @param themeManager - Optional theme manager to detect theme
 * @returns A Material-UI theme configured for the current JupyterLab theme
 */
const createJupyterLabTheme = (themeManager?: IThemeManager) => {
  // Use IThemeManager if available, otherwise default to light theme
  const isDark = themeManager?.theme
    ? !themeManager.isLight(themeManager.theme)
    : false;

  return createTheme({
    palette: {
      mode: isDark ? 'dark' : 'light'
    }
  });
};

/**
 * A JupyterLab widget for AI settings configuration
 */
export class AISettingsWidget extends ReactWidget {
  /**
   * Construct a new AI settings widget
   * @param options - The options for initializing the widget
   */
  constructor(options: AISettingsWidget.IOptions) {
    super();
    Private.setToken(options.token);
    this._settingsModel = options.settingsModel;
    this._agentManagerFactory = options.agentManagerFactory;
    this._themeManager = options.themeManager;
    this._providerRegistry = options.providerRegistry;
    this._secretsManager = options.secretsManager;
    this.id = 'jupyterlite-ai-settings';
    this.title.label = 'AI Settings';
    this.title.caption = 'Configure AI providers and behavior';
    this.title.closable = true;
  }

  /**
   * Render the AI settings component
   * @returns A React element containing the AI settings interface
   */
  protected render(): React.ReactElement {
    return (
      <AISettingsComponent
        model={this._settingsModel}
        agentManagerFactory={this._agentManagerFactory}
        themeManager={this._themeManager}
        providerRegistry={this._providerRegistry}
        secretsManager={this._secretsManager}
      />
    );
  }

  private _settingsModel: AISettingsModel;
  private _agentManagerFactory?: AgentManagerFactory;
  private _themeManager?: IThemeManager;
  private _providerRegistry: IProviderRegistry;
  private _secretsManager?: ISecretsManager;
}

/**
 * Props interface for the AISettingsComponent
 */
interface IAISettingsComponentProps {
  model: AISettingsModel;
  agentManagerFactory?: AgentManagerFactory;
  themeManager?: IThemeManager;
  providerRegistry: IProviderRegistry;
  secretsManager?: ISecretsManager;
}

/**
 * The main AI settings component that provides configuration UI
 * @param props - Component props containing models and theme manager
 * @returns A React component for AI settings configuration
 */
const AISettingsComponent: React.FC<IAISettingsComponentProps> = ({
  model,
  agentManagerFactory,
  themeManager,
  providerRegistry,
  secretsManager
}) => {
  if (!model) {
    return <div>Settings model not available</div>;
  }

  const [config, setConfig] = useState(model.config || {});
  const [theme, setTheme] = useState(() => createJupyterLabTheme(themeManager));
  const [activeTab, setActiveTab] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<
    IProviderConfig | undefined
  >();
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuProviderId, setMenuProviderId] = useState<string>('');
  const [mcpDialogOpen, setMcpDialogOpen] = useState(false);
  const [editingMCPServer, setEditingMCPServer] = useState<
    IMCPServerConfig | undefined
  >();
  const [mcpMenuAnchor, setMcpMenuAnchor] = useState<null | HTMLElement>(null);
  const [mcpMenuServerId, setMcpMenuServerId] = useState<string>('');

  /**
   * Effect to listen for model state changes and update config
   */
  useEffect(() => {
    if (!model || !model.stateChanged) {
      return;
    }

    const onStateChanged = () => {
      setConfig(model.config || {});
    };

    model.stateChanged.connect(onStateChanged);
    return () => {
      model.stateChanged.disconnect(onStateChanged);
    };
  }, [model]);

  /**
   * Effect to listen for theme changes and update the Material-UI theme
   */
  useEffect(() => {
    if (!themeManager) {
      return;
    }

    const updateTheme = () => {
      setTheme(createJupyterLabTheme(themeManager));
    };

    themeManager.themeChanged.connect(updateTheme);
    return () => {
      themeManager.themeChanged.disconnect(updateTheme);
    };
  }, [themeManager]);

  /**
   * Effect to listen for MCP connection changes to re-render connection status
   */
  useEffect(() => {
    if (!agentManagerFactory) {
      return;
    }

    const onMCPConnectionChanged = () => {
      // Force a re-render by updating the config state
      setConfig(prevConfig => ({ ...prevConfig }));
    };

    agentManagerFactory.mcpConnectionChanged.connect(onMCPConnectionChanged);
    return () => {
      agentManagerFactory.mcpConnectionChanged.disconnect(
        onMCPConnectionChanged
      );
    };
  }, [agentManagerFactory]);

  const getSecretFromManager = async (
    provider: string,
    fieldName: string
  ): Promise<string | undefined> => {
    const secret = await secretsManager?.get(
      Private.getToken(),
      SECRETS_NAMESPACE,
      `${provider}:${fieldName}`
    );
    return secret?.value;
  };

  /**
   * Attach a secrets field to the secrets manager.
   * @param input - the DOm element to attach.
   * @param provider - the name of the provider.
   * @param fieldName - the name of the field.
   */
  const handleSecretField = async (
    input: HTMLInputElement,
    provider: string,
    fieldName: string
  ): Promise<void> => {
    if (!(model.config.useSecretsManager && secretsManager)) {
      return;
    }
    await secretsManager?.attach(
      Private.getToken(),
      SECRETS_NAMESPACE,
      `${provider}:${fieldName}`,
      input
    );
  };

  /**
   * Handle adding a new AI provider
   * @param providerConfig - The provider configuration to add
   */
  const handleAddProvider = async (
    providerConfig: Omit<IProviderConfig, 'id'>
  ) => {
    if (
      model.config.useSecretsManager &&
      secretsManager &&
      providerConfig.apiKey
    ) {
      providerConfig.apiKey = SECRETS_REPLACEMENT;
    }
    await model.addProvider(providerConfig);
  };

  /**
   * Handle editing an existing AI provider
   * @param providerConfig - The updated provider configuration
   */
  const handleEditProvider = async (
    providerConfig: Omit<IProviderConfig, 'id'>
  ) => {
    if (editingProvider) {
      if (
        model.config.useSecretsManager &&
        secretsManager &&
        providerConfig.apiKey
      ) {
        providerConfig.apiKey = SECRETS_REPLACEMENT;
      }
      await model.updateProvider(editingProvider.id, providerConfig);
      setEditingProvider(undefined);
    }
  };

  /**
   * Handle deleting an AI provider
   * @param id - The ID of the provider to delete
   */
  const handleDeleteProvider = async (id: string) => {
    await model.removeProvider(id);
    setMenuAnchor(null);
  };

  /**
   * Open the provider edit dialog
   * @param provider - The provider to edit
   */
  const openEditDialog = async (provider: IProviderConfig) => {
    // Retrieve the API key from the secrets manager if necessary.
    if (model.config.useSecretsManager && secretsManager) {
      provider.apiKey =
        (await getSecretFromManager(provider.provider, 'apiKey')) ??
        provider.apiKey ??
        '';
    }
    setEditingProvider(provider);
    setDialogOpen(true);
    setMenuAnchor(null);
  };

  /**
   * Open the provider add dialog
   */
  const openAddDialog = () => {
    setEditingProvider(undefined);
    setDialogOpen(true);
  };

  /**
   * Handle provider menu click
   * @param event - The click event
   * @param providerId - The ID of the provider
   */
  const handleMenuClick = (
    event: React.MouseEvent<HTMLElement>,
    providerId: string
  ) => {
    setMenuAnchor(event.currentTarget);
    setMenuProviderId(providerId);
  };

  /**
   * Handle provider menu close
   */
  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuProviderId('');
  };

  /**
   * Handle updating AI configuration
   * @param updates - Partial configuration updates to apply
   */
  const handleConfigUpdate = async (updates: Partial<IAIConfig>) => {
    if (updates.useSecretsManager !== undefined) {
      if (updates.useSecretsManager) {
        for (const provider of model.config.providers) {
          provider.apiKey = SECRETS_REPLACEMENT;
          await model.updateProvider(provider.id, provider);
        }
      } else {
        for (const provider of model.config.providers) {
          const apiKey = await getSecretFromManager(
            provider.provider,
            'apiKey'
          );
          if (apiKey) {
            provider.apiKey = apiKey;
            await model.updateProvider(provider.id, provider);
          }
        }
      }
    }
    await model.updateConfig(updates);
  };

  /**
   * Handle adding a new MCP server
   * @param serverConfig - The MCP server configuration to add
   */
  const handleAddMCPServer = async (
    serverConfig: Omit<IMCPServerConfig, 'id'>
  ) => {
    await model.addMCPServer(serverConfig);
  };

  /**
   * Handle editing an existing MCP server
   * @param serverConfig - The updated MCP server configuration
   */
  const handleEditMCPServer = async (
    serverConfig: Omit<IMCPServerConfig, 'id'>
  ) => {
    if (editingMCPServer) {
      await model.updateMCPServer(editingMCPServer.id, serverConfig);
      setEditingMCPServer(undefined);
    }
  };

  /**
   * Handle deleting an MCP server
   * @param id - The ID of the MCP server to delete
   */
  const handleDeleteMCPServer = async (id: string) => {
    await model.removeMCPServer(id);
    setMcpMenuAnchor(null);
  };

  /**
   * Open the MCP server edit dialog
   * @param server - The MCP server to edit
   */
  const openEditMCPDialog = (server: IMCPServerConfig) => {
    setEditingMCPServer(server);
    setMcpDialogOpen(true);
    setMcpMenuAnchor(null);
  };

  /**
   * Open the MCP server add dialog
   */
  const openAddMCPDialog = () => {
    setEditingMCPServer(undefined);
    setMcpDialogOpen(true);
  };

  /**
   * Handle MCP server menu click
   * @param event - The click event
   * @param serverId - The ID of the MCP server
   */
  const handleMCPMenuClick = (
    event: React.MouseEvent<HTMLElement>,
    serverId: string
  ) => {
    setMcpMenuAnchor(event.currentTarget);
    setMcpMenuServerId(serverId);
  };

  /**
   * Handle MCP server menu close
   */
  const handleMCPMenuClose = () => {
    setMcpMenuAnchor(null);
    setMcpMenuServerId('');
  };

  return (
    <ThemeProvider theme={theme}>
      <Box
        sx={{
          height: '100%',
          maxHeight: '100vh',
          overflow: 'auto',
          p: 2,
          pb: 4,
          fontSize: '0.9rem'
        }}
      >
        {/* Header */}
        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Settings color="primary" sx={{ fontSize: 24 }} />
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
            AI Settings
          </Typography>
        </Box>
        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs
            value={activeTab}
            onChange={(_, newValue) => setActiveTab(newValue)}
          >
            <Tab label="Providers" />
            <Tab label="Behavior" />
            <Tab label="MCP Servers" />
          </Tabs>
        </Box>

        {/* Tab Panels */}
        {activeTab === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {secretsManager !== undefined && (
              <FormControlLabel
                control={
                  <Switch
                    checked={config.useSecretsManager}
                    onChange={e =>
                      handleConfigUpdate({
                        useSecretsManager: e.target.checked
                      })
                    }
                    color="primary"
                    sx={{ alignSelf: 'flex-start' }}
                  />
                }
                label={
                  <div>
                    <span>Use the secrets manager to manage API keys</span>
                    {!config.useSecretsManager && (
                      <Alert severity="warning" icon={<Error />} sx={{ mb: 2 }}>
                        The secrets will be stored in plain text in settings
                      </Alert>
                    )}
                  </div>
                }
              />
            )}
            {/* Default Provider Selection */}
            {config.providers.length > 0 && (
              <Card elevation={2}>
                <CardContent>
                  <Typography variant="h6" component="h2" gutterBottom>
                    Default Providers
                  </Typography>

                  <Box
                    sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                  >
                    <FormControl fullWidth>
                      <InputLabel>Chat Provider</InputLabel>
                      <Select
                        value={config.defaultProvider}
                        label="Chat Provider"
                        onChange={e => model.setActiveProvider(e.target.value)}
                      >
                        {config.providers.map(provider => (
                          <MenuItem key={provider.id} value={provider.id}>
                            {provider.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControlLabel
                      control={
                        <Switch
                          checked={config.useSameProviderForChatAndCompleter}
                          onChange={e =>
                            handleConfigUpdate({
                              useSameProviderForChatAndCompleter:
                                e.target.checked
                            })
                          }
                          color="primary"
                        />
                      }
                      label="Use same provider for chat and completions"
                    />

                    {!config.useSameProviderForChatAndCompleter && (
                      <FormControl fullWidth>
                        <InputLabel>Completion Provider</InputLabel>
                        <Select
                          value={config.activeCompleterProvider || ''}
                          label="Completion Provider"
                          onChange={e =>
                            model.setActiveCompleterProvider(
                              e.target.value || undefined
                            )
                          }
                        >
                          <MenuItem value="">
                            <em>Use chat provider</em>
                          </MenuItem>
                          {config.providers.map(provider => (
                            <MenuItem key={provider.id} value={provider.id}>
                              {provider.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  </Box>
                </CardContent>
              </Card>
            )}

            {/* Providers Card */}
            <Card elevation={2}>
              <CardContent>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    mb: 2
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h6" component="h2">
                      Configured Providers
                    </Typography>
                  </Box>
                  <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={openAddDialog}
                    size="small"
                  >
                    Add Provider
                  </Button>
                </Box>

                {config.providers.length === 0 ? (
                  <Alert severity="info">
                    No providers configured yet. Click "Add Provider" to get
                    started.
                  </Alert>
                ) : (
                  <List>
                    {config.providers.map(provider => {
                      const isActive = config.defaultProvider === provider.id;
                      const isActiveCompleter =
                        config.useSameProviderForChatAndCompleter
                          ? isActive
                          : config.activeCompleterProvider === provider.id;
                      const params = provider.parameters;

                      return (
                        <ListItem
                          key={provider.id}
                          sx={{
                            flexDirection: 'column',
                            alignItems: 'stretch',
                            py: 2
                          }}
                        >
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'flex-start',
                              width: '100%',
                              mb: 1
                            }}
                          >
                            <Box sx={{ flex: 1 }}>
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1,
                                  mb: 0.5
                                }}
                              >
                                <Typography
                                  variant="subtitle1"
                                  fontWeight="medium"
                                >
                                  {provider.name}
                                </Typography>
                                {isActive && (
                                  <Chip
                                    label="Chat"
                                    size="small"
                                    color="primary"
                                    icon={<CheckCircle />}
                                  />
                                )}
                                {isActiveCompleter && (
                                  <Chip
                                    label="Completion"
                                    size="small"
                                    color="secondary"
                                    icon={<CheckCircle />}
                                  />
                                )}
                              </Box>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                gutterBottom
                              >
                                {provider.provider} • {provider.model}
                                {provider.description &&
                                  ` • ${provider.description}`}
                              </Typography>

                              {/* Display parameters if set */}
                              {params &&
                                (params.temperature !== undefined ||
                                  params.maxTokens !== undefined ||
                                  params.maxTurns !== undefined) && (
                                  <Box
                                    sx={{
                                      display: 'flex',
                                      flexWrap: 'wrap',
                                      gap: 1,
                                      mt: 1
                                    }}
                                  >
                                    {params.temperature !== undefined && (
                                      <Chip
                                        label={`Temp: ${params.temperature}`}
                                        size="small"
                                        variant="outlined"
                                      />
                                    )}
                                    {params.maxTokens !== undefined && (
                                      <Chip
                                        label={`Tokens: ${params.maxTokens}`}
                                        size="small"
                                        variant="outlined"
                                      />
                                    )}
                                    {params.maxTurns !== undefined && (
                                      <Chip
                                        label={`Turns: ${params.maxTurns}`}
                                        size="small"
                                        variant="outlined"
                                      />
                                    )}
                                  </Box>
                                )}
                            </Box>
                            <IconButton
                              onClick={e => handleMenuClick(e, provider.id)}
                              size="small"
                            >
                              <MoreVert />
                            </IconButton>
                          </Box>
                        </ListItem>
                      );
                    })}
                  </List>
                )}
              </CardContent>
            </Card>
          </Box>
        )}

        {activeTab === 1 && (
          <Card elevation={2}>
            <CardContent>
              <Typography variant="h6" component="h2" gutterBottom>
                Behavior Settings
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={config.toolsEnabled}
                      onChange={e =>
                        handleConfigUpdate({
                          toolsEnabled: e.target.checked
                        })
                      }
                      color="primary"
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body1">Enable Tools</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Allow the AI to use tools like notebook operations, code
                        execution, and file management
                      </Typography>
                    </Box>
                  }
                />

                <FormControlLabel
                  control={
                    <Switch
                      checked={config.sendWithShiftEnter}
                      onChange={e =>
                        handleConfigUpdate({
                          sendWithShiftEnter: e.target.checked
                        })
                      }
                      color="primary"
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body1">
                        Send with Shift+Enter
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Use Shift+Enter to send messages (Enter creates new
                        line)
                      </Typography>
                    </Box>
                  }
                />

                <FormControlLabel
                  control={
                    <Switch
                      checked={config.showTokenUsage}
                      onChange={e =>
                        handleConfigUpdate({
                          showTokenUsage: e.target.checked
                        })
                      }
                      color="primary"
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body1">Show Token Usage</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Display token usage information in the chat toolbar
                      </Typography>
                    </Box>
                  }
                />

                <Divider sx={{ my: 1 }} />

                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="System Prompt"
                  value={config.systemPrompt}
                  onChange={e =>
                    handleConfigUpdate({ systemPrompt: e.target.value })
                  }
                  placeholder="Define the AI's behavior and personality..."
                  helperText="Instructions that define how the AI should behave and respond"
                />

                <Divider sx={{ my: 2 }} />

                <Box>
                  <Typography variant="body1" gutterBottom>
                    Commands Requiring Approval
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    gutterBottom
                    sx={{ display: 'block' }}
                  >
                    Commands that require user approval before AI can execute
                    them
                  </Typography>

                  <List sx={{ mb: 2, maxHeight: 200, overflow: 'auto' }}>
                    {config.commandsRequiringApproval.map((command, index) => (
                      <ListItem key={index} divider>
                        <ListItemText primary={command} />
                        <ListItemSecondaryAction>
                          <IconButton
                            onClick={() => {
                              const newCommands = [
                                ...config.commandsRequiringApproval
                              ];
                              newCommands.splice(index, 1);
                              handleConfigUpdate({
                                commandsRequiringApproval: newCommands
                              });
                            }}
                            size="small"
                          >
                            <Delete />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))}
                  </List>

                  <TextField
                    fullWidth
                    label="Add New Command"
                    placeholder="e.g., notebook:run-cell"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const value = (
                          e.target as HTMLInputElement
                        ).value.trim();
                        if (
                          value &&
                          !config.commandsRequiringApproval.includes(value)
                        ) {
                          const newCommands = [
                            ...config.commandsRequiringApproval,
                            value
                          ];
                          handleConfigUpdate({
                            commandsRequiringApproval: newCommands
                          });
                          (e.target as HTMLInputElement).value = '';
                        }
                      }
                    }}
                    helperText="Press Enter to add a command. Common commands: notebook:run-cell, console:execute, fileeditor:run-code"
                  />
                </Box>
              </Box>
            </CardContent>
          </Card>
        )}

        {activeTab === 2 && (
          <Card elevation={2}>
            <CardContent>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 2
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Cable color="primary" />
                  <Typography variant="h6" component="h2">
                    Remote MCP Servers
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  startIcon={<Add />}
                  onClick={openAddMCPDialog}
                  size="small"
                >
                  Add Server
                </Button>
              </Box>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Configure remote Model Context Protocol (MCP) servers to extend
                the AI's capabilities with external tools and data sources.
              </Typography>

              {config.mcpServers.length === 0 ? (
                <Alert severity="info">
                  No MCP servers configured yet. Click "Add Server" to connect
                  to remote MCP services.
                </Alert>
              ) : (
                <List>
                  {config.mcpServers.map(server => (
                    <ListItem key={server.id} divider>
                      <ListItemText
                        primary={
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1
                            }}
                          >
                            <Typography variant="body1">
                              {server.name}
                            </Typography>
                            {server.enabled &&
                              agentManagerFactory?.isMCPServerConnected(
                                server.name
                              ) && (
                                <CheckCircleOutline
                                  sx={{ color: 'success.main', fontSize: 16 }}
                                />
                              )}
                            {server.enabled &&
                              !agentManagerFactory?.isMCPServerConnected(
                                server.name
                              ) && (
                                <ErrorOutline
                                  sx={{ color: 'error.main', fontSize: 16 }}
                                />
                              )}
                            <Switch
                              checked={server.enabled}
                              onChange={e =>
                                model.updateMCPServer(server.id, {
                                  enabled: e.target.checked
                                })
                              }
                              size="small"
                              color="primary"
                            />
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography variant="body2" color="text.secondary">
                              {server.url}
                            </Typography>
                            {server.enabled && agentManagerFactory && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Status:{' '}
                                {agentManagerFactory.isMCPServerConnected(
                                  server.name
                                )
                                  ? 'Connected'
                                  : 'Connection failed'}
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                      <ListItemSecondaryAction>
                        <IconButton
                          onClick={e => handleMCPMenuClick(e, server.id)}
                          size="small"
                        >
                          <MoreVert />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        )}

        {/* Provider Configuration Dialog */}
        <ProviderConfigDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSave={editingProvider ? handleEditProvider : handleAddProvider}
          initialConfig={editingProvider}
          mode={editingProvider ? 'edit' : 'add'}
          providerRegistry={providerRegistry}
          handleSecretField={handleSecretField}
        />

        {/* Provider Menu */}
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={handleMenuClose}
        >
          <MenuItem
            onClick={() => {
              const provider = config.providers.find(
                p => p.id === menuProviderId
              );
              if (provider) {
                openEditDialog(provider);
              }
            }}
          >
            <Edit sx={{ mr: 1 }} />
            Edit
          </MenuItem>
          <MenuItem
            onClick={() => handleDeleteProvider(menuProviderId)}
            sx={{ color: 'error.main' }}
          >
            <Delete sx={{ mr: 1 }} />
            Delete
          </MenuItem>
        </Menu>

        {/* MCP Server Configuration Dialog */}
        <MCPServerDialog
          open={mcpDialogOpen}
          onClose={() => setMcpDialogOpen(false)}
          onSave={editingMCPServer ? handleEditMCPServer : handleAddMCPServer}
          initialConfig={editingMCPServer}
          mode={editingMCPServer ? 'edit' : 'add'}
        />

        {/* MCP Server Menu */}
        <Menu
          anchorEl={mcpMenuAnchor}
          open={Boolean(mcpMenuAnchor)}
          onClose={handleMCPMenuClose}
        >
          <MenuItem
            onClick={() => {
              const server = config.mcpServers.find(
                s => s.id === mcpMenuServerId
              );
              if (server) {
                openEditMCPDialog(server);
              }
            }}
          >
            <Edit sx={{ mr: 1 }} />
            Edit
          </MenuItem>
          <MenuItem
            onClick={() => handleDeleteMCPServer(mcpMenuServerId)}
            sx={{ color: 'error.main' }}
          >
            <Delete sx={{ mr: 1 }} />
            Delete
          </MenuItem>
        </Menu>
      </Box>
    </ThemeProvider>
  );
};

/**
 * Props interface for the MCPServerDialog component
 */
interface IMCPServerDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (config: Omit<IMCPServerConfig, 'id'>) => void;
  initialConfig?: IMCPServerConfig;
  mode: 'add' | 'edit';
}

/**
 * Dialog component for adding/editing MCP server configurations
 * @param props - Component props for the MCP server dialog
 * @returns A React component for MCP server configuration
 */
const MCPServerDialog: React.FC<IMCPServerDialogProps> = ({
  open,
  onClose,
  onSave,
  initialConfig,
  mode
}) => {
  const [name, setName] = useState(initialConfig?.name || '');
  const [url, setUrl] = useState(initialConfig?.url || '');
  const [enabled, setEnabled] = useState(initialConfig?.enabled ?? true);

  /**
   * Effect to reset dialog state when opened with new config
   */
  useEffect(() => {
    if (open) {
      setName(initialConfig?.name || '');
      setUrl(initialConfig?.url || '');
      setEnabled(initialConfig?.enabled ?? true);
    }
  }, [open, initialConfig]);

  /**
   * Handle saving the MCP server configuration
   */
  const handleSave = () => {
    if (!name.trim() || !url.trim()) {
      return;
    }

    onSave({
      name: name.trim(),
      url: url.trim(),
      enabled
    });
    onClose();
  };

  /**
   * Check if a URL is valid
   * @param url - The URL to validate
   * @returns true if the URL is valid
   */
  const _isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const canSave = name.trim() && url.trim() && _isValidUrl(url.trim());

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {mode === 'add' ? 'Add MCP Server' : 'Edit MCP Server'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            autoFocus
            fullWidth
            label="Server Name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="My MCP Server"
            helperText="A friendly name to identify this MCP server"
          />
          <TextField
            fullWidth
            label="Server URL"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://example.com/mcp"
            helperText="The HTTP/HTTPS URL of the MCP server"
            error={Boolean(url.trim() && !_isValidUrl(url.trim()))}
          />
          <FormControlLabel
            control={
              <Switch
                checked={enabled}
                onChange={e => setEnabled(e.target.checked)}
                color="primary"
              />
            }
            label="Enable this server"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!canSave}>
          {mode === 'add' ? 'Add' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

/**
 * Namespace for AISettingsWidget types and interfaces
 */
export namespace AISettingsWidget {
  /**
   * Options interface for constructing an AISettingsWidget
   */
  export interface IOptions {
    settingsModel: AISettingsModel;
    agentManagerFactory?: AgentManagerFactory;
    themeManager?: IThemeManager;
    providerRegistry: IProviderRegistry;
    /**
     * The secrets manager.
     */
    secretsManager?: ISecretsManager;
    /**
     * The token used to request the secrets manager.
     */
    token: symbol;
  }
}

namespace Private {
  /**
   * The token to use with the secrets manager, setter and getter.
   */
  let secretsToken: symbol;
  export function setToken(value: symbol): void {
    secretsToken = value;
  }
  export function getToken(): symbol {
    return secretsToken;
  }
}
