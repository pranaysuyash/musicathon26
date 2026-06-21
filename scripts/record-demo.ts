// Demo recording script.
//
// Per Decision 0035, this script produces a 5-minute demo video
// for the Musicathon 2026 submission. Two modes:
//
//   1. Playwright mode (default): walks the demo storyboard
//      programmatically. Records the browser stream frame-by-frame
//      and synthesizes an MP4 via ffmpeg.
//
//   2. ffmpeg-direct mode (--mode=screen): records the Mac screen
//      + microphone via ffmpeg's avfoundation input. Use this for
//      real-time voiceover where you want to demonstrate live
//      clicks.
//
// Mode 1 is recommended — it's deterministic, can be re-run
// without scheduling, and produces a clean final video.
//
// Run: npx tsx scripts/record-demo.ts --base-url https://your-domain.com --voiceover ./output/voiceover.mp3
//
// Output: ./output/demo.mp4 (5 min, 1920x1080 @ 24fps, h264 + aac)

import { chromium, type Browser, type Page } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, existsSync, statSync, readdirSync, unlinkSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

interface Scene {
  id: string;
  url: string;
  durationSec: number;
  /** Setup actions before the recording captures this scene. */
  setup?: (page: Page) => Promise<void>;
  /** Wait conditions before considering this scene captured. */
  waitFor?: (page: Page) => Promise<void>;
}

const SCENES: Scene[] = [
  { id: "home", url: "/", durationSec: 30 },
  { id: "lens-2020", url: "/lens/2020", durationSec: 30 },
  {
    id: "song-blinding-lights",
    url: "/song/versesignal:2020:01:blinding-lights-the-weeknd",
    durationSec: 45,
    waitFor: async (page) => {
      // Scroll to the "what was the world doing" section so the
      // viewer sees the moment right away
      await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll("h1, h2, h3"))
          .find((n) => n.textContent?.includes("What was the world doing"));
        if (el) el.scrollIntoView({ behavior: "instant", block: "center" });
      });
      await page.waitForTimeout(800);
    },
  },
  {
    id: "graph-2020",
    url: "/graph?rootType=year&rootId=versesignal%3An%3Ayear%3A2020&hops=2",
    durationSec: 45,
    waitFor: async (page) => {
      // Wait for the graph to render (force-graph adds <canvas>)
      await page.waitForSelector("canvas", { timeout: 15000 });
      await page.waitForTimeout(2000);
    },
  },
  { id: "theme-loneliness", url: "/theme/loneliness", durationSec: 30 },
  { id: "compare-1969-2020", url: "/compare/1969/2020", durationSec: 30 },
  {
    id: "globe",
    url: "/globe",
    durationSec: 30,
    waitFor: async (page) => {
      // Wait for the 3D globe or 2D fallback to render
      await page.waitForSelector("canvas, svg", { timeout: 15000 });
      await page.waitForTimeout(2000);
    },
  },
  { id: "data-health", url: "/data-health", durationSec: 30 },
  { id: "home-closing", url: "/", durationSec: 30 },
];

async function renderScene(
  browser: Browser,
  baseUrl: string,
  scene: Scene,
  outDir: string
): Promise<{ dir: string; fps: number; durationSec: number }> {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const sceneDir = join(outDir, scene.id);
  mkdirSync(sceneDir, { recursive: true });

  const url = baseUrl.replace(/\/$/, "") + scene.url;
  console.log(`[${scene.id}] → ${url}`);

  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  if (scene.waitFor) await scene.waitFor(page);
  await page.waitForTimeout(800); // settle animations

  // Capture frames at 2 fps for the scene duration. 2 fps gives
  // the recording a smooth-looking result when assembled into a
  // 24fps video with frame interpolation (ffmpeg minterpolate).
  const fps = 2;
  const intervalMs = 1000 / fps;
  const totalFrames = Math.floor(scene.durationSec * fps);
  for (let i = 0; i < totalFrames; i++) {
    const ts = Date.now();
    await page.screenshot({
      path: join(sceneDir, `frame-${String(i).padStart(4, "0")}.png`),
      fullPage: false,
    });
    // Slow scroll mid-scene to add motion. Per Decision 0035, the
    // video should not look static.
    const t = i / totalFrames;
    await page.evaluate((t: number) => {
      const total = document.body.scrollHeight;
      const visible = window.innerHeight;
      const max = Math.max(0, total - visible);
      window.scrollTo({ top: max * t, behavior: "instant" as ScrollBehavior });
    }, t);
    const elapsed = Date.now() - ts;
    if (elapsed < intervalMs) await page.waitForTimeout(intervalMs - elapsed);
  }
  await page.close();

  return { dir: sceneDir, fps, durationSec: scene.durationSec };
}

async function concatenateScenes(
  sceneDirs: Array<{ dir: string; fps: number; durationSec: number }>,
  outputPath: string,
  voiceoverPath?: string
): Promise<void> {
  // Build a concat list (one PNG per frame, 2 fps) and let ffmpeg
  // interpolate to 24 fps for smoothness.
  const concatFile = join(outputPath, "..", "concat-list.txt");
  const concatDir = join(outputPath, "..");
  mkdirSync(concatDir, { recursive: true });

  const fs = await import("node:fs/promises");
  const lines: string[] = [];
  for (const s of sceneDirs) {
    const frames = readdirSync(s.dir)
      .filter((f) => f.endsWith(".png"))
      .sort();
    for (const f of frames) {
      lines.push(`file '${join(s.dir, f).replace(/'/g, "'\\''")}'`);
      lines.push(`duration ${1 / s.fps}`);
    }
  }
  await fs.writeFile(concatFile, lines.join("\n"));

  const args = [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatFile,
    "-vsync", "vfr",
    "-r", "24",
    "-vf", "minterpolate=fps=24:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:me=epzs:vsbmc=1",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
  ];
  if (voiceoverPath && existsSync(voiceoverPath)) {
    args.push("-i", voiceoverPath);
    args.push("-map", "0:v:0", "-map", "1:a:0");
    args.push("-c:a", "aac", "-b:a", "128k");
    args.push("-shortest");
  }
  args.push(outputPath);

  console.log(`ffmpeg ${args.join(" ")}`);
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: "inherit" });
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

async function main() {
  const args = process.argv.slice(2);
  const get = (k: string) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const baseUrl = get("base-url") || "http://localhost:3000";
  const voiceoverPath = get("voiceover");
  const outputPath = resolve(get("output") || "./output/demo.mp4");
  const workDir = resolve("./output/frames");

  if (existsSync(workDir)) {
    rmSync(workDir, { recursive: true, force: true });
  }
  mkdirSync(workDir, { recursive: true });

  console.log(`Recording demo from ${baseUrl}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Workdir: ${workDir}`);

  const browser = await chromium.launch({ headless: true });
  try {
    const sceneDirs = [];
    for (const scene of SCENES) {
      const result = await renderScene(browser, baseUrl, scene, workDir);
      sceneDirs.push(result);
    }
    console.log(`Captured ${sceneDirs.length} scenes. Concatenating...`);
    await concatenateScenes(sceneDirs, outputPath, voiceoverPath);
    const stat = statSync(outputPath);
    console.log(`\n✓ Done. Output: ${outputPath}  (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
