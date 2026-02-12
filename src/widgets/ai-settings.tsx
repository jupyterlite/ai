import { IThemeManager } from '@jupyterlab/apputils';
import { ReactWidget } from '@jupyterlab/ui-components';
import type { TranslationBundle } from '@jupyterlab/translation';
import { Debouncer } from '@lumino/polling';
import Add from '@mui/icons-material/Add';
import Cable from '@mui/icons-material/Cable';
import CheckCircle from '@mui/icons-material/CheckCircle';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import Delete from '@mui/icons-material/Delete';
import Edit from '@mui/icons-material/Edit';
import Error from '@mui/icons-material/Error';
import ErrorOutline from '@mui/icons-material/ErrorOutline';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
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
  Tooltip,
  Typography,
  createTheme
} from '@mui/material';
import { ISecretsManager } from 'jupyter-secrets-manager';
import React, { useEffect, useMemo, useState } from 'react';
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
    this._trans = options.trans;
    this.id = 'jupyterlite-ai-settings';
    this.title.label = this._trans.__('AI Settings');
    this.title.caption = this._trans.__('Configure AI providers and behavior');
    this.title.closable = true;

    // Disable the secrets manager if the token is empty.
    if (!options.token) {
      this._settingsModel.updateConfig({ useSecretsManager: false });
      this._secretsManager = undefined;
    }
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
        trans={this._trans}
      />
    );
  }

  private _settingsModel: AISettingsModel;
  private _agentManagerFactory?: AgentManagerFactory;
  private _themeManager?: IThemeManager;
  private _providerRegistry: IProviderRegistry;
  private _secretsManager?: ISecretsManager;
  private _trans: TranslationBundle;
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
  trans: TranslationBundle;
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
  secretsManager,
  trans
}) => {
  if (!model) {
    return <div>{trans.__('Settings model not available')}</div>;
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
  const [systemPromptValue, setSystemPromptValue] = useState(
    config.systemPrompt
  );
  const systemPromptValueRef = React.useRef(config.systemPrompt);
  const [completionPromptValue, setCompletionPromptValue] = useState(
    config.completionSystemPrompt
  );
  const completionPromptValueRef = React.useRef(config.completionSystemPrompt);

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

  // Sync local state when config changes externally
  useEffect(() => {
    setSystemPromptValue(config.systemPrompt);
    systemPromptValueRef.current = config.systemPrompt;
  }, [config.systemPrompt]);

  useEffect(() => {
    setCompletionPromptValue(config.completionSystemPrompt);
    completionPromptValueRef.current = config.completionSystemPrompt;
  }, [config.completionSystemPrompt]);

  const promptDebouncer = useMemo(
    () =>
      new Debouncer(async () => {
        await handleConfigUpdate({
          systemPrompt: systemPromptValueRef.current,
          completionSystemPrompt: completionPromptValueRef.current
        });
      }, 1000),
    []
  );

  // Cleanup debouncer on unmount
  useEffect(() => {
    return () => {
      promptDebouncer.dispose();
    };
  }, [promptDebouncer]);

  const handleSystemPromptChange = (value: string) => {
    setSystemPromptValue(value);
    systemPromptValueRef.current = value;
    void promptDebouncer.invoke();
  };

  const handleCompletionPromptChange = (value: string) => {
    setCompletionPromptValue(value);
    completionPromptValueRef.current = value;
    void promptDebouncer.invoke();
  };

  const getSecretFromManager = async (
    provider: string,
    fieldName: string
  ): Promise<string | undefined> => {
    const token = Private.getToken();
    if (!token) {
      return;
    }
    const secret = await secretsManager?.get(
      token,
      SECRETS_NAMESPACE,
      `${provider}:${fieldName}`
    );
    return secret?.value;
  };

  const setSecretToManager = async (
    provider: string,
    fieldName: string,
    value: string
  ): Promise<void> => {
    const token = Private.getToken();
    if (!token) {
      return;
    }
    await secretsManager?.set(
      token,
      SECRETS_NAMESPACE,
      `${provider}:${fieldName}`,
      {
        namespace: SECRETS_NAMESPACE,
        id: `${provider}:${fieldName}`,
        value
      }
    );
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
    const token = Private.getToken();
    if (!token) {
      return;
    }
    await secretsManager?.attach(
      token,
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
        (await getSecretFromManager(provider.provider, 'apiKey')) ?? '';
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
          const settingsApiKey = provider.apiKey;
          // If the secrets manager doesn't have the current API key, set the current
          // one from settings.
          // Update the settings value with SECRETS_REPLACEMENT if a key exist in the
          // secrets manager (was already there or a value was set in settings).
          if (!(await getSecretFromManager(provider.provider, 'apiKey'))) {
            if (settingsApiKey !== undefined) {
              setSecretToManager(
                provider.provider,
                'apiKey',
                settingsApiKey !== SECRETS_REPLACEMENT ? settingsApiKey : ''
              );
              provider.apiKey = SECRETS_REPLACEMENT;
              await model.updateProvider(provider.id, provider);
            }
          } else {
            provider.apiKey = SECRETS_REPLACEMENT;
            await model.updateProvider(provider.id, provider);
          }
        }
      } else {
        for (const provider of model.config.providers) {
          const apiKey = await getSecretFromManager(
            provider.provider,
            'apiKey'
          );
          provider.apiKey = apiKey;
          await model.updateProvider(provider.id, provider);
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
          boxSizing: 'border-box',
          fontSize: '0.9rem'
        }}
      >
        {/* Header */}
        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Settings color="primary" sx={{ fontSize: 24 }} />
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
            {trans.__('AI Settings')}
          </Typography>
        </Box>
        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs
            value={activeTab}
            onChange={(_, newValue) => setActiveTab(newValue)}
          >
            <Tab label={trans.__('Providers')} />
            <Tab label={trans.__('Behavior')} />
            <Tab label={trans.__('MCP Servers')} />
          </Tabs>
        </Box>

        {/* Tab Panels */}
        {activeTab === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Default Provider Selection */}
            {config.providers.length > 0 && (
              <Card elevation={2}>
                <CardContent>
                  <Typography variant="h6" component="h2" gutterBottom>
                    {trans.__('Default Providers')}
                  </Typography>

                  <Box
                    sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                  >
                    <FormControl fullWidth>
                      <InputLabel>{trans.__('Chat Provider')}</InputLabel>
                      <Select
                        value={config.defaultProvider}
                        label={trans.__('Chat Provider')}
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
                      label={trans.__(
                        'Use same provider for chat and completions'
                      )}
                    />

                    {!config.useSameProviderForChatAndCompleter && (
                      <FormControl fullWidth>
                        <InputLabel>
                          {trans.__('Completion Provider')}
                        </InputLabel>
                        <Select
                          value={config.activeCompleterProvider || ''}
                          label={trans.__('Completion Provider')}
                          className="jp-ai-completion-provider-select"
                          onChange={e =>
                            model.setActiveCompleterProvider(
                              e.target.value || undefined
                            )
                          }
                        >
                          <MenuItem value="">
                            <em>{trans.__('No completion')}</em>
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
                      {trans.__('Configured Providers')}
                    </Typography>
                  </Box>
                  <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={openAddDialog}
                    size="small"
                  >
                    {trans.__('Add Provider')}
                  </Button>
                </Box>

                {config.providers.length === 0 ? (
                  <Alert severity="info">
                    {trans.__(
                      'No providers configured yet. Click "Add Provider" to get started.'
                    )}
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
                      const supportsWebSearch =
                        provider.provider === 'openai' ||
                        provider.provider === 'anthropic' ||
                        provider.provider === 'google';
                      const supportsWebFetch =
                        provider.provider === 'anthropic';
                      const webSearchEnabled =
                        supportsWebSearch &&
                        provider.customSettings?.webSearch?.enabled === true;
                      const webFetchEnabled =
                        supportsWebFetch &&
                        provider.customSettings?.webFetch?.enabled === true;

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
                                    label={trans.__('Chat')}
                                    size="small"
                                    color="primary"
                                    icon={<CheckCircle />}
                                  />
                                )}
                                {isActiveCompleter && (
                                  <Chip
                                    label={trans.__('Completion')}
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
                              {(params?.temperature !== undefined ||
                                params?.maxOutputTokens !== undefined ||
                                params?.maxTurns !== undefined ||
                                webSearchEnabled ||
                                webFetchEnabled) && (
                                <Box
                                  sx={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: 1,
                                    mt: 1
                                  }}
                                >
                                  {params?.temperature !== undefined && (
                                    <Chip
                                      label={trans.__(
                                        'Temp: %1',
                                        params.temperature
                                      )}
                                      size="small"
                                      variant="outlined"
                                    />
                                  )}
                                  {params?.maxOutputTokens !== undefined && (
                                    <Chip
                                      label={trans.__(
                                        'Tokens: %1',
                                        params.maxOutputTokens
                                      )}
                                      size="small"
                                      variant="outlined"
                                    />
                                  )}
                                  {params?.maxTurns !== undefined && (
                                    <Chip
                                      label={trans.__(
                                        'Turns: %1',
                                        params.maxTurns
                                      )}
                                      size="small"
                                      variant="outlined"
                                    />
                                  )}
                                  {webSearchEnabled && (
                                    <Chip
                                      label={trans.__('Web Search')}
                                      size="small"
                                      variant="outlined"
                                      color="info"
                                    />
                                  )}
                                  {webFetchEnabled && (
                                    <Chip
                                      label={trans.__('Web Fetch')}
                                      size="small"
                                      variant="outlined"
                                      color="info"
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

            {/* Secrets Manager Settings */}
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
                    <span>
                      {trans.__('Use the secrets manager to manage API keys')}
                    </span>
                    {!config.useSecretsManager && (
                      <Alert severity="warning" icon={<Error />} sx={{ mb: 2 }}>
                        {trans.__(
                          'The secrets are stored in plain text in settings'
                        )}
                      </Alert>
                    )}
                  </div>
                }
              />
            )}
          </Box>
        )}

        {activeTab === 1 && (
          <Card elevation={2}>
            <CardContent>
              <Typography variant="h6" component="h2" gutterBottom>
                {trans.__('Behavior Settings')}
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
                      <Typography variant="body1">
                        {trans.__('Enable Tools')}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {trans.__(
                          'Allow the AI to use tools like notebook operations, code execution, and file management'
                        )}
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
                        {trans.__('Send with Shift+Enter')}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {trans.__(
                          'Use Shift+Enter to send messages (Enter creates new line)'
                        )}
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
                      <Typography variant="body1">
                        {trans.__('Show Token Usage')}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {trans.__(
                          'Display token usage information in the chat toolbar'
                        )}
                      </Typography>
                    </Box>
                  }
                />

                <FormControlLabel
                  control={
                    <Switch
                      checked={config.showCellDiff}
                      onChange={e =>
                        handleConfigUpdate({
                          showCellDiff: e.target.checked
                        })
                      }
                      color="primary"
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body1">
                        {trans.__('Show Cell Diff')}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {trans.__(
                          'Show diff view when AI modifies cell content'
                        )}
                      </Typography>
                    </Box>
                  }
                />

                {config.showCellDiff && (
                  <FormControl sx={{ ml: 4 }}>
                    <InputLabel>{trans.__('Diff Display Mode')}</InputLabel>
                    <Select
                      value={config.diffDisplayMode}
                      label={trans.__('Diff Display Mode')}
                      onChange={e =>
                        handleConfigUpdate({
                          diffDisplayMode: e.target.value as 'split' | 'unified'
                        })
                      }
                    >
                      <MenuItem value="split">
                        {trans.__('Split View')}
                      </MenuItem>
                      <MenuItem value="unified">
                        {trans.__('Unified View')}
                      </MenuItem>
                    </Select>
                  </FormControl>
                )}

                <FormControlLabel
                  control={
                    <Switch
                      checked={config.showFileDiff}
                      onChange={e =>
                        handleConfigUpdate({
                          showFileDiff: e.target.checked
                        })
                      }
                      color="primary"
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body1">
                        {trans.__('Show File Diff')}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {trans.__(
                          'Show diff view when AI modifies file content'
                        )}
                      </Typography>
                    </Box>
                  }
                />

                <Divider sx={{ my: 1 }} />

                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label={trans.__('System Prompt')}
                  value={systemPromptValue}
                  onChange={e => handleSystemPromptChange(e.target.value)}
                  placeholder={trans.__(
                    "Define the AI's behavior and personality..."
                  )}
                  helperText={trans.__(
                    'Instructions that define how the AI should behave and respond'
                  )}
                />

                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label={trans.__('Completion System Prompt')}
                  value={completionPromptValue}
                  onChange={e => handleCompletionPromptChange(e.target.value)}
                  placeholder={trans.__(
                    'Define how the AI should generate code completions...'
                  )}
                  helperText={trans.__(
                    'Instructions that define how the AI should generate code completions'
                  )}
                />

                <Divider sx={{ my: 2 }} />

                <Box>
                  <Typography
                    variant="body1"
                    gutterBottom
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 1
                    }}
                  >
                    {trans.__('Skills Paths')}
                    <Tooltip
                      title={trans.__(
                        'Directories containing agent skills, relative to the server root. Skills are loaded from all paths; the first occurrence of a skill name takes priority.'
                      )}
                    >
                      <InfoOutlined sx={{ fontSize: 16 }} />
                    </Tooltip>
                  </Typography>

                  <List sx={{ mb: 2, maxHeight: 200, overflow: 'auto' }}>
                    {(config.skillsPaths ?? []).map((skillPath, index) => (
                      <ListItem
                        key={index}
                        divider
                        secondaryAction={
                          <IconButton
                            onClick={() => {
                              const newPaths = [...config.skillsPaths];
                              newPaths.splice(index, 1);
                              handleConfigUpdate({ skillsPaths: newPaths });
                            }}
                            size="small"
                          >
                            <Delete />
                          </IconButton>
                        }
                      >
                        <ListItemText primary={skillPath} />
                      </ListItem>
                    ))}
                  </List>

                  <TextField
                    fullWidth
                    label={trans.__('Add Skills Path')}
                    placeholder={trans.__('e.g., .claude/skills')}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const value = (
                          e.target as HTMLInputElement
                        ).value.trim();
                        if (
                          value &&
                          !(config.skillsPaths ?? []).includes(value)
                        ) {
                          const newPaths = [
                            ...(config.skillsPaths ?? []),
                            value
                          ];
                          handleConfigUpdate({ skillsPaths: newPaths });
                          (e.target as HTMLInputElement).value = '';
                        }
                      }
                    }}
                    helperText={trans.__(
                      'Press Enter to add a path. Defaults: .agents/skills, _agents/skills'
                    )}
                  />
                </Box>

                <Divider sx={{ my: 2 }} />

                <Box>
                  <Typography variant="body1" gutterBottom>
                    {trans.__('Commands Requiring Approval')}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    gutterBottom
                    sx={{ display: 'block' }}
                  >
                    {trans.__(
                      'Commands that require user approval before AI can execute them'
                    )}
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
                    label={trans.__('Add New Command')}
                    placeholder={trans.__('e.g., notebook:run-cell')}
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
                    helperText={trans.__(
                      'Press Enter to add a command. Common commands: notebook:run-cell, console:execute, fileeditor:run-code'
                    )}
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
                    {trans.__('Remote MCP Servers')}
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  startIcon={<Add />}
                  onClick={openAddMCPDialog}
                  size="small"
                >
                  {trans.__('Add Server')}
                </Button>
              </Box>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {trans.__(
                  "Configure remote Model Context Protocol (MCP) servers to extend the AI's capabilities with external tools and data sources."
                )}
              </Typography>

              {config.mcpServers.length === 0 ? (
                <Alert severity="info">
                  {trans.__(
                    'No MCP servers configured yet. Click "Add Server" to connect to remote MCP services.'
                  )}
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
                                {trans.__(
                                  'Status: %1',
                                  agentManagerFactory.isMCPServerConnected(
                                    server.name
                                  )
                                    ? trans.__('Connected')
                                    : trans.__('Connection failed')
                                )}
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
          trans={trans}
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
            {trans.__('Edit')}
          </MenuItem>
          <MenuItem
            onClick={() => handleDeleteProvider(menuProviderId)}
            sx={{ color: 'error.main' }}
          >
            <Delete sx={{ mr: 1 }} />
            {trans.__('Delete')}
          </MenuItem>
        </Menu>

        {/* MCP Server Configuration Dialog */}
        <MCPServerDialog
          open={mcpDialogOpen}
          onClose={() => setMcpDialogOpen(false)}
          onSave={editingMCPServer ? handleEditMCPServer : handleAddMCPServer}
          initialConfig={editingMCPServer}
          mode={editingMCPServer ? 'edit' : 'add'}
          trans={trans}
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
            {trans.__('Edit')}
          </MenuItem>
          <MenuItem
            onClick={() => handleDeleteMCPServer(mcpMenuServerId)}
            sx={{ color: 'error.main' }}
          >
            <Delete sx={{ mr: 1 }} />
            {trans.__('Delete')}
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
  trans: TranslationBundle;
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
  mode,
  trans
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
        {mode === 'add'
          ? trans.__('Add MCP Server')
          : trans.__('Edit MCP Server')}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            autoFocus
            fullWidth
            label={trans.__('Server Name')}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={trans.__('My MCP Server')}
            helperText={trans.__('A friendly name to identify this MCP server')}
          />
          <TextField
            fullWidth
            label={trans.__('Server URL')}
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder={trans.__('https://example.com/mcp')}
            helperText={trans.__('The HTTP/HTTPS URL of the MCP server')}
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
            label={trans.__('Enable this server')}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{trans.__('Cancel')}</Button>
        <Button onClick={handleSave} variant="contained" disabled={!canSave}>
          {mode === 'add' ? trans.__('Add') : trans.__('Save')}
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
    token: symbol | null;
    /**
     * The application language translation bundle.
     */
    trans: TranslationBundle;
  }
}

namespace Private {
  /**
   * The token to use with the secrets manager, setter and getter.
   */
  let secretsToken: symbol | null;
  export function setToken(value: symbol | null): void {
    secretsToken = value;
  }
  export function getToken(): symbol | null {
    return secretsToken;
  }
}
