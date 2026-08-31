const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const POSE_NAMES = [
  'idle',
  'walk-a',
  'walk-b',
  'work',
  'paint',
  'repair',
  'carry',
  'play',
  'sleep',
  'celebrate',
];

// Extra action sheets deliberately use a different 5x2 layout from the
// original pose sheets: A keyframes occupy the top row and matching B
// keyframes occupy the bottom row. Keep this list separate so adding new
// actions can never reorder or overwrite the original 20 exported frames.
const EXTRA_ACTION_NAMES = [
  'coffee',
  'stretch',
  'type',
  'inspect',
  'sweep',
];

// Every frame shares this canvas, pivot, and one pack-level source scale.
// The 16 px space below the ground pivot matches the renderer's -96% anchor.
const OUTPUT_CANVAS = Object.freeze({
  width: 252,
  height: 336,
  pivotX: 126,
  pivotY: 320,
  margin: 6,
});

function parseArguments(args) {
  if (args[0] === '--action-sheet') {
    const [, inputPath, outputDirectory, ...remainingArguments] = args;
    if (!inputPath || !outputDirectory) {
      throw new Error(
        'Usage: extract-noobi-sprites.cjs --action-sheet '
        + '<sheet.png> <output-directory> [file-prefix=sprite] '
        + '[--base-layout <sprite-layout.json>]',
      );
    }

    let filePrefix = 'sprite';
    let baseLayoutPath;
    if (remainingArguments[0] && !remainingArguments[0].startsWith('--')) {
      filePrefix = remainingArguments.shift();
    }
    while (remainingArguments.length > 0) {
      const option = remainingArguments.shift();
      if (option !== '--base-layout') {
        throw new Error(`Unknown --action-sheet option: ${option}`);
      }
      if (baseLayoutPath) {
        throw new Error('--base-layout can only be provided once');
      }
      baseLayoutPath = remainingArguments.shift();
      if (!baseLayoutPath || baseLayoutPath.startsWith('--')) {
        throw new Error('--base-layout requires a sprite layout JSON path');
      }
    }
    return {
      outputDirectory,
      filePrefix,
      layoutFileName: `${filePrefix}-extra-layout.json`,
      sheetMode: 'extra-actions',
      ...(baseLayoutPath ? { baseLayoutPath } : {}),
      inputs: [{ inputPath, frameSuffix: '' }],
    };
  }

  if (args[0] === '--pair') {
    const [, sheetA, sheetB, outputDirectory, filePrefix = 'noobi-sprite'] = args;
    if (!sheetA || !sheetB || !outputDirectory) {
      throw new Error(
        'Usage: extract-noobi-sprites.cjs --pair '
        + '<sheet-a.png> <sheet-b.png> <output-directory> [file-prefix=noobi-sprite]',
      );
    }
    return {
      outputDirectory,
      filePrefix,
      layoutSuffix: '',
      sheetMode: 'poses',
      inputs: [
        { inputPath: sheetA, frameSuffix: 'a' },
        { inputPath: sheetB, frameSuffix: 'b' },
      ],
    };
  }

  const [inputPath, outputDirectory, filePrefix = 'noobi-sprite', frameSuffix = ''] = args;
  if (!inputPath || !outputDirectory) {
    throw new Error(
      'Usage: extract-noobi-sprites.cjs <sheet.png> <output-directory> '
      + '[file-prefix=noobi-sprite] [frame-suffix]\n'
      + '   or: extract-noobi-sprites.cjs --pair '
      + '<sheet-a.png> <sheet-b.png> <output-directory> [file-prefix=noobi-sprite]\n'
      + '   or: extract-noobi-sprites.cjs --action-sheet '
      + '<sheet.png> <output-directory> [file-prefix=sprite] '
      + '[--base-layout <sprite-layout.json>]',
    );
  }
  return {
    outputDirectory,
    filePrefix,
    layoutSuffix: frameSuffix ? `-${frameSuffix}` : '',
    sheetMode: 'poses',
    inputs: [{ inputPath, frameSuffix }],
  };
}

function pixelOffset(sheet, x, y) {
  return ((y * sheet.width) + x) * 4;
}

