import React, { useState, useEffect, useRef } from "react";
import { 
  UploadCloud, FileAudio, Download, AlertCircle, Loader2, Music, Scissors, 
  Settings2, Activity, Zap, Play, FastForward, Rewind, BarChart3, RotateCcw,
  Volume2, Maximize
} from "lucide-react";
import { cn } from "./lib/utils";
import { formatTime, removeSilence, audioBufferToFormat, normalizeAudio } from "./lib/audioUtils";
import { Waveform } from "./components/Waveform";

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [originalAudioBuffer, setOriginalAudioBuffer] = useState<AudioBuffer | null>(null);
  const [trimmedAudioBuffer, setTrimmedAudioBuffer] = useState<AudioBuffer | null>(null);
  const [stats, setStats] = useState<any>(null);

  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [trimmedUrl, setTrimmedUrl] = useState<string | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Advanced Settings
  const [thresholdDb, setThresholdDb] = useState(-40);
  const [keepSilenceSec, setKeepSilenceSec] = useState(0.05);
  const [minSilenceDuration, setMinSilenceDuration] = useState(0.2);
  const [lookaheadSec, setLookaheadSec] = useState(0.02);
  const [shouldNormalize, setShouldNormalize] = useState(true);

  const [exportFormat, setExportFormat] = useState<'wav' | 'mp3'>('wav');
  const [isExporting, setIsExporting] = useState(false);
  
  // Player speeds
  const [originalSpeed, setOriginalSpeed] = useState(1);
  const [trimmedSpeed, setTrimmedSpeed] = useState(1);
  
  const originalAudioRef = useRef<HTMLAudioElement>(null);
  const trimmedAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (originalAudioRef.current) originalAudioRef.current.playbackRate = originalSpeed;
  }, [originalSpeed]);

  useEffect(() => {
    if (trimmedAudioRef.current) trimmedAudioRef.current.playbackRate = trimmedSpeed;
  }, [trimmedSpeed]);

  const handleFileDrop = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLDivElement>) => {
    let selectedFile: File | undefined;
    if ('dataTransfer' in e) {
      e.preventDefault();
      selectedFile = e.dataTransfer.files[0];
    } else {
      selectedFile = e.target.files?.[0];
    }

    if (!selectedFile) return;
    if (!selectedFile.type.startsWith('audio/')) {
      setError("Please upload a valid audio file.");
      return;
    }

    setError(null);
    setFile(selectedFile);
    setOriginalAudioBuffer(null);
    setTrimmedAudioBuffer(null);
    setStats(null);
    setIsProcessing(true);
    setProgress(0);

    if (originalUrl) URL.revokeObjectURL(originalUrl);
    setOriginalUrl(URL.createObjectURL(selectedFile));
    if (trimmedUrl) URL.revokeObjectURL(trimmedUrl);
    setTrimmedUrl(null);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const ctx = new window.AudioContext();
      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);
      setOriginalAudioBuffer(decodedBuffer);
    } catch (err: any) {
      setError(err.message || "Failed to decode audio file.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcess = async () => {
    if (!originalAudioBuffer) return;
    setIsProcessing(true);
    setProgress(0);
    setError(null);

    try {
      let { buffer: newBuffer, stats: newStats } = await removeSilence(
        originalAudioBuffer,
        {
          thresholdDb,
          keepSilenceSec,
          minSilenceDuration,
          lookaheadSec,
          onProgress: (p) => setProgress(p)
        }
      );

      if (shouldNormalize) {
        newBuffer = normalizeAudio(newBuffer);
      }

      setTrimmedAudioBuffer(newBuffer);
      setStats(newStats);

      const tempWav = await audioBufferToFormat(newBuffer, 'wav');
      if (trimmedUrl) URL.revokeObjectURL(trimmedUrl);
      setTrimmedUrl(URL.createObjectURL(tempWav));
    } catch (err: any) {
      setError(err.message || "Failed to process audio.");
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const handleExport = async () => {
    if (!trimmedAudioBuffer || !file) return;
    setIsExporting(true);
    
    try {
      const blob = await audioBufferToFormat(trimmedAudioBuffer, exportFormat, async () => {
          await new Promise(r => setTimeout(r, 0));
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      a.download = `${baseName}_trimmed.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      window.setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err: any) {
        setError(err.message || "Failed to export audio");
    } finally {
        setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#E6E6E6] text-[#151619] font-sans selection:bg-blue-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Hardware-style Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-gray-300">
          <div className="space-y-1">
            <h1 className="text-4xl font-black tracking-tighter uppercase italic text-[#151619] flex items-center gap-3">
              <span className="bg-[#151619] text-[#E6E6E6] p-1 px-3 rounded">SR-X</span>
              Silence Destroyer
            </h1>
            <p className="text-sm font-mono tracking-widest text-gray-500 uppercase">Pro-Grade Audio Dynamics Processor // v2.0</p>
          </div>
          {originalAudioBuffer && (
            <button 
              onClick={() => window.location.reload()}
              className="text-xs font-mono uppercase tracking-widest flex items-center gap-2 text-gray-400 hover:text-red-500 transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Reset Session
            </button>
          )}
        </div>

        {/* Upload Zone */}
        {!originalAudioBuffer && !isProcessing && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            className="border-[3px] border-dashed border-gray-400 rounded-2xl p-20 text-center bg-gray-200/50 hover:bg-gray-100/50 hover:border-blue-500 transition-all cursor-pointer group"
          >
            <input type="file" accept="audio/*" className="hidden" id="audio-upload" onChange={handleFileDrop} />
            <label htmlFor="audio-upload" className="cursor-pointer flex flex-col items-center justify-center space-y-6">
              <div className="w-20 h-20 bg-[#151619] text-[#E6E6E6] rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <UploadCloud className="w-10 h-10" />
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-black tracking-tight uppercase">Drop Source Material</p>
                <p className="text-sm font-mono text-gray-500 uppercase tracking-widest">WAV / MP3 / AIFF / OGG</p>
              </div>
            </label>
          </div>
        )}

        {isProcessing && !originalAudioBuffer && (
          <div className="bg-[#151619] text-white rounded-3xl p-20 text-center shadow-2xl flex flex-col items-center justify-center space-y-6">
             <div className="relative">
               <Loader2 className="w-16 h-16 text-blue-400 animate-spin" />
               <div className="absolute inset-0 flex items-center justify-center">
                 <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
               </div>
             </div>
             <p className="font-mono text-sm tracking-[0.3em] uppercase animate-pulse">Initializing Neural Buffer...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-r-xl flex items-start gap-4 shadow-sm">
             <AlertCircle className="w-6 h-6 shrink-0" />
             <div className="space-y-1">
               <p className="font-bold uppercase text-xs tracking-widest">Hardware Fault</p>
               <p className="text-sm font-medium">{error}</p>
             </div>
          </div>
        )}

        {/* Main Interface */}
        {originalAudioBuffer && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Column: Rack Controls */}
            <div className="lg:col-span-4 space-y-6 sticky top-8">
              
              {/* Primary Processing Rack */}
              <div className="bg-[#151619] rounded-2xl p-6 shadow-2xl text-white space-y-6 border border-gray-800">
                <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                  <div className="flex items-center gap-3">
                    <Settings2 className="w-5 h-5 text-blue-400" />
                    <span className="font-mono text-xs tracking-[0.2em] uppercase font-bold">Gate Config</span>
                  </div>
                  <div className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-md text-[10px] font-mono border border-blue-500/20">READY</div>
                </div>

                <div className="space-y-6">
                  {/* Threshold */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Floor Threshold</label>
                      <span className="text-xl font-bold font-mono text-blue-400">{thresholdDb}db</span>
                    </div>
                    <input 
                      type="range" min="-60" max="-10" step="1" 
                      value={thresholdDb} onChange={(e) => setThresholdDb(parseInt(e.target.value))}
                      className="w-full accent-blue-500 bg-gray-800 h-1.5 rounded-full appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Keep Silence */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Release Pad</label>
                       <div className="relative">
                        <input 
                          type="number" step="0.01" value={keepSilenceSec} 
                          onChange={(e) => setKeepSilenceSec(parseFloat(e.target.value))}
                          className="bg-gray-800 border-none w-full rounded-lg px-3 py-2 text-sm font-mono text-white focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="absolute right-3 top-2 text-[10px] font-mono text-gray-500">sec</span>
                       </div>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Lookahead</label>
                       <div className="relative">
                        <input 
                          type="number" step="0.01" value={lookaheadSec} 
                          onChange={(e) => setLookaheadSec(parseFloat(e.target.value))}
                          className="bg-gray-800 border-none w-full rounded-lg px-3 py-2 text-sm font-mono text-white focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="absolute right-3 top-2 text-[10px] font-mono text-gray-500">sec</span>
                       </div>
                    </div>
                  </div>

                  {/* Min Silence Duration */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Min. Gap Width</label>
                    <div className="relative">
                      <input 
                        type="number" step="0.05" value={minSilenceDuration} 
                        onChange={(e) => setMinSilenceDuration(parseFloat(e.target.value))}
                        className="bg-gray-800 border-none w-full rounded-lg px-3 py-2 text-sm font-mono text-white focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="absolute right-3 top-2 text-[10px] font-mono text-gray-500">sec</span>
                    </div>
                    <p className="text-[9px] text-gray-500 font-mono italic mt-1 font-bold">Ignore silences shorter than this.</p>
                  </div>

                  {/* Post-Processing */}
                  <div className="pt-4 border-t border-gray-800">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className={cn(
                        "w-10 h-5 rounded-full relative transition-colors p-1",
                        shouldNormalize ? "bg-blue-500" : "bg-gray-700"
                      )}>
                        <div className={cn(
                          "w-3 h-3 bg-white rounded-full transition-transform",
                          shouldNormalize ? "translate-x-5" : "translate-x-0"
                        )} />
                        <input type="checkbox" className="hidden" checked={shouldNormalize} onChange={() => setShouldNormalize(!shouldNormalize)} />
                      </div>
                      <span className="text-[10px] font-mono text-gray-300 uppercase tracking-[0.2em] group-hover:text-white transition-colors">Peak Normalization (-1dB)</span>
                    </label>
                  </div>

                  <button 
                    onClick={handleProcess}
                    disabled={isProcessing}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] disabled:opacity-50 uppercase tracking-[0.2em] text-sm flex items-center justify-center gap-3"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Processing ({Math.round(progress * 100)}%)
                      </>
                    ) : (
                      <>
                        <Zap className="w-5 h-5 fill-current" />
                        Execute Destructive Edit
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Stats Rack */}
              {stats && (
                <div className="bg-white rounded-2xl p-6 shadow-xl border border-gray-200 space-y-5">
                   <div className="flex items-center gap-3 border-b pb-3 mb-2">
                     <BarChart3 className="w-5 h-5 text-blue-500" />
                     <span className="font-mono text-xs tracking-widest uppercase font-bold text-gray-600">Analytics Report</span>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-[9px] text-gray-400 uppercase font-bold tracking-tighter">Segments Found</p>
                        <p className="text-2xl font-black text-gray-800 leading-none">{stats.segmentCount}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] text-gray-400 uppercase font-bold tracking-tighter">Audio Purged</p>
                        <p className="text-2xl font-black text-red-500 leading-none">-{stats.percentRemoved.toFixed(1)}%</p>
                      </div>
                      <div className="space-y-1 col-span-2 pt-2 border-t">
                        <p className="text-[9px] text-gray-400 uppercase font-bold tracking-tighter">Average Segment Duration</p>
                        <p className="text-lg font-mono font-bold text-gray-700">{formatTime(stats.avgSegmentLength)}</p>
                      </div>
                   </div>
                </div>
              )}
            </div>

            {/* Right Column: Waveforms & Playback */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* Source Rack */}
              <div className="bg-white rounded-2xl p-6 shadow-xl border border-gray-200 space-y-4 overflow-hidden relative">
                <div className="flex items-center justify-between pb-2">
                  <div className="flex items-center gap-3">
                    <Music className="w-5 h-5 text-gray-400" />
                    <span className="font-mono text-xs tracking-widest uppercase font-bold">Source Material</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex bg-gray-100 rounded-lg p-1">
                      {[1, 1.25, 1.5, 2].map(speed => (
                        <button 
                          key={speed} 
                          onClick={() => setOriginalSpeed(speed)}
                          className={cn(
                            "px-2 py-0.5 text-[10px] font-mono rounded transition-colors",
                            originalSpeed === speed ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                          )}
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-2 border border-gray-100 relative group">
                  <Waveform buffer={originalAudioBuffer} color="#94a3b8" height={100} />
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1 bg-white shadow-md rounded hover:text-blue-500"><Maximize className="w-3 h-3" /></button>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <audio ref={originalAudioRef} controls src={originalUrl || ""} className="flex-1 h-10" />
                  <div className="text-right">
                    <p className="text-[9px] font-mono text-gray-400 uppercase italic">Inbound Duration</p>
                    <p className="text-lg font-mono font-bold leading-none">{formatTime(originalAudioBuffer.duration)}</p>
                  </div>
                </div>
              </div>

              {/* Trimmed Result Rack */}
              {trimmedAudioBuffer && (
                <div className="bg-white rounded-2xl p-8 shadow-2xl border-2 border-blue-500 space-y-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -translate-y-16 translate-x-16" />
                  
                  <div className="flex items-center justify-between pb-2 border-b">
                    <div className="flex items-center gap-3">
                      <Activity className="w-5 h-5 text-blue-500 animate-pulse" />
                      <span className="font-mono text-xs tracking-widest uppercase font-bold text-gray-800">Processed Output</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex bg-gray-100 rounded-lg p-1">
                        {[1, 1.25, 1.5, 2].map(speed => (
                          <button 
                            key={speed} 
                            onClick={() => setTrimmedSpeed(speed)}
                            className={cn(
                              "px-2 py-0.5 text-[10px] font-mono rounded transition-colors",
                              trimmedSpeed === speed ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                            )}
                          >
                            {speed}x
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                    <Waveform buffer={trimmedAudioBuffer} color="#2563eb" height={120} />
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <div className="flex-1 space-y-2">
                       <audio ref={trimmedAudioRef} controls src={trimmedUrl || ""} className="w-full h-12" />
                       <div className="flex justify-between items-center px-1">
                          <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Master Output Stream</p>
                          <p className="text-xl font-mono font-black text-blue-600">{formatTime(trimmedAudioBuffer.duration)}</p>
                       </div>
                    </div>

                    <div className="w-full md:w-64 space-y-4 pt-4 md:pt-0 md:border-l md:pl-6 border-gray-100">
                       <div className="space-y-1">
                         <label className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Target Codec</label>
                         <div className="grid grid-cols-2 gap-2">
                           {(['wav', 'mp3'] as const).map(fmt => (
                             <button
                               key={fmt}
                               onClick={() => setExportFormat(fmt)}
                               className={cn(
                                 "border-2 rounded-xl py-2 text-xs font-bold uppercase tracking-widest transition-all",
                                 exportFormat === fmt 
                                   ? "bg-[#151619] border-[#151619] text-white" 
                                   : "border-gray-200 text-gray-500 hover:border-gray-300"
                               )}
                             >
                               {fmt}
                             </button>
                           ))}
                         </div>
                       </div>
                       
                       <button 
                         onClick={handleExport}
                         disabled={isExporting}
                         className="w-full bg-[#151619] hover:bg-black text-[#E6E6E6] font-black py-4 rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-xs"
                       >
                          {isExporting ? (
                             <><Loader2 className="w-4 h-4 animate-spin" /> Committing to Disk</>
                          ) : (
                            <><Download className="w-4 h-4" /> Download Result</>
                          )}
                       </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

      </div>
    </div>
  );
}


