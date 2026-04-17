// @ts-ignore
import lamejs from 'lamejs';

export function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

/**
 * Normalizes an AudioBuffer to a target peak (default -1dB)
 */
export function normalizeAudio(buffer: AudioBuffer, targetDb: number = -1): AudioBuffer {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;
  const sampleRate = buffer.sampleRate;
  
  // Find peak amplitude
  let maxAmp = 0;
  for (let c = 0; c < numChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
       const abs = Math.abs(data[i]);
       if (abs > maxAmp) maxAmp = abs;
    }
  }

  if (maxAmp === 0) return buffer;

  const targetAmp = Math.pow(10, targetDb / 20);
  const multiplier = targetAmp / maxAmp;

  const newBuffer = new AudioBuffer({ numberOfChannels: numChannels, length, sampleRate });
  for (let c = 0; c < numChannels; c++) {
    const oldData = buffer.getChannelData(c);
    const newData = newBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
        newData[i] = oldData[i] * multiplier;
    }
  }
  return newBuffer;
}

export async function removeSilence(
  audioBuffer: AudioBuffer,
  options: {
    thresholdDb: number;
    keepSilenceSec: number;
    minSilenceDuration: number;
    lookaheadSec: number;
    onProgress?: (progress: number) => void;
  }
): Promise<{ buffer: AudioBuffer; stats: any }> {
  const { thresholdDb, keepSilenceSec, minSilenceDuration, lookaheadSec, onProgress } = options;
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;

  const threshold = Math.pow(10, thresholdDb / 20);
  const windowSize = Math.floor(sampleRate * 0.01); // 10ms windows
  const numWindows = Math.ceil(length / windowSize);

  const isSilent = new Uint8Array(numWindows);

  // 1. Detect silence per window
  for (let w = 0; w < numWindows; w++) {
    const start = w * windowSize;
    const end = Math.min(start + windowSize, length);

    let maxAmp = 0;
    for (let c = 0; c < numChannels; c++) {
      const data = audioBuffer.getChannelData(c);
      for (let i = start; i < end; i++) {
        const abs = Math.abs(data[i]);
        if (abs > maxAmp) maxAmp = abs;
      }
    }
    isSilent[w] = maxAmp < threshold ? 1 : 0;
    
    if (w % 2000 === 0 && onProgress) {
      await new Promise(r => setTimeout(r, 0));
      onProgress(0.1 + (0.3 * (w / numWindows)));
    }
  }

  // 2. Refine silence (Min Silence Duration filter)
  // If a silence is shorter than minSilenceDuration, it's NOT silence.
  const minSilenceWindows = Math.ceil(minSilenceDuration / 0.01);
  let silenceStart = -1;
  for (let w = 0; w < numWindows; w++) {
    if (isSilent[w] === 1) {
      if (silenceStart === -1) silenceStart = w;
    } else {
      if (silenceStart !== -1) {
        const duration = w - silenceStart;
        if (duration < minSilenceWindows) {
          // Flip back to active
          for (let i = silenceStart; i < w; i++) isSilent[i] = 0;
        }
        silenceStart = -1;
      }
    }
  }

  // 3. Add padding and lookahead
  const keepWindows = Math.ceil(keepSilenceSec / 0.01);
  const lookaheadWindows = Math.ceil(lookaheadSec / 0.01);
  const keepActive = new Uint8Array(numWindows);

  for (let w = 0; w < numWindows; w++) {
    if (isSilent[w] === 0) {
      const startW = Math.max(0, w - keepWindows - lookaheadWindows);
      const endW = Math.min(numWindows - 1, w + keepWindows);
      for (let i = startW; i <= endW; i++) {
        keepActive[i] = 1;
      }
    }
  }

  if (onProgress) onProgress(0.5);

  // 4. Calculate stats and new length
  let newLength = 0;
  let segmentCount = 0;
  let inSegment = false;
  for (let w = 0; w < numWindows; w++) {
    if (keepActive[w]) {
      newLength += windowSize;
      if (!inSegment) {
        segmentCount++;
        inSegment = true;
      }
    } else {
      inSegment = false;
    }
  }
  
  if (newLength > length) newLength = length; // cap

  if (newLength === 0) {
    const emptyCtx = new OfflineAudioContext(numChannels, 1, sampleRate);
    return { buffer: emptyCtx.createBuffer(numChannels, 1, sampleRate), stats: { segmentCount: 0 } };
  }

  // 5. Construct new buffer
  const offlineCtx = new OfflineAudioContext(numChannels, newLength, sampleRate);
  const newAudioBuffer = offlineCtx.createBuffer(numChannels, newLength, sampleRate);

  for (let c = 0; c < numChannels; c++) {
    const oldData = audioBuffer.getChannelData(c);
    const newData = newAudioBuffer.getChannelData(c);
    let destIdx = 0;

    for (let w = 0; w < numWindows; w++) {
      if (keepActive[w]) {
        let start = w * windowSize;
        let end = Math.min(start + windowSize, length);

        const isStart = w === 0 || !keepActive[w - 1]; 
        const isEnd = w === numWindows - 1 || !keepActive[w + 1];

        for (let i = start; i < end; i++) {
          if (destIdx >= newLength) break;
          let sample = oldData[i];

          const fadeLength = Math.floor(sampleRate * 0.005); // Fixed 5ms small crossfade to prevent clicks
          
          if (isStart) {
            let pos = i - start;
            if (pos < fadeLength) sample *= (pos / fadeLength);
          } else if (isEnd) {
             let pos = end - i;
             if (pos < fadeLength) sample *= (pos / fadeLength);
          }

          newData[destIdx++] = sample;
        }
      }
      
      if (c === 0 && w % 2000 === 0 && onProgress) {
        await new Promise(r => setTimeout(r, 0)); 
        onProgress(0.5 + (0.4 * (w / numWindows)));
      }
    }
  }

  const finalStats = {
    segmentCount,
    originalDuration: audioBuffer.duration,
    newDuration: newAudioBuffer.duration,
    percentRemoved: ((audioBuffer.duration - newAudioBuffer.duration) / audioBuffer.duration) * 100,
    avgSegmentLength: newAudioBuffer.duration / segmentCount
  };

  if (onProgress) onProgress(1.0);
  return { buffer: newAudioBuffer, stats: finalStats };
}

