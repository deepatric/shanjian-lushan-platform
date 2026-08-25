import { useCallback, useEffect, useRef, useState } from 'react';

const soundscapeLabels: Record<number, string> = {
  1: '阴云初聚',
  2: '铁锁沉江',
  3: '烈火焦土',
  4: '孤峰坚守',
  5: '山河凯歌',
};

const actVoicings: Record<number, { notes: number[]; wave: OscillatorType; pace: number; level: number }> = {
  1: { notes: [55, 65.41, 82.41], wave: 'sine', pace: 1.2, level: 0.024 },
  2: { notes: [73.42, 110, 146.83], wave: 'triangle', pace: 0.72, level: 0.032 },
  3: { notes: [82.41, 123.47, 164.81], wave: 'sawtooth', pace: 0.48, level: 0.028 },
  4: { notes: [65.41, 98, 130.81], wave: 'triangle', pace: 0.8, level: 0.03 },
  5: { notes: [130.81, 164.81, 196, 261.63], wave: 'triangle', pace: 0.42, level: 0.034 },
};

type BrowserAudioContext = AudioContext & { createGain(): GainNode };

export function useHistoricalSoundscape(actNo: number) {
  const [musicEnabled, setMusicEnabled] = useState(false);
  const contextRef = useRef<BrowserAudioContext | undefined>(undefined);
  const musicBusRef = useRef<GainNode | undefined>(undefined);
  const timerRef = useRef<number | undefined>(undefined);
  const actRef = useRef(actNo);
  actRef.current = actNo;

  const ensureContext = useCallback(() => {
    if (!contextRef.current) {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return undefined;
      const context = new AudioContextClass() as BrowserAudioContext;
      const bus = context.createGain();
      bus.gain.value = 0.78;
      bus.connect(context.destination);
      contextRef.current = context;
      musicBusRef.current = bus;
    }
    return contextRef.current;
  }, []);

  const playPhrase = useCallback((targetAct: number) => {
    const context = ensureContext();
    const bus = musicBusRef.current;
    if (!context || !bus) return;
    const voice = actVoicings[targetAct] ?? actVoicings[1];
    const now = context.currentTime + 0.03;
    voice.notes.forEach((frequency, index) => {
      const start = now + index * voice.pace;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      oscillator.type = voice.wave;
      oscillator.frequency.value = frequency;
      filter.type = 'lowpass';
      filter.frequency.value = targetAct === 5 ? 1800 : targetAct >= 2 ? 980 : 520;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(voice.level, start + 0.09);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.72, voice.pace * 1.8));
      oscillator.connect(filter).connect(gain).connect(bus);
      oscillator.start(start);
      oscillator.stop(start + Math.max(0.8, voice.pace * 1.9));
    });
  }, [ensureContext]);

  const stopLoop = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = undefined;
  }, []);

  const toggleMusic = useCallback(async () => {
    const context = ensureContext();
    if (!context) return;
    await context.resume();
    setMusicEnabled((enabled) => {
      const next = !enabled;
      stopLoop();
      if (next) {
        playPhrase(actRef.current);
        timerRef.current = window.setInterval(() => playPhrase(actRef.current), 3600);
      }
      return next;
    });
  }, [ensureContext, playPhrase, stopLoop]);

  const playPanelSlide = useCallback((direction: 'in' | 'out' = 'in') => {
    const context = ensureContext();
    if (!context) return;
    void context.resume();
    const duration = 0.16;
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      const fade = 1 - index / samples.length;
      samples[index] = (Math.random() * 2 - 1) * fade * fade;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(direction === 'in' ? 980 : 720, context.currentTime);
    filter.frequency.exponentialRampToValueAtTime(direction === 'in' ? 420 : 1180, context.currentTime + duration);
    gain.gain.setValueAtTime(0.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(context.destination);
    source.start();
  }, [ensureContext]);

  useEffect(() => {
    if (musicEnabled) playPhrase(actNo);
  }, [actNo, musicEnabled, playPhrase]);

  useEffect(() => () => {
    stopLoop();
    void contextRef.current?.close();
  }, [stopLoop]);

  return {
    musicEnabled,
    soundscapeLabel: soundscapeLabels[actNo] ?? soundscapeLabels[1],
    toggleMusic,
    playPanelSlide,
  };
}
