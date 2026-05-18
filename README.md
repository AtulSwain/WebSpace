# Private Video and Chat App

A beginner-friendly private video calling and chat application built with:

- Node.js
- Express.js
- Socket.IO
- WebRTC
- HTML, CSS, Vanilla JavaScript

## Features

- Room-based communication
- Real-time video calling
- Real-time voice calling
- Real-time chat with typing indicator
- Screen sharing
- Microphone mute/unmute
- Camera on/off
- Connection status display

## Project Structure

```
project/
│
├── server/
│   └── server.js
│
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── package.json
└── README.md
```

## How it works

1. User opens the website.
2. Browser asks for camera and microphone permission.
3. User enters a username and room ID.
4. Socket.IO joins the room and acts as the signaling server.
5. WebRTC starts creating a peer connection.
6. The first browser sends an SDP offer to the other browser.
7. The second browser sends back an SDP answer.
8. ICE candidates are exchanged so the browsers can find the best network path.
9. Once the peer-to-peer connection is established, real-time audio/video flows directly between browsers.

## Installation

1. Open a terminal in the project folder.
2. Run:

```bash
npm install
```

3. Start the server:

```bash
npm start
```

4. Open `http://localhost:3000` in two browser tabs or two devices.
5. Use the same room ID in both tabs to connect.

## Testing with friends

- Share the same room ID with your friend.
- Both users should open the page and join the same room.
- Camera/microphone permissions must be allowed.
- Chat, video, audio, and screen sharing should work immediately.

## Deployment

### Render

1. Create a new Web Service on Render.
2. Connect your GitHub repository.
3. Set the build command to:

```bash
npm install
```

4. Set the start command to:

```bash
npm start
```

5. Render will publish the app with a public URL.

### Vercel

Vercel is usually used for static sites, but this project uses a Node server with Socket.IO.
If you want to deploy with Vercel, use a custom server or Docker configuration, or prefer Render for socket-based apps.

## Notes

- No database, no login/authentication, no MongoDB, no MySQL, no Firebase.
- The server only handles signaling, chat, and room membership.
- Actual audio/video streams are sent directly between peers with WebRTC.
