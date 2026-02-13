import ExpandMore from '@mui/icons-material/ExpandMore';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Switch,
  TextField,
  Typography
} from '@mui/material';
import type { TranslationBundle } from '@jupyterlab/translation';
import React from 'react';
import { IProviderConfig, IProviderParameters } from '../models/settings-model';
import type { IProviderRegistry } from '../tokens';

/**
 * Default parameter values for provider configuration
 */
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TURNS = 25;

function toRecord(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  return {};
}

function parseCommaSeparatedList(value: string): string[] | undefined {
  const values = value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function formatCommaSeparatedList(value: unknown): string {
  if (!Array.isArray(value)) {
    return '';
  }
  return value.filter(item => typeof item === 'string').join(', ');
}

function sanitizeCustomSettingsForProvider(
  provider: string,
  customSettings: Record<string, any>
): Record<string, any> {
  const result: Record<string, any> = {};
  const webSearch = toRecord(customSettings.webSearch);
  const webFetch = toRecord(customSettings.webFetch);
  const supportsWebSearch =
    provider === 'openai' || provider === 'anthropic' || provider === 'google';
  const supportsWebFetch = provider === 'anthropic';

  if (supportsWebSearch && webSearch.enabled === true) {
    result.webSearch = webSearch;
  }

  if (supportsWebFetch && webFetch.enabled === true) {
    result.webFetch = webFetch;
  }

  return result;
}

interface IProviderConfigDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (config: Omit<IProviderConfig, 'id'>) => void;
  initialConfig?: IProviderConfig;
  mode: 'add' | 'edit';
  providerRegistry: IProviderRegistry;
  handleSecretField: (
    input: HTMLInputElement,
    provider: string,
    fieldName: string
  ) => Promise<void>;
  trans: TranslationBundle;
}

