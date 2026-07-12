import React, { useState, useEffect, useRef } from "react";
import { getStorage, setEnabled, setDeletedCount, setDebug } from "../utils/storage.js";

export default function App() {
  const canvasRef = useRef(null);
  const [activeTabUrl, setActiveTabUrl] = useState("");
  const [enabled, setEnabledState] = useState(true);
  const [deletedCount, setDeletedCountState] = useState(0);
  const [debug, setDebugState] = useState(false);

  useEffect(() => {
    // 1. Get active tab URL to determine active state
    if (typeof chrome !== "undefined" && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url) {
          setActiveTabUrl(tabs[0].url);
        }
      });
    }

    // 2. Load initial storage values
    const loadState = async () => {
      const state = await getStorage({ enabled: true, deletedCount: 0, debug: false });
      setEnabledState(state.enabled);
      setDeletedCountState(state.deletedCount);
      setDebugState(state.debug);
    };
    loadState();

    // 3. Register Houdini Paint Worklet if supported
    if (typeof CSS !== "undefined" && "paintWorklet" in CSS) {
      CSS.paintWorklet.addModule("paint-worklet.js")
        .catch((err) => console.log("Failed to register Houdini Paint Worklet:", err));
    }

    // 4. Listen for changes in storage (real-time sync)
    const handleStorageChange = (changes, namespace) => {
      if (namespace === "local") {
        if (changes.enabled) {
          setEnabledState(changes.enabled.newValue);
        }
        if (changes.deletedCount) {
          setDeletedCountState(changes.deletedCount.newValue);
        }
        if (changes.debug) {
          setDebugState(changes.debug.newValue);
        }
      }
    };

    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.onChanged.addListener(handleStorageChange);
      return () => {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      };
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return;

    const resizeCanvas = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, canvas.width, canvas.height);
      }
    };
    resizeCanvas();

    const vsSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    const fsSource = `
      precision mediump float;
      uniform vec2 u_resolution;
      uniform float u_time;

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        float t = u_time * 0.4;
        
        float x_warp = sin(uv.y * 3.0 + t) * 0.08 + cos(uv.y * 1.5 - t * 0.5) * 0.04;
        float y_warp = cos(uv.x * 2.5 - t) * 0.08 + sin(uv.x * 2.0 + t * 0.6) * 0.04;
        vec2 warpedUv = uv + vec2(x_warp, y_warp);

        vec3 bg = vec3(0.05, 0.05, 0.08);
        vec3 indigo = vec3(0.25, 0.32, 0.95);
        vec3 pink = vec3(0.92, 0.12, 0.42);
        vec3 violet = vec3(0.55, 0.18, 0.88);

        vec2 p1 = vec2(0.85 + sin(t * 0.8) * 0.15, 0.85 + cos(t * 0.6) * 0.12);
        vec2 p2 = vec2(0.15 + cos(t * 0.7) * 0.15, 0.15 + sin(t * 0.9) * 0.12);
        vec2 p3 = vec2(0.50 + sin(t * 0.5) * 0.20, 0.50 + cos(t * 0.7) * 0.20);

        float d1 = length(warpedUv - p1);
        float d2 = length(warpedUv - p2);
        float d3 = length(warpedUv - p3);

        float glow1 = 1.0 / (1.0 + d1 * d1 * 25.0);
        float glow2 = 1.0 / (1.0 + d2 * d2 * 25.0);
        float glow3 = 1.0 / (1.0 + d3 * d3 * 40.0);

        vec3 color = bg;
        color += indigo * glow1 * 0.30;
        color += pink * glow2 * 0.30;
        color += violet * glow3 * 0.18;

        color = pow(color, vec3(1.1));

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const createShader = (gl, type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      return;
    }

    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1.0, -1.0,
         1.0, -1.0,
        -1.0,  1.0,
        -1.0,  1.0,
         1.0, -1.0,
         1.0,  1.0,
      ]),
      gl.STATIC_DRAW
    );

    const positionLocation = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    const timeLocation = gl.getUniformLocation(program, "u_time");

    let animationFrameId;
    const startTime = performance.now();

    const render = () => {
      resizeCanvas();
      const currentTime = (performance.now() - startTime) / 1000.0;
      
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform1f(timeLocation, currentTime);
      
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      
      animationFrameId = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
    };
  }, []);


  const handleToggle = async () => {
    const nextVal = !enabled;
    setEnabledState(nextVal);
    await setEnabled(nextVal);
  };

  const handleDebugToggle = async () => {
    const nextVal = !debug;
    setDebugState(nextVal);
    await setDebug(nextVal);
  };

  const handleResetCounter = async () => {
    setDeletedCountState(0);
    await setDeletedCount(0);
  };

  const handleOpenHistory = () => {
    if (typeof chrome !== "undefined" && chrome.tabs) {
      chrome.tabs.create({ url: "https://www.youtube.com/feed/history" });
    } else {
      window.open("https://www.youtube.com/feed/history", "_blank");
    }
  };

  const isOnHistoryPage = activeTabUrl.includes("youtube.com/feed/history");

  return (
    <div className="w-[350px] min-h-[420px] p-5 flex flex-col justify-between font-sans select-none relative overflow-hidden bg-[#0f0f15]">
      {/* WebGL Ambient Background */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-0"
      />
      {/* Header section with gradient */}
      <div className="flex flex-col items-center text-center mt-2 z-10">
        <div className="flex items-center gap-2 mb-1">
          <div className="relative">
            <svg
              className="w-8 h-8 text-red-500 animate-pulse transition-all duration-300"
              style={{
                filter: "drop-shadow(0 0 8px rgba(239, 68, 68, var(--glow-strength)))"
              }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-red-500 via-pink-500 to-indigo-400 bg-clip-text text-transparent">
            YT History Quick Delete
          </h1>
        </div>
        <p className="text-xs text-gray-400">Click to instantly remove watch history</p>
      </div>

      {/* Main glass card panel */}
      <div className="glass-panel rounded-2xl p-4 my-4 flex flex-col gap-4 shadow-2xl relative overflow-hidden">
        {/* Toggle Switch Row */}
        <div className="flex items-center justify-between z-10">
          <span className="font-semibold text-sm tracking-wide text-gray-200">
            Extension Status
          </span>
          <button
            onClick={handleToggle}
            className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-all duration-500 ease-spring ${
              enabled ? "bg-indigo-600 shadow-glow-indigo" : "bg-gray-700 shadow-none"
            }`}
            aria-label="Toggle Extension"
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-500 ease-spring ${
                enabled ? "translate-x-6 scale-110" : "translate-x-0 scale-100"
              }`}
            />
          </button>
        </div>

        {/* Debug Switch Row */}
        <div className="flex items-center justify-between z-10">
          <span className="font-semibold text-sm tracking-wide text-gray-200">
            Debug Console Logs
          </span>
          <button
            onClick={handleDebugToggle}
            className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-all duration-500 ease-spring ${
              debug ? "bg-pink-600 shadow-glow-pink" : "bg-gray-700 shadow-none"
            }`}
            aria-label="Toggle Debug Mode"
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-500 ease-spring ${
                debug ? "translate-x-6 scale-110" : "translate-x-0 scale-100"
              }`}
            />
          </button>
        </div>

        {/* Separator line */}
        <div className="h-px bg-white/10 w-full" />

        {/* Status Indicator Panel */}
        <div className="flex items-center gap-3 z-10">
          <div className="relative flex h-3 w-3">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isOnHistoryPage ? "bg-green-400" : "bg-yellow-400"
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-3 w-3 ${
                isOnHistoryPage ? "bg-green-500" : "bg-yellow-500"
              }`}
            />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Active State
            </span>
            <span className="text-sm font-medium text-gray-100">
              {isOnHistoryPage ? "Active on YouTube History" : "Not on History page"}
            </span>
          </div>
        </div>

        {/* Call to action if not on History page */}
        {!isOnHistoryPage && (
          <button
            onClick={handleOpenHistory}
            className="w-full py-2 px-3 mt-1 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-indigo-300 hover:text-indigo-200 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer"
          >
            Open YouTube Watch History
          </button>
        )}
      </div>

      {/* Counter and Footer actions */}
      <div className="flex flex-col gap-3 z-10">
        <div className="flex items-center justify-between px-2">
          <div className="flex flex-col">
            <span className="text-xs text-gray-400 font-medium">Deleted this session</span>
            <span className="text-3xl font-extrabold text-transparent bg-gradient-to-r from-indigo-200 to-indigo-400 bg-clip-text">
              {deletedCount}
            </span>
          </div>
          {deletedCount > 0 && (
            <button
              onClick={handleResetCounter}
              className="text-xs text-red-400/80 hover:text-red-400 font-semibold transition-colors duration-150 cursor-pointer py-1 px-2 hover:bg-red-500/10 rounded-md"
            >
              Reset count
            </button>
          )}
        </div>

        {/* Simple Footer */}
        <div className="text-[10px] text-gray-500 text-center mt-2 border-t border-white/5 pt-2">
          v1.0.0 &bull; YouTube History Quick Delete
        </div>
      </div>
    </div>
  );
}
