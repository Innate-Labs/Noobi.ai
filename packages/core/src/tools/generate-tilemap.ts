import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import type { Config } from '../config/config.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import { AutoTiler } from '../services/auto-tiler.js';
import * as fs from 'fs/promises';
import * as path from 'path';

interface TilemapLayer {
  type: string;
  data?: number[];
  width?: number;
  height?: number;
  [key: string]: unknown;
}

interface TilemapTilesetInfo {
  name: string;
  image: string;
  columns: number;
  imagewidth: number;
  imageheight: number;
  tilewidth: number;
  tileheight: number;
  tilecount: number;
  [key: string]: unknown;
}

interface TilemapData {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  orientation: string;
  renderorder: string;
  tiledversion: string;
  nextobjectid: number;
  layers: TilemapLayer[];
  tilesets: TilemapTilesetInfo[];
  [key: string]: unknown;
}

/**
 * Single map definition for multi-map support
 */
export interface MapDefinition {
  map_key: string;
  layout_ascii: string[];
  legend: Record<string, number>;
  object_markers?: Record<string, string>;
}

export interface GenerateTilemapParams {
  tileset_key: string;
  tile_size?: number;
  tileset_grid_size?: number;
  auto_tiling?: boolean;
  auto_tile_chars?: string[];
  /** Dual-tileset mode for top-down games. 'floor' treats walkable chars as solid, 'walls' treats # as solid. Auto-computes legend and auto_tile_chars. */
  mode?: 'floor' | 'walls';
  maps?: MapDefinition[];
  // Legacy parameters
  map_key?: string;
  layout_ascii?: string[];
  legend?: Record<string, number>;
  object_markers?: Record<string, string>;
  output_dir_name?: string;
}

interface AssetPackFile {
  type: string;
  key: string;
  url: string;
}

interface AssetPack {
  [section: string]: { files: AssetPackFile[] };
}

