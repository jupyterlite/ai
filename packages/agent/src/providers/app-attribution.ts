import { PageConfig } from '@jupyterlab/coreutils';

/**
 * The application name and URL reported to the providers that support app
 * attribution, such as OpenRouter.
 */
export interface IAppAttribution {
  name: string;
  url: string;
}

/**
 * The page config option that sets the app attribution. It is not a user
 * setting because the deployment sets it.
 */
const APP_ATTRIBUTION_OPTION = 'appAttribution';

const DEFAULT_APP_ATTRIBUTION: IAppAttribution = {
  name: 'JupyterLite AI',
  url: 'https://github.com/jupyterlite/ai'
};

/**
 * Get the app attribution from the page config, or the default one.
 * A value missing from the page config is empty, so it is not sent.
 */
export function getAppAttribution(): IAppAttribution {
  const option = PageConfig.getOption(APP_ATTRIBUTION_OPTION);
  if (!option) {
    return DEFAULT_APP_ATTRIBUTION;
  }
  try {
    const { name = '', url = '' } = JSON.parse(
      option
    ) as Partial<IAppAttribution>;
    return { name, url };
  } catch {
    console.warn(`Invalid "${APP_ATTRIBUTION_OPTION}" page config option`);
    return DEFAULT_APP_ATTRIBUTION;
  }
}
