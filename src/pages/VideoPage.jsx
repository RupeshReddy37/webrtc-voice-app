// src/pages/VideoPage.jsx
// Dedicated full-screen video call page with its own isolated video
// room code state. Remote video fills the stage (object-fit: cover),
// local preview floats as a 16:9 PiP, and a translucent control bar
// floats at the bottom center.
import { useEffect, useRef, useState } from 'react';
import { useVideoCall } from '../hooks/useVideoCall';
import {
  MicIcon,
  MicOffIcon,
  CameraIcon,
  CameraOffIcon,
  PhoneOffIcon,
  CheckIcon,
  XIcon,
  LogOutIcon,
} from '../components/icons';

export default function VideoPage() {
  const [roomInput, setRoomInput] = useState('');
  const localRef = useRef(null);
  const remoteRef = useRef(null);

  const {
    socketConnected,
    phase,
    status,
    roomCode,
    localStream,
    remoteStream,
    muted,
    cameraOn,
    error,
    joinRoom,
    leaveRoom,
    startCall,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    toggleCamera,
  } = useVideoCall();

  // Attach the local camera preview
  useEffect(() => {
    const el = localRef.current;
    if (el) el.srcObject = localStream || null;
  }, [localStream]);

  // Attach the remote stream (track-swallow fix + autoplay fallback)
  useEffect(() => {
    const el = remoteRef.current;
    if (!el || !remoteStream) return;
    if (el.srcObject !== remoteStream) el.srcObject = remoteStream;
    const p = el.play();
    if (p) {
      p.catch((err) => {
        if (err.name === 'AbortError') return;
        console.warn('Autoplay blocked. Retrying muted playback:', err);
        el.muted = true;
        el.play();
      });
    }
  }, [remoteStream]);

  const inCall = phase === 'calling' || phase === 'in-call';

  return (
    <section className="page video-page">
      {/* Remote video fills the entire stage */}
      <video
        ref={remoteRef}
        className="remote-stage"
        autoPlay
        playsInline
        onLoadedMetadata={() => {
          // Log the rendered display size (clientWidth/clientHeight) and the
          // actual source resolution (videoWidth/videoHeight) as soon as the
          // remote video metadata loads.
          const el = remoteRef.current;
          if (!el) return;
          console.log(
            `[RemoteVideo] Metadata loaded - display ${el.clientWidth}x${el.clientHeight}px | source ${el.videoWidth}x${el.videoHeight}px`
          );
        }}
      />
      <div className="stage-vignette" aria-hidden="true" />

      {/* Room badge */}
      {phase !== 'idle' && (
        <div className="stage-topbar">
          <span className="room-badge">
            <CameraIcon className="icon" /> Room {roomCode}
          </span>
        </div>
      )}

      {/* Local self-view PiP */}
      {localStream && <video ref={localRef} className="pip" autoPlay playsInline muted />}

      {/* Idle: join form */}
      {phase === 'idle' && (
        <div className="stage-join">
          <form
            className="join-card"
            onSubmit={(e) => {
              e.preventDefault();
              joinRoom(roomInput);
            }}
          >
            <h2>Start a Video Call</h2>
            <p>Enter a room code — the person you call enters the same code.</p>
            <input
              className="input"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              placeholder="Enter Video Room ID"
              autoFocus
              autoComplete="off"
            />
            <button className="btn" type="submit">
              Join Room
            </button>
            {error && <span className="error-text">{error}</span>}
          </form>
        </div>
      )}

      {/* Waiting / ready status */}
      {(phase === 'waiting' || phase === 'ready') && (
        <div className="stage-join">
          <div className="join-card center">
            <span className={`status-pill${phase === 'ready' ? ' live' : ''}`}>
              {socketConnected ? status : 'Connecting to server...'}
            </span>
            {phase === 'ready' && (
              <button className="btn" onClick={startCall} type="button">
                Start Video Call
              </button>
            )}
            <button className="btn ghost" onClick={leaveRoom} type="button">
              Leave Room
            </button>
            {error && <span className="error-text">{error}</span>}
          </div>
        </div>
      )}

      {/* Incoming call overlay */}
      {phase === 'incoming' && (
        <div className="call-overlay">
          <div className="call-card">
            <div className="avatar ringing">
              <CameraIcon className="icon" />
            </div>
            <h2>Incoming Video Call</h2>
            <p className="call-room">Room {roomCode}</p>
            <div className="call-row">
              <button className="btn danger" onClick={declineCall} type="button">
                <XIcon className="icon" /> Decline
              </button>
              <button className="btn success" onClick={answerCall} type="button">
                <CheckIcon className="icon" /> Answer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating translucent control bar */}
      {inCall && (
        <div className="control-bar">
          <button
            className={`ctl-btn${muted ? ' off' : ''}`}
            onClick={toggleMute}
            type="button"
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <MicOffIcon className="icon" /> : <MicIcon className="icon" />}
          </button>
          <button
            className={`ctl-btn${cameraOn ? '' : ' off'}`}
            onClick={toggleCamera}
            type="button"
            title={cameraOn ? 'Turn camera off' : 'Turn camera on'}
          >
            {cameraOn ? <CameraIcon className="icon" /> : <CameraOffIcon className="icon" />}
          </button>
          <button className="ctl-btn end" onClick={endCall} type="button" title="End call">
            <PhoneOffIcon className="icon" />
          </button>
        </div>
      )}

      {error && phase !== 'idle' && (
        <span className="error-text stage-error">{error}</span>
      )}
    </section>
  );
}
