// src/pages/ChatPage.jsx
// Dedicated full-screen text chat page with its own isolated chat room
// code state and a scrollable message feed.
import { useEffect, useRef, useState } from 'react';
import { useChat } from '../hooks/useChat';
import { ChatIcon, SendIcon, LogOutIcon, NetworkIcon } from '../components/icons';

export default function ChatPage() {
  const [roomInput, setRoomInput] = useState('');
  const [draft, setDraft] = useState('');
  const feedRef = useRef(null);

  const {
    socketConnected,
    status,
    roomCode,
    messages,
    joined,
    connected,
    error,
    joinRoom,
    connectChat,
    sendMessage,
    leaveChat,
  } = useChat();

  // Auto-scroll to the newest message
  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, [messages]);

  const submitMessage = (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    sendMessage(draft);
    setDraft('');
  };

  return (
    <section className="page chat-page">
      <header className="chat-head">
        <h2 className="chat-title">
          <ChatIcon className="icon" /> Text Chat
        </h2>
        {joined && <span className="room-badge">Room {roomCode}</span>}
        <span className={`status-pill${connected ? ' live' : ''}`}>
          {socketConnected ? status : 'Connecting to server...'}
        </span>
        {joined && (
          <>
            {!connected && (
              <button className="btn connect" onClick={connectChat} type="button">
                <NetworkIcon className="icon" /> Connect Chat
              </button>
            )}
            <button className="btn ghost small" onClick={leaveChat} type="button">
              <LogOutIcon className="icon" /> Leave
            </button>
          </>
        )}
      </header>

      {!joined ? (
        <div className="chat-join">
          <form
            className="join-card"
            onSubmit={(e) => {
              e.preventDefault();
              joinRoom(roomInput);
            }}
          >
            <h2>Join a Chat Room</h2>
            <p>
              Both people enter the same room code. Press “Connect Chat” once
              your peer arrives to open the peer-to-peer data channel.
            </p>
            <input
              className="input"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              placeholder="Enter Chat Room ID"
              autoFocus
              autoComplete="off"
            />
            <button className="btn" type="submit">
              Join Room
            </button>
            {error && <span className="error-text">{error}</span>}
          </form>
        </div>
      ) : (
        <>
          <div className="chat-feed" ref={feedRef}>
            {messages.length === 0 && (
              <p className="chat-empty">
                No messages yet.
                {!connected
                  ? ' Press “Connect Chat” when your peer is ready.'
                  : ' Say hello!'}
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`chat-msg${m.sender === 'You' ? ' me' : ''}`}
              >
                <div className="who">{m.sender}</div>
                <div className="text">{m.text}</div>
              </div>
            ))}
          </div>

          <form className="chat-input-row" onSubmit={submitMessage}>
            <input
              className="input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={connected ? 'Type a message...' : 'Connect Chat to start...'}
              disabled={!connected}
            />
            <button className="btn" type="submit" disabled={!connected || !draft.trim()}>
              <SendIcon className="icon" /> Send
            </button>
          </form>
        </>
      )}
    </section>
  );
}

