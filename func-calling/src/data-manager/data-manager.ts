import { setTimeout } from "node:timers";
import {
  calcTemperatureValue,
  EntityTypes,
  getBrightnessPercentage,
  getBrightnessValue,
  getLightState,
  getNumericSensorState,
  getRBGColor,
  getTemperatureUnitOfMeasurement,
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
import { dashboardConfigs } from "./config";

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
      floors: [],
      users: [],
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
            const areaId = this.updateLightState(entityId, change["+"]);
            continue;
          }
          for (const dashboard of dashboardConfigs) {
            if (entityId === dashboard.carbonDioxideSensorEntityId) {
              this.updateCarbonDioxideSensor(
                dashboard.areaId,
                changes[entityId]["+"],
              );
              continue;
            }
            if (entityId === dashboard.humiditySensorEntityId) {
              this.updateHumiditySensor(
                dashboard.areaId,
                changes[entityId]["+"],
              );
              continue;
            }
            if (entityId === dashboard.temperatureSensorEntityId) {
              this.updateTemperatureSensor(
                dashboard.areaId,
                changes[entityId]["+"],
              );
              continue;
            }
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
      this.updateSensors(
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
        carbonDioxideSensor: null,
        humiditySensor: null,
        temperatureSensor: null,
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

  private updateSensors(
    devices: HassDevice[],
    entities: HassEntity[],
    entityStates: Record<string, HassEntityState>,
  ) {
    for (const entityId of Object.keys(entityStates)) {
      for (const dashboard of dashboardConfigs) {
        const area = this.data.areas.find((a) => a.id === dashboard.areaId);
        if (!area) {
          throw new Error(`Dashboard area not found: ${dashboard.areaId}`);
        }
        if (entityId === dashboard.humiditySensorEntityId) {
          const { state, device } = getStateEntityDeviceForEntityId(
            entityId,
            devices,
            entities,
            entityStates,
          );
          area.humiditySensor = {
            areaId: area.id,
            areaName: area.name,
            deviceId: device.id,
            deviceName: device.name,
            entityId: entityId,
            state: getNumericSensorState(state.s),
            unitOfMeasurement: "%",
          };
          continue;
        }
        if (entityId === dashboard.temperatureSensorEntityId) {
          const { state, device } = getStateEntityDeviceForEntityId(
            entityId,
            devices,
            entities,
            entityStates,
          );
          const unitOfMeasurement =
            getTemperatureUnitOfMeasurement(state.a?.unit_of_measurement) ||
            dashboard.temperatureUnitOfMeasurement;
          const value = getNumericSensorState(state.s);
          const temperatureValue = calcTemperatureValue(
            value,
            unitOfMeasurement,
            dashboard.temperatureUnitOfMeasurement,
          );
          area.temperatureSensor = {
            areaId: area.id,
            areaName: area.name,
            deviceId: device.id,
            deviceName: device.name,
            entityId: entityId,
            state: temperatureValue,
            unitOfMeasurement: unitOfMeasurement,
          };
          continue;
        }
        if (entityId === dashboard.carbonDioxideSensorEntityId) {
          const { state, device } = getStateEntityDeviceForEntityId(
            entityId,
            devices,
            entities,
            entityStates,
          );
          area.carbonDioxideSensor = {
            areaId: area.id,
            areaName: area.name,
            deviceId: device.id,
            deviceName: device.name,
            entityId: entityId,
            state: getNumericSensorState(state.s),
            unitOfMeasurement: "ppm",
          };
          continue;
        }
      }
    }
  }

  updateCarbonDioxideSensor(areaId: string, state: HassEntityState) {
    const area = this.data.areas.find((a) => a.id === areaId);
    if (!area) {
      throw new Error(`Area not found: ${areaId}`);
    }
    // console.log("Updating carbon dioxide sensor for area", areaId, state);
    if (!area.carbonDioxideSensor) {
      console.error("Carbon Dioxide Sensor not found for area", areaId);
      return;
    }
    area.carbonDioxideSensor = {
      ...area.carbonDioxideSensor,
      state: getNumericSensorState(state.s),
      unitOfMeasurement: "ppm",
    };
  }

  updateHumiditySensor(areaId: string, state: HassEntityState) {
    const area = this.data.areas.find((a) => a.id === areaId);
    if (!area) {
      throw new Error(`Area not found: ${areaId}`);
    }
    // console.log("Updating humidity sensor for area", areaId, state);
    if (!area.humiditySensor) {
      console.error("Humidity Sensor not found for area", areaId);
      return;
    }
    area.humiditySensor = {
      ...area.humiditySensor,
      state: getNumericSensorState(state.s),
      unitOfMeasurement: "%",
    };
  }

  updateTemperatureSensor(areaId: string, state: HassEntityState) {
    const dashboard = dashboardConfigs.find((d) => d.areaId === areaId);
    if (!dashboard) {
      throw new Error(`Dashboard not found for areaId: ${areaId}`);
    }
    const area = this.data.areas.find((a) => a.id === areaId);
    if (!area) {
      throw new Error(`Area not found: ${areaId}`);
    }
    // console.log("Updating temperature sensor for area", areaId, state);
    if (!area.temperatureSensor) {
      console.error("Temperature Sensor not found for area", areaId);
      return;
    }
    const unitOfMeasurement =
      getTemperatureUnitOfMeasurement(state.a?.unit_of_measurement) ||
      dashboard.temperatureUnitOfMeasurement;
    const value = getNumericSensorState(state.s);
    const temperatureValue = calcTemperatureValue(
      value,
      unitOfMeasurement,
      dashboard.temperatureUnitOfMeasurement,
    );
    area.temperatureSensor = {
      ...area.temperatureSensor,
      state: temperatureValue,
      unitOfMeasurement: unitOfMeasurement,
    };
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

  getHumidityInsideReading(areaId: string) {
    const area = this.data.areas.find((area) => area.id === areaId);
    if (!area) {
      throw new Error(`Area not found: ${areaId}`);
    }
    if (!area.humiditySensor) {
      return null;
    }
    const str = area.humiditySensor.state;
    if (str === "unavailable") {
      return str;
    }
    return `${str} ${area.humiditySensor.unitOfMeasurement}`;
  }

  getTemperatureInsideReading(areaId: string) {
    const area = this.data.areas.find((area) => area.id === areaId);
    if (!area) {
      throw new Error(`Area not found: ${areaId}`);
    }
    if (!area.temperatureSensor) {
      return null;
    }
    const str = area.temperatureSensor.state;
    if (str === "unavailable") {
      return str;
    }
    return `${str} ${area.temperatureSensor.unitOfMeasurement}`;
  }

  getCarbonDioxideInsideReading(areaId: string) {
    const area = this.data.areas.find((area) => area.id === areaId);
    if (!area) {
      throw new Error(`Area not found: ${areaId}`);
    }
    if (!area.carbonDioxideSensor) {
      return null;
    }
    const str = area.carbonDioxideSensor.state;
    if (str === "unavailable") {
      return str;
    }
    return `${str} ${area.carbonDioxideSensor.unitOfMeasurement}`;
  }

  getCarbonDioxideDangerLevel(areaId: string) {
    const reading = this.getCarbonDioxideInsideReading(areaId);
    if (!reading || reading === "unavailable") {
      return "unknown";
    }
    const value = parseInt(reading.split(" ")[0]);
    if (value > 1000) {
      return "danger";
    }
    return "safe";
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
