/**
 * Legacy storage.ts — retained for backward compatibility.
 *
 * The room system has been migrated to /services/rooms.ts
 * which supports multiple photos, custom room names, and more.
 *
 * This file re-exports the new types and functions so that
 * any existing imports of @/services/storage still work.
 */

export type {
  Room as SavedRoom,
  Room,
  RoomType,
  CreateRoomInput,
  UpdateRoomInput,
} from './rooms';

export {
  getRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
  addRoomPhoto,
  removeRoomPhoto,
  setRoomPrimaryPhoto,
  ROOM_TYPES,
} from './rooms';