export async function audioBufferToFormat(buffer: AudioBuffer, format: 'wav' | 'mp3', onProgress?:()=>Promise<void>): Promise<Blob> {
  if (format === 'wav') {
    return bufferToWav(buffer);
  } else {
    if(onProgress) await onProgress();
    return bufferToMp3(buffer);
  }
}

async function bufferToWav(buffer: AudioBuffer): Promise<Blob> {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1;
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
  
    const left = buffer.getChannelData(0);
    const right = numChannels === 2 ? buffer.getChannelData(1) : new Float32Array(0);
  
    const dataSize = left.length * numChannels * bytesPerSample;
    const bufferSize = 44 + dataSize;
    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);
  
    const writeString = (view: DataView, offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
  
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
  
    let offset = 44;
    for (let i = 0; i < left.length; i++) {
        let s = Math.max(-1, Math.min(1, left[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
        if (numChannels === 2) {
            s = Math.max(-1, Math.min(1, right[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            offset += 2;
        }
    }
  
    return new Blob([view], { type: 'audio/wav' });
}

async function bufferToMp3(buffer: AudioBuffer): Promise<Blob> {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, 128);
  const mp3Data: any[] = [];

  const leftData = buffer.getChannelData(0);
  const rightData = numChannels === 2 ? buffer.getChannelData(1) : new Float32Array(0);

  const sampleBlockSize = 1152;
  const leftChunk = new Int16Array(sampleBlockSize);
  const rightChunk = new Int16Array(sampleBlockSize);

  for (let i = 0; i < leftData.length; i += sampleBlockSize) {
    let chunkIdx = 0;
    for (let j = i; j < i + sampleBlockSize && j < leftData.length; j++) {
      leftChunk[chunkIdx] = leftData[j] < 0 ? leftData[j] * 32768 : leftData[j] * 32767;
      if (numChannels === 2) {
        rightChunk[chunkIdx] = rightData[j] < 0 ? rightData[j] * 32768 : rightData[j] * 32767;
      }
      chunkIdx++;
    }

    let mp3buf;
    if (numChannels === 2) {
      mp3buf = mp3encoder.encodeBuffer(leftChunk.subarray(0, chunkIdx), rightChunk.subarray(0, chunkIdx));
    } else {
      mp3buf = mp3encoder.encodeBuffer(leftChunk.subarray(0, chunkIdx));
    }
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
    
    if (i % (sampleBlockSize * 100) === 0) {
        await new Promise(r => setTimeout(r, 0));
    }
  }

  const mp3buf = mp3encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(mp3buf);
  }

  return new Blob(mp3Data, { type: 'audio/mp3' });
}

