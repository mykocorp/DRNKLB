import { useState, useRef, useEffect } from 'react';
import * as Tone from 'tone';
import lamejs from 'lamejs';
import './App.css';

// Unified notes for one octave (C to B, including sharps)
const NOTES = [
  { name: 'C', key: 'a', freq: 261.63 },
  { name: 'C#', key: 'q', freq: 277.18 },
  { name: 'D', key: 's', freq: 293.66 },
  { name: 'D#', key: 'w', freq: 311.13 },
  { name: 'E', key: 'd', freq: 329.63 },
  { name: 'F', key: 'f', freq: 349.23 },
  { name: 'F#', key: 'r', freq: 369.99 },
  { name: 'G', key: 'g', freq: 392.00 },
  { name: 'G#', key: 't', freq: 415.30 },
  { name: 'A', key: 'h', freq: 440.00 },
  { name: 'A#', key: 'y', freq: 466.16 },
  { name: 'B', key: 'j', freq: 493.88 },
];

const WAVE_TYPES = ['sine', 'square', 'triangle', 'sawtooth'];
const NOISE_TYPES = ['white', 'pink', 'brown'];

const BASE_OCTAVE = 4;
const NOTE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NOTE_FREQS = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88];
const KEY_BINDINGS = ['q', 'w', 'e', 'r', 't', 'y', 'u'];
const SEQ_NOTE_NAMES = [...NOTE_NAMES, '-']; // for legacy, but not used in UI

// Drum sequencer state and setup
const DRUMS = [
  { name: 'Kick', url: 'https://tonejs.github.io/audio/drum-samples/CR78/kick.mp3' },
  { name: 'Snare', url: 'https://tonejs.github.io/audio/drum-samples/CR78/snare.mp3' },
  { name: 'Closed HH', url: 'https://tonejs.github.io/audio/drum-samples/CR78/hihat.mp3' },
];

