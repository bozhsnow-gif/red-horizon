'use strict';
// Screenshot-derived traverse; the spawn approach is explicitly non-historical.
const WaypointRoute = {
  mode: 'nearby',
  selected: -1,
  cache: null,
  cacheKey: '',
  mapMarkers: [],
  drawReference(ctx, g, px, py) {
    if (typeof Image === 'undefined') return;
    if (!this.referenceImages)
      this.referenceImages = CURIOSITY_TRAVERSE.sections
        .filter((s) => s.registered)
        .map((s) => {
          const img = new Image();
          img.src = s.image;
          return { section: s, img };
        });
    for (const { section: s, img } of this.referenceImages) {
      if (!img.complete || !img.naturalWidth) continue;
      // Exclude screenshot controls/readouts at the bottom and right edge.
      const w = s.id === 'landing' ? 1611 : 1585,
        h = 1040;
      const tl = CURIOSITY_TRAVERSE.coordinates(...s.offset),
        br = CURIOSITY_TRAVERSE.coordinates(s.offset[0] + w, s.offset[1] + h);
      const a = g.fromCoordinates(tl.latitude, tl.longitude),
        b = g.fromCoordinates(br.latitude, br.longitude);
      ctx.drawImage(img, 0, 0, w, h, px(a.x), py(a.y), px(b.x) - px(a.x), py(b.y) - py(a.y));
    }
  },
  points(g) {
    const a = g.spawnPoint,
      trace = CURIOSITY_TRAVERSE.registeredPoints(),
      b = g.fromCoordinates(trace[0].latitude, trace[0].longitude);
    const key = [a.x, a.y, b.x, b.y, ...g.geoScale, CURIOSITY_TRAVERSE.version].join(',');
    if (this.cacheKey === key) return this.cache;
    const metres = Math.hypot(b.x - a.x, b.y - a.y) / g.unitsPerMeter,
      points = [];
    for (let d = 150; d < metres - 12; d += 200) {
      const t = d / metres,
        x = a.x + (b.x - a.x) * t,
        y = a.y + (b.y - a.y) * t;
      points.push({
        x,
        y,
        ...g.coordinates(x, y),
        name: 'Approach to Bradbury',
        kind: 'approach',
        distanceFromStart: d,
      });
    }
    let distance = metres,
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
    this.traceLengthMeters = distance - metres;
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
      ? (selected.landmark
          ? selected.name
          : selected.kind === 'approach'
            ? 'Game approach to Bradbury Landing'
            : 'Route checkpoint toward ' + selected.destination) +
        ' · ' +
        Math.abs(selected.latitude).toFixed(selected.site?.id === 'bradbury-landing' ? 4 : 3) +
        '° S, ' +
        selected.longitude.toFixed(selected.site?.id === 'bradbury-landing' ? 4 : 3) +
        '° E' +
        (selected.kind === 'approach'
          ? ' · game approach, not Curiosity’s route'
          : selected.site
            ? ' · ' +
              selected.site.type +
              ' · ' +
              selected.site.positionAccuracy +
              (selected.site.visitSol ? ' · published visit: Sol ' + selected.site.visitSol : '')
            : ' · screenshot estimate')
      : 'Visible trace complete; later sections are not connected';
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
  draw(ctx, g, r, index) {
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
    this.drawReference(ctx, g, px, py);
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
    const points = g.climbRoute,
      all = [g.spawnPoint, ...points];
    for (let i = 1; i < all.length; i++) {
      const approach = all[i].kind === 'approach' || all[i].name === 'Bradbury Landing';
      ctx.setLineDash(approach ? [4, 4] : []);
      ctx.strokeStyle = i <= index ? '#75bc8c' : approach ? '#77c5df' : '#eee8d0';
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
