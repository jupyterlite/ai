import ExpandMore from '@mui/icons-material/ExpandMore';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
import React from 'react';
import { IProviderConfig, IProviderParameters } from '../models/settings-model';
import type { IProviderRegistry } from '../tokens';

/**
 * Default parameter values for provider configuration
 */
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TURNS = 25;

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
}

export const ProviderConfigDialog: React.FC<IProviderConfigDialogProps> = ({
  open,
  onClose,
  onSave,
  initialConfig,
  mode,
  providerRegistry,
  handleSecretField
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

  const [parameters, setParameters] = React.useState<IProviderParameters>(
    initialConfig?.parameters || {}
  );

  const [expandedAdvanced, setExpandedAdvanced] = React.useState(false);

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
        allowCustomModel: id === 'ollama' || id === 'generic', // Ollama and Generic allow custom models
        supportsBaseURL: info.supportsBaseURL,
        description: info.description
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

  const handleSave = () => {
    if (!name.trim() || !provider || !model) {
      return;
    }

    // Only include parameters if at least one is set
    const hasParameters = Object.keys(parameters).some(
      key => parameters[key as keyof IProviderParameters] !== undefined
    );

    const config: Omit<IProviderConfig, 'id'> = {
      name: name.trim(),
      provider: provider as IProviderConfig['provider'],
      model,
      ...(apiKey && { apiKey }),
      ...(baseURL && { baseURL }),
      ...(hasParameters && { parameters })
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
        {mode === 'add' ? 'Add New Provider' : 'Edit Provider'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            fullWidth
            label="Provider Name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., My Anthropic Config, Work Provider"
            helperText="A friendly name to identify this provider configuration"
            required
          />

          <FormControl fullWidth required>
            <InputLabel>Provider Type</InputLabel>
            <Select
              value={provider}
              label="Provider Type"
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
                          label="API Key"
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
              label="Model"
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="Enter model name"
              helperText="Enter any compatible model name"
              required
            />
          ) : (
            <FormControl fullWidth required>
              <InputLabel>Model</InputLabel>
              <Select
                value={model}
                label="Model"
                onChange={e => setModel(e.target.value)}
              >
                {selectedProvider?.models.map(modelOption => (
                  <MenuItem key={modelOption} value={modelOption}>
                    <Box>
                      <Typography variant="body1">{modelOption}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {modelOption.includes('sonnet')
                          ? 'Balanced performance'
                          : modelOption.includes('opus')
                            ? 'Advanced reasoning'
                            : modelOption.includes('haiku')
                              ? 'Fast and lightweight'
                              : modelOption.includes('large')
                                ? 'Most capable model'
                                : modelOption.includes('small')
                                  ? 'Fast and efficient'
                                  : modelOption.includes('codestral')
                                    ? 'Code-specialized'
                                    : 'General purpose'}
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
                    ? 'API Key'
                    : 'API Key (Optional)'
                }
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Enter your API key..."
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
            <TextField
              fullWidth
              label="Base URL (Optional)"
              value={baseURL}
              onChange={e => setBaseURL(e.target.value)}
              placeholder={
                provider === 'ollama'
                  ? 'http://localhost:11434/api'
                  : 'Custom API endpoint'
              }
              helperText={
                provider === 'ollama'
                  ? 'Ollama server endpoint'
                  : 'Custom API base URL (e.g., for LiteLLM proxy). Leave empty to use default provider endpoint.'
              }
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
                Advanced Settings
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ bgcolor: 'transparent' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box>
                  <Typography gutterBottom>
                    Temperature: {parameters.temperature ?? 'Default'}
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
                    Temperature for the model (lower values are more
                    deterministic)
                  </Typography>
                </Box>

                <TextField
                  fullWidth
                  label="Max Tokens (Optional)"
                  type="number"
                  value={parameters.maxTokens ?? ''}
                  onChange={e =>
                    setParameters({
                      ...parameters,
                      maxTokens: e.target.value
                        ? Number(e.target.value)
                        : undefined
                    })
                  }
                  placeholder="Leave empty for provider default"
                  helperText="Maximum length of AI responses"
                  inputProps={{ min: 1 }}
                />

                <TextField
                  fullWidth
                  label="Max Turns (Optional)"
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
                  placeholder={`Default: ${DEFAULT_MAX_TURNS}`}
                  helperText="Maximum number of tool execution turns"
                  inputProps={{ min: 1, max: 100 }}
                />

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 2, mb: 1 }}
                >
                  Completion Options
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
                  label="Fill-in-the-middle support"
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
                  label="Use filter text"
                />
              </Box>
            </AccordionDetails>
          </Accordion>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!isValid}>
          {mode === 'add' ? 'Add Provider' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