export default function App() {
  const [osc1Type, setOsc1Type] = useState('sine');
  const [osc2Type, setOsc2Type] = useState('sine');
  const [heldNotes, setHeldNotes] = useState([]); // up to 4
  const osc1 = useRef(null);
  const osc2 = useRef(null);
  const gain = useRef(null);

  // Noise FX state (now three independent sliders)
  const [whiteLevel, setWhiteLevel] = useState(0);
  const [pinkLevel, setPinkLevel] = useState(0);
  const [brownLevel, setBrownLevel] = useState(0);
  const whiteNoise = useRef(null);
  const pinkNoise = useRef(null);
  const brownNoise = useRef(null);
  const whiteGain = useRef(null);
  const pinkGain = useRef(null);
  const brownGain = useRef(null);

  // Effects state
  const [reverb, setReverb] = useState(0); // 0-100
  const [delay, setDelay] = useState(0); // 0-100
  const [filter, setFilter] = useState(0); // 0-100
  const [distortion, setDistortion] = useState(0); // 0-100
  const [dub, setDub] = useState(0); // 0-100
  const [stutter, setStutter] = useState(0); // 0-100
  const [stutterRate, setStutterRate] = useState(8); // Hz
  const [pitch, setPitch] = useState(0); // semitones
  const [compressor, setCompressor] = useState(-24); // threshold dB

  // Tone.js effect nodes
  const reverbNode = useRef(null);
  const delayNode = useRef(null);
  const filterNode = useRef(null);
  const distortionNode = useRef(null);
  const dubNode = useRef(null);
  const masterGain = useRef(null);
  const stutterNode = useRef(null);
  const pitchNode = useRef(null);
  const compressorNode = useRef(null);

  // --- Presets ---
  const defaultPreset = {
    osc1Type: 'sine',
    osc2Type: 'sine',
    whiteLevel: 0,
    pinkLevel: 0,
    brownLevel: 0,
    reverb: 0,
    delay: 0,
    filter: 0,
    distortion: 0,
    heldNotes: [],
  };
  const [presets, setPresets] = useState(Array(8).fill().map(() => ({ ...defaultPreset })));
  const [activePreset, setActivePreset] = useState(null);

  // Save current config to preset slot
  const savePreset = (idx) => {
    const newPresets = presets.slice();
    newPresets[idx] = {
      osc1Type,
      osc2Type,
      whiteLevel,
      pinkLevel,
      brownLevel,
      reverb,
      delay,
      filter,
      distortion,
      heldNotes: heldNotes.map(n => ({ ...n })),
    };
    setPresets(newPresets);
    setActivePreset(idx);
  };

  // Load preset config from slot
  const loadPreset = (idx) => {
    const p = presets[idx];
    setOsc1Type(p.osc1Type);
    setOsc2Type(p.osc2Type);
    setWhiteLevel(p.whiteLevel);
    setPinkLevel(p.pinkLevel);
    setBrownLevel(p.brownLevel);
    setReverb(p.reverb);
    setDelay(p.delay);
    setFilter(p.filter);
    setDistortion(p.distortion);
    setHeldNotes(p.heldNotes.map(n => ({ ...n })));
    setActivePreset(idx);
  };

  // Preset button handler
  const handlePresetClick = (idx, e) => {
    if (e.shiftKey) {
      savePreset(idx);
    } else {
      loadPreset(idx);
    }
  };

  // --- Setup audio chain once on mount ---
  useEffect(() => {
    // Create all nodes except always-on oscillators
    gain.current = new Tone.Gain(0.5);
    // Noise
    whiteNoise.current = new Tone.Noise('white');
    pinkNoise.current = new Tone.Noise('pink');
    brownNoise.current = new Tone.Noise('brown');
    whiteGain.current = new Tone.Gain(whiteLevel / 100);
    pinkGain.current = new Tone.Gain(pinkLevel / 100);
    brownGain.current = new Tone.Gain(brownLevel / 100);
    // Effects
    reverbNode.current = new Tone.Reverb({ decay: 2, wet: reverb / 100 });
    delayNode.current = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.4, wet: delay / 100 });
    filterNode.current = new Tone.Filter({ type: 'lowpass', frequency: 800 + (filter / 100) * 7000, Q: 1, rolloff: -24 });
    distortionNode.current = new Tone.Distortion((distortion / 100) * 1.5);
    dubNode.current = new Tone.FeedbackDelay({ delayTime: 0.45, feedback: 0.7, wet: dub / 100 });
    masterGain.current = new Tone.Gain(1).toDestination();
    stutterNode.current = new Tone.Tremolo({ frequency: stutterRate, depth: stutter / 100 }).start();
    pitchNode.current = new Tone.PitchShift({ pitch });
    compressorNode.current = new Tone.Compressor({ threshold: compressor });
    // Connect chain: noises -> noiseGains -> stutter -> distortion -> filter -> delay -> dub -> reverb -> pitch -> compressor -> master
    whiteNoise.current.connect(whiteGain.current);
    pinkNoise.current.connect(pinkGain.current);
    brownNoise.current.connect(brownGain.current);
    gain.current.connect(stutterNode.current);
    whiteGain.current.connect(stutterNode.current);
    pinkGain.current.connect(stutterNode.current);
    brownGain.current.connect(stutterNode.current);
    stutterNode.current.connect(distortionNode.current);
    distortionNode.current.connect(filterNode.current);
    filterNode.current.connect(delayNode.current);
    delayNode.current.connect(dubNode.current);
    dubNode.current.connect(reverbNode.current);
    reverbNode.current.connect(pitchNode.current);
    pitchNode.current.connect(compressorNode.current);
    compressorNode.current.connect(masterGain.current);
    // Don't start noise until needed
    return () => {
      gain.current.dispose();
      whiteNoise.current.dispose();
      pinkNoise.current.dispose();
      brownNoise.current.dispose();
      whiteGain.current.dispose();
      pinkGain.current.dispose();
      brownGain.current.dispose();
      reverbNode.current.dispose();
      delayNode.current.dispose();
      filterNode.current.dispose();
      distortionNode.current.dispose();
      dubNode.current.dispose();
      masterGain.current.dispose();
      stutterNode.current.dispose();
      pitchNode.current.dispose();
      compressorNode.current.dispose();
    };
    // eslint-disable-next-line
  }, []);

  // --- Update oscillator types ---
  useEffect(() => {
    if (osc1.current) osc1.current.type = osc1Type;
  }, [osc1Type]);
  useEffect(() => {
    if (osc2.current) osc2.current.type = osc2Type;
  }, [osc2Type]);

  // --- Update noise levels ---
  useEffect(() => {
    if (whiteGain.current) whiteGain.current.gain.value = whiteLevel / 100;
    if (whiteNoise.current) {
      if (whiteLevel > 0) {
        if (whiteNoise.current.state !== 'started') whiteNoise.current.start();
      } else {
        if (whiteNoise.current.state === 'started') whiteNoise.current.stop();
      }
    }
  }, [whiteLevel]);
  useEffect(() => {
    if (pinkGain.current) pinkGain.current.gain.value = pinkLevel / 100;
    if (pinkNoise.current) {
      if (pinkLevel > 0) {
        if (pinkNoise.current.state !== 'started') pinkNoise.current.start();
      } else {
        if (pinkNoise.current.state === 'started') pinkNoise.current.stop();
      }
    }
  }, [pinkLevel]);
  useEffect(() => {
    if (brownGain.current) brownGain.current.gain.value = brownLevel / 100;
    if (brownNoise.current) {
      if (brownLevel > 0) {
        if (brownNoise.current.state !== 'started') brownNoise.current.start();
      } else {
        if (brownNoise.current.state === 'started') brownNoise.current.stop();
      }
    }
  }, [brownLevel]);

  // --- Update effects params ---
  useEffect(() => {
    if (reverbNode.current) reverbNode.current.wet.value = reverb / 100;
  }, [reverb]);
  useEffect(() => {
    if (delayNode.current) delayNode.current.wet.value = delay / 100;
  }, [delay]);
  useEffect(() => {
    if (filterNode.current) filterNode.current.frequency.value = 800 + (filter / 100) * 7000;
  }, [filter]);
  useEffect(() => {
    if (distortionNode.current) distortionNode.current.distortion = (distortion / 100) * 1.5;
  }, [distortion]);
  useEffect(() => {
    if (dubNode.current) dubNode.current.wet.value = dub / 100;
  }, [dub]);
  useEffect(() => {
    if (stutterNode.current) stutterNode.current.depth.value = stutter / 100;
    if (stutterNode.current) stutterNode.current.frequency.value = stutterRate;
  }, [stutter, stutterRate]);
  useEffect(() => {
    if (pitchNode.current) pitchNode.current.pitch = pitch;
  }, [pitch]);
  useEffect(() => {
    if (compressorNode.current) compressorNode.current.threshold.value = compressor;
  }, [compressor]);

  // Octave state
  const [octave, setOctave] = useState(BASE_OCTAVE);

  // Helper: get freq for note name and octave (handles sharps)
  function getFreq(name, octave) {
    const n = NOTES.find(n => n.name === name);
    if (!n) return 0;
    return n.freq * Math.pow(2, octave - 4);
  }

  // Add state for mix and detune
  const [oscMix, setOscMix] = useState(0.5); // 0 = only osc1, 1 = only osc2
  const [osc1Detune, setOsc1Detune] = useState(0); // in cents
  const [osc2Detune, setOsc2Detune] = useState(0); // in cents

  // Add state for enabling/disabling Osc 2
  const [osc2Enabled, setOsc2Enabled] = useState(true);

  // Play note (add to heldNotes) - always use getFreq for freq
  const playNote = async (name, velocity = 80) => {
    if (heldNotes.length >= 4 || heldNotes.find(n => n.name === name)) return;
    await Tone.start();
    const freq = getFreq(name, octave);
    if (!freq) return; // don't play if note not found
    const vel = velocity / 100;
    // Linear crossfade: osc1 = (1-oscMix), osc2 = oscMix (if enabled)
    const osc1 = new Tone.Oscillator({ type: osc1Type, frequency: freq, detune: osc1Detune }).start();
    let osc2, osc2Gain;
    const osc1Gain = new Tone.Gain((1 - (osc2Enabled ? oscMix : 0)) * vel);
    osc1.connect(osc1Gain);
    if (osc2Enabled) {
      osc2 = new Tone.Oscillator({ type: osc2Type, frequency: freq, detune: osc2Detune }).start();
      osc2Gain = new Tone.Gain(oscMix * vel);
      osc2.connect(osc2Gain);
    }
    // Mix both into a single gain node for effects chain
    const noteGain = new Tone.Gain(1);
    osc1Gain.connect(noteGain);
    if (osc2Enabled && osc2Gain) osc2Gain.connect(noteGain);
    noteGain.connect(stutterNode.current);
    setHeldNotes(notes => [...notes, { name, freq, osc1, osc2, osc1Gain, osc2Gain, gain: noteGain }]);
  };

  // Stop note (remove from heldNotes)
  const stopNote = (name) => {
    setHeldNotes(notes => {
      const n = notes.find(n => n.name === name);
      if (n) {
        n.osc1.stop(); n.osc1.dispose();
        if (n.osc2) { n.osc2.stop(); n.osc2.dispose(); }
        if (n.osc1Gain) { n.osc1Gain.disconnect(); n.osc1Gain.dispose(); }
        if (n.osc2Gain) { n.osc2Gain.disconnect(); n.osc2Gain.dispose(); }
        n.gain.disconnect(); n.gain.dispose();
      }
      return notes.filter(n => n.name !== name);
    });
  };

  // Toggle note (for button click)
  const handleNoteClick = (name) => {
    if (heldNotes.find(n => n.name === name)) {
      stopNote(name);
    } else {
      playNote(name);
      recordStepIfWrite(name);
    }
  };

  // HCF: stop all notes
  const handleHCF = () => {
    heldNotes.forEach(n => stopNote(n.name));
    setWhiteLevel(0); setPinkLevel(0); setBrownLevel(0);
    if (osc1.current) { try { osc1.current.stop(); osc1.current.dispose(); } catch {} }
    if (osc2.current) { try { osc2.current.stop(); osc2.current.dispose(); } catch {} }
    if (whiteNoise.current) { try { whiteNoise.current.stop(); } catch {} }
    if (pinkNoise.current) { try { pinkNoise.current.stop(); } catch {} }
    if (brownNoise.current) { try { brownNoise.current.stop(); } catch {} }
  };

  // Add Restart Audio button handler
  const handleRestartAudio = () => {
    if (masterGain.current) masterGain.current.gain.value = 1;
  };

  // Keyboard events for new mapping
  useEffect(() => {
    const down = new Set();
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      const note = NOTES.find(n => n.key === key);
      if (note && !down.has(key)) {
        down.add(key);
        playNote(note.name);
        recordStepIfWrite(note.name);
      }
      if ((key === '+' || key === '=') && octave < 7) setOctave(oct => oct + 1);
      if ((key === '-' || key === '_') && octave > 1) setOctave(oct => oct - 1);
    };
    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      const note = NOTES.find(n => n.key === key);
      if (note) {
        down.delete(key);
        stopNote(note.name);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [octave, osc1Type, osc2Type, heldNotes, osc2Enabled]);

  // Update oscillators on osc1Type/osc2Type change
  useEffect(() => {
    heldNotes.forEach(n => { n.osc1.type = osc1Type; n.osc2.type = osc2Type; });
  }, [osc1Type, osc2Type, heldNotes]);

  // Update held note gains when oscMix or velocity changes
  useEffect(() => {
    heldNotes.forEach(n => {
      if (n.osc1Gain) n.osc1Gain.gain.value = (1 - oscMix) * (n.gain.gain.value);
      if (n.osc2Gain) n.osc2Gain.gain.value = oscMix * (n.gain.gain.value);
    });
  }, [oscMix, heldNotes]);

  // --- MP3 Recording ---
  const [recording, setRecording] = useState(false);
  const [wavUrl, setWavUrl] = useState(null);
  const [encoding, setEncoding] = useState(false);
  const [recordError, setRecordError] = useState(null);
  const mediaRecorder = useRef(null);
  const recordedChunks = useRef([]);
  const audioDest = useRef(null);

  // Setup MediaStreamDestination and connect to masterGain
  useEffect(() => {
    if (!audioDest.current && masterGain.current) {
      audioDest.current = Tone.context.createMediaStreamDestination();
      masterGain.current.connect(audioDest.current);
    }
    // Cleanup
    return () => {
      if (audioDest.current) audioDest.current = null;
    };
  }, [masterGain.current]);

  // Start/stop recording
  const handleRecord = () => {
    if (!recording) {
      setWavUrl(null);
      setRecordError(null);
      recordedChunks.current = [];
      if (!audioDest.current) return;
      mediaRecorder.current = new MediaRecorder(audioDest.current.stream);
      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.current.push(e.data);
      };
      mediaRecorder.current.onstop = async () => {
        setEncoding(true);
        try {
          const rawBlob = new Blob(recordedChunks.current, { type: 'audio/webm' });
          // Decode to PCM
          const audioBuffer = await new Response(rawBlob).arrayBuffer();
          const context = new AudioContext();
          let decoded;
          try {
            decoded = await context.decodeAudioData(audioBuffer);
          } catch (err) {
            setRecordError('Could not decode audio for WAV encoding. Download raw file below.');
            setEncoding(false);
            return;
          }
          try {
            const wav = encodeWav(decoded);
            const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
            setWavUrl(url);
          } catch (err) {
            setRecordError('WAV encoding failed.');
          }
        } catch (err) {
          setRecordError('Recording failed.');
        }
        setEncoding(false);
      };
      mediaRecorder.current.start();
      setRecording(true);
    } else {
      if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
        mediaRecorder.current.stop();
      }
      setRecording(false);
    }
  };

  // PCM to WAV encoding (stereo support)
  function encodeWav(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const length = audioBuffer.length * numChannels;
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);

    function writeString(view, offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bitDepth / 8, true);
    view.setUint16(32, numChannels * bitDepth / 8, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, length * 2, true);
    // PCM samples (interleaved for stereo)
    let offset = 44;
    if (numChannels === 2) {
      const left = audioBuffer.getChannelData(0);
      const right = audioBuffer.getChannelData(1);
      for (let i = 0; i < audioBuffer.length; i++, offset += 4) {
        let l = Math.max(-1, Math.min(1, left[i]));
        let r = Math.max(-1, Math.min(1, right[i]));
        view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7FFF, true);
        view.setInt16(offset + 2, r < 0 ? r * 0x8000 : r * 0x7FFF, true);
      }
    } else {
      const samples = audioBuffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }
    }
    return buffer;
  }

  // --- Randomizer ---
  function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  const handleRandomize = () => {
    setOsc1Type(randomChoice(WAVE_TYPES));
    if (osc2Enabled) setOsc2Type(randomChoice(WAVE_TYPES));
    setWhiteLevel(randomInt(0, 100));
    setPinkLevel(randomInt(0, 100));
    setBrownLevel(randomInt(0, 100));
    setReverb(randomInt(0, 100));
    setDelay(randomInt(0, 100));
    setFilter(randomInt(0, 100));
    setDistortion(randomInt(0, 100));
    setStutter(randomInt(0, 100));
    setStutterRate(randomInt(1, 32));
    setPitch(randomInt(-12, 12));
    setCompressor(randomInt(-60, 0));
    // Optionally trigger a random note
    const note = randomChoice(NOTES);
    playNote(note.name);
  };

  // Redesign sequencer state: store per-step data (null if empty, or {state})
  const [sequencer, setSequencer] = useState(Array(8).fill(null));
  const [seqPlaying, setSeqPlaying] = useState(false);
  const [seqStep, setSeqStep] = useState(0);
  const [seqTempo, setSeqTempo] = useState(120);
  const [seqWrite, setSeqWrite] = useState(false);
  const [seqSelectedStep, setSeqSelectedStep] = useState(null);
  const seqIntervalRef = useRef(null);

  // When [Write] is active and a step is selected, record all actions into that step
  const recordStep = (idx, state) => {
    setSequencer(seq => seq.map((step, i) => i === idx ? { ...state } : step));
  };

  // When [Write] is on, clicking a step selects it for recording
  const handleSeqStepClick = idx => {
    if (seqWrite) setSeqSelectedStep(idx);
  };

  // When synth state changes and [Write] is on and a step is selected, record it
  useEffect(() => {
    if (seqWrite && seqSelectedStep !== null) {
      // Only record if a valid note is held
      const held = heldNotes[0];
      const valid = held && NOTES.some(n => n.name === held.name);
      if (valid) {
        recordStep(seqSelectedStep, {
          osc1Type,
          osc2Type,
          whiteLevel,
          pinkLevel,
          brownLevel,
          reverb,
          delay,
          filter,
          distortion,
          dub,
          stutter,
          stutterRate,
          pitch,
          compressor,
          note: held.name,
          velocity: held.gain.gain.value * 100,
          octave,
        });
      } else {
        // Save as rest (null)
        recordStep(seqSelectedStep, null);
      }
    }
    // eslint-disable-next-line
  }, [osc1Type, osc2Type, whiteLevel, pinkLevel, brownLevel, reverb, delay, filter, distortion, dub, stutter, stutterRate, pitch, compressor, heldNotes, octave]);

  // Sequencer playback: play back recorded state for each step
  const handleSeqPlay = () => {
    if (seqPlaying) {
      setSeqPlaying(false);
      clearInterval(seqIntervalRef.current);
      setSeqStep(0);
    } else {
      setSeqPlaying(true);
      let step = 0;
      seqIntervalRef.current = setInterval(() => {
        setSeqStep(s => {
          const next = (s + 1) % 8;
          return next;
        });
        const stepData = sequencer[step];
        // Only play if stepData exists and is a valid note
        if (stepData && stepData.note && NOTES.some(n => n.name === stepData.note)) {
          setOsc1Type(stepData.osc1Type);
          setOsc2Type(stepData.osc2Type);
          setWhiteLevel(stepData.whiteLevel);
          setPinkLevel(stepData.pinkLevel);
          setBrownLevel(stepData.brownLevel);
          setReverb(stepData.reverb);
          setDelay(stepData.delay);
          setFilter(stepData.filter);
          setDistortion(stepData.distortion);
          setDub(stepData.dub);
          setStutter(stepData.stutter);
          setStutterRate(stepData.stutterRate);
          setPitch(stepData.pitch);
          setCompressor(stepData.compressor);
          setOctave(stepData.octave);
          playNote(stepData.note, stepData.velocity);
        }
        step = (step + 1) % 8;
      }, (60 / seqTempo) * 1000);
    }
  };

  useEffect(() => {
    return () => { clearInterval(seqIntervalRef.current); };
  }, []);

  // UI: note buttons (remove '-')
  const noteButtons = NOTE_NAMES.map((name, idx) => (
    <button
      key={name}
      className={heldNotes.find(n => n.name === name) ? 'active' : ''}
      onClick={() => handleNoteClick(name)}
    >
      {name}
      <span style={{ fontSize: '0.7em', color: '#888', marginLeft: 4 }}>{KEY_BINDINGS[idx]}</span>
    </button>
  ));

  // Visualizer
  const visualizerRef = useRef(null);
  const analyserRef = useRef(null);
  useEffect(() => {
    if (!analyserRef.current) {
      analyserRef.current = Tone.context.createAnalyser();
    }
    if (masterGain.current && analyserRef.current) {
      try { masterGain.current.connect(analyserRef.current); } catch {}
    }
    let raf;
    function draw() {
      const canvas = visualizerRef.current;
      if (!canvas || !analyserRef.current) return;
      const ctx = canvas.getContext('2d');
      const bufferLength = analyserRef.current.fftSize;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current.getByteTimeDomainData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#e0e0e0';
      ctx.beginPath();
      for (let i = 0; i < bufferLength; i++) {
        const x = (i / bufferLength) * canvas.width;
        const y = (dataArray[i] / 255) * canvas.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [masterGain.current]);

  // In the UI, show black and white keys using unified NOTES array
  const WHITE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const BLACK_NAMES = ['C#', 'D#', 'F#', 'G#', 'A#'];
  const whiteNotes = NOTES.filter(n => WHITE_NAMES.includes(n.name));
  const blackNotes = NOTES.filter(n => BLACK_NAMES.includes(n.name));

  // Fix sequencer recording: record note when played in [Write] mode and a step is selected
  const recordStepIfWrite = (noteName) => {
    if (seqWrite && seqSelectedStep !== null && NOTES.some(n => n.name === noteName)) {
      recordStep(seqSelectedStep, {
        osc1Type,
        osc2Type,
        whiteLevel,
        pinkLevel,
        brownLevel,
        reverb,
        delay,
        filter,
        distortion,
        dub,
        stutter,
        stutterRate,
        pitch,
        compressor,
        note: noteName,
        velocity: 80, // default velocity for click/keyboard
        octave,
      });
    }
  };

  // Drum sequencer state (move inside App)
  const [drumSteps, setDrumSteps] = useState(
    () => Array(DRUMS.length).fill().map(() => Array(8).fill(false))
  );
  const [drumPlaying, setDrumPlaying] = useState(false);
  const [drumStep, setDrumStep] = useState(0);
  const [drumTempo, setDrumTempo] = useState(120);
  const drumIntervalRef = useRef(null);
  const drumPlayersRef = useRef(null);

  // Add drum volume state
  const [drumVolume, setDrumVolume] = useState(0.8); // 0.0 to 1.0

  // Add state for drums through FX
  const [drumsThroughFX, setDrumsThroughFX] = useState(false);

  // Setup drum players on mount and when FX routing changes
  useEffect(() => {
    drumPlayersRef.current = {};
    DRUMS.forEach(d => {
      const player = new Tone.Player(d.url);
      // Connect based on toggle
      if (drumsThroughFX && stutterNode.current) {
        player.connect(stutterNode.current);
      } else if (masterGain.current) {
        player.connect(masterGain.current);
      } else {
        player.toDestination(); // fallback if masterGain/master FX not ready
      }
      player.volume.value = 20 * Math.log10(drumVolume || 0.0001); // convert linear to dB
      drumPlayersRef.current[d.name] = player;
    });
    return () => {
      Object.values(drumPlayersRef.current).forEach(p => p.dispose());
    };
  // eslint-disable-next-line
  }, [drumsThroughFX, stutterNode.current, masterGain.current]);

  // Update drum player volumes when drumVolume changes
  useEffect(() => {
    if (drumPlayersRef.current) {
      Object.values(drumPlayersRef.current).forEach(player => {
        if (player && player.volume) player.volume.value = 20 * Math.log10(drumVolume || 0.0001);
      });
    }
  }, [drumVolume]);

  const handleDrumToggle = (row, col) => {
    setDrumSteps(steps => steps.map((r, i) => i === row ? r.map((v, j) => j === col ? !v : v) : r));
  };

  // Add a ref to always have the latest drumSteps
  const drumStepsRef = useRef(drumSteps);
  useEffect(() => { drumStepsRef.current = drumSteps; }, [drumSteps]);

  const handleDrumPlay = () => {
    if (drumPlaying) {
      setDrumPlaying(false);
      clearInterval(drumIntervalRef.current);
      setDrumStep(0);
    } else {
      setDrumPlaying(true);
      let step = 0;
      drumIntervalRef.current = setInterval(() => {
        DRUMS.forEach((d, i) => {
          if (drumStepsRef.current[i][step]) {
            drumPlayersRef.current[d.name]?.start();
          }
        });
        setDrumStep(step); // set visual to match audio
        step = (step + 1) % 8;
      }, (60 / drumTempo) * 1000);
    }
  };

  useEffect(() => {
    return () => { clearInterval(drumIntervalRef.current); };
  }, []);

  return (
    <div className="synth-app" style={{ maxWidth: 1700, margin: '0 auto', display: 'flex', flexDirection: 'row', gap: 32 }}>
      <div style={{ flex: 1.2, minWidth: 0 }}>
        <header className="synth-header">
          <h1 style={{ fontSize: '2.2rem', margin: 0 }}>DRNKLB</h1>
          <div style={{ fontSize: '1.1rem', color: '#b0b0b0', marginTop: 4 }}>Abstract Musical Instrument</div>
        </header>
        <canvas ref={visualizerRef} width={600} height={80} style={{ display: 'block', margin: '1.5em auto 1em auto', background: '#111', border: '1.5px solid #e0e0e0' }} />
        <main className="synth-main">
          <section className="oscillators">
            <h2>Oscillators</h2>
            <div className="osc-row" style={{ display: 'flex', gap: 32, alignItems: 'flex-end', justifyContent: 'center' }}>
              <div className="osc-panel" style={{ minWidth: 160 }}>
                <div>Osc 1</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {WAVE_TYPES.map(w => (
                    <button
                      key={w}
                      className={osc1Type === w ? 'active' : ''}
                      style={{ fontSize: '0.9em', padding: '0.3em 0.7em', minWidth: 0 }}
                      onClick={() => setOsc1Type(w)}
                    >{w}</button>
                  ))}
                </div>
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: '0.9em', color: '#aaa' }}>Detune
                    <input type="range" min={-100} max={100} value={osc1Detune} onChange={e => setOsc1Detune(Number(e.target.value))} style={{ width: 80, marginLeft: 8 }} />
                    <span style={{ minWidth: 30, display: 'inline-block' }}>{osc1Detune}¢</span>
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 120 }}>
                <label style={{ fontWeight: 'bold', color: '#e0e0e0', marginBottom: 4 }}>Mix</label>
                <input type="range" min={0} max={1} step={0.01} value={oscMix} onChange={e => setOscMix(Number(e.target.value))} style={{ width: 120 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', width: 120, fontSize: '0.9em', color: '#aaa' }}>
                  <span>Osc 1</span>
                  <span>Osc 2</span>
                </div>
                <label style={{ marginTop: 16, color: '#e0e0e0', fontWeight: 'bold' }}>
                  <input type="checkbox" checked={osc2Enabled} onChange={e => setOsc2Enabled(e.target.checked)} style={{ marginRight: 8 }} />
                  Enable Osc 2
                </label>
              </div>
              <div className="osc-panel" style={{ minWidth: 160, opacity: osc2Enabled ? 1 : 0.4 }}>
                <div>Osc 2</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {WAVE_TYPES.map(w => (
                    <button
                      key={w}
                      className={osc2Type === w ? 'active' : ''}
                      style={{ fontSize: '0.9em', padding: '0.3em 0.7em', minWidth: 0 }}
                      onClick={() => setOsc2Type(w)}
                      disabled={!osc2Enabled}
                    >{w}</button>
                  ))}
                </div>
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: '0.9em', color: '#aaa' }}>Detune
                    <input type="range" min={-100} max={100} value={osc2Detune} onChange={e => setOsc2Detune(Number(e.target.value))} style={{ width: 80, marginLeft: 8 }} disabled={!osc2Enabled} />
                    <span style={{ minWidth: 30, display: 'inline-block' }}>{osc2Detune}¢</span>
                  </label>
                </div>
              </div>
            </div>
          </section>
          <section className="notes">
            <h2>Notes</h2>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1em', marginBottom: 8 }}>
              <button onClick={() => setOctave(o => Math.max(1, o - 1))} disabled={octave <= 1}>-</button>
              <span style={{ fontWeight: 'bold', fontSize: '1.1em' }}>Octave: {octave}</span>
              <button onClick={() => setOctave(o => Math.min(7, o + 1))} disabled={octave >= 7}>+</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                {blackNotes.map((k, idx) => (
                  <button key={k.name} style={{ background: '#222', color: '#fff', border: '2px solid #444', borderRadius: 4, fontSize: '1em', padding: '0.4em 0.7em', margin: '0 2px', minWidth: 0 }} onClick={() => handleNoteClick(k.name)}>{k.name}<span style={{ fontSize: '0.7em', color: '#aaa', marginLeft: 4 }}>{k.key}</span></button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {whiteNotes.map((k, idx) => (
                  <button key={k.name} style={{ background: heldNotes.find(n => n.name === k.name) ? '#e0e0e0' : '#111', color: heldNotes.find(n => n.name === k.name) ? '#181818' : '#e0e0e0', border: '2px solid #e0e0e0', borderRadius: 4, fontSize: '1.2em', padding: '0.7em 1.2em', minWidth: 0 }} onClick={() => handleNoteClick(k.name)}>{k.name}<span style={{ fontSize: '0.7em', color: '#888', marginLeft: 4 }}>{k.key}</span></button>
              ))}
              </div>
            </div>
          </section>
          <section className="sequencer" style={{ margin: '2em 0', padding: '1em', border: '2px solid #444', borderRadius: 8, background: '#181818', textAlign: 'center' }}>
            <div style={{ marginBottom: 8, fontWeight: 'bold', color: '#e0e0e0' }}>Step Sequencer <span style={{ fontWeight: 'normal', color: '#888', fontSize: '0.9em' }}>[Write] to record actions into steps</span></div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 8 }}>
              {sequencer.map((step, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSeqStepClick(idx)}
                  style={{
                    background: seqStep === idx && seqPlaying ? '#e0e0e0' : seqSelectedStep === idx && seqWrite ? '#e00' : step ? '#333' : '#111',
                    color: seqStep === idx && seqPlaying ? '#181818' : '#e0e0e0',
                    border: step ? '2px solid #e00' : '2px solid #e0e0e0',
                    borderRadius: 4,
                    padding: '0.7em 1.1em',
                    fontWeight: step ? 'bold' : 'normal',
                    position: 'relative',
                  }}
                  title={step ? 'Step has recorded data' : 'Empty step'}
                >
                  {idx + 1}{step ? '*' : ''}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <button onClick={() => setSeqWrite(w => !w)} style={{ background: seqWrite ? '#e00' : '#111', color: seqWrite ? '#fff' : '#e0e0e0', fontWeight: 'bold', fontSize: '1.1em', padding: '0.5em 1.2em', borderRadius: 4, border: '2px solid #e0e0e0' }}>{seqWrite ? 'Stop Write' : 'Write'}</button>
              <button onClick={handleSeqPlay} style={{ background: seqPlaying ? '#e00' : '#111', color: seqPlaying ? '#fff' : '#e0e0e0', fontWeight: 'bold', fontSize: '1.1em', padding: '0.5em 1.2em', borderRadius: 4, border: '2px solid #e0e0e0' }}>{seqPlaying ? 'Stop' : 'Play'}</button>
              <label style={{ color: '#b0b0b0' }}>Tempo
                <input type="range" min={60} max={200} value={seqTempo} onChange={e => setSeqTempo(Number(e.target.value))} style={{ width: 100, marginLeft: 8 }} />
                <span style={{ minWidth: 30, display: 'inline-block' }}>{seqTempo} BPM</span>
              </label>
            </div>
          </section>
          <section className="noise-fx">
            <h2>Noise FX</h2>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1em' }}>
              <label>White
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={whiteLevel}
                  onChange={e => setWhiteLevel(Number(e.target.value))}
                />
                <span style={{ minWidth: 30, display: 'inline-block' }}>{whiteLevel}</span>
              </label>
              <label>Pink
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={pinkLevel}
                  onChange={e => setPinkLevel(Number(e.target.value))}
                />
                <span style={{ minWidth: 30, display: 'inline-block' }}>{pinkLevel}</span>
              </label>
              <label>Brown
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={brownLevel}
                  onChange={e => setBrownLevel(Number(e.target.value))}
                />
                <span style={{ minWidth: 30, display: 'inline-block' }}>{brownLevel}</span>
              </label>
            </div>
          </section>
          <section className="effects">
            <h2>Effects</h2>
            <div className="fx-row" style={{ flexDirection: 'column', gap: '0.7em', alignItems: 'flex-start' }}>
              <div>
                <label>Stutter</label>
                <input type="range" min={0} max={100} value={stutter} onChange={e => setStutter(Number(e.target.value))} />
                <span style={{ minWidth: 30, display: 'inline-block' }}>{stutter}</span>
                <span style={{ marginLeft: 8 }}>Rate</span>
                <input type="range" min={1} max={32} value={stutterRate} onChange={e => setStutterRate(Number(e.target.value))} style={{ width: 80 }} />
                <span style={{ minWidth: 30, display: 'inline-block' }}>{stutterRate}Hz</span>
              </div>
              <div>
                <label>PitchShift</label>
                <input type="range" min={-12} max={12} value={pitch} onChange={e => setPitch(Number(e.target.value))} />
                <span style={{ minWidth: 30, display: 'inline-block' }}>{pitch}st</span>
              </div>
              <div>
                <label>Compressor</label>
                <input type="range" min={-60} max={0} value={compressor} onChange={e => setCompressor(Number(e.target.value))} />
                <span style={{ minWidth: 40, display: 'inline-block' }}>{compressor}dB</span>
              </div>
              <div>
                <label>Reverb</label>
                <input type="range" min={0} max={100} value={reverb} onChange={e => setReverb(Number(e.target.value))} />
                <span style={{ minWidth: 30, display: 'inline-block' }}>{reverb}</span>
              </div>
              <div>
                <label>Delay</label>
                <input type="range" min={0} max={100} value={delay} onChange={e => setDelay(Number(e.target.value))} />
                <span style={{ minWidth: 30, display: 'inline-block' }}>{delay}</span>
              </div>
              <div>
                <label>Dub</label>
                <input type="range" min={0} max={100} value={dub} onChange={e => setDub(Number(e.target.value))} />
                <span style={{ minWidth: 30, display: 'inline-block' }}>{dub}</span>
              </div>
              <div>
                <label>Filter</label>
                <input type="range" min={0} max={100} value={filter} onChange={e => setFilter(Number(e.target.value))} />
                <span style={{ minWidth: 30, display: 'inline-block' }}>{filter}</span>
              </div>
      <div>
                <label>Distortion</label>
                <input type="range" min={0} max={100} value={distortion} onChange={e => setDistortion(Number(e.target.value))} />
                <span style={{ minWidth: 30, display: 'inline-block' }}>{distortion}</span>
              </div>
            </div>
          </section>
          <section className="presets">
            <h2>Presets</h2>
            <div className="preset-slots">
              {presets.map((p, idx) => (
                <button
                  key={idx}
                  className={activePreset === idx ? 'active' : ''}
                  title={activePreset === idx ? 'Active preset' : 'Click to load, Shift+Click to save'}
                  onClick={e => handlePresetClick(idx, e)}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </section>
          <section className="controls">
            <button onClick={handleRecord} style={{ background: recording ? '#e00' : undefined, color: recording ? '#fff' : undefined }}>
              {recording ? '■ Stop REC' : '[📼 REC WAV]'}
            </button>
            {encoding && <span style={{ marginLeft: '1em', color: '#b0b0b0' }}>Encoding...</span>}
            {wavUrl && (
              <a href={wavUrl} download="synth-recording.wav" style={{ marginLeft: '1em' }}>
                Download WAV
              </a>
            )}
            {recordError && <div style={{ color: '#e00', marginTop: '0.5em' }}>{recordError}</div>}
            <button onClick={handleRandomize}>[🎲 Randomize]</button>
            <button onClick={handleHCF} style={{ background: '#222', color: '#e00', borderColor: '#e00' }}>[💥 HCF]</button>
            <button onClick={handleRestartAudio} style={{ marginLeft: '1em' }}>[🔊 Restart Audio]</button>
          </section>
        </main>
      </div>
      <div style={{ flex: 1.8, minWidth: 700, maxWidth: 900, background: '#181818', border: '2px solid #444', borderRadius: 8, padding: 24, marginTop: 24, height: 'fit-content', boxSizing: 'border-box' }}>
        <h2 style={{ color: '#e0e0e0', textAlign: 'center', marginBottom: 16 }}>Drum Sequencer</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {DRUMS.map((d, row) => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
              <span style={{ width: 90, color: '#b0b0b0', fontWeight: 'bold', flexShrink: 0 }}>{d.name}</span>
              {drumSteps[row].map((on, col) => (
                <button
                  key={col}
                  onClick={() => handleDrumToggle(row, col)}
                  style={{
                    width: 36, height: 36, margin: 2, borderRadius: 6,
                    background: drumStep === col && drumPlaying ? '#e0e0e0' : on ? '#e00' : '#222',
                    color: drumStep === col && drumPlaying ? '#181818' : '#fff',
                    border: '2px solid #888', fontWeight: 'bold', fontSize: '1em', cursor: 'pointer',
                    transition: 'background 0.2s, color 0.2s',
                  }}
                ></button>
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 18, flexWrap: 'wrap' }}>
          <button onClick={handleDrumPlay} style={{ background: drumPlaying ? '#e00' : '#111', color: drumPlaying ? '#fff' : '#e0e0e0', fontWeight: 'bold', fontSize: '1.1em', padding: '0.5em 1.2em', borderRadius: 4, border: '2px solid #e0e0e0' }}>{drumPlaying ? 'Stop' : 'Play'}</button>
          <label style={{ color: '#b0b0b0' }}>Tempo
            <input type="range" min={60} max={400} value={drumTempo} onChange={e => setDrumTempo(Number(e.target.value))} style={{ width: 120, marginLeft: 8 }} />
            <span style={{ minWidth: 30, display: 'inline-block' }}>{drumTempo} BPM</span>
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 18 }}>
          <label style={{ color: '#b0b0b0', fontWeight: 'bold' }}>Drum Volume
            <input type="range" min={0} max={1} step={0.01} value={drumVolume} onChange={e => setDrumVolume(Number(e.target.value))} style={{ width: 120, marginLeft: 8 }} />
            <span style={{ minWidth: 30, display: 'inline-block' }}>{Math.round(drumVolume * 100)}</span>
          </label>
          <button onClick={() => setDrumSteps(Array(DRUMS.length).fill().map(() => Array(8).fill(false)))} style={{ marginLeft: 24, background: '#222', color: '#e0e0e0', border: '2px solid #e0e0e0', borderRadius: 4, padding: '0.5em 1.2em', fontWeight: 'bold' }}>[Clear]</button>
          <label style={{ marginLeft: 24, color: '#b0b0b0', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={drumsThroughFX} onChange={e => setDrumsThroughFX(e.target.checked)} />
            Drums through FX
          </label>
        </div>
      </div>
    </div>
  );
}
