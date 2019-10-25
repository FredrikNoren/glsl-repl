import React from 'react';
import { CodeMirror } from './CodeMirror';
import './App.css';

export type Result<T, E=string> = ResultOk<T> | ResultError<E>;
export interface ResultOk<T> {
  Ok: T;
}
export interface ResultError<E> {
  Err: E;
}
export function isErr<T, E>(result: Result<T, E>): result is ResultError<E> {
  return result.hasOwnProperty('Err');
}

function shaderFromSource(gl: WebGL2RenderingContext, type: 'vertex' | 'fragment', sourceCode: string): Result<WebGLShader, string> {
  const shader = gl.createShader(type === 'vertex' ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER);
  if (!shader) {
    return { Err: 'Failed to create shader' };
  }
  gl.shaderSource(shader, sourceCode);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    return { Err: gl.getShaderInfoLog(shader) || 'Unknown shader error' };
  }
  return { Ok: shader };
}

function createProgram(gl: WebGL2RenderingContext, shaders: WebGLShader[]): Result<WebGLProgram, string> {
  const program = gl.createProgram();
  if (!program) {
    return { Err: 'Failed to create program' };
  }
  for (const shader of shaders) {
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return { Err: gl.getProgramInfoLog(program) || 'Unknown linking error' };
  }
  return { Ok: program };
}

class TriangleStripMesh {
  private constructor(private gl: WebGL2RenderingContext, positions: Float32Array) {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionsBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    this.nVertices = positions.length / 2;
  }
  bind() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionsBuffer);

    // gl.getAttribLocation(this.program, 'position') should really be used here, but for some reason it doesn't work
    // on windows, whereas this works on both mac and windows.
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
  }
  draw() {
    const gl = this.gl;
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.nVertices);
  }
  positionsBuffer = this.gl.createBuffer();
  nVertices: number;

  static quad(gl: WebGL2RenderingContext) {
    return new TriangleStripMesh(gl, new Float32Array([
      -1, -1,
      -1, 1,
      1, -1,
      1, 1,
    ]));
  }
}

export const QuadVertexShader = `#version 300 es
in vec2 vertexPosition;

void main() {
  gl_Position = vec4(vertexPosition, 0.0, 1.0);
}
`;

function createTexture(gl: WebGL2RenderingContext) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
  return tex;
}

function run(shader: string) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    return 'WebGL2 not available';
  }
  if (!gl.getExtension("EXT_color_buffer_float")) {
    return 'Missing: EXT_color_buffer_float';
  }
  if (!gl.getExtension('OES_texture_float_linear')) {
    return 'Missing: OES_texture_float_linear';
  }
  const quad = TriangleStripMesh.quad(gl);
  const vs = shaderFromSource(gl, 'vertex', QuadVertexShader);
  const fs = shaderFromSource(gl, 'fragment', shader);
  if (isErr(vs)) {
    return vs.Err;
  }
  if (isErr(fs)) {
    return fs.Err;
  }
  const program = createProgram(gl, [vs.Ok, fs.Ok]);
  if (isErr(program)) {
    return program.Err;
  }
  const tex = createTexture(gl);
  const fb = gl.createFramebuffer();
  gl.pixelStorei(gl.PACK_ALIGNMENT, 4);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.viewport(0, 0, 1, 1);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(program.Ok);
  quad.bind();
  quad.draw();
  gl.readBuffer(gl.COLOR_ATTACHMENT0);
  const data = new Float32Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, data);
  return Array.from(data).map(x => '' + x).join(', ');
}

const DefaultShader = `#version 300 es
precision highp float;
out vec4 res;

void main() {
  res = vec4(2.0);
}
`

function App() {
  const [shader, setShader] = React.useState(DefaultShader);
  const [result, setResult] = React.useState('');
  React.useEffect(() => {
    setResult(run(shader));
  }, [shader]);
  return (
    <div className="App">
      <CodeMirror
        value={shader}
        onChange={setShader}
        options={{
          theme: 'one-dark',
          mode: 'clike'
        }}
        />
      <div className="Header">
        glsl-repl by <a href="https://twitter.com/jfnoren">@jfnoren</a>. Find it useful? <a href="https://www.patreon.com/fredriknoren">Become a Patron!</a>
      </div>
      <div className="Result">{result}</div>
    </div>
  );
}

export default App;
