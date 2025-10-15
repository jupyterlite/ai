import { LabIcon } from '@jupyterlab/ui-components';

import jupyternautSvg from '../style/icons/jupyternaut-lite.svg';

export const jupyternautIcon = new LabIcon({
  name: '@jupyterlite/ai:jupyternaut',
  svgstr: jupyternautSvg
});

const AI_AVATAR_BASE64 = btoa(jupyternautIcon.svgstr);
export const AI_AVATAR = `data:image/svg+xml;base64,${AI_AVATAR_BASE64}`;
