import fs from 'node:fs';

const svgPath = new URL('../src/assets/china-map.svg', import.meta.url);
const svg = fs.readFileSync(svgPath, 'utf8');
const viewBoxMatch = svg.match(/viewBox="([^"]+)"/i);
if (!viewBoxMatch) throw new Error('SVG viewBox not found');
const [minX, minY, width, height] = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);

function getPathData(id) {
  const pattern = new RegExp(`<path\\b(?=[^>]*\\bid="${id}")[^>]*\\bd="([^"]+)"[^>]*>`, 'i');
  const match = svg.match(pattern);
  if (!match) throw new Error(`Path not found: ${id}`);
  return match[1];
}

function tokenizePath(d) {
  return d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) ?? [];
}

function pathBBox(id) {
  const tokens = tokenizePath(getPathData(id));
  const xs = [];
  const ys = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;

  const isCommand = (token) => /^[a-zA-Z]$/.test(token);
  const number = () => Number(tokens[i++]);
  const add = (px, py) => {
    xs.push(px);
    ys.push(py);
  };
  const readPoint = (relative) => {
    const px = number();
    const py = number();
    return relative ? [x + px, y + py] : [px, py];
  };

  while (i < tokens.length) {
    if (isCommand(tokens[i])) cmd = tokens[i++];
    const relative = cmd === cmd.toLowerCase();
    const op = cmd.toUpperCase();

    if (op === 'M') {
      const [px, py] = readPoint(relative);
      x = px;
      y = py;
      startX = x;
      startY = y;
      add(x, y);
      cmd = relative ? 'l' : 'L';
    } else if (op === 'L') {
      const [px, py] = readPoint(relative);
      x = px;
      y = py;
      add(x, y);
    } else if (op === 'H') {
      const px = number();
      x = relative ? x + px : px;
      add(x, y);
    } else if (op === 'V') {
      const py = number();
      y = relative ? y + py : py;
      add(x, y);
    } else if (op === 'C') {
      for (let point = 0; point < 3; point += 1) {
        const [px, py] = readPoint(relative);
        add(px, py);
        if (point === 2) {
          x = px;
          y = py;
        }
      }
    } else if (op === 'S' || op === 'Q') {
      for (let point = 0; point < 2; point += 1) {
        const [px, py] = readPoint(relative);
        add(px, py);
        if (point === 1) {
          x = px;
          y = py;
        }
      }
    } else if (op === 'T') {
      const [px, py] = readPoint(relative);
      x = px;
      y = py;
      add(x, y);
    } else if (op === 'A') {
      number();
      number();
      number();
      number();
      number();
      const [px, py] = readPoint(relative);
      x = px;
      y = py;
      add(x, y);
    } else if (op === 'Z') {
      x = startX;
      y = startY;
      add(x, y);
    } else {
      throw new Error(`Unsupported SVG path command: ${cmd}`);
    }
  }

  return {
    xmin: Math.min(...xs),
    xmax: Math.max(...xs),
    ymin: Math.min(...ys),
    ymax: Math.max(...ys),
  };
}

function center(bbox) {
  return {
    x: (bbox.xmin + bbox.xmax) / 2,
    y: (bbox.ymin + bbox.ymax) / 2,
  };
}

function roundPoint(point) {
  return {
    x: Number(point.x.toFixed(1)),
    y: Number(point.y.toFixed(1)),
  };
}

const old = {
  viewBox: { width: 774, height: 569 },
  shanghai: { x: 605, y: 387 },
  tokyo: { x: 736, y: 314 },
};

const shanghai = center(pathBBox('CNSH'));
const guangdong = pathBBox('CNGD');
const guangzhou = {
  x: guangdong.xmin + (guangdong.xmax - guangdong.xmin) * 0.55,
  y: guangdong.ymin + (guangdong.ymax - guangdong.ymin) * 0.32,
};
const hongkong = center(pathBBox('CNHK'));
const tokyo = {
  x: shanghai.x + (old.tokyo.x - old.shanghai.x) * (width / old.viewBox.width),
  y: shanghai.y + (old.tokyo.y - old.shanghai.y) * (height / old.viewBox.height),
};

console.log(JSON.stringify({
  viewBox: `${minX} ${minY} ${width} ${height}`,
  shanghai: roundPoint(shanghai),
  guangzhou: roundPoint(guangzhou),
  hongkong: roundPoint(hongkong),
  tokyo: roundPoint(tokyo),
  bboxes: {
    CNSH: pathBBox('CNSH'),
    CNGD: guangdong,
    CNHK: pathBBox('CNHK'),
  },
}, null, 2));
