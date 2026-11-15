'use strict';
// GPU terrain, rover, lighting and shadow renderer. No network dependencies.
class MarsRenderer {
  constructor(canvas, parts, rocks, height) {
    this.canvas = canvas;
    this.height = height;
    this.gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    if (!this.gl) throw Error('WebGL 2 is required. Enable hardware acceleration in your browser.');
    const gl = this.gl;
    // Shared by the sky and aerial perspective so the ridge horizon has no color seam.
    const atmosphere = `vec3 dustSky(vec3 direction){
   float elevation=sqrt(clamp(direction.z,0.,1.));
   return mix(vec3(.77,.725,.64),vec3(.735,.695,.62),elevation);
  }`;
    const vs = `#version 300 es
  precision highp float;
  layout(location=0) in vec3 position;layout(location=1) in vec3 normal;layout(location=2) in vec3 color;
  uniform mat4 model,viewProjection,lightProjection;uniform vec3 eye;out vec3 world,n,c;out vec4 shadowCoord;
  void main(){vec4 p=model*vec4(position,1.);world=p.xyz;n=mat3(model)*normal;c=color;shadowCoord=lightProjection*p;gl_Position=viewProjection*vec4(p.xyz-eye,1.);}`;
    const fs = `#version 300 es
  precision highp float;in vec3 world,n,c;in vec4 shadowCoord;uniform sampler2D shadowMap,surfaceDetail;uniform vec3 eye;uniform float ground;uniform float overview;uniform vec3 terrainElevation;uniform vec4 geoOrigin;uniform vec2 geoScale;uniform vec3 contacts[4];out vec4 outColor;
  ${atmosphere}
  void main(){if(ground<-.5){outColor=vec4(ground>-1.5?vec3(.46,.74,.55):ground>-2.5?vec3(1.,.82,.44):vec3(.70,.76,.81),1.);return;}vec3 normal=normalize(n);if(!gl_FrontFacing)normal=-normal;vec3 sun=normalize(vec3(-.82,-.18,.55));vec3 reliefNormal=normalize(vec3(normal.xy*mix(1.,4.,overview*step(.5,ground)),normal.z));float diffuse=max(dot(reliefNormal,sun),0.);vec3 sc=shadowCoord.xyz/shadowCoord.w*.5+.5;float shade=0.;
  // Soft rover-only cast shadow, combined with local tire contact shading.
  if(ground>.5&&sc.x>0.&&sc.x<1.&&sc.y>0.&&sc.y<1.&&sc.z>0.&&sc.z<1.){
   float occlusion=0.;float bias=max(.0003,.001*(1.-diffuse));
   for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
    float depth=texture(shadowMap,sc.xy+vec2(float(x),float(y))*1.65/1024.).r;
    occlusion+=sc.z-bias>depth?1.:0.;
   }shade=occlusion/9.*.72;
  }
  if(ground>.5){float contactShade=0.;for(int i=0;i<4;i++){vec2 delta=world.xy-contacts[i].xy;contactShade+=exp(-dot(delta,delta)/55.)*.38;}shade=max(shade,min(contactShade,.46));}
  vec3 albedo=c;if(ground>.5){
   // Illustrative surface appearance only: measured vertices/collisions stay unchanged.
   vec3 metres=world/terrainElevation.x;
   float weather=texture(surfaceDetail,metres.xy/14000.).r;
   float slope=1.-clamp(normal.z,0.,1.);
   float wall=smoothstep(.0015,.045,slope);
   vec3 dust=vec3(.595,.49,.395),stone=vec3(.64,.555,.465);
   albedo=mix(dust,stone,clamp(weather*.42+wall*.55,0.,1.));
   // Preserve the darker tire impressions drawn with the same terrain material.
   albedo*=clamp(c.r/.64,.55,1.12);
   float layerPhase=metres.z*.12+weather*3.;
   float layerFade=1.-smoothstep(.6,2.8,fwidth(layerPhase));
   float strata=sin(layerPhase)*.045*layerFade;
   float finePhase=metres.z*.49+weather*5.;
   strata+=sin(finePhase)*.018*(1.-smoothstep(.6,2.8,fwidth(finePhase)));
   float streak=texture(surfaceDetail,metres.xy*vec2(.00055,.00008)+weather*.12).g-.5;
   albedo*=1.+(weather-.5)*.16+wall*(strata+streak*.12);
   float footprint=max(length(dFdx(metres.xy)),length(dFdy(metres.xy)));
   vec4 grit=texture(surfaceDetail,metres.xy/8.);
   float detailFade=1.-smoothstep(.025,.25,footprint);
   albedo*=1.+((grit.a-.5)*.16-(1.-grit.b)*.21)*detailFade;
  }
  if(ground>.5&&overview>0.){
   float elevation=world.z/terrainElevation.x+terrainElevation.y;
   vec3 low=vec3(.48,.43,.35),middle=vec3(.73,.64,.48),high=vec3(.91,.80,.61);
   float t=clamp((elevation-terrainElevation.y)/(terrainElevation.z-terrainElevation.y),0.,1.);
   vec3 elevationColor=t<.5?mix(low,middle,t*2.):mix(middle,high,(t-.5)*2.);
   albedo=mix(albedo,elevationColor,overview*.65);
   float contourDistance=abs(fract(elevation/250.+.5)-.5)*250.;
   float pixelHeight=max(fwidth(elevation),1.);
   float contour=(1.-smoothstep(0.,max(5.,pixelHeight*1.2),contourDistance))*(1.-smoothstep(70.,180.,pixelHeight));
   albedo*=1.-contour*.16*overview;
   vec2 coordinates=geoOrigin.zw+(world.xy-geoOrigin.xy)*geoScale;
   vec2 separation=abs(fract(coordinates/.5+.5)-.5)*.5;
   vec2 gridAA=max(fwidth(coordinates)*1.1,vec2(.00008));
   vec2 gridLines=1.-smoothstep(vec2(0.),gridAA,separation);
   float grid=max(gridLines.x,gridLines.y)*(1.-smoothstep(.08,.18,max(gridAA.x,gridAA.y)));
   albedo=mix(albedo,vec3(.97,.94,.82),grid*.32*overview);
  }
  vec3 halfDir=normalize(sun+normalize(eye-world));float spec=pow(max(dot(normal,halfDir),0.),42.)*(ground>.5?.008:.17)*(1.-shade);
  vec3 fill=mix(vec3(.42,.405,.38),vec3(.48,.475,.45),step(.5,ground));
  vec3 direct=mix(vec3(.64,.61,.55),vec3(.54,.53,.49),step(.5,ground))*diffuse*(1.-shade*.8);
  vec3 lit=albedo*(fill+direct)+vec3(1.,.94,.8)*spec;
  float distanceMetres=distance(eye,world)/terrainElevation.x;
  float fog=1.-exp(-pow(distanceMetres/32000.,1.12));
  fog*=mix(1.,.025,overview);
  lit=mix(lit,dustSky(normalize(world-eye)),fog);outColor=vec4(lit,1.);}`;
    const depthVs = `#version 300 es
  layout(location=0) in vec3 position;uniform mat4 model,viewProjection;void main(){gl_Position=viewProjection*model*vec4(position,1.);}`;
    const depthFs = `#version 300 es
  precision highp float;void main(){}`;
    this.program = this.programFrom(vs, fs);
    this.depthProgram = this.programFrom(depthVs, depthFs);
    this.skyProgram = this.programFrom(
      `#version 300 es
   precision highp float;out vec2 screen;
   void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));screen=p*2.-1.;gl_Position=vec4(screen,1.,1.);}`,
      `#version 300 es
   precision highp float;in vec2 screen;uniform vec3 forward,right,up;uniform vec2 frame;out vec4 outColor;
   ${atmosphere}
   void main(){vec3 direction=normalize(forward+right*screen.x*frame.x+up*screen.y*frame.y);outColor=vec4(dustSky(direction),1.);}`,
    );
    this.skyUniforms = {};
    for (const name of ['forward', 'right', 'up', 'frame'])
      this.skyUniforms[name] = gl.getUniformLocation(this.skyProgram, name);
    this.surfaceDetail = this.makeSurfaceDetail();
    this.uniforms = {};
    for (const name of [
      'model',
      'viewProjection',
      'lightProjection',
      'eye',
      'ground',
      'overview',
      'terrainElevation',
      'geoOrigin',
      'geoScale',
      'shadowMap',
      'surfaceDetail',
      'contacts[0]',
    ])
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    this.du = {
      model: gl.getUniformLocation(this.depthProgram, 'model'),
      viewProjection: gl.getUniformLocation(this.depthProgram, 'viewProjection'),
    };
    this.shadow = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shadow);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.DEPTH_COMPONENT24,
      1024,
      1024,
      0,
      gl.DEPTH_COMPONENT,
      gl.UNSIGNED_INT,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadow, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw Error('Shadow framebuffer could not be created');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    let data = buildMappedGround();
    this.terrain = this.mesh(data);
    data = [];
    this.wheels = ARES4_RIG.wheels.map((w) => {
      let d = [],
        center = [w.center[0] * 18, -w.center[1] * 18, w.center[2] * 18];
      for (let p of w.parts)
        this.polygon(
          d,
          p
            .slice(0, -1)
            .map((v) => [v[0] * 18 - center[0], -v[1] * 18 - center[1], v[2] * 18 - center[2]]),
          p[p.length - 1].map((c) => c / 255),
        );
      return {
        mesh: this.mesh(this.smoothNormals(d)),
        center,
        radius: w.radius * 18,
        spin: 0,
        previous: null,
        stamp: null,
        model: null,
      };
    });
    this.trackCapacity = 6000;
    this.trackCursor = 0;
    this.trackCount = 0;
    this.trackMesh = this.mesh(new Float32Array(this.trackCapacity * 54), gl.DYNAMIC_DRAW);
    this.trackMesh.count = 0;

