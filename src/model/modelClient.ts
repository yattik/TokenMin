/**
 * `vscode.lm` client: selects a Copilot chat model by family (with fallback to
 * any available Copilot model) and adapts it to the pure {@link ModelInvoker}
 * interface. Selection is consent-gated and user-initiated by VS Code; this
 * pass consumes the user's Copilot quota.
 */
import * as vscode from 'vscode';
import { ModelInvoker, ModelPrompt } from './types';

export async function createModelInvoker(
  family: string,
  token?: vscode.CancellationToken,
): Promise<ModelInvoker | undefined> {
  let models: vscode.LanguageModelChat[] = [];
  try {
    models = await vscode.lm.selectChatModels({ vendor: 'copilot', family });
    if (models.length === 0) {
      // Fall back to any available Copilot model.
      models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    }
  } catch {
    return undefined;
  }

  if (models.length === 0) {
    return undefined;
  }

  const model = models[0];
  const cancellation = token ?? new vscode.CancellationTokenSource().token;

  return {
    modelName: model.name,
    maxInputTokens: model.maxInputTokens,
    async invoke(prompt: ModelPrompt): Promise<string> {
      const messages = [
        vscode.LanguageModelChatMessage.User(`${prompt.system}\n\n${prompt.user}`),
      ];
      const response = await model.sendRequest(messages, {}, cancellation);
      let text = '';
      for await (const fragment of response.text) {
        text += fragment;
      }
      return text;
    },
  };
}
