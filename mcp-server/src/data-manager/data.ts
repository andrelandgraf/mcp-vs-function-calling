export const TEMPERATURE_UNIT_OF_MEASUREMENTS = {
  celsius: "°C",
  fahrenheit: "°F",
} as const;
export type TemperatureUnitOfMeasurement = "°C" | "°F";

export type HumidityUnitOfMeasurement = "%";

export type CarbonDioxideUnitOfMeasurement = "ppm";

export type Area = {
  id: string;
  name: string;
  floorId: string | null;
  lights: Light[];
  humiditySensor: HumiditySensor | null;
  temperatureSensor: TemperatureSensor | null;
  carbonDioxideSensor: CarbonDioxideSensor | null;
};

export type Floor = {
  id: string;
  name: string;
  level: number;
};

export type User = {
  id: string;
  name: string;
};

export type Light = {
  areaId: string;
  areaName: string;
  deviceId: string | null;
  deviceName: string;
  entityId: string;
  state: "on" | "off" | "unavailable";
  brightnessPercentage: number | null;
  rgbColor: [number, number, number] | null;
};

export type HumiditySensor = {
  areaId: string;
  areaName: string;
  deviceId: string | null;
  deviceName: string;
  entityId: string;
  state: number | "unavailable";
  unitOfMeasurement: HumidityUnitOfMeasurement;
};

export type TemperatureSensor = {
  areaId: string;
  areaName: string;
  deviceId: string | null;
  deviceName: string;
  entityId: string;
  state: number | "unavailable";
  unitOfMeasurement: TemperatureUnitOfMeasurement;
};

export type CarbonDioxideSensor = {
  areaId: string;
  areaName: string;
  deviceId: string | null;
  deviceName: string;
  entityId: string;
  state: number | "unavailable";
  unitOfMeasurement: CarbonDioxideUnitOfMeasurement;
};

export const EntityTypes = {
  light: "light",
  carbonDioxide: "carbon_dioxide",
  humidity: "humidity",
  temperature: "temperature",
  battery: "battery",
  media_player: "media_player",
  camera: "camera",
} as const;

export type HomeAssistantData = {
  areas: Area[];
  floors: Floor[];
  users: User[];
};

export function getLightState(state?: string): Light["state"] {
  return state === "on" ? "on" : state === "off" ? "off" : "unavailable";
}

export function getBrightnessPercentage(brightness: unknown): number | null {
  const maxBrightness = 255;
  let brightnessValue: number | null = null;
  if (typeof brightness === "string") {
    brightnessValue = Number.parseInt(brightness, 10);
    if (Number.isNaN(brightnessValue)) {
      return null;
    }
  } else if (typeof brightness === "number") {
    brightnessValue = brightness;
  } else {
    return null;
  }
  return Math.round((brightnessValue / maxBrightness) * 100);
}

export function getBrightnessValue(
  brightnessPercentage: number | null,
): number {
  if (brightnessPercentage === null) {
    return 0;
  }
  const maxBrightness = 255;
  return Math.round((brightnessPercentage / 100) * maxBrightness);
}

export function getRBGColor(
  rgbColor: unknown,
): [number, number, number] | null {
  if (!rgbColor || !Array.isArray(rgbColor)) return null;
  return rgbColor as [number, number, number];
}

export function getNumericSensorState(state: unknown): number | "unavailable" {
  if (typeof state === "number") {
    return state;
  }
  if (typeof state === "string") {
    const value = Number.parseFloat(state);
    if (Number.isNaN(value)) {
      return "unavailable";
    }
    return value;
  }
  return "unavailable";
}

function isTemperatureUnitOfMeasurement(
  unitOfMeasurement: unknown,
): unitOfMeasurement is TemperatureUnitOfMeasurement {
  return (
    unitOfMeasurement === TEMPERATURE_UNIT_OF_MEASUREMENTS.celsius ||
    unitOfMeasurement === TEMPERATURE_UNIT_OF_MEASUREMENTS.fahrenheit
  );
}

export function getTemperatureUnitOfMeasurement(
  unitOfMeasurement: unknown,
): TemperatureUnitOfMeasurement | null {
  if (isTemperatureUnitOfMeasurement(unitOfMeasurement)) {
    return unitOfMeasurement;
  }
  return null;
}

export function calcTemperatureValue(
  value: number | "unavailable",
  unitOfMeasurement: TemperatureUnitOfMeasurement,
  targetUnitOfMeasurement: TemperatureUnitOfMeasurement,
): number | "unavailable" {
  if (
    value === "unavailable" ||
    unitOfMeasurement === targetUnitOfMeasurement
  ) {
    return value;
  }
  const temperatureValue =
    targetUnitOfMeasurement === TEMPERATURE_UNIT_OF_MEASUREMENTS.fahrenheit
      ? value * 1.8 + 32
      : (value - 32) / 1.8;
  return Math.round(temperatureValue);
}

