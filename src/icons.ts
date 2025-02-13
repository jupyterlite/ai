/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { LabIcon } from '@jupyterlab/ui-components';

/**
 * This icon is based on the jupyternaut icon from Jupyter AI:
 * https://github.com/jupyterlab/jupyter-ai/blob/main/packages/jupyter-ai/style/icons/jupyternaut.svg
 * With a small tweak for the colors to match the JupyterLite icon.
 */
import jupyternautLiteSvg from '../style/icons/jupyternaut-lite.svg';

export const jupyternautLiteIcon = new LabIcon({
  name: '@jupyterlite/ai:jupyternaut-lite',
  svgstr: jupyternautLiteSvg
});
