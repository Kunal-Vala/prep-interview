import { io } from 'socket.io-client';

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbXA5bmg1dmMwMDAxNWNmNTN1eGxmcWl6IiwiZW1haWwiOiJkZW1vQHByZXBpbnRlcnZpZXcuZGV2IiwiaWF0IjoxNzc5MTg0NDI3LCJleHAiOjE3NzkxODUzMjd9.s4lth5VKq0c1hZlpKUrbWmgYzSlVIE2cfKRNw8njkSw';

const socket = io('http://localhost:4000/interview', {
  auth: { token: `Bearer ${token}` },
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('✅ Connected:', socket.id);
  socket.emit('join-session', { sessionId: 'test-123' });
});

socket.on('next-question', (data) => {
  console.log('📩 next-question received:', data);
  socket.disconnect();
});

socket.on('connect_error', (err) => {
  console.error('❌ Connection error:', err.message);
});

socket.on('exception', (err) => {
  console.error('❌ exception:', err);
});

socket.on('error', (err) => {
  console.error('❌ error:', err);
});
