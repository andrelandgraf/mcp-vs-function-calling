import type { TemperatureUnitOfMeasurement } from "./data";

export type DashboardConfig = {
  areaId: string;
  temperatureUnitOfMeasurement: TemperatureUnitOfMeasurement;
  temperatureSensorEntityId?: string;
  humiditySensorEntityId?: string;
  carbonDioxideSensorEntityId?: string;
};

export const dashboardConfigs: DashboardConfig[] = [
  {
    areaId: "living_room",
    temperatureUnitOfMeasurement: "°C",
    carbonDioxideSensorEntityId: "sensor.aranet4_23eff_carbon_dioxide",
    humiditySensorEntityId: "sensor.aranet4_23eff_humidity",
    temperatureSensorEntityId: "sensor.aranet4_23eff_temperature",
  },
  {
    areaId: "kitchen",
    temperatureUnitOfMeasurement: "°C",
  },
  {
    areaId: "bedroom",
    temperatureUnitOfMeasurement: "°C",
  },
  {
    areaId: "office",
    temperatureUnitOfMeasurement: "°C",
    carbonDioxideSensorEntityId: "sensor.aranet4_23f66_carbon_dioxide",
    humiditySensorEntityId: "sensor.aranet4_23f66_humidity",
    temperatureSensorEntityId: "sensor.aranet4_23f66_temperature",
  },
];