function isCheckerboardPixel(sheet, x, y) {
  const offset = pixelOffset(sheet, x, y);
  const red = sheet.data[offset];
  const green = sheet.data[offset + 1];
  const blue = sheet.data[offset + 2];
  return Math.min(red, green, blue) >= 215
    && Math.max(red, green, blue) - Math.min(red, green, blue) <= 12;
}

function clearConnectedCheckerboard(sheet) {
  const visited = new Uint8Array(sheet.width * sheet.height);
  const queue = [];
  const pixelIndex = (x, y) => (y * sheet.width) + x;
  const enqueue = (x, y) => {
    const index = pixelIndex(x, y);
    if (visited[index] || !isCheckerboardPixel(sheet, x, y)) return;
    visited[index] = 1;
    queue.push([x, y]);
  };

  for (let x = 0; x < sheet.width; x += 1) {
    enqueue(x, 0);
    enqueue(x, sheet.height - 1);
  }
  for (let y = 0; y < sheet.height; y += 1) {
    enqueue(0, y);
    enqueue(sheet.width - 1, y);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const [x, y] = queue[cursor];
    sheet.data[pixelOffset(sheet, x, y) + 3] = 0;
    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < sheet.width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < sheet.height) enqueue(x, y + 1);
  }
}

function componentBounds(component, cellWidth) {
  const bounds = {
    minX: cellWidth,
    minY: Number.POSITIVE_INFINITY,
    maxX: 0,
    maxY: 0,
  };
  for (const index of component) {
    const x = index % cellWidth;
    const y = Math.floor(index / cellWidth);
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.maxY = Math.max(bounds.maxY, y);
  }
  return bounds;
}

function boundsWidth(bounds) {
  return bounds.maxX - bounds.minX + 1;
}

function boundsHeight(bounds) {
  return bounds.maxY - bounds.minY + 1;
}

function boundsGap(first, second) {
  const horizontal = Math.max(first.minX - second.maxX, second.minX - first.maxX, 0);
  const vertical = Math.max(first.minY - second.maxY, second.minY - first.maxY, 0);
  return Math.hypot(horizontal, vertical);
}

function shouldRetainSecondaryComponent(
  componentBoundsValue,
  primaryBounds,
  cellWidth,
  cellHeight,
) {
  const edgeMargin = 2;
  const touchesCellEdge = componentBoundsValue.minX <= edgeMargin
    || componentBoundsValue.maxX >= cellWidth - 1 - edgeMargin
    || componentBoundsValue.minY <= edgeMargin
    || componentBoundsValue.maxY >= cellHeight - 1 - edgeMargin;
  const gap = boundsGap(componentBoundsValue, primaryBounds);

  // Neighboring cells occasionally bleed a partial arm/face into this cell.
  // Such slices touch a cell edge and must never affect crop or pose scale.
  if (touchesCellEdge && gap > 4) return false;

  // Keep local authored effects (sparks, Z marks, confetti and tools), while
  // discarding isolated generation debris far from the character.
  const localEffectRadius = Math.min(64, Math.max(30, boundsHeight(primaryBounds) * 0.26));
  return gap <= localEffectRadius;
}

