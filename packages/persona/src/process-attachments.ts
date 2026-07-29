import type { IAttachment } from '@jupyter/chat';
import { YNotebook } from '@jupyter/ydoc';
import { PathExt } from '@jupyterlab/coreutils';
import type { IDocumentManager } from '@jupyterlab/docmanager';
import type { IDocumentWidget } from '@jupyterlab/docregistry';
import * as nbformat from '@jupyterlab/nbformat';
import type { INotebookModel, Notebook } from '@jupyterlab/notebook';
import type { UserContent, ImagePart, FilePart } from 'ai';

export async function processAttachments(
  attachments: IAttachment[],
  documentManager: IDocumentManager | null | undefined,
  body: string,
  supportsImages: boolean,
  supportsPdf: boolean,
  supportsAudio: boolean
): Promise<UserContent> {
  const textContents: string[] = [];
  const includedParts: Array<ImagePart | FilePart> = [];
  const omittedNames: string[] = [];

  if (!documentManager) {
    return body;
  }

  for (const attachment of attachments) {
    try {
      if (attachment.type === 'notebook' && attachment.cells?.length) {
        const cellContents = await readNotebookCells(
          attachment,
          documentManager
        );
        if (cellContents) {
          textContents.push(cellContents);
        }
      } else {
        let mimetype = attachment.mimetype;
        const fileExtension = PathExt.extname(attachment.value).toLowerCase();

        if (!mimetype) {
          try {
            const diskModel = await documentManager.services.contents.get(
              attachment.value,
              { content: false }
            );
            mimetype = diskModel?.mimetype;
          } catch (e) {
            console.warn(
              `Failed to fetch metadata for ${attachment.value}:`,
              e
            );
          }
        }

        if (mimetype?.startsWith('image/')) {
          if (supportsImages) {
            const data = await readBinaryAttachment(
              attachment,
              documentManager
            );
            if (data) {
              includedParts.push({
                type: 'image',
                image: data,
                mediaType: mimetype
              });
            }
          } else {
            omittedNames.push(PathExt.basename(attachment.value));
          }
        } else if (mimetype === 'application/pdf') {
          if (supportsPdf) {
            const data = await readBinaryAttachment(
              attachment,
              documentManager
            );
            if (data) {
              includedParts.push({
                type: 'file',
                data,
                mediaType: mimetype,
                filename: PathExt.basename(attachment.value)
              });
            }
          } else {
            omittedNames.push(PathExt.basename(attachment.value));
          }
        } else if (mimetype?.startsWith('audio/')) {
          if (supportsAudio) {
            const data = await readBinaryAttachment(
              attachment,
              documentManager
            );
            if (data) {
              includedParts.push({
                type: 'file',
                data,
                mediaType: mimetype,
                filename: PathExt.basename(attachment.value)
              });
            }
          } else {
            omittedNames.push(PathExt.basename(attachment.value));
          }
        } else {
          const fileContent = await readFileAttachment(
            attachment,
            documentManager
          );
          if (fileContent) {
            const language =
              fileExtension === '.ipynb' ||
              mimetype === 'application/x-ipynb+json'
                ? 'json'
                : '';
            textContents.push(
              `**File: ${attachment.value}**\n\`\`\`${language}\n${fileContent}\n\`\`\``
            );
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to read attachment ${attachment.value}:`, error);
      textContents.push(`**File: ${attachment.value}** (Could not read file)`);
    }
  }

  let textPart = body;
  if (textContents.length > 0) {
    textPart += '\n\n--- Attached Files ---\n' + textContents.join('\n\n');
  }
  if (omittedNames.length > 0) {
    textPart += `\n[Attachments omitted (not supported by this model): ${omittedNames.join(', ')}.]`;
  }

  return includedParts.length > 0
    ? [{ type: 'text', text: textPart }, ...includedParts]
    : textPart;
}

async function readBinaryAttachment(
  attachment: IAttachment,
  documentManager: IDocumentManager
): Promise<string | null> {
  try {
    const diskModel = await documentManager.services.contents.get(
      attachment.value,
      { content: true }
    );
    if (diskModel?.content && diskModel.format === 'base64') {
      return (diskModel.content as string).replace(/\s/g, '');
    }
    return null;
  } catch (error) {
    console.warn(
      `Failed to read binary attachment ${attachment.value}:`,
      error
    );
    return null;
  }
}

async function readNotebookCells(
  attachment: IAttachment,
  documentManager: IDocumentManager
): Promise<string | null> {
  if (attachment.type !== 'notebook' || !attachment.cells) {
    return null;
  }

  try {
    const widget = documentManager.findWidget(attachment.value) as
      | IDocumentWidget<Notebook, INotebookModel>
      | undefined;
    let cellData: nbformat.ICell[];
    let kernelLang = 'text';

    const ymodel = widget?.context.model.sharedModel as YNotebook;

    if (ymodel) {
      const nb = ymodel.toJSON();
      cellData = nb.cells;
      const lang =
        nb.metadata.language_info?.name ||
        nb.metadata.kernelspec?.language ||
        'text';
      kernelLang = String(lang);
    } else {
      const model = await documentManager.services.contents.get(
        attachment.value
      );
      if (!model || model.type !== 'notebook') {
        return null;
      }
      cellData = model.content.cells ?? [];
      kernelLang =
        model.content.metadata.language_info?.name ||
        model.content.metadata.kernelspec?.language ||
        'text';
    }

    const selectedCells = attachment.cells
      .map(cellInfo => {
        const cell = cellData.find(c => c.id === cellInfo.id);
        if (!cell) {
          return null;
        }
        const code = cell.source || '';
        const cellType = cell.cell_type;
        const lang = cellType === 'code' ? kernelLang : cellType;

        let outputs = '';
        if (cellType === 'code' && Array.isArray(cell.outputs)) {
          const outputsArray = cell.outputs as nbformat.IOutput[];
          outputs = outputsArray
            .map(output => {
              if (output.output_type === 'stream') {
                return (output as nbformat.IStream).text;
              } else if (output.output_type === 'error') {
                const err = output as nbformat.IError;
                return `${err.ename}: ${err.evalue}\n${(err.traceback || []).join('\n')}`;
              } else if (
                output.output_type === 'execute_result' ||
                output.output_type === 'display_data'
              ) {
                const data = (output as nbformat.IDisplayData).data;
                if (!data) {
                  return '';
                }
                try {
                  return extractDisplay(data);
                } catch (e) {
                  console.error('Cannot extract cell output', e);
                  return '';
                }
              }
              return '';
            })
            .filter(Boolean)
            .join('\n---\n');

          if (outputs.length > 2000) {
            outputs = outputs.slice(0, 2000) + '\n...[truncated]';
          }
        }

        return (
          `**Cell [${cellInfo.id}] (${cellType}):**\n` +
          `\`\`\`${lang}\n${code}\n\`\`\`` +
          (outputs ? `\n**Outputs:**\n\`\`\`text\n${outputs}\n\`\`\`` : '')
        );
      })
      .filter(Boolean)
      .join('\n\n');

    return `**Notebook: ${attachment.value}**\n${selectedCells}`;
  } catch (error) {
    console.warn(
      `Failed to read notebook cells from ${attachment.value}:`,
      error
    );
    return null;
  }
}

async function readFileAttachment(
  attachment: IAttachment,
  documentManager: IDocumentManager
): Promise<string | null> {
  if (attachment.type !== 'file' && attachment.type !== 'notebook') {
    return null;
  }

  try {
    const widget = documentManager.findWidget(attachment.value) as
      | IDocumentWidget<Notebook, INotebookModel>
      | undefined;

    if (widget?.context?.model) {
      const ymodel = widget.context.model.sharedModel as YNotebook;
      if (typeof ymodel.getSource === 'function') {
        const source = ymodel.getSource();
        return typeof source === 'string'
          ? source
          : JSON.stringify(source, null, 2);
      }
    }

    const diskModel = await documentManager.services.contents.get(
      attachment.value
    );
    if (!diskModel?.content) {
      return null;
    }

    if (diskModel.type === 'file') {
      return diskModel.content;
    }

    if (diskModel.type === 'notebook') {
      const cleaned = {
        ...diskModel,
        cells: diskModel.content.cells.map((cell: nbformat.ICell) => ({
          ...cell,
          outputs: [] as nbformat.IOutput[],
          execution_count: null
        }))
      };
      return JSON.stringify(cleaned);
    }
    return null;
  } catch (error) {
    console.warn(`Failed to read file ${attachment.value}:`, error);
    return null;
  }
}

function extractDisplay(data: nbformat.IMimeBundle): string {
  const DISPLAY_PRIORITY = [
    'application/vnd.jupyter.widget-view+json',
    'application/javascript',
    'text/html',
    'image/svg+xml',
    'image/png',
    'image/jpeg',
    'text/markdown',
    'text/latex',
    'text/plain'
  ];

  for (const mime of DISPLAY_PRIORITY) {
    if (!(mime in data)) {
      continue;
    }
    const value = data[mime];
    if (!value) {
      continue;
    }
    switch (mime) {
      case 'application/vnd.jupyter.widget-view+json':
        return `Widget: ${(value as { model_id?: string }).model_id ?? 'unknown model'}`;
      case 'image/png':
        return `![image](data:image/png;base64,${String(value).slice(0, 100)}...)`;
      case 'image/jpeg':
        return `![image](data:image/jpeg;base64,${String(value).slice(0, 100)}...)`;
      case 'image/svg+xml':
        return String(value).slice(0, 500) + '...\n[svg truncated]';
      case 'text/html':
        return (
          String(value).slice(0, 1000) +
          (String(value).length > 1000 ? '\n...[truncated]' : '')
        );
      case 'text/markdown':
      case 'text/latex':
      case 'text/plain': {
        let text = Array.isArray(value) ? value.join('') : String(value);
        if (text.length > 2000) {
          text = text.slice(0, 2000) + '\n...[truncated]';
        }
        return text;
      }
      default:
        return JSON.stringify(value).slice(0, 2000);
    }
  }
  return JSON.stringify(data).slice(0, 2000);
}
