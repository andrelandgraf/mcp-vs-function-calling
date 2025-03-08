/* WebSocket client for the Home Assistant server */
import { WebSocket } from "ws";
import EventEmitter from "node:events";
import { clearInterval, setInterval } from "timers";

export type HassArea = {
  area_id: string; // unique name
  floor_id: string | null;
  name: string;
};

export type HassDevice = {
  area_id: string | null;
  id: string; // uuid
  manufacturer: string | null;
  model: string | null; // string not always usable
  name: string;
  name_by_user: string | null;
};

export type HassEntity = {
  device_id: string | null;
  entity_id: string; // unique name
};

export type HassEntityState = {
  s: string | "on" | "off" | "unavailable" | "not_home" | "home" | "unknown"; // state, number is string
  a: {
    [key: string]: unknown; // attributes
  };
};

export type HassHueLightEntityState = HassEntityState & {
  s: "on" | "off" | "unavailable";
  a: {
    color_mode: "color_temp" | string | null;
    brightness: number | null;
    color_temp_kelvin: number | null;
    color_temp: number | null;
    hs_color: number[] | null;
    rgb_color: number[] | null;
    xy_color: number[] | null;
  };
};

/**
 * Message types that Home Assistant server sends to the client
 */
const SERVER_MESSAGE_TYPES = {
  AUTH_REQUIRED: "auth_required",
  AUTH_OK: "auth_ok",
  AUTH_INVALID: "auth_invalid",
  RESULT: "result",
  EVENT: "event",
} as const;

/**
 * Message types that the client can send to the Home Assistant server
 */
const CLIENT_MESSAGE_TYPES = {
  AUTH: "auth",
  SUBSCRIBE_ENTITIES: "subscribe_entities",
  CALL_SERVICE: "call_service",
  GET_AREA_REGISTRY: "config/area_registry/list",
  GET_DEVICE_REGISTRY: "config/device_registry/list",
  GET_ENTITY_REGISTRY: "config/entity_registry/list",
} as const;

export type ClientMessageType =
  (typeof CLIENT_MESSAGE_TYPES)[keyof typeof CLIENT_MESSAGE_TYPES];
export type ServerMessageType =
  (typeof SERVER_MESSAGE_TYPES)[keyof typeof SERVER_MESSAGE_TYPES];

export class HomeAssistantWebSocketClient {
  private connectionUrl: string;
  private token: string;
  private socket: WebSocket | null = null;
  private shouldLog: boolean;
  private runningId = 1;
  private refetchInterval: ReturnType<typeof setInterval> | null = null;
  private ids = {
    areas: 0,
    devices: 0,
    entities: 0,
    entityStates: 0,
  };
  eventEmitter = new EventEmitter<{
    areas: [HassArea[]];
    devices: [HassDevice[]];
    entities: [HassEntity[]];
    entity_states: [Record<string, HassEntityState>];
    entity_state_change: [Record<string, { "+": HassEntityState }>];
  }>();

  constructor(
    host: string,
    token: string,
    { isSecure = false, shouldLog = false } = {},
  ) {
    const protocol = isSecure ? "wss" : "ws";
    this.connectionUrl = `${protocol}://${host}/api/websocket`;
    this.token = token;
    this.shouldLog = shouldLog;
  }

  private log(message: string, ...args: unknown[]) {
    if (this.shouldLog) {
      console.log(`HomeAssistantWebSocketClient: ${message}`, ...args);
    }
  }