function analyzeCell(sheet, row, column, poseName, frameSuffix) {
  const left = Math.round((column * sheet.width) / 5);
  const right = Math.round(((column + 1) * sheet.width) / 5);
  const top = Math.round((row * sheet.height) / 2);
  const bottom = Math.round(((row + 1) * sheet.height) / 2);
  const cellWidth = right - left;
  const cellHeight = bottom - top;
  const componentVisited = new Uint8Array(cellWidth * cellHeight);
  const candidateComponents = [];

  for (let localY = 0; localY < cellHeight; localY += 1) {
    for (let localX = 0; localX < cellWidth; localX += 1) {
      const localIndex = (localY * cellWidth) + localX;
      if (componentVisited[localIndex]) continue;
      if (sheet.data[pixelOffset(sheet, left + localX, top + localY) + 3] === 0) continue;

      const component = [];
      const componentQueue = [[localX, localY]];
      componentVisited[localIndex] = 1;
      let nonCheckerboardPixels = 0;
      for (let cursor = 0; cursor < componentQueue.length; cursor += 1) {
        const [x, y] = componentQueue[cursor];
        component.push((y * cellWidth) + x);
        if (!isCheckerboardPixel(sheet, left + x, top + y)) nonCheckerboardPixels += 1;
        const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
        for (const [nextX, nextY] of neighbors) {
          if (nextX < 0 || nextX >= cellWidth || nextY < 0 || nextY >= cellHeight) continue;
          const nextIndex = (nextY * cellWidth) + nextX;
          if (componentVisited[nextIndex]) continue;
          if (sheet.data[pixelOffset(sheet, left + nextX, top + nextY) + 3] === 0) continue;
          componentVisited[nextIndex] = 1;
          componentQueue.push([nextX, nextY]);
        }
      }

      // Preserve disconnected tools, sparks, sleep marks, and celebration
      // particles. Enclosed islands made only from the source checkerboard are
      // not part of the character.
      if (nonCheckerboardPixels > 0) candidateComponents.push(component);
    }
  }

  if (candidateComponents.length === 0) {
    throw new Error(`No opaque subject pixels found for ${poseName}-${frameSuffix || 'base'}`);
  }

  const primaryComponent = candidateComponents.reduce((largest, component) => (
    component.length > largest.length ? component : largest
  ), candidateComponents[0]);
  const primaryBounds = componentBounds(primaryComponent, cellWidth);
  const retainedComponents = candidateComponents.filter((component) => (
    component === primaryComponent
    || shouldRetainSecondaryComponent(
      componentBounds(component, cellWidth),
      primaryBounds,
      cellWidth,
      cellHeight,
    )
  ));

  const keepPixel = new Uint8Array(cellWidth * cellHeight);
  for (const component of retainedComponents) {
    for (const index of component) keepPixel[index] = 1;
  }
  let minX = cellWidth;
  let minY = cellHeight;
  let maxX = 0;
  let maxY = 0;
  for (let localY = 0; localY < cellHeight; localY += 1) {
    for (let localX = 0; localX < cellWidth; localX += 1) {
      const index = (localY * cellWidth) + localX;
      if (!keepPixel[index]) {
        sheet.data[pixelOffset(sheet, left + localX, top + localY) + 3] = 0;
        continue;
      }
      minX = Math.min(minX, localX);
      minY = Math.min(minY, localY);
      maxX = Math.max(maxX, localX);
      maxY = Math.max(maxY, localY);
    }
  }

  return {
    sheet,
    poseName,
    frameSuffix,
    left,
    top,
    cellWidth,
    cellHeight,
    keepPixel,
    primaryBounds,
    contentBounds: { minX, minY, maxX, maxY },
    droppedComponentCount: candidateComponents.length - retainedComponents.length,
  };
}

function analyzeSheet(inputPath, frameSuffix) {
  const sheet = PNG.sync.read(fs.readFileSync(inputPath));
  clearConnectedCheckerboard(sheet);
  const frames = [];
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      const poseIndex = (row * 5) + column;
      frames.push(analyzeCell(sheet, row, column, POSE_NAMES[poseIndex], frameSuffix));
    }
  }
  return frames;
}

function analyzeActionSheet(inputPath) {
  const sheet = PNG.sync.read(fs.readFileSync(inputPath));
  clearConnectedCheckerboard(sheet);
  const frames = [];
  for (let row = 0; row < 2; row += 1) {
    const frameSuffix = row === 0 ? 'a' : 'b';
    for (let column = 0; column < 5; column += 1) {
      frames.push(analyzeCell(
        sheet,
        row,
        column,
        EXTRA_ACTION_NAMES[column],
        frameSuffix,
      ));
    }
  }
  return frames;
}

function scaleConstraintForPrimaryBounds(primaryBounds, canvas = OUTPUT_CANVAS) {
  const primaryCenterX = (primaryBounds.minX + primaryBounds.maxX) / 2;
  const extents = {
    left: primaryCenterX - primaryBounds.minX,
    right: primaryBounds.maxX - primaryCenterX,
    top: primaryBounds.maxY - primaryBounds.minY,
  };
  const available = {
    left: canvas.pivotX - canvas.margin,
    right: canvas.width - 1 - canvas.pivotX - canvas.margin,
    top: canvas.pivotY - canvas.margin,
  };
  const candidates = [1];
  for (const side of ['left', 'right', 'top']) {
    if (extents[side] > 0) candidates.push(available[side] / extents[side]);
  }
  return Math.max(0.01, Math.min(...candidates));
}

