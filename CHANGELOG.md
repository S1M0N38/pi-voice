# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.1](https://github.com/S1M0N38/pi-voice/compare/v2.0.0...v2.0.1) (2026-05-07)


### Bug Fixes

* move model cache to ~/.pi/voice/cache/ ([2ed7462](https://github.com/S1M0N38/pi-voice/commit/2ed74626d4f7904e67e58f0b469a29335d3c1715))

## [2.0.0](https://github.com/S1M0N38/pi-voice/compare/v1.2.0...v2.0.0) (2026-05-06)


### ⚠ BREAKING CHANGES

* Config moved from ~/.pi/voice.json to ~/.pi/voice/config.json. The summaryModel field is removed; use per-event model in events config instead. EventConfig now accepts { prompt, model? } or { text } (mutually exclusive).

### Features

* overhaul event config and migrate state to ~/.pi/voice/ ([3242af6](https://github.com/S1M0N38/pi-voice/commit/3242af6f51d5ed3f50467777f6be9d09bfca7630))

## [1.2.0](https://github.com/S1M0N38/pi-voice/compare/v1.1.0...v1.2.0) (2026-05-05)


### Features

* serialize audio playback to prevent overlapping speech ([946f533](https://github.com/S1M0N38/pi-voice/commit/946f53364ec243a54c671193e781e46911e62dbd))
* **server:** add FIFO queue to serialize /tts requests ([82caeb8](https://github.com/S1M0N38/pi-voice/commit/82caeb8bf53e5a4063e933735250a1d750f8dc21))


### Bug Fixes

* preserve user events config and persist reset to defaults ([d4e4ad1](https://github.com/S1M0N38/pi-voice/commit/d4e4ad11de3b029e536b972ce9d728c477b9c6f0))
* resolve biome lint errors blocking CI ([0d764c0](https://github.com/S1M0N38/pi-voice/commit/0d764c018305cccdcfe6be9a3f42cba7e66345e9))
* **test:** use real default summary prompt in queue test config ([4ad65d4](https://github.com/S1M0N38/pi-voice/commit/4ad65d4bc71eebffc974eb22c75c05ab4111102e))

## [1.1.0](https://github.com/S1M0N38/pi-voice/compare/v1.0.1...v1.1.0) (2026-05-05)


### Features

* add event bus and status bar indicator ([dd8aeeb](https://github.com/S1M0N38/pi-voice/commit/dd8aeeb9327d6ef33c517b63ea0d9539176fe16f))

## [1.0.1](https://github.com/S1M0N38/pi-voice/compare/v1.0.0...v1.0.1) (2026-05-05)


### Bug Fixes

* **ci:** resolve platform-specific deps by regenerating lockfile on runner ([1d9fb93](https://github.com/S1M0N38/pi-voice/commit/1d9fb93547335f9c9acdb05d151544e92651debe))
* set repository.url for npm provenance verification ([bf2c1f7](https://github.com/S1M0N38/pi-voice/commit/bf2c1f7a69ab4c80a912ba259724bebb8c0ae519))


## 1.0.0 (2026-05-05)


### ⚠ BREAKING CHANGES

* rename template placeholders to pi-voice

### Features

* add Kokoro TTS HTTP server ([68302fa](https://github.com/S1M0N38/pi-voice/commit/68302fa1a4926a25dad79f8af0d8d5e6b5f79071))
* add pi extension with tts tool and /voice command ([bd17b81](https://github.com/S1M0N38/pi-voice/commit/bd17b81abe7465bd12893d1c2f77269dde647ced))
* add prepare script for default config on install ([d2c7415](https://github.com/S1M0N38/pi-voice/commit/d2c7415ebec1dec445ba95e3347a64c078805dd3))
* custom TUI, auto-TTS events, and async speak ([69c6c05](https://github.com/S1M0N38/pi-voice/commit/69c6c05263b1aa1703461c5c29e920013788d4eb))


### Bug Fixes

* **voice:** use pi-voice CLI syntax in server hints ([93cbdad](https://github.com/S1M0N38/pi-voice/commit/93cbdadd44f14788af099f018759370a260a4311))


### Code Refactoring

* rename template placeholders to pi-voice ([8398cf8](https://github.com/S1M0N38/pi-voice/commit/8398cf813f2b757ed3e87cfdd38a91c5edd898a6))
