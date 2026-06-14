import { loadPersistedCart } from "./cartStorage.js";
import { normalizeMenuItemFromPersisted, starterMenu } from "./menuModelAndBadges.js";

export const initialState = {
  menu: starterMenu.map((row) => normalizeMenuItemFromPersisted({ ...row })),
  orders: [],
  cart: loadPersistedCart(),
};