function computeUniformPackScale(primaryBoundsList, canvas = OUTPUT_CANVAS) {
  if (primaryBoundsList.length === 0) throw new Error('Cannot scale an empty Noobi pack');
  return Math.min(
    1,
    ...primaryBoundsList.map((bounds) => scaleConstraintForPrimaryBounds(bounds, canvas)),
  );
}

function poseCanonicalScale(canonicalBounds, alternateBounds) {
  const canonicalHeight = boundsHeight(canonicalBounds);
  const alternateHeight = boundsHeight(alternateBounds);
  return Math.min(1.4, Math.max(0.72, canonicalHeight / Math.max(1, alternateHeight)));
}

function computePoseScaleFactors(frames) {
  const framesByPose = new Map();
  for (const frame of frames) {
    const poseFrames = framesByPose.get(frame.poseName) || [];
    poseFrames.push(frame);
    framesByPose.set(frame.poseName, poseFrames);
  }

  const factors = new Map();
  for (const poseFrames of framesByPose.values()) {
    const canonical = poseFrames.find((frame) => frame.frameSuffix === 'a') || poseFrames[0];
    for (const frame of poseFrames) {
      if (frame === canonical) {
        factors.set(frame, 1);
        continue;
      }
      // B is an alternate keyframe of the same action, not a new character.
      // Match its main-body height to A while allowing width to change naturally
      // for arms, carried props and side-facing motion.
      factors.set(frame, poseCanonicalScale(canonical.primaryBounds, frame.primaryBounds));
    }
  }
  return factors;
}

function computeUniformPackBaseScale(frames, poseScaleFactors, canvas = OUTPUT_CANVAS) {
  if (frames.length === 0) throw new Error('Cannot scale an empty Noobi pack');
  return Math.min(
    1,
    ...frames.map((frame) => {
      const poseScale = poseScaleFactors.get(frame) || 1;
      return scaleConstraintForPrimaryBounds(frame.primaryBounds, canvas) / poseScale;
    }),
  );
}

