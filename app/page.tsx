'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage, Type } from "@google/genai";
import { 
  Mic, 
  MicOff, 
  Languages, 
  Settings2, 
  Loader2, 
  Globe, 
  History, 
  X, 
  ChevronRight, 
  Info, 
  Sparkles,
  RefreshCcw,
  Play,
  Pause,
  FileText,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Search,
  ArrowRight,
  Download,
  Copy,
  Pencil,
  Wifi,
  Activity,
  User,
  Bot,
  ChevronDown,
  Volume2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

// --- Types & Schemas ---

interface AnalysisResults {
  translation: string;
  sourceLanguage: string;
  detectedDomain: string;
  contextAnalysis: {
    term: string;
    suggested: string;
    alternatives: string;
  }[];
  terminologyAnalysis: {
    term: string;
    translation: string;
    description: string;
  }[];
  styleAnalysis: {
    formality: string;
    tone: string;
    consistencyScore: number;
    feedback: string;
  };
}

interface TranscriptItem {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  analysis?: AnalysisResults;
  isAnalyzing?: boolean;
}

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    translation: { type: Type.STRING },
    sourceLanguage: { type: Type.STRING },
    detectedDomain: { type: Type.STRING },
    contextAnalysis: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING },
          suggested: { type: Type.STRING },
          alternatives: { type: Type.STRING }
        },
        required: ["term", "suggested", "alternatives"]
      }
    },
    terminologyAnalysis: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING },
          translation: { type: Type.STRING },
          description: { type: Type.STRING }
        },
        required: ["term", "translation", "description"]
      }
    },
    styleAnalysis: {
      type: Type.OBJECT,
      properties: {
        formality: { type: Type.STRING },
        tone: { type: Type.STRING },
        consistencyScore: { type: Type.INTEGER },
        feedback: { type: Type.STRING }
      },
      required: ["formality", "tone", "consistencyScore", "feedback"]
    }
  },
  required: ["translation", "sourceLanguage", "detectedDomain", "contextAnalysis", "terminologyAnalysis", "styleAnalysis"]
};

// --- Sub-Components ---

const Toast = ({ message, type = 'error', onClose }: { message: string; type?: 'error' | 'info'; onClose: () => void }) => (
  <motion.div 
    initial={{ opacity: 0, y: 50, scale: 0.9 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, scale: 0.9 }}
    className={cn(
      "fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] px-6 py-4 rounded-2xl shadow-2xl border flex items-center gap-3 w-[90%] max-w-sm backdrop-blur-xl",
      type === 'error' ? "bg-red-500/20 border-red-500/20 text-red-200" : "bg-indigo-500/20 border-indigo-500/20 text-indigo-200"
    )}
  >
    {type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <Info className="w-5 h-5 shrink-0" />}
    <p className="text-sm font-medium flex-1">{message}</p>
    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors">
      <X className="w-4 h-4" />
    </button>
  </motion.div>
);

const TypingText = ({ text, speed = 20 }: { text: string; speed?: number }) => {
  const [displayedText, setDisplayedText] = useState('');
  
  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      setDisplayedText(text.slice(0, i));
      i++;
      if (i > text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);

  return <span>{displayedText}</span>;
};

const Ripple = ({ active }: { active: boolean }) => (
  <AnimatePresence>
    {active && (
      <>
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 2.5, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.6,
              ease: "easeOut",
            }}
            className="absolute inset-0 rounded-full border border-indigo-500/30 pointer-events-none"
          />
        ))}
      </>
    )}
  </AnimatePresence>
);

const BottomSheet = ({ 
  isOpen, 
  onClose, 
  title, 
  children 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  title: string; 
  children: React.ReactNode 
}) => (
  <AnimatePresence>
    {isOpen && (
      <>
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150]"
        />
        <motion.div 
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="fixed bottom-0 left-0 right-0 z-[160] bg-[#1a1614] border-t border-white/10 rounded-t-[2.5rem] p-6 pb-12 max-w-md mx-auto"
        >
          <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-6" />
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold">{title}</h2>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full"><X className="w-5 h-5" /></button>
          </div>
          {children}
        </motion.div>
      </>
    )}
  </AnimatePresence>
);

