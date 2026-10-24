import type { RoleModule } from "./RoleTypes";
import { werewolfConfig } from "./werewolf/config";
import { seerConfig } from "./seer/config";
import { actions as werewolfActions } from "./werewolf/actions";
import { actions as seerActions } from "./seer/actions";

/** Add exactly one entry here to register a new role. */
export const roleRegistry = {
  werewolf: { config: werewolfConfig, actions: werewolfActions },
  seer: { config: seerConfig, actions: seerActions },
} satisfies Record<string, RoleModule>;
