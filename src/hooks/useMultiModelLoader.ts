import { useState, useCallback, useRef } from 'react';
import { ModelManager, EventBus } from '@runanywhere/web';

export type MultiModelState = 'idle' | 'downloading' | 'loading' | 'ready' | 'error';

export interface ModelProgress {
  modelId: string;
  name: string;
  progress: number;
  sizeBytes?: number;
  status: 'pending' | 'downloading' | 'downloaded' | 'loading' | 'loaded';
}

interface MultiModelLoaderResult {
  state: MultiModelState;
  models: ModelProgress[];
  error: string | null;
  loadAll: () => Promise<boolean>;
}

/**
 * Hook to download + load multiple models with per-model progress tracking.
 * Used for voice pipeline which requires VAD + STT + LLM + TTS loaded simultaneously.
 */
export function useMultiModelLoader(modelIds: string[]): MultiModelLoaderResult {
  const [state, setState] = useState<MultiModelState>('idle');
  const [models, setModels] = useState<ModelProgress[]>(() => {
    const allModels = ModelManager.getModels();
    return modelIds.map((id) => {
      const model = allModels.find((m) => m.id === id);
      // Map SDK status to our UI status
      let status: ModelProgress['status'] = 'pending';
      if (model?.status === 'loaded') {
        status = 'loaded';
      } else if (model?.status === 'downloaded') {
        status = 'downloaded';
      }
      
      return {
        modelId: id,
        name: model?.name ?? id,
        progress: status === 'downloaded' || status === 'loaded' ? 1 : 0,
        sizeBytes: model?.memoryRequirement,
        status,
      };
    });
  });
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const loadAll = useCallback(async (): Promise<boolean> => {
    if (loadingRef.current) return false;
    loadingRef.current = true;

    try {
      setError(null);

      // Check if we need to download anything
      const allModels = ModelManager.getModels();
      const needsDownload = modelIds.some((id) => {
        const model = allModels.find((m) => m.id === id);
        return model?.status !== 'downloaded' && model?.status !== 'loaded';
      });

      // Only show downloading state if we actually need to download
      if (needsDownload) {
        setState('downloading');
      }

      // Subscribe to download progress
      const unsub = EventBus.shared.on('model.downloadProgress', (evt) => {
        setModels((prev) =>
          prev.map((m) =>
            m.modelId === evt.modelId
              ? { ...m, progress: evt.progress ?? 0, status: 'downloading' }
              : m
          )
        );
      });

      // Download models that aren't cached
      for (const modelId of modelIds) {
        const allModels = ModelManager.getModels();
        const model = allModels.find((m) => m.id === modelId);
        if (!model) {
          throw new Error(`Model ${modelId} not found in catalog`);
        }

        // Only download if not already cached
        if (model.status !== 'downloaded' && model.status !== 'loaded') {
          setModels((prev) =>
            prev.map((m) => (m.modelId === modelId ? { ...m, status: 'downloading' } : m))
          );

          await ModelManager.downloadModel(modelId);

          setModels((prev) =>
            prev.map((m) =>
              m.modelId === modelId ? { ...m, progress: 1, status: 'downloaded' } : m
            )
          );
        } else {
          // Already cached - just mark as downloaded
          setModels((prev) =>
            prev.map((m) =>
              m.modelId === modelId ? { ...m, progress: 1, status: 'downloaded' } : m
            )
          );
        }
      }

      unsub();

      // Load all models into memory with coexist: true
      setState('loading');

      for (const modelId of modelIds) {
        // Skip loading if already loaded
        const currentModel = ModelManager.getModels().find((m) => m.id === modelId);
        if (currentModel?.status === 'loaded') {
          setModels((prev) =>
            prev.map((m) => (m.modelId === modelId ? { ...m, status: 'loaded' } : m))
          );
          continue;
        }

        setModels((prev) =>
          prev.map((m) => (m.modelId === modelId ? { ...m, status: 'loading' } : m))
        );

        const ok = await ModelManager.loadModel(modelId, { coexist: true });

        if (!ok) {
          throw new Error(`Failed to load model ${modelId}`);
        }

        setModels((prev) =>
          prev.map((m) => (m.modelId === modelId ? { ...m, status: 'loaded' } : m))
        );
      }

      setState('ready');
      return true;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
      setState('error');
      return false;
    } finally {
      loadingRef.current = false;
    }
  }, [modelIds]);

  return { state, models, error, loadAll };
}
