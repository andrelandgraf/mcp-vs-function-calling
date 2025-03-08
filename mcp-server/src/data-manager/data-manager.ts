import {
  EntityTypes,
  getBrightnessPercentage,
  getBrightnessValue,
  getLightState,
  getRBGColor,
  type Light,
  type HomeAssistantData,
} from "./data";
import {
  type HassArea,
  type HassDevice,
  type HassEntity,
  type HassEntityState,
  HomeAssistantWebSocketClient,
} from "../hass-ws-client/client";

function getStateEntityDeviceForEntityId(
  entityId: string,
  devices: HassDevice[],
  entities: HassEntity[],
  entityStates: Record<string, HassEntityState>,
) {
  const state = entityStates[entityId];
  const entity = entities.find((e) => e.entity_id === entityId);
  if (!entity) {
    throw Error(`Entity not found: ${entityId}`);
  }
  const device = devices.find((d) => d.id === entity.device_id);
  if (!device) {
    throw Error(`Device not found: ${entity.device_id} for entity ${entityId}`);
  }
  return { state, entity, device };
}

export class DataManager {
  private wsClient: HomeAssistantWebSocketClient;
  data: HomeAssistantData;
  incomingData: {
    areas: HassArea[] | null;
    devices: HassDevice[] | null;
    entities: HassEntity[] | null;
    entityStates: Record<string, HassEntityState> | null;
  } = {
    areas: null,
    devices: null,
    entities: null,
    entityStates: null,
  };

  constructor(wsClient: HomeAssistantWebSocketClient) {
    this.wsClient = wsClient;
    this.data = {
      areas: [],
    };
  }

  start() {
    this.wsClient.connect();
    this.wsClient.eventEmitter.on("areas", (areas) => {
      this.incomingData.areas = areas;
      this.syncData();
    });
    this.wsClient.eventEmitter.on("devices", (devices) => {
      this.incomingData.devices = devices;
      this.syncData();
    });
    this.wsClient.eventEmitter.on("entities", (entities) => {
      this.incomingData.entities = entities;
      this.syncData();
    });
    this.wsClient.eventEmitter.on("entity_states", (entitiesMap) => {
      this.incomingData.entityStates = entitiesMap;
      this.syncData();
    });
    this.wsClient.eventEmitter.on("entity_state_change", (changes) => {
      if (this.incomingData.entityStates) {
        for (const entityId of Object.keys(changes)) {
          const change = changes[entityId];
          const currentState = this.incomingData.entityStates[entityId];
          this.incomingData.entityStates[entityId] = {
            ...currentState,
            ...change["+"],
          };
        }
      } else {
        for (const entityId of Object.keys(changes)) {
          if (entityId.startsWith(`${EntityTypes.light}.`)) {
            const change = changes[entityId];
            this.updateLightState(entityId, change["+"]);
          }
        }
      }
    });
  }

  async cleanup() {
    this.wsClient.close();
  }

  private syncData() {
    if (
      this.incomingData.areas &&
      this.incomingData.devices &&
      this.incomingData.entities &&
      this.incomingData.entityStates
    ) {
      this.updateAreas(this.incomingData.areas);
      this.updateLights(
        this.incomingData.devices,
        this.incomingData.entities,
        this.incomingData.entityStates,
      );
      this.incomingData.areas = null;
      this.incomingData.devices = null;
      this.incomingData.entities = null;
      this.incomingData.entityStates = null;
    }
  }

  private updateAreas(areas: HassArea[]) {
    const staleAreas = this.data.areas;
    this.data.areas = areas.map((area) => {
      const staleArea = staleAreas.find((a) => a.id === area.area_id);
      return {
        lights: [],
        ...staleArea,
        id: area.area_id,
        name: area.name,
        floorId: area.floor_id,
      };
    });
  }

  private updateLights(
    devices: HassDevice[],
    entities: HassEntity[],
    entityStates: Record<string, HassEntityState>,
  ) {
    for (const entityId of Object.keys(entityStates)) {
      if (!entityId.startsWith(`${EntityTypes.light}.`)) {
        continue;
      }
      const { state, device } = getStateEntityDeviceForEntityId(
        entityId,
        devices,
        entities,
        entityStates,
      );
      const area = this.data.areas.find((a) => a.id === device.area_id);
      if (!area) {
        throw Error(`Area not found: ${device.area_id} for light ${entityId}`);
      }
      const light: Light = {
        areaId: area.id,
        areaName: area.name,
        deviceId: device.id,
        deviceName: device.name,
        entityId: entityId,
        state: getLightState(state.s),
        brightnessPercentage: getBrightnessPercentage(state.a.brightness),
        rgbColor: getRBGColor(state.a.rgb_color),
      };
      const existingLightIndex = area.lights.findIndex(
        (l) => l.entityId === entityId,
      );
      if (existingLightIndex !== -1) {
        area.lights[existingLightIndex] = light;
      } else {
        area.lights.push(light);
      }
    }
  }

  /**
   * @returns {string | null} areaId of the area where the light is located or null if not found
   */
  private updateLightState(
    entityId: string,
    entityState: HassEntityState,
  ): string | null {
    for (const area of this.data.areas) {
      const light = area.lights.find((l) => l.entityId === entityId);
      if (light) {
        light.state = getLightState(entityState.s);
        if (entityState.a) {
          light.brightnessPercentage = getBrightnessPercentage(
            entityState.a.brightness,
          );
          light.rgbColor = getRBGColor(entityState.a.rgb_color);
        }
        return area.id;
      }
    }
    return null;
  }

  getLights(areaId: string) {
    const area = this.data.areas.find((area) => area.id === areaId);
    if (!area) {
      throw new Error(`Area not found: ${areaId}`);
    }
    return area.lights;
  }

  getAverageBrightness(areaId: string) {
    const lights = this.getLights(areaId);
    if (lights.length === 0) {
      return 0;
    }
    const totalBrightness = lights.reduce(
      (acc, light) => acc + (light.brightnessPercentage || 0),
      0,
    );
    return totalBrightness / lights.length;
  }

  turnOffLight(entityId: string) {
    this.wsClient.sendTurnOffLight(entityId);
  }

  turnOnLight(entityId: string) {
    this.wsClient.sendTurnOnLight(entityId);
  }

  dimLight(entityId: string, brightnessPercentage: number) {
    const brightness = getBrightnessValue(brightnessPercentage);
    if (brightness === null || brightness === 0) {
      this.turnOffLight(entityId);
    } else {
      this.wsClient.sendTurnOnLight(entityId, { brightness });
    }
  }

  async turnOffAllLights(areaId: string) {
    // console.log("Turning off all lights in area", areaId);
    const lights = this.getLights(areaId);
    for (const light of lights) {
      if (light.state === "on") {
        this.turnOffLight(light.entityId);
      }
    }
  }

  async turnOnAllLights(areaId: string) {
    const lights = this.getLights(areaId);
    for (const light of lights) {
      if (light.state === "off") {
        this.turnOnLight(light.entityId);
      }
    }
  }

  async dimAllLights(areaId: string, brightnessPercentage: number) {
    const lights = this.getLights(areaId);
    for (const light of lights) {
      this.dimLight(light.entityId, brightnessPercentage);
    }
  }
}
