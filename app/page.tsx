'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { 
  Mic, 
  MicOff, 
  Languages, 
  Volume2, 
  Settings2, 
  Loader2, 
  Globe, 
  History, 
  X, 
  ChevronRight, 
  Info, 
  WifiOff, 
  Sparkles,
  RefreshCcw,
  Play,
  Pause
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

// --- Constants ---
const SAMPLE_RATE = 16000;

interface TranscriptItem {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export default function InterpreterPage() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sourceLang, setSourceLang] = useState('Korean');
  const [targetLang, setTargetLang] = useState('English');
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [voiceName, setVoiceName] = useState('Zephyr'); // 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
  const [micLevel, setMicLevel] = useState(0);

  // Refs for audio handling
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);

  // --- Audio Processing ---

  const initAudio = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: SAMPLE_RATE,
      });
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
  };

  const startRecording = async () => {
    try {
      await initAudio();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const source = audioContextRef.current!.createMediaStreamSource(stream);
      const processor = audioContextRef.current!.createScriptProcessor(2048, 1, 1);
      const analyser = audioContextRef.current!.createAnalyser();
      analyser.fftSize = 256;
      
      source.connect(analyser);
      source.connect(processor);
      processor.connect(audioContextRef.current!.destination);

      analyserRef.current = analyser;
      processorRef.current = processor;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevel = () => {
        if (!isRecording) return;
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / bufferLength;
        setMicLevel(average / 128);
        requestAnimationFrame(updateLevel);
      };
      updateLevel();

      processor.onaudioprocess = (e) => {
        if (sessionRef.current && isConnected) {
          const inputData = e.inputBuffer.getChannelData(0);
          // Convert to PCM 16-bit
          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
          }
          
          // Base64 encode
          const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
          sessionRef.current.sendRealtimeInput({
            audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }
      };

      setIsRecording(true);
      setError(null);
    } catch (err: any) {
      console.error("Mic access failed:", err);
      setError("Microphone access denied. Please check your permissions.");
    }
  };

  const stopRecording = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
    }
    setIsRecording(false);
    setMicLevel(0);
  };

  const playNextInQueue = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0 || !audioContextRef.current) return;

    isPlayingRef.current = true;
    const pcmData = audioQueueRef.current.shift()!;
    
    // Convert Int16 PCM to Float32
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      floatData[i] = pcmData[i] / 0x7FFF;
    }

    const buffer = audioContextRef.current.createBuffer(1, floatData.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(floatData);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    
    source.onended = () => {
      isPlayingRef.current = false;
      playNextInQueue();
    };

    source.start();
  };

  // --- Gemini Live Session ---

  const connectToGemini = async () => {
    if (isConnecting || isConnected) return;

    setIsConnecting(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY! });
      
      const session = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          systemInstruction: `You are a professional real-time interpreter. 
          Your task is to translate spoken ${sourceLang} to ${targetLang} and vice versa.
          - If the user speaks ${sourceLang}, translate to ${targetLang}.
          - If the user speaks ${targetLang}, translate to ${sourceLang}.
          - Provide ONLY the translation as audio output.
          - Be concise and maintain the original tone.
          - If you hear background noise or unclear speech, wait for clear input.`,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
            startRecording();
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              const binaryString = atob(base64Audio);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const pcmData = new Int16Array(bytes.buffer);
              audioQueueRef.current.push(pcmData);
              playNextInQueue();
            }

            // Handle Transcriptions
            if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
              const text = message.serverContent.modelTurn.parts[0].text;
              setTranscript(prev => [...prev, {
                id: Date.now().toString(),
                role: 'model',
                text,
                timestamp: new Date()
              }]);
            }

            // Handle User Transcription (if enabled)
            // Note: inputAudioTranscription results are handled here too
          },
          onclose: () => {
            setIsConnected(false);
            stopRecording();
          },
          onerror: (err) => {
            console.error("Gemini Live Error:", err);
            setError("Connection error. Please try again.");
            setIsConnecting(false);
          }
        }
      });

      sessionRef.current = session;
    } catch (err) {
      console.error("Failed to connect:", err);
      setError("Failed to initialize translation session.");
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
    }
    stopRecording();
    setIsConnected(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0502] text-white font-sans overflow-hidden selection:bg-[#ff4e00] selection:text-white">
      {/* Atmospheric Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-[#3a1510] rounded-full blur-[120px] opacity-40 animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#ff4e00] rounded-full blur-[150px] opacity-20" />
      </div>

      {/* Header */}
      <header className="relative z-10 p-6 flex justify-between items-center backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#ff4e00] to-[#3a1510] flex items-center justify-center shadow-[0_0_20px_rgba(255,78,0,0.4)]">
            <Languages className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Gemini Live Interpreter</h1>
            <div className="flex items-center gap-2">
              <div className={cn("w-1.5 h-1.5 rounded-full", isConnected ? "bg-emerald-500 animate-pulse" : "bg-white/20")} />
              <span className="text-[10px] uppercase tracking-widest opacity-50">
                {isConnected ? "Live Session Active" : "Ready to Connect"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <Settings2 className="w-5 h-5 opacity-60" />
          </button>
        </div>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto p-6 h-[calc(100vh-160px)] flex flex-col gap-6">
        {/* Language Selector */}
        <div className="flex items-center justify-center gap-4 p-4 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[8px] uppercase tracking-widest opacity-40">Source</span>
            <select 
              value={sourceLang} 
              onChange={(e) => setSourceLang(e.target.value)}
              disabled={isConnected}
              className="bg-transparent text-sm font-bold outline-none cursor-pointer"
            >
              <option value="Korean">Korean</option>
              <option value="English">English</option>
              <option value="Japanese">Japanese</option>
              <option value="Chinese">Chinese</option>
            </select>
          </div>
          <RefreshCcw className="w-4 h-4 opacity-20" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-[8px] uppercase tracking-widest opacity-40">Target</span>
            <select 
              value={targetLang} 
              onChange={(e) => setTargetLang(e.target.value)}
              disabled={isConnected}
              className="bg-transparent text-sm font-bold outline-none cursor-pointer"
            >
              <option value="English">English</option>
              <option value="Korean">Korean</option>
              <option value="Japanese">Japanese</option>
              <option value="Spanish">Spanish</option>
            </select>
          </div>
        </div>

        {/* Transcript Area */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar mask-fade">
          {transcript.length === 0 && !isConnecting && (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-30 space-y-4">
              <Globe className="w-12 h-12" />
              <p className="font-serif italic text-xl">Start a conversation...</p>
            </div>
          )}

          {isConnecting && (
            <div className="h-full flex flex-col items-center justify-center space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-[#ff4e00]" />
              <p className="text-xs uppercase tracking-widest opacity-50">Initializing Neural Link...</p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {transcript.map((item) => (
              <motion.div 
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex flex-col gap-2",
                  item.role === 'user' ? "items-end" : "items-start"
                )}
              >
                <div className={cn(
                  "max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed",
                  item.role === 'user' 
                    ? "bg-white/10 border border-white/5" 
                    : "bg-gradient-to-br from-[#ff4e00]/20 to-transparent border border-[#ff4e00]/20 italic font-serif"
                )}>
                  {item.text}
                </div>
                <span className="text-[8px] uppercase tracking-widest opacity-30">
                  {item.role === 'user' ? "You" : "Gemini"} • {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-6">
          {/* Visualizer */}
          <div className="flex items-center gap-1 h-8">
            {[...Array(12)].map((_, i) => (
              <motion.div 
                key={i}
                animate={{ 
                  height: isRecording ? [4, Math.max(4, micLevel * 32 * (0.5 + Math.sin(i) * 0.5)), 4] : 4,
                  opacity: isRecording ? [0.2, 1, 0.2] : 0.2
                }}
                transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.05 }}
                className="w-1 bg-[#ff4e00] rounded-full"
              />
            ))}
          </div>

          <div className="flex items-center gap-8">
            {!isConnected ? (
              <button 
                onClick={connectToGemini}
                disabled={isConnecting}
                className="group relative w-20 h-20 rounded-full bg-white text-black flex items-center justify-center transition-all hover:scale-110 active:scale-95 disabled:opacity-50"
              >
                <div className="absolute inset-0 rounded-full bg-white/20 animate-ping group-hover:hidden" />
                <Mic className="w-8 h-8" />
              </button>
            ) : (
              <button 
                onClick={disconnect}
                className="w-20 h-20 rounded-full bg-red-500 text-white flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-[0_0_30px_rgba(239,68,68,0.4)]"
              >
                <MicOff className="w-8 h-8" />
              </button>
            )}
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 text-red-400 text-xs bg-red-400/10 px-4 py-2 rounded-full border border-red-400/20"
            >
              <Info className="w-3 h-3" />
              {error}
            </motion.div>
          )}
        </div>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-sm bg-[#1a1614] border border-white/10 rounded-3xl p-8 space-y-8"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Settings</h2>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-white/10 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-widest opacity-40 font-bold">AI Voice</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir'].map((v) => (
                      <button 
                        key={v}
                        onClick={() => setVoiceName(v)}
                        className={cn(
                          "py-3 rounded-xl text-xs font-bold border transition-all",
                          voiceName === v ? "bg-[#ff4e00] border-[#ff4e00] text-white" : "bg-white/5 border-white/5 hover:border-white/20"
                        )}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setShowSettings(false)}
                className="w-full py-4 rounded-2xl bg-white text-black font-bold uppercase tracking-widest text-xs"
              >
                Save Changes
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .mask-fade {
          mask-image: linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%);
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}
