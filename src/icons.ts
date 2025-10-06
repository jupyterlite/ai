import { LabIcon } from '@jupyterlab/ui-components';

import labaiIconSvg from '../style/icons/jupyternaut-lite.svg';

export const labaiIcon = new LabIcon({
  name: '@jupyterlite/ai:icon',
  svgstr: labaiIconSvg
});

export const jupyternautIcon = new LabIcon({
  name: '@jupyterlite/ai:jupyternaut',
  svgstr: labaiIconSvg
});

const AI_AVATAR_BASE64 = btoa(jupyternautIcon.svgstr);
export const AI_AVATAR = `data:image/svg+xml;base64,${AI_AVATAR_BASE64}`;