class GenerateTilemapInvocation extends BaseToolInvocation<
  GenerateTilemapParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: GenerateTilemapParams,
  ) {
    super(params);
  }

  getDescription(): string {
    const mapCount = this.params.maps?.length || 1;
    const autoTile = this.shouldAutoTile() ? ' with auto-tiling' : '';
    return `Converting ASCII layout to ${mapCount} Tilemap JSON file(s)${autoTile}...`;
  }

  private shouldAutoTile(): boolean {
    const gridSize = this.params.tileset_grid_size || 7;
    if (this.params.auto_tiling !== undefined) {
      return this.params.auto_tiling;
    }
    return gridSize >= 7;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const workspaceDir = this.config.getWorkspaceContext().getDirectories()[0];
    const targetDirName =
      this.params.output_dir_name || path.join('public', 'assets');
    const absoluteAssetsDir = path.join(workspaceDir, targetDirName);
    const assetPackPath = path.join(absoluteAssetsDir, 'asset-pack.json');

    await fs.mkdir(absoluteAssetsDir, { recursive: true });

    const tileSize = this.params.tile_size || 64;
    const gridSize = this.params.tileset_grid_size || 7;
    const TILESET_COLS = gridSize;
    const TILESET_ROWS = gridSize;
    const TOTAL_TILES = TILESET_COLS * TILESET_ROWS;
    const imageWidth = tileSize * TILESET_COLS;
    const imageHeight = tileSize * TILESET_ROWS;

    const useAutoTiling = this.shouldAutoTile();
    let autoTileChars = this.params.auto_tile_chars || ['#'];

    // Build maps array
    let maps: MapDefinition[];
    if (this.params.maps && this.params.maps.length > 0) {
      maps = this.params.maps;
    } else if (this.params.map_key && this.params.layout_ascii) {
      maps = [
        {
          map_key: this.params.map_key,
          layout_ascii: this.params.layout_ascii,
          legend: this.params.legend || {},
          object_markers: this.params.object_markers,
        },
      ];
    } else {
      return {
        llmContent:
          'Error: Either maps[] array or legacy parameters must be provided.',
        returnDisplay: 'Map Generation Failed: Missing required parameters',
        error: { message: 'Missing required parameters' },
      };
    }

    // Dual-tileset mode: auto-compute legend and autoTileChars per map
    if (this.params.mode) {
      for (const mapDef of maps) {
        const allChars = new Set<string>();
        for (const row of mapDef.layout_ascii) {
          for (const char of row) {
            allChars.add(char);
          }
        }

        if (this.params.mode === 'floor') {
          // Floor mode: walkable chars are solid (auto-tiled), # is empty
          mapDef.legend = {};
          allChars.forEach((c) => {
            mapDef.legend[c] = c === '#' ? 0 : 1;
          });
          autoTileChars = [...allChars].filter((c) => c !== '#');
        } else if (this.params.mode === 'walls') {
          // Walls mode: # is solid (auto-tiled), everything else is empty
          mapDef.legend = {};
          allChars.forEach((c) => {
            mapDef.legend[c] = c === '#' ? 1 : 0;
          });
          autoTileChars = ['#'];
        }
      }
    }

    const results: string[] = [];
    const errors: string[] = [];
    const allObjects: Array<{ mapKey: string; objects: string[] }> = [];

    for (const mapDef of maps) {
      try {
        const result = await this.generateSingleMap(
          mapDef,
          absoluteAssetsDir,
          assetPackPath,
          tileSize,
          TILESET_COLS,
          TOTAL_TILES,
          imageWidth,
          imageHeight,
          useAutoTiling,
          autoTileChars,
        );
        results.push(result.mapKey);
        if (result.objects.length > 0) {
          allObjects.push({ mapKey: result.mapKey, objects: result.objects });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${mapDef.map_key}: ${msg}`);
      }
    }

    if (results.length === 0) {
      return {
        llmContent: `Error generating maps: ${errors.join('; ')}`,
        returnDisplay: `Map Generation Failed: ${errors.join('; ')}`,
        error: { message: errors.join('; ') },
      };
    }

    const objectsInfo =
      allObjects.length > 0
        ? `\n  Objects: ${allObjects.map((o) => `${o.mapKey}(${o.objects.join(', ')})`).join('; ')}`
        : '';

    const autoTileInfo = useAutoTiling
      ? `\n  Auto-tiling: ENABLED for [${autoTileChars.join(', ')}]`
      : '';

    const firstMapKey = results[0];
    const objectLayerCode =
      allObjects.length > 0
        ? `
        // Read spawn points
        const objectLayer = map.getObjectLayer('Objects');
        objectLayer?.objects.forEach(obj => {
          if (obj.type === 'player_spawn') this.player.setPosition(obj.x!, obj.y!);
          else if (obj.type === 'enemy_spawn') this.createEnemy(obj.x!, obj.y!);
        });`
        : '';

    const instruction = `
Tilemaps generated: ${results.map((k) => `'${targetDirName}/${k}.json'`).join(', ')}.${autoTileInfo}${objectsInfo}

USAGE (Phaser 3):
\`\`\`typescript
createMap(mapKey: string = '${firstMapKey}') {
  const map = this.make.tilemap({ key: mapKey });
  const tileset = map.addTilesetImage('${this.params.tileset_key}', '${this.params.tileset_key}');
  const layer = map.createLayer('Ground', tileset, 0, 0);
  layer.setCollisionByExclusion([-1, 0]);
  this.physics.add.collider(this.player, layer);${objectLayerCode}
}
\`\`\`
`;

    return {
      llmContent: instruction,
      returnDisplay: `Generated ${results.length} tilemap(s): ${results.join(', ')}${useAutoTiling ? ' (auto-tiled)' : ''}`,
    };
  }

  private async generateSingleMap(
    mapDef: MapDefinition,
    absoluteAssetsDir: string,
    assetPackPath: string,
    tileSize: number,
    TILESET_COLS: number,
    TOTAL_TILES: number,
    imageWidth: number,
    imageHeight: number,
    useAutoTiling: boolean,
    autoTileChars: string[],
  ): Promise<{ mapKey: string; objects: string[] }> {
    const rows = mapDef.layout_ascii;
    const height = rows.length;
    const width = rows[0].length;

    // Extract objects
    const objects: Array<{ x: number; y: number; type: string; name: string }> =
      [];
    const objectMarkers = mapDef.object_markers || {};

    // PASS 1: Parse ASCII and extract objects
    const rawData: number[] = [];
    for (let y = 0; y < height; y++) {
      const row = rows[y];
      if (row.length !== width) {
        throw new Error(`Row ${y} width mismatch: ${row.length} vs ${width}`);
      }
      for (let x = 0; x < width; x++) {
        const char = row[x];
        if (objectMarkers[char]) {
          objects.push({
            x: x * tileSize + tileSize / 2,
            y: y * tileSize + tileSize / 2,
            type: objectMarkers[char],
            name: `${objectMarkers[char]}_${objects.length}`,
          });
        }
        rawData.push(mapDef.legend[char] ?? 0);
      }
    }

    // PASS 2: Auto-tiling
    let finalData: number[];
    if (useAutoTiling) {
      const solidGrid = AutoTiler.createSolidGrid(
        rows,
        mapDef.legend,
        autoTileChars,
      );
      const autoTiler = new AutoTiler(width, height, solidGrid);

      finalData = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const char = rows[y][x];
          if (autoTileChars.includes(char)) {
            finalData.push(autoTiler.getTileId(x, y));
          } else {
            finalData.push(rawData[y * width + x]);
          }
        }
      }
    } else {
      finalData = rawData;
    }

    // Build tilemap JSON
    const layers: Array<Record<string, unknown>> = [
      {
        id: 1,
        name: 'Ground',
        data: finalData,
        width,
        height,
        opacity: 1,
        type: 'tilelayer',
        visible: true,
        x: 0,
        y: 0,
      },
    ];

    if (objects.length > 0) {
      layers.push({
        id: 2,
        name: 'Objects',
        type: 'objectgroup',
        visible: true,
        opacity: 1,
        x: 0,
        y: 0,
        draworder: 'topdown',
        objects: objects.map((obj, idx) => ({
          id: idx + 1,
          name: obj.name,
          type: obj.type,
          x: obj.x,
          y: obj.y,
          width: tileSize,
          height: tileSize,
          visible: true,
        })),
      });
    }

    const tilemapData = {
      width,
      height,
      nextobjectid: objects.length + 1,
      orientation: 'orthogonal',
      renderorder: 'right-down',
      tiledversion: '1.0.3',
      layers,
      tilesets: [
        {
          firstgid: 1,
          name: this.params.tileset_key,
          image: `${this.params.tileset_key}.png`,
          columns: TILESET_COLS,
          imagewidth: imageWidth,
          imageheight: imageHeight,
          tilewidth: tileSize,
          tileheight: tileSize,
          tilecount: TOTAL_TILES,
          margin: 0,
          spacing: 0,
        },
      ],
      tilewidth: tileSize,
      tileheight: tileSize,
      type: 'map',
      version: 1,
    };

    const filename = `${mapDef.map_key}.json`;
    const filePath = path.join(absoluteAssetsDir, filename);

    await fs.writeFile(
      filePath,
      this.formatTilemapJson(tilemapData as unknown as TilemapData),
    );
    await this.updateAssetPack(assetPackPath, mapDef.map_key, filename);

    return {
      mapKey: mapDef.map_key,
      objects: [...new Set(objects.map((o) => o.type))],
    };
  }

  private formatTilemapJson(tilemapData: TilemapData): string {
    const dataLayer = tilemapData.layers.find((l) => l.type === 'tilelayer');
    if (!dataLayer?.data) {
      return JSON.stringify(tilemapData, null, 2);
    }

    // Standard format: data as single line array
    const tilesetInfo = tilemapData.tilesets[0];
    const dataStr = '[' + dataLayer.data.join(', ') + ']';

    let json = '{\n';
    json += `  "width": ${tilemapData.width},\n`;
    json += `  "height": ${tilemapData.height},\n`;
    json += `  "nextobjectid": ${tilemapData.nextobjectid},\n`;
    json += `  "orientation": "${tilemapData.orientation}",\n`;
    json += `  "renderorder": "${tilemapData.renderorder}",\n`;
    json += `  "tiledversion": "${tilemapData.tiledversion}",\n`;
    json += `  "layers": [\n`;
    json += `    {\n`;
    json += `      "id": 1,\n`;
    json += `      "name": "Ground",\n`;
    json += `      "data": ${dataStr},\n`;
    json += `      "width": ${dataLayer.width},\n`;
    json += `      "height": ${dataLayer.height},\n`;
    json += `      "opacity": 1,\n`;
    json += `      "type": "tilelayer",\n`;
    json += `      "visible": true,\n`;
    json += `      "x": 0,\n`;
    json += `      "y": 0\n`;
    json += `    }`;

    const objectsLayer = tilemapData.layers.find(
      (l) => l.type === 'objectgroup',
    );
    if (objectsLayer) {
      json += `,\n    ${JSON.stringify(objectsLayer, null, 4).split('\n').join('\n    ')}`;
    }

    json += `\n  ],\n`;
    json += `  "tilesets": [\n`;
    json += `    {\n`;
    json += `      "firstgid": 1,\n`;
    json += `      "name": "${tilesetInfo.name}",\n`;
    json += `      "image": "${tilesetInfo.image}",\n`;
    json += `      "columns": ${tilesetInfo.columns},\n`;
    json += `      "imagewidth": ${tilesetInfo.imagewidth},\n`;
    json += `      "imageheight": ${tilesetInfo.imageheight},\n`;
    json += `      "tilewidth": ${tilesetInfo.tilewidth},\n`;
    json += `      "tileheight": ${tilesetInfo.tileheight},\n`;
    json += `      "tilecount": ${tilesetInfo.tilecount},\n`;
    json += `      "margin": 0,\n`;
    json += `      "spacing": 0\n`;
    json += `    }\n`;
    json += `  ],\n`;
    json += `  "tilewidth": ${tilemapData.tilewidth},\n`;
    json += `  "tileheight": ${tilemapData.tileheight},\n`;
    json += `  "type": "map",\n`;
    json += `  "version": 1\n`;
    json += '}';

    return json;
  }

  private async updateAssetPack(
    packPath: string,
    key: string,
    filename: string,
  ) {
    let pack: AssetPack = { gameAssets: { files: [] } };
    try {
      pack = JSON.parse(await fs.readFile(packPath, 'utf-8'));
    } catch {
      /* ignore */
    }

    if (!pack['tilemaps']) pack['tilemaps'] = { files: [] };

    const list = pack['tilemaps'].files;
    const existing = list.find((f) => f.key === key);
    const url = `assets/${filename}`;

    if (existing) {
      existing.url = url;
    } else {
      list.push({ type: 'tilemapTiledJSON', key, url });
    }

    await fs.writeFile(packPath, JSON.stringify(pack, null, 2));
  }
}

