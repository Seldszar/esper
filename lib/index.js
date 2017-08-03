const Promise = require('bluebird');
const csv = Promise.promisifyAll(require('csv'));
const ffmpeg = require('fluent-ffmpeg');
const fs = Promise.promisifyAll(require('fs-plus'));
const Jimp = require('jimp');
const _ = require('lodash');
const Path = require('path');

process.on('unhandledRejection', (reason) => {
  console.error(reason);
});

fs.readFileAsync = Promise.promisify(fs.readFile, { context: fs });
fs.listAsync = Promise.promisify(fs.list, { context: fs });

function blendImage(image) {
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, index) {
    const red = this.bitmap.data[index] / 255;
    const green = this.bitmap.data[index + 1] / 255;
    const blue = this.bitmap.data[index + 2] / 255;
    const alpha = this.bitmap.data[index + 3] / 255;

    if (alpha > 0) {
      this.bitmap.data[index] = (red * alpha) * 255;
      this.bitmap.data[index + 1] = (green * alpha) * 255;
      this.bitmap.data[index + 2] = (blue * alpha) * 255;
      this.bitmap.data[index + 3] = ((red + green + blue) / 3) * 255;
    }
  });

  return image;
};

function getImageBounds(image) {
  let bottom = 0;
  let left = image.bitmap.width;
  let right = 0;
  let top = image.bitmap.height;

  image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, index) => {
    const alpha = image.bitmap.data[index + 3];

    if (alpha > 0) {
      bottom = Math.max(bottom, y);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
    }
  });

  return {
    bottom,
    left,
    right,
    top,

    get height() {
      return this.bottom - this.top;
    },

    get width() {
      return this.right - this.left;
    },
  };
}

async function makeFrameImage(spritesheet, frame) {
  const image = new Jimp(2000, 2000);

  await Promise.each(frame.layers.reverse(), (layer) => {
    const layerImage = spritesheet.clone()
      .crop(layer.imgX, layer.imgY, layer.imgWidth, layer.imgHeight);

    if (layer.blendMode) {
      blendImage(layerImage);
    }

    layerImage.flip(layer.flipX, layer.flipY);
    layerImage.rotate(-layer.rotate, true);
    layerImage.opacity(layer.opacity / 100);

    image.composite(
      layerImage,
      image.bitmap.width / 2 + layer.xPos,
      image.bitmap.height / 2 + layer.yPos,
    );
  });

  const bounds = getImageBounds(image);

  return { bounds, image };
}

async function getFrames(records) {
  return Promise.map(records, async (params, index) => {
    const iterator = params[Symbol.iterator]();
    const nextInteger = () => parseInt(iterator.next().value);

    const anchor = nextInteger();
    const count = nextInteger();

    const layers = _.times(count, () => {
      const layer = {};

      layer.xPos = nextInteger();
      layer.yPos = nextInteger();
      layer.nextType = nextInteger();
      layer.flipX = [1, 3].includes(layer.nextType);
      layer.flipY = [2, 3].includes(layer.nextType);
      layer.blendMode = nextInteger();
      layer.opacity = nextInteger();
      layer.rotate = nextInteger();
      layer.imgX = nextInteger();
      layer.imgY = nextInteger();
      layer.imgWidth = nextInteger();
      layer.imgHeight = nextInteger();
      layer.pageId = nextInteger();

      return layer;
    });

    return { anchor, index, layers };
  });
}

async function fetchAnimation(unit, sprites, name) {
  const path = Path.join('input', `unit_${name}_cgs_${unit}.csv`);
  const data = await csv.parseAsync(await fs.readFileAsync(path, 'utf8'), { relax_column_count: true });
  const frames = [];

  data.forEach(([sprite, x, y, duration]) => {
    const frame = {
      sprite: sprites[parseInt(sprite)],
      x: parseInt(x),
      y: parseInt(y),
      duration: parseInt(duration),
    };

    frames.push(frame);
  });

  return { frames, name };
}

function getAnimationBounds(sprites, animation) {
  const bounds = {
    bottom: -Infinity,
    left: Infinity,
    right: -Infinity,
    top: Infinity,

    get height() {
      return this.bottom - this.top;
    },

    get width() {
      return this.right - this.left;
    },
  };

  animation.frames.forEach(({ sprite }) => {
    bounds.bottom = Math.max(bounds.bottom, sprite.bounds.bottom);
    bounds.left = Math.min(bounds.left, sprite.bounds.left);
    bounds.right = Math.max(bounds.right, sprite.bounds.right);
    bounds.top = Math.min(bounds.top, sprite.bounds.top);
  });

  return bounds;
}

async function createAnimationFrames(unit, sprites, animation) {
  const framesDirPath = Path.join('.esper', 'frames', String(unit), animation.name);
  const bounds = getAnimationBounds(sprites, animation);
  const promises = [];
  let index = 1;

  fs.makeTreeSync(framesDirPath);

  animation.frames.forEach(({ sprite, duration }) => {
    const frameImage = sprite.image.clone()
      .crop(bounds.left, bounds.top, bounds.width, bounds.height);

    _.times(duration, () => {
      const framePath = Path.join(framesDirPath, `${index++}.png`);

      promises.push(frameImage.write(framePath));
    });
  });

  await Promise.all(promises);
  return framesDirPath;
}

function createAnimationVideo(unit, animation, framesDirPath, outputDirPath) {
  return new Promise((resolve, reject) => {
    const outputPath = Path.join(outputDirPath, `unit_${animation.name}_${unit}.webm`);
    const command = ffmpeg()
      .input(Path.join(framesDirPath, '%d.png'))
      .inputFPS(60);

    command.on('error', reason => reject(reason));
    command.on('end', () => resolve());

    command.save(outputPath);
  });
}

exports.process = async function (inputDirPath, outputDirPath, params) {
  fs.makeTreeSync(outputDirPath);

  await Promise.each(params.units, async (unit) => {
    console.log(`Processing unit ${unit}...`);

    const spritesheet = await Jimp.read(Path.join(inputDirPath, `unit_anime_${unit}.png`));
    const path = Path.join(inputDirPath, `unit_cgg_${unit}.csv`);
    const data = await csv.parseAsync(await fs.readFileAsync(path, 'utf8'), { relax_column_count: true });
    const sprites = [];

    console.log(`Processing unit ${unit} frames...`);
    await Promise.map(getFrames(data), async (sprite) => {
      const spriteImage = await makeFrameImage(spritesheet, sprite);

      sprites.push(
        Object.assign({}, spriteImage, sprite),
      );
    });

    await Promise.each(params.animations, async (animationName) => {
      console.log(`Processing unit ${unit}'s ${animationName} animation...`);

      const animation = await fetchAnimation(unit, sprites, animationName);
      const framesDirPath = await createAnimationFrames(unit, sprites, animation);

      console.log(`Making unit ${unit}'s ${animationName} animation video...`);
      await createAnimationVideo(unit, animation, framesDirPath, outputDirPath);
    });
  });
};
