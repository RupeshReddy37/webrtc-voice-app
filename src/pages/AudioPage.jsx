// src/pages/AudioPage.jsx
// Dedicated full-screen audio-only call page with its own isolated
// audio room code state and live waveform visualizer.
import { useEffect, useRef, useState } from 'react';
import { useAudioCall } from '../hooks/useAudioCall';
import AudioVisualizer from '../components/AudioVisualizer';

// Tiny helper: attaches a remote MediaStream to an <audio> element.
function RemoteAudio({ stream }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el && stream) {
      if (el.srcObject !== stream) el.srcObject = stream;
      el.play().catch(() => {});
    }
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline className="remote-audio" />;
}

export default function AudioPage() {
  const [roomInput, setRoomInput] = useState('');
  const {
    socketConnected,
    phase,
    status,
    roomCode,
    localStream,
    remoteStream,
    muted,
    error,
    joinRoom,
    leaveRoom,
    startCall,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
  } = useAudioCall();

  const inCall = phase === 'in-call';
  const active = phase === 'calling' || inCall;

  return (
    <section className="page audio-page">
      {/* Incoming call overlay */}
      {phase === 'incoming' && (
        <div className="call-overlay">
          <div className="call-card">
            <div className="avatar ringing">🎙️</div>
            <h2>Incoming Audio Call</h2>
            <p className="call-room">Room {roomCode}</p>
            <div className="call-row">
              <button className="btn danger" onClick={declineCall} type="button">
                ✕ Decline
              </button>
              <button className="btn" onClick={answerCall} type="button">
                ✓ Answer
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="audio-center">
        <div className={`avatar${active ? ' live' : ''}`}>🎙️</div>

        <div className="visualizer-wrap">
          <AudioVisualizer stream={localStream} active={active} />
        </div>

        <span className={`status-pill${active ? ' live' : ''}`}>
          {socketConnected ? status : 'Connecting to server...'}
        </span>
        {error && <span className="error-text">{error}</span>}
      </div>

      <div className="audio-controls">
        {/* Idle: join form */}
        {phase === 'idle' && (
          <form
            className="room-form"
            onSubmit={(e) => {
              e.preventDefault();
              joinRoom(roomInput);
            }}
          >
            <input
              className="input"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              placeholder="Enter Audio Room ID"
              autoFocus
              autoComplete="off"
            />
            <button className="btn" type="submit">
              Join
            </button>
          </form>
        )}

        {/* Waiting / ready */}
        {(phase === 'waiting' || phase === 'ready') && (
          <div className="room-form">
            <span className="room-badge">🎙️ Room {roomCode}</span>
            {phase === 'ready' && (
              <button className="btn" onClick={startCall} type="button">
                📞 Dial Call
              </button>
            )}
            <button className="btn ghost" onClick={leaveRoom} type="button">
              Leave
            </button>
          </div>
        )}

        {/* Calling */}
        {phase === 'calling' && (
          <div className="room-form">
            <span className="status-pill">📞 Calling...</span>
            <button className="btn danger" onClick={endCall} type="button">
              End
            </button>
          </div>
        )}

        {/* In-call controls */}
        {inCall && (
          <div className="call-controls-row">
            <button
              className={`ctl-btn${muted ? ' off' : ''}`}
              onClick={toggleMute}
              type="button"
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? '🔇' : '🎙️'}
            </button>
            <button className="ctl-btn end" onClick={endCall} type="button" title="End call">
              📵
            </button>
          </div>
        )}
      </div>

      <RemoteAudio stream={remoteStream} />
    </section>
  );
}
