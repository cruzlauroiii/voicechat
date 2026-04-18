// Kokoro TTS Web Worker — runs TTS generation off the main thread
let tts = null
let ready = false

self.onmessage = async (e) => {
  const { type, text, voice } = e.data

  if (type === 'init') {
    try {
      const { KokoroTTS } = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.1.0/+esm')
      tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'wasm' })
      ready = true
      self.postMessage({ type: 'ready' })
    } catch (e) {
      self.postMessage({ type: 'error', message: e.message })
    }
    return
  }

  if (type === 'generate') {
    if (!ready || !tts) {
      self.postMessage({ type: 'error', message: 'TTS not ready' })
      return
    }
    try {
      const result = await tts.generate(text, { voice })
      // Transfer the audio buffer (zero-copy)
      const audio = new Float32Array(result.audio)
      self.postMessage({ type: 'audio', audio, samplingRate: result.sampling_rate }, [audio.buffer])
    } catch (e) {
      self.postMessage({ type: 'error', message: e.message })
    }
  }
}