export const ProviderConfigDialog: React.FC<IProviderConfigDialogProps> = ({
  open,
  onClose,
  onSave,
  initialConfig,
  mode,
  providerRegistry,
  handleSecretField,
  trans
}) => {
  const apiKeyRef = React.useRef<HTMLInputElement>();
  const [name, setName] = React.useState(initialConfig?.name || '');
  const [provider, setProvider] = React.useState(
    initialConfig?.provider || 'anthropic'
  );
  const [model, setModel] = React.useState(initialConfig?.model || '');
  const [apiKey, setApiKey] = React.useState(initialConfig?.apiKey || '');
  const [baseURL, setBaseURL] = React.useState(initialConfig?.baseURL || '');
  const [showApiKey, setShowApiKey] = React.useState(false);
  const [customSettings, setCustomSettings] = React.useState<
    Record<string, any>
  >(initialConfig?.customSettings || {});

  const [parameters, setParameters] = React.useState<IProviderParameters>(
    initialConfig?.parameters || {}
  );

  const [expandedAdvanced, setExpandedAdvanced] = React.useState(false);
  const supportsWebSearch =
    provider === 'openai' || provider === 'anthropic' || provider === 'google';
  const supportsWebFetch = provider === 'anthropic';
  const webSearchSettings = React.useMemo(
    () => toRecord(customSettings.webSearch),
    [customSettings]
  );
  const webFetchSettings = React.useMemo(
    () => toRecord(customSettings.webFetch),
    [customSettings]
  );

  // Get provider options from registry
  const providerOptions = React.useMemo(() => {
    const providers = providerRegistry.providers;
    return Object.keys(providers).map(id => {
      const info = providers[id];
      return {
        value: id,
        label: info.name,
        models: info.defaultModels,
        apiKeyRequirement: info.apiKeyRequirement,
        allowCustomModel: id === 'generic', // Generic allows custom models
        supportsBaseURL: info.supportsBaseURL,
        description: info.description,
        baseUrls: info.baseUrls
      };
    });
  }, [providerRegistry]);

  const selectedProvider = providerOptions.find(p => p.value === provider);

  React.useEffect(() => {
    if (open) {
      // Reset form when dialog opens
      setName(initialConfig?.name || '');
      setProvider(initialConfig?.provider || 'anthropic');
      setModel(initialConfig?.model || '');
      setApiKey(initialConfig?.apiKey || '');
      setBaseURL(initialConfig?.baseURL || '');
      setParameters(initialConfig?.parameters || {});
      setCustomSettings(initialConfig?.customSettings || {});
      setShowApiKey(false);
      setExpandedAdvanced(false);
    } else {
      // Reset expanded state when dialog closes
      setExpandedAdvanced(false);
    }
  }, [open, initialConfig]);

  React.useEffect(() => {
    // Auto-select first model when provider changes
    if (selectedProvider && selectedProvider.models.length > 0 && !model) {
      setModel(selectedProvider.models[0]);
    }
  }, [provider, selectedProvider, model]);

  React.useEffect(() => {
    // Attach the API key field to the secrets manager, to automatically save the value
    // when it is updated.
    if (open && apiKeyRef.current) {
      handleSecretField(apiKeyRef.current, provider, 'apiKey');
    }
  }, [open, provider, apiKeyRef.current]);

  const updateCustomSetting = React.useCallback(
    (section: 'webSearch' | 'webFetch', key: string, value: unknown) => {
      setCustomSettings(prev => {
        const next = { ...prev };
        const sectionSettings = { ...toRecord(next[section]) };
        const shouldDelete =
          value === undefined ||
          value === null ||
          value === '' ||
          (Array.isArray(value) && value.length === 0);

        if (shouldDelete) {
          delete sectionSettings[key];
        } else {
          sectionSettings[key] = value;
        }

        if (Object.keys(sectionSettings).length === 0) {
          delete next[section];
        } else {
          next[section] = sectionSettings;
        }

        return next;
      });
    },
    []
  );

  const handleSave = () => {
    if (!name.trim() || !provider || !model) {
      return;
    }

    // Only include parameters if at least one is set
    const hasParameters = Object.keys(parameters).some(
      key => parameters[key as keyof IProviderParameters] !== undefined
    );
    const sanitizedCustomSettings = sanitizeCustomSettingsForProvider(
      provider,
      customSettings
    );

    const config: Omit<IProviderConfig, 'id'> = {
      name: name.trim(),
      provider: provider as IProviderConfig['provider'],
      model,
      ...(apiKey && { apiKey }),
      ...(baseURL && { baseURL }),
      ...(hasParameters && { parameters }),
      ...(Object.keys(sanitizedCustomSettings).length > 0 && {
        customSettings: sanitizedCustomSettings
      })
    };

    onSave(config);
    onClose();
  };

  const isValid =
    name.trim() &&
    provider &&
    model &&
    (selectedProvider?.apiKeyRequirement !== 'required' || apiKey);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {mode === 'add'
          ? trans.__('Add New Provider')
          : trans.__('Edit Provider')}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            fullWidth
            label={trans.__('Provider Name')}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={trans.__('e.g., My Anthropic Config, Work Provider')}
            helperText={trans.__(
              'A friendly name to identify this provider configuration'
            )}
            required
          />

          <FormControl fullWidth required>
            <InputLabel>{trans.__('Provider Type')}</InputLabel>
            <Select
              value={provider}
              label={trans.__('Provider Type')}
              onChange={e =>
                setProvider(e.target.value as IProviderConfig['provider'])
              }
            >
              {providerOptions.map(option => (
                <MenuItem key={option.value} value={option.value}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {option.label}
                      {option.apiKeyRequirement === 'required' && (
                        <Chip
                          size="small"
                          label={trans.__('API Key')}
                          color="default"
                          variant="outlined"
                        />
                      )}
                    </Box>
                    {option.description && (
                      <Typography variant="caption" color="text.secondary">
                        {option.description}
                      </Typography>
                    )}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {selectedProvider?.allowCustomModel ? (
            <TextField
              fullWidth
              label={trans.__('Model')}
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder={trans.__('Enter model name')}
              helperText={trans.__('Enter any compatible model name')}
              required
            />
          ) : (
            <FormControl fullWidth required>
              <InputLabel>{trans.__('Model')}</InputLabel>
              <Select
                value={model}
                label={trans.__('Model')}
                onChange={e => setModel(e.target.value)}
              >
                {selectedProvider?.models.map(modelOption => (
                  <MenuItem key={modelOption} value={modelOption}>
                    <Box>
                      <Typography variant="body1">{modelOption}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {modelOption.includes('sonnet')
                          ? trans.__('Balanced performance')
                          : modelOption.includes('opus')
                            ? trans.__('Advanced reasoning')
                            : modelOption.includes('haiku')
                              ? trans.__('Fast and lightweight')
                              : modelOption.includes('large')
                                ? trans.__('Most capable model')
                                : modelOption.includes('small')
                                  ? trans.__('Fast and efficient')
                                  : modelOption.includes('codestral')
                                    ? trans.__('Code-specialized')
                                    : trans.__('General purpose')}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {selectedProvider &&
            selectedProvider?.apiKeyRequirement !== 'none' && (
              <TextField
                fullWidth
                inputRef={apiKeyRef}
                label={
                  selectedProvider?.apiKeyRequirement === 'required'
                    ? trans.__('API Key')
                    : trans.__('API Key (Optional)')
                }
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={trans.__('Enter your API key...')}
                required={selectedProvider?.apiKeyRequirement === 'required'}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowApiKey(!showApiKey)}
                        edge="end"
                      >
                        {showApiKey ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
            )}

          {selectedProvider?.supportsBaseURL && (
            <Autocomplete
              freeSolo
              fullWidth
              options={(selectedProvider.baseUrls ?? []).map(
                option => option.url
              )}
              value={baseURL || ''}
              onChange={(_, value) => {
                if (value && typeof value === 'string') {
                  setBaseURL(value);
                }
              }}
              inputValue={baseURL || ''}
              renderOption={(props, option) => {
                const urlOption = (selectedProvider.baseUrls ?? []).find(
                  u => u.url === option
                );
                return (
                  <Box component="li" {...props} key={option}>
                    <Box>
                      <Typography variant="body2">{option}</Typography>
                      {urlOption?.description && (
                        <Typography variant="caption" color="text.secondary">
                          {urlOption.description}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                );
              }}
              renderInput={params => (
                <TextField
                  {...params}
                  fullWidth
                  label={trans.__('Base URL')}
                  placeholder="https://api.example.com/v1"
                  onChange={e => setBaseURL(e.target.value)}
                />
              )}
              clearOnBlur={false}
            />
          )}

          {/* Advanced Settings Section */}
          <Accordion
            expanded={expandedAdvanced}
            onChange={(_, isExpanded) => setExpandedAdvanced(isExpanded)}
            sx={{
              mt: 2,
              bgcolor: 'transparent',
              boxShadow: 'none',
              border: 1,
              borderColor: 'divider',
              borderRadius: 1
            }}
          >
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="subtitle1" fontWeight="medium">
                {trans.__('Advanced Settings')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ bgcolor: 'transparent' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box>
                  <Typography gutterBottom>
                    {trans.__(
                      'Temperature: %1',
                      parameters.temperature ?? trans.__('Default')
                    )}
                  </Typography>
                  <Slider
                    value={parameters.temperature ?? DEFAULT_TEMPERATURE}
                    onChange={(_, value) =>
                      setParameters({
                        ...parameters,
                        temperature: value as number
                      })
                    }
                    min={0}
                    max={2}
                    step={0.1}
                    valueLabelDisplay="auto"
                  />
                  <Typography variant="caption" color="text.secondary">
                    {trans.__(
                      'Temperature for the model (lower values are more deterministic)'
                    )}
                  </Typography>
                </Box>

                <TextField
                  fullWidth
                  label={trans.__('Max Tokens (Optional)')}
                  type="number"
                  value={parameters.maxOutputTokens ?? ''}
                  onChange={e =>
                    setParameters({
                      ...parameters,
                      maxOutputTokens: e.target.value
                        ? Number(e.target.value)
                        : undefined
                    })
                  }
                  placeholder={trans.__('Leave empty for provider default')}
                  helperText={trans.__('Maximum length of AI responses')}
                  inputProps={{ min: 1 }}
                />

                <TextField
                  fullWidth
                  label={trans.__('Max Turns (Optional)')}
                  type="number"
                  value={parameters.maxTurns ?? ''}
                  onChange={e =>
                    setParameters({
                      ...parameters,
                      maxTurns: e.target.value
                        ? Number(e.target.value)
                        : undefined
                    })
                  }
                  placeholder={trans.__('Default: %1', DEFAULT_MAX_TURNS)}
                  helperText={trans.__(
                    'Maximum number of tool execution turns'
                  )}
                  inputProps={{ min: 1, max: 100 }}
                />

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 2, mb: 1 }}
                >
                  {trans.__('Completion Options')}
                </Typography>

                <FormControlLabel
                  control={
                    <Switch
                      checked={parameters.supportsFillInMiddle ?? false}
                      onChange={e =>
                        setParameters({
                          ...parameters,
                          supportsFillInMiddle: e.target.checked
                        })
                      }
                    />
                  }
                  label={trans.__('Fill-in-the-middle support')}
                />

                <FormControlLabel
                  control={
                    <Switch
                      checked={parameters.useFilterText ?? false}
                      onChange={e =>
                        setParameters({
                          ...parameters,
                          useFilterText: e.target.checked
                        })
                      }
                    />
                  }
                  label={trans.__('Use filter text')}
                />

                {(supportsWebSearch || supportsWebFetch) && (
                  <>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 2, mb: 1 }}
                    >
                      {trans.__('Provider Web Tools')}
                    </Typography>

                    {supportsWebSearch && (
                      <>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={webSearchSettings.enabled === true}
                              onChange={e =>
                                updateCustomSetting(
                                  'webSearch',
                                  'enabled',
                                  e.target.checked
                                )
                              }
                            />
                          }
                          label={trans.__('Enable Web Search')}
                        />

                        {webSearchSettings.enabled === true && (
                          <Box
                            sx={{
                              pl: 2,
                              borderLeft: 2,
                              borderColor: 'divider',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 1.5
                            }}
                          >
                            {(provider === 'openai' ||
                              provider === 'anthropic') && (
                              <TextField
                                fullWidth
                                label={trans.__(
                                  'Allowed Domains (comma-separated)'
                                )}
                                value={formatCommaSeparatedList(
                                  webSearchSettings.allowedDomains
                                )}
                                onChange={e =>
                                  updateCustomSetting(
                                    'webSearch',
                                    'allowedDomains',
                                    parseCommaSeparatedList(e.target.value)
                                  )
                                }
                                placeholder={trans.__(
                                  'example.com, news.example.org'
                                )}
                              />
                            )}

                            {provider === 'openai' && (
                              <>
                                <FormControl fullWidth>
                                  <InputLabel>
                                    {trans.__('Search Context Size')}
                                  </InputLabel>
                                  <Select
                                    value={
                                      webSearchSettings.searchContextSize ??
                                      'medium'
                                    }
                                    label={trans.__('Search Context Size')}
                                    onChange={e =>
                                      updateCustomSetting(
                                        'webSearch',
                                        'searchContextSize',
                                        e.target.value
                                      )
                                    }
                                  >
                                    <MenuItem value="low">
                                      {trans.__('Low')}
                                    </MenuItem>
                                    <MenuItem value="medium">
                                      {trans.__('Medium')}
                                    </MenuItem>
                                    <MenuItem value="high">
                                      {trans.__('High')}
                                    </MenuItem>
                                  </Select>
                                </FormControl>
                                <FormControlLabel
                                  control={
                                    <Switch
                                      checked={
                                        webSearchSettings.externalWebAccess !==
                                        false
                                      }
                                      onChange={e =>
                                        updateCustomSetting(
                                          'webSearch',
                                          'externalWebAccess',
                                          e.target.checked
                                        )
                                      }
                                    />
                                  }
                                  label={trans.__('Use External Web Access')}
                                />
                              </>
                            )}

                            {provider === 'anthropic' && (
                              <>
                                <TextField
                                  fullWidth
                                  label={trans.__('Web Search Max Uses')}
                                  type="number"
                                  value={webSearchSettings.maxUses ?? ''}
                                  onChange={e =>
                                    updateCustomSetting(
                                      'webSearch',
                                      'maxUses',
                                      e.target.value
                                        ? Number(e.target.value)
                                        : undefined
                                    )
                                  }
                                  inputProps={{ min: 1 }}
                                />
                                <TextField
                                  fullWidth
                                  label={trans.__(
                                    'Blocked Domains (comma-separated)'
                                  )}
                                  value={formatCommaSeparatedList(
                                    webSearchSettings.blockedDomains
                                  )}
                                  onChange={e =>
                                    updateCustomSetting(
                                      'webSearch',
                                      'blockedDomains',
                                      parseCommaSeparatedList(e.target.value)
                                    )
                                  }
                                  placeholder={trans.__(
                                    'spam.example.com, ads.example.org'
                                  )}
                                />
                              </>
                            )}

                            {provider === 'google' && (
                              <>
                                <FormControl fullWidth>
                                  <InputLabel>
                                    {trans.__('Google Search Mode')}
                                  </InputLabel>
                                  <Select
                                    value={
                                      webSearchSettings.mode ??
                                      'MODE_UNSPECIFIED'
                                    }
                                    label={trans.__('Google Search Mode')}
                                    onChange={e =>
                                      updateCustomSetting(
                                        'webSearch',
                                        'mode',
                                        e.target.value
                                      )
                                    }
                                  >
                                    <MenuItem value="MODE_UNSPECIFIED">
                                      {trans.__('Always Retrieve')}
                                    </MenuItem>
                                    <MenuItem value="MODE_DYNAMIC">
                                      {trans.__('Dynamic Retrieval')}
                                    </MenuItem>
                                  </Select>
                                </FormControl>
                                <TextField
                                  fullWidth
                                  label={trans.__('Dynamic Threshold')}
                                  type="number"
                                  value={
                                    webSearchSettings.dynamicThreshold ?? ''
                                  }
                                  onChange={e =>
                                    updateCustomSetting(
                                      'webSearch',
                                      'dynamicThreshold',
                                      e.target.value
                                        ? Number(e.target.value)
                                        : undefined
                                    )
                                  }
                                  inputProps={{ min: 0, max: 1, step: 0.1 }}
                                />
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  {trans.__(
                                    'Google web search is currently skipped when function tools are enabled.'
                                  )}
                                </Typography>
                              </>
                            )}
                          </Box>
                        )}
                      </>
                    )}

                    {supportsWebFetch && (
                      <>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={webFetchSettings.enabled === true}
                              onChange={e =>
                                updateCustomSetting(
                                  'webFetch',
                                  'enabled',
                                  e.target.checked
                                )
                              }
                            />
                          }
                          label={trans.__('Enable Web Fetch')}
                        />

                        {webFetchSettings.enabled === true && (
                          <Box
                            sx={{
                              pl: 2,
                              borderLeft: 2,
                              borderColor: 'divider',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 1.5
                            }}
                          >
                            <TextField
                              fullWidth
                              label={trans.__('Web Fetch Max Uses')}
                              type="number"
                              value={webFetchSettings.maxUses ?? ''}
                              onChange={e =>
                                updateCustomSetting(
                                  'webFetch',
                                  'maxUses',
                                  e.target.value
                                    ? Number(e.target.value)
                                    : undefined
                                )
                              }
                              inputProps={{ min: 1 }}
                            />
                            <TextField
                              fullWidth
                              label={trans.__('Web Fetch Max Content Tokens')}
                              type="number"
                              value={webFetchSettings.maxContentTokens ?? ''}
                              onChange={e =>
                                updateCustomSetting(
                                  'webFetch',
                                  'maxContentTokens',
                                  e.target.value
                                    ? Number(e.target.value)
                                    : undefined
                                )
                              }
                              inputProps={{ min: 1 }}
                            />
                            <TextField
                              fullWidth
                              label={trans.__(
                                'Allowed Domains (comma-separated)'
                              )}
                              value={formatCommaSeparatedList(
                                webFetchSettings.allowedDomains
                              )}
                              onChange={e =>
                                updateCustomSetting(
                                  'webFetch',
                                  'allowedDomains',
                                  parseCommaSeparatedList(e.target.value)
                                )
                              }
                              placeholder={trans.__(
                                'docs.example.com, wikipedia.org'
                              )}
                            />
                            <TextField
                              fullWidth
                              label={trans.__(
                                'Blocked Domains (comma-separated)'
                              )}
                              value={formatCommaSeparatedList(
                                webFetchSettings.blockedDomains
                              )}
                              onChange={e =>
                                updateCustomSetting(
                                  'webFetch',
                                  'blockedDomains',
                                  parseCommaSeparatedList(e.target.value)
                                )
                              }
                              placeholder={trans.__(
                                'spam.example.com, tracker.example.net'
                              )}
                            />
                            <FormControlLabel
                              control={
                                <Switch
                                  checked={
                                    webFetchSettings.citationsEnabled === true
                                  }
                                  onChange={e =>
                                    updateCustomSetting(
                                      'webFetch',
                                      'citationsEnabled',
                                      e.target.checked
                                    )
                                  }
                                />
                              }
                              label={trans.__('Enable Citations')}
                            />
                          </Box>
                        )}
                      </>
                    )}
                  </>
                )}
              </Box>
            </AccordionDetails>
          </Accordion>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{trans.__('Cancel')}</Button>
        <Button onClick={handleSave} variant="contained" disabled={!isValid}>
          {mode === 'add' ? trans.__('Add Provider') : trans.__('Save Changes')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