    for (const p of parts) {
      let points = p.slice(0, -1).map((v) => [v[0] * 18, -v[1] * 18, v[2] * 18]),
        rgb = p[p.length - 1].map((c) => c / 255);
      this.polygon(data, points, rgb);
    }
    this.rover = this.mesh(this.smoothNormals(data));
    data = [];
    for (const r of rocks) {
      // Uneven, bevelled silhouettes rather than pointed pyramids.
      let z = height(r.x, r.y),
        rr = r.r,
        lower = [],
        upper = [],
        burial = r.lowProfile ? rr * 0.3 : 1,
        rockHeight = r.lowProfile ? 0.48 : 1;
      for (let i = 0; i < 6; i++) {
        let a = r.a + (i * Math.PI) / 3,
          k = 0.86 + 0.12 * Math.sin(i * 9 + r.x);
        lower.push([r.x + Math.cos(a) * rr * k, r.y + Math.sin(a) * rr * k, z - burial]);
        upper.push([
          r.x + Math.cos(a) * rr * k * 0.65 + rr * 0.08,
          r.y + Math.sin(a) * rr * k * 0.65,
          z + rr * rockHeight * (0.64 + 0.12 * Math.sin(i * 3 + r.y)),
        ]);
      }
      for (let i = 0; i < 6; i++)
        this.polygon(
          data,
          [lower[i], lower[(i + 1) % 6], upper[(i + 1) % 6], upper[i]],
          r.color || [0.4, 0.365, 0.29],
        );
      this.polygon(data, upper, r.color ? r.color.map((c) => c * 1.12) : [0.48, 0.44, 0.35]);
    }
    this.rocks = this.mesh(data);
    data = [];
    let peak = [0, 0, 15],
      bottom = [0, 0, -5],
      ring = [
        [8, 0, 5],
        [0, 8, 5],
        [-8, 0, 5],
        [0, -8, 5],
      ];
    for (let i = 0; i < 4; i++) {
      this.polygon(data, [ring[i], ring[(i + 1) % 4], peak], [1, 0.8, 0.38]);
      this.polygon(data, [ring[(i + 1) % 4], ring[i], bottom], [0.9, 0.6, 0.22]);
    }
    this.sample = this.mesh(data);
    this.compass = document.querySelector('#compass-rose');
    this.compassHeading = document.querySelector('#compass-heading');
    this.compassTime = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.zoom = 185;
    this.last = 0;
    this.mapTime = 0;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.scale = Math.min(devicePixelRatio || 1, 2);
    this.slow = 0;
    this.lastShadow = '';
    this.referenceCamera = false;
    gl.enable(gl.DEPTH_TEST);
    this.resize();
  }
  programFrom(vs, fs) {
    let gl = this.gl;
    function shader(type, src) {
      let s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
      return s;
    }
    let p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
    return p;
  }
  makeSurfaceDetail() {
    // A small, deterministic, mipmapped texture: stable detail without extra terrain triangles.
    const gl = this.gl,
      size = 256,
      data = new Uint8Array(size * size * 4);
    const hash = (x, y) => {
      let n = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
    };
    const noise = (x, y, period) => {
      let ix = Math.floor(x),
        iy = Math.floor(y),
        u = x - ix,
        v = y - iy;
      u = u * u * (3 - 2 * u);
      v = v * v * (3 - 2 * v);
      const h = (a, b) => hash((a + period) % period, (b + period) % period);
      return (
        (h(ix, iy) * (1 - u) + h(ix + 1, iy) * u) * (1 - v) +
        (h(ix, iy + 1) * (1 - u) + h(ix + 1, iy + 1) * u) * v
      );
    };
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        let i = (y * size + x) * 4;
        data[i] = Math.round(noise(x / 16, y / 16, 16) * 255);
        data[i + 1] = Math.round(noise(x / 4, y / 4, 64) * 255);
        data[i + 2] = hash(x >> 1, y >> 1) > 0.93 ? 90 : 255;
        data[i + 3] = Math.round(hash(x, y) * 255);
      }
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return texture;
  }
  drawSky(eye, target, birdsEye, fov) {
    let gl = this.gl,
      forward = unit(sub(target, eye)),
      vertical = birdsEye ? [Math.sin(this.yaw), -Math.cos(this.yaw), 0] : [0, 0, 1],
      right = unit(cross(forward, vertical)),
      up = cross(right, forward);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.useProgram(this.skyProgram);
    gl.bindVertexArray(null);
    gl.uniform3fv(this.skyUniforms.forward, forward);
    gl.uniform3fv(this.skyUniforms.right, right);
    gl.uniform3fv(this.skyUniforms.up, up);
    gl.uniform2fv(this.skyUniforms.frame, [Math.tan(fov / 2) * this.aspect, Math.tan(fov / 2)]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
  }
  polygon(data, p, c) {
    for (let i = 1; i < p.length - 1; i++) {
      let a = p[0],
        b = p[i],
        d = p[i + 1],
        n = unit(cross(sub(b, a), sub(d, a)));
      for (let v of [a, b, d]) data.push(...v, ...n, ...c);
    }
  }
  mesh(data, usage = this.gl.STATIC_DRAW) {
    let gl = this.gl,
      vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    let buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      data instanceof Float32Array ? data : new Float32Array(data),
      usage,
    );
    for (let i = 0; i < 3; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 36, i * 12);
    }
    return { vao, buffer, count: data.length / 9 };
  }
  smoothNormals(data) {
    // Blend neighbouring faces at bevels, preserving sharp 90-degree mechanical edges.
    const groups = new Map(),
      result = new Float32Array(data);
    for (let i = 0; i < data.length; i += 9) {
      let key = [data[i], data[i + 1], data[i + 2], data[i + 6], data[i + 7], data[i + 8]].join(
        ',',
      );
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    }
    for (let indices of groups.values())
      for (let i of indices) {
        let sum = [0, 0, 0],
          base = [data[i + 3], data[i + 4], data[i + 5]];
        for (let j of indices) {
          let n = [data[j + 3], data[j + 4], data[j + 5]];
          if (dot(base, n) > 0.45) for (let k = 0; k < 3; k++) sum[k] += n[k];
        }
        let n = unit(sum);
        result.set(n, i + 3);
      }
    return result;
  }
  resize() {
    let r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(r.width * this.scale);
    this.canvas.height = Math.round(r.height * this.scale);
    this.aspect = r.width / r.height;
  }
  draw(mesh, model, depth = false, ground = 0) {
    let gl = this.gl;
    gl.uniformMatrix4fv(depth ? this.du.model : this.uniforms.model, false, model);
    if (!depth) gl.uniform1f(this.uniforms.ground, ground);
    gl.bindVertexArray(mesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }

  surface(x, y) {
    return this.height(x, y);
  }

  resetPose() {
    this.bodyZ = null;
    this.bodyV = 0;
    this.previousPoseCenter = null;
    for (const wheel of this.wheels) {
      wheel.previous = null;
      wheel.stamp = null;
      wheel.model = null;
    }
    this.lastShadow = '';
  }
  resetMotion() {
    this.resetPose();
    for (const wheel of this.wheels) wheel.spin = 0;
    this.trackCursor = 0;
    this.trackCount = 0;
    this.trackMesh.count = 0;
  }
  stampTrack(x, y, heading) {
    let material = Gale.materialAt(x, y);
    if (!material.tracks) return;
    let right = [Math.cos(heading), Math.sin(heading)],
      forward = [Math.sin(heading), -Math.cos(heading)],
      p = [];
    for (let [side, along] of [
      [-4.8, -0.7],
      [4.8, -0.7],
      [4.8, 0.7],
      [-4.8, 0.7],
    ]) {
      let px = x + right[0] * side + forward[0] * along,
        py = y + right[1] * side + forward[1] * along;
      p.push([px, py, this.surface(px, py) + 0.09]);
    }
    let data = [];
    this.polygon(
      data,
      p,
      material.color.map((c) => c * 0.73),
    );
    let gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trackMesh.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, this.trackCursor * 54 * 4, new Float32Array(data));
    this.trackCursor = (this.trackCursor + 1) % this.trackCapacity;
    this.trackCount = Math.min(this.trackCount + 1, this.trackCapacity);
    this.trackMesh.count = this.trackCount * 6;
  }
  pose(rover) {
    // Instant travel must not animate kilometres of wheel motion or leave a trail
    // that continues stamping after the rover has stopped at its destination.
    if (
      this.previousPoseCenter &&
      Math.hypot(rover.x - this.previousPoseCenter.x, rover.y - this.previousPoseCenter.y) >
        20 * Gale.unitsPerMeter
    )
      this.resetPose();
    this.previousPoseCenter = { x: rover.x, y: rover.y };
    let ca = Math.cos(rover.a),
      sa = Math.sin(rover.a),
      heights = this.wheels.map((w) =>
        this.surface(
          rover.x + w.center[0] * ca - w.center[1] * sa,
          rover.y + w.center[0] * sa + w.center[1] * ca,
        ),
      );
    let sx = 0,
      sy = 0,
      xx = 0,
      yy = 0;
    for (let i = 0; i < 4; i++) {
      let c = this.wheels[i].center;
      sx += c[0] * heights[i];
      sy += c[1] * heights[i];
      xx += c[0] * c[0];
      yy += c[1] * c[1];
    }
    sx /= xx;
    sy /= yy;
    let right = unit([ca, sa, sx]),
      back = unit([-sa, ca, sy]),
      up = unit(cross(right, back));
    back = unit(cross(up, right));
    let z =
      heights.reduce((a, b) => a + b, 0) / 4 + this.wheels[0].radius - this.wheels[0].center[2];
    // Damped vertical chassis suspension under Mars gravity; wheels retain contact.
    let targetZ = z;
    if (this.bodyZ == null) {
      this.bodyZ = z;
      this.bodyV = 0;
    }
    let dt = this.physicsDt || 1 / 60;
    let gravity = Gale.gravity * Gale.unitsPerMeter,
      k = 100,
      rest = targetZ + gravity / k;
    this.bodyV += ((rest - this.bodyZ) * k - 20 * this.bodyV - gravity) * dt;
    this.bodyZ += this.bodyV * dt;
    this.bodyZ = Math.max(targetZ - 2, Math.min(targetZ + 2, this.bodyZ));
    z = this.bodyZ;
    let model = new Float32Array([...right, 0, ...back, 0, ...up, 0, rover.x, rover.y, z, 1]);
    for (let w of this.wheels) {
      let x = rover.x + right[0] * w.center[0] + back[0] * w.center[1] + up[0] * w.center[2],
        y = rover.y + right[1] * w.center[0] + back[1] * w.center[1] + up[1] * w.center[2],
        ground = this.surface(x, y),
        point = [x, y, ground],
        wheelZ = ground + w.radius * Math.sqrt(Math.max(0, 1 - right[2] * right[2]));
      if (w.previous) {
        let dx = x - w.previous[0],
          dy = y - w.previous[1],
          dz = ground - w.previous[2],
          distance = Math.hypot(dx, dy, dz),
          sign = Math.sign(dx * sa - dy * ca);
        w.spin =
          (w.spin + (distance * sign) / w.radius / Math.max(0.45, 1 - (rover.slip || 0))) %
          (Math.PI * 2);
      }
      w.previous = point;
      if (!w.stamp) w.stamp = point.slice();
      let dx = x - w.stamp[0],
        dy = y - w.stamp[1],
        length = Math.hypot(dx, dy);
      if (length >= 2.6) {
        let count = Math.min(100, Math.floor(length / 2.6));
        for (let i = 1; i <= count; i++)
          this.stampTrack(
            w.stamp[0] + (dx * i * 2.6) / length,
            w.stamp[1] + (dy * i * 2.6) / length,
            rover.a,
          );
        w.stamp = [
          w.stamp[0] + (dx * count * 2.6) / length,
          w.stamp[1] + (dy * count * 2.6) / length,
          ground,
        ];
      }
      let basis = new Float32Array(model);
      basis[12] = x;
      basis[13] = y;
      basis[14] = wheelZ;
      let c = Math.cos(w.spin),
        s = Math.sin(w.spin);
      w.model = mul(basis, new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]));
    }
    return model;
  }
  render(
    rover,
    samples,
    firstPerson,
    orbitYaw,
    orbitPitch,
    time,
    zoom = 185,
    birdsEye = false,
    freeFlight = false,
    keys = {},
    routeIndex = 0,
  ) {
    let gl = this.gl,
      dt = Math.min(0.05, (time - this.last) / 1000 || 0.016);
    this.last = time;
    let smooth = 1 - Math.exp(-14 * dt);
    this.yaw += (orbitYaw - this.yaw) * smooth;
    this.pitch += (orbitPitch - this.pitch) * smooth;
    this.zoom += (zoom - this.zoom) * smooth;
    this.physicsDt = dt;
    let model = this.pose(rover),
      base = model[14],
      angle = rover.a + this.yaw,
      elevation = Math.max(0.16, Math.min(1.1, 0.59 - this.pitch)),
      target = [rover.x, rover.y, base + 25],
      eye;
    if (birdsEye) {
      target = [
        Gale.widthUnits / 2,
        Gale.heightUnits / 2,
        (GALE_TOPOGRAPHY.maxLegend - GALE_TOPOGRAPHY.minLegend) *
          0.5 *
          Gale.unitsPerMeter *
          Gale.terrainScale,
      ];
      eye = [target[0], target[1], target[2] + this.zoom * 2.8];
    } else if (firstPerson) {
      eye = this.referenceCamera
        ? [
            rover.x,
            rover.y,
            this.height(rover.x, rover.y) +
              LandingReference.cameraHeightMeters * Gale.unitsPerMeter,
          ]
        : [rover.x + Math.sin(rover.a) * 15, rover.y - Math.cos(rover.a) * 15, base + 65];
      let p = this.pitch;
      target = [
        eye[0] + Math.sin(angle) * Math.cos(p) * 100,
        eye[1] - Math.cos(angle) * Math.cos(p) * 100,
        eye[2] + Math.sin(p) * 100,
      ];
    } else {
      eye = [
        target[0] - Math.sin(angle) * Math.cos(elevation) * this.zoom,
        target[1] + Math.cos(angle) * Math.cos(elevation) * this.zoom,
        target[2] + Math.sin(elevation) * this.zoom,
      ];
      eye[2] = Math.max(eye[2], this.height(eye[0], eye[1]) + 15);
    }
    if (freeFlight) {
      if (!this.flight) {
        let delta = sub(target, eye);
        this.flight = {
          position: eye.slice(),
          velocity: [0, 0, 0],
          pitchOffset:
            Math.max(-1.35, Math.min(1.35, Math.atan2(delta[2], Math.hypot(delta[0], delta[1])))) -
            this.pitch,
        };
      }
      let flyPitch = Math.max(-1.45, Math.min(1.45, this.pitch + this.flight.pitchOffset));
      updateFreeFlight(this.flight, keys, angle, flyPitch, dt, (x, y) => this.height(x, y));
      eye = this.flight.position.slice();
      target = [
        eye[0] + Math.sin(angle) * Math.cos(flyPitch) * 100,
        eye[1] - Math.cos(angle) * Math.cos(flyPitch) * 100,
        eye[2] + Math.sin(flyPitch) * 100,
      ];
    } else this.flight = null;
    const altitude = Math.max(0, eye[2] - this.height(eye[0], eye[1])) / Gale.unitsPerMeter;
    const overview =
      birdsEye && !freeFlight ? 1 : Math.max(0, Math.min(1, (altitude - 1500) / 6500));
    if (time - this.compassTime > 100) {
      let heading =
        (((((birdsEye && !freeFlight ? this.yaw : angle) * 180) / Math.PI) % 360) + 360) % 360;
      this.compass.style.setProperty('--compass-angle', heading + 'deg');
      this.compassHeading.textContent =
        (Math.round(heading) % 360).toString().padStart(3, '0') + '°';
      this.compassTime = time;
    }
    const fov =
      ((firstPerson ? Math.max(38, Math.min(90, (60 * this.zoom) / 185)) : 52) * Math.PI) / 180;
    let vp = mul(
        perspective(
          fov,
          this.aspect,
          2,
          Math.max(GALE_TOPOGRAPHY.widthMeters, GALE_TOPOGRAPHY.heightMeters) *
            Gale.unitsPerMeter *
            3,
        ),
        lookAt(
          [0, 0, 0],
          sub(target, eye),
          birdsEye && !freeFlight ? [Math.sin(this.yaw), -Math.cos(this.yaw), 0] : [0, 0, 1],
        ),
      ),
      identity = transform(0, 0, 0, 0);
    let light = mul(
      ortho(-190, 190, -190, 190, 1, 900),
      lookAt([rover.x - 410, rover.y - 90, base + 275], [rover.x, rover.y, base]),
    );
    this.renderShadow(model, light);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.77, 0.725, 0.64, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.drawSky(eye, target, birdsEye && !freeFlight, fov);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.viewProjection, false, vp);
    gl.uniformMatrix4fv(this.uniforms.lightProjection, false, light);
    gl.uniform3fv(this.uniforms.eye, eye);
    gl.uniform1f(this.uniforms.overview, overview);
    gl.uniform3fv(
      this.uniforms.terrainElevation,
      new Float32Array([
        Gale.unitsPerMeter * Gale.terrainScale,
        GALE_TOPOGRAPHY.minLegend,
        GALE_TOPOGRAPHY.maxLegend,
      ]),
    );
    let geoAnchor = Gale.mapPoint(...Gale.geo.anchorPixel);
    gl.uniform4fv(
      this.uniforms.geoOrigin,
      new Float32Array([geoAnchor.x, geoAnchor.y, Gale.geo.longitude, Gale.geo.latitude]),
    );
    gl.uniform2fv(this.uniforms.geoScale, new Float32Array(Gale.geoScale));
    gl.uniform3fv(
      this.uniforms['contacts[0]'],
      new Float32Array(this.wheels.flatMap((w) => w.previous)),
    );
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadow);
    gl.uniform1i(this.uniforms.shadowMap, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.surfaceDetail);
    gl.uniform1i(this.uniforms.surfaceDetail, 1);
    this.draw(this.terrain, identity, false, 1);
    this.draw(this.rocks, identity);
    if (this.trackMesh.count) this.draw(this.trackMesh, identity, false, 1);
    if (!firstPerson || freeFlight) {
      this.draw(this.rover, model);
      for (let w of this.wheels) this.draw(w.mesh, w.model);
    }
    if (!this.referenceCamera)
      for (let [i, waypoint] of Gale.climbRoute.entries()) {
        let size = i === routeIndex ? 4 : 2,
          marker = transform(
            waypoint.x,
            waypoint.y,
            this.surface(waypoint.x, waypoint.y) + 5 * size,
            time * 0.00025,
          );
        for (let j of [0, 1, 2, 4, 5, 6, 8, 9, 10]) marker[j] *= size;
        this.draw(this.sample, marker, false, i < routeIndex ? -1 : i === routeIndex ? -2 : -3);
      }
    if (!this.referenceCamera)
      for (let s of samples)
        if (!s.got)
          this.draw(
            this.sample,
            transform(
              s.x,
              s.y,
              this.height(s.x, s.y) + 24 + Math.sin(time * 0.002 + s.id) * 3,
              time * 0.0005,
            ),
          );
    this.fpsFrames++;
    if (time - this.fpsTime > 1000) {
      let fps = Math.round((this.fpsFrames * 1000) / (time - this.fpsTime));
      document.querySelector('#fps').textContent = fps + ' FPS';
      if (fps < 42 && time > 3000) {
        this.slow++;
        if (this.slow >= 2 && this.scale > 1) {
          this.scale = Math.max(1, this.scale - 0.25);
          this.resize();
          this.slow = 0;
        }
      } else this.slow = 0;
      this.fpsFrames = 0;
      this.fpsTime = time;
    }
  }
  renderShadow(model, light) {
    // The chassis can still settle after horizontal movement stops. Include the
    // rendered pose so its shadow uses the same suspension position as the rover.
    const shadowKey = [...model, ...this.wheels.map((w) => w.spin)].join(',');
    if (shadowKey === this.lastShadow) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, 1024, 1024);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.depthProgram);
    gl.uniformMatrix4fv(this.du.viewProjection, false, light);
    this.draw(this.rover, model, true);
    for (const wheel of this.wheels) this.draw(wheel.mesh, wheel.model, true);
    this.lastShadow = shadowKey;
  }
}
function sub(a, b) {
  return a.map((x, i) => x - b[i]);
}
function unit(v) {
  let l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a, b) {
  return a.reduce((n, x, i) => n + x * b[i], 0);
}
function transform(x, y, z, a) {
  let c = Math.cos(a),
    s = Math.sin(a);
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}
function lookAt(eye, target, up = [0, 0, 1]) {
  let z = unit(sub(eye, target)),
    x = unit(cross(up, z)),
    y = cross(z, x);
  return new Float32Array([
    x[0],
    y[0],
    z[0],
    0,
    x[1],
    y[1],
    z[1],
    0,
    x[2],
    y[2],
    z[2],
    0,
    -dot(x, eye),
    -dot(y, eye),
    -dot(z, eye),
    1,
  ]);
}
function perspective(fov, aspect, n, f) {
  let k = 1 / Math.tan(fov / 2);
  return new Float32Array([
    k / aspect,
    0,
    0,
    0,
    0,
    k,
    0,
    0,
    0,
    0,
    (f + n) / (n - f),
    -1,
    0,
    0,
    (2 * f * n) / (n - f),
    0,
  ]);
}
function ortho(l, r, b, t, n, f) {
  return new Float32Array([
    2 / (r - l),
    0,
    0,
    0,
    0,
    2 / (t - b),
    0,
    0,
    0,
    0,
    -2 / (f - n),
    0,
    -(r + l) / (r - l),
    -(t + b) / (t - b),
    -(f + n) / (f - n),
    1,
  ]);
}
function mul(a, b) {
  let o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

// Native grid samples: identical mesh/collision triangles and 18 units per metre.
function buildMappedGround() {
  const m = GALE_TOPOGRAPHY,
    stride = 9;
  // Allocate the final GPU representation directly: the MOLA grid otherwise
  // expands into millions of boxed JS numbers and a second typed-array copy.
  const vertices = new Float32Array(m.columns * m.rows * stride);
  const data = new Float32Array((m.columns - 1) * (m.rows - 1) * 6 * stride);
  for (let y = 0; y < m.rows; y++)
    for (let x = 0; x < m.columns; x++) {
      const px = (x / (m.columns - 1)) * m.widthMeters * Gale.unitsPerMeter * Gale.terrainScale,
        py = (y / (m.rows - 1)) * m.heightMeters * Gale.unitsPerMeter * Gale.terrainScale;
      const h =
        (m.heights[y * m.columns + x] - m.minLegend) * Gale.unitsPerMeter * Gale.terrainScale;
      const dx = (Gale.height(px + 100, py) - Gale.height(px - 100, py)) / 200,
        dy = (Gale.height(px, py + 100) - Gale.height(px, py - 100)) / 200;
      vertices.set(
        [px, py, h, ...unit([-dx, -dy, 1]), ...Gale.materialAt(px, py).color],
        (y * m.columns + x) * stride,
      );
    }
  let offset = 0;
  for (let y = 0; y < m.rows - 1; y++)
    for (let x = 0; x < m.columns - 1; x++) {
      const a = y * m.columns + x,
        b = a + 1,
        c = a + m.columns + 1,
        d = a + m.columns;
      for (const i of [a, b, c, a, c, d]) {
        data.set(vertices.subarray(i * stride, (i + 1) * stride), offset);
        offset += stride;
      }
    }
  return data;
}
// Free-flight movement is frame-rate independent and never changes rover state.
function updateFreeFlight(flight, keys, yaw, pitch, dt, height) {
  let forward =
      (keys.w || keys.W || keys.ArrowUp ? 1 : 0) - (keys.s || keys.S || keys.ArrowDown ? 1 : 0),
    right =
      (keys.d || keys.D || keys.ArrowRight ? 1 : 0) - (keys.a || keys.A || keys.ArrowLeft ? 1 : 0),
    up = (keys.e || keys.E ? 1 : 0) - (keys.q || keys.Q ? 1 : 0);
  let direction = [
    Math.sin(yaw) * Math.cos(pitch) * forward + Math.cos(yaw) * right,
    -Math.cos(yaw) * Math.cos(pitch) * forward + Math.sin(yaw) * right,
    Math.sin(pitch) * forward + up,
  ];
  let length = Math.max(1, Math.hypot(...direction)),
    rate = 1 - Math.exp(-10 * dt);
  for (let i = 0; i < 3; i++) {
    let speed =
      (direction[i] / length) *
      320 *
      Math.max(
        1,
        Math.min(3000, (flight.position[2] - height(flight.position[0], flight.position[1])) / 300),
      );
    flight.velocity[i] += (speed - flight.velocity[i]) * rate;
    flight.position[i] += flight.velocity[i] * dt;
  }
  flight.position[0] = Math.max(30, Math.min(Gale.drivingBounds.maxX, flight.position[0]));
  flight.position[1] = Math.max(30, Math.min(Gale.drivingBounds.maxY, flight.position[1]));
  let floor = height(flight.position[0], flight.position[1]) + 12;
  if (flight.position[2] < floor) {
    flight.position[2] = floor;
    flight.velocity[2] = Math.max(0, flight.velocity[2]);
  }
  flight.position[2] = Math.min(Gale.overviewZoom * 3, flight.position[2]);
}
