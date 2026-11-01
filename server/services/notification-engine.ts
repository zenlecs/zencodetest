import { storage } from "../storage";
import { pushRealtimeNotification } from "../websocket";
import { log } from "../index";

export type NotificationType = "system_update" | "chat_message" | "wallet_alert" | "security_alert" | "system_alert";

export interface NotificationPayload {
  type: NotificationType;
  title?: string;
  message?: string;
  icon?: string;
  metadata?: Record<string, any>;
}

export class NotificationEngine {
  
  /**
   * Dispatches a notification to a specific user.
   * Saves it to the database and pushes via WebSocket if the user is online.
   */
  static async dispatch(userId: number, payload: NotificationPayload) {
    try {
      // 1. Create it in the database
      const notification = await storage.createNotification({
        userId,
        type: payload.type,
        title: payload.title || this.getDefaultTitle(payload.type),
        message: payload.message || "Yeni bir bildiriminiz var.",
        icon: payload.icon || this.getDefaultIcon(payload.type),
        isRead: false,
        metadata: payload.metadata || {}
      });

      // 2. Push real-time over WebSocket
      pushRealtimeNotification(userId, notification);
      
      return notification;
    } catch (error) {
      log(`Failed to dispatch notification: ${error}`, "notification-engine");
      throw error;
    }
  }

  /**
   * Broadcasts a notification to multiple users.
   */
  static async broadcast(userIds: number[], payload: NotificationPayload) {
    const promises = userIds.map(id => this.dispatch(id, payload));
    await Promise.allSettled(promises);
  }

  private static getDefaultTitle(type: NotificationType): string {
    switch(type) {
      case "system_update": return "Sistem Güncellemesi";
      case "chat_message": return "Yeni Mesaj";
      case "wallet_alert": return "Cüzdan Bildirimi";
      case "security_alert": return "Güvenlik Uyarısı";
      case "system_alert": return "Sistem Uyarı";
      default: return "Bildirim";
    }
  }

  private static getDefaultIcon(type: NotificationType): string {
    switch(type) {
      case "system_update": return "update";
      case "chat_message": return "message";
      case "wallet_alert": return "wallet";
      case "security_alert": return "shield";
      case "system_alert": return "alert";
      default: return "bell";
    }
  }
}
