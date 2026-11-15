'use strict';
// NASA rover path, beginning at its first published coordinate.
const WaypointRoute = {
  mode: 'nearby',
  selected: -1,
  customView: null,
  cache: null,
  cacheKey: '',
  mapMarkers: [],
  tileCache: new Map(),
  drawReference(ctx, g, px, py, view) {
    if (typeof Image === 'undefined') return;
    const topLeft = g.coordinates(view.x, view.y);
    const bottomRight = g.coordinates(view.x + view.w, view.y + view.h);
    const layers = [
      {
        name: 'MSL_CTX_ortho_mosaic_6m',
        min: 6,
        max: 13,
        bounds: [135.978762, -7.844091, 139.485904, -3.397065],
      },
      {
        name: 'MSL_Gale_HiRISE-LRGB_78quads',
        min: 10,
        max: 18,
        bounds: [137.326724, -4.875605, 137.478558, -4.555063],
      },
    ];
    const toX = (longitude, n) => ((longitude + 180) / 360) * n;
    const toY = (latitude, n) => {
      const rad = (Math.max(-85, Math.min(85, latitude)) * Math.PI) / 180;
      return ((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * n;
    };
    const toLatitude = (y, n) =>
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
    for (const layer of layers) {
      const [west, south, east, north] = layer.bounds;
      const left = Math.max(topLeft.longitude, west),
        right = Math.min(bottomRight.longitude, east);
      const top = Math.min(topLeft.latitude, north),
        bottom = Math.max(bottomRight.latitude, south);
      if (left >= right || bottom >= top) continue;
      // Aim for about one source pixel per displayed map pixel; never exceed native resolution.
      const z = Math.max(
        layer.min,
        Math.min(
          layer.max,
          Math.ceil(Math.log2((360 * 260) / (256 * (bottomRight.longitude - topLeft.longitude)))),
        ),
      );
      const n = 2 ** z;
      const x0 = Math.floor(toX(left, n)),
        x1 = Math.floor(toX(right, n));
      const y0 = Math.floor(toY(top, n)),
        y1 = Math.floor(toY(bottom, n));
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++) {
          const key = layer.name + '/' + z + '/' + x + '/' + (n - 1 - y);
          let img = this.tileCache.get(key);
          if (!img) {
            img = new Image();
            img.onload = () => this.onTilesChanged?.();
            img.src = 'https://mars.nasa.gov/mmgis-maps/MSL/Layers/' + key + '.png';
            this.tileCache.set(key, img);
          }
          if (!img.complete || !img.naturalWidth) continue;
          const nw = g.fromCoordinates(toLatitude(y, n), (x / n) * 360 - 180);
          const se = g.fromCoordinates(toLatitude(y + 1, n), ((x + 1) / n) * 360 - 180);
          ctx.drawImage(
            img,
            px(nw.x),
            py(nw.y),
            px(se.x) - px(nw.x) + 0.5,
            py(se.y) - py(nw.y) + 0.5,
          );
        }
    }
  },
  points(g) {
    const trace = CURIOSITY_TRAVERSE.registeredPoints();
    const key = [...g.geoScale, g.geo.latitude, g.geo.longitude, CURIOSITY_TRAVERSE.version].join(
      ',',
    );
    if (this.cacheKey === key) return this.cache;
    const points = [];
    let distance = 0,
      previous = null;
    for (const p of trace) {
      const position = g.fromCoordinates(p.latitude, p.longitude);
      if (previous)
        distance += Math.hypot(position.x - previous.x, position.y - previous.y) / g.unitsPerMeter;
      points.push({
        ...p,
        ...position,
        landmark: !!p.site,
        name: p.name || 'Route checkpoint',
        kind: 'trace',
        distanceFromStart: distance,
      });
      previous = position;
    }
    this.cacheKey = key;
    let siteNumber = 0;
    this.cache = points.map((p, i) => ({
      ...p,
      id: i + 1,
      siteNumber: p.landmark ? ++siteNumber : null,
    }));
    let destination = 'End of mapped route';
    for (let i = this.cache.length - 1; i >= 0; i--) {
      const p = this.cache[i];
      if (p.landmark) destination = p.name;
      p.destination = destination;
    }
    this.traceLengthMeters = distance;
    return this.cache;
  },
  segmentDistance(p, a, b) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      d = dx * dx + dy * dy,
      t = d ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / d)) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  },
  advance(points, index, a, b, radius) {
    while (index < points.length && this.segmentDistance(points[index], a, b) <= radius) index++;
    return index;
  },
  bearing(a, b) {
    return ((Math.atan2(b.x - a.x, a.y - b.y) * 180) / Math.PI + 360) % 360;
  },
  distanceLabel(d) {
    return d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km';
  },
  nextSite(points, index) {
    return points.slice(index).find((p) => p.landmark) || null;
  },
  view(g, rover, index) {
    if (this.customView) return this.customView;
    if (this.mode === 'crater') return { x: 0, y: 0, w: g.widthUnits, h: g.heightUnits };
    const points = g.climbRoute;
    if (this.mode === 'route') {
      const all = [g.spawnPoint, rover, ...points],
        xs = all.map((p) => p.x),
        ys = all.map((p) => p.y);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2,
        cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const h = Math.max(
          800 * g.unitsPerMeter,
          (Math.max(...ys) - Math.min(...ys)) * 1.25,
          ((Math.max(...xs) - Math.min(...xs)) * 1.25 * 235) / 260,
        ),
        w = (h * 260) / 235;
      return { x: cx - w / 2, y: cy - h / 2, w, h };
    }
    const p = points[index] || rover,
      dx = p.x - rover.x,
      dy = p.y - rover.y,
      dist = Math.hypot(dx, dy),
      shift = Math.min(dist * 0.3, 150 * g.unitsPerMeter),
      cx = rover.x + (dist ? (dx / dist) * shift : 0),
      cy = rover.y + (dist ? (dy / dist) * shift : 0);
    const h = Math.min(4000 * g.unitsPerMeter, Math.max(800 * g.unitsPerMeter, dist * 2.2)),
      w = (h * 260) / 235;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  },
  zoom(g, rover, index, factor, x = 130, y = 117.5) {
    const v = this.view(g, rover, index);
    const width = Math.max(100 * g.unitsPerMeter, Math.min(g.widthUnits * 2, v.w * factor));
    const ratio = width / v.w;
    const height = v.h * ratio;
    this.customView = {
      x: v.x + (v.w - width) * (x / 260),
      y: v.y + (v.h - height) * (y / 235),
      w: width,
      h: height,
    };
  },
  pan(g, rover, index, dx, dy) {
    const v = this.view(g, rover, index);
    this.customView = { ...v, x: v.x - (dx / 260) * v.w, y: v.y - (dy / 235) * v.h };
  },
  update(g, r, index) {
    const points = g.climbRoute,
      p = points[index],
      dist = p ? Math.hypot(p.x - r.x, p.y - r.y) / g.unitsPerMeter : 0;
    const nextSite = this.nextSite(points, index),
      sites = points.filter((wp) => wp.landmark);
    const toSite = nextSite && p ? dist + nextSite.distanceFromStart - p.distanceFromStart : 0;
    document.querySelector('#climb-status').textContent = nextSite
      ? 'NEXT: ' + nextSite.name
      : p
        ? 'END OF MAPPED ROUTE'
        : 'ROUTE COMPLETE';
    const bearing = p ? this.bearing(r, p) : 0,
      heading = ((r.a * 180) / Math.PI + 360) % 360,
      turn = ((bearing - heading + 540) % 360) - 180;
    document.querySelector('#route-guidance').textContent = p
      ? (nextSite ? this.distanceLabel(toSite) + ' to ' + nextSite.name + ' along route. ' : '') +
        'Next checkpoint ' +
        this.distanceLabel(dist) +
        ' · head ' +
        Math.round(bearing).toString().padStart(3, '0') +
        '° · ' +
        (Math.abs(turn) < 8
          ? 'straight ahead'
          : (turn > 0 ? 'right ' : 'left ') + Math.round(Math.abs(turn)) + '°')
      : 'Visible route complete';
    document.querySelector('#route-progress').textContent =
      index +
      ' / ' +
      points.length +
      ' checkpoints · ' +
      sites.filter((wp) => wp.id - 1 < index).length +
      ' / ' +
      sites.length +
      ' named stops reached';
    document.querySelector('#route-hud').textContent = p
      ? (nextSite ? nextSite.name : 'Mapped route end') +
        ' · checkpoint ' +
        this.distanceLabel(dist) +
        ' · ' +
        Math.round(bearing).toString().padStart(3, '0') +
        '°'
      : 'ROUTE COMPLETE';
    document.querySelector('#route-map-mode').textContent = 'MAP: ' + this.mode.toUpperCase();
    const selected = points[this.selected] || nextSite || p;
    document.querySelector('#waypoint-details').textContent = selected
      ? (selected.landmark ? selected.name : 'Route checkpoint toward ' + selected.destination) +
        ' · ' +
        Math.abs(selected.latitude).toFixed(selected.site?.id === 'bradbury-landing' ? 4 : 3) +
        '° S, ' +
        selected.longitude.toFixed(selected.site?.id === 'bradbury-landing' ? 4 : 3) +
        '° E' +
        (selected.site
          ? ' · ' +
            selected.site.type +
            ' · ' +
            selected.site.positionAccuracy +
            (selected.site.visitSol ? ' · published visit: Sol ' + selected.site.visitSol : '')
          : ' · NASA rover path (simplified)')
      : 'Mapped route complete';
    const source = document.querySelector('#waypoint-source');
    if (source) {
      source.hidden = !selected?.site;
      source.href = selected?.site?.source || '';
      source.textContent = selected?.site ? 'NASA reference for ' + selected.name : '';
    }
    const listKey = index + ':' + this.selected + ':' + this.cacheKey;
    if (this.listKey !== listKey) {
      this.listKey = listKey;
      document.querySelector('#waypoint-list').innerHTML = sites
        .map((wp) => {
          const i = wp.id - 1;
          return (
            '<li><button type="button" data-waypoint="' +
            i +
            '" class="waypoint-row ' +
            (i < index ? 'visited' : wp === nextSite ? 'active' : 'pending') +
            '" aria-pressed="' +
            (i === this.selected) +
            '"><b>' +
            wp.siteNumber +
            '</b><span>' +
            wp.name +
            '</span><small>' +
            (i < index ? 'REACHED' : wp === nextSite ? 'NEXT' : 'STOP ' + wp.siteNumber) +
            '</small></button></li>'
          );
        })
        .join('');
    }
  },
  drawSiteLabels(ctx, points, px, py, index) {
    this.mapLabelBoxes = [];
    const next = this.nextSite(points, index);
    const visible = points.filter(
      (p) => p.landmark && px(p.x) >= 0 && px(p.x) <= 260 && py(p.y) >= 0 && py(p.y) <= 235,
    );
    visible.sort(
      (a, b) =>
        (b.id - 1 === this.selected ? 2 : b === next ? 1 : 0) -
        (a.id - 1 === this.selected ? 2 : a === next ? 1 : 0),
    );
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const p of visible) {
      const x = px(p.x),
        y = py(p.y),
        width = (ctx.measureText(p.name)?.width || p.name.length * 6) + 8,
        height = 15;
      let box = null;
      for (const dy of [0, -18, 18, -36, 36, -54, 54, -72, 72]) {
        for (const side of [1, -1]) {
          const left = Math.max(3, Math.min(257 - width, side === 1 ? x + 10 : x - 10 - width)),
            top = Math.max(20, Math.min(207, y - 7 + dy));
          const b = { left, top, width, height, index: p.id - 1 };
          if (
            !this.mapLabelBoxes.some(
              (a) =>
                b.left < a.left + a.width + 3 &&
                b.left + b.width + 3 > a.left &&
                b.top < a.top + a.height + 2 &&
                b.top + b.height + 2 > a.top,
            )
          ) {
            box = b;
            break;
          }
        }
        if (box) break;
      }
      if (!box) continue;
      this.mapLabelBoxes.push(box);
      ctx.strokeStyle = p === next ? '#ffd270' : '#eee8d0';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(Math.max(box.left, Math.min(box.left + width, x)), box.top + height / 2);
      ctx.stroke();
      ctx.fillStyle = '#101819e8';
      ctx.fillRect(box.left, box.top, width, height);
      ctx.fillStyle = p.id - 1 < index ? '#75bc8c' : p === next ? '#ffd270' : '#fff';
      ctx.fillText(p.name, box.left + 4, box.top + height / 2);
    }
  },
  draw(ctx, g, r, index, windMinutes = 720, windDisplayStates = null) {
    const m = GALE_TOPOGRAPHY,
      v = this.view(g, r, index),
      px = (x) => ((x - v.x) / v.w) * 260,
      py = (y) => ((y - v.y) / v.h) * 235;
    ctx.clearRect(0, 0, 260, 235);
    for (let x = 0; x < 260; x += 4)
      for (let y = 0; y < 235; y += 4) {
        let wx = v.x + ((x + 2) / 260) * v.w,
          wy = v.y + ((y + 2) / 235) * v.h;
        if (wx < 0 || wy < 0 || wx > g.widthUnits || wy > g.heightUnits) ctx.fillStyle = '#161816';
        else {
          let z = g.elevationMeters(wx, wy),
            t = Math.max(0, Math.min(1, (z - m.minLegend) / (m.maxLegend - m.minLegend)));
          ctx.fillStyle = 'hsl(' + (220 - 205 * t) + ',38%,' + (21 + 30 * t) + '%)';
        }
        ctx.fillRect(x, y, 4, 4);
      }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 260, 235);
    ctx.clip();
    this.drawReference(ctx, g, px, py, v);
    // NASA's base mosaic is grayscale; apply the same illustrative tint to all imagery.
    ctx.save();
    ctx.globalCompositeOperation = 'color';
    ctx.fillStyle = '#b86c48';
    ctx.fillRect(0, 0, 260, 235);
    ctx.restore();
    ctx.strokeStyle = '#eee8d055';
    ctx.lineWidth = 0.7;
    for (const line of g.coordinateGrid()) {
      ctx.beginPath();
      if (line.axis === 'latitude') {
        let y = py(line.y);
        ctx.moveTo(0, y);
        ctx.lineTo(260, y);
      } else {
        let x = px(line.x);
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 235);
      }
      ctx.stroke();
    }
    if (this.showWind !== false) GaleWind.draw(ctx, g, px, py, windMinutes, windDisplayStates);
    const points = g.climbRoute,
      all = [g.spawnPoint, ...points];
    for (let i = 1; i < all.length; i++) {
      ctx.strokeStyle = i <= index ? '#75bc8c' : '#eee8d0';
      ctx.lineWidth = i === index + 1 ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(px(all[i - 1].x), py(all[i - 1].y));
      ctx.lineTo(px(all[i].x), py(all[i].y));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    this.mapMarkers = [];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 10px sans-serif';
    points.forEach((p, i) => {
      const x = px(p.x),
        y = py(p.y);
      if (x < 0 || y < 0 || x > 260 || y > 235) return;
      const prominent = i === index || i === this.selected || p.landmark;
      this.mapMarkers.push({ x, y, index: i, radius: prominent ? 12 : 3 });
      ctx.beginPath();
      ctx.arc(x, y, i === index ? 8 : prominent ? 7 : 2, 0, Math.PI * 2);
      ctx.fillStyle = i < index ? '#75bc8c' : i === index ? '#ffd270' : '#b2c2cf';
      ctx.fill();
      ctx.strokeStyle = i === this.selected ? '#fff' : '#222';
      ctx.lineWidth = i === this.selected ? 3 : 1;
      ctx.stroke();
      ctx.fillStyle = '#171b1b';
      if (p.landmark) ctx.fillText(String(p.siteNumber), x, y);
    });
    this.drawSiteLabels(ctx, points, px, py, index);
    ctx.save();
    ctx.translate(px(r.x), py(r.y));
    ctx.rotate(r.a);
    ctx.fillStyle = '#77e1ff';
    ctx.strokeStyle = '#14272d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('N ↑', 8, 14);
    ctx.fillText(this.distanceLabel(v.w / g.unitsPerMeter) + ' across', 8, 226);
  },
  pick(x, y) {
    // An exact dot hit takes priority; labels are otherwise clickable too.
    let match = -1,
      best = 14;
    for (const p of this.mapMarkers) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < best && d <= (p.radius || 14)) {
        best = d;
        match = p.index;
      }
    }
    if (best < 3) return match;
    for (const b of this.mapLabelBoxes || [])
      if (x >= b.left && x <= b.left + b.width && y >= b.top && y <= b.top + b.height)
        return b.index;
    return match;
  },
};