// const humiditySensorSchema = z.object({
//   areaId: z.string(),
//   areaName: z.string(),
//   deviceId: z.string().nullable(),
//   deviceName: z.string(),
//   entityId: z.string(),
//   state: z.union([z.number(), z.literal("unavailable")]),
//   unitOfMeasurement: z.literal("%"),
// });

// export function getHumiditySensor(
//   entityId: string,
//   { areas, devices, entities, states }: HomeAssistantData
// ): HumiditySensor | null {
//   const entity = entities.find((entity) => entity.entityId === entityId);
//   if (!entity) return null;
//   const device = devices.find((device) => device.id === entity.deviceId);
//   if (!device) return null;
//   const area = areas.find((area) => area.id === device.areaId);
//   if (!area) return null;
//   const state = states.find((state) => state.entityId === entityId);
//   if (!state) return null;
//   const data: unknown = {
//     areaId: area.id,
//     areaName: area.name,
//     deviceId: device.id,
//     deviceName: device.name,
//     entityId: entity.entityId,
//     state: typeof state.state === "string" ? Number.parseInt(state.state, 10) : state.state,
//     unitOfMeasurement: entity.unitOfMeasurement,
//   };
//   return humiditySensorSchema.parse(data);
// }

// function celsiusToFahrenheit(celsius: number): number {
//   const value = celsius * 1.8 + 32;
//   return Math.round(value);
// }

// function fahrenheitToCelsius(fahrenheit: number): number {
//   const value = (fahrenheit - 32) / 1.8;
//   return Math.round(value);
// }

// const temperatureSensorSchema = z.object({
//   areaId: z.string(),
//   areaName: z.string(),
//   deviceId: z.string().nullable(),
//   deviceName: z.string(),
//   entityId: z.string(),
//   state: z.union([z.number(), z.literal("unavailable")]),
//   unitOfMeasurement: z.union([z.literal(TEMPERATURE_UNIT_OF_MEASUREMENTS.celsius), z.literal(TEMPERATURE_UNIT_OF_MEASUREMENTS.fahrenheit)]),
// });

// export function getTemperatureSensor(
//   entityId: string, unitOfMeasurement: TemperatureUnitOfMeasurement,
//   { areas, devices, entities, states }: HomeAssistantData
// ): TemperatureSensor | null {
//   const entity = entities.find((entity) => entity.entityId === entityId);
//   if (!entity) return null;
//   const device = devices.find((device) => device.id === entity.deviceId);
//   if (!device) return null;
//   const area = areas.find((area) => area.id === device.areaId);
//   if (!area) return null;
//   const state = states.find((state) => state.entityId === entityId);
//   if (!state) return null;
//   let value = typeof state.state === "string" ? Number.parseInt(state.state, 10) : state.state;
//   if (unitOfMeasurement === TEMPERATURE_UNIT_OF_MEASUREMENTS.fahrenheit && entity.unitOfMeasurement === TEMPERATURE_UNIT_OF_MEASUREMENTS.celsius) {
//     value = celsiusToFahrenheit(value);
//   }
//   if (unitOfMeasurement === TEMPERATURE_UNIT_OF_MEASUREMENTS.celsius && entity.unitOfMeasurement === TEMPERATURE_UNIT_OF_MEASUREMENTS.fahrenheit) {
//     value = fahrenheitToCelsius(value);
//   }
//   console.log(value);
//   const data: unknown = {
//     areaId: area.id,
//     areaName: area.name,
//     deviceId: device.id,
//     deviceName: device.name,
//     entityId: entity.entityId,
//     state: value,
//     unitOfMeasurement,
//   };
//   return temperatureSensorSchema.parse(data);
// }

// const carbonDioxideSensorSchema = z.object({
//   areaId: z.string(),
//   areaName: z.string(),
//   deviceId: z.string().nullable(),
//   deviceName: z.string(),
//   entityId: z.string(),
//   state: z.union([z.number(), z.literal("unavailable")]),
//   unitOfMeasurement: z.literal("ppm"),
// });

// export function getCarbonDioxideSensor(
//   entityId: string,
//   { areas, devices, entities, states }: HomeAssistantData
// ): CarbonDioxideSensor | null {
//   const entity = entities.find((entity) => entity.entityId === entityId);
//   if (!entity) return null;
//   const device = devices.find((device) => device.id === entity.deviceId);
//   if (!device) return null;
//   const area = areas.find((area) => area.id === device.areaId);
//   if (!area) return null;
//   const state = states.find((state) => state.entityId === entityId);
//   if (!state) return null;
//   const data: unknown = {
//     areaId: area.id,
//     areaName: area.name,
//     deviceId: device.id,
//     deviceName: device.name,
//     entityId: entity.entityId,
//     state: typeof state.state === "string" ? Number.parseInt(state.state, 10) : state.state,
//     unitOfMeasurement: entity.unitOfMeasurement,
//   };
//   return carbonDioxideSensorSchema.parse(data);
// }