  connect() {
    this.log("Connecting to Home Assistant WS server...");
    if (this.socket) {
      throw new Error("Socket unexpectedly already connected");
    }

    this.runningId = 1;
    const socket = new WebSocket(this.connectionUrl);

    socket.onopen = () => {
      this.log("Connected to server");
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data.toString());
      const serverMessageType = data.type;
      this.log("Received message from Home Assistant: ", serverMessageType);

      if (serverMessageType === SERVER_MESSAGE_TYPES.AUTH_REQUIRED) {
        socket.send(
          JSON.stringify({
            type: CLIENT_MESSAGE_TYPES.AUTH,
            access_token: this.token,
          }),
        );
        return;
      }

      if (serverMessageType === SERVER_MESSAGE_TYPES.AUTH_INVALID) {
        console.error("Authentication failed. Closing connection.");
        socket.close();
        return;
      }

      if (serverMessageType === SERVER_MESSAGE_TYPES.AUTH_OK) {
        this.log("Authentication successful.");
        this.sendDataRequests();
        return;
      }

      if (serverMessageType === SERVER_MESSAGE_TYPES.RESULT) {
        if (data.error) {
          console.error("Error result: ", data.error);
          return;
        }
        if (data.id === this.ids.areas) {
          this.log("Received areas result", data.result.length);
          this.eventEmitter.emit("areas", data.result);
          return;
        }
        if (data.id === this.ids.devices) {
          this.log("Received devices result", data.result.length);
          this.eventEmitter.emit("devices", data.result);
          return;
        }
        if (data.id === this.ids.entities) {
          this.log("Received entities result", data.result.length);
          this.eventEmitter.emit("entities", data.result);
          return;
        }
        if (data.id === this.ids.entityStates) {
          this.log("Successfully subscribed to entities");
          return;
        }
        return;
      }

      if (serverMessageType === SERVER_MESSAGE_TYPES.EVENT) {
        if ("a" in data.event) {
          this.log("Received entities event", Object.keys(data.event.a));
          this.eventEmitter.emit("entity_states", data.event.a);
          return;
        }
        if ("c" in data.event) {
          this.log("Received entities change event", Object.keys(data.event.c));
          this.eventEmitter.emit("entity_state_change", data.event.c);
          return;
        }
        return;
      }
    };

    socket.onclose = () => {
      this.log("Disconnected from server");
    };
    this.socket = socket;

    const threeMinutesInMs = 3 * 60 * 1000;
    this.refetchInterval = setInterval(() => {
      if (this.socket) {
        this.sendDataRequests();
      } else if (this.refetchInterval) {
        clearInterval(this.refetchInterval);
      }
    }, threeMinutesInMs);
  }

  close() {
    if (this.socket) {
      if (this.refetchInterval) {
        clearInterval(this.refetchInterval);
      }
      this.socket.close();
    }
  }

  private send(type: ClientMessageType, payload?: object) {
    if (!this.socket) {
      throw new Error("Socket is not connected");
    }
    const id = this.runningId;
    const message = { ...payload, type, id };
    this.log("Sending ws message to Home Assistant: ", message);
    this.socket.send(JSON.stringify(message));
    this.runningId =
      this.runningId + 1 >= Number.MAX_SAFE_INTEGER ? 1 : this.runningId + 1;
    return id;
  }

  private sendDataRequests() {
    if (!this.socket) {
      throw new Error(
        "Attempting to sendDataRequests but socket is not connected",
      );
    }
    this.ids.areas = this.send(CLIENT_MESSAGE_TYPES.GET_AREA_REGISTRY);
    this.ids.devices = this.send(CLIENT_MESSAGE_TYPES.GET_DEVICE_REGISTRY);
    this.ids.entities = this.send(CLIENT_MESSAGE_TYPES.GET_ENTITY_REGISTRY);
    this.ids.entityStates = this.send(CLIENT_MESSAGE_TYPES.SUBSCRIBE_ENTITIES);
  }

  sendToggleLight(entityId: string) {
    this.log("Sending toggle light");
    this.send(CLIENT_MESSAGE_TYPES.CALL_SERVICE, {
      domain: "light",
      service: "toggle",
      service_data: { entity_id: entityId },
    });
  }

  sendTurnOnLight(entityId: string, data?: { brightness?: number }) {
    this.log("Sending turn on light");
    this.send(CLIENT_MESSAGE_TYPES.CALL_SERVICE, {
      domain: "light",
      service: "turn_on",
      service_data: { entity_id: entityId, ...data },
    });
  }

  sendTurnOffLight(entityId: string) {
    this.log("Sending turn off light");
    this.send(CLIENT_MESSAGE_TYPES.CALL_SERVICE, {
      domain: "light",
      service: "turn_off",
      service_data: { entity_id: entityId },
    });
  }
}
