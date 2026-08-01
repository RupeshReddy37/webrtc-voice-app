/**
 * Web Audio API based Audio Visualizer
 */
let audioContext;
let analyser;
let source;
let dataArray;
let animationFrameId;

const visualizerContainer = document.getElementById('visualizer-container');
const visualizerBars = document.querySelectorAll('.visualizer-bar');

/**
 * Initializes the AudioContext and AnalyserNode.
 * @param {MediaStream} stream The microphone stream.
 */
export function initVisualizer(stream) {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    source = audioContext.createMediaStreamSource(stream);

    analyser.fftSize = 32;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    source.connect(analyser);
    visualizerContainer.classList.remove('hidden');
    draw();
}

function draw() {
    animationFrameId = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(dataArray);

    let total = 0;
    for (let i = 0; i < visualizerBars.length; i++) {
        const barHeight = (dataArray[i * 2] / 255) * 100;
        visualizerBars[i].style.height = `${Math.max(5, barHeight)}%`;
        total += barHeight;
    }

    // Toggle speaking indicator
    const average = total / visualizerBars.length;
    visualizerContainer.classList.toggle('speaking', average > 15);
}

export function stopVisualizer() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    visualizerContainer.classList.add('hidden');
    if (audioContext && audioContext.state !== 'closed') audioContext.close();
}