function packBaseScaleFromLayout(layoutPath) {
  let layout;
  try {
    layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read base sprite layout ${layoutPath}: ${reason}`);
  }

  const packBaseScale = layout?.packBaseScale;
  if (!Number.isFinite(packBaseScale) || packBaseScale <= 0 || packBaseScale > 1) {
    throw new Error(
      `Base sprite layout ${layoutPath} has an invalid packBaseScale; expected a number in (0, 1]`,
    );
  }
  const canvas = layout?.canvas;
  if (canvas && (
    canvas.width !== OUTPUT_CANVAS.width
    || canvas.height !== OUTPUT_CANVAS.height
    || canvas.pivot?.x !== OUTPUT_CANVAS.pivotX
    || canvas.pivot?.y !== OUTPUT_CANVAS.pivotY
  )) {
    throw new Error(
      `Base sprite layout ${layoutPath} uses an incompatible output canvas or pivot`,
    );
  }
  return packBaseScale;
}

function renderFrame(frame, packScale) {
  const { primaryBounds, contentBounds } = frame;
  const primaryCenterX = (primaryBounds.minX + primaryBounds.maxX) / 2;
  const primaryGroundY = primaryBounds.maxY;
  const targetBounds = {
    minX: Math.max(0, Math.floor(
      OUTPUT_CANVAS.pivotX + ((contentBounds.minX - primaryCenterX) * packScale),
    )),
    maxX: Math.min(OUTPUT_CANVAS.width - 1, Math.ceil(
      OUTPUT_CANVAS.pivotX + ((contentBounds.maxX - primaryCenterX) * packScale),
    )),
    minY: Math.max(0, Math.floor(
      OUTPUT_CANVAS.pivotY + ((contentBounds.minY - primaryGroundY) * packScale),
    )),
    maxY: Math.min(OUTPUT_CANVAS.height - 1, Math.ceil(
      OUTPUT_CANVAS.pivotY + ((contentBounds.maxY - primaryGroundY) * packScale),
    )),
  };
  const sprite = new PNG({
    width: OUTPUT_CANVAS.width,
    height: OUTPUT_CANVAS.height,
    colorType: 6,
  });

  for (let targetY = targetBounds.minY; targetY <= targetBounds.maxY; targetY += 1) {
    for (let targetX = targetBounds.minX; targetX <= targetBounds.maxX; targetX += 1) {
      const sourceX = Math.round(primaryCenterX + ((targetX - OUTPUT_CANVAS.pivotX) / packScale));
      const sourceY = Math.round(primaryGroundY + ((targetY - OUTPUT_CANVAS.pivotY) / packScale));
      if (sourceX < 0 || sourceX >= frame.cellWidth || sourceY < 0 || sourceY >= frame.cellHeight) {
        continue;
      }
      if (!frame.keepPixel[(sourceY * frame.cellWidth) + sourceX]) continue;
      const sourceOffset = pixelOffset(frame.sheet, frame.left + sourceX, frame.top + sourceY);
      const targetOffset = ((targetY * sprite.width) + targetX) * 4;
      frame.sheet.data.copy(sprite.data, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
  return sprite;
}

function extractSpritePack(configuration) {
  const allFrames = configuration.sheetMode === 'extra-actions'
    ? configuration.inputs.flatMap(({ inputPath }) => analyzeActionSheet(inputPath))
    : configuration.inputs.flatMap(({ inputPath, frameSuffix }) => (
      analyzeSheet(inputPath, frameSuffix)
    ));
  const poseScaleFactors = computePoseScaleFactors(allFrames);
  const packBaseScale = configuration.baseLayoutPath
    ? packBaseScaleFromLayout(configuration.baseLayoutPath)
    : computeUniformPackBaseScale(allFrames, poseScaleFactors);
  fs.mkdirSync(configuration.outputDirectory, { recursive: true });

  const outputFrames = {};
  for (const frame of allFrames) {
    const suffix = frame.frameSuffix ? `-${frame.frameSuffix}` : '';
    const outputName = `${configuration.filePrefix}-${frame.poseName}${suffix}.png`;
    const poseScale = poseScaleFactors.get(frame) || 1;
    const sourceScale = packBaseScale * poseScale;
    const sprite = renderFrame(frame, sourceScale);
    fs.writeFileSync(
      path.join(configuration.outputDirectory, outputName),
      PNG.sync.write(sprite),
    );
    outputFrames[`${frame.poseName}${suffix}`] = {
      file: outputName,
      packBaseScale,
      poseScale,
      sourceScale,
      primarySourceBounds: frame.primaryBounds,
      normalizedPrimarySize: {
        width: boundsWidth(frame.primaryBounds) * sourceScale,
        height: boundsHeight(frame.primaryBounds) * sourceScale,
      },
      droppedComponentCount: frame.droppedComponentCount,
    };
  }

  const layoutName = configuration.layoutFileName
    || `${configuration.filePrefix}-layout${configuration.layoutSuffix}.json`;
  const layout = {
    schemaVersion: 2,
    scaleMode: 'pack-base-with-pose-a-canonical',
    sheetMode: configuration.sheetMode || 'poses',
    packBaseScale,
    canvas: {
      width: OUTPUT_CANVAS.width,
      height: OUTPUT_CANVAS.height,
      pivot: { x: OUTPUT_CANVAS.pivotX, y: OUTPUT_CANVAS.pivotY },
    },
    frames: outputFrames,
  };
  fs.writeFileSync(
    path.join(configuration.outputDirectory, layoutName),
    `${JSON.stringify(layout, null, 2)}\n`,
  );
  return layout;
}

if (require.main === module) {
  extractSpritePack(parseArguments(process.argv.slice(2)));
}

module.exports = {
  EXTRA_ACTION_NAMES,
  OUTPUT_CANVAS,
  analyzeActionSheet,
  computeUniformPackScale,
  computePoseScaleFactors,
  computeUniformPackBaseScale,
  extractSpritePack,
  parseArguments,
  packBaseScaleFromLayout,
  poseCanonicalScale,
  scaleConstraintForPrimaryBounds,
  shouldRetainSecondaryComponent,
};
