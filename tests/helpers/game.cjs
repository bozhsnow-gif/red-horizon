'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sourceRoot = path.resolve(__dirname, '../../src');
const html = fs.readFileSync(path.join(sourceRoot, 'index.html'), 'utf8');

function createGame({
  measuredData,
  renderer = false,
  routeTerrain = false,
  molaBackground = false,
  storageError,
} = {}) {
  const elements = new Map(),
    windowEvents = new Map(),
    documentEvents = new Map();
  const uniforms = {},
    draws = [];
  let now = 1000,
    focused = null,
    playCalls = 0,
    playResult = () => Promise.resolve();
  let nextObject = 1,
    reloads = 0;
  const gl = new Proxy(
    {
      FRAMEBUFFER_COMPLETE: 1,
      getShaderParameter: () => true,
      getProgramParameter: () => true,
      checkFramebufferStatus: () => 1,
      getUniformLocation: (_, name) => name,
      uniformMatrix4fv(name, transpose, values) {
        assert(Array.from(values).every(Number.isFinite), `Finite ${name} matrix`);
        uniforms[name] = Array.from(values);
      },
      uniform1f: (name, value) => (uniforms[name] = value),
      uniform1i: (name, value) => (uniforms[name] = value),
      uniform2fv: (name, values) => (uniforms[name] = Array.from(values)),
      uniform3fv: (name, values) => (uniforms[name] = Array.from(values)),
      uniform4fv: (name, values) => (uniforms[name] = Array.from(values)),
      drawArrays(mode, start, count) {
        assert(count >= 0 && count % 3 === 0, 'Whole triangles submitted');
        draws.push(count);
      },
    },
    {
      get: (object, key) =>
        key in object ? object[key] : key.startsWith('create') ? () => nextObject++ : () => {},
    },
  );
  const context2d = new Proxy(
    { measureText: (text) => ({ width: text.length * 5.5 }) },
    { get: (object, key) => (key in object ? object[key] : () => {}) },
  );
  function addListener(listeners, name, fn) {
    if (!listeners.has(name)) listeners.set(name, []);
    listeners.get(name).push(fn);
  }
  function dispatch(listeners, name, event = {}) {
    const e = {
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {},
      ...event,
    };
    return Promise.all((listeners.get(name) || []).map((fn) => fn(e)));
  }
  function element(id) {
    if (!elements.has(id)) {
      const listeners = new Map(),
        classes = new Set(),
        attributes = new Map();
      const tag =
        html.match(new RegExp('<([a-z]+)[^>]*id="' + id.replace(/^#/, '') + '"', 'i'))?.[1] ||
        'div';
      const el = {
        id: id.replace(/^#/, ''),
        tagName: tag.toUpperCase(),
        isContentEditable: false,
        style: {
          setProperty(name, value) {
            this[name] = value;
          },
        },
        dataset: {},
        textContent: '',
        innerHTML: '',
        hidden: false,
        paused: true,
        currentTime: 0,
        disabled: false,
        files: [],
        value: '',
        open: false,
        classList: {
          add: (c) => classes.add(c),
          remove: (c) => classes.delete(c),
          contains: (c) => classes.has(c),
          toggle(c, force) {
            const set = force ?? !classes.has(c);
            if (set) classes.add(c);
            else classes.delete(c);
            return set;
          },
        },
        setAttribute: (name, value) => attributes.set(name, String(value)),
        getAttribute: (name) => attributes.get(name) ?? null,
        removeAttribute: (name) => attributes.delete(name),
        addEventListener: (name, fn) => addListener(listeners, name, fn),
        emit(name, event = {}) {
          return dispatch(listeners, name, { target: this, currentTarget: this, ...event });
        },
        click() {
          const e = { target: this, currentTarget: this, preventDefault() {} };
          this.onclick?.(e);
          return this.emit('click', e);
        },
        focus() {
          focused = id;
          sandbox.document.activeElement = this;
        },
        scrollIntoView() {
          this.scrolledIntoView = true;
        },
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
          this.emit('close');
        },
        play() {
          playCalls++;
          const result = playResult();
          result.then(
            () => {
              this.paused = false;
              this.emit('playing');
            },
            () => {},
          );
          return result;
        },
        pause() {
          this.paused = true;
          this.emit('pause');
        },
        matches(selector) {
          return selector
            .toUpperCase()
            .split(',')
            .map((s) => s.trim())
            .includes(this.tagName);
        },
        closest(selector) {
          return this.matches(selector) ? this : null;
        },
        getContext: (type) => (type === 'webgl2' ? gl : context2d),
        getBoundingClientRect: () => ({ width: 1000, height: 650, left: 0, top: 0 }),
        setPointerCapture() {},
        releasePointerCapture() {},
        clientHeight: 650,
      };
      elements.set(id, el);
    }
    return elements.get(id);
  }
  const touchButtons = [...html.matchAll(/data-key="([^"]+)"/g)].map((match, i) => {
    const el = element('#touch-' + i);
    el.dataset.key = match[1];
    el.tagName = 'BUTTON';
    return el;
  });
  const storage = {
    getItem() {
      if (storageError) throw storageError;
      return measuredData ? JSON.stringify(measuredData) : null;
    },
    setItem() {},
  };
  const sandbox = {
    console,
    performance: { now: () => now },
    devicePixelRatio: 1,
    requestAnimationFrame() {},
    setTimeout() {},
    clearTimeout() {},
    document: {
      querySelector: element,
      querySelectorAll: (selector) => (selector === '[data-key]' ? touchButtons : []),
      documentElement: { dataset: {} },
      body: { style: { overflow: 'auto' } },
      hidden: false,
      visibilityState: 'visible',
      activeElement: null,
      addEventListener: (name, fn) => addListener(documentEvents, name, fn),
    },
    window: {
      addEventListener: (name, fn) => addListener(windowEvents, name, fn),
      location: {
        reload() {
          reloads++;
        },
      },
    },
    localStorage: storage,
  };
  vm.createContext(sandbox);
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/type="module"/.test(script[1])) continue;
    const src = script[1].match(/src="([^"]+)"/)?.[1];
    let code =
      src === 'route-dem-data.js' && !routeTerrain
        ? 'const ROUTE_DEM_DATA=null;'
        : src
          ? fs.readFileSync(path.join(sourceRoot, src), 'utf8')
          : script[2];
    if (!molaBackground && src === 'mola-background.js') code = 'const MOLA_BACKGROUND_DATA=null;';
    if (!renderer && src === 'ares4-mesh.js') code = 'const ARES4_MESH=[];';
    if (src === 'astronaut-mesh.js') code = 'const ASTRONAUT_MESH=[];';
    if (!renderer && src === 'renderer.js')
      code =
        'class MarsRenderer { constructor(){this.frames=0;this.wheels=[];this.yaw=0;this.pitch=0;this.zoom=185} resize(){} resetPose(){} resetMotion(){} render(){this.frames++} surface(x,y){return Gale.height(x,y)} }';
    vm.runInContext(code, sandbox, { filename: src || 'index.html' });
  }
  vm.runInContext('graphics.astronautView = { loaded: true, draw() {} };', sandbox);
  return {
    sandbox,
    element,
    elements,
    uniforms,
    draws,
    gl,
    touchButtons,
    evaluate: (source) => vm.runInContext(source, sandbox),
    windowEvent: (name, event) => dispatch(windowEvents, name, event),
    documentEvent: (name, event) => dispatch(documentEvents, name, event),
    setTime: (value) => (now = value),
    setPlay: (fn) => (playResult = fn),
    get playCalls() {
      return playCalls;
    },
    get focused() {
      return focused;
    },
    get reloads() {
      return reloads;
    },
  };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
module.exports = { createGame, flush, sourceRoot, html };
