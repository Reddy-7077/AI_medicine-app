import { useState, useCallback, useRef, useEffect } from 'react';
import { VoicePipeline, ModelManager, ModelCategory, AudioCapture, AudioPlayback, SpeechActivity } from '@runanywhere/web';
import { VAD } from '@runanywhere/web-onnx';

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

const SYSTEM_PROMPT = `You are a helpful medication safety assistant. The user will describe a symptom. In 1-2 sentences, explain whether this could be a known medication side effect and whether they should seek medical attention. Always recommend consulting a doctor for serious symptoms.`;
const VOICE_MAX_TOKENS = 45;
const VOICE_UI_UPDATE_MS = 80;

interface Props {
  onTurnComplete?: (payload: {
    transcript: string;
    response: string;
    metrics: string | null;
  }) => void;
}

export function VoiceSymptomReporter({ onTurnComplete }: Props) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const micRef = useRef<AudioCapture | null>(null);
  const pipelineRef = useRef<VoicePipeline | null>(null);
  const vadUnsubRef = useRef<(() => void) | null>(null);
  const playerRef = useRef<AudioPlayback | null>(null);
  const transcriptRef = useRef('');

  useEffect(() => {
    return () => {
      micRef.current?.stop();
      vadUnsubRef.current?.();
      playerRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const verifyModels = useCallback(async (): Promise<boolean> => {
    const categories = [
      ModelCategory.Audio,
      ModelCategory.SpeechRecognition,
      ModelCategory.Language,
      ModelCategory.SpeechSynthesis,
    ];

    for (const cat of categories) {
      if (!ModelManager.getLoadedModel(cat)) {
        setError(`Missing ${cat} model. Please ensure all models are loaded.`);
        return false;
      }
    }
    return true;
  }, []);

  const startListening = useCallback(async () => {
    setTranscript('');
    setAiResponse('');
    setError(null);

    // Verify all 4 models are loaded
    const ready = await verifyModels();
    if (!ready) {
      setVoiceState('error');
      return;
    }

    setVoiceState('listening');

    const mic = new AudioCapture({ sampleRate: 16000 });
    micRef.current = mic;

    if (!pipelineRef.current) {
      pipelineRef.current = new VoicePipeline();
    }

    VAD.reset();

    vadUnsubRef.current = VAD.onSpeechActivity(async (activity) => {
      if (activity === SpeechActivity.Ended) {
        const segment = VAD.popSpeechSegment();
        if (!segment || segment.samples.length < 1600) return;

        // Stop mic and unsubscribe
        mic.stop();
        vadUnsubRef.current?.();
        setVoiceState('processing');
        setAudioLevel(0);

        try {
          let lastUiUpdate = 0;

          await pipelineRef.current!.processTurn(
            segment.samples,
            {
              maxTokens: VOICE_MAX_TOKENS,
              temperature: 0.35,
              systemPrompt: `${SYSTEM_PROMPT} Keep the response brief and clear.`,
            },
            {
              onTranscription: (text) => {
                setTranscript(text);
              },
              onResponseToken: (_, accumulated) => {
                const now = performance.now();
                if (now - lastUiUpdate >= VOICE_UI_UPDATE_MS) {
                  setAiResponse(accumulated);
                  lastUiUpdate = now;
                }
              },
              onResponseComplete: (text) => {
                setAiResponse(text);
                if (transcriptRef.current.trim()) {
                  onTurnComplete?.({
                    transcript: transcriptRef.current.trim(),
                    response: text,
                    metrics: null,
                  });
                }
              },
              onSynthesisComplete: async (audio, sampleRate) => {
                setVoiceState('speaking');
                const player = new AudioPlayback({ sampleRate });
                playerRef.current = player;
                await player.play(audio, sampleRate);
                player.dispose();
                playerRef.current = null;
                setVoiceState('idle');
              },
              onError: (err) => {
                setError(err.message);
                setVoiceState('error');
              },
            }
          );
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          
          // Handle specific error for image input attempts
          if (errMsg.includes('image') || errMsg.includes('does not support image input')) {
            setError('Image input is not supported. MedSafe uses voice and text AI only. Please describe your symptom using the microphone.');
          } else {
            setError(errMsg);
          }
          
          setVoiceState('error');
          console.error('Voice pipeline error:', err);
        }
      }
    });

    try {
      await mic.start(
        (chunk: Float32Array) => {
          VAD.processSamples(chunk);
        },
        (level: number) => {
          setAudioLevel(level);
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access denied');
      setVoiceState('error');
    }
  }, [onTurnComplete, verifyModels]);

  const stopListening = useCallback(() => {
    micRef.current?.stop();
    vadUnsubRef.current?.();
    setVoiceState('idle');
    setAudioLevel(0);
  }, []);

  const getStateMessage = () => {
    switch (voiceState) {
      case 'idle':
        return 'Tap to speak';
      case 'listening':
        return 'Listening...';
      case 'processing':
        return 'Processing...';
      case 'speaking':
        return 'Speaking...';
      case 'error':
        return error || 'An error occurred';
      default:
        return '';
    }
  };

  const handleOrbClick = () => {
    if (voiceState === 'idle' || voiceState === 'error') {
      startListening();
    } else if (voiceState === 'listening') {
      stopListening();
    }
  };

  return (
    <div className="voice-container">
      {/* Voice Orb */}
      <div className="voice-orb-container">
        <div className="voice-orb-ring ring-outer" />
        <div className="voice-orb-ring ring-middle" />
        <div
          className={`voice-orb ${voiceState === 'listening' ? 'listening' : ''} ${voiceState === 'speaking' ? 'speaking' : ''}`}
          onClick={handleOrbClick}
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        </div>
      </div>

      {/* State Label */}
      <div className="voice-state-label">{getStateMessage()}</div>

      {/* Error */}
      {error && voiceState === 'error' && (
        <div className="error-box" style={{ maxWidth: '400px' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Transcript */}
      {transcript && (
        <div className="voice-transcript-card">
          <div className="voice-card-label">You said</div>
          <div className="voice-card-text">{transcript}</div>
        </div>
      )}

      {/* AI Response */}
      {aiResponse && (
        <div className="voice-response-card">
          <div className="voice-card-label">MedSafe AI</div>
          <div className="voice-card-text">
            {aiResponse}
            {voiceState === 'processing' && <span className="cursor-blink" />}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      {(transcript || aiResponse) && (
        <div className="disclaimer-box" style={{ maxWidth: '400px' }}>
          <strong>Medical Disclaimer:</strong> This tool provides educational guidance only. For
          serious or persistent symptoms, seek immediate medical attention.
        </div>
      )}
    </div>
  );
}