const AnalysisModal = ({ analysis, onClose }: { analysis: AnalysisResults, onClose: () => void }) => (
  <motion.div 
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    className="fixed inset-0 z-[200] flex items-end justify-center bg-black/80 backdrop-blur-md"
    onClick={onClose}
  >
    <motion.div 
      initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
      className="w-full max-w-md h-[90vh] bg-[#1a1614] border-t border-white/10 rounded-t-[2.5rem] overflow-hidden flex flex-col shadow-2xl"
      onClick={e => e.stopPropagation()}
    >
      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-indigo-500/20 to-transparent">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-bold">Deep Analysis</h2>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-5 h-5" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
            <span className="text-[8px] uppercase tracking-widest opacity-40 block mb-1">Source Language</span>
            <span className="text-sm font-bold">{analysis.sourceLanguage}</span>
          </div>
          <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
            <span className="text-[8px] uppercase tracking-widest opacity-40 block mb-1">Domain</span>
            <span className="text-sm font-bold">{analysis.detectedDomain}</span>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-indigo-400">
            <Languages className="w-3.5 h-3.5" /> Refined Translation
          </h3>
          <p className="p-4 rounded-2xl bg-white/5 border border-white/10 text-sm leading-relaxed font-serif italic">
            {analysis.translation}
          </p>
        </div>

        {analysis.terminologyAnalysis.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-teal-400">
              <FileText className="w-3.5 h-3.5" /> Terminology
            </h3>
            <div className="space-y-2">
              {analysis.terminologyAnalysis.map((item, i) => (
                <div key={i} className="p-4 rounded-2xl bg-white/5 border border-white/5">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-bold">{item.term}</span>
                    <ArrowRight className="w-3 h-3 opacity-30" />
                    <span className="text-sm font-bold text-teal-400">{item.translation}</span>
                  </div>
                  <p className="text-[11px] text-white/40">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-amber-400">
            <Sliders className="w-3.5 h-3.5" /> Style & Tone
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
              <span className="text-[8px] uppercase tracking-widest opacity-40 block mb-1">Formality</span>
              <span className="text-sm font-bold">{analysis.styleAnalysis.formality}</span>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
              <span className="text-[8px] uppercase tracking-widest opacity-40 block mb-1">Tone</span>
              <span className="text-sm font-bold">{analysis.styleAnalysis.tone}</span>
            </div>
          </div>
          <p className="text-[11px] text-white/40 p-4 rounded-2xl bg-white/5 border border-white/5">
            {analysis.styleAnalysis.feedback}
          </p>
        </div>
      </div>

      <div className="p-6 border-t border-white/5 bg-black/20">
        <button onClick={onClose} className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-bold uppercase tracking-widest text-xs hover:bg-indigo-500 transition-colors">
          Close Analysis
        </button>
      </div>
    </motion.div>
  </motion.div>
);

// --- Main Component ---

const LANGUAGES = [
  { name: "Korean", flag: "🇰🇷", code: "KO" },
  { name: "English", flag: "🇺🇸", code: "EN" },
  { name: "Japanese", flag: "🇯🇵", code: "JP" },
  { name: "Chinese", flag: "🇨🇳", code: "CN" },
  { name: "Spanish", flag: "🇪🇸", code: "ES" },
  { name: "French", flag: "🇫🇷", code: "FR" },
  { name: "German", flag: "🇩🇪", code: "DE" },
];

export default function InterpreterPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sourceLang, setSourceLang] = useState('Korean');
  const [targetLang, setTargetLang] = useState('English');
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<AnalysisResults | null>(null);
  const [currentTime, setCurrentTime] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isManualMode, setIsManualMode] = useState(false);
  
  // UI States
  const [isSourceLangOpen, setIsSourceLangOpen] = useState(false);
  const [isTargetLangOpen, setIsTargetLangOpen] = useState(false);

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<TranscriptItem[]>([]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  const isRecordingRef = useRef(false);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Hydration fix & Clock
  useEffect(() => {
    const updateTime = () => setCurrentTime(format(new Date(), 'HH:mm:ss'));
    const initialTimer = setTimeout(updateTime, 0);
    const timer = setInterval(updateTime, 1000);
    return () => {
      clearInterval(timer);
      clearTimeout(initialTimer);
    };
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Audio Logic
  const initAudio = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    }
    if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
  };

  const handleToggleRecording = async () => {
    if (isRecordingRef.current) {
      stopMic();
      if (sessionRef.current && isConnected) {
        // [수정 요구사항 4] 발언 종료 신호 전송
        sessionRef.current.send({ clientContent: { turnComplete: true } });
      }
    } else {
      if (!isConnected) {
        await connect();
      } else {
        await startMic();
      }
    }
  };

  const startMic = async () => {
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

      processor.onaudioprocess = (e) => {
        if (sessionRef.current && isConnected) {
          const input = e.inputBuffer.getChannelData(0);
          const pcm = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            pcm[i] = Math.max(-1, Math.min(1, input[i])) * 0x7FFF;
          }
          
          const uint8 = new Uint8Array(pcm.buffer);
          let binary = '';
          const len = uint8.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(uint8[i]);
          }
          const base64 = btoa(binary);
          
          // [수정 요구사항 1] 오디오 송신 규격 수정 (mediaChunks 사용)
          sessionRef.current.send({ 
            realtimeInput: { 
              mediaChunks: [{ 
                mimeType: "audio/pcm;rate=16000", 
                data: base64 
              }] 
            } 
          });
        }
        
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const average = data.reduce((a, b) => a + b) / data.length;
        setMicLevel(average / 128);

        // Silence Detection (Auto-turn)
        const threshold = 15; 
        if (average > threshold) {
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else if (isRecordingRef.current && !silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            handleToggleRecording();
          }, 1500); 
        }
      };

      processorRef.current = processor;
      setIsRecording(true);
      setError(null);
    } catch (err: any) {
      console.error("Mic error:", err);
      setError("마이크 시작 중 오류가 발생했습니다: " + (err.message || "권한을 확인해 주세요."));
    }
  };

  const stopMic = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    processorRef.current?.disconnect();
    setIsRecording(false);
    setMicLevel(0);
  };

  const playQueue = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0 || !audioContextRef.current) return;
    isPlayingRef.current = true;
    const pcm = audioQueueRef.current.shift()!;
    const float = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) float[i] = pcm[i] / 0x7FFF;

    const buffer = audioContextRef.current.createBuffer(1, float.length, 24000);
    buffer.getChannelData(0).set(float);
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => { 
      isPlayingRef.current = false; 
      playQueue(); 
    };
    source.start();
  };

  const swapLanguages = () => {
    const temp = sourceLang;
    setSourceLang(targetLang);
    setTargetLang(temp);
  };

  // Gemini Live Connection
  const connect = async () => {
    if (isConnecting || isConnected) return;
    
    let apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    
    if (!apiKey && typeof window !== 'undefined' && (window as any).aistudio) {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await (window as any).aistudio.openSelectKey();
      }
    }

    if (!apiKey) apiKey = (process.env as any).API_KEY;

    if (!apiKey) {
      setError("API 키가 설정되지 않았습니다. 사이드바의 'Settings' 메뉴에서 Gemini API 키를 설정해 주세요.");
      return;
    }

    setIsConnecting(true);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey });
      const session = await ai.live.connect({
        // [수정 요구사항 3] 모델 설정 변경
        model: "gemini-2.0-flash-exp",
        config: {
          // [수정 요구사항 3] Modality 설정 (텍스트와 오디오 모두 응답)
          responseModalities: [Modality.AUDIO],
          systemInstruction: isManualMode 
            ? `You are a professional interpreter. Translate ONLY from ${sourceLang} to ${targetLang}. If the user speaks ${targetLang}, do not translate. Provide the translation as both high-quality audio and clear text transcription.`
            : `You are a professional interpreter. Translate ${sourceLang} to ${targetLang} and vice versa. Provide the translation as both high-quality audio and clear text transcription.`,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => { 
            console.log("Session Opened");
            setIsConnected(true); 
            setIsConnecting(false); 
            startMic(); 
          },
          onmessage: (msg: LiveServerMessage) => {
            // [수정 요구사항 2] 메시지 수신 규격 수정 (parts 배열 순회)
            if (msg.serverContent?.modelTurn?.parts) {
              for (const part of msg.serverContent.modelTurn.parts) {
                // 텍스트 추출
                if (part.text) {
                  const role = 'model';
                  setTranscript(prev => {
                    const lastItem = prev[prev.length - 1];
                    if (lastItem && lastItem.role === role && (Date.now() - lastItem.timestamp.getTime() < 5000)) {
                      const newTranscript = [...prev];
                      newTranscript[newTranscript.length - 1] = { 
                        ...lastItem, 
                        text: lastItem.text + part.text! 
                      };
                      return newTranscript;
                    }
                    
                    const newItem: TranscriptItem = { 
                      id: Date.now().toString() + '-' + role + '-' + Math.random().toString(36).substr(2, 9), 
                      role, 
                      text: part.text!, 
                      timestamp: new Date() 
                    };
                    return [...prev, newItem];
                  });
                }

                // 오디오 추출
                if (part.inlineData?.data) {
                  const binary = atob(part.inlineData.data);
                  const bytes = new Uint8Array(binary.length);
                  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                  audioQueueRef.current.push(new Int16Array(bytes.buffer));
                  playQueue();
                }
              }
            }

            // Handle Interruption
            if (msg.serverContent?.interrupted) {
              audioQueueRef.current = [];
              isPlayingRef.current = false;
            }

            if (msg.serverContent?.turnComplete) {
              const lastItem = transcriptRef.current[transcriptRef.current.length - 1];
              if (lastItem && lastItem.role === 'model') {
                performDeepAnalysis(lastItem);
              }
            }
          },
          onclose: () => { 
            console.log("Session Closed");
            setIsConnected(false); 
            stopMic(); 
          },
          onerror: (err: any) => {
            console.error("Gemini Error:", err);
            const errorMsg = err.message || "알 수 없는 오류";
            setError(`통역 세션 오류: ${errorMsg}`);
            setIsConnecting(false);
          }
        }
      });
      sessionRef.current = session;
    } catch (err: any) {
      console.error("Connection failed:", err);
      setError("서버 연결에 실패했습니다.");
      setIsConnecting(false);
    }
  };

  const performDeepAnalysis = async (item: TranscriptItem) => {
    setTranscript(prev => prev.map(t => t.id === item.id ? { ...t, isAnalyzing: true } : t));
    try {
      let apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) apiKey = (process.env as any).API_KEY;
      if (!apiKey) throw new Error("API key missing");

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze this translation from ${sourceLang} to ${targetLang}: "${item.text}"`,
        config: { responseMimeType: "application/json", responseSchema: analysisSchema }
      });
      const analysis = JSON.parse(response.text || '{}');
      setTranscript(prev => prev.map(t => t.id === item.id ? { ...t, analysis, isAnalyzing: false } : t));
      setSelectedAnalysis(analysis);
    } catch (err) {
      console.error("Analysis failed:", err);
      setError("번역 분석 중 오류가 발생했습니다.");
      setTranscript(prev => prev.map(t => t.id === item.id ? { ...t, isAnalyzing: false } : t));
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-0 sm:p-4 font-sans selection:bg-indigo-500">
      {/* Mobile Device Container */}
      <div className="w-full max-w-md h-[100dvh] sm:h-[850px] bg-[#0a0502] text-white relative shadow-2xl sm:rounded-[3rem] overflow-hidden border border-white/5 flex flex-col">
        
        {/* Immersive Background */}
        <div className="absolute inset-0 pointer-events-none">
          <motion.div 
            animate={{ 
              opacity: isConnected ? [0.2, 0.4, 0.2] : 0.2,
              scale: isConnected ? [1, 1.1, 1] : 1
            }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-[-10%] left-[-10%] w-[80%] h-[80%] bg-[#3a1510] rounded-full blur-[100px]" 
          />
          <motion.div 
            animate={{ 
              opacity: isConnected ? [0.1, 0.2, 0.1] : 0.1,
              scale: isConnected ? [1, 1.2, 1] : 1
            }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] bg-indigo-900/20 rounded-full blur-[120px]" 
          />
        </div>

        {/* Header */}
        <header className="relative z-10 p-5 pt-12 flex flex-col gap-4 border-b border-white/5 backdrop-blur-xl bg-black/20">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Languages className="w-4 h-4" />
              </div>
              <h1 className="text-lg font-bold tracking-tight">NEURAL LENS</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full", isConnecting ? "bg-amber-500 animate-pulse" : isConnected ? "bg-emerald-500 animate-pulse" : "bg-white/20")} />
              <span className="text-[10px] font-mono opacity-50 uppercase">
                {isConnecting ? 'Linking' : isConnected ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsSourceLangOpen(true)}
              className="flex-1 p-3 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between hover:bg-white/10 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{LANGUAGES.find(l => l.name === sourceLang)?.flag}</span>
                <span className="text-xs font-bold">{sourceLang}</span>
              </div>
              <ChevronDown className="w-3 h-3 opacity-30" />
            </button>

            <button 
              onClick={swapLanguages}
              className="p-3 rounded-2xl bg-indigo-600/20 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-600/30 transition-colors"
            >
              <RefreshCcw className="w-4 h-4" />
            </button>

            <button 
              onClick={() => setIsTargetLangOpen(true)}
              className="flex-1 p-3 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between hover:bg-white/10 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{LANGUAGES.find(l => l.name === targetLang)?.flag}</span>
                <span className="text-xs font-bold">{targetLang}</span>
              </div>
              <ChevronDown className="w-3 h-3 opacity-30" />
            </button>
          </div>
        </header>

        {/* Transcript Area */}
        <main className="relative z-10 flex-1 overflow-y-auto p-5 space-y-6 scrollbar-hide">
          {transcript.length === 0 && !isConnecting && (
            <div className="h-full flex flex-col items-center justify-center opacity-10 text-center px-8">
              <Globe className="w-16 h-16 mb-4" />
              <p className="font-serif italic text-xl">Awaiting neural input...</p>
              <p className="text-[10px] mt-2 uppercase tracking-widest leading-relaxed">Tap the mic to establish a neural link for real-time translation</p>
            </div>
          )}
          
          {isConnecting && (
            <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-40">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
              <p className="text-[10px] uppercase tracking-[0.4em] animate-pulse">Establishing Link</p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {transcript.map((item) => (
              <motion.div 
                key={item.id} 
                initial={{ opacity: 0, y: 20, scale: 0.95 }} 
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={cn("flex flex-col w-full gap-2", item.role === 'user' ? "items-end" : "items-start")}
              >
                <div className={cn(
                  "relative p-5 rounded-[1.8rem] text-sm leading-relaxed max-w-[85%]",
                  item.role === 'user' 
                    ? "bg-white text-black rounded-tr-none" 
                    : "bg-indigo-500/10 border border-indigo-500/20 italic font-serif rounded-tl-none"
                )}>
                  {item.role === 'model' ? (
                    <div className="flex flex-col gap-1">
                      <TypingText text={item.text} />
                      {item.isAnalyzing && (
                        <div className="flex items-center gap-2 mt-2 text-[9px] text-indigo-400/60 font-mono animate-pulse">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>ANALYZING...</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-white/90">{item.text}</span>
                  )}

                  {item.role === 'model' && (
                    <button 
                      onClick={() => performDeepAnalysis(item)}
                      className="absolute -right-2 -bottom-2 p-2 rounded-full bg-indigo-600 shadow-lg shadow-indigo-500/40 border border-indigo-400/20"
                    >
                      <Sparkles className="w-3 h-3 text-white" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 px-2 opacity-30 text-[8px] uppercase tracking-widest font-mono">
                  <span>{item.role === 'user' ? 'Local' : 'Neural'}</span>
                  <span>•</span>
                  <span>{format(item.timestamp, 'HH:mm:ss')}</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={transcriptEndRef} />
        </main>

        {/* Footer / Controls */}
        <footer className="relative z-10 p-6 pb-10 border-t border-white/5 bg-black/40 backdrop-blur-2xl">
          <div className="flex flex-col items-center gap-6">
            {/* Waveform */}
            <div className="flex items-center justify-center gap-1.5 h-8 w-full">
              {[...Array(16)].map((_, i) => (
                <motion.div 
                  key={i}
                  animate={{ 
                    height: isRecording ? [4, Math.max(6, micLevel * 48 * (0.4 + Math.sin(i * 0.8) * 0.6)), 4] : 4,
                    opacity: isRecording ? [0.4, 1, 0.4] : 0.2
                  }}
                  transition={{ duration: 0.3, repeat: Infinity, delay: i * 0.03 }}
                  className="w-1 bg-indigo-500 rounded-full"
                />
              ))}
            </div>

            <div className="flex items-center justify-between w-full">
              <button 
                onClick={() => setIsManualMode(!isManualMode)}
                className={cn(
                  "p-4 rounded-2xl border transition-all flex flex-col items-center gap-1",
                  isManualMode ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-400" : "bg-white/5 border-white/5 text-white/40"
                )}
              >
                <Activity className="w-5 h-5" />
                <span className="text-[8px] font-bold uppercase tracking-widest">Manual</span>
              </button>

              <div className="relative">
                <Ripple active={isRecording} />
                <motion.button 
                  whileTap={{ scale: 0.9 }}
                  onClick={handleToggleRecording}
                  disabled={isConnecting}
                  className={cn(
                    "relative z-10 w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all",
                    isRecording 
                      ? "bg-red-500 shadow-red-500/40" 
                      : "bg-white shadow-white/10"
                  )}
                >
                  {isConnecting ? (
                    <Loader2 className="w-8 h-8 animate-spin text-black" />
                  ) : isRecording ? (
                    <MicOff className="w-8 h-8 text-white" />
                  ) : (
                    <Mic className="w-8 h-8 text-black" />
                  )}
                </motion.button>
              </div>

              <button className="p-4 rounded-2xl bg-white/5 border border-white/5 text-white/40 hover:bg-white/10 transition-all flex flex-col items-center gap-1">
                <Settings2 className="w-5 h-5" />
                <span className="text-[8px] font-bold uppercase tracking-widest">Config</span>
              </button>
            </div>
          </div>
        </footer>

        {/* Language Selection Bottom Sheets */}
        <BottomSheet 
          isOpen={isSourceLangOpen} 
          onClose={() => setIsSourceLangOpen(false)} 
          title="Source Language"
        >
          <div className="grid grid-cols-1 gap-2">
            {LANGUAGES.map(lang => (
              <button 
                key={lang.name}
                onClick={() => { setSourceLang(lang.name); setIsSourceLangOpen(false); }}
                className={cn(
                  "p-4 rounded-2xl flex items-center justify-between transition-all",
                  sourceLang === lang.name ? "bg-indigo-600 text-white" : "bg-white/5 hover:bg-white/10"
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{lang.flag}</span>
                  <span className="font-bold">{lang.name}</span>
                </div>
                {sourceLang === lang.name && <CheckCircle2 className="w-5 h-5" />}
              </button>
            ))}
          </div>
        </BottomSheet>

        <BottomSheet 
          isOpen={isTargetLangOpen} 
          onClose={() => setIsTargetLangOpen(false)} 
          title="Target Language"
        >
          <div className="grid grid-cols-1 gap-2">
            {LANGUAGES.map(lang => (
              <button 
                key={lang.name}
                onClick={() => { setTargetLang(lang.name); setIsTargetLangOpen(false); }}
                className={cn(
                  "p-4 rounded-2xl flex items-center justify-between transition-all",
                  targetLang === lang.name ? "bg-indigo-600 text-white" : "bg-white/5 hover:bg-white/10"
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{lang.flag}</span>
                  <span className="font-bold">{lang.name}</span>
                </div>
                {targetLang === lang.name && <CheckCircle2 className="w-5 h-5" />}
              </button>
            ))}
          </div>
        </BottomSheet>

        <AnimatePresence>
          {selectedAnalysis && <AnalysisModal analysis={selectedAnalysis} onClose={() => setSelectedAnalysis(null)} />}
          {error && <Toast message={error} onClose={() => setError(null)} />}
        </AnimatePresence>
      </div>

      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        
        @keyframes ripple {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
