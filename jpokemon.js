// ---------------------------------------------------------------------------
// jpokemon — browser canvas port of the Java jpokemon overworld (Route 101).
// Uses the same tilemaps, sprites, dialogue assets, and grass animations as
// the Swing build. Controls: WASD move · Space/E interact · Enter advance text
// ---------------------------------------------------------------------------
(function () {
  var canvas = document.getElementById("jpokemon-canvas");
  if (!canvas) return;

  var ASSET_ROOT = "jpokemon/art/";
  var TILE_SCALE = 3;
  var TILE_SIZE = 16 * TILE_SCALE;
  var SCREEN_W = 15 * TILE_SIZE;
  var SCREEN_H = 10 * TILE_SIZE;
  var CREATOR_NAME = "Miles";

  var IDS_WILD_GRASS = ["0441", "0584", "0672"];
  var IDS_GRASS = ["0088", "0585", "0673"];
  var IDS_PATH = [
    "0058", "0146", "0234", "0059", "0147", "0235", "0060", "0148", "0236",
  ];

  var GRASS_FRAMES_FIRST = 8;
  var GRASS_FRAMES_PER = 6;
  var GRASS_ENTER_FRAC = 0.1;
  var GRASS_EMERGE_FRAC = 0.9;

  var INNER_W = 216;
  var INNER_H = 32;
  var INNER_X = 16;
  var INNER_Y = 120;
  var FRAME_Y = 112;
  var LINE_H = 16;
  var VISIBLE_LINES = 2;
  var TEXT_OX = 0;
  var TEXT_OY = 1;
  var TEXT_FG = "#606060";
  var TEXT_BG = "#f8f8f8";
  var TEXT_SHADOW = "#d0d0c8";

  var CHAR = {
    SPACE: 0x00,
    NEWLINE: 0xfe,
    EOS: 0xff,
    PROMPT_SCROLL: 0xfa,
    PROMPT_CLEAR: 0xfb,
    EXT: 0xfc,
    A: 0xbb,
    a: 0xd5,
    ZERO: 0xa1,
    EXCL: 0xab,
    QMARK: 0xac,
    PERIOD: 0xad,
    HYPHEN: 0xae,
    COMMA: 0xb8,
    COLON: 0xf0,
    SLASH: 0xba,
    LPAREN: 0x5c,
    RPAREN: 0x5d,
    DBL_L: 0xb1,
    SGL_R: 0xb4,
  };

  var LOCATIONS = {
    route101_main: {
      id: "route101_main",
      bg: "tilemaps/route101.txt",
      fg: "tilemaps/route101foreground.txt",
      spawnX: 20 * TILE_SIZE,
      spawnY: 10 * TILE_SIZE,
      facing: "DOWN",
      warps: [{ col: 5, row: 5, target: "route101_alt" }],
      signs: [{ textureId: "0264", message: "ROUTE 101\nIf you follow the path, you will reach OLDALE TOWN." }],
    },
    route101_alt: {
      id: "route101_alt",
      bg: "tilemaps/route101.txt",
      fg: "tilemaps/route101foreground.txt",
      spawnX: 25 * TILE_SIZE,
      spawnY: 10 * TILE_SIZE,
      facing: "DOWN",
      warps: [{ col: 30, row: 5, target: "route101_main" }],
      signs: [{ textureId: "0264", message: "ROUTE 101\nIf you follow the path, you will reach OLDALE TOWN." }],
    },
  };

  var imageCache = Object.create(null);
  var running = false;
  var gameReady = false;
  var phase = "splash";
  var splashBlink = 0;

  var keys = {
    up: false,
    down: false,
    left: false,
    right: false,
    interactPending: false,
    confirmPending: false,
  };

  var player = {
    worldX: 0,
    worldY: 0,
    direction: "DOWN",
    speed: 3,
    isMoving: false,
    isColliding: false,
    pixelsMoved: 0,
    frameIndex: 0,
    framesInImage: 0,
    stillFrames: 0,
    screenX: 0,
    screenY: 0,
    bb: { x: 1, y: TILE_SIZE + 1, w: TILE_SIZE - 2, h: TILE_SIZE - 2 },
    sprites: { UP: [], DOWN: [], LEFT: [], RIGHT: [] },
  };

  var scene = { location: null, bgLayer: null, fgLayer: null };

  var grass = {
    overlays: Object.create(null),
    currentKey: null,
    stages: [],
  };

  var textAssets = {
    sheet: null,
    tinted: null,
    tintedSplash: null,
    widths: [],
    arrow: null,
    frame: null,
  };

  var message = {
    visible: false,
    printer: null,
  };

  function asset(path) {
    return ASSET_ROOT + path;
  }

  function loadImage(path) {
    if (imageCache[path]) return imageCache[path];
    var img = new Image();
    img.src = path;
    imageCache[path] = img;
    return img;
  }

  function loadImageReady(path) {
    return new Promise(function (resolve, reject) {
      var img = loadImage(path);
      if (img.complete && img.naturalWidth) {
        resolve(img);
        return;
      }
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error("Missing asset: " + path));
      };
    });
  }

  // -- Emerald text ---------------------------------------------------------
  function mapAscii(c) {
    if (c === " ") return CHAR.SPACE;
    if (c >= "A" && c <= "Z") return CHAR.A + (c.charCodeAt(0) - "A".charCodeAt(0));
    if (c >= "a" && c <= "z") return CHAR.a + (c.charCodeAt(0) - "a".charCodeAt(0));
    if (c >= "0" && c <= "9") return CHAR.ZERO + (c.charCodeAt(0) - "0".charCodeAt(0));
    switch (c) {
      case "!": return CHAR.EXCL;
      case "?": return CHAR.QMARK;
      case ".": return CHAR.PERIOD;
      case "-": return CHAR.HYPHEN;
      case ",": return CHAR.COMMA;
      case ":": return CHAR.COLON;
      case "/": return CHAR.SLASH;
      case "(": return CHAR.LPAREN;
      case ")": return CHAR.RPAREN;
      case '"': return CHAR.DBL_L;
      case "'": return CHAR.SGL_R;
      default: return CHAR.SPACE;
    }
  }

  function encodeText(text) {
    var out = [];
    if (!text) {
      out.push(CHAR.EOS);
      return out;
    }
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === "\n") out.push(CHAR.NEWLINE);
      else out.push(mapAscii(c));
    }
    out.push(CHAR.EOS);
    return out;
  }

  function glyphWidth(code) {
    return textAssets.widths[code & 0xff] || 6;
  }

  function buildTintedSheet(fgHex, bgHex, shadowHex, transparentBg) {
    if (!textAssets.sheet) return null;
    var c = document.createElement("canvas");
    c.width = textAssets.sheet.width;
    c.height = textAssets.sheet.height;
    var ctx = c.getContext("2d");
    ctx.drawImage(textAssets.sheet, 0, 0);
    var data = ctx.getImageData(0, 0, c.width, c.height);
    var px = data.data;
    var fg = hexToRgb(fgHex);
    var bg = bgHex ? hexToRgb(bgHex) : null;
    var sh = hexToRgb(shadowHex);
    for (var i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      if (px[i] === 0 && px[i + 1] === 0 && px[i + 2] === 0) {
        px[i] = fg.r; px[i + 1] = fg.g; px[i + 2] = fg.b;
      } else if (px[i] === 128 && px[i + 1] === 128 && px[i + 2] === 128) {
        px[i] = sh.r; px[i + 1] = sh.g; px[i + 2] = sh.b;
      } else if (px[i] === 255 && px[i + 1] === 255 && px[i + 2] === 255) {
        if (transparentBg) {
          px[i + 3] = 0;
        } else if (bg) {
          px[i] = bg.r; px[i + 1] = bg.g; px[i + 2] = bg.b;
        }
      }
    }
    ctx.putImageData(data, 0, 0);
    return c;
  }

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function measureText(text) {
    var w = 0;
    for (var i = 0; i < text.length; i++) {
      w += glyphWidth(mapAscii(text[i]));
    }
    return w;
  }

  function drawGlyph(ctx, code, x, y, sheet) {
    sheet = sheet || textAssets.tinted;
    if (!sheet) return;
    var idx = code & 0xff;
    var sx = (idx % 16) * 16;
    var sy = Math.floor(idx / 16) * 16;
    ctx.drawImage(sheet, sx, sy, 16, 16, x, y, 16, 16);
  }

  function drawSplashLine(ctx, text, y) {
    if (!textAssets.tintedSplash || !text) return;
    var w = measureText(text);
    var x = Math.round((SCREEN_W - w) / 2);
    for (var i = 0; i < text.length; i++) {
      var code = mapAscii(text[i]);
      drawGlyph(ctx, code, x, y, textAssets.tintedSplash);
      x += glyphWidth(code);
    }
  }

  function compileScript(script) {
    var units = [];
    var x = TEXT_OX;
    var line = 0;
    var i = 0;

    function newLine() {
      line += 1;
      if (line >= VISIBLE_LINES) {
        units.push({ type: "wait" });
      }
    }

    while (i < script.length) {
      var b = script[i];
      if (b === CHAR.EOS) break;
      if (b === CHAR.NEWLINE) {
        x = TEXT_OX;
        newLine();
        i++;
        continue;
      }
      if (b === CHAR.PROMPT_SCROLL || b === CHAR.PROMPT_CLEAR) {
        units.push({ type: "wait" });
        i++;
        continue;
      }
      if (b === CHAR.SPACE) {
        x += glyphWidth(b);
        i++;
        continue;
      }
      var j = i;
      while (j < script.length) {
        var c = script[j];
        if (
          c === CHAR.EOS || c === CHAR.NEWLINE || c === CHAR.SPACE ||
          c === CHAR.PROMPT_SCROLL || c === CHAR.PROMPT_CLEAR
        ) break;
        j++;
      }
      var wordW = 0;
      for (var k = i; k < j; k++) wordW += glyphWidth(script[k]);
      if (x > TEXT_OX && x + wordW > INNER_W) {
        x = TEXT_OX;
        newLine();
      }
      for (k = i; k < j; k++) {
        units.push({ type: "glyph", x: x, line: line, code: script[k] });
        x += glyphWidth(script[k]);
      }
      i = j;
    }
    return units;
  }

  function createPrinter(text) {
    return {
      units: compileScript(encodeText(text)),
      head: 0,
      delay: 0,
      speed: 4,
      state: "printing",
      scrolled: 0,
      scrollPx: 0,
      cursorX: TEXT_OX,
      cursorLine: 0,
      arrowTick: 0,
    };
  }

  function printerWaiting(p) {
    return p.state === "wait" || p.state === "done";
  }

  function printerDone(p) {
    return p.state === "done";
  }

  function tickPrinter(p) {
    if (!p) return;
    p.arrowTick++;
    if (p.state === "scrolling") {
      p.scrollPx += 4;
      if (p.scrollPx >= LINE_H) {
        p.scrollPx = 0;
        p.scrolled += 1;
        p.state = "printing";
        p.delay = 0;
      }
      return;
    }
    if (p.state !== "printing") return;
    if (p.head >= p.units.length) {
      p.state = "done";
      return;
    }
    if (p.delay > 0) {
      p.delay--;
      return;
    }
    var u = p.units[p.head];
    if (u.type === "wait") {
      p.state = "wait";
      p.arrowTick = 0;
      return;
    }
    p.head++;
    p.cursorX = u.x + glyphWidth(u.code);
    p.cursorLine = u.line;
    p.delay = p.speed;
    if (p.head >= p.units.length) {
      p.state = "done";
      p.arrowTick = 0;
    }
  }

  function finishPrinterPage(p) {
    if (p.state !== "printing") return;
    while (p.head < p.units.length && p.units[p.head].type === "glyph") {
      var u = p.units[p.head];
      p.cursorX = u.x + glyphWidth(u.code);
      p.cursorLine = u.line;
      p.head++;
    }
    p.delay = 0;
    if (p.head >= p.units.length) {
      p.state = "done";
      p.arrowTick = 0;
    } else {
      p.state = "wait";
      p.arrowTick = 0;
    }
  }

  function advancePrinterPage(p) {
    if (p.state !== "wait") return;
    if (p.head < p.units.length && p.units[p.head].type === "wait") p.head++;
    p.state = "scrolling";
  }

  function drawPrinter(ctx, p) {
    var yShift = p.scrolled * LINE_H + p.scrollPx;
    for (var i = 0; i < p.head; i++) {
      var u = p.units[i];
      if (u.type !== "glyph") continue;
      var y = TEXT_OY + u.line * LINE_H - yShift;
      if (y + LINE_H <= 0 || y >= INNER_H) continue;
      drawGlyph(ctx, u.code, u.x, y);
    }
    if (printerWaiting(p)) {
      var ax = Math.min(p.cursorX, INNER_W - 8);
      var ay = TEXT_OY + p.cursorLine * LINE_H - yShift;
      var bounce = [0, 1, 2, 1][Math.floor(p.arrowTick / 8) % 4];
      if (textAssets.arrow) {
        ctx.drawImage(textAssets.arrow, 0, bounce, 8, 16, ax, ay, 8, 16);
      }
    }
  }

  function loadTextAssets() {
    return fetch(asset("ui/emerald/font_normal_widths.txt"))
      .then(function (r) {
        return r.text();
      })
      .then(function (txt) {
        textAssets.widths = txt.trim().split(/\s+/).map(function (n) {
          return parseInt(n, 10) || 6;
        });
        while (textAssets.widths.length < 256) textAssets.widths.push(6);
      })
      .then(function () {
        return loadImageReady(asset("ui/emerald/font_normal.png"));
      })
      .then(function (img) {
        textAssets.sheet = img;
        textAssets.tinted = buildTintedSheet(TEXT_FG, TEXT_BG, TEXT_SHADOW, false);
        textAssets.tintedSplash = buildTintedSheet("#eef8ee", null, "#1a4a1a", true);
        return loadImageReady(asset("ui/emerald/down_arrow.png"));
      })
      .then(function (img) {
        textAssets.arrow = img;
        return loadImageReady(asset("ui/emerald/dialogue_frame.png"));
      })
      .then(function (img) {
        textAssets.frame = img;
      });
  }

  // -- Grass overlay --------------------------------------------------------
  function grassKey(row, col) {
    return row + "," + col;
  }

  function isWildGrass(id) {
    return IDS_WILD_GRASS.indexOf(id) !== -1;
  }

  function loadGrassStages() {
    var paths = [];
    for (var i = 0; i <= 4; i++) {
      paths.push(loadImageReady(asset("animations/wildgrass/tall_grass_transition_000" + i + ".png")));
    }
    return Promise.all(paths).then(function (imgs) {
      grass.stages = imgs;
    });
  }

  function resetGrass() {
    grass.overlays = Object.create(null);
    grass.currentKey = null;
  }

  function updateGrass() {
    if (!scene.bgLayer) return;
    var bb = getBoundingBox();
    var bbW = TILE_SIZE - 2;
    var bbH = TILE_SIZE - 2;
    var leftX = bb.left;
    var topY = bb.top;
    var rightX = bb.right - 1;
    var bottomY = bb.bottom - 1;
    var centerX = Math.floor((leftX + rightX) / 2);
    var centerY = Math.floor((topY + bottomY) / 2);
    var minW = Math.max(1, Math.ceil(bbW * GRASS_ENTER_FRAC));
    var minH = Math.max(1, Math.ceil(bbH * GRASS_ENTER_FRAC));

    var triggerCol;
    var triggerRow;

    if (player.direction === "RIGHT") {
      var colC = Math.floor(rightX / TILE_SIZE);
      var rowC = Math.floor(centerY / TILE_SIZE);
      var tileLeft = colC * TILE_SIZE;
      var overlap = rightX - tileLeft + 1;
      triggerCol = overlap >= minW ? colC : Math.floor(leftX / TILE_SIZE);
      triggerRow = rowC;
    } else if (player.direction === "LEFT") {
      colC = Math.floor(leftX / TILE_SIZE);
      rowC = Math.floor(centerY / TILE_SIZE);
      var tileRight = (colC + 1) * TILE_SIZE - 1;
      overlap = tileRight - leftX + 1;
      triggerCol = overlap >= minW ? colC : Math.floor(rightX / TILE_SIZE);
      triggerRow = rowC;
    } else if (player.direction === "UP") {
      colC = Math.floor(centerX / TILE_SIZE);
      rowC = Math.floor(topY / TILE_SIZE);
      var tileBottom = (rowC + 1) * TILE_SIZE - 1;
      overlap = tileBottom - topY + 1;
      triggerCol = colC;
      triggerRow = overlap >= minH ? rowC : Math.floor(bottomY / TILE_SIZE);
    } else {
      colC = Math.floor(centerX / TILE_SIZE);
      rowC = Math.floor(bottomY / TILE_SIZE);
      var tileTop = rowC * TILE_SIZE;
      overlap = bottomY - tileTop + 1;
      triggerCol = colC;
      triggerRow = overlap >= minH ? rowC : Math.floor(topY / TILE_SIZE);
    }

    var tile = tileAt(scene.bgLayer, triggerRow, triggerCol);
    var keyAtPlayer = null;
    if (tile && isWildGrass(tile.id)) {
      keyAtPlayer = grassKey(triggerRow, triggerCol);
      if (keyAtPlayer !== grass.currentKey) {
        if (!grass.overlays[keyAtPlayer]) {
          grass.overlays[keyAtPlayer] = { row: triggerRow, col: triggerCol, stage: 1, frames: 0 };
        } else {
          grass.overlays[keyAtPlayer].stage = 1;
          grass.overlays[keyAtPlayer].frames = 0;
        }
        grass.currentKey = keyAtPlayer;
      }
    } else {
      grass.currentKey = null;
    }

    Object.keys(grass.overlays).forEach(function (key) {
      var inst = grass.overlays[key];
      var isCurrent = key === grass.currentKey;
      if (inst.stage === 0) {
        if (!isCurrent) delete grass.overlays[key];
        return;
      }
      inst.frames++;
      var req = inst.stage === 1 ? GRASS_FRAMES_FIRST : GRASS_FRAMES_PER;
      if (inst.frames >= req) {
        inst.frames = 0;
        if (inst.stage < 4) inst.stage++;
        else if (isCurrent) inst.stage = 0;
        else delete grass.overlays[key];
      }
    });
  }

  function drawGrassStage(ctx, row, col, stage) {
    var img = grass.stages[stage];
    if (!img) return;
    var worldX = col * TILE_SIZE;
    var worldY = row * TILE_SIZE;
    if (!tileVisible(worldX, worldY)) return;
    var sx = worldX - player.worldX + player.screenX;
    var sy = worldY - player.worldY + player.screenY;
    ctx.drawImage(img, sx, sy, TILE_SIZE, TILE_SIZE);
  }

  function drawGrassUnder(ctx) {
    var bb = getBoundingBox();
    var topY = bb.top;
    var bottomY = bb.bottom - 1;
    var movingDown = player.direction === "DOWN" && player.isMoving;
    var movingUp = player.direction === "UP" && player.isMoving;
    var playerRow = movingDown
      ? Math.floor(bottomY / TILE_SIZE)
      : movingUp
        ? Math.floor(topY / TILE_SIZE)
        : Math.floor((topY + bottomY) / 2 / TILE_SIZE);
    var upOverlap = movingUp ? (playerRow + 1) * TILE_SIZE - 1 - topY + 1 : 0;
    var minUp = Math.ceil((TILE_SIZE - 2) * GRASS_EMERGE_FRAC);

    Object.keys(grass.overlays).forEach(function (key) {
      var inst = grass.overlays[key];
      var isCurrent = key === grass.currentKey;
      var behind = movingDown && inst.row < playerRow;
      var underUp = movingUp && inst.row === playerRow && upOverlap < Math.max(1, minUp);
      if (inst.stage === 1) drawGrassStage(ctx, inst.row, inst.col, 1);
      else if (
        (behind || underUp) &&
        ((inst.stage >= 2 && inst.stage <= 4) || (inst.stage === 0 && isCurrent))
      ) {
        drawGrassStage(ctx, inst.row, inst.col, inst.stage);
      }
    });
  }

  function drawGrassOver(ctx) {
    var bb = getBoundingBox();
    var topY = bb.top;
    var bottomY = bb.bottom - 1;
    var movingDown = player.direction === "DOWN" && player.isMoving;
    var movingUp = player.direction === "UP" && player.isMoving;
    var playerRow = movingDown
      ? Math.floor(bottomY / TILE_SIZE)
      : movingUp
        ? Math.floor(topY / TILE_SIZE)
        : Math.floor((topY + bottomY) / 2 / TILE_SIZE);
    var upOverlap = movingUp ? (playerRow + 1) * TILE_SIZE - 1 - topY + 1 : 0;
    var minUp = Math.ceil((TILE_SIZE - 2) * GRASS_EMERGE_FRAC);

    Object.keys(grass.overlays).forEach(function (key) {
      var inst = grass.overlays[key];
      var isCurrent = key === grass.currentKey;
      var behind = movingDown && inst.row < playerRow;
      var underUp = movingUp && inst.row === playerRow && upOverlap < Math.max(1, minUp);
      if (
        !behind &&
        !underUp &&
        ((inst.stage >= 2 && inst.stage <= 4) || (inst.stage === 0 && isCurrent))
      ) {
        drawGrassStage(ctx, inst.row, inst.col, inst.stage);
      }
    });
  }

  // -- Map / player ---------------------------------------------------------
  function tileType(id) {
    if (!id) return "UNKNOWN";
    if (IDS_WILD_GRASS.indexOf(id) !== -1) return "WILD_GRASS";
    if (IDS_GRASS.indexOf(id) !== -1) return "GRASS";
    if (IDS_PATH.indexOf(id) !== -1) return "PATH";
    return "UNKNOWN";
  }

  function isWalkable(id) {
    var t = tileType(id);
    return t === "WILD_GRASS" || t === "GRASS" || t === "PATH";
  }

  function parseMapLines(text) {
    var lines = [];
    text.split("\n").forEach(function (raw) {
      var line = raw.trim();
      if (!line || line.indexOf("//") === 0) return;
      if (line.indexOf("END") === 0) return;
      lines.push(line);
    });
    if (!lines.length) throw new Error("Empty map");
    return lines;
  }

  function loadMap(resourcePath) {
    return fetch(asset(resourcePath))
      .then(function (r) {
        return r.text();
      })
      .then(function (text) {
        var lines = parseMapLines(text);
        var width = lines[0].split(" ").length;
        var tiles = [];
        var ids = Object.create(null);
        for (var row = 0; row < lines.length; row++) {
          var tokens = lines[row].split(" ");
          var rowTiles = [];
          for (var col = 0; col < tokens.length; col++) {
            var id = tokens[col];
            rowTiles.push({ id: id, walkable: isWalkable(id) });
            ids[id] = true;
          }
          tiles.push(rowTiles);
        }
        return Promise.all(
          Object.keys(ids).map(function (id) {
            return loadImageReady(asset("tiles/exterior/" + id + ".png"));
          })
        ).then(function () {
          return { width: width, height: lines.length, tiles: tiles };
        });
      });
  }

  function applyLocation(locId) {
    var loc = LOCATIONS[locId];
    return Promise.all([
      loadMap(loc.bg),
      loc.fg ? loadMap(loc.fg) : Promise.resolve(null),
    ]).then(function (result) {
      scene.location = loc;
      scene.bgLayer = result[0];
      scene.fgLayer = result[1];
      resetGrass();
      resetPlayer(loc.spawnX, loc.spawnY, loc.facing);
    });
  }

  function resetPlayer(worldX, worldY, facing) {
    player.worldX = worldX;
    player.worldY = worldY;
    player.direction = facing;
    player.isMoving = false;
    player.isColliding = false;
    player.pixelsMoved = 0;
    player.frameIndex = 0;
    player.framesInImage = 0;
    player.stillFrames = 0;
    player.screenX = SCREEN_W / 2 - 24;
    player.screenY = SCREEN_H / 2 - 48 - 24;
  }

  function getBoundingBox() {
    return {
      left: player.worldX + player.bb.x,
      right: player.worldX + player.bb.x + player.bb.w,
      top: player.worldY + player.bb.y,
      bottom: player.worldY + player.bb.y + player.bb.h,
    };
  }

  function tileAt(layer, row, col) {
    if (!layer || row < 0 || col < 0 || row >= layer.height || col >= layer.width) return null;
    return layer.tiles[row][col];
  }

  function checkCollision() {
    var bb = getBoundingBox();
    var leftCol = Math.floor(bb.left / TILE_SIZE);
    var rightCol = Math.floor(bb.right / TILE_SIZE);
    var topRow = Math.floor(bb.top / TILE_SIZE);
    var bottomRow = Math.floor(bb.bottom / TILE_SIZE);
    var speed = player.speed;
    var layer = scene.bgLayer;
    var a;
    var b;
    player.isColliding = false;

    if (player.direction === "UP") {
      topRow = Math.floor((bb.top - speed) / TILE_SIZE);
      a = tileAt(layer, topRow, rightCol);
      b = tileAt(layer, topRow, leftCol);
    } else if (player.direction === "DOWN") {
      bottomRow = Math.floor((bb.bottom + speed) / TILE_SIZE);
      a = tileAt(layer, bottomRow, rightCol);
      b = tileAt(layer, bottomRow, leftCol);
    } else if (player.direction === "RIGHT") {
      rightCol = Math.floor((bb.right + speed) / TILE_SIZE);
      a = tileAt(layer, topRow, rightCol);
      b = tileAt(layer, bottomRow, rightCol);
    } else {
      leftCol = Math.floor((bb.left - speed) / TILE_SIZE);
      a = tileAt(layer, topRow, leftCol);
      b = tileAt(layer, bottomRow, leftCol);
    }
    if (!a || !b || !a.walkable || !b.walkable) player.isColliding = true;
  }

  function tileInFront() {
    var bb = getBoundingBox();
    var cx = bb.left + player.bb.w / 2;
    var cy = bb.top + player.bb.h / 2;
    var col = Math.floor(cx / TILE_SIZE);
    var row = Math.floor(cy / TILE_SIZE);
    if (player.direction === "UP") row--;
    else if (player.direction === "DOWN") row++;
    else if (player.direction === "LEFT") col--;
    else if (player.direction === "RIGHT") col++;
    return { row: row, col: col };
  }

  function onStepCompleted(col, row) {
    var loc = scene.location;
    if (!loc) return;
    for (var i = 0; i < loc.warps.length; i++) {
      var w = loc.warps[i];
      if (w.col === col && w.row === row) {
        applyLocation(w.target);
        return;
      }
    }
  }

  function trySignInteract() {
    if (player.isMoving || message.visible) return;
    var front = tileInFront();
    var tile = tileAt(scene.bgLayer, front.row, front.col);
    if (!tile) return;
    var signs = scene.location.signs || [];
    for (var i = 0; i < signs.length; i++) {
      if (signs[i].textureId === tile.id) {
        showMessage(signs[i].message);
        keys.interactPending = false;
        keys.confirmPending = false;
        return;
      }
    }
  }

  function showMessage(text) {
    message.visible = true;
    message.printer = createPrinter(text);
  }

  function dismissMessage() {
    message.visible = false;
    message.printer = null;
  }

  function onMessageAdvance() {
    var p = message.printer;
    if (!p) return;
    if (printerDone(p)) {
      dismissMessage();
    } else if (printerWaiting(p)) {
      advancePrinterPage(p);
    } else {
      finishPrinterPage(p);
    }
  }

  function tileVisible(worldX, worldY) {
    return (
      worldX + TILE_SIZE * 3 > player.worldX - player.screenX &&
      worldX - TILE_SIZE * 3 < player.worldX + player.screenX &&
      worldY + TILE_SIZE * 3 > player.worldY - player.screenY &&
      worldY - TILE_SIZE * 3 < player.worldY + player.screenY
    );
  }

  function drawLayer(ctx, layer, skipTransparent) {
    if (!layer) return;
    for (var row = 0; row < layer.height; row++) {
      for (var col = 0; col < layer.width; col++) {
        var tile = layer.tiles[row][col];
        if (!tile) continue;
        if (skipTransparent && tile.id === "TRAN") continue;
        var worldX = col * TILE_SIZE;
        var worldY = row * TILE_SIZE;
        if (!tileVisible(worldX, worldY)) continue;
        var sx = worldX - player.worldX + player.screenX;
        var sy = worldY - player.worldY + player.screenY;
        var img = loadImage(asset("tiles/exterior/" + tile.id + ".png"));
        if (img.complete && img.naturalWidth) {
          ctx.drawImage(img, sx, sy, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  function drawPlayer(ctx) {
    var imgs = player.sprites[player.direction];
    var img = imgs[player.frameIndex] || imgs[0];
    if (!img || !img.complete) return;
    ctx.drawImage(img, player.screenX, player.screenY + 15, 48, 96);
  }

  function drawDialogueBox(ctx, p) {
    if (!textAssets.frame) return;
    ctx.drawImage(
      textAssets.frame,
      0,
      FRAME_Y * TILE_SCALE,
      SCREEN_W,
      textAssets.frame.height * TILE_SCALE
    );
    ctx.save();
    ctx.translate(INNER_X * TILE_SCALE, INNER_Y * TILE_SCALE);
    ctx.scale(TILE_SCALE, TILE_SCALE);
    ctx.beginPath();
    ctx.rect(0, 0, INNER_W, INNER_H);
    ctx.clip();
    if (p) drawPrinter(ctx, p);
    ctx.restore();
  }

  function drawMessage(ctx) {
    if (!message.visible || !message.printer) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    drawDialogueBox(ctx, message.printer);
    ctx.restore();
  }

  function drawLineScaled(ctx, text, x, y, scale, sheet) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    var cx = 0;
    for (var i = 0; i < text.length; i++) {
      var code = mapAscii(text[i]);
      drawGlyph(ctx, code, cx, 0, sheet);
      cx += glyphWidth(code);
    }
    ctx.restore();
  }

  function drawSplashBoxLines(ctx, lines, frameX, frameY, frameScale) {
    var innerX = frameX + 16 * frameScale;
    var innerY = frameY + 8 * frameScale;
    var innerW = INNER_W * frameScale;
    var innerH = INNER_H * frameScale;

    var maxW = 0;
    for (var i = 0; i < lines.length; i++) {
      maxW = Math.max(maxW, measureText(lines[i]));
    }
    var scale = Math.min(innerW / maxW, innerH / (lines.length * LINE_H));
    var blockH = lines.length * LINE_H * scale;
    var startY = innerY + (innerH - blockH) / 2;

    for (i = 0; i < lines.length; i++) {
      var line = lines[i];
      var lineW = measureText(line) * scale;
      var x = innerX + (innerW - lineW) / 2;
      var y = startY + i * LINE_H * scale;
      drawLineScaled(ctx, line, x, y, scale, textAssets.tinted);
    }
  }

  function drawSplash(ctx) {
    ctx.fillStyle = "#183018";
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    var tile = loadImage(asset("tiles/exterior/0088.png"));
    if (tile.complete) {
      for (var ty = 0; ty < SCREEN_H; ty += TILE_SIZE) {
        for (var tx = 0; tx < SCREEN_W; tx += TILE_SIZE) {
          ctx.globalAlpha = 0.35;
          ctx.drawImage(tile, tx, ty, TILE_SIZE, TILE_SIZE);
        }
      }
      ctx.globalAlpha = 1;
    }

    var brendan = player.sprites.DOWN[0];
    if (brendan && brendan.complete) {
      ctx.drawImage(brendan, SCREEN_W / 2 - 24, 56, 48, 96);
    }

    var promptY = 392;
    if (textAssets.frame) {
      var frameScale = TILE_SCALE;
      var frameW = 240 * frameScale;
      var frameH = textAssets.frame.height * frameScale;
      var frameX = (SCREEN_W - frameW) / 2;
      var frameY = 168;
      ctx.drawImage(textAssets.frame, frameX, frameY, frameW, frameH);

      drawSplashBoxLines(ctx, [
        "JPOKEMON",
        "CREATED BY " + CREATOR_NAME.toUpperCase(),
        "POKEMON EMERALD OVERWORLD",
        "JAVA SWING TO CANVAS",
      ], frameX, frameY, frameScale);

      promptY = frameY + frameH + 24;
    }

    splashBlink++;
    if (Math.floor(splashBlink / 30) % 2 === 0) {
      drawSplashLine(ctx, "PRESS SPACE TO START", promptY);
    }
  }

  function updatePlayer() {
    if (!player.isMoving) {
      if (keys.up || keys.down || keys.left || keys.right) {
        player.isMoving = true;
        if (keys.up) player.direction = "UP";
        else if (keys.down) player.direction = "DOWN";
        else if (keys.left) player.direction = "LEFT";
        else if (keys.right) player.direction = "RIGHT";
        player.isColliding = false;
        checkCollision();
      } else {
        player.stillFrames++;
        if (player.stillFrames >= 10) {
          player.frameIndex = 0;
          player.stillFrames = 0;
        }
      }
    }

    if (player.isMoving) {
      if (!player.isColliding) {
        if (player.direction === "UP") player.worldY -= player.speed;
        else if (player.direction === "DOWN") player.worldY += player.speed;
        else if (player.direction === "RIGHT") player.worldX += player.speed;
        else if (player.direction === "LEFT") player.worldX -= player.speed;
      }
      player.framesInImage++;
      if (player.framesInImage > 8) {
        player.frameIndex = (player.frameIndex + 1) % 4;
        player.framesInImage = 0;
      }
      player.pixelsMoved += player.speed;
      if (player.pixelsMoved >= TILE_SIZE) {
        if (!player.isColliding) {
          var bb = getBoundingBox();
          onStepCompleted(
            Math.floor((bb.left + bb.w / 2) / TILE_SIZE),
            Math.floor((bb.top + bb.h / 2) / TILE_SIZE)
          );
        }
        player.isMoving = false;
        player.pixelsMoved = 0;
      }
    }
  }

  function update() {
    if (phase === "splash") {
      if (keys.interactPending || keys.confirmPending) {
        phase = "playing";
        keys.interactPending = false;
        keys.confirmPending = false;
      }
      return;
    }

    if (message.visible && message.printer) {
      if (keys.interactPending || keys.confirmPending) {
        onMessageAdvance();
        keys.interactPending = false;
        keys.confirmPending = false;
      }
      if (message.printer) tickPrinter(message.printer);
      return;
    }

    if (keys.interactPending) trySignInteract();
    updatePlayer();
    updateGrass();
  }

  function renderPlaying(ctx) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    drawLayer(ctx, scene.bgLayer, false);
    drawGrassUnder(ctx);
    drawPlayer(ctx);
    drawGrassOver(ctx);
    drawLayer(ctx, scene.fgLayer, true);
    drawMessage(ctx);
  }

  function render() {
    var ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    if (phase === "splash") drawSplash(ctx);
    else renderPlaying(ctx);
  }

  function loop() {
    if (!running) return;
    update();
    render();
    requestAnimationFrame(loop);
  }

  function loadPlayerSprites() {
    var dirs = [
      ["DOWN", "walkdown", "down"],
      ["UP", "walkup", "up"],
      ["LEFT", "walkleft", "left"],
      ["RIGHT", "walkright", "right"],
    ];
    var promises = [];
    dirs.forEach(function (entry) {
      var facing = entry[0];
      var folder = entry[1];
      var prefix = entry[2];
      player.sprites[facing] = [];
      for (var i = 0; i < 4; i++) {
        (function (idx) {
          promises.push(
            loadImageReady(
              asset("entities/players/Brendan/walking/" + folder + "/" + prefix + idx + ".png")
            ).then(function (img) {
              player.sprites[facing][idx] = img;
            })
          );
        })(i);
      }
    });
    return Promise.all(promises);
  }

  function bindKeys() {
    function onDown(e) {
      if (!running) return;
      var code = e.code;
      if (code === "KeyW") keys.up = true;
      else if (code === "KeyS") keys.down = true;
      else if (code === "KeyA") keys.left = true;
      else if (code === "KeyD") keys.right = true;
      else if (code === "Space" || code === "KeyE") {
        keys.interactPending = true;
        e.preventDefault();
      } else if (code === "Enter") {
        keys.confirmPending = true;
        e.preventDefault();
      }
    }

    function onUp(e) {
      var code = e.code;
      if (code === "KeyW") keys.up = false;
      else if (code === "KeyS") keys.down = false;
      else if (code === "KeyA") keys.left = false;
      else if (code === "KeyD") keys.right = false;
    }

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    canvas.addEventListener("mousedown", function () {
      canvas.focus();
    });
  }

  function showLoading(show) {
    var el = document.getElementById("jpokemon-loading");
    if (el) el.hidden = !show;
  }

  function startGame() {
    if (running) return;
    if (gameReady) {
      running = true;
      showLoading(false);
      canvas.focus();
      loop();
      return;
    }
    showLoading(true);
    Promise.all([
      loadPlayerSprites(),
      loadTextAssets(),
      loadGrassStages(),
      applyLocation("route101_main"),
    ])
      .then(function () {
        gameReady = true;
        phase = "splash";
        splashBlink = 0;
        running = true;
        showLoading(false);
        canvas.focus();
        loop();
      })
      .catch(function (err) {
        showLoading(false);
        var errEl = document.getElementById("jpokemon-error");
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = "Could not load jpokemon assets. " + err.message;
        }
      });
  }

  function stopGame() {
    running = false;
  }

  bindKeys();

  var jpokemonWindow = document.getElementById("jpokemon");
  if (jpokemonWindow) {
    var observer = new MutationObserver(function () {
      var visible = jpokemonWindow.style.display !== "none";
      if (visible && !running) {
        if (gameReady) {
          running = true;
          canvas.focus();
          loop();
        } else {
          startGame();
        }
      } else if (!visible && running) {
        stopGame();
      }
    });
    observer.observe(jpokemonWindow, { attributes: true, attributeFilter: ["style"] });
    if (jpokemonWindow.style.display !== "none") startGame();
  }

  window.JPokemon = { start: startGame, stop: stopGame };
})();
