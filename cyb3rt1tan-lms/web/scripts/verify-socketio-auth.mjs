import { io } from 'socket.io-client';

const socket = io('http://127.0.0.1:8100', {
  path: '/socket.io',
  transports: ['websocket'],
  extraHeaders: { Origin: 'http://127.0.0.1:3100' },
  reconnection: false,
  timeout: 5000,
});

const timeout = setTimeout(() => {
  socket.disconnect();
  console.error('FAIL: Socket.IO sessionless authentication check timed out.');
  process.exitCode = 1;
}, 6000);

socket.once('connect_error', (error) => {
  clearTimeout(timeout);
  socket.disconnect();
  if (error.message === 'Connection rejected by server') {
    console.log('PASS: sessionless Socket.IO connection rejected by namespace authentication.');
  } else {
    console.error('FAIL: Socket.IO transport did not reach namespace authentication.');
    process.exitCode = 1;
  }
});

socket.once('connect', () => {
  clearTimeout(timeout);
  socket.disconnect();
  console.error('FAIL: Socket.IO accepted a connection without a session cookie.');
  process.exitCode = 1;
});
