// Floating Pill Overlay Logic
const pillContainer = document.getElementById('pill-container');
const statusText = document.getElementById('status-text');
const bars = document.querySelectorAll('.waveform .bar');

let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let audioContext = null;
let analyser = null;
let visualizerAnimationId = null;

// Initialize Web Audio API visualizer
function setupVisualizer(stream) {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 32;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function updateBars() {
      if (!analyser) return;
      analyser.getByteFrequencyData(dataArray);

      // Select 5 frequency sample points
      const sampleIndices = [1, 3, 5, 7, 9];
      bars.forEach((bar, i) => {
        const value = dataArray[sampleIndices[i]] || 0;
        // Scale from 0-255 to 4px - 18px
        const height = Math.max(4, Math.min(18, (value / 255) * 18));
        bar.style.height = `${height}px`;
      });

      visualizerAnimationId = requestAnimationFrame(updateBars);
    }

    updateBars();
  } catch (err) {
    console.warn('Audio visualizer setup failed:', err);
  }
}

function stopVisualizer() {
  if (visualizerAnimationId) {
    cancelAnimationFrame(visualizerAnimationId);
    visualizerAnimationId = null;
  }
  bars.forEach(bar => {
    bar.style.height = '4px';
  });
}

function setState(state, text) {
  pillContainer.className = `pill state-${state}`;
  if (text) {
    statusText.textContent = text;
  }
}

async function startRecording() {
  try {
    recordedChunks = [];
    setState('listening', 'Listening...');

    // Request microphone access
    if (!mediaStream || !mediaStream.active) {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    }

    setupVisualizer(mediaStream);

    // Determine supported mimeType
    let mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else {
        mimeType = '';
      }
    }

    const options = mimeType ? { mimeType } : undefined;
    mediaRecorder = new MediaRecorder(mediaStream, options);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      stopVisualizer();
      if (recordedChunks.length === 0) {
        window.overlayApi.sendError('No audio recorded');
        return;
      }

      const recordedBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      const arrayBuffer = await recordedBlob.arrayBuffer();
      window.overlayApi.sendAudio(arrayBuffer, recordedBlob.type);
    };

    mediaRecorder.onerror = (e) => {
      stopVisualizer();
      window.overlayApi.sendError('Microphone recording error: ' + (e.error ? e.error.message : 'Unknown'));
    };

    mediaRecorder.start(100); // collect in 100ms slices
  } catch (err) {
    stopVisualizer();
    console.error('Error starting audio recording:', err);
    window.overlayApi.sendError('Mic error: ' + (err.name === 'NotAllowedError' ? 'Permission Denied' : err.message));
  }
}

function stopRecording() {
  setState('processing', 'Transcribing...');
  stopVisualizer();

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

  window.overlayApi.onShowError((message) => {
    stopVisualizer();
    setState('error', message || 'Error');
  });

  window.overlayApi.onReset(() => {
    stopVisualizer();
    setState('listening', 'Listening...');
  });

  window.overlayApi.ready();
}
