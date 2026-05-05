# pi-voice

Give your Pi agent a voice.

pi-voice is a text-to-speech package for the [Pi coding agent](https://github.com/mariozechner/pi). It runs a local HTTP server powered by [Kokoro ONNX](https://github.com/hexgrad/kokoro) and exposes a `/voice` settings UI, a `tts` tool, and automatic speech on agent responses.

**How it works:** The server loads a single Kokoro ONNX model into memory and exposes a REST API for synthesis. The pi extension talks to this server over HTTP — it never loads the model directly. This separation keeps the agent lightweight while the server handles the heavy ONNX inference.

## Installation

```bash
pi install npm:@s1m0n38/pi-voice
```

The `pi-voice` CLI is available after install. Start the server and download the default model:

```bash
pi-voice server                      # start on 127.0.0.1:8181
pi-voice download q4                 # download + activate the q4 model (~70 MB)
```

## Usage

### `/voice` command

Open the interactive settings UI inside Pi:

<!-- TODO: add screenshot of /voice TUI -->

| Setting | Controls | Keys |
|---------|----------|------|
| TTS | Enable/disable speech | ← → |
| Voice | Speaker voice (with language/gender hints) | ← → |
| Speed | Speech rate (0.5×–3.0×) | ← → |

Navigate with ↑ ↓, press **Enter** to play a sample, **r** to reset defaults, **Esc** to close.

Settings persist in `~/.pi/voice.json` across sessions.

### `tts` tool

The agent can speak at any time using the `tts` tool:

```
> Use the tts tool to say "Build complete, all tests passing"
```

### Auto-TTS

Enable automatic speech after every agent response via the `/voice` settings or by editing `~/.pi/voice.json`:

```json
{
  "enabled": true,
  "voice": "af_heart",
  "speed": 1.0,
  "events": {
    "agent_end": {
      "prompt": "Summarize in one short sentence for text-to-speech."
    }
  }
}
```

When `events.agent_end` is present, pi-voice summarizes the agent's final message using the session model, then speaks it.

## CLI Reference

```bash
pi-voice server                              # start server (default: 127.0.0.1:8181)
pi-voice server --host 0.0.0.0 --port 9090   # custom host/port
pi-voice download q4                         # download + activate model dtype
pi-voice delete q4                           # delete cached model files
pi-voice status                              # show server status and active model
pi-voice voices                              # list available voices
```

### Model dtypes

| Dtype | Size | Quality | Notes |
|-------|------|---------|-------|
| `q4` | ~70 MB | Good | Recommended default |

Only one model is loaded at a time. Downloading or activating a new model automatically unloads the previous one.

## API

The server exposes HTTP endpoints at `http://127.0.0.1:8181`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server status, active dtype, model loaded |
| GET | `/voices` | Available voice names |
| GET | `/models` | All dtypes with download status |
| POST | `/models/download` | Download + activate a dtype |
| POST | `/models/delete` | Delete cached model files |
| POST | `/models/activate` | Load a downloaded model |
| POST | `/models/unload` | Unload model, free memory |
| POST | `/tts` | Synthesize text → WAV audio |
| POST | `/shutdown` | Graceful shutdown |

## Events

pi-voice emits events on the pi event bus (`pi.events`) so other extensions can integrate with TTS activity.

| Event | Payload | When |
|-------|---------|------|
| `voice:config` | `{ enabled, voice, speed }` | Any setting change via `/voice` |
| `voice:speak_start` | `{ text, voice, speed, source }` | Synthesis requested |
| `voice:speak_end` | `{ text, source, error? }` | Playback done or failed |

`source` is `"tool"` (LLM invoked tts), `"auto"` (auto-TTS handler), or `"sample"` (/voice preview).

```typescript
// React to config changes
pi.events.on("voice:config", ({ enabled, voice, speed }) => {
  // update status bar, toggle features, etc.
});

// Track speech activity
pi.events.on("voice:speak_start", ({ text, source }) => {
  if (source === "auto") console.log(`[TTS] ${text}`);
});

pi.events.on("voice:speak_end", ({ error }) => {
  if (error) console.warn(`TTS failed: ${error}`);
});
```

## License

MIT

---

Bootstrapped from [pi-package-template](https://github.com/S1M0N38/pi-package-template).
