# MedSafe On-Device AI Medicine App

MedSafe is a React + TypeScript app built with the RunAnywhere SDK to demonstrate private, offline-capable healthcare assistance fully in the browser.

All model inference runs on-device via WebAssembly and WebGPU/CPU acceleration. No medication or symptom data is sent to cloud servers.

## Why On-Device AI

- Privacy: sensitive medication and symptom data remains on the user device.
- Offline support: core features continue working without internet.
- Low latency: no network roundtrip for AI responses.
- Data control: users can export and clear local history at any time.

## App Features

| Tab | What it does |
|-----|-------------|
| **Home** | Medication interaction checker using local LLM generation |
| **Voice** | Voice symptom reporter using on-device VAD + STT + LLM + TTS |
| **History** | Local-only AI interaction history with per-item delete and clear-all |
| **Profile** | Privacy architecture summary, local record count, export/clear controls |

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Models are downloaded on first use and cached in the browser's Origin Private File System (OPFS).

## How It Works

```
@runanywhere/web (npm package)
  ├── WASM engine (llama.cpp, whisper.cpp, sherpa-onnx)
  ├── Model management (download, OPFS cache, load/unload)
  └── TypeScript API (TextGeneration, STT, TTS, VAD, VLM, VoicePipeline)
```

MedSafe uses the RunAnywhere SDK APIs:

```typescript
import { RunAnywhere, SDKEnvironment, VoicePipeline } from '@runanywhere/web';
import { TextGeneration, VLMWorkerBridge } from '@runanywhere/web-llamacpp';

await RunAnywhere.initialize({ environment: SDKEnvironment.Development });

// Stream medication safety response
const { stream } = await TextGeneration.generateStream('Hello!', { maxTokens: 200 });
for await (const token of stream) { console.log(token); }

// Optional VLM usage for label scanning
const result = await VLMWorkerBridge.shared.process(rgbPixels, width, height, 'Extract medication details.');
```

## Project Structure

```
src/
├── main.tsx                          # React root
├── App.tsx                           # App shell + tab routing + local history store
├── runanywhere.ts                    # SDK init + model catalog + VLM worker
├── hooks/
│   ├── useModelLoader.ts
│   └── useMultiModelLoader.ts        # Multi-model loading for full voice pipeline
├── components/
│   ├── MedicationInteractionChecker.tsx
│   ├── VoiceSymptomReporter.tsx
│   ├── PillLabelScanner.tsx
│   ├── ModelDownloadScreen.tsx
│   ├── HistoryTab.tsx
│   └── ProfileTab.tsx
└── styles/
  └── index.css
```

## Model Setup

Edit the `MODELS` array in `src/runanywhere.ts`:

```typescript
{
  id: 'my-custom-model',
  name: 'My Model',
  repo: 'username/repo-name',           // HuggingFace repo
  files: ['model.Q4_K_M.gguf'],         // Files to download
  framework: LLMFramework.LlamaCpp,
  modality: ModelCategory.Language,      // or Multimodal, SpeechRecognition, etc.
  memoryRequirement: 500_000_000,        // Bytes
}
```

The default setup expects these models:

- `silero-vad-v5`
- `sherpa-onnx-whisper-tiny.en`
- `lfm2-350m-q4_k_m`
- `vits-piper-en_US-lessac-medium`

You can change model IDs in `src/App.tsx` and catalog details in `src/runanywhere.ts`.

## Deployment

### Vercel

```bash
npm run build
npx vercel --prod
```

The included `vercel.json` sets the required Cross-Origin-Isolation headers.

### Netlify

Add a `_headers` file:

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: credentialless
```

### Any static host

Serve the `dist/` folder with these HTTP headers on all responses:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

## Browser Requirements

- Chrome 96+ or Edge 96+ (recommended: 120+)
- WebAssembly (required)
- SharedArrayBuffer (requires Cross-Origin Isolation headers)
- OPFS (for persistent model cache)

## Documentation

- [SDK API Reference](https://docs.runanywhere.ai)
- [npm package](https://www.npmjs.com/package/@runanywhere/web)
- [GitHub](https://github.com/RunanywhereAI/runanywhere-sdks)

## License

MIT
