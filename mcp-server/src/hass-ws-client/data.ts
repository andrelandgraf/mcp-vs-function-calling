export type HassState = {
  entity_id: string;
  state: "home" | "on" | "off" | number | "unavailable" | string;
  last_changed: string;
  attributes: {
    friendly_name: string;
  };
};
