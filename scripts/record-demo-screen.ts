// Direct screen capture demo recording via ffmpeg avfoundation.
//
// Per Decision 0035, this is the "live voiceover" mode — record the
// Mac screen + microphone while you walk through the demo manually.
// Faster than the Playwright scripted version if you want real-time
// commentary, but harder to keep under 5 minutes.
//
// Run:
//   npx tsx scripts/record-demo-screen.ts --duration 300
//
// Output: ./output/demo-screen.mp4
//
// Notes:
//   - macOS only (uses avfoundation)
//   - The Playwright scripted version is preferred for repeatability
//   - This script uses the default mic; pass --input to override
//   - Press Ctrl-C to stop early; the partial MP4 is still valid
//
// Before running:
//   1. Open Chrome, navigate to https://your-domain.com
//   2. Move cursor to a neutral spot (e.g., top-left)
//   3. Make sure the system is quiet (no Slack, no other tabs)

import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const args = process.argv.slice(2);
  const get = (k: string) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const duration = Number(get("duration") || "300"); // 5 min default
  const screenIdx = get("screen") || "1"; // 0 = camera, 1 = screen
  const micName = get("mic") || "MacBook Pro Microphone";
  const outputPath = resolve(get("output") || "./output/demo-screen.mp4");
  const outDir = resolve("./output");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  console.log(`Recording Mac screen + microphone for ${duration}s → ${outputPath}`);
  console.log(`Press Ctrl-C to stop early.`);

  // ffmpeg avfoundation screen capture with mic audio.
  // -pix_fmt yuv420p for QuickTime compatibility
  // -preset ultrafast for low CPU during recording
  // -r 30 for smooth motion
  const cmd = [
    "-y",
    "-f", "avfoundation",
    "-framerate", "30",
    "-i", `${screenIdx}:${micName}`,
    "-t", String(duration),
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    outputPath,
  ];
  console.log(`ffmpeg ${cmd.join(" ")}`);

  const proc = spawn("ffmpeg", cmd, { stdio: "inherit" });
  proc.on("close", (code) => {
    if (code === 0) {
      console.log(`\n✓ Recording complete. ${outputPath}`);
    } else if (code === 255) {
      // SIGINT — partial recording still valid
      console.log(`\nRecording stopped early. ${outputPath} is a valid partial file.`);
    } else {
      console.error(`ffmpeg exited ${code}`);
      process.exit(1);
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
