// Glowing Neon Fluid Orb Animation matching Pinterest Reference
const canvas = document.getElementById('orbCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('orb-wrapper');

// Hi-DPI scaling
const dpr = window.devicePixelRatio || 1;
canvas.width = 96 * dpr;
canvas.height = 96 * dpr;
ctx.scale(dpr, dpr);

const W = 96;
const H = 96;
const CX = W / 2;
const CY = H / 2;
const BASE_RADIUS = 28;

// Animation & State
let currentState = 'idle'; // 'listening' | 'processing' | 'error' | 'done'
let time = 0;
let voiceEnergy = 0; // 0 to 1 smooth
let animFrameId = null;

// Audio capture
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let audioContext = null;
let analyser = null;
let dataArray = null;

// Audio visualizer setup
function setupAudio(stream) {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    dataArray = new Uint8Array(analyser.frequencyBinCount);
  } catch (err) {
    console.warn('Audio analyser setup failed:', err);
  }
}

// Organic fluid contour drawer
function drawContour(points, color, lineWidth, shadowColor, shadowBlur) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 0; i < points.length; i++) {
    const p0 = points[(i - 1 + points.length) % points.length];
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const p3 = points[(i + 2) % points.length];

    // Catmull-Rom to Cubic Bezier for ultra-smooth fluid curve
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
  ctx.closePath();

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = shadowBlur;
  ctx.stroke();
  ctx.restore();
}

// Render loop at 60 FPS
function render() {
  ctx.clearRect(0, 0, W, H);

  // Update voice energy
  if (analyser && dataArray && currentState === 'listening') {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
    const avg = sum / dataArray.length;
    const target = Math.min(1.0, (avg / 128));
    voiceEnergy += (target - voiceEnergy) * 0.25; // Smooth interpolation
  } else {
    voiceEnergy *= 0.9;
  }

  const speed = currentState === 'processing' ? 0.08 : 0.035;
  time += speed;

  // Determine theme colors based on state
  let primaryGlow = 'rgba(56, 189, 248, 0.9)';   // Electric cyan/blue
  let secondaryGlow = 'rgba(96, 165, 250, 0.7)'; // Neon sky blue
  let coreGlow = 'rgba(14, 165, 233, 0.25)';
  let shadowCol = '#38bdf8';
  let shadowBlurVal = 14 + voiceEnergy * 12;

  if (currentState === 'error') {
    primaryGlow = 'rgba(248, 113, 113, 0.95)';
    secondaryGlow = 'rgba(239, 68, 68, 0.7)';
    coreGlow = 'rgba(239, 68, 68, 0.25)';
    shadowCol = '#ef4444';
  } else if (currentState === 'done') {
    primaryGlow = 'rgba(52, 211, 153, 0.95)';
    secondaryGlow = 'rgba(16, 185, 129, 0.7)';
    coreGlow = 'rgba(16, 185, 129, 0.25)';
    shadowCol = '#10b981';
  }

  // 1. Draw Subtle Translucent Dark Core with Radial Glow
  const coreGrad = ctx.createRadialGradient(CX, CY, 4, CX, CY, BASE_RADIUS + 6);
  coreGrad.addColorStop(0, 'rgba(8, 12, 28, 0.85)');
  coreGrad.addColorStop(0.7, coreGlow);
  coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.save();
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(CX, CY, BASE_RADIUS + 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Draw Layered Organic Contours (Outer membrane & inner swirling fluid folds)
  const numLayers = 4;
  const numSteps = 48;

  for (let l = 0; l < numLayers; l++) {
    const layerOffset = l * 1.6;
    const layerRadius = BASE_RADIUS - l * 3.5;
    const waveAmp = (4.0 + voiceEnergy * 8.5) * (1 - l * 0.18);
    const points = [];

    for (let i = 0; i < numSteps; i++) {
      const theta = (i / numSteps) * Math.PI * 2;

      // Harmonic fluid displacement formulas
      const w1 = Math.sin(theta * 3 + time * 1.5 + layerOffset);
      const w2 = Math.cos(theta * 2 - time * 2.0 + layerOffset);
      const w3 = Math.sin(theta * 5 + time * 3.2);

      const displacement = (w1 * 0.55 + w2 * 0.35 + w3 * 0.1) * waveAmp;
      const r = layerRadius + displacement;

      const px = CX + Math.cos(theta) * r;
      const py = CY + Math.sin(theta) * r;
      points.push({ x: px, y: py });
    }

    if (l === 0) {
      // Outer bright neon rim
      drawContour(points, primaryGlow, 2.2, shadowCol, shadowBlurVal);
    } else if (l === 1) {
      // Secondary glowing fluid fold
      drawContour(points, secondaryGlow, 1.8, shadowCol, shadowBlurVal * 0.7);
    } else {
      // Inner fluid tendrils
      drawContour(points, 'rgba(129, 140, 248, 0.45)', 1.2, shadowCol, 6);
    }
  }

  // 3. Swirling 3D Crescent Highlight (matching the fluid wave fold in Pinterest video)
  ctx.save();
  ctx.beginPath();
  const crescentAngle = time * 2.2;
  const hx = CX + Math.cos(crescentAngle) * (BASE_RADIUS * 0.45);
  const hy = CY + Math.sin(crescentAngle) * (BASE_RADIUS * 0.45);
  ctx.arc(hx, hy, 8 + voiceEnergy * 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.restore();

  animFrameId = requestAnimationFrame(render);
}

// State transitions
function setState(state) {
  currentState = state;
  container.className = `orb-container ${state}`;
}

// Audio Recording Pipeline
async function startRecording() {
  try {
    recordedChunks = [];
    setState('listening');

    if (!mediaStream || !mediaStream.active) {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1, // Mono for voice clarity & optimal file size
          sampleRate: 16000, // Native Whisper acoustic model sample rate
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    }

    setupAudio(mediaStream);

    let mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
      else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
      else mimeType = '';
    }

    const options = {
      mimeType: mimeType || undefined,
      audioBitsPerSecond: 32000 // 32kbps mono Opus = ~14.4MB per hour, fits comfortably under 25MB limit
    };
    mediaRecorder = new MediaRecorder(mediaStream, options);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      if (recordedChunks.length === 0) {
        if (window.overlayApi) window.overlayApi.sendError('No audio recorded');
        return;
      }
      const recordedBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      const arrayBuffer = await recordedBlob.arrayBuffer();
      if (window.overlayApi) window.overlayApi.sendAudio(arrayBuffer, recordedBlob.type);
    };

    mediaRecorder.onerror = (e) => {
      if (window.overlayApi) window.overlayApi.sendError('Mic error: ' + (e.error ? e.error.message : 'Unknown'));
    };

    // 1000ms timeslice allows ultra-long recordings (hours) with low memory footprint
    mediaRecorder.start(1000);
  } catch (err) {
    console.error('Error starting audio recording:', err);
    if (window.overlayApi) {
      window.overlayApi.sendError('Mic error: ' + (err.name === 'NotAllowedError' ? 'Permission Denied' : err.message));
    }
  }
}

function stopRecording() {
  setState('processing');
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}

// IPC Event Listeners from Main Process
if (window.overlayApi) {
  window.overlayApi.onStartRecording(() => {
    startRecording();
  });

  window.overlayApi.onStopRecording(() => {
    stopRecording();
  });

  window.overlayApi.onShowError((_message) => {
    setState('error');
  });

  window.overlayApi.onReset(() => {
    setState('listening');
  });

  window.overlayApi.ready();
}

// Start rendering loop immediately
render();
