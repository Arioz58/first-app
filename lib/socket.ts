import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './storage';

const BASE_URL = 'http://172.29.121.35:3000';

let socket: Socket | null = null;

export const connectSocket = async (): Promise<Socket> => {
  if (socket?.connected) return socket;

  const token = await getAccessToken();

  socket = io(BASE_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
  });

  socket.on('connect', () => console.log('[Socket] Connecté'));
  socket.on('disconnect', () => console.log('[Socket] Déconnecté'));
  socket.on('error', (err: { message: string }) => console.warn('[Socket] Erreur:', err.message));

  return socket;
};

export const getSocket = (): Socket | null => socket;

export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};
