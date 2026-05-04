#!/usr/bin/env node

/**
 * pi-voice prepare script
 *
 * This script runs automatically when pi-voice is installed (npm install).
 * It sets up default configuration if it doesn't already exist.
 *
 * Default: agent_end event with last_message context, using the active
 * session model for speech text generation (no summaryModel configured).
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const CONFIG_DIR = resolve(homedir(), ".pi");
const CONFIG_FILE = resolve(CONFIG_DIR, "voice.json");

const DEFAULT_SUMMARY_PROMPT =
  "You are preparing text for a text-to-speech system. " +
  "You will receive a message from a conversation enclosed in quadruple backticks. " +
  "Summarize it in one single very short sentence, two at most. " +
  "Use a dry, matter-of-fact tone. " +
  "Do not use any markdown formatting, just plain text. " +
  "Prefer words over symbols or abbreviations, as this will be read aloud. " +
  "Output only the sentence, nothing else.";

const DEFAULT_CONFIG = {
  enabled: true,
  voice: "af_heart",
  speed: 1.0,
  host: "127.0.0.1",
  port: 8181,
  events: {
    agent_end: {
      prompt: DEFAULT_SUMMARY_PROMPT,
    },
  },
};

function setupDefaultConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      console.log("pi-voice: Configuration file already exists at", CONFIG_FILE);
      return;
    }

    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }

    console.log("pi-voice: Writing default configuration to", CONFIG_FILE);
    writeFileSync(CONFIG_FILE, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
    console.log("pi-voice: Default configuration setup complete!");
    console.log("pi-voice: Edit", CONFIG_FILE, "to customize voice, speed, and events.");
  } catch (error) {
    console.error("pi-voice: Error setting up default configuration:", error.message);
    process.exit(1);
  }
}

setupDefaultConfig();
