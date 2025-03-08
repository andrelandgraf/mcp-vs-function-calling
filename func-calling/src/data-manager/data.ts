export type Area = {
  id: string;
  name: string;
  floorId: string | null;
  lights: Light[];
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

export const EntityTypes = {
  light: "light",
} as const;

export type HomeAssistantData = {
  areas: Area[];
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
