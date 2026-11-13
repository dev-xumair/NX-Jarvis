/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VoiceEngineState } from '../types/agent.ts';

export type MicPermissionStatus = 'granted' | 'denied' | 'prompt' | 'unavailable';

export interface AudioDeviceOption {
  deviceId: string;
  label: string;
}

export interface TtsVoiceOption {
  name: string;
  lang: string;
}

export interface AudioSessionCallbacks {
  onStateChange: (state: VoiceEngineState) => void;
  onInterimTranscript: (text: string) => void;
  onFinalTranscript: (text: string) => void;
  onMicLevel: (level: number) => void;
  onError: (code: string, message: string) => void;
  onDevicesUpdated: (devices: AudioDeviceOption[], voices: TtsVoiceOption[]) => void;
  onPermissionChange: (status: MicPermissionStatus) => void;
}

export interface SpeakOptions {
  rate?: number;
  volume?: number;
  lang?: 'auto' | 'en-US' | 'ur-PK';
  voiceName?: string;
}

export function cleanTextForSpeech(raw: string): string {
  return (raw || '')
    .replace(/\[\/?UNTRUSTED_TOOL_DATA[^\]]*\]/gi, '')
    .replace(/```[\s\S]*?```/g, ' code snippet omitted ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*#_~>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export class AudioSession {
  private state: VoiceEngineState = 'IDLE';
  private recognition: any = null;
  private micStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private animFrame: number | null = null;
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private readonly callbacks: AudioSessionCallbacks;

  private boundVoicesChanged = () => this.refreshDevicesAndVoices();
  private boundDeviceChange = () => this.refreshDevicesAndVoices();

  constructor(callbacks: AudioSessionCallbacks) {
    this.callbacks = callbacks;
    if (typeof window !== 'undefined') {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.addEventListener?.('voiceschanged', this.boundVoicesChanged);
      }
      if (navigator.mediaDevices?.addEventListener) {
        navigator.mediaDevices.addEventListener('devicechange', this.boundDeviceChange);
      }
      this.refreshDevicesAndVoices();
      this.probePermission();
    }
  }

  getState(): VoiceEngineState {
    return this.state;
  }

  private setState(next: VoiceEngineState): void {
    this.state = next;
    this.callbacks.onStateChange(next);
  }

  async probePermission(): Promise<MicPermissionStatus> {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.callbacks.onPermissionChange('unavailable');
      return 'unavailable';
    }
    try {
      if (navigator.permissions?.query) {
        const res = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        const mapped: MicPermissionStatus =
          res.state === 'granted' ? 'granted' : res.state === 'denied' ? 'denied' : 'prompt';
        this.callbacks.onPermissionChange(mapped);
        return mapped;
      }
    } catch {
      // Some browsers reject 'microphone' in Permissions API
    }
    this.callbacks.onPermissionChange('prompt');
    return 'prompt';
  }

  async refreshDevicesAndVoices(): Promise<{ devices: AudioDeviceOption[]; voices: TtsVoiceOption[] }> {
    const devices: AudioDeviceOption[] = [];
    const voices: TtsVoiceOption[] = [];

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        list
          .filter((d) => d.kind === 'audioinput')
          .forEach((d, idx) => {
            devices.push({
              deviceId: d.deviceId,
              label: d.label || `Microphone ${idx + 1}`,
            });
          });
      } catch {
        // Ignore enumerate failure
      }
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.getVoices().forEach((v) => {
          voices.push({ name: v.name, lang: v.lang });
        });
      } catch {
        // Ignore TTS voice enumeration error
      }
    }

    this.callbacks.onDevicesUpdated(devices, voices);
    return { devices, voices };
  }

  interruptSpeech(): void {
    const wasSpeaking =
      this.state === 'SPEAKING' ||
      (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore cancel failure
      }
    }
    this.activeUtterance = null;
    if (wasSpeaking) {
      this.setState('INTERRUPTED');
      setTimeout(() => {
        if (this.state === 'INTERRUPTED') {
          this.setState('IDLE');
        }
      }, 250);
    }
  }

  speak(rawText: string, options: SpeakOptions = {}): boolean {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      this.callbacks.onError('TTS_UNAVAILABLE', 'SpeechSynthesis API is unavailable in this runtime.');
      return false;
    }

    const cleaned = cleanTextForSpeech(rawText);
    if (!cleaned) return false;

    this.interruptSpeech();

    const utterance = new SpeechSynthesisUtterance(cleaned);
    const voices = window.speechSynthesis.getVoices();
    const isUrduOrRoman =
      /[\u0600-\u06FF]/.test(cleaned) ||
      /\b(hai|hain|karo|karein|aap|main|ho|gaya|theek|shukriya|batao)\b/i.test(cleaned);

    const targetLang =
      options.lang && options.lang !== 'auto'
        ? options.lang
        : isUrduOrRoman
          ? 'ur-PK'
          : 'en-US';

    let chosen = options.voiceName ? voices.find((v) => v.name === options.voiceName) : undefined;
    if (!chosen) {
      chosen = isUrduOrRoman
        ? voices.find((v) => v.lang.startsWith('ur')) || voices.find((v) => v.lang.startsWith('hi')) || voices.find((v) => v.lang.startsWith('en'))
        : voices.find((v) => v.lang.startsWith('en'));
    }

    if (chosen) utterance.voice = chosen;
    utterance.lang = chosen?.lang || targetLang;
    utterance.rate = typeof options.rate === 'number' ? Math.max(0.6, Math.min(1.6, options.rate)) : 1.0;
    utterance.volume = typeof options.volume === 'number' ? Math.max(0, Math.min(1, options.volume)) : 1.0;

    utterance.onstart = () => {
      this.activeUtterance = utterance;
      this.setState('SPEAKING');
    };
    utterance.onend = () => {
      if (this.activeUtterance === utterance) {
        this.activeUtterance = null;
        if (this.state === 'SPEAKING') this.setState('IDLE');
      }
    };
    utterance.onerror = () => {
      if (this.activeUtterance === utterance) {
        this.activeUtterance = null;
        this.setState('IDLE');
      }
    };

    try {
      window.speechSynthesis.speak(utterance);
      return true;
    } catch {
      this.setState('ERROR');
      this.callbacks.onError('TTS_PLAYBACK_ERROR', 'Unable to start speech synthesis playback.');
      return false;
    }
  }

  private cleanupAudioGraph(): void {
    if (this.animFrame !== null) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.callbacks.onMicLevel(0);
  }

  stopListening(nextState: VoiceEngineState = 'IDLE'): void {
    if (this.recognition) {
      try {
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.stop();
      } catch {
        // Ignore stop error
      }
      this.recognition = null;
    }
    this.cleanupAudioGraph();
    this.callbacks.onInterimTranscript('');
    this.setState(nextState);
  }

  async startListening(options: { lang?: 'auto' | 'en-US' | 'ur-PK'; deviceId?: string } = {}): Promise<boolean> {
    if (this.state === 'LISTENING' || this.state === 'REQUESTING_PERMISSION') {
      return true;
    }

    if (typeof window === 'undefined') {
      this.setState('UNAVAILABLE');
      this.callbacks.onError(
        'UNAVAILABLE_ON_CURRENT_HOST',
        'Voice input requires an interactive browser/desktop session.'
      );
      return false;
    }

    // Barge-in immediately if TTS was speaking
    this.interruptSpeech();

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      this.setState('UNAVAILABLE');
      this.callbacks.onError(
        'SPEECH_RECOGNITION_UNAVAILABLE',
        'Web SpeechRecognition API is unavailable in this browser/runtime. Use the text composer below.'
      );
      return false;
    }

    this.setState('REQUESTING_PERMISSION');

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const audioConstraint: MediaTrackConstraints | boolean = options.deviceId
          ? { deviceId: { exact: options.deviceId } }
          : true;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint });
        this.micStream = stream;
        this.callbacks.onPermissionChange('granted');
        await this.refreshDevicesAndVoices();

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          this.audioCtx = ctx;
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          src.connect(analyser);
          const buffer = new Uint8Array(analyser.frequencyBinCount);

          const pump = () => {
            if (!this.audioCtx) return;
            analyser.getByteFrequencyData(buffer);
            let sum = 0;
            for (let i = 0; i < buffer.length; i++) sum += buffer[i];
            this.callbacks.onMicLevel(Math.min(100, Math.round((sum / buffer.length) * 1.8)));
            this.animFrame = requestAnimationFrame(pump);
          };
          pump();
        }
      } catch (err: unknown) {
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          this.callbacks.onPermissionChange('denied');
          this.setState('ERROR');
          this.callbacks.onError(
            'MICROPHONE_DENIED',
            'Microphone access was denied by browser/OS permissions. Allow microphone access in browser site settings.'
          );
          return false;
        }
        this.callbacks.onPermissionChange('unavailable');
        this.setState('UNAVAILABLE');
        this.callbacks.onError(
          'UNAVAILABLE_ON_CURRENT_HOST',
          'No active microphone input device was detected on this host.'
        );
        return false;
      }
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = options.lang && options.lang !== 'auto' ? options.lang : 'en-US';

      let committedFinal = false;

      recognition.onstart = () => {
        this.setState('LISTENING');
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalText += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        if (interim && !finalText) {
          this.callbacks.onInterimTranscript(interim);
        }
        if (finalText.trim() && !committedFinal) {
          committedFinal = true;
          const cleanFinal = finalText.trim();
          this.stopListening('PROCESSING');
          this.callbacks.onFinalTranscript(cleanFinal);
        }
      };

      recognition.onerror = (err: any) => {
        const errCode = err?.error || 'audio_capture_failed';
        this.stopListening('ERROR');
        if (errCode === 'not-allowed') {
          this.callbacks.onPermissionChange('denied');
          this.callbacks.onError('MICROPHONE_DENIED', 'Microphone permission rejected during capture.');
        } else if (errCode !== 'aborted') {
          this.callbacks.onError('VOICE_CAPTURE_ERROR', `Voice capture reported: ${errCode}`);
        }
      };

      recognition.onend = () => {
        if (this.state === 'LISTENING') {
          this.stopListening('IDLE');
        }
      };

      this.recognition = recognition;
      recognition.start();
      return true;
    } catch {
      this.stopListening('ERROR');
      this.callbacks.onError('VOICE_START_FAILED', 'Unable to start speech recognition session.');
      return false;
    }
  }

  destroy(): void {
    this.stopListening('IDLE');
    this.interruptSpeech();
    if (typeof window !== 'undefined') {
      window.speechSynthesis?.removeEventListener?.('voiceschanged', this.boundVoicesChanged);
      navigator.mediaDevices?.removeEventListener?.('devicechange', this.boundDeviceChange);
    }
  }
}