export class GenerateTilemapTool extends BaseDeclarativeTool<
  GenerateTilemapParams,
  ToolResult
> {
  static readonly Name = ToolNames.GENERATE_TILEMAP;

  constructor(private config: Config) {
    super(
      GenerateTilemapTool.Name,
      ToolDisplayNames.GENERATE_TILEMAP,
      'Converts ASCII layouts into Phaser Tilemap JSON with 47-tile blob autotiling (bitmasking).',
      Kind.Execute,
      {
        type: 'object',
        properties: {
          tileset_key: {
            type: 'string',
            description:
              'Key of tileset image (must match generate_assets key).',
          },
          tile_size: {
            type: 'number',
            default: 64,
            description: 'Tile size in pixels.',
          },
          tileset_grid_size: {
            type: 'number',
            default: 7,
            description:
              'Tileset grid. 7 for 47-tile blob (auto-tiling), 3 for 9-slice.',
          },
          auto_tiling: {
            type: 'boolean',
            description:
              'Enable bitmasking auto-tiling (default: true for grid >= 7).',
          },
          auto_tile_chars: {
            type: 'array',
            items: { type: 'string' },
            description: 'Chars to auto-tile (default: ["#"]).',
          },
          mode: {
            type: 'string',
            enum: ['floor', 'walls'],
            description:
              'Dual-tileset mode for top-down games. "floor": auto-tiles walkable chars (everything except #). "walls": auto-tiles wall chars (#). When set, legend and auto_tile_chars are auto-computed.',
          },
          maps: {
            type: 'array',
            description: 'Array of map definitions.',
            items: {
              type: 'object',
              properties: {
                map_key: { type: 'string' },
                layout_ascii: { type: 'array', items: { type: 'string' } },
                legend: {
                  type: 'object',
                  additionalProperties: { type: 'number' },
                },
                object_markers: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                },
              },
              required: ['map_key', 'layout_ascii'],
            },
          },
          map_key: { type: 'string' },
          layout_ascii: { type: 'array', items: { type: 'string' } },
          legend: { type: 'object', additionalProperties: { type: 'number' } },
          object_markers: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
          output_dir_name: { type: 'string' },
        },
        required: ['tileset_key'],
      },
      false,
      true,
    );
  }

  protected createInvocation(
    params: GenerateTilemapParams,
  ): ToolInvocation<GenerateTilemapParams, ToolResult> {
    return new GenerateTilemapInvocation(this.config, params);
  }
}
