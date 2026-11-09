// Pack the dog frames rendered by render_dog_sprites.py into the two image strips the Bio timeline
// uses (src/components/TimelineDog.astro): dog-run.webp (the trot, 36 frames) and dog-idle.webp
// (standing and wagging, 12 frames), plus dog-sprite.json with what the page needs to put the
// paws on a logo. Frames are mirrored so the dog faces the timeline text, and scaled to `width`
// (2× the largest size the page shows them at).
//
//   node tools/figure3d/build_dog_sprite.mjs [tools/figure3d/out/dog-sprite] [src/assets/dog] [width]
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const [source = 'tools/figure3d/out/dog-sprite', out = 'src/assets/dog', widthArg = '160'] = process.argv.slice(2);
const meta = JSON.parse(readFileSync(join(source, 'meta.json'), 'utf8'));
const frameWidth = Number(widthArg);
const frameHeight = Math.round((frameWidth * meta.frameHeight) / meta.frameWidth);
mkdirSync(out, { recursive: true });

async function strip(name) {
  const files = readdirSync(join(source, name))
    .filter((file) => file.endsWith('.png'))
    .sort();
  const frames = await Promise.all(
    files.map((file) =>
      sharp(join(source, name, file))
        .flop()
        .resize(frameWidth, frameHeight, { kernel: 'lanczos3' })
        .png()
        .toBuffer(),
    ),
  );
  const target = join(out, `dog-${name}.webp`);
  await sharp({
    create: { width: frameWidth * frames.length, height: frameHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(frames.map((input, i) => ({ input, left: i * frameWidth, top: 0 })))
    .webp({ quality: 82, alphaQuality: 95, effort: 6, smartSubsample: true })
    .toFile(target);
  console.log(`${target}: ${frames.length} frames of ${frameWidth}×${frameHeight}, ${(statSync(target).size / 1024).toFixed(1)} KB`);
  return frames.length;
}

const runFrames = await strip('run');
const idleFrames = await strip('idle');
const sprite = {
  frameWidth,
  frameHeight,
  runFrames,
  idleFrames,
  fps: meta.fps,
  /** Where the paws touch the ground, as a fraction of the frame height from the top. */
  ground: Number((meta.groundY / meta.frameHeight).toFixed(4)),
  /** The middle of the standing dog's footprint, as a fraction of the frame width (mirrored). */
  paw: Number((1 - meta.pawX / meta.frameWidth).toFixed(4)),
  /** The run frame (0-based) with all four paws off the ground: shown while the dog is in the air. */
  hold: meta.holdFrame,
};
writeFileSync(join(out, 'dog-sprite.json'), `${JSON.stringify(sprite, null, 2)}\n`);
console.log(JSON.stringify(sprite));
