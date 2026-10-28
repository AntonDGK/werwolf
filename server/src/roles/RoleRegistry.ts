import type { RoleModule } from "./RoleTypes";
import { werewolfConfig } from "./werewolf/config";
import { seerConfig } from "./seer/config";
import { actions as werewolfActions } from "./werewolf/actions";
import { actions as seerActions } from "./seer/actions";
import { captainConfig } from "./captain/config";
import { actions as captainActions } from "./captain/actions";

/** Add exactly one entry here to register a new role. */
export const roleRegistry = {
  werewolf: { config: werewolfConfig, actions: werewolfActions },
  seer: { config: seerConfig, actions: seerActions },
  captain: { config: captainConfig, actions: captainActions },
} satisfies Record<string, RoleModule>;
