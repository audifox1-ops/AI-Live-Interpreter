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
  Bot
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
      "fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-6 py-4 rounded-2xl shadow-2xl border flex items-center gap-3 min-w-[320px] backdrop-blur-xl",
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

const AnalysisModal = ({ analysis, onClose }: { analysis: AnalysisResults, onClose: () => void }) => (
  <motion.div 
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
    onClick={onClose}
  >
    <motion.div 
      initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
      className="w-full max-w-2xl max-h-[80vh] bg-[#1a1614] border border-white/10 rounded-3xl overflow-hidden flex flex-col shadow-2xl"
      onClick={e => e.stopPropagation()}
    >
      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-indigo-500/20 to-transparent">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-bold">심층 번역 분석 (Deep Analysis)</h2>
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
            <span className="text-sm font-bold">{analysis.detectedDomain}</span>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-indigo-400">
            <Languages className="w-3.5 h-3.5" /> 정교한 번역문
          </h3>
          <p className="p-4 rounded-2xl bg-white/5 border border-white/10 text-sm leading-relaxed font-serif italic">
            {analysis.translation}
          </p>
        </div>

        {analysis.terminologyAnalysis.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-teal-400">
              <FileText className="w-3.5 h-3.5" /> 전문 용어 분석
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
      </div>

      <div className="p-6 border-t border-white/5 bg-black/20">
        <button onClick={onClose} className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-bold uppercase tracking-widest text-xs hover:bg-indigo-500 transition-colors">
          분석 닫기
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

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Hydration fix & Clock
  useEffect(() => {
    const updateTime = () => setCurrentTime(format(new Date(), 'yyyy.MM.dd HH:mm:ss'));
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
          for (let i = 0; i < input.length; i++) pcm[i] = Math.max(-1, Math.min(1, input[i])) * 0x7FFF;
          const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm.buffer)));
          sessionRef.current.sendRealtimeInput({ audio: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
        }
        
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const average = data.reduce((a, b) => a + b) / data.length;
        setMicLevel(average / 128);
      };

      setIsRecording(true);
      setError(null);
    } catch (err: any) {
      console.error("Mic error:", err);
      if (err.name === 'NotAllowedError') {
        setError("마이크 접근 권한이 거부되었습니다. 브라우저 설정에서 마이크를 허용해 주세요.");
      } else if (err.name === 'NotFoundError') {
        setError("연결된 마이크를 찾을 수 없습니다. 장치 연결을 확인해 주세요.");
      } else {
        setError("마이크를 시작하는 중 알 수 없는 오류가 발생했습니다.");
      }
    }
  };

  const stopMic = () => {
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

    const buffer = audioContextRef.current.createBuffer(1, float.length, 16000);
    buffer.getChannelData(0).set(float);
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => { isPlayingRef.current = false; playQueue(); };
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
    
    if (!process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
      setError("API 키가 설정되지 않았습니다. 환경 변수를 확인해 주세요.");
      return;
    }

    setIsConnecting(true);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });
      const session = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: isManualMode 
            ? `You are a professional interpreter. Translate ONLY from ${sourceLang} to ${targetLang}. If the user speaks ${targetLang}, do not translate. Provide ONLY the translation as audio.`
            : `You are a professional interpreter. Translate ${sourceLang} to ${targetLang} and vice versa. Provide ONLY the translation as audio.`,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => { setIsConnected(true); setIsConnecting(false); startMic(); },
          onmessage: (msg: LiveServerMessage) => {
            // Handle Audio Output
            const base64 = msg.serverContent?.modelTurn?.parts?.find(p => p.inlineData)?.inlineData?.data;
            if (base64) {
              const binary = atob(base64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              audioQueueRef.current.push(new Int16Array(bytes.buffer));
              playQueue();
            }

            // Handle Interruption
            if (msg.serverContent?.interrupted) {
              audioQueueRef.current = [];
              // We could stop the current source if we tracked it, but clearing the queue is a good start.
            }

            // Handle Transcriptions
            const modelTurn = msg.serverContent?.modelTurn;
            if (modelTurn) {
              const text = modelTurn.parts?.find(p => p.text)?.text;
              if (text) {
                // In Gemini Live, transcriptions are delivered in modelTurn.
                // If it's the user's speech transcription, the role is often 'user'.
                const role = modelTurn.role === 'user' ? 'user' : 'model';
                const newItem: TranscriptItem = { 
                  id: Date.now().toString() + '-' + role + '-' + Math.random().toString(36).substr(2, 9), 
                  role, 
                  text, 
                  timestamp: new Date() 
                };
                setTranscript(prev => [...prev, newItem]);
                
                if (role === 'model') {
                  performDeepAnalysis(newItem);
                }
              }
            }
          },
          onclose: () => { setIsConnected(false); stopMic(); },
          onerror: (err: any) => {
            console.error("Gemini Error:", err);
            if (err.message?.includes('API_KEY_INVALID')) {
              setError("유효하지 않은 API 키입니다. 키를 다시 확인해 주세요.");
            } else if (err.message?.includes('network')) {
              setError("네트워크 연결에 문제가 발생했습니다. 인터넷 연결을 확인해 주세요.");
            } else {
              setError("통역 세션 연결 중 오류가 발생했습니다: " + (err.message || "알 수 없는 오류"));
            }
            setIsConnecting(false);
          }
        }
      });
      sessionRef.current = session;
    } catch (err: any) {
      console.error("Connection failed:", err);
      setError("서버 연결에 실패했습니다: " + (err.message || "알 수 없는 오류"));
      setIsConnecting(false);
    }
  };

  const performDeepAnalysis = async (item: TranscriptItem) => {
    setTranscript(prev => prev.map(t => t.id === item.id ? { ...t, isAnalyzing: true } : t));
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY! });
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
      setError("번역 분석 중 오류가 발생했습니다. 다시 시도해 주세요.");
      setTranscript(prev => prev.map(t => t.id === item.id ? { ...t, isAnalyzing: false } : t));
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0502] text-white font-sans selection:bg-indigo-500 overflow-hidden">
      {/* Immersive Background */}
      <div className="fixed inset-0 pointer-events-none">
        <motion.div 
          animate={{ 
            opacity: isConnected ? [0.3, 0.5, 0.3] : 0.3,
            scale: isConnected ? [1, 1.1, 1] : 1
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-[#3a1510] rounded-full blur-[120px]" 
        />
        <motion.div 
          animate={{ 
            opacity: isConnected ? [0.1, 0.3, 0.1] : 0.1,
            scale: isConnected ? [1, 1.2, 1] : 1
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-900/30 rounded-full blur-[150px]" 
        />
      </div>

      {/* Header */}
      <header className="relative z-10 p-6 flex justify-between items-end border-b border-white/5 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <motion.div 
            animate={{ rotate: isConnected ? 360 : 0 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-900 flex items-center justify-center shadow-lg shadow-indigo-500/20"
          >
            <Languages className="w-5 h-5" />
          </motion.div>
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              AI-Live-Interpreter
              {isConnected && (
                <motion.span 
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[8px] font-bold uppercase tracking-widest border border-emerald-500/20"
                >
                  Live
                </motion.span>
              )}
            </h1>
            <p className="text-[10px] uppercase tracking-[0.3em] opacity-40">Neural Translation Engine v2.5</p>
          </div>
        </div>
        <div className="text-right font-mono text-[10px] opacity-50 space-y-1">
          <div className="flex items-center justify-end gap-2">
            <Wifi className={cn("w-3 h-3", isConnected ? "text-emerald-500" : "text-white/20")} />
            <p>{currentTime || '...'}</p>
          </div>
          <p className="tracking-widest">STATUS: {isConnecting ? 'CONNECTING...' : isConnected ? 'CONNECTED' : 'IDLE'}</p>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-140px)]">
        {/* Left: Controls & Status */}
        <div className="lg:col-span-4 space-y-8">
          <section className="p-8 rounded-[2rem] bg-white/5 border border-white/10 backdrop-blur-2xl shadow-2xl space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-40">Configuration</h2>
              <Activity className={cn("w-4 h-4 transition-colors", isConnected ? "text-indigo-400" : "opacity-20")} />
            </div>
            
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Manual Mode</span>
                  <p className="text-[8px] opacity-40">Translate only from Source to Target</p>
                </div>
                <button 
                  onClick={() => setIsManualMode(!isManualMode)}
                  className={cn(
                    "w-10 h-5 rounded-full relative transition-colors",
                    isManualMode ? "bg-indigo-600" : "bg-white/10"
                  )}
                >
                  <motion.div 
                    animate={{ x: isManualMode ? 20 : 2 }}
                    className="absolute top-1 w-3 h-3 bg-white rounded-full"
                  />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 relative">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 transition-colors hover:bg-white/10">
                  <span className="text-[8px] uppercase tracking-widest opacity-40 block mb-2">Source Language</span>
                  <select value={sourceLang} onChange={e => setSourceLang(e.target.value)} className="bg-transparent text-sm font-bold outline-none w-full cursor-pointer">
                    {LANGUAGES.map(lang => (
                      <option key={lang.name} value={lang.name} className="bg-[#1a1614]">
                        {lang.flag} {lang.name} ({lang.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                  <motion.button 
                    whileHover={{ rotate: 180 }}
                    onClick={swapLanguages}
                    className="p-2 rounded-full bg-[#1a1614] border border-white/10 shadow-xl hover:bg-indigo-600 transition-colors"
                  >
                    <RefreshCcw className="w-3 h-3" />
                  </motion.button>
                </div>

                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 transition-colors hover:bg-white/10">
                  <span className="text-[8px] uppercase tracking-widest opacity-40 block mb-2">Target Language</span>
                  <select value={targetLang} onChange={e => setTargetLang(e.target.value)} className="bg-transparent text-sm font-bold outline-none w-full cursor-pointer">
                    {LANGUAGES.map(lang => (
                      <option key={lang.name} value={lang.name} className="bg-[#1a1614]">
                        {lang.flag} {lang.name} ({lang.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="relative flex justify-center py-4">
                <Ripple active={isRecording} />
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={isConnected ? () => sessionRef.current?.close() : connect}
                  disabled={isConnecting}
                  className={cn(
                    "relative z-10 w-24 h-24 rounded-full font-bold uppercase tracking-widest text-[10px] flex flex-col items-center justify-center gap-2 transition-all shadow-2xl",
                    isConnected 
                      ? "bg-red-500 text-white shadow-red-500/20" 
                      : "bg-white text-black shadow-white/10"
                  )}
                >
                  {isConnecting ? (
                    <Loader2 className="w-8 h-8 animate-spin" />
                  ) : isConnected ? (
                    <>
                      <MicOff className="w-8 h-8" />
                      <span className="text-[8px]">Stop</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-8 h-8" />
                      <span className="text-[8px]">Start</span>
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </section>

          {/* Audio Visualizer */}
          <div className="flex items-center justify-center gap-2 h-16 px-4">
            {[...Array(24)].map((_, i) => (
              <motion.div 
                key={i}
                animate={{ 
                  height: isRecording ? [4, Math.max(6, micLevel * 64 * (0.4 + Math.sin(i * 0.5) * 0.6)), 4] : 4,
                  opacity: isRecording ? [0.3, 1, 0.3] : 0.2
                }}
                transition={{ duration: 0.4, repeat: Infinity, delay: i * 0.02 }}
                className="w-1 bg-indigo-500 rounded-full"
              />
            ))}
          </div>
        </div>

        {/* Right: Transcript */}
        <div className="lg:col-span-8 flex flex-col min-h-0 bg-white/5 rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl backdrop-blur-sm">
          <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-50">Neural Stream</h3>
            </div>
            <button className="p-2 rounded-xl hover:bg-white/5 transition-colors">
              <History className="w-4 h-4 opacity-30" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide">
            {transcript.length === 0 && !isConnecting && (
              <div className="h-full flex flex-col items-center justify-center opacity-10 text-center">
                <Globe className="w-20 h-20 mb-6" />
                <p className="font-serif italic text-2xl">Awaiting neural input...</p>
                <p className="text-[10px] mt-2 uppercase tracking-widest">Start the link to begin translation</p>
              </div>
            )}
            
            {isConnecting && (
              <div className="h-full flex flex-col items-center justify-center space-y-6 opacity-40">
                <div className="relative">
                  <Loader2 className="w-12 h-12 animate-spin text-indigo-500" />
                  <div className="absolute inset-0 blur-xl bg-indigo-500/20 animate-pulse" />
                </div>
                <p className="text-[10px] uppercase tracking-[0.4em] animate-pulse">Establishing Secure Link</p>
              </div>
            )}

            <AnimatePresence initial={false}>
              {transcript.map((item) => (
                <motion.div 
                  key={item.id} 
                  initial={{ opacity: 0, x: item.role === 'user' ? 30 : -30, y: 20, scale: 0.95 }} 
                  animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                  transition={{ type: "spring", damping: 25, stiffness: 200 }}
                  className={cn("flex gap-4 w-full", item.role === 'user' ? "flex-row-reverse" : "flex-row")}
                >
                  {/* Avatar with Status Ring */}
                  <div className="relative shrink-0">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center shadow-lg relative z-10",
                      item.role === 'user' ? "bg-white/10" : "bg-indigo-600 shadow-indigo-500/40"
                    )}>
                      {item.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                    </div>
                    {item.role === 'model' && (
                      <motion.div 
                        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.2, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute inset-0 bg-indigo-500 rounded-full blur-md -z-10"
                      />
                    )}
                  </div>

                  <div className={cn("flex flex-col gap-2 max-w-[75%]", item.role === 'user' ? "items-end" : "items-start")}>
                    {/* Message Bubble */}
                    <div className={cn(
                      "group relative p-6 rounded-[2rem] text-sm leading-relaxed transition-all",
                      item.role === 'user' 
                        ? "bg-white/5 border border-white/10 shadow-lg rounded-tr-none hover:bg-white/10" 
                        : "bg-indigo-500/10 border border-indigo-500/20 italic font-serif shadow-indigo-500/5 shadow-2xl rounded-tl-none hover:bg-indigo-500/20"
                    )}>
                      {/* Neural Glow for AI */}
                      {item.role === 'model' && (
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent rounded-[2rem] pointer-events-none" />
                      )}

                      <div className="relative z-10">
                        {item.role === 'model' ? (
                          <div className="flex flex-col gap-1">
                            <TypingText text={item.text} />
                            {item.isAnalyzing && (
                              <motion.div 
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="flex items-center gap-2 mt-2 text-[10px] text-indigo-400/60 font-mono"
                              >
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>ANALYZING NEURAL PATTERNS...</span>
                              </motion.div>
                            )}
                          </div>
                        ) : (
                          <span className="text-white/90">{item.text}</span>
                        )}
                      </div>
                      
                      {/* Action Button */}
                      {item.role === 'model' && (
                        <motion.button 
                          whileHover={{ scale: 1.1, backgroundColor: "rgba(99, 102, 241, 0.3)" }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => performDeepAnalysis(item)}
                          className="absolute -right-14 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/5 opacity-0 group-hover:opacity-100 transition-all border border-white/10 backdrop-blur-md"
                        >
                          {item.isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin text-indigo-400" /> : <Sparkles className="w-4 h-4 text-indigo-400" />}
                        </motion.button>
                      )}
                    </div>

                    {/* Meta Info */}
                    <div className={cn(
                      "flex items-center gap-2 px-3 text-[9px] uppercase tracking-[0.2em] font-mono",
                      item.role === 'user' ? "flex-row-reverse opacity-30" : "opacity-40"
                    )}>
                      <span className="font-bold">{item.role === 'user' ? 'Local Node' : 'Neural Core'}</span>
                      <span className="w-1 h-1 rounded-full bg-white/20" />
                      <span>{format(item.timestamp, 'HH:mm:ss')}</span>
                      {item.analysis && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-white/20" />
                          <span className="text-indigo-400 font-bold">Analysis Ready</span>
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={transcriptEndRef} />
          </div>
        </div>
      </main>

      <AnimatePresence>
        {selectedAnalysis && <AnalysisModal analysis={selectedAnalysis} onClose={() => setSelectedAnalysis(null)} />}
        {error && <Toast message={error} onClose={() => setError(null)} />}
      </AnimatePresence>

